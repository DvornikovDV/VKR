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
	goruntime "runtime"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gorilla/websocket"

	"edge_server/go_core/internal/cloud"
	"edge_server/go_core/internal/config"
	"edge_server/go_core/internal/runtimeapp"
	"edge_server/go_core/internal/source"
	"edge_server/go_core/internal/state"
)

type runtimeHandshakeAttempt struct {
	EdgeID           string
	CredentialSecret string
	AuthPayload      map[string]any
}

type runtimeAuthServerBehavior struct {
	AcceptConnect bool
	ConnectError  string
	KeepAlive     bool
}

type runtimeAuthServer struct {
	t        *testing.T
	behavior runtimeAuthServerBehavior

	mu       sync.Mutex
	attempts []runtimeHandshakeAttempt
	events   chan runtimeHandshakeAttempt

	server *httptest.Server
}

func newRuntimeAuthServer(t *testing.T, behavior runtimeAuthServerBehavior) *runtimeAuthServer {
	t.Helper()

	srv := &runtimeAuthServer{
		t:        t,
		behavior: behavior,
		events:   make(chan runtimeHandshakeAttempt, 8),
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

		if err := conn.WriteMessage(websocket.TextMessage, []byte(`0{"sid":"smoke-sid","upgrades":[],"pingInterval":25000,"pingTimeout":20000,"maxPayload":1000000}`)); err != nil {
			return
		}

		_, rawMessage, err := conn.ReadMessage()
		if err != nil {
			return
		}

		attempt, err := parseRuntimeHandshakeAttempt(rawMessage)
		if err != nil {
			t.Errorf("parse runtime handshake attempt: %v", err)
			return
		}

		srv.mu.Lock()
		srv.attempts = append(srv.attempts, attempt)
		srv.mu.Unlock()

		srv.events <- attempt

		if behavior.ConnectError != "" {
			connectErrorMessage := fmt.Sprintf(`44/edge,{"message":%q}`, behavior.ConnectError)
			_ = conn.WriteMessage(websocket.TextMessage, []byte(connectErrorMessage))
			time.Sleep(25 * time.Millisecond)
			return
		}

		if behavior.AcceptConnect {
			if err := conn.WriteMessage(websocket.TextMessage, []byte(`40/edge,{"sid":"edge-1"}`)); err != nil {
				return
			}
		}

		if behavior.KeepAlive {
			for {
				if _, _, err := conn.ReadMessage(); err != nil {
					return
				}
			}
		}
	})

	srv.server = httptest.NewServer(handler)
	return srv
}

func (s *runtimeAuthServer) Close() {
	if s != nil && s.server != nil {
		s.server.Close()
	}
}

func (s *runtimeAuthServer) URL() string {
	if s == nil || s.server == nil {
		return ""
	}
	return s.server.URL
}

func (s *runtimeAuthServer) WaitForAttempt(t *testing.T, timeout time.Duration) runtimeHandshakeAttempt {
	t.Helper()

	select {
	case attempt := <-s.events:
		return attempt
	case <-time.After(timeout):
		t.Fatal("timed out waiting for runtime handshake attempt")
		return runtimeHandshakeAttempt{}
	}
}

func parseRuntimeHandshakeAttempt(raw []byte) (runtimeHandshakeAttempt, error) {
	message := string(raw)
	if !strings.HasPrefix(message, "40/edge,") {
		return runtimeHandshakeAttempt{}, fmt.Errorf("expected namespace connect packet, got %q", message)
	}

	var payload map[string]any
	if err := json.Unmarshal([]byte(strings.TrimPrefix(message, "40/edge,")), &payload); err != nil {
		return runtimeHandshakeAttempt{}, fmt.Errorf("parse namespace auth payload: %w", err)
	}

	edgeID, _ := payload["edgeId"].(string)
	credentialSecret, _ := payload["credentialSecret"].(string)

	return runtimeHandshakeAttempt{
		EdgeID:           strings.TrimSpace(edgeID),
		CredentialSecret: strings.TrimSpace(credentialSecret),
		AuthPayload:      payload,
	}, nil
}

