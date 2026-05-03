package runtimeapp

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"

	"edge_server/go_core/internal/cloud"
	"edge_server/go_core/internal/config"
	"edge_server/go_core/internal/operator"
	"edge_server/go_core/internal/runtime"
	"edge_server/go_core/internal/source"
	"edge_server/go_core/internal/state"
)

type Process struct {
	Runner               *runtime.Runner
	Bootstrap            *runtime.BootstrapSession
	Sources              *source.Manager
	credentialStore      *state.CredentialStore
	expectedEdgeID       string
	sourceConfigRevision string
}

func New(ctx context.Context, cfg config.Config, transport cloud.Transport) (*Process, error) {
	return newWithSourceFactories(ctx, cfg, transport, productionSourceFactories())
}

func NewWithSourceFactoriesForTest(ctx context.Context, cfg config.Config, transport cloud.Transport, factories source.FactoryRegistry) (*Process, error) {
	return newWithSourceFactories(ctx, cfg, transport, factories)
}

func productionSourceFactories() source.FactoryRegistry {
	return source.FactoryRegistry{
		source.ModbusRTUKind: func() (source.Adapter, error) {
			return source.NewModbusSerialAdapter(), nil
		},
	}
}

func newWithSourceFactories(ctx context.Context, cfg config.Config, transport cloud.Transport, factories source.FactoryRegistry) (*Process, error) {
	if ctx == nil {
		return nil, fmt.Errorf("runtime app context is required")
	}
	if transport == nil {
		return nil, fmt.Errorf("runtime app transport is required")
	}
	if len(factories) == 0 {
		return nil, fmt.Errorf("runtime app source factory registry is required")
	}
	if err := state.EnsureRuntimePersistenceBoundaries(cfg.Runtime.StateDir); err != nil {
		return nil, fmt.Errorf("initialize runtime persistence boundaries: %w", err)
	}
	credentialStore := state.NewCredentialStore(cfg.Runtime.StateDir)
	credential, exists, err := credentialStore.Load()
	if err != nil {
		return nil, fmt.Errorf("load startup credential boundary: %w", err)
	}
	if !exists {
		return nil, fmt.Errorf("credential.json is required in runtime.stateDir")
	}
	if credential.EdgeID != cfg.Runtime.EdgeID {
		return nil, fmt.Errorf("credential.json edgeId %q does not match runtime.edgeId %q", credential.EdgeID, cfg.Runtime.EdgeID)
	}

	runner := runtime.NewWithTransport(transport)
	bootstrap := runtime.NewBootstrapSession(runner)
	runtimeStore := state.NewRuntimeStateStore(cfg.Runtime.StateDir)
	existingRuntimeState, existingRuntimeStateFound, err := runtimeStore.Load()
	if err != nil {
		return nil, fmt.Errorf("load existing runtime-state boundary: %w", err)
	}
	if existingRuntimeStateFound {
		if err := state.ValidateFreshCredentialInstallation(
			credential,
			existingRuntimeState.CredentialStatus,
			existingRuntimeState.CredentialVersion,
		); err != nil {
			return nil, err
		}
	}
	statusStore := state.NewStatusStore(cfg.Runtime.StateDir)
	if _, _, err := statusStore.Load(); err != nil {
		return nil, fmt.Errorf("load existing status snapshot: %w", err)
	}
	if err := runner.BindRuntimeStateStore(runtimeStatusProjector{
		runtimeStore:  runtimeStore,
		statusStore:   statusStore,
		sourceSummary: "healthy",
	}); err != nil {
		return nil, fmt.Errorf("bind runtime-state store: %w", err)
	}
	if err := bootstrap.LoadPersistentCredential(runtime.PersistentCredentialInput{
		EdgeID:           credential.EdgeID,
		Version:          credential.Version,
		CredentialSecret: credential.CredentialSecret,
	}); err != nil {
		return nil, fmt.Errorf("load persistent credential into runtime: %w", err)
	}

	definitions := source.DefinitionsFromConfig(cfg.Sources)
	sources := source.NewManager(factories)

	if _, err := sources.ApplyDefinitions(definitions); err != nil {
		return nil, fmt.Errorf("apply source definitions: %w", err)
	}
	sourceConfigRevision, err := activeSourceRevision(definitions)
	if err != nil {
		return nil, fmt.Errorf("calculate source config revision: %w", err)
	}
	if err := runner.ConfigureRuntimeState(cfg.Runtime.EdgeID, sourceConfigRevision); err != nil {
		return nil, fmt.Errorf("initialize runtime-state snapshot: %w", err)
	}

	bridge, err := runtime.NewCommandBridge(runtime.CommandBridgeConfig{
		EdgeID:   cfg.Runtime.EdgeID,
		Executor: &sourceManagerExecutor{sources: sources},
	})
	if err != nil {
		return nil, fmt.Errorf("create runtime command bridge: %w", err)
	}
	if err := runner.BindCommandBridge(bridge); err != nil {
		return nil, fmt.Errorf("bind runtime command bridge: %w", err)
	}

	if err := runner.BindTelemetryReadings(
		ctx,
		sources.Readings(),
		cfg.Batch.IntervalMs,
		cfg.Batch.MaxReadings,
	); err != nil {
		return nil, fmt.Errorf("bind runtime telemetry path: %w", err)
	}

	return &Process{
		Runner:               runner,
		Bootstrap:            bootstrap,
		Sources:              sources,
		credentialStore:      credentialStore,
		expectedEdgeID:       cfg.Runtime.EdgeID,
		sourceConfigRevision: sourceConfigRevision,
	}, nil
}

