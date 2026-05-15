package credentialinstall

import (
	"fmt"
	"time"

	"edge_server/go_core/internal/state"
)

func InstallFromDisclosureJSON(configPath string, payload []byte, installedAt time.Time) (InstallResult, error) {
	return InstallFromDisclosureJSONWithOptions(configPath, payload, installedAt, InstallOptions{})
}

func InstallFromDisclosureJSONWithOptions(configPath string, payload []byte, installedAt time.Time, options InstallOptions) (InstallResult, error) {
	context, err := LoadLocalInstallContextWithOptions(configPath, options.Context)
	if err != nil {
		return InstallResult{}, err
	}

	input, err := ParseDisclosureJSON(payload)
	if err != nil {
		return InstallResult{}, err
	}

	return InstallCredentialInput(context, input, installedAt)
}

func InstallCredentialInput(context LocalInstallContext, input NormalizedCredentialInput, installedAt time.Time) (InstallResult, error) {
	if installedAt.IsZero() {
		installedAt = time.Now().UTC()
	}
	if err := ValidateInstallCandidate(input, context); err != nil {
		return InstallResult{}, err
	}

	source := DeriveInstallSource(context)
	credential := state.Credential{
		EdgeID:           input.EdgeID,
		CredentialSecret: input.CredentialSecret,
		Version:          input.Version,
		IssuedAt:         input.IssuedAt,
		Source:           string(source),
		InstalledAt:      installedAt,
	}
	if err := state.NewCredentialStore(context.StateDir).Save(credential); err != nil {
		return InstallResult{}, fmt.Errorf("save credential.json: %w", err)
	}

	return InstallResult{
		EdgeID:         credential.EdgeID,
		Version:        credential.Version,
		Source:         source,
		CredentialPath: context.ExistingCredentialFilePath,
		InstalledAt:    credential.InstalledAt,
	}, nil
}
