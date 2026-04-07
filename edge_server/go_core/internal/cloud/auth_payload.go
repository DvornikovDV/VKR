package cloud

import (
	"fmt"
	"strings"
)

func BuildHandshakeAuth(
	edgeID string,
	credentialMode CredentialMode,
	credentialSecret string,
) (HandshakeAuth, error) {
	auth := HandshakeAuth{
		EdgeID:           strings.TrimSpace(edgeID),
		CredentialMode:   credentialMode,
		CredentialSecret: strings.TrimSpace(credentialSecret),
	}
	if err := auth.Validate(); err != nil {
		return HandshakeAuth{}, fmt.Errorf("build handshake auth: %w", err)
	}

	return auth, nil
}

func BuildOnboardingHandshakeAuth(edgeID string, onboardingSecret string) (HandshakeAuth, error) {
	return BuildHandshakeAuth(edgeID, CredentialModeOnboarding, onboardingSecret)
}

func BuildPersistentHandshakeAuth(edgeID string, persistentSecret string) (HandshakeAuth, error) {
	return BuildHandshakeAuth(edgeID, CredentialModePersistent, persistentSecret)
}
