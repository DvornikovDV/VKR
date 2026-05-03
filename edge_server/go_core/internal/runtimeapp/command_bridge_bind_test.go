package runtimeapp_test

import (
	"context"
	"testing"
	"time"

	"edge_server/go_core/internal/cloud"
	"edge_server/go_core/internal/config"
	"edge_server/go_core/internal/runtimeapp"
	"edge_server/go_core/internal/source"
	"edge_server/go_core/internal/state"
)

type dummyTransport struct{}
func (dummyTransport) Connect(context.Context, cloud.HandshakeAuth) error { return nil }
func (dummyTransport) Disconnect() error { return nil }
func (dummyTransport) Emit(string, any) error { return nil }
func (dummyTransport) OnEdgeDisconnect(func(any)) {}
func (dummyTransport) OnConnect(func() error) {}
func (dummyTransport) OnConnectError(func(error)) {}
func (dummyTransport) OnDisconnect(func(string)) {}
func (dummyTransport) OnExecuteCommand(func(any)) {}

func TestProcessBindsCommandBridge(t *testing.T) {
	stateDir := t.TempDir()
	cfg := config.Config{
		Runtime: config.RuntimeConfig{
			EdgeID:   "test-edge-id",
			StateDir: stateDir,
		},
		Batch: config.BatchConfig{IntervalMs: 100, MaxReadings: 10},
	}

	issuedAt := time.Date(2026, 4, 19, 8, 20, 0, 0, time.UTC)
	if err := state.NewCredentialStore(stateDir).Save(state.Credential{
		EdgeID:           "test-edge-id",
		CredentialSecret: "secret",
		Version:          1,
		IssuedAt:         issuedAt,
		Source:           "register",
		InstalledAt:      issuedAt.Add(time.Minute),
	}); err != nil {
		t.Fatalf("write credential.json: %v", err)
	}

	factories := source.FactoryRegistry{
		"mock": func() (source.Adapter, error) { return nil, nil },
	}

	process, err := runtimeapp.NewWithSourceFactoriesForTest(context.Background(), cfg, dummyTransport{}, factories)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if process.Runner.CurrentCommandBridge() == nil {
		t.Fatal("expected runner to have bound CommandBridge")
	}
	if process.Runner.CurrentCommandBridge().EdgeID() != "test-edge-id" {
		t.Fatalf("expected bridge EdgeID %q, got %q", "test-edge-id", process.Runner.CurrentCommandBridge().EdgeID())
	}
}
