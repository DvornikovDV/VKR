package cloud

import (
	"context"
	"fmt"
	"strings"
)

type CredentialMode string

const (
	// Deprecated: active /edge authentication uses edgeId + credentialSecret only.
	CredentialModeOnboarding CredentialMode = "onboarding"
	// Deprecated: active /edge authentication uses edgeId + credentialSecret only.
	CredentialModePersistent CredentialMode = "persistent"
)

type HandshakeAuth struct {
	EdgeID string
	// Deprecated: retained only for quarantined legacy reference tests.
	CredentialMode   CredentialMode
	CredentialSecret string
}

func (a HandshakeAuth) Validate() error {
	if strings.TrimSpace(a.EdgeID) == "" {
		return fmt.Errorf("handshake.edgeId is required")
	}
	if strings.TrimSpace(a.CredentialSecret) == "" {
		return fmt.Errorf("handshake.credentialSecret is required")
	}

	return nil
}

type Transport interface {
	Connect(ctx context.Context, auth HandshakeAuth) error
	Disconnect() error
	Emit(event string, payload any) error

	OnEdgeDisconnect(handler func(any))
	OnConnect(handler func() error)
	OnConnectError(handler func(error))
	// OnDisconnect receives ordinary Socket.IO disconnect reasons (e.g. transport close).
	OnDisconnect(handler func(string))
}
