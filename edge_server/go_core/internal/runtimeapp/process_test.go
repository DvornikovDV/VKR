package runtimeapp

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"edge_server/go_core/internal/cloud"
	"edge_server/go_core/internal/config"
	"edge_server/go_core/internal/mockadapter"
	"edge_server/go_core/internal/source"
	"edge_server/go_core/internal/state"
)

type noopTransport struct{}

func (noopTransport) Connect(context.Context, cloud.HandshakeAuth) error { return nil }
func (noopTransport) Disconnect() error                                  { return nil }
func (noopTransport) Emit(string, any) error                             { return nil }
func (noopTransport) OnEdgeDisconnect(func(any))                         {}
func (noopTransport) OnExecuteCommand(func(any))                         {}
func (noopTransport) OnConnect(func() error)                             {}
func (noopTransport) OnConnectError(func(error))                         {}
func (noopTransport) OnDisconnect(func(string))                          {}

var _ cloud.Transport = noopTransport{}

type fakeTransport struct {
	noopTransport
	executeCommand func(any)
	emitted        []struct {
		Event   string
		Payload any
	}
	connected bool
}

var _ cloud.Transport = (*fakeTransport)(nil)

func (t *fakeTransport) Connect(_ context.Context, _ cloud.HandshakeAuth) error {
	t.connected = true
	return nil
}

func (t *fakeTransport) Disconnect() error {
	t.connected = false
	return nil
}

func (t *fakeTransport) Emit(event string, payload any) error {
	if !t.connected {
		return errors.New("transport is not connected")
	}
	t.emitted = append(t.emitted, struct {
		Event   string
		Payload any
	}{event, payload})
	return nil
}

func (t *fakeTransport) OnExecuteCommand(handler func(any)) {
	t.executeCommand = handler
}

func (t *fakeTransport) InjectExecuteCommand(payload any) {
	if t.executeCommand != nil {
		t.executeCommand(payload)
	}
}

