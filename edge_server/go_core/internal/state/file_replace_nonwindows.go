//go:build !windows

package state

import "os"

func replaceFile(sourcePath string, targetPath string) error {
	return os.Rename(sourcePath, targetPath)
}
