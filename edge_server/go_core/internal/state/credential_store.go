package state

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type Credential struct {
	EdgeID           string    `json:"edgeId"`
	CredentialSecret string    `json:"credentialSecret"`
	Version          int       `json:"version"`
	IssuedAt         time.Time `json:"issuedAt"`
	Source           string    `json:"source"`
	InstalledAt      time.Time `json:"installedAt"`
}

type CredentialStore struct {
	path string
}

func NewCredentialStore(stateDir string) *CredentialStore {
	return &CredentialStore{
		path: filepath.Join(stateDir, credentialFileName),
	}
}

func (s *CredentialStore) Save(credential Credential) error {
	if err := validateCredential(credential); err != nil {
		return err
	}

	return atomicWriteJSON(s.path, credential, 0o600)
}

func (s *CredentialStore) Load() (Credential, bool, error) {
	payload, err := os.ReadFile(s.path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return Credential{}, false, nil
		}
		return Credential{}, false, fmt.Errorf("read %s: %w", filepath.Base(s.path), err)
	}

	var credential Credential
	if err := json.Unmarshal(payload, &credential); err != nil {
		return Credential{}, true, fmt.Errorf("parse %s: %w", filepath.Base(s.path), err)
	}
	if err := validateCredential(credential); err != nil {
		return Credential{}, true, err
	}
	return credential, true, nil
}

func CredentialVersionReplacesSuperseded(candidateVersion int, supersededVersion *int) bool {
	if supersededVersion == nil {
		return true
	}

	return candidateVersion > *supersededVersion
}

func validateCredential(credential Credential) error {
	if strings.TrimSpace(credential.EdgeID) == "" {
		return fmt.Errorf("credential.edgeId is required")
	}
	if strings.TrimSpace(credential.CredentialSecret) == "" {
		return fmt.Errorf("credential.credentialSecret is required")
	}
	if credential.Version <= 0 {
		return fmt.Errorf("credential.version must be positive")
	}
	if credential.IssuedAt.IsZero() {
		return fmt.Errorf("credential.issuedAt is required")
	}
	if strings.TrimSpace(credential.Source) == "" {
		return fmt.Errorf("credential.source is required")
	}
	if credential.Source != "register" && credential.Source != "rotate" && credential.Source != "unblock" {
		return fmt.Errorf("credential.source must be register, rotate, or unblock")
	}
	if credential.InstalledAt.IsZero() {
		return fmt.Errorf("credential.installedAt is required")
	}

	return nil
}
