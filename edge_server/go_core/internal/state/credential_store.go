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
	CredentialMode   string    `json:"credentialMode"`
	CredentialSecret string    `json:"credentialSecret"`
	Version          int       `json:"version"`
	IssuedAt         time.Time `json:"issuedAt"`
	LifecycleState   string    `json:"lifecycleState"`
}

type CredentialStore struct {
	path string
}

type persistentCredentialFixture007 struct {
	EdgeID           string    `json:"edgeId"`
	CredentialSecret string    `json:"credentialSecret"`
	Version          int       `json:"version"`
	IssuedAt         time.Time `json:"issuedAt"`
	Source           string    `json:"source"`
	InstalledAt      time.Time `json:"installedAt"`
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
	if err := validateCredential(credential); err == nil {
		return credential, true, nil
	}

	// Temporary T001 compatibility shim: accept the 007 persistent-credential file
	// shape until T005 replaces the store schema and removes legacy dual-shape load.
	compatCredential, err := load007CredentialFixture(payload)
	if err != nil {
		return Credential{}, true, validateCredential(credential)
	}

	return compatCredential, true, nil
}

func validateCredential(credential Credential) error {
	if strings.TrimSpace(credential.EdgeID) == "" {
		return fmt.Errorf("credential.edgeId is required")
	}
	if credential.CredentialMode != "persistent" {
		return fmt.Errorf("credential.credentialMode must be persistent")
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
	if credential.LifecycleState != "Active" {
		return fmt.Errorf("credential.lifecycleState must be Active")
	}

	return nil
}

func load007CredentialFixture(payload []byte) (Credential, error) {
	var fixture persistentCredentialFixture007
	if err := json.Unmarshal(payload, &fixture); err != nil {
		return Credential{}, fmt.Errorf("parse 007 credential fixture: %w", err)
	}
	if strings.TrimSpace(fixture.EdgeID) == "" {
		return Credential{}, fmt.Errorf("credential.edgeId is required")
	}
	if strings.TrimSpace(fixture.CredentialSecret) == "" {
		return Credential{}, fmt.Errorf("credential.credentialSecret is required")
	}
	if fixture.Version <= 0 {
		return Credential{}, fmt.Errorf("credential.version must be positive")
	}
	if fixture.IssuedAt.IsZero() {
		return Credential{}, fmt.Errorf("credential.issuedAt is required")
	}
	if fixture.InstalledAt.IsZero() {
		return Credential{}, fmt.Errorf("credential.installedAt is required")
	}
	if fixture.Source != "register" && fixture.Source != "rotate" && fixture.Source != "unblock" {
		return Credential{}, fmt.Errorf("credential.source must be register, rotate, or unblock")
	}

	return Credential{
		EdgeID:           fixture.EdgeID,
		CredentialMode:   "persistent",
		CredentialSecret: fixture.CredentialSecret,
		Version:          fixture.Version,
		IssuedAt:         fixture.IssuedAt,
		LifecycleState:   "Active",
	}, nil
}
