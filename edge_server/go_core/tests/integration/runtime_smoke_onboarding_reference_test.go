package integration

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gorilla/websocket"

	"edge_server/go_core/internal/cloud"
)

// Legacy onboarding reference coverage retained outside the T002 authority
// harness until T011 rewrites the startup smoke path.

type fakeSocketIOServer struct {
	t *testing.T

	mu               sync.Mutex
	authAttempts     []cloud.HandshakeAuth
	authEvents       chan cloud.HandshakeAuth
	persistentError  string
	persistentSecret string

	server *httptest.Server
}

func newFakeSocketIOServer(t *testing.T) *fakeSocketIOServer {
	t.Helper()

	srv := &fakeSocketIOServer{
		t:                t,
		authEvents:       make(chan cloud.HandshakeAuth, 8),
		persistentError:  string(cloud.ConnectErrorPersistentCredentialRevoked),
		persistentSecret: "persistent-from-activation",
	}

	upgrader := websocket.Upgrader{
		CheckOrigin: func(_ *http.Request) bool { return true },
	}

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/socket.io/" {
			http.NotFound(w, r)
			return
		}

		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close()

		if err := conn.WriteMessage(websocket.TextMessage, []byte(`0{"sid":"test-sid","upgrades":[],"pingInterval":25000,"pingTimeout":20000,"maxPayload":1000000}`)); err != nil {
			return
		}

		_, rawMessage, err := conn.ReadMessage()
		if err != nil {
			return
		}

		auth, err := parseNamespaceConnectMessage(rawMessage)
		if err != nil {
			t.Errorf("parse namespace connect message: %v", err)
			return
		}

		srv.mu.Lock()
		srv.authAttempts = append(srv.authAttempts, auth)
		attempt := len(srv.authAttempts)
		srv.mu.Unlock()

		srv.authEvents <- auth

		switch attempt {
		case 1:
			if err := conn.WriteMessage(websocket.TextMessage, []byte(`40/edge,{"sid":"edge-socket-1"}`)); err != nil {
				return
			}

			activationMessage := fmt.Sprintf(
				`42/edge,["edge_activation",{"edgeId":%q,"lifecycleState":"Active","persistentCredential":{"version":1,"secret":%q,"issuedAt":"2026-04-07T10:00:00Z"}}]`,
				auth.EdgeID,
				srv.persistentSecret,
			)
			if err := conn.WriteMessage(websocket.TextMessage, []byte(activationMessage)); err != nil {
				return
			}

			time.Sleep(50 * time.Millisecond)
			_ = conn.Close()
		case 2:
			connectErrorMessage := fmt.Sprintf(`44/edge,{"message":%q}`, srv.persistentError)
			if err := conn.WriteMessage(websocket.TextMessage, []byte(connectErrorMessage)); err != nil {
				return
			}
			time.Sleep(25 * time.Millisecond)
		default:
			t.Errorf("unexpected connect attempt #%d with auth %+v", attempt, auth)
		}
	})

	srv.server = httptest.NewServer(handler)
	return srv
}

func (s *fakeSocketIOServer) Close() {
	if s.server != nil {
		s.server.Close()
	}
}

func (s *fakeSocketIOServer) URL() string {
	return s.server.URL
}

func (s *fakeSocketIOServer) WaitForAttempt(t *testing.T, timeout time.Duration) cloud.HandshakeAuth {
	t.Helper()

	select {
	case auth := <-s.authEvents:
		return auth
	case <-time.After(timeout):
		t.Fatal("timed out waiting for runtime handshake attempt")
		return cloud.HandshakeAuth{}
	}
}

func parseNamespaceConnectMessage(raw []byte) (cloud.HandshakeAuth, error) {
	message := string(raw)
	if !strings.HasPrefix(message, "40/edge,") {
		return cloud.HandshakeAuth{}, fmt.Errorf("expected namespace connect packet, got %q", message)
	}

	var payload struct {
		EdgeID           string               `json:"edgeId"`
		CredentialMode   cloud.CredentialMode `json:"credentialMode"`
		CredentialSecret string               `json:"credentialSecret"`
	}
	if err := json.Unmarshal([]byte(strings.TrimPrefix(message, "40/edge,")), &payload); err != nil {
		return cloud.HandshakeAuth{}, fmt.Errorf("parse namespace connect payload: %w", err)
	}

	return cloud.BuildHandshakeAuth(payload.EdgeID, payload.CredentialMode, payload.CredentialSecret)
}

