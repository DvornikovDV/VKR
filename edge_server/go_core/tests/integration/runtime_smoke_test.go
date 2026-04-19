package integration

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"edge_server/go_core/internal/config"
	"edge_server/go_core/internal/runtimeapp"
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
