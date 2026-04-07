package cloud

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"
)

type inMemoryTransport struct {
	onConnect      func() error
	onDisconnect   func(reason string)
	onConnectErr   func(error)
	edgeActivation func(any)
	edgeDisconnect func(any)
	connected      bool
}

func (t *inMemoryTransport) Connect(_ context.Context, _ HandshakeAuth) error {
	t.connected = true
	if t.onConnect != nil {
		return t.onConnect()
	}
	return nil
}

func (t *inMemoryTransport) Disconnect() error {
	t.connected = false
	if t.onDisconnect != nil {
		t.onDisconnect("client_requested")
	}
	return nil
}

func (t *inMemoryTransport) Emit(_ string, _ any) error {
	if !t.connected {
		return errors.New("transport is not connected")
	}
	return nil
}

func (t *inMemoryTransport) OnEdgeActivation(handler func(any)) {
	t.edgeActivation = handler
}

func (t *inMemoryTransport) OnEdgeDisconnect(handler func(any)) {
	t.edgeDisconnect = handler
}

func (t *inMemoryTransport) OnConnect(handler func() error) {
	t.onConnect = handler
}

func (t *inMemoryTransport) OnConnectError(handler func(error)) {
	t.onConnectErr = handler
}

func (t *inMemoryTransport) OnDisconnect(handler func(string)) {
	t.onDisconnect = handler
}

func TestSocketLifecycleNormalization(t *testing.T) {
	transport := &inMemoryTransport{}
	client, err := NewSocketIOClient(SocketIOClientConfig{
		ExpectedEdgeID: "edge-1",
		Transport:      transport,
	})
	if err != nil {
		t.Fatalf("create socket client: %v", err)
	}

	var gotActivation EdgeActivation
	var gotDisconnect EdgeDisconnect
	var gotError ConnectErrorCode
	var gotProtocolError ProtocolError
	handlers := LifecycleHandlers{
		OnActivation: func(event EdgeActivation) {
			gotActivation = event
		},
		OnDisconnect: func(event EdgeDisconnect) {
			gotDisconnect = event
		},
		OnConnectError: func(code ConnectErrorCode) {
			gotError = code
		},
		OnProtocolError: func(err ProtocolError) {
			gotProtocolError = err
		},
	}

	if err := client.RegisterLifecycleHandlers(handlers); err != nil {
		t.Fatalf("register handlers: %v", err)
	}

	if err := client.Connect(
		context.Background(),
		HandshakeAuth{
			EdgeID:           "edge-1",
			CredentialMode:   CredentialModeOnboarding,
			CredentialSecret: "onboarding-secret",
		},
	); err != nil {
		t.Fatalf("connect: %v", err)
	}

	transport.edgeActivation(map[string]any{
		"edgeId":         "edge-1",
		"lifecycleState": "Active",
		"persistentCredential": map[string]any{
			"version":  2,
			"secret":   "persist-secret",
			"issuedAt": "2026-04-06T10:00:00Z",
		},
	})
	if gotActivation.EdgeID != "edge-1" {
		t.Fatalf("expected normalized activation edgeId, got %+v", gotActivation)
	}
	if gotActivation.PersistentCredential.Version != 2 {
		t.Fatalf("expected activation version=2, got %+v", gotActivation)
	}
	if gotActivation.PersistentCredential.IssuedAt.IsZero() {
		t.Fatalf("expected parsed issuedAt timestamp, got %+v", gotActivation)
	}

	transport.edgeDisconnect(map[string]any{
		"edgeId": "edge-1",
		"reason": "trust_revoked",
	})
	if gotDisconnect.Reason != DisconnectReasonTrustRevoked {
		t.Fatalf("expected normalized disconnect reason trust_revoked, got %+v", gotDisconnect)
	}

	transport.onConnectErr(errors.New("persistent_credential_revoked"))
	if gotError != ConnectErrorPersistentCredentialRevoked {
		t.Fatalf("expected normalized connect_error code, got %q", gotError)
	}

	transport.onConnectErr(fmt.Errorf("socket connect_error: %w", errors.New("blocked")))
	if gotError != ConnectErrorBlocked {
		t.Fatalf("expected wrapped connect_error to normalize to blocked, got %q", gotError)
	}

	transport.onConnectErr(errors.New("unknown"))
	if gotError != ConnectErrorInvalidCredential {
		t.Fatalf("expected unknown connect_error to normalize to invalid_credential, got %q", gotError)
	}

	transport.edgeActivation(map[string]any{
		"edgeId":         "wrong-edge",
		"lifecycleState": "Active",
		"persistentCredential": map[string]any{
			"version":  1,
			"secret":   "persist-secret",
			"issuedAt": "2026-04-06T10:00:00Z",
		},
	})
	if gotProtocolError.Event != "edge_activation" || gotProtocolError.Err == nil {
		t.Fatalf("expected protocol error callback for invalid activation payload, got %+v", gotProtocolError)
	}
}

func TestParseEdgeActivationRejectsMismatchedEdgeID(t *testing.T) {
	_, err := ParseEdgeActivation(map[string]any{
		"edgeId":         "edge-2",
		"lifecycleState": "Active",
		"persistentCredential": map[string]any{
			"version":  1,
			"secret":   "secret",
			"issuedAt": time.Now().UTC().Format(time.RFC3339),
		},
	}, "edge-1")
	if err == nil {
		t.Fatal("expected edgeId mismatch to be rejected")
	}
}

