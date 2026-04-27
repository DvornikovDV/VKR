package contract

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"edge_server/go_core/internal/cloud"
	"edge_server/go_core/internal/config"
	"edge_server/go_core/internal/runtimeapp"
)

func contractFixturePath(t *testing.T, name string) string {
	t.Helper()
	return filepath.Join("..", "..", "..", "tests", "fixtures", "runtime", name)
}

type contractNoopTransport struct{}

func (contractNoopTransport) Connect(context.Context, cloud.HandshakeAuth) error { return nil }
func (contractNoopTransport) Disconnect() error                                  { return nil }
func (contractNoopTransport) Emit(string, any) error                             { return nil }
func (contractNoopTransport) OnEdgeDisconnect(func(any))                         {}
func (contractNoopTransport) OnConnect(func() error)                             {}
func (contractNoopTransport) OnConnectError(func(error))                         {}
func (contractNoopTransport) OnDisconnect(func(string))                          {}

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

func TestT010ActiveEdgeContractRejectsUnknownEdgeAndSecondSession(t *testing.T) {
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

func TestT010LegacyOnboardingRejectionsAreNotActiveEdgeContractCodes(t *testing.T) {
	for _, message := range []string{
		"onboarding_not_allowed",
		"onboarding_package_missing",
		"onboarding_package_expired",
		"onboarding_package_reused",
		"persistent_credential_revoked",
	} {
		err := cloud.NewConnectError(message)
		if typed, ok := err.(cloud.ConnectError); ok {
			t.Fatalf("legacy rejection %q must not normalize as active connect_error %q", message, typed.Code)
		}
		if got := cloud.NormalizeConnectError(err); got != cloud.ConnectErrorInvalidCredential {
			t.Fatalf("legacy rejection %q should collapse to invalid_credential, got %q", message, got)
		}
	}
}
