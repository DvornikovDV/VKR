package integration

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"edge_server/go_core/internal/config"
	"edge_server/go_core/internal/mockadapter"
	"edge_server/go_core/internal/runtimeapp"
	"edge_server/go_core/internal/source"
	"edge_server/go_core/internal/state"
)

func TestReproTaskT001RuntimeFixtureConfigLoadsThroughRuntimeOwnedPath(t *testing.T) {
	stateDir := t.TempDir()
	t.Setenv("RUNTIME_STATE_DIR", stateDir)
	t.Setenv("CLOUD_SOCKET_URL", "http://127.0.0.1:4000")
	installRuntimeFixtureCredential(t, stateDir)

	cfg, err := config.LoadFromFile(runtimeFixturePath(t, "config.mock.yaml"))
	if err != nil {
		t.Fatalf("load runtime fixture config through production loader: %v", err)
	}

	_, err = runtimeapp.NewWithSourceFactoriesForTest(context.Background(), cfg, noopTransport{}, source.FactoryRegistry{
		mockadapter.Kind: func() (source.Adapter, error) {
			return mockadapter.New(), nil
		},
	})
	if err != nil {
		t.Fatalf("consume runtime fixture config through runtime app wiring: %v", err)
	}

	if cfg.Batch.IntervalMs != 1000 || cfg.Batch.MaxReadings != 100 {
		t.Fatalf("unexpected batch settings from runtime fixture: %+v", cfg.Batch)
	}
	if len(cfg.Sources) != 1 || cfg.Sources[0].AdapterKind != "mock" {
		t.Fatalf("unexpected source definition from runtime fixture: %+v", cfg.Sources)
	}
}

func TestReproTaskT001CredentialFixturesLoadThroughRuntimeOwnedStore(t *testing.T) {
	stateDir := t.TempDir()
	store := state.NewCredentialStore(stateDir)

	validBytes, err := os.ReadFile(runtimeFixturePath(t, "valid/credential.json"))
	if err != nil {
		t.Fatalf("read valid credential fixture: %v", err)
	}
	validPath := filepath.Join(stateDir, "credential.json")
	if err := os.WriteFile(validPath, validBytes, 0o600); err != nil {
		t.Fatalf("write valid credential fixture into state dir: %v", err)
	}

	credential, exists, err := store.Load()
	if err != nil {
		t.Fatalf("load valid credential fixture through production store: %v", err)
	}
	if !exists {
		t.Fatal("expected valid credential fixture to exist")
	}
	if credential.EdgeID != "507f1f77bcf86cd799439011" {
		t.Fatalf("unexpected edgeId from valid credential fixture: %q", credential.EdgeID)
	}
	if credential.CredentialSecret != "persistent-secret-fixture-valid" {
		t.Fatalf("unexpected credential secret from valid credential fixture: %q", credential.CredentialSecret)
	}
	if credential.Version != 3 {
		t.Fatalf("unexpected credential version from valid credential fixture: %d", credential.Version)
	}

	partialCorruptBytes, err := os.ReadFile(runtimeFixturePath(t, "partial-corrupt/credential.json"))
	if err != nil {
		t.Fatalf("read partial-corrupt credential fixture: %v", err)
	}
	if err := os.WriteFile(validPath, partialCorruptBytes, 0o600); err != nil {
		t.Fatalf("write partial-corrupt credential fixture into state dir: %v", err)
	}

	_, _, err = store.Load()
	if err == nil || !strings.Contains(err.Error(), "parse credential.json") {
		t.Fatalf("expected corrupt credential fixture to fail via production store parser, got %v", err)
	}
}

func installRuntimeFixtureCredential(t *testing.T, stateDir string) {
	t.Helper()

	validBytes, err := os.ReadFile(runtimeFixturePath(t, "valid/credential.json"))
	if err != nil {
		t.Fatalf("read valid credential fixture: %v", err)
	}
	if err := os.WriteFile(filepath.Join(stateDir, "credential.json"), validBytes, 0o600); err != nil {
		t.Fatalf("write valid credential fixture into state dir: %v", err)
	}
}

func TestReproTaskT001RuntimeFixtureReadmeDocuments007Baseline(t *testing.T) {
	readmeBytes, err := os.ReadFile(runtimeFixturePath(t, "README.md"))
	if err != nil {
		t.Fatalf("read runtime fixture README: %v", err)
	}

	readme := string(readmeBytes)
	for _, snippet := range []string{"007-edge-server", "config.mock.yaml", "config.modbus.yaml", "valid/credential.json", "partial-corrupt/credential.json"} {
		if !strings.Contains(readme, snippet) {
			t.Fatalf("fixture README must document %s in the 007 baseline", snippet)
		}
	}
	for _, legacySnippet := range []string{"001-edge-runtime", "client/tests/unit/edgeActivationCredentialBehavior.test.ts", "edge_server/src"} {
		if strings.Contains(readme, legacySnippet) {
			t.Fatalf("fixture README must drop legacy derivation reference %s", legacySnippet)
		}
	}
}
