//go:build windows

package state

import "golang.org/x/sys/windows"

func replaceFile(sourcePath string, targetPath string) error {
	from, err := windows.UTF16PtrFromString(sourcePath)
	if err != nil {
		return err
	}
	to, err := windows.UTF16PtrFromString(targetPath)
	if err != nil {
		return err
	}

	return windows.MoveFileEx(
		from,
		to,
		windows.MOVEFILE_REPLACE_EXISTING|windows.MOVEFILE_WRITE_THROUGH,
	)
}
