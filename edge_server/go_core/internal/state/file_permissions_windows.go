//go:build windows

package state

import (
	"fmt"
	"unsafe"

	"golang.org/x/sys/windows"
)

func verifyRuntimeFilePermissionsPlatform(path string, profile PermissionProfile) error {
	descriptor, err := windows.GetNamedSecurityInfo(
		path,
		windows.SE_FILE_OBJECT,
		windows.DACL_SECURITY_INFORMATION,
	)
	if err != nil {
		return fmt.Errorf("read ACL for %s: %w", path, err)
	}

	dacl, _, err := descriptor.DACL()
	if err != nil {
		return fmt.Errorf("read DACL for %s: %w", path, err)
	}
	if dacl == nil {
		return fmt.Errorf("%s ACL is missing DACL", profile.FileName)
	}

	entries, err := getEntriesFromACL(dacl)
	if err != nil {
		return fmt.Errorf("enumerate ACE for %s: %w", path, err)
	}

	required := make(map[string]bool, len(profile.WindowsRequiredFullControlSIDs))
	for _, sid := range profile.WindowsRequiredFullControlSIDs {
		required[sid] = false
	}
	forbidden := make(map[string]struct{}, len(profile.WindowsForbiddenBroadReadSIDs))
	for _, sid := range profile.WindowsForbiddenBroadReadSIDs {
		forbidden[sid] = struct{}{}
	}

	for _, entry := range entries {
		entrySID, err := sidFromACE(entry)
		if err != nil {
			return fmt.Errorf("decode ACE SID for %s: %w", profile.FileName, err)
		}
		mask := entry.Mask

		switch entry.Header.AceType {
		case windows.ACCESS_ALLOWED_ACE_TYPE:
			if _, isRequired := required[entrySID]; isRequired && hasFileFullControl(mask) {
				required[entrySID] = true
			}
			if _, isForbidden := forbidden[entrySID]; isForbidden && grantsRead(mask) {
				return fmt.Errorf("%s ACL grants broad-read SID %s", profile.FileName, entrySID)
			}
		case windows.ACCESS_DENIED_ACE_TYPE:
			if _, isRequired := required[entrySID]; isRequired && deniesCriticalRights(mask) {
				return fmt.Errorf("%s ACL denies critical rights for required SID %s", profile.FileName, entrySID)
			}
		}
	}

	for sid, granted := range required {
		if !granted {
			return fmt.Errorf("%s ACL must grant Full Control to SID %s", profile.FileName, sid)
		}
	}

	return nil
}

func getEntriesFromACL(acl *windows.ACL) (entries []*windows.ACCESS_ALLOWED_ACE, err error) {
	entries = make([]*windows.ACCESS_ALLOWED_ACE, acl.AceCount)
	for i := uint16(0); i < acl.AceCount; i++ {
		if err := windows.GetAce(acl, uint32(i), &entries[i]); err != nil {
			return nil, err
		}
	}

	return entries, nil
}

func sidFromACE(entry *windows.ACCESS_ALLOWED_ACE) (string, error) {
	sid := (*windows.SID)(unsafe.Pointer(&entry.SidStart))
	return sid.String(), nil
}

func hasFileFullControl(mask windows.ACCESS_MASK) bool {
	if mask&windows.GENERIC_ALL == windows.GENERIC_ALL {
		return true
	}

	required := windows.ACCESS_MASK(
		windows.FILE_GENERIC_READ |
			windows.FILE_GENERIC_WRITE |
			windows.FILE_GENERIC_EXECUTE |
			windows.DELETE |
			windows.WRITE_DAC |
			windows.WRITE_OWNER,
	)

	return mask&required == required
}

func grantsRead(mask windows.ACCESS_MASK) bool {
	if mask&windows.GENERIC_ALL == windows.GENERIC_ALL {
		return true
	}
	if mask&windows.GENERIC_READ == windows.GENERIC_READ {
		return true
	}

	readBits := windows.ACCESS_MASK(
		windows.FILE_GENERIC_READ |
			windows.FILE_READ_DATA |
			windows.FILE_READ_ATTRIBUTES |
			windows.FILE_READ_EA,
	)

	return mask&readBits != 0
}

func deniesCriticalRights(mask windows.ACCESS_MASK) bool {
	critical := windows.ACCESS_MASK(
		windows.FILE_GENERIC_READ |
			windows.FILE_GENERIC_WRITE |
			windows.FILE_GENERIC_EXECUTE |
			windows.DELETE |
			windows.WRITE_DAC |
			windows.WRITE_OWNER,
	)

	return mask&critical != 0
}
