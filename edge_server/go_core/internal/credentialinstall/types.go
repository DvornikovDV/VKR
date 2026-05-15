package credentialinstall

import (
	"time"

	"edge_server/go_core/internal/state"
)

type InstallSource string

const (
	InstallSourceRegister InstallSource = "register"
	InstallSourceRotate   InstallSource = "rotate"
	InstallSourceUnblock  InstallSource = "unblock"
)

type RawDisclosureInput struct {
	EdgeID               string                          `json:"edgeId,omitempty"`
	CredentialSecret     string                          `json:"credentialSecret,omitempty"`
	Version              int                             `json:"version,omitempty"`
	IssuedAt             string                          `json:"issuedAt,omitempty"`
	PersistentCredential *RawPersistentCredentialInput   `json:"persistentCredential,omitempty"`
	Data                 *RawDisclosureEnvelopeData      `json:"data,omitempty"`
	Presentation         map[string]RawPresentationField `json:"-"`
}

type RawDisclosureEnvelopeData struct {
	PersistentCredential *RawPersistentCredentialInput `json:"persistentCredential,omitempty"`
}

type RawPersistentCredentialInput struct {
	EdgeID           string `json:"edgeId"`
	CredentialSecret string `json:"credentialSecret"`
	Version          int    `json:"version"`
	IssuedAt         string `json:"issuedAt"`
	Instructions     string `json:"instructions,omitempty"`
}

type RawPresentationField struct {
	Name  string
	Value string
}

type NormalizedCredentialInput struct {
	EdgeID           string
	CredentialSecret string
	Version          int
	IssuedAt         time.Time
}

type LocalInstallContext struct {
	EdgeID                     string
	StateDir                   string
	ExistingCredential         *state.Credential
	ExistingRuntimeState       *state.RuntimeState
	ExistingCredentialFilePath string
}

type InstallResult struct {
	EdgeID         string
	Version        int
	Source         InstallSource
	CredentialPath string
	InstalledAt    time.Time
}
