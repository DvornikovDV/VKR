package integration

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"edge_server/go_core/internal/config"
	"edge_server/go_core/internal/runtimeapp"
	"edge_server/go_core/internal/source"
	"edge_server/go_core/internal/state"
)

func TestRuntimeSmokeFixtureContracts(t *testing.T) {
	quickstartBytes, err := os.ReadFile(runtimeAuthorityPath(t, "specs", "007-edge-server", "quickstart.md"))
	if err != nil {
		t.Fatalf("read 007 quickstart: %v", err)
	}
	dataModelBytes, err := os.ReadFile(runtimeAuthorityPath(t, "specs", "007-edge-server", "data-model.md"))
	if err != nil {
		t.Fatalf("read 007 data model: %v", err)
	}
	websocketContractBytes, err := os.ReadFile(runtimeAuthorityPath(t, "specs", "001-cloud-server", "contracts", "websocket.md"))
	if err != nil {
		t.Fatalf("read websocket contract: %v", err)
	}

	for _, snippet := range []string{
		"does not use onboarding-package semantics",
		"`credential.json`",
		"`runtime.edgeId`",
		"stateDir:",
		"`/edge`",
		"current persistent credential",
	} {
		if !strings.Contains(string(quickstartBytes), snippet) {
			t.Fatalf("007 quickstart must document %s for the smoke baseline", snippet)
		}
	}
	for _, snippet := range []string{
		"`runtime.edgeId`",
		"`runtime.stateDir`",
		"`credentialSecret`",
		"`source`",
		"`installedAt`",
	} {
		if !strings.Contains(string(dataModelBytes), snippet) {
			t.Fatalf("007 data model must document %s for the smoke baseline", snippet)
		}
	}
	for _, snippet := range []string{
		"`edge_not_found`",
		"`blocked`",
		"`invalid_credential`",
		"`edge_auth_internal_error`",
		"`credential_rotated`",
	} {
		if !strings.Contains(string(websocketContractBytes), snippet) {
			t.Fatalf("websocket contract must document %s for the smoke baseline", snippet)
		}
	}

	stateDir := t.TempDir()
	t.Setenv("RUNTIME_STATE_DIR", stateDir)
	t.Setenv("CLOUD_SOCKET_URL", "http://127.0.0.1:4000")

	cfg, err := config.LoadFromFile(runtimeFixturePath(t, "config.yaml"))
	if err != nil {
		t.Fatalf("load config fixture through production loader: %v", err)
	}
	if _, err := runtimeapp.New(context.Background(), cfg, noopTransport{}); err != nil {
		t.Fatalf("consume config fixture through runtime app wiring: %v", err)
	}
	if cfg.Runtime.EdgeID != "507f1f77bcf86cd799439011" {
		t.Fatalf("unexpected runtime edgeId from config fixture: %q", cfg.Runtime.EdgeID)
	}
	if cfg.Cloud.Namespace != "/edge" {
		t.Fatalf("unexpected cloud namespace from config fixture: %q", cfg.Cloud.Namespace)
	}

	store := state.NewCredentialStore(stateDir)
	credentialBytes, err := os.ReadFile(runtimeFixturePath(t, "valid/credential.json"))
	if err != nil {
		t.Fatalf("read valid credential fixture: %v", err)
	}
	if err := os.WriteFile(filepath.Join(stateDir, "credential.json"), credentialBytes, 0o600); err != nil {
		t.Fatalf("write valid credential fixture into state dir: %v", err)
	}

	credential, exists, err := store.Load()
	if err != nil {
		t.Fatalf("load valid credential fixture through production store: %v", err)
	}
	if !exists {
		t.Fatal("expected valid credential fixture to exist")
	}
	if credential.EdgeID != cfg.Runtime.EdgeID {
		t.Fatalf("expected config and credential edgeIds to match, got %q and %q", cfg.Runtime.EdgeID, credential.EdgeID)
	}
	if credential.CredentialSecret != "persistent-secret-fixture-valid" {
		t.Fatalf("unexpected credential secret from smoke fixture: %q", credential.CredentialSecret)
	}
	if credential.Version != 3 {
		t.Fatalf("unexpected credential version from smoke fixture: %d", credential.Version)
	}
}

func TestRuntimeSmokeFixtureLoadsPersistentCredentialBootstrapInputs(t *testing.T) {
	stateDir := t.TempDir()
	store := state.NewCredentialStore(stateDir)

	validCredentialBytes, err := os.ReadFile(runtimeFixturePath(t, "valid/credential.json"))
	if err != nil {
		t.Fatalf("read valid credential fixture: %v", err)
	}
	if err := os.WriteFile(filepath.Join(stateDir, "credential.json"), validCredentialBytes, 0o600); err != nil {
		t.Fatalf("write valid credential fixture into state dir: %v", err)
	}

	credential, exists, err := store.Load()
	if err != nil {
		t.Fatalf("load persistent credential fixture: %v", err)
	}
	if !exists {
		t.Fatal("expected credential fixture to exist")
	}
	if credential.EdgeID != "507f1f77bcf86cd799439011" {
		t.Fatalf("unexpected credential edgeId from smoke fixture: %q", credential.EdgeID)
	}
	if credential.CredentialSecret != "persistent-secret-fixture-valid" {
		t.Fatalf("unexpected credential secret from smoke fixture: %q", credential.CredentialSecret)
	}
	if credential.Version != 3 {
		t.Fatalf("unexpected credential version from smoke fixture: %d", credential.Version)
	}
}

