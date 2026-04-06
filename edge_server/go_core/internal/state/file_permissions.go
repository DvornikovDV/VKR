package state

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

type RuntimeStateFile string

const (
	RuntimeStateFileCredential   RuntimeStateFile = credentialFileName
	RuntimeStateFileRuntimeState RuntimeStateFile = runtimeStateFileName
	RuntimeStateFileStatus       RuntimeStateFile = statusFileName
)

type PermissionProfile struct {
	FileName                       RuntimeStateFile
	POSIXFallbackMode              os.FileMode
	WindowsRequiredFullControlSIDs []string
	WindowsForbiddenBroadReadSIDs  []string
}

func PermissionProfileForFile(file RuntimeStateFile) (PermissionProfile, error) {
	switch file {
	case RuntimeStateFileCredential:
		return PermissionProfile{
			FileName:                       RuntimeStateFileCredential,
			POSIXFallbackMode:              0o600,
			WindowsRequiredFullControlSIDs: []string{"S-1-5-18", "S-1-5-32-544"},
			WindowsForbiddenBroadReadSIDs:  []string{"S-1-1-0", "S-1-5-11", "S-1-5-32-545"},
		}, nil
	case RuntimeStateFileRuntimeState:
		return PermissionProfile{
			FileName:                       RuntimeStateFileRuntimeState,
			POSIXFallbackMode:              0o640,
			WindowsRequiredFullControlSIDs: []string{"S-1-5-18", "S-1-5-32-544"},
			WindowsForbiddenBroadReadSIDs:  []string{"S-1-1-0", "S-1-5-11", "S-1-5-32-545"},
		}, nil
	case RuntimeStateFileStatus:
		return PermissionProfile{
			FileName:                       RuntimeStateFileStatus,
			POSIXFallbackMode:              0o640,
			WindowsRequiredFullControlSIDs: []string{"S-1-5-18", "S-1-5-32-544"},
			WindowsForbiddenBroadReadSIDs:  []string{"S-1-1-0", "S-1-5-11", "S-1-5-32-545"},
		}, nil
	default:
		return PermissionProfile{}, fmt.Errorf("unknown runtime state file %q", file)
	}
}

func RuntimeStateFileFromPath(path string) (RuntimeStateFile, error) {
	base := filepath.Base(path)
	switch base {
	case credentialFileName:
		return RuntimeStateFileCredential, nil
	case runtimeStateFileName:
		return RuntimeStateFileRuntimeState, nil
	case statusFileName:
		return RuntimeStateFileStatus, nil
	default:
		return "", fmt.Errorf("runtime state file %q is not managed by permission profiles", base)
	}
}

func VerifyRuntimeFilePermissions(path string, file RuntimeStateFile) error {
	profile, err := PermissionProfileForFile(file)
	if err != nil {
		return err
	}
	if strings.TrimSpace(path) == "" {
		return fmt.Errorf("%s path is required", file)
	}

	return verifyRuntimeFilePermissionsPlatform(path, profile)
}
