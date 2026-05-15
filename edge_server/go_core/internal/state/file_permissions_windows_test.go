//go:build windows

package state

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"golang.org/x/sys/windows"
)

func TestRepairRuntimeFilePermissionsRemovesBroadReadACL(t *testing.T) {
	path := filepath.Join(t.TempDir(), "credential.json")
	if err := os.WriteFile(path, []byte("{}\n"), 0o600); err != nil {
		t.Fatalf("write credential fixture: %v", err)
	}
	if err := setBroadReadACLForTest(path, false); err != nil {
		t.Fatalf("set broad-read ACL fixture: %v", err)
	}

	err := VerifyRuntimeFilePermissions(path, RuntimeStateFileCredential)
	if err == nil || !strings.Contains(err.Error(), "S-1-5-32-545") {
		t.Fatalf("expected broad-read ACL rejection, got %v", err)
	}

	if err := RepairRuntimeFilePermissions(path, RuntimeStateFileCredential); err != nil {
		t.Fatalf("repair credential ACL: %v", err)
	}
	if err := VerifyRuntimeFilePermissions(path, RuntimeStateFileCredential); err != nil {
		t.Fatalf("expected repaired credential ACL to pass verification: %v", err)
	}
}

func TestEnsureRuntimePersistenceBoundariesWithRepairRepairsManagedFiles(t *testing.T) {
	stateDir := t.TempDir()
	path := filepath.Join(stateDir, "credential.json")
	if err := os.WriteFile(path, []byte("{}\n"), 0o600); err != nil {
		t.Fatalf("write credential fixture: %v", err)
	}
	if err := setBroadReadACLForTest(path, false); err != nil {
		t.Fatalf("set broad-read ACL fixture: %v", err)
	}

	err := EnsureRuntimePersistenceBoundaries(stateDir)
	if err == nil || !strings.Contains(err.Error(), "broad-read") {
		t.Fatalf("expected strict boundary check to reject broad-read ACL, got %v", err)
	}

	if err := EnsureRuntimePersistenceBoundariesWithRepair(stateDir, PermissionRepairManagedOnly); err != nil {
		t.Fatalf("expected repair boundary check to pass: %v", err)
	}
	if err := VerifyRuntimeFilePermissions(path, RuntimeStateFileCredential); err != nil {
		t.Fatalf("expected repaired credential ACL to pass verification: %v", err)
	}
}

func setBroadReadACLForTest(path string, directory bool) error {
	sids, err := runtimePermissionSIDs()
	if err != nil {
		return err
	}
	usersSID, err := windows.StringToSid("S-1-5-32-545")
	if err != nil {
		return err
	}

	inheritance := uint32(0)
	if directory {
		inheritance = windows.OBJECT_INHERIT_ACE | windows.CONTAINER_INHERIT_ACE
	}

	entries := make([]windows.EXPLICIT_ACCESS, 0, len(sids)+1)
	for _, item := range sids {
		entries = append(entries, windows.EXPLICIT_ACCESS{
			AccessPermissions: windows.GENERIC_ALL,
			AccessMode:        windows.SET_ACCESS,
			Inheritance:       inheritance,
			Trustee: windows.TRUSTEE{
				TrusteeForm:  windows.TRUSTEE_IS_SID,
				TrusteeType:  item.trusteeType,
				TrusteeValue: windows.TrusteeValueFromSID(item.sid),
			},
		})
	}
	entries = append(entries, windows.EXPLICIT_ACCESS{
		AccessPermissions: windows.GENERIC_READ,
		AccessMode:        windows.SET_ACCESS,
		Inheritance:       inheritance,
		Trustee: windows.TRUSTEE{
			TrusteeForm:  windows.TRUSTEE_IS_SID,
			TrusteeType:  windows.TRUSTEE_IS_WELL_KNOWN_GROUP,
			TrusteeValue: windows.TrusteeValueFromSID(usersSID),
		},
	})

	acl, err := windows.ACLFromEntries(entries, nil)
	if err != nil {
		return err
	}

	return windows.SetNamedSecurityInfo(
		path,
		windows.SE_FILE_OBJECT,
		windows.DACL_SECURITY_INFORMATION|windows.PROTECTED_DACL_SECURITY_INFORMATION,
		nil,
		nil,
		acl,
		nil,
	)
}
