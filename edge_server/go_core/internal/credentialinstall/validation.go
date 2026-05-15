package credentialinstall

import (
	"fmt"

	"edge_server/go_core/internal/state"
)

func ValidateInstallCandidate(input NormalizedCredentialInput, context LocalInstallContext) error {
	if input.EdgeID != context.EdgeID {
		return fmt.Errorf("credential disclosure edgeId %q does not match runtime.edgeId %q", input.EdgeID, context.EdgeID)
	}

	if context.ExistingCredential != nil {
		if context.ExistingCredential.EdgeID != context.EdgeID {
			return fmt.Errorf("existing credential.json edgeId %q does not match runtime.edgeId %q", context.ExistingCredential.EdgeID, context.EdgeID)
		}
		if input.Version <= context.ExistingCredential.Version {
			return fmt.Errorf("credential disclosure version %d must be greater than installed credential version %d", input.Version, context.ExistingCredential.Version)
		}
	}

	if context.ExistingRuntimeState != nil {
		if context.ExistingRuntimeState.EdgeID != context.EdgeID {
			return fmt.Errorf("runtime-state.json edgeId %q does not match runtime.edgeId %q", context.ExistingRuntimeState.EdgeID, context.EdgeID)
		}
		if err := state.ValidateCredentialReplacement(
			context.ExistingRuntimeState.CredentialStatus,
			input.Version,
			context.ExistingRuntimeState.CredentialVersion,
		); err != nil {
			return err
		}
	}

	return nil
}
