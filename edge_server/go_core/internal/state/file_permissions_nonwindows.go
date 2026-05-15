//go:build !windows

package state

import (
	"fmt"
	"os"
)

func verifyRuntimeFilePermissionsPlatform(path string, profile PermissionProfile) error {
	info, err := os.Stat(path)
	if err != nil {
		return fmt.Errorf("stat %s: %w", path, err)
	}

	mode := info.Mode().Perm()
	if mode != profile.POSIXFallbackMode {
		return fmt.Errorf("%s mode must be %o, got %o", profile.FileName, profile.POSIXFallbackMode, mode)
	}

	return nil
}

func repairRuntimeFilePermissionsPlatform(path string, profile PermissionProfile) error {
	if err := os.Chmod(path, profile.POSIXFallbackMode); err != nil {
		return fmt.Errorf("chmod %s: %w", path, err)
	}

	return nil
}

func repairRuntimeDirectoryPermissionsPlatform(path string) error {
	if err := os.Chmod(path, stateDirectoryMode); err != nil {
		return fmt.Errorf("chmod %s: %w", path, err)
	}

	return nil
}