func buildRuntimeBinary(t *testing.T) string {
	t.Helper()

	goCoreRoot, err := filepath.Abs(filepath.Join("..", ".."))
	if err != nil {
		t.Fatalf("resolve go_core root: %v", err)
	}

	binaryPath := filepath.Join(t.TempDir(), "edge-runtime-test.exe")
	buildCmd := exec.Command("go", "build", "-o", binaryPath, "./cmd/edge-runtime")
	buildCmd.Dir = goCoreRoot
	buildOutput, err := buildCmd.CombinedOutput()
	if err != nil {
		t.Fatalf("build edge runtime binary: %v\n%s", err, string(buildOutput))
	}

	return binaryPath
}

func writeRuntimeConfigFixture(t *testing.T, cloudURL string) string {
	t.Helper()

	configFixturePath := runtimeFixturePath(t, "config.yaml")
	configBytes, err := os.ReadFile(configFixturePath)
	if err != nil {
		t.Fatalf("read config fixture: %v", err)
	}

	configPath := filepath.Join(t.TempDir(), "config.yaml")
	if err := os.WriteFile(configPath, configBytes, 0o600); err != nil {
		t.Fatalf("write temp config fixture: %v", err)
	}

	t.Setenv("CLOUD_SOCKET_URL", cloudURL)
	return configPath
}

func TestReproTaskT016bProductionMainEntrypointUsesRealCloudTransportLifecycle(t *testing.T) {
	socketServer := newFakeSocketIOServer(t)
	defer socketServer.Close()

	binaryPath := buildRuntimeBinary(t)
	configPath := writeRuntimeConfigFixture(t, socketServer.URL())

	onboardingPath := runtimeFixturePath(t, "onboarding-package.json")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, binaryPath, "--config", configPath, "--onboarding-package", onboardingPath)
	cmd.Env = append(os.Environ(), "EDGE_ONBOARDING_SECRET=smoke-run-secret", "CLOUD_SOCKET_URL="+socketServer.URL())

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Start(); err != nil {
		t.Fatalf("start edge runtime binary: %v", err)
	}

	firstAttempt := socketServer.WaitForAttempt(t, 2*time.Second)
	if firstAttempt.CredentialMode != cloud.CredentialModeOnboarding {
		t.Fatalf("expected first production connect attempt to use onboarding mode, got %q", firstAttempt.CredentialMode)
	}

	secondAttempt := socketServer.WaitForAttempt(t, 2*time.Second)
	if secondAttempt.CredentialMode != cloud.CredentialModePersistent {
		t.Fatalf("expected same-process reconnect to use persistent credential mode, got %q", secondAttempt.CredentialMode)
	}
	if secondAttempt.CredentialSecret != socketServer.persistentSecret {
		t.Fatalf(
			"expected reconnect attempt to reuse persistent credential from activation, got %q",
			secondAttempt.CredentialSecret,
		)
	}

	err := cmd.Wait()
	if err == nil {
		t.Fatalf("expected runtime to fail fast after rejected reconnect with no valid auth path\nstdout:\n%s\nstderr:\n%s", stdout.String(), stderr.String())
	}
	if !strings.Contains(stderr.String(), "fresh operator onboarding input") {
		t.Fatalf("expected operator-facing fail-fast error about fresh onboarding input, got stderr:\n%s", stderr.String())
	}
}

func TestReproTaskT016bProductionMainEntrypointFailsFastWithoutValidAuthPath(t *testing.T) {
	binaryPath := buildRuntimeBinary(t)
	configPath := writeRuntimeConfigFixture(t, "http://127.0.0.1:65535")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, binaryPath, "--config", configPath)
	cmd.Env = append(os.Environ(), "CLOUD_SOCKET_URL=http://127.0.0.1:65535")

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()
	if err == nil {
		t.Fatalf("expected runtime without any valid auth path to fail fast\nstdout:\n%s\nstderr:\n%s", stdout.String(), stderr.String())
	}
	if !strings.Contains(stderr.String(), "no valid current auth path") {
		t.Fatalf("expected clear fail-fast auth-path error, got stderr:\n%s", stderr.String())
	}
}
