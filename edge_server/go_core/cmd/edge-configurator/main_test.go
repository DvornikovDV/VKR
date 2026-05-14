package main

import (
	"bytes"
	"context"
	"errors"
	"strings"
	"testing"
)

func TestEdgeConfiguratorRequiresConfig(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	startCalled := false

	code := runEdgeConfigurator(context.Background(), nil, &stdout, &stderr, edgeConfiguratorDependencies{
		start: func(context.Context, edgeConfiguratorOptions) error {
			startCalled = true
			return nil
		},
	})

	if code != 2 {
		t.Fatalf("expected validation exit code 2, got %d", code)
	}
	if !strings.Contains(stderr.String(), "--config is required") {
		t.Fatalf("expected stderr to contain missing config error, got %q", stderr.String())
	}
	if stdout.Len() != 0 {
		t.Fatalf("validation failure must not print readiness output, got %q", stdout.String())
	}
	if startCalled {
		t.Fatal("validation failure must not reach startup wiring")
	}
}

func TestEdgeConfiguratorDelegatesToInjectedStartup(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	var gotOptions edgeConfiguratorOptions
	startCalled := false

	code := runEdgeConfigurator(context.Background(), []string{"--config", " edge-runtime.yaml "}, &stdout, &stderr, edgeConfiguratorDependencies{
		start: func(ctx context.Context, options edgeConfiguratorOptions) error {
			startCalled = true
			gotOptions = options
			if ctx == nil {
				t.Fatal("startup context must be passed through")
			}
			return nil
		},
	})

	if code != 0 {
		t.Fatalf("expected success exit code 0, got %d; stderr=%q", code, stderr.String())
	}
	if !startCalled {
		t.Fatal("expected injected startup to be called")
	}
	if gotOptions.configPath != "edge-runtime.yaml" {
		t.Fatalf("expected trimmed config path, got %q", gotOptions.configPath)
	}
	if !strings.Contains(stdout.String(), "edge-configurator: ready for edge-runtime.yaml") {
		t.Fatalf("expected readiness output, got %q", stdout.String())
	}
	if stderr.Len() != 0 {
		t.Fatalf("success must not write stderr, got %q", stderr.String())
	}
}

func TestEdgeConfiguratorReportsInjectedStartupError(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	wantErr := errors.New("startup failed")

	code := runEdgeConfigurator(context.Background(), []string{"--config", "edge-runtime.yaml"}, &stdout, &stderr, edgeConfiguratorDependencies{
		start: func(context.Context, edgeConfiguratorOptions) error {
			return wantErr
		},
	})

	if code != 1 {
		t.Fatalf("expected startup failure exit code 1, got %d", code)
	}
	if !strings.Contains(stderr.String(), "startup failed") {
		t.Fatalf("expected stderr to contain startup error, got %q", stderr.String())
	}
	if stdout.Len() != 0 {
		t.Fatalf("startup failure must not print readiness output, got %q", stdout.String())
	}
}