func TestRuntimeSmokeFixtureDoesNotRequirePersistedRuntimeStateFiles(t *testing.T) {
	for _, fileName := range []string{"credential.json", "runtime-state.json", "status.json"} {
		_, err := os.Stat(runtimeFixturePath(t, fileName))
		if err == nil {
			t.Fatalf("fixture set must not require machine-written runtime state file %q", fileName)
		}
		if !errors.Is(err, os.ErrNotExist) {
			t.Fatalf("inspect fixture %q: %v", fileName, err)
		}
	}
}

func TestRuntimeStateFileTracksProductionRuntimeTransitions(t *testing.T) {
	stateDir := t.TempDir()
	t.Setenv("RUNTIME_STATE_DIR", stateDir)
	t.Setenv("CLOUD_SOCKET_URL", "http://127.0.0.1:4000")

	cfg, err := config.LoadFromFile(runtimeFixturePath(t, "config.yaml"))
	if err != nil {
		t.Fatalf("load runtime config fixture: %v", err)
	}
	cfg.Batch.IntervalMs = 20
	cfg.Batch.MaxReadings = 1

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	process, err := runtimeapp.New(ctx, cfg, noopTransport{})
	if err != nil {
		t.Fatalf("construct production runtime app: %v", err)
	}

	runtimeStore := state.NewRuntimeStateStore(stateDir)
	startupState := waitForRuntimeState(t, runtimeStore, func(snapshot state.RuntimeState) bool {
		return snapshot.EdgeID == cfg.Runtime.EdgeID &&
			snapshot.CredentialStatus == state.CredentialStatusMissing &&
			snapshot.SessionState == state.SessionStateStartup &&
			snapshot.AuthOutcome == state.AuthOutcomeNeverAttempted &&
			!snapshot.RetryEligible &&
			snapshot.SourceConfigRevision != ""
	})
	if startupState.LastConnectAttemptAt != nil {
		t.Fatalf("expected startup runtime-state to avoid premature connect attempts, got %+v", startupState)
	}

	if err := process.Runner.ActivateTrustedSession(cfg.Runtime.EdgeID, "persistent-secret-fixture-valid"); err != nil {
		t.Fatalf("activate trusted session: %v", err)
	}
	trustedState := waitForRuntimeState(t, runtimeStore, func(snapshot state.RuntimeState) bool {
		return snapshot.SessionState == state.SessionStateTrusted &&
			snapshot.AuthOutcome == state.AuthOutcomeAccepted &&
			snapshot.RetryEligible &&
			snapshot.LastTrustedSessionAt != nil
	})
	if trustedState.EdgeID != cfg.Runtime.EdgeID {
		t.Fatalf("expected trusted runtime-state edgeId=%q, got %+v", cfg.Runtime.EdgeID, trustedState)
	}

	control, err := process.Sources.MockControl("mock-source-1")
	if err != nil {
		t.Fatalf("get mock source control: %v", err)
	}
	if err := control.EmitReading(source.RawReading{
		DeviceID: "pump-1",
		Metric:   "pressure",
		Value:    18.75,
		TS:       1001,
	}); err != nil {
		t.Fatalf("emit reading through production runtime app: %v", err)
	}

	telemetryState := waitForRuntimeState(t, runtimeStore, func(snapshot state.RuntimeState) bool {
		return snapshot.LastTelemetrySentAt != nil
	})
	if telemetryState.LastTelemetrySentAt == nil {
		t.Fatalf("expected runtime-state to record successful telemetry emit, got %+v", telemetryState)
	}

	if err := process.Runner.MarkDisconnected("transport_closed"); err != nil {
		t.Fatalf("mark runtime disconnected: %v", err)
	}
	disconnectedState := waitForRuntimeState(t, runtimeStore, func(snapshot state.RuntimeState) bool {
		return snapshot.SessionState == state.SessionStateRetryWait &&
			snapshot.AuthOutcome == state.AuthOutcomeDisconnected &&
			snapshot.RetryEligible &&
			snapshot.LastDisconnectReason != nil &&
			*snapshot.LastDisconnectReason == "transport_closed"
	})
	if disconnectedState.LastDisconnectAt == nil {
		t.Fatalf("expected runtime-state to record disconnect timestamp, got %+v", disconnectedState)
	}
}

func waitForRuntimeState(t *testing.T, store *state.RuntimeStateStore, predicate func(state.RuntimeState) bool) state.RuntimeState {
	t.Helper()

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		snapshot, exists, err := store.Load()
		if err != nil {
			t.Fatalf("load runtime-state from production store: %v", err)
		}
		if exists && predicate(snapshot) {
			return snapshot
		}
		time.Sleep(10 * time.Millisecond)
	}

	snapshot, exists, err := store.Load()
	if err != nil {
		t.Fatalf("final runtime-state load: %v", err)
	}
	t.Fatalf("timed out waiting for runtime-state predicate, exists=%v snapshot=%+v", exists, snapshot)
	return state.RuntimeState{}
}