func TestT011RuntimeStartupUsesConfigAndLocalCredentialForTrustedConnect(t *testing.T) {
	requireRuntimeModbusPort(t)

	socketServer := newRuntimeAuthServer(t, runtimeAuthServerBehavior{
		AcceptConnect: true,
		KeepAlive:     true,
	})
	defer socketServer.Close()

	binaryPath, configPath, stateDir := prepareRuntimeStartup(t, socketServer.URL())
	installCredentialFixture(t, stateDir, "valid/credential.json")

	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, binaryPath, "--config", configPath)
	cmd.Env = os.Environ()

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Start(); err != nil {
		t.Fatalf("start runtime process: %v", err)
	}
	waitDone := make(chan struct{})
	var waitErr error
	go func() {
		waitErr = cmd.Wait()
		close(waitDone)
	}()
	defer func() {
		if cmd.Process != nil && cmd.ProcessState == nil {
			_ = cmd.Process.Kill()
		}
		select {
		case <-waitDone:
		case <-time.After(2 * time.Second):
		}
	}()

	attempt := socketServer.WaitForAttempt(t, 2*time.Second)
	if attempt.EdgeID != "507f1f77bcf86cd799439011" {
		t.Fatalf("expected handshake edgeId from runtime config, got %q", attempt.EdgeID)
	}
	if attempt.CredentialSecret != "persistent-secret-fixture-valid" {
		t.Fatalf("expected handshake to use persistent credential from credential.json, got %q", attempt.CredentialSecret)
	}
	if _, hasLegacyMode := attempt.AuthPayload["credentialMode"]; hasLegacyMode {
		t.Fatalf("runtime handshake auth must not include legacy onboarding field credentialMode, payload=%v", attempt.AuthPayload)
	}

	select {
	case <-waitDone:
		t.Fatalf(
			"runtime exited too early after accepted trusted connect: %v\nstdout:\n%s\nstderr:\n%s",
			waitErr,
			stdout.String(),
			stderr.String(),
		)
	case <-time.After(250 * time.Millisecond):
	}
}

func TestT011RuntimeStartupFailsWithoutCredentialFile(t *testing.T) {
	binaryPath, configPath, _ := prepareRuntimeStartup(t, "http://127.0.0.1:65535")

	err, stdout, stderr := runRuntimeCommand(t, 8*time.Second, binaryPath, "--config", configPath)
	if err == nil {
		t.Fatalf("expected startup without credential.json to fail\nstdout:\n%s\nstderr:\n%s", stdout, stderr)
	}
	if !strings.Contains(strings.ToLower(stderr), "credential.json") {
		t.Fatalf("expected error to mention missing credential.json, got stderr:\n%s", stderr)
	}
	if strings.Contains(strings.ToLower(stderr), "onboarding") {
		t.Fatalf("startup without credential.json must not fallback to onboarding semantics, got stderr:\n%s", stderr)
	}
}

func TestT011RuntimeStartupRejectsInvalidCredentialFile(t *testing.T) {
	binaryPath, configPath, stateDir := prepareRuntimeStartup(t, "http://127.0.0.1:65535")
	installCredentialFixture(t, stateDir, "partial-corrupt/credential.json")

	err, stdout, stderr := runRuntimeCommand(t, 8*time.Second, binaryPath, "--config", configPath)
	if err == nil {
		t.Fatalf("expected startup with invalid credential.json to fail\nstdout:\n%s\nstderr:\n%s", stdout, stderr)
	}
	if !strings.Contains(strings.ToLower(stderr), "credential.json") {
		t.Fatalf("expected invalid credential parse error to mention credential.json, got stderr:\n%s", stderr)
	}
	if !strings.Contains(strings.ToLower(stderr), "parse") {
		t.Fatalf("expected invalid credential parse error details, got stderr:\n%s", stderr)
	}
}

