package integration

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

func TestReproTaskT002EdgeContractHarnessUsesCurrentAuthoritySet(t *testing.T) {
	repoRoot := repoRootForRepro(t)
	goCoreRoot := goCoreRootForRepro(t)

	hideFileForRepro(
		t,
		filepath.Join(repoRoot, "specs", "001-edge-runtime", "contracts", "cloud-runtime-contract.md"),
	)
	hideFileForRepro(
		t,
		filepath.Join(repoRoot, "specs", "004-edge-onboarding", "contracts", "edge-socket-contract.md"),
	)
	hideFileForRepro(
		t,
		filepath.Join(repoRoot, "cloud_server", "src", "services", "edge-onboarding.service.ts"),
	)
	hideFileForRepro(
		t,
		filepath.Join(repoRoot, "cloud_server", "src", "socket", "events", "edge.ts"),
	)

	exitCode, output := runGoTestForRepro(
		t,
		goCoreRoot,
		"./tests/contract",
		"-run",
		"TestCloudLifecycleParityHarness",
		"-count=1",
	)
	if exitCode != 0 {
		t.Fatalf("edge contract harness must pass using only 007/websocket/openapi authorities\n%s", output)
	}
}

func TestReproTaskT002RuntimeSmokeFixtureHarnessUses007Baseline(t *testing.T) {
	repoRoot := repoRootForRepro(t)
	goCoreRoot := goCoreRootForRepro(t)

	hideFileForRepro(
		t,
		filepath.Join(repoRoot, "edge_server", "tests", "fixtures", "runtime", "onboarding-package.json"),
	)
	hideFileForRepro(
		t,
		filepath.Join(repoRoot, "edge_server", "go_core", "tests", "integration", "repro_task_T001_test.go"),
	)

	exitCode, output := runGoTestForRepro(
		t,
		goCoreRoot,
		"./tests/integration",
		"-run",
		"TestRuntimeSmokeFixtureContracts",
		"-count=1",
	)
	if exitCode != 0 {
		t.Fatalf("runtime smoke fixture harness must pass from the 007 persistent baseline without onboarding-package.json\n%s", output)
	}
}

func repoRootForRepro(t *testing.T) string {
	t.Helper()

	root, err := filepath.Abs(filepath.Join("..", "..", "..", ".."))
	if err != nil {
		t.Fatalf("resolve repo root: %v", err)
	}
	return root
}

func goCoreRootForRepro(t *testing.T) string {
	t.Helper()

	root, err := filepath.Abs(filepath.Join("..", ".."))
	if err != nil {
		t.Fatalf("resolve go_core root: %v", err)
	}
	return root
}

func hideFileForRepro(t *testing.T, path string) {
	t.Helper()

	backupPath := path + ".repro-hidden"
	if err := os.Rename(path, backupPath); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return
		}
		t.Fatalf("hide legacy authority %s: %v", path, err)
	}
	t.Cleanup(func() {
		if err := os.Rename(backupPath, path); err != nil {
			t.Fatalf("restore legacy authority %s: %v", path, err)
		}
	})
}

func runGoTestForRepro(t *testing.T, workdir string, args ...string) (int, string) {
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
