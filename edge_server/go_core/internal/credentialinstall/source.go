package credentialinstall

import "edge_server/go_core/internal/state"

func DeriveInstallSource(context LocalInstallContext) InstallSource {
	if context.ExistingCredential == nil {
		return InstallSourceRegister
	}
	if context.ExistingRuntimeState != nil && context.ExistingRuntimeState.CredentialStatus == state.CredentialStatusBlocked {
		return InstallSourceUnblock
	}

	return InstallSourceRotate
}