func TestT011RuntimeStartupHandlesUnknownEdgeWithoutOnboardingFallback(t *testing.T) {
	requireRuntimeModbusPort(t)

	socketServer := newRuntimeAuthServer(t, runtimeAuthServerBehavior{
		ConnectError: "edge_not_found",
	})
	defer socketServer.Close()

	binaryPath, configPath, stateDir := prepareRuntimeStartup(t, socketServer.URL())
	installCredentialFixture(t, stateDir, "valid/credential.json")

	err, stdout, stderr := runRuntimeCommand(t, 8*time.Second, binaryPath, "--config", configPath)
	if err == nil {
		t.Fatalf("expected unknown edge connect_error to fail runtime\nstdout:\n%s\nstderr:\n%s", stdout, stderr)
	}
	if !strings.Contains(stderr, "edge_not_found") {
		t.Fatalf("expected stderr to surface edge_not_found rejection, got:\n%s", stderr)
	}
	if strings.Contains(strings.ToLower(stderr), "onboarding") {
		t.Fatalf("unknown edge handling must not fallback to onboarding semantics, got stderr:\n%s", stderr)
	}
}

func TestT011RuntimeStartupHandlesConcurrentSessionDenialWithoutOnboardingFallback(t *testing.T) {
	requireRuntimeModbusPort(t)

	socketServer := newRuntimeAuthServer(t, runtimeAuthServerBehavior{
		ConnectError: "invalid_credential",
	})
	defer socketServer.Close()

	binaryPath, configPath, stateDir := prepareRuntimeStartup(t, socketServer.URL())
	installCredentialFixture(t, stateDir, "valid/credential.json")

	err, stdout, stderr := runRuntimeCommand(t, 8*time.Second, binaryPath, "--config", configPath)
	if err == nil {
		t.Fatalf("expected concurrent-session denial to fail runtime\nstdout:\n%s\nstderr:\n%s", stdout, stderr)
	}
	if !strings.Contains(stderr, "invalid_credential") {
		t.Fatalf("expected stderr to surface invalid_credential rejection, got:\n%s", stderr)
	}
	if strings.Contains(strings.ToLower(stderr), "onboarding") {
		t.Fatalf("concurrent-session denial must not fallback to onboarding semantics, got stderr:\n%s", stderr)
	}
}