func TestBuildHandshakeAuthNormalizesInput(t *testing.T) {
	auth, err := BuildOnboardingHandshakeAuth(" edge-1 ", " onboarding-secret ")
	if err != nil {
		t.Fatalf("build onboarding auth: %v", err)
	}
	if auth.EdgeID != "edge-1" {
		t.Fatalf("expected trimmed edgeId, got %q", auth.EdgeID)
	}
	if auth.CredentialMode != CredentialModeOnboarding {
		t.Fatalf("expected onboarding mode, got %q", auth.CredentialMode)
	}

	persistent, err := BuildPersistentHandshakeAuth("edge-1", " persist-secret ")
	if err != nil {
		t.Fatalf("build persistent auth: %v", err)
	}
	if persistent.CredentialSecret != "persist-secret" {
		t.Fatalf("expected trimmed persistent secret, got %q", persistent.CredentialSecret)
	}
}

func TestSocketClientBuildsPersistentReconnectAuthFromActivation(t *testing.T) {
	transport := &inMemoryTransport{}
	client, err := NewSocketIOClient(SocketIOClientConfig{
		ExpectedEdgeID: "edge-1",
		Transport:      transport,
	})
	if err != nil {
		t.Fatalf("create socket client: %v", err)
	}

	auth, err := client.BuildPersistentReconnectAuth(EdgeActivation{
		EdgeID:         "edge-1",
		LifecycleState: "Active",
		PersistentCredential: PersistentCredential{
			Version:  1,
			Secret:   "persist-secret",
			IssuedAt: time.Now().UTC(),
		},
	})
	if err != nil {
		t.Fatalf("build persistent reconnect auth from activation: %v", err)
	}
	if auth.CredentialMode != CredentialModePersistent {
		t.Fatalf("expected persistent reconnect auth mode, got %q", auth.CredentialMode)
	}
	if auth.CredentialSecret != "persist-secret" {
		t.Fatalf("expected persistent reconnect auth secret, got %q", auth.CredentialSecret)
	}
}

func TestSocketLifecycleNormalizationHandlesOrdinaryDisconnect(t *testing.T) {
	transport := &inMemoryTransport{}
	client, err := NewSocketIOClient(SocketIOClientConfig{
		ExpectedEdgeID: "edge-1",
		Transport:      transport,
	})
	if err != nil {
		t.Fatalf("create socket client: %v", err)
	}

	var disconnects []EdgeDisconnect
	if err := client.RegisterLifecycleHandlers(LifecycleHandlers{
		OnDisconnect: func(event EdgeDisconnect) {
			disconnects = append(disconnects, event)
		},
	}); err != nil {
		t.Fatalf("register handlers: %v", err)
	}

	if err := client.Connect(context.Background(), HandshakeAuth{
		EdgeID:           "edge-1",
		CredentialMode:   CredentialModePersistent,
		CredentialSecret: "persist-secret",
	}); err != nil {
		t.Fatalf("connect: %v", err)
	}

	transport.onDisconnect("transport close")
	if len(disconnects) != 1 {
		t.Fatalf("expected 1 normalized disconnect callback, got %d", len(disconnects))
	}
	if disconnects[0].EdgeID != "edge-1" || disconnects[0].Reason != DisconnectReasonForced {
		t.Fatalf("expected ordinary disconnect to normalize to edge_forced_disconnect, got %+v", disconnects[0])
	}

	if err := transport.Disconnect(); err != nil {
		t.Fatalf("transport disconnect: %v", err)
	}
	if len(disconnects) != 2 {
		t.Fatalf("expected 2 normalized disconnect callbacks, got %d", len(disconnects))
	}
	if disconnects[1].Reason != DisconnectReasonClientRequested {
		t.Fatalf("expected explicit client disconnect to normalize to client_requested, got %+v", disconnects[1])
	}
}

func TestSocketLifecycleNormalizationPreservesLifecycleReasonAcrossOrdinaryDisconnect(t *testing.T) {
	transport := &inMemoryTransport{}
	client, err := NewSocketIOClient(SocketIOClientConfig{
		ExpectedEdgeID: "edge-1",
		Transport:      transport,
	})
	if err != nil {
		t.Fatalf("create socket client: %v", err)
	}

	var disconnects []EdgeDisconnect
	if err := client.RegisterLifecycleHandlers(LifecycleHandlers{
		OnDisconnect: func(event EdgeDisconnect) {
			disconnects = append(disconnects, event)
		},
	}); err != nil {
		t.Fatalf("register handlers: %v", err)
	}

	if err := client.Connect(context.Background(), HandshakeAuth{
		EdgeID:           "edge-1",
		CredentialMode:   CredentialModePersistent,
		CredentialSecret: "persist-secret",
	}); err != nil {
		t.Fatalf("connect: %v", err)
	}

	transport.edgeDisconnect(map[string]any{
		"edgeId": "edge-1",
		"reason": "trust_revoked",
	})
	transport.onDisconnect("io server disconnect")

	if len(disconnects) != 2 {
		t.Fatalf("expected 2 disconnect callbacks, got %d", len(disconnects))
	}
	if disconnects[0].Reason != DisconnectReasonTrustRevoked {
		t.Fatalf("expected lifecycle disconnect reason trust_revoked, got %+v", disconnects[0])
	}
	if disconnects[1].Reason != DisconnectReasonTrustRevoked {
		t.Fatalf("expected ordinary disconnect after lifecycle event to preserve trust_revoked, got %+v", disconnects[1])
	}
}
