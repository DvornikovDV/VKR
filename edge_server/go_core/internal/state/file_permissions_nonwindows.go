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
