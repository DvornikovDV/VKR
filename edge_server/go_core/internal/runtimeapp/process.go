package runtimeapp

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"time"

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
	ReadingDispatcher    *runtime.ReadingDispatcher
	AlarmDetector        *runtime.AlarmDetector
	credentialStore      *state.CredentialStore
	expectedEdgeID       string
	sourceConfigRevision string
}

func New(ctx context.Context, cfg config.Config, transport cloud.Transport) (*Process, error) {
	return newWithSourceFactories(ctx, cfg, transport, productionSourceFactories())
}

func NewWithSourceFactoriesForTest(ctx context.Context, cfg config.Config, transport cloud.Transport, factories source.FactoryRegistry, bridgeOpts ...runtime.CommandBridgeOption) (*Process, error) {
	return newWithSourceFactories(ctx, cfg, transport, factories, bridgeOpts...)
}

func productionSourceFactories() source.FactoryRegistry {
	return source.FactoryRegistry{
		source.ModbusRTUKind: func() (source.Adapter, error) {
			return source.NewModbusSerialAdapter(), nil
		},
	}
}

func newWithSourceFactories(ctx context.Context, cfg config.Config, transport cloud.Transport, factories source.FactoryRegistry, bridgeOpts ...runtime.CommandBridgeOption) (*Process, error) {
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
	reconnectPolicy, err := runtime.NewReconnectPolicy(runtime.ReconnectPolicyConfig{
		BaseDelay:   time.Duration(cfg.Cloud.Reconnect.BaseDelayMs) * time.Millisecond,
		MaxDelay:    time.Duration(cfg.Cloud.Reconnect.MaxDelayMs) * time.Millisecond,
		MaxAttempts: cfg.Cloud.Reconnect.MaxAttempts,
	})
	if err != nil {
		return nil, fmt.Errorf("create runtime reconnect policy: %w", err)
	}
	if err := runner.BindReconnectPolicy(reconnectPolicy); err != nil {
		return nil, fmt.Errorf("bind runtime reconnect policy: %w", err)
	}
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
	sources := source.NewManager(factories)
	if err := runner.BindRuntimeStateStore(runtimeStatusProjector{
		runtimeStore: runtimeStore,
		statusStore:  statusStore,
		sources:      sources,
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

	if _, err := sources.ApplyDefinitions(definitions); err != nil {
		return nil, fmt.Errorf("apply source definitions: %w", err)
	}
	capabilitiesCatalog, err := runtime.BuildCapabilitiesCatalog(cfg.Runtime.EdgeID, definitions)
	if err != nil {
		return nil, fmt.Errorf("build capabilities catalog: %w", err)
	}
	if err := runner.BindCapabilitiesCatalog(capabilitiesCatalog); err != nil {
		return nil, fmt.Errorf("bind capabilities catalog: %w", err)
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
	}, bridgeOpts...)
	if err != nil {
		return nil, fmt.Errorf("create runtime command bridge: %w", err)
	}
	if err := runner.BindCommandBridge(bridge); err != nil {
		return nil, fmt.Errorf("bind runtime command bridge: %w", err)
	}

	readingDispatcher, err := runtime.NewReadingDispatcher(sources.Readings())
	if err != nil {
		return nil, fmt.Errorf("create runtime reading dispatcher: %w", err)
	}
	telemetryReadings, err := readingDispatcher.AddConsumer("telemetry", cfg.Batch.MaxReadings)
	if err != nil {
		return nil, fmt.Errorf("bind telemetry reading consumer: %w", err)
	}
	if err := runner.BindTelemetryReadings(
		ctx,
		telemetryReadings,
		cfg.Batch.IntervalMs,
		cfg.Batch.MaxReadings,
	); err != nil {
		return nil, fmt.Errorf("bind runtime telemetry path: %w", err)
	}
	var alarmDetector *runtime.AlarmDetector
	if len(cfg.Alarms) > 0 {
		alarmReadings, err := readingDispatcher.AddConsumer("alarm-detector", cfg.Batch.MaxReadings)
		if err != nil {
			return nil, fmt.Errorf("bind alarm reading consumer: %w", err)
		}
		alarmDetector, err = runner.BindAlarmReadings(ctx, alarmReadings, runtime.AlarmDetectorConfig{
			EdgeID: cfg.Runtime.EdgeID,
			Rules:  cfg.Alarms,
		})
		if err != nil {
			return nil, fmt.Errorf("bind runtime alarm detector path: %w", err)
		}
	}
	go readingDispatcher.Run(ctx)

	return &Process{
		Runner:               runner,
		Bootstrap:            bootstrap,
		Sources:              sources,
		ReadingDispatcher:    readingDispatcher,
		AlarmDetector:        alarmDetector,
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
	runtimeStore *state.RuntimeStateStore
	statusStore  *state.StatusStore
	sources      *source.Manager
}

func (p runtimeStatusProjector) Save(runtimeState state.RuntimeState) error {
	if p.runtimeStore == nil {
		return fmt.Errorf("runtime-state store is required")
	}
	if p.statusStore == nil {
		return fmt.Errorf("status store is required")
	}
	if p.sources == nil {
		return fmt.Errorf("source manager is required")
	}

	if err := p.runtimeStore.Save(runtimeState); err != nil {
		return err
	}

	sourceSummary, err := projectSourceSummary(p.sources.HealthSnapshot())
	if err != nil {
		return fmt.Errorf("project source summary: %w", err)
	}
	statusSnapshot, err := operator.ProjectStatusSnapshot(operator.StatusProjectionInput{
		RuntimeState:  runtimeState,
		SourceSummary: sourceSummary,
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

func projectSourceSummary(sourceHealth map[string]source.SourceHealthSnapshot) (string, error) {
	operatorHealth := make([]operator.SourceHealthSnapshot, 0, len(sourceHealth))
	for _, snapshot := range sourceHealth {
		mapped, err := mapSourceHealthSnapshot(snapshot)
		if err != nil {
			return "", err
		}
		operatorHealth = append(operatorHealth, mapped)
	}

	return operator.ProjectSourceSummary(operatorHealth)
}

func mapSourceHealthSnapshot(snapshot source.SourceHealthSnapshot) (operator.SourceHealthSnapshot, error) {
	var state operator.SourceHealthState
	switch snapshot.State {
	case source.SourceHealthRunning:
		state = operator.SourceHealthStateRunning
	case source.SourceHealthDegraded:
		state = operator.SourceHealthStateDegraded
	case source.SourceHealthFailed:
		state = operator.SourceHealthStateFailed
	case source.SourceHealthStopped:
		state = operator.SourceHealthStateStopped
	default:
		return operator.SourceHealthSnapshot{}, fmt.Errorf(
			"source %q health state %q is not supported",
			snapshot.SourceID,
			snapshot.State,
		)
	}

	return operator.SourceHealthSnapshot{State: state}, nil
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
