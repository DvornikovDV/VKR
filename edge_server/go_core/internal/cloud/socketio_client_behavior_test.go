package cloud

import (
	"context"
	"errors"
	"fmt"
	"reflect"
	"testing"
)

type inMemoryTransport struct {
	onConnect      func() error
	onDisconnect   func(reason string)
	onConnectErr   func(error)
	edgeDisconnect func(any)
	executeCommand func(any)
	connected      bool
	emitted        []struct {
		Event   string
		Payload any
	}
}

var _ Transport = (*inMemoryTransport)(nil)

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

func (t *inMemoryTransport) Emit(event string, payload any) error {
	if !t.connected {
		return errors.New("transport is not connected")
	}
	t.emitted = append(t.emitted, struct {
		Event   string
		Payload any
	}{event, payload})
	return nil
}

func (t *inMemoryTransport) OnEdgeDisconnect(handler func(any)) {
	t.edgeDisconnect = handler
}

func (t *inMemoryTransport) OnExecuteCommand(handler func(any)) {
	t.executeCommand = handler
}

func (t *inMemoryTransport) InjectExecuteCommand(payload any) {
	if t.executeCommand != nil {
		t.executeCommand(payload)
	}
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

	var gotDisconnect EdgeDisconnect
	var gotError ConnectErrorCode
	var gotProtocolError ProtocolError
	handlers := LifecycleHandlers{
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
			CredentialSecret: "credential-secret",
		},
	); err != nil {
		t.Fatalf("connect: %v", err)
	}

	transport.edgeDisconnect(map[string]any{
		"edgeId": "edge-1",
		"reason": "credential_rotated",
	})
	if gotDisconnect.Reason != DisconnectReasonCredentialRotated {
		t.Fatalf("expected normalized disconnect reason credential_rotated, got %+v", gotDisconnect)
	}

	transport.onConnectErr(errors.New("persistent_credential_revoked"))
	if gotError != ConnectErrorInvalidCredential {
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

	transport.edgeDisconnect(map[string]any{
		"edgeId": "wrong-edge",
		"reason": "credential_rotated",
	})
	if gotProtocolError.Event != "edge_disconnect" || gotProtocolError.Err == nil {
		t.Fatalf("expected protocol error callback for invalid disconnect payload, got %+v", gotProtocolError)
	}
}

func TestParseEdgeDisconnectRejectsMismatchedEdgeID(t *testing.T) {
	_, err := ParseEdgeDisconnect(map[string]any{
		"edgeId": "edge-2",
		"reason": "credential_rotated",
	}, "edge-1")
	if err == nil {
		t.Fatal("expected edgeId mismatch to be rejected")
	}
}

func TestBuildHandshakeAuthNormalizesInput(t *testing.T) {
	auth, err := BuildOnboardingHandshakeAuth(" edge-1 ", " onboarding-secret ")
	if err != nil {
		t.Fatalf("build legacy onboarding auth: %v", err)
	}
	if auth.EdgeID != "edge-1" {
		t.Fatalf("expected trimmed edgeId, got %q", auth.EdgeID)
	}
	if auth.CredentialSecret != "onboarding-secret" {
		t.Fatalf("expected trimmed legacy secret, got %q", auth.CredentialSecret)
	}

	persistent, err := BuildPersistentHandshakeAuth("edge-1", " persist-secret ")
	if err != nil {
		t.Fatalf("build persistent auth: %v", err)
	}
	if persistent.CredentialSecret != "persist-secret" {
		t.Fatalf("expected trimmed persistent secret, got %q", persistent.CredentialSecret)
	}
}

func TestSocketIOClientEmitsCapabilitiesCatalog(t *testing.T) {
	transport := &inMemoryTransport{}
	client, err := NewSocketIOClient(SocketIOClientConfig{
		ExpectedEdgeID: "edge-1",
		Transport:      transport,
	})
	if err != nil {
		t.Fatalf("create socket client: %v", err)
	}
	if err := client.Connect(context.Background(), HandshakeAuth{
		EdgeID:           "edge-1",
		CredentialSecret: "persist-secret",
	}); err != nil {
		t.Fatalf("connect: %v", err)
	}

	catalog := EdgeCapabilitiesCatalog{
		EdgeServerID: "edge-1",
		Telemetry: []EdgeCatalogTelemetryMetric{
			{
				DeviceID:  "pump-01",
				Metric:    "status",
				ValueType: CatalogValueTypeBoolean,
				Label:     "pump-01 / status",
			},
		},
		Commands: []EdgeCatalogCommandCapability{
			{
				DeviceID:       "pump-01",
				CommandType:    CommandTypeSetBool,
				ValueType:      CatalogValueTypeBoolean,
				ReportedMetric: "status",
				Label:          "pump-01 / set_bool",
			},
		},
	}

	if err := client.EmitCapabilitiesCatalog(catalog); err != nil {
		t.Fatalf("emit capabilities catalog: %v", err)
	}

	if len(transport.emitted) != 1 {
		t.Fatalf("expected one emitted event, got %+v", transport.emitted)
	}
	if transport.emitted[0].Event != string(EdgeEventCapabilitiesCatalog) {
		t.Fatalf("expected event %q, got %q", EdgeEventCapabilitiesCatalog, transport.emitted[0].Event)
	}
	if !reflect.DeepEqual(transport.emitted[0].Payload, catalog) {
		t.Fatalf("expected catalog payload to pass through transport, got %+v", transport.emitted[0].Payload)
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
		CredentialSecret: "persist-secret",
	}); err != nil {
		t.Fatalf("connect: %v", err)
	}

	transport.edgeDisconnect(map[string]any{
		"edgeId": "edge-1",
		"reason": "credential_rotated",
	})
	transport.onDisconnect("io server disconnect")

	if len(disconnects) != 2 {
		t.Fatalf("expected 2 disconnect callbacks, got %d", len(disconnects))
	}
	if disconnects[0].Reason != DisconnectReasonCredentialRotated {
		t.Fatalf("expected lifecycle disconnect reason credential_rotated, got %+v", disconnects[0])
	}
	if disconnects[1].Reason != DisconnectReasonCredentialRotated {
		t.Fatalf("expected ordinary disconnect after lifecycle event to preserve credential_rotated, got %+v", disconnects[1])
	}
}
