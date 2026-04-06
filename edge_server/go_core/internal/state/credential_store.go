package state

import (
	"fmt"
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
	var credential Credential
	exists, err := readJSONFile(s.path, &credential)
	if err != nil {
		return Credential{}, exists, err
	}
	if !exists {
		return Credential{}, false, nil
	}
	if err := validateCredential(credential); err != nil {
		return Credential{}, true, err
	}

	return credential, true, nil
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
