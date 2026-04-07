package runtimeapp

import (
	"context"
	"fmt"

	"edge_server/go_core/internal/cloud"
	"edge_server/go_core/internal/config"
	"edge_server/go_core/internal/mockadapter"
	"edge_server/go_core/internal/runtime"
	"edge_server/go_core/internal/source"
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
	bootstrap := runtime.NewBootstrapSession(runner)

	sources := source.NewManager(source.FactoryRegistry{
		mockadapter.Kind: func() (source.Adapter, error) {
			return mockadapter.New(), nil
		},
	})

	if _, err := sources.ApplyDefinitions(source.DefinitionsFromConfig(cfg.Sources)); err != nil {
		return nil, fmt.Errorf("apply source definitions: %w", err)
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