func TestNewInitializesRuntimeStateAndStatusFiles(t *testing.T) {
	stateDir := t.TempDir()
	cfg := runtimeConfigFixture(stateDir)
	writeCredentialFixture(t, stateDir, cfg.Runtime.EdgeID)

	_, err := NewWithSourceFactoriesForTest(context.Background(), cfg, noopTransport{}, mockSourceFactories())
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

func TestReloadInstalledCredentialRequiresReplacementAfterSupersession(t *testing.T) {
	stateDir := t.TempDir()
	cfg := runtimeConfigFixture(stateDir)
	writeCredentialVersionFixture(t, stateDir, cfg.Runtime.EdgeID, "persistent-secret-v1", 3, "register")

	process, err := NewWithSourceFactoriesForTest(context.Background(), cfg, noopTransport{}, mockSourceFactories())
	if err != nil {
		t.Fatalf("construct runtime process: %v", err)
	}
	if err := process.Runner.ActivateTrustedSession(cfg.Runtime.EdgeID, "persistent-secret-v1"); err != nil {
		t.Fatalf("activate trusted session: %v", err)
	}
	if err := process.Runner.MarkUntrusted("credential_rotated", true); err != nil {
		t.Fatalf("mark credential rotated: %v", err)
	}

	writeCredentialVersionFixture(t, stateDir, cfg.Runtime.EdgeID, "persistent-secret-v1", 3, "register")
	err = process.ReloadInstalledCredential()
	if err == nil {
		t.Fatal("expected reload of old superseded credential to be rejected")
	}
	if strings.Contains(strings.ToLower(err.Error()), "onboarding") {
		t.Fatalf("old credential rejection must not mention onboarding, got %v", err)
	}

	snapshot := process.Runner.StateSnapshot()
	if snapshot.PersistentCredentialSecret != nil {
		t.Fatalf("expected rejected old credential reload to keep in-memory secret cleared, got %v", snapshot.PersistentCredentialSecret)
	}
	if snapshot.CredentialStatus != state.CredentialStatusSuperseded {
		t.Fatalf("expected rejected old credential reload to preserve superseded status, got %q", snapshot.CredentialStatus)
	}

	writeCredentialVersionFixture(t, stateDir, cfg.Runtime.EdgeID, "persistent-secret-v2", 4, "rotate")
	if err := process.ReloadInstalledCredential(); err != nil {
		t.Fatalf("reload replaced credential: %v", err)
	}

	recovered := process.Runner.StateSnapshot()
	if recovered.CredentialVersion == nil || *recovered.CredentialVersion != 4 {
		t.Fatalf("expected reloaded credential version 4, got %+v", recovered.CredentialVersion)
	}
	if recovered.PersistentCredentialSecret == nil || *recovered.PersistentCredentialSecret != "persistent-secret-v2" {
		t.Fatalf("expected reload to install replacement secret, got %v", recovered.PersistentCredentialSecret)
	}
}

func TestNewRejectsOldCredentialAfterSupersededRuntimeState(t *testing.T) {
	stateDir := t.TempDir()
	cfg := runtimeConfigFixture(stateDir)
	writeCredentialVersionFixture(t, stateDir, cfg.Runtime.EdgeID, "persistent-secret-v1", 3, "register")
	writeSupersededRuntimeStateFixture(t, stateDir, cfg.Runtime.EdgeID, 3)

	_, err := NewWithSourceFactoriesForTest(context.Background(), cfg, noopTransport{}, mockSourceFactories())
	if err == nil {
		t.Fatal("expected startup to reject old credential after superseded runtime-state")
	}
	if !strings.Contains(err.Error(), "does not replace superseded credential") {
		t.Fatalf("expected superseded credential replacement error, got %v", err)
	}

	persisted, exists, loadErr := state.NewRuntimeStateStore(stateDir).Load()
	if loadErr != nil {
		t.Fatalf("load runtime-state after rejected startup: %v", loadErr)
	}
	if !exists {
		t.Fatal("expected superseded runtime-state to remain after rejected startup")
	}
	if persisted.CredentialStatus != state.CredentialStatusSuperseded {
		t.Fatalf("expected rejected startup to preserve credentialStatus=superseded, got %q", persisted.CredentialStatus)
	}
}

func TestNewAcceptsReplacedCredentialAfterSupersededRuntimeState(t *testing.T) {
	stateDir := t.TempDir()
	cfg := runtimeConfigFixture(stateDir)
	writeSupersededRuntimeStateFixture(t, stateDir, cfg.Runtime.EdgeID, 3)
	writeCredentialVersionFixture(t, stateDir, cfg.Runtime.EdgeID, "persistent-secret-v2", 4, "rotate")

	process, err := NewWithSourceFactoriesForTest(context.Background(), cfg, noopTransport{}, mockSourceFactories())
	if err != nil {
		t.Fatalf("expected startup with replaced credential to succeed: %v", err)
	}

	snapshot := process.Runner.StateSnapshot()
	if snapshot.CredentialVersion == nil || *snapshot.CredentialVersion != 4 {
		t.Fatalf("expected replaced credential version 4 to load, got %+v", snapshot.CredentialVersion)
	}
	if snapshot.CredentialStatus != state.CredentialStatusLoaded {
		t.Fatalf("expected credentialStatus=loaded after replaced startup, got %q", snapshot.CredentialStatus)
	}
	if snapshot.PersistentCredentialSecret == nil || *snapshot.PersistentCredentialSecret != "persistent-secret-v2" {
		t.Fatalf("expected replaced credential secret to load, got %v", snapshot.PersistentCredentialSecret)
	}
}

func TestNewRejectsOldCredentialAfterBlockedRuntimeState(t *testing.T) {
	stateDir := t.TempDir()
	cfg := runtimeConfigFixture(stateDir)
	writeCredentialVersionFixture(t, stateDir, cfg.Runtime.EdgeID, "persistent-secret-v1", 3, "register")
	writeBlockedRuntimeStateFixture(t, stateDir, cfg.Runtime.EdgeID, 3)

	_, err := NewWithSourceFactoriesForTest(context.Background(), cfg, noopTransport{}, mockSourceFactories())
	if err == nil {
		t.Fatal("expected startup to reject old credential after blocked runtime-state")
	}
	if !strings.Contains(err.Error(), "does not replace blocked credential") {
		t.Fatalf("expected blocked credential replacement error, got %v", err)
	}
}

func TestNewAcceptsFreshCredentialAfterBlockedRuntimeState(t *testing.T) {
	stateDir := t.TempDir()
	cfg := runtimeConfigFixture(stateDir)
	writeBlockedRuntimeStateFixture(t, stateDir, cfg.Runtime.EdgeID, 3)
	writeCredentialVersionFixture(t, stateDir, cfg.Runtime.EdgeID, "persistent-secret-v2", 4, "unblock")

	process, err := NewWithSourceFactoriesForTest(context.Background(), cfg, noopTransport{}, mockSourceFactories())
	if err != nil {
		t.Fatalf("expected startup with fresh unblock credential to succeed: %v", err)
	}

	snapshot := process.Runner.StateSnapshot()
	if snapshot.CredentialVersion == nil || *snapshot.CredentialVersion != 4 {
		t.Fatalf("expected fresh unblock credential version 4 to load, got %+v", snapshot.CredentialVersion)
	}
	if snapshot.CredentialStatus != state.CredentialStatusLoaded {
		t.Fatalf("expected credentialStatus=loaded after fresh unblock startup, got %q", snapshot.CredentialStatus)
	}
	if snapshot.PersistentCredentialSecret == nil || *snapshot.PersistentCredentialSecret != "persistent-secret-v2" {
		t.Fatalf("expected fresh unblock credential secret to load, got %v", snapshot.PersistentCredentialSecret)
	}
}

func TestRuntimeTrustLossUpdatesOperatorStatus(t *testing.T) {
	stateDir := t.TempDir()
	cfg := runtimeConfigFixture(stateDir)
	writeCredentialVersionFixture(t, stateDir, cfg.Runtime.EdgeID, "persistent-secret-v1", 3, "register")

	process, err := NewWithSourceFactoriesForTest(context.Background(), cfg, noopTransport{}, mockSourceFactories())
	if err != nil {
		t.Fatalf("construct runtime process: %v", err)
	}
	if err := process.Runner.ActivateTrustedSession(cfg.Runtime.EdgeID, "persistent-secret-v1"); err != nil {
		t.Fatalf("activate trusted session: %v", err)
	}
	if err := process.Runner.MarkUntrusted("credential_rotated", true); err != nil {
		t.Fatalf("mark credential rotated: %v", err)
	}

	status, exists, err := state.NewStatusStore(stateDir).Load()
	if err != nil {
		t.Fatalf("load operator status after credential rotation: %v", err)
	}
	if !exists {
		t.Fatal("expected status.json to exist after credential rotation")
	}
	if status.RuntimeStatus != "waiting_for_credential" {
		t.Fatalf("expected runtimeStatus=waiting_for_credential, got %q", status.RuntimeStatus)
	}
	if status.CloudConnection != "rejected" {
		t.Fatalf("expected cloudConnection=rejected, got %q", status.CloudConnection)
	}
	if status.AuthSummary != "credential_replaced" {
		t.Fatalf("expected authSummary=credential_replaced, got %q", status.AuthSummary)
	}
	if status.RetryEligible {
		t.Fatal("expected operator status retryEligible=false after credential rotation")
	}
	if status.LoadedCredentialVersion == nil || *status.LoadedCredentialVersion != 3 {
		t.Fatalf("expected loadedCredentialVersion=3 after credential rotation, got %+v", status.LoadedCredentialVersion)
	}
}

func mockSourceFactories() source.FactoryRegistry {
	return source.FactoryRegistry{
		mockadapter.Kind: func() (source.Adapter, error) {
			return mockadapter.New(), nil
		},
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

	writeCredentialVersionFixture(t, stateDir, edgeID, "persistent-secret-fixture-valid", 3, "register")
}

func writeCredentialVersionFixture(t *testing.T, stateDir string, edgeID string, secret string, version int, sourceName string) {
	t.Helper()

	issuedAt := time.Date(2026, 4, 19, 8, 20, 0, 0, time.UTC)
	credential := state.Credential{
		EdgeID:           edgeID,
		CredentialSecret: secret,
		Version:          version,
		IssuedAt:         issuedAt,
		Source:           sourceName,
		InstalledAt:      issuedAt.Add(5 * time.Minute),
	}
	if err := state.NewCredentialStore(stateDir).Save(credential); err != nil {
		t.Fatalf("write credential fixture: %v", err)
	}
}

func writeSupersededRuntimeStateFixture(t *testing.T, stateDir string, edgeID string, version int) {
	t.Helper()

	now := time.Date(2026, 4, 19, 9, 0, 0, 0, time.UTC)
	if err := state.NewRuntimeStateStore(stateDir).Save(state.RuntimeState{
		EdgeID:               edgeID,
		CredentialVersion:    &version,
		CredentialStatus:     state.CredentialStatusSuperseded,
		SessionState:         state.SessionStateOperatorActionRequired,
		AuthOutcome:          state.AuthOutcomeCredentialRotated,
		RetryEligible:        false,
		SourceConfigRevision: "rev-existing",
		UpdatedAt:            now,
	}); err != nil {
		t.Fatalf("write superseded runtime-state fixture: %v", err)
	}
}

func writeBlockedRuntimeStateFixture(t *testing.T, stateDir string, edgeID string, version int) {
	t.Helper()

	now := time.Date(2026, 4, 19, 9, 0, 0, 0, time.UTC)
	if err := state.NewRuntimeStateStore(stateDir).Save(state.RuntimeState{
		EdgeID:               edgeID,
		CredentialVersion:    &version,
		CredentialStatus:     state.CredentialStatusBlocked,
		SessionState:         state.SessionStateOperatorActionRequired,
		AuthOutcome:          state.AuthOutcomeBlocked,
		RetryEligible:        false,
		SourceConfigRevision: "rev-existing",
		UpdatedAt:            now,
	}); err != nil {
		t.Fatalf("write blocked runtime-state fixture: %v", err)
	}
}
