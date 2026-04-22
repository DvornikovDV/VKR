package runtimeapp

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"

	"edge_server/go_core/internal/cloud"
	"edge_server/go_core/internal/config"
	"edge_server/go_core/internal/mockadapter"
	"edge_server/go_core/internal/runtime"
	"edge_server/go_core/internal/source"
	"edge_server/go_core/internal/state"
)

type Process struct {
	Runner    *runtime.Runner
	Bootstrap *runtime.BootstrapSession
	Sources   *source.Manager
}

func New(ctx context.Context, cfg config.Config, transport cloud.Transport) (*Process, error) {
	if ctx == nil {
		return nil, fmt.Errorf("runtime app context is required")
	}
	if transport == nil {
		return nil, fmt.Errorf("runtime app transport is required")
	}

	runner := runtime.NewWithTransport(transport)
	if err := runner.BindRuntimeStateStore(state.NewRuntimeStateStore(cfg.Runtime.StateDir)); err != nil {
		return nil, fmt.Errorf("bind runtime-state store: %w", err)
	}
	bootstrap := runtime.NewBootstrapSession(runner)

	definitions := source.DefinitionsFromConfig(cfg.Sources)
	sources := source.NewManager(source.FactoryRegistry{
		mockadapter.Kind: func() (source.Adapter, error) {
			return mockadapter.New(), nil
		},
	})

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

	if err := runner.BindTelemetryReadings(
		ctx,
		sources.Readings(),
		cfg.Batch.IntervalMs,
		cfg.Batch.MaxReadings,
	); err != nil {
		return nil, fmt.Errorf("bind runtime telemetry path: %w", err)
	}

	return &Process{
		Runner:    runner,
		Bootstrap: bootstrap,
		Sources:   sources,
	}, nil
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
