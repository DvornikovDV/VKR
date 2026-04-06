package state

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

const (
	credentialFileName   = "credential.json"
	runtimeStateFileName = "runtime-state.json"
	statusFileName       = "status.json"
)

func atomicWriteJSON(path string, value any, mode os.FileMode) error {
	if strings.TrimSpace(path) == "" {
		return fmt.Errorf("state file path is required")
	}

	payload, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return fmt.Errorf("encode %s: %w", filepath.Base(path), err)
	}
	payload = append(payload, '\n')

	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return fmt.Errorf("create state directory: %w", err)
	}

	tmp, err := os.CreateTemp(dir, "."+filepath.Base(path)+".*.tmp")
	if err != nil {
		return fmt.Errorf("create temp state file: %w", err)
	}

	tmpPath := tmp.Name()
	success := false
	defer func() {
		if !success {
			_ = os.Remove(tmpPath)
		}
	}()

	if _, err := tmp.Write(payload); err != nil {
		_ = tmp.Close()
		return fmt.Errorf("write temp state file: %w", err)
	}
	if err := tmp.Sync(); err != nil {
		_ = tmp.Close()
		return fmt.Errorf("sync temp state file: %w", err)
	}
	if err := tmp.Close(); err != nil {
		return fmt.Errorf("close temp state file: %w", err)
	}
	if err := os.Chmod(tmpPath, mode); err != nil {
		return fmt.Errorf("set state file mode: %w", err)
	}
	if err := replaceFile(tmpPath, path); err != nil {
		return fmt.Errorf("atomic replace %s: %w", filepath.Base(path), err)
	}

	success = true
	return nil
}

func readJSONFile(path string, dst any) (bool, error) {
	if strings.TrimSpace(path) == "" {
		return false, fmt.Errorf("state file path is required")
	}

	payload, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return false, nil
		}
		return false, fmt.Errorf("read %s: %w", filepath.Base(path), err)
	}

	if err := json.Unmarshal(payload, dst); err != nil {
		return true, fmt.Errorf("parse %s: %w", filepath.Base(path), err)
	}

	return true, nil
}
