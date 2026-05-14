package configurator

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

type ConfigFileService struct {
	targetPath string
	validator  ValidationService
}

func NewConfigFileService(targetPath string) (ConfigFileService, error) {
	cleanPath := strings.TrimSpace(targetPath)
	if cleanPath == "" {
		return ConfigFileService{}, fmt.Errorf("config path is required")
	}

	return ConfigFileService{
		targetPath: cleanPath,
		validator:  ValidationService{},
	}, nil
}

func (s ConfigFileService) Load() (ConfigLoadResponse, error) {
	raw, err := os.ReadFile(s.targetPath)
	if err != nil {
		if os.IsNotExist(err) {
			return ConfigLoadResponse{Exists: false}, nil
		}
		return ConfigLoadResponse{}, fmt.Errorf("read config: %w", err)
	}

	return ConfigLoadResponse{
		YAML:   string(raw),
		Exists: true,
	}, nil
}

func (s ConfigFileService) Save(rawYAML string) (SaveResponse, error) {
	validation := s.validator.Validate(rawYAML)
	if !validation.Valid {
		return SaveResponse{
			Saved:      false,
			Validation: validation,
		}, nil
	}

	if err := s.atomicWrite([]byte(rawYAML)); err != nil {
		return SaveResponse{}, err
	}

	return SaveResponse{
		Saved:      true,
		Validation: validation,
	}, nil
}

func (s ConfigFileService) atomicWrite(raw []byte) error {
	dir := filepath.Dir(s.targetPath)
	base := filepath.Base(s.targetPath)
	tempFile, err := os.CreateTemp(dir, "."+base+".*.tmp")
	if err != nil {
		return fmt.Errorf("create temp config: %w", err)
	}

	tempPath := tempFile.Name()
	cleanup := true
	defer func() {
		if cleanup {
			_ = os.Remove(tempPath)
		}
	}()

	if _, err := tempFile.Write(raw); err != nil {
		_ = tempFile.Close()
		return fmt.Errorf("write temp config: %w", err)
	}
	if err := tempFile.Sync(); err != nil {
		_ = tempFile.Close()
		return fmt.Errorf("sync temp config: %w", err)
	}
	if err := tempFile.Close(); err != nil {
		return fmt.Errorf("close temp config: %w", err)
	}
	if err := os.Rename(tempPath, s.targetPath); err != nil {
		return fmt.Errorf("replace config: %w", err)
	}

	cleanup = false
	return nil
}
