package contract

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"edge_server/go_core/internal/cloud"
	"edge_server/go_core/internal/config"
	"edge_server/go_core/internal/runtimeapp"
)

func contractFixturePath(t *testing.T, name string) string {
	t.Helper()
	return filepath.Join("..", "..", "..", "tests", "fixtures", "runtime", name)
}

func contractAuthorityPath(t *testing.T, parts ...string) string {
	t.Helper()
	base := []string{"..", "..", "..", ".."}
	return filepath.Join(append(base, parts...)...)
}

type contractNoopTransport struct{}

func (contractNoopTransport) Connect(context.Context, cloud.HandshakeAuth) error { return nil }
func (contractNoopTransport) Disconnect() error                                   { return nil }
func (contractNoopTransport) Emit(string, any) error                              { return nil }
func (contractNoopTransport) OnEdgeActivation(func(any))                          {}
func (contractNoopTransport) OnEdgeDisconnect(func(any))                          {}
func (contractNoopTransport) OnConnect(func() error)                              {}
func (contractNoopTransport) OnConnectError(func(error))                          {}
func (contractNoopTransport) OnDisconnect(func(string))                           {}

func TestT010PersistentBootstrapUsesCredentialFileAsOnlyAuthInput(t *testing.T) {
	stateDir := t.TempDir()
	t.Setenv("RUNTIME_STATE_DIR", stateDir)
	t.Setenv("CLOUD_SOCKET_URL", "http://127.0.0.1:4000")

	cfg, err := config.LoadFromFile(contractFixturePath(t, "config.yaml"))
	if err != nil {
		t.Fatalf("load runtime config fixture: %v", err)
	}

	credentialFixture, err := os.ReadFile(contractFixturePath(t, "valid/credential.json"))
	if err != nil {
		t.Fatalf("read persistent credential fixture: %v", err)
	}
	if err := os.WriteFile(filepath.Join(stateDir, "credential.json"), credentialFixture, 0o600); err != nil {
		t.Fatalf("write persistent credential fixture: %v", err)
	}

	process, err := runtimeapp.New(context.Background(), cfg, contractNoopTransport{})
	if err != nil {
		t.Fatalf("construct runtime app for persistent bootstrap contract: %v", err)
	}

	auth, err := process.Bootstrap.BuildHandshakeAuth()
	if err != nil {
		t.Fatalf("expected runtime bootstrap to build handshake from credential.json without onboarding input: %v", err)
	}
	if auth.EdgeID != cfg.Runtime.EdgeID {
		t.Fatalf("expected handshake edgeId %q, got %q", cfg.Runtime.EdgeID, auth.EdgeID)
	}
	if auth.CredentialMode != cloud.CredentialModePersistent {
		t.Fatalf("expected persistent credential mode from credential.json bootstrap, got %q", auth.CredentialMode)
	}
	if auth.CredentialSecret != "persistent-secret-fixture-valid" {
		t.Fatalf("expected credential secret from credential.json, got %q", auth.CredentialSecret)
	}
}

func TestT010ActiveEdgeContractCoversUnknownEdgeAndSingleSessionRejection(t *testing.T) {
	websocketContractBytes, err := os.ReadFile(contractAuthorityPath(
		t,
		"specs",
		"001-cloud-server",
		"contracts",
		"websocket.md",
	))
	if err != nil {
		t.Fatalf("read websocket contract: %v", err)
	}

	websocketContract := string(websocketContractBytes)
	for _, snippet := range []string{
		"`edge_not_found`",
		"additional concurrent connect attempts for the same `edgeId` are rejected with `invalid_credential`",
		"onboarding-package authentication is not part of the active contract",
	} {
		if !strings.Contains(websocketContract, snippet) {
			t.Fatalf("websocket contract must include %q", snippet)
		}
	}

	testCases := []struct {
		name    string
		message string
		want    cloud.ConnectErrorCode
	}{
		{
			name:    "unknown edge connect rejection",
			message: "edge_not_found",
			want:    cloud.ConnectErrorEdgeNotFound,
		},
		{
			name:    "single-session rejection",
			message: "invalid_credential",
			want:    cloud.ConnectErrorInvalidCredential,
		},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			err := cloud.NewConnectError(tc.message)
			if err == nil {
				t.Fatalf("expected connect error parser to accept message %q", tc.message)
			}
			if got := cloud.NormalizeConnectError(err); got != tc.want {
				t.Fatalf("expected normalized connect_error %q, got %q", tc.want, got)
			}
		})
	}
}
