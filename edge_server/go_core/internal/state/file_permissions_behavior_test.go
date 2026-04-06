package state

import (
	"os"
	"path/filepath"
	"runtime"
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
