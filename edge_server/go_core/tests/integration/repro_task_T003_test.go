package integration

import (
	"encoding/json"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"edge_server/go_core/internal/cloud"
	"edge_server/go_core/internal/state"
)

func TestReproTaskT003LegacyRuntimeFixturesRemainQuarantinedFromProductionAcceptance(t *testing.T) {
	readmeBytes, err := os.ReadFile(runtimeFixturePath(t, "README.md"))
	if err != nil {
		t.Fatalf("read runtime fixture README: %v", err)
	}

	stateDir := t.TempDir()
	store := state.NewCredentialStore(stateDir)

	legacyCredentialBytes, err := os.ReadFile(runtimeFixturePath(t, "legacy-onboarding/credential.json"))
	if err != nil {
		t.Fatalf("read legacy credential fixture: %v", err)
	}
	if err := os.WriteFile(filepath.Join(stateDir, "credential.json"), legacyCredentialBytes, 0o600); err != nil {
		t.Fatalf("write legacy credential fixture into state dir: %v", err)
	}

	_, _, err = store.Load()
	if err == nil {
		t.Fatal("expected production credential store to reject legacy onboarding credential fixture")
	}
	if !isPersistentCredentialSchemaError(err) {
		t.Fatalf("expected legacy onboarding credential fixture to fail persistent-only credential validation, got %v", err)
	}

	activationBytes, err := os.ReadFile(runtimeFixturePath(t, "wrong-edge-id/edge_activation.json"))
	if err != nil {
		t.Fatalf("read wrong-edge-id activation fixture: %v", err)
	}
	var activationPayload map[string]any
	if err := json.Unmarshal(activationBytes, &activationPayload); err != nil {
		t.Fatalf("parse wrong-edge-id activation fixture json: %v", err)
	}

	_, err = cloud.ParseEdgeActivation(activationPayload, "507f1f77bcf86cd799439011")
	if err == nil || !strings.Contains(err.Error(), "edge_activation edgeId mismatch") {
		t.Fatalf("expected production edge activation parser to reject wrong-edge-id fixture, got %v", err)
	}

	goCoreRoot, err := filepath.Abs(filepath.Join("..", ".."))
	if err != nil {
		t.Fatalf("resolve go_core root: %v", err)
	}

	legacyFixturePayloads := make(map[string]string, 3)
	for _, fixture := range []string{
		"onboarding-package.json",
		"legacy-onboarding/credential.json",
		"wrong-edge-id/edge_activation.json",
	} {
		raw, err := os.ReadFile(runtimeFixturePath(t, fixture))
		if err != nil {
			t.Fatalf("read legacy fixture %s: %v", fixture, err)
		}
		legacyFixturePayloads[fixture] = string(raw)
	}

	onboardingPath := runtimeFixturePath(t, "onboarding-package.json")
	hideRuntimeFixtureForRepro(t, onboardingPath)

	contractExitCode, contractOutput := runGoTestForT003Repro(
		t,
		goCoreRoot,
		"./tests/contract",
		"-count=1",
	)
	if contractExitCode != 0 {
		t.Fatalf("default contract acceptance must stay green without onboarding-package.json\n%s", contractOutput)
	}

	integrationExitCode, integrationOutput := runGoTestForT003Repro(
		t,
		goCoreRoot,
		"./tests/integration",
		"-run",
		"TestRuntimeSmokeFixtureContracts|TestReproTaskT016bProductionMainEntrypointUsesRealCloudTransportLifecycle|TestReproTaskT018ProductionRuntimeTelemetryPathBatchesCanonicalPayloadsAndDropsOutsideTrustedSession|TestReproTaskT028TrustLossAndDisconnectCoverage",
		"-count=1",
	)
	if integrationExitCode != 0 {
		t.Fatalf("default integration acceptance must stay green without onboarding-package.json\n%s", integrationOutput)
	}

	readme := string(readmeBytes)
	for _, snippet := range []string{
		"`onboarding-package.json` - quarantined legacy reference only; not part of production acceptance.",
		"`legacy-onboarding/credential.json` - quarantined legacy reference only; not part of production acceptance.",
		"`wrong-edge-id/edge_activation.json` - quarantined legacy reference only; not part of production acceptance.",
		"`EDGE_ENABLE_LEGACY_ONBOARDING_REFERENCE=1`",
	} {
		if !strings.Contains(readme, snippet) {
			t.Fatalf("runtime fixture README must document quarantine snippet %q", snippet)
		}
	}

	for _, fixture := range []string{
		"onboarding-package.json",
		"legacy-onboarding/credential.json",
		"wrong-edge-id/edge_activation.json",
	} {
		if !strings.Contains(legacyFixturePayloads[fixture], `"fixtureClass": "legacy-reference-only"`) {
			t.Fatalf("legacy fixture %s must carry explicit legacy-reference-only quarantine metadata", fixture)
		}
	}
}

func hideRuntimeFixtureForRepro(t *testing.T, path string) {
	t.Helper()

	backupPath := path + ".repro-hidden"
	if err := os.Rename(path, backupPath); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return
		}
		t.Fatalf("hide runtime fixture %s: %v", path, err)
	}

	t.Cleanup(func() {
		if err := os.Rename(backupPath, path); err != nil {
			t.Fatalf("restore runtime fixture %s: %v", path, err)
		}
	})
}

func runGoTestForT003Repro(t *testing.T, workdir string, args ...string) (int, string) {
	t.Helper()

	cmd := exec.Command("go", append([]string{"test"}, args...)...)
	cmd.Dir = workdir
	output, err := cmd.CombinedOutput()
	if err == nil {
		return 0, string(output)
	}

	var exitErr *exec.ExitError
	if errors.As(err, &exitErr) {
		return exitErr.ExitCode(), string(output)
	}

	t.Fatalf("run go test %v: %v\n%s", args, err, string(output))
	return 0, ""
}

func isPersistentCredentialSchemaError(err error) bool {
	if err == nil {
		return false
	}

	for _, snippet := range []string{
		"credential.version must be positive",
		"credential.source is required",
		"credential.source must be register, rotate, or unblock",
		"credential.installedAt is required",
	} {
		if strings.Contains(err.Error(), snippet) {
			return true
		}
	}

	return false
}
