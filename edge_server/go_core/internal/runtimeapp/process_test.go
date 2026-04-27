package runtimeapp

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"edge_server/go_core/internal/cloud"
	"edge_server/go_core/internal/config"
	"edge_server/go_core/internal/state"
)

type noopTransport struct{}

func (noopTransport) Connect(context.Context, cloud.HandshakeAuth) error { return nil }
func (noopTransport) Disconnect() error                                  { return nil }
func (noopTransport) Emit(string, any) error                             { return nil }
func (noopTransport) OnEdgeDisconnect(func(any))                         {}
func (noopTransport) OnConnect(func() error)                             {}
func (noopTransport) OnConnectError(func(error))                         {}
func (noopTransport) OnDisconnect(func(string))                          {}

func TestNewInitializesRuntimeStateAndStatusFiles(t *testing.T) {
	stateDir := t.TempDir()
	cfg := runtimeConfigFixture(stateDir)
	writeCredentialFixture(t, stateDir, cfg.Runtime.EdgeID)

	_, err := New(context.Background(), cfg, noopTransport{})
	if err != nil {
		t.Fatalf("construct runtime process: %v", err)
	}

	for _, fileName := range []string{"runtime-state.json", "status.json"} {
		path := filepath.Join(stateDir, fileName)
		if _, err := os.Stat(path); err != nil {
			t.Fatalf("expected %s to be initialized during startup, got %v", fileName, err)
		}
	}
}

func TestNewRejectsCredentialPathBoundaryViolation(t *testing.T) {
	stateDir := t.TempDir()
	credentialPath := filepath.Join(stateDir, "credential.json")
	if err := os.Mkdir(credentialPath, 0o700); err != nil {
		t.Fatalf("create invalid credential path boundary: %v", err)
	}

	cfg := runtimeConfigFixture(stateDir)
	_, err := New(context.Background(), cfg, noopTransport{})
	if err == nil {
		t.Fatal("expected startup to reject invalid credential path boundary")
	}
	if !strings.Contains(err.Error(), "credential.json") {
		t.Fatalf("expected credential boundary error, got %v", err)
	}
}

func runtimeConfigFixture(stateDir string) config.Config {
	return config.Config{
		Runtime: config.RuntimeConfig{
			EdgeID:   "507f1f77bcf86cd799439011",
			StateDir: stateDir,
		},
		Cloud: config.CloudConfig{
			URL:              "http://127.0.0.1:4000",
			Namespace:        "/edge",
			ConnectTimeoutMs: 1000,
			Reconnect: config.ReconnectConfig{
				BaseDelayMs: 1000,
				MaxDelayMs:  30000,
				MaxAttempts: 0,
			},
		},
		Batch: config.BatchConfig{
			IntervalMs:  1000,
			MaxReadings: 100,
		},
		Logging: config.LoggingConfig{
			Level: "info",
		},
		Sources: []config.PollingSourceDefinition{
			{
				SourceID:       "mock-source-1",
				AdapterKind:    "mock",
				Enabled:        true,
				PollIntervalMs: 1000,
				Connection: map[string]any{
					"port": "COM1",
				},
				Devices: []config.LocalDeviceDefinition{
					{
						DeviceID: "pump-01",
						Address: map[string]any{
							"unitId": 1,
						},
						Metrics: []config.MetricDefinition{
							{
								Metric:    "pressure",
								ValueType: "number",
								Mapping: map[string]any{
									"register": 40001,
								},
							},
						},
					},
				},
			},
		},
	}
}

func writeCredentialFixture(t *testing.T, stateDir string, edgeID string) {
	t.Helper()

	issuedAt := time.Date(2026, 4, 19, 8, 20, 0, 0, time.UTC)
	credential := state.Credential{
		EdgeID:           edgeID,
		CredentialSecret: "persistent-secret-fixture-valid",
		Version:          3,
		IssuedAt:         issuedAt,
		Source:           "register",
		InstalledAt:      issuedAt.Add(5 * time.Minute),
	}
	if err := state.NewCredentialStore(stateDir).Save(credential); err != nil {
		t.Fatalf("write credential fixture: %v", err)
	}
}
