package state

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestPermissionProfilesUseWellKnownSIDsAndPOSIXModes(t *testing.T) {
	cases := []RuntimeStateFile{
		RuntimeStateFileCredential,
		RuntimeStateFileRuntimeState,
		RuntimeStateFileStatus,
	}

	for _, fileName := range cases {
		t.Run(string(fileName), func(t *testing.T) {
			profile, err := PermissionProfileForFile(fileName)
			if err != nil {
				t.Fatalf("load permission profile: %v", err)
			}

			if len(profile.WindowsRequiredFullControlSIDs) == 0 || len(profile.WindowsForbiddenBroadReadSIDs) == 0 {
				t.Fatalf("expected SID-based windows profile for %s", fileName)
			}
			for _, sid := range append(profile.WindowsRequiredFullControlSIDs, profile.WindowsForbiddenBroadReadSIDs...) {
				if len(sid) < 3 || sid[:2] != "S-" {
					t.Fatalf("expected SID value, got %q", sid)
				}
			}

			if fileName == RuntimeStateFileCredential && profile.POSIXFallbackMode != 0o600 {
				t.Fatalf("expected 0600 for credential file, got %o", profile.POSIXFallbackMode)
			}
			if fileName != RuntimeStateFileCredential && profile.POSIXFallbackMode != 0o640 {
				t.Fatalf("expected 0640 for %s, got %o", fileName, profile.POSIXFallbackMode)
			}
		})
	}
}

func TestVerifyRuntimeFilePermissions(t *testing.T) {
	path := filepath.Join(t.TempDir(), "credential.json")
	if err := os.WriteFile(path, []byte("{}\n"), 0o600); err != nil {
		t.Fatalf("write state file: %v", err)
	}
	fileName, err := RuntimeStateFileFromPath(path)
	if err != nil {
		t.Fatalf("resolve runtime state file from path: %v", err)
	}

	err = VerifyRuntimeFilePermissions(path, fileName)
	if runtime.GOOS == "windows" {
		if err != nil {
			t.Fatalf("expected windows ACL validation to pass on fresh file, got %v", err)
		}
		return
	}

	if err != nil {
		t.Fatalf("expected POSIX validation to pass for 0600, got %v", err)
	}

	if err := os.Chmod(path, 0o644); err != nil {
		t.Fatalf("chmod credential file: %v", err)
	}
	if err := VerifyRuntimeFilePermissions(path, fileName); err == nil {
		t.Fatalf("expected mode mismatch to fail validation")
	}
}

func TestAtomicWriteJSONRejectsUnmanagedRuntimeFilePath(t *testing.T) {
	path := filepath.Join(t.TempDir(), "custom.json")

	err := atomicWriteJSON(path, map[string]any{"ok": true}, 0o600)
	if err == nil {
		t.Fatal("expected unmanaged runtime file path to be rejected")
	}
	if !strings.Contains(err.Error(), "not managed by permission profiles") {
		t.Fatalf("expected unmanaged path error, got %v", err)
	}
}

func TestAtomicWriteJSONRejectsPermissionModeMismatch(t *testing.T) {
	path := filepath.Join(t.TempDir(), "credential.json")

	err := atomicWriteJSON(path, map[string]any{"edgeId": "507f1f77bcf86cd799439011"}, 0o640)
	if err == nil {
		t.Fatal("expected permission mode mismatch to fail")
	}
	if !strings.Contains(err.Error(), "mode must match permission profile") {
		t.Fatalf("expected mode mismatch error, got %v", err)
	}
}

func TestEnsureRuntimePersistenceBoundariesRejectsNonRegularManagedFile(t *testing.T) {
	stateDir := t.TempDir()
	credentialPath := filepath.Join(stateDir, "credential.json")
	if err := os.Mkdir(credentialPath, 0o700); err != nil {
		t.Fatalf("create invalid credential boundary path: %v", err)
	}

	err := EnsureRuntimePersistenceBoundaries(stateDir)
	if err == nil {
		t.Fatal("expected non-regular managed file path to fail boundary check")
	}
	if !strings.Contains(err.Error(), "credential.json must be a regular file") {
		t.Fatalf("expected non-regular boundary error, got %v", err)
	}
}