func TestT026RuntimeStartupHandlesBlockedWithoutRetryOrOnboardingFallback(t *testing.T) {
	stateDir := t.TempDir()
	issuedAt := time.Date(2026, 4, 19, 8, 20, 0, 0, time.UTC)
	if err := state.NewCredentialStore(stateDir).Save(state.Credential{
		EdgeID:           "507f1f77bcf86cd799439011",
		CredentialSecret: "persistent-secret-fixture-valid",
		Version:          3,
		IssuedAt:         issuedAt,
		Source:           "register",
		InstalledAt:      issuedAt.Add(time.Minute),
	}); err != nil {
		t.Fatalf("write credential.json: %v", err)
	}

	transport := newT026BlockedTransport()
	cfg := config.Config{
		Runtime: config.RuntimeConfig{
			EdgeID:       "507f1f77bcf86cd799439011",
			StateDir:     stateDir,
			InstanceName: "blocked-smoke-edge",
		},
		Cloud: config.CloudConfig{
			URL:              "https://cloud.example.test",
			Namespace:        "/edge",
			ConnectTimeoutMs: 10000,
			Reconnect: config.ReconnectConfig{
				BaseDelayMs: 1000,
				MaxDelayMs:  30000,
				MaxAttempts: 0,
			},
		},
		Batch: config.BatchConfig{
			IntervalMs:  25,
			MaxReadings: 1,
		},
		Sources: []config.PollingSourceDefinition{
			{
				SourceID:       "smoke-source",
				AdapterKind:    "smoke_noop",
				Enabled:        true,
				PollIntervalMs: 100,
				Devices: []config.LocalDeviceDefinition{
					{
						DeviceID: "pump-1",
						Metrics: []config.MetricDefinition{
							{
								Metric:    "pressure",
								ValueType: "number",
								Mapping:   map[string]any{"registerType": "input", "address": 0},
							},
						},
					},
				},
			},
		},
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	process, err := runtimeapp.NewWithSourceFactoriesForTest(ctx, cfg, transport, source.FactoryRegistry{
		"smoke_noop": func() (source.Adapter, error) { return t026NoopAdapter{}, nil },
	})
	if err != nil {
		t.Fatalf("construct runtime app: %v", err)
	}

	runErr := runT021Runner(ctx, process)
	attempt := transport.WaitForAttempt(t, 2*time.Second)
	if attempt.CredentialSecret != "persistent-secret-fixture-valid" {
		t.Fatalf("expected blocked handshake to use installed credential, got %q", attempt.CredentialSecret)
	}
	transport.AssertNoAttempt(t, 300*time.Millisecond)

	err = waitT021RunnerExit(runErr, 2*time.Second)
	if err == nil {
		t.Fatal("expected blocked connect_error to fail runtime")
	}
	if !strings.Contains(err.Error(), "blocked") {
		t.Fatalf("expected runtime error to surface blocked rejection, got: %v", err)
	}
	if strings.Contains(strings.ToLower(err.Error()), "onboarding") {
		t.Fatalf("blocked handling must not fallback to onboarding semantics, got: %v", err)
	}

	snapshot := process.Runner.StateSnapshot()
	if snapshot.CredentialStatus != state.CredentialStatusBlocked {
		t.Fatalf("expected credentialStatus=blocked after blocked connect_error, got %q", snapshot.CredentialStatus)
	}
	if snapshot.RetryEligible {
		t.Fatalf("expected blocked connect_error to suppress retry, got %+v", snapshot)
	}
	if snapshot.Trusted || snapshot.Connected {
		t.Fatalf("expected blocked connect_error to stop trusted state, got %+v", snapshot)
	}
}

type t026NoopAdapter struct{}

func (t026NoopAdapter) ApplyDefinition(source.Definition, source.Sink) error { return nil }
func (t026NoopAdapter) Close() error                                         { return nil }

type t026BlockedTransport struct {
	mu                sync.Mutex
	attempts          chan cloud.HandshakeAuth
	connectErrHandler func(error)
}

func newT026BlockedTransport() *t026BlockedTransport {
	return &t026BlockedTransport{
		attempts: make(chan cloud.HandshakeAuth, 8),
	}
}

func (t *t026BlockedTransport) Connect(_ context.Context, auth cloud.HandshakeAuth) error {
	t.attempts <- auth

	t.mu.Lock()
	handler := t.connectErrHandler
	t.mu.Unlock()
	if handler != nil {
		handler(cloud.ConnectError{Code: cloud.ConnectErrorBlocked})
	}

	return cloud.ConnectError{Code: cloud.ConnectErrorBlocked}
}

func (t *t026BlockedTransport) Disconnect() error { return nil }

func (t *t026BlockedTransport) Emit(string, any) error { return nil }

func (t *t026BlockedTransport) OnEdgeDisconnect(func(any)) {}

func (t *t026BlockedTransport) OnExecuteCommand(func(any)) {}

func (t *t026BlockedTransport) OnConnect(func() error) {}

func (t *t026BlockedTransport) OnConnectError(handler func(error)) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.connectErrHandler = handler
}

func (t *t026BlockedTransport) OnDisconnect(func(string)) {}

var _ cloud.Transport = (*t026BlockedTransport)(nil)

func (t *t026BlockedTransport) WaitForAttempt(tb testing.TB, timeout time.Duration) cloud.HandshakeAuth {
	tb.Helper()

	select {
	case attempt := <-t.attempts:
		return attempt
	case <-time.After(timeout):
		tb.Fatal("timed out waiting for runtime handshake attempt")
		return cloud.HandshakeAuth{}
	}
}