func (p *Process) ReloadInstalledCredential() error {
	if p == nil || p.Runner == nil {
		return fmt.Errorf("runtime process is required")
	}
	if p.credentialStore == nil {
		return fmt.Errorf("runtime credential store is required")
	}
	if p.Bootstrap == nil {
		return fmt.Errorf("runtime bootstrap session is required")
	}

	credential, exists, err := p.credentialStore.Load()
	if err != nil {
		return fmt.Errorf("load installed credential: %w", err)
	}
	if !exists {
		return fmt.Errorf("credential.json is required in runtime.stateDir")
	}
	if credential.EdgeID != p.expectedEdgeID {
		return fmt.Errorf("credential.json edgeId %q does not match runtime.edgeId %q", credential.EdgeID, p.expectedEdgeID)
	}

	snapshot := p.Runner.StateSnapshot()
	if err := state.ValidateFreshCredentialInstallation(
		credential,
		snapshot.CredentialStatus,
		snapshot.CredentialVersion,
	); err != nil {
		return err
	}

	if err := p.Bootstrap.LoadPersistentCredential(runtime.PersistentCredentialInput{
		EdgeID:           credential.EdgeID,
		Version:          credential.Version,
		CredentialSecret: credential.CredentialSecret,
	}); err != nil {
		return fmt.Errorf("load installed credential into runtime: %w", err)
	}
	if err := p.Runner.ConfigureRuntimeState(p.expectedEdgeID, p.sourceConfigRevision); err != nil {
		return fmt.Errorf("persist runtime state after credential reload: %w", err)
	}

	return nil
}

type runtimeStatusProjector struct {
	runtimeStore  *state.RuntimeStateStore
	statusStore   *state.StatusStore
	sourceSummary string
}

func (p runtimeStatusProjector) Save(runtimeState state.RuntimeState) error {
	if p.runtimeStore == nil {
		return fmt.Errorf("runtime-state store is required")
	}
	if p.statusStore == nil {
		return fmt.Errorf("status store is required")
	}

	if err := p.runtimeStore.Save(runtimeState); err != nil {
		return err
	}

	statusSnapshot, err := operator.ProjectStatusSnapshot(operator.StatusProjectionInput{
		RuntimeState:  runtimeState,
		SourceSummary: p.sourceSummary,
		LastReason:    runtimeState.LastDisconnectReason,
	})
	if err != nil {
		return fmt.Errorf("project status snapshot: %w", err)
	}

	if err := p.statusStore.Save(statusSnapshot); err != nil {
		return fmt.Errorf("persist status snapshot: %w", err)
	}

	return nil
}

func activeSourceRevision(definitions []source.Definition) (string, error) {
	activeDefinitions := make([]source.Definition, 0, len(definitions))
	for _, definition := range definitions {
		if !definition.Enabled {
			continue
		}
		activeDefinitions = append(activeDefinitions, definition)
	}

	payload, err := json.Marshal(activeDefinitions)
	if err != nil {
		return "", err
	}

	sum := sha256.Sum256(payload)
	return hex.EncodeToString(sum[:]), nil
}