func (t *t026BlockedTransport) AssertNoAttempt(tb testing.TB, timeout time.Duration) {
	tb.Helper()

	select {
	case attempt := <-t.attempts:
		tb.Fatalf("expected no runtime handshake attempt, got %+v", attempt)
	case <-time.After(timeout):
	}
}

func TestT011RuntimeEntrypointRejectsLegacyOnboardingFlag(t *testing.T) {
	binaryPath, configPath, stateDir := prepareRuntimeStartup(t, "http://127.0.0.1:65535")
	installCredentialFixture(t, stateDir, "valid/credential.json")

	err, stdout, stderr := runRuntimeCommand(
		t,
		8*time.Second,
		binaryPath,
		"--config",
		configPath,
		"--onboarding-package",
		runtimeFixturePath(t, "onboarding-package.json"),
	)
	if err == nil {
		t.Fatalf("expected runtime entrypoint to reject legacy --onboarding-package flag\nstdout:\n%s\nstderr:\n%s", stdout, stderr)
	}
	if !strings.Contains(stderr, "flag provided but not defined: -onboarding-package") {
		t.Fatalf("expected explicit unknown-flag error for legacy onboarding path, got stderr:\n%s", stderr)
	}
}

func prepareRuntimeStartup(t *testing.T, cloudURL string) (binaryPath string, configPath string, stateDir string) {
	t.Helper()

	stateDir = t.TempDir()
	t.Setenv("RUNTIME_STATE_DIR", stateDir)
	if strings.TrimSpace(os.Getenv("EDGE_MODBUS_PORT")) == "" {
		t.Setenv("EDGE_MODBUS_PORT", defaultRuntimeModbusPort)
	}
	configPath = writeRuntimeConfigFixture(t, cloudURL)
	binaryPath = buildRuntimeBinary(t)

	return binaryPath, configPath, stateDir
}

const defaultRuntimeModbusPort = "COM7"

func requireRuntimeModbusPort(t *testing.T) {
	t.Helper()

	port := strings.TrimSpace(os.Getenv("EDGE_MODBUS_PORT"))
	if port == "" {
		port = defaultRuntimeModbusPort
	}
	if !serialPortCanOpen(port) {
		t.Skipf("runtime production binary smoke requires available Modbus serial port %s; set EDGE_MODBUS_PORT to run with another port", port)
	}
	t.Setenv("EDGE_MODBUS_PORT", port)
}

func serialPortCanOpen(port string) bool {
	if strings.TrimSpace(port) == "" {
		return false
	}

	path := port
	if goruntime.GOOS == "windows" && !strings.HasPrefix(strings.ToUpper(path), `\\.\`) {
		path = `\\.\` + path
	}

	handle, err := os.OpenFile(path, os.O_RDWR, 0)
	if err != nil {
		return false
	}
	_ = handle.Close()

	return true
}

func installCredentialFixture(t *testing.T, stateDir string, fixtureName string) {
	t.Helper()

	credentialBytes, err := os.ReadFile(runtimeFixturePath(t, fixtureName))
	if err != nil {
		t.Fatalf("read credential fixture %q: %v", fixtureName, err)
	}
	if err := os.WriteFile(filepath.Join(stateDir, "credential.json"), credentialBytes, 0o600); err != nil {
		t.Fatalf("write credential fixture %q to state dir: %v", fixtureName, err)
	}
}

func runRuntimeCommand(t *testing.T, timeout time.Duration, binaryPath string, args ...string) (error, string, string) {
	t.Helper()

	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, binaryPath, args...)
	cmd.Env = os.Environ()

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()
	if ctx.Err() == context.DeadlineExceeded {
		return fmt.Errorf("runtime command timed out after %s: %w", timeout, ctx.Err()), stdout.String(), stderr.String()
	}
	return err, stdout.String(), stderr.String()
}
