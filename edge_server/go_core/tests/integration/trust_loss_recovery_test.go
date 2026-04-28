package integration

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"edge_server/go_core/internal/cloud"
	"edge_server/go_core/internal/config"
	"edge_server/go_core/internal/runtimeapp"
	"edge_server/go_core/internal/source"
	"edge_server/go_core/internal/state"

	"github.com/gorilla/websocket"
	"github.com/simonvetter/modbus"
)

const (
	t021EdgeID        = "507f1f77bcf86cd799439011"
	t021InitialSecret = "persistent-secret-before-rotation"
	t021FreshSecret   = "persistent-secret-after-rotation"
)

func TestT021CredentialRotationStopsTrustedTelemetryAndRejectsOldCredential(t *testing.T) {
	t.Setenv("CLOUD_SOCKET_URL", "https://cloud.example.test")

	stateDir := t.TempDir()
	writeT021Credential(t, stateDir, t021InitialSecret, 3, "register")

	cfg := loadT021RuntimeConfig(t, stateDir)
	modbusClient := newIntegrationModbusClient(map[integrationModbusReadKey]uint16{
		{address: 0, registerType: modbus.INPUT_REGISTER}: 125,
	}, nil)
	restoreModbus := source.OverrideModbusSerialClientFactoryForTest(
		func(source.ModbusSerialConnection) (source.ModbusRegisterClient, error) {
			return modbusClient, nil
		},
		func() time.Time {
			return time.UnixMilli(1710000000123)
		},
	)
	defer restoreModbus()

	server := newT021CredentialRotationSocketIOServer(t, t021EdgeID, t021InitialSecret, t021FreshSecret)
	defer server.Close()

	process, runCtx, runErr, cancel := startT021RuntimeProcess(t, cfg, server.URL())
	defer cancel()

	initialAttempt := server.WaitForAttempt(t, 2*time.Second)
	assertT021PersistentAttempt(t, initialAttempt, t021InitialSecret)

	waitForTrustedSession(t, process, 2*time.Second)
	assertCanonicalTelemetryPayloadWithoutLocalFields(t, server.WaitForPayload(t, 2*time.Second), []map[string]any{
		{"deviceId": "pump-1", "metric": "pressure", "value": 31.25},
	})

	server.RotateAfterPayload(t, 2*time.Second)
	server.WaitForRotationDisconnect(t, 2*time.Second)
	waitForTelemetryStop(t, process, 2*time.Second)

	server.AssertNoPayload(t, 250*time.Millisecond)
	server.AssertNoAttempt(t, 250*time.Millisecond)

	if err := waitT021RunnerExit(runErr, 2*time.Second); err == nil {
		t.Fatal("expected rotated runtime to stop because current credential.json is superseded")
	} else if !strings.Contains(err.Error(), "credential_rotated") || strings.Contains(strings.ToLower(err.Error()), "onboarding") {
		t.Fatalf("expected credential_rotated stop without onboarding fallback, got %v", err)
	}

	writeT021Credential(t, stateDir, t021InitialSecret, 3, "register")
	if err := process.ReloadInstalledCredential(); err != nil {
		t.Fatalf("reload old credential from credential.json: %v", err)
	}
	oldRunErr := runT021Runner(runCtx, process)
	oldAttempt := server.WaitForAttempt(t, 2*time.Second)
	assertT021PersistentAttempt(t, oldAttempt, t021InitialSecret)
	if err := waitT021RunnerExit(oldRunErr, 2*time.Second); err == nil {
		t.Fatal("expected old credential to be rejected after rotation")
	} else if !strings.Contains(err.Error(), "invalid_credential") || strings.Contains(strings.ToLower(err.Error()), "onboarding") {
		t.Fatalf("expected old credential rejection without onboarding fallback, got %v", err)
	}
	if snapshot := process.Runner.StateSnapshot(); snapshot.Trusted || snapshot.Connected {
		t.Fatalf("old credential must not recover a trusted session, got %+v", snapshot)
	}

	writeT021Credential(t, stateDir, t021FreshSecret, 4, "rotate")
	if err := process.ReloadInstalledCredential(); err != nil {
		t.Fatalf("reload fresh credential from credential.json: %v", err)
	}
	modbusClient.ReplaceValues(map[integrationModbusReadKey]uint16{
		{address: 0, registerType: modbus.INPUT_REGISTER}: 135,
	})
	recoveredRunErr := runT021Runner(runCtx, process)

	recoveryAttempt := server.WaitForAttempt(t, 2*time.Second)
	assertT021PersistentAttempt(t, recoveryAttempt, t021FreshSecret)
	waitForTrustedSession(t, process, 2*time.Second)

	assertCanonicalTelemetryPayloadWithoutLocalFields(t, server.WaitForPayload(t, 2*time.Second), []map[string]any{
		{"deviceId": "pump-1", "metric": "pressure", "value": 33.75},
	})

	cancel()
	if err := waitT021RunnerExit(recoveredRunErr, 2*time.Second); err != nil {
		t.Fatalf("expected clean shutdown after replaced credential recovery, got %v", err)
	}
}

type t021CredentialRotationSocketIOServer struct {
	t *testing.T

	edgeID        string
	initialSecret string
	freshSecret   string

	mu               sync.Mutex
	rotationIssued   bool
	authEvents       chan runtimeHandshakeAttempt
	telemetry        chan string
	rotationDetached chan struct{}
	rotateRequests   chan struct{}

	server *httptest.Server
}

func newT021CredentialRotationSocketIOServer(
	t *testing.T,
	edgeID string,
	initialSecret string,
	freshSecret string,
) *t021CredentialRotationSocketIOServer {
	t.Helper()

	srv := &t021CredentialRotationSocketIOServer{
		t:                t,
		edgeID:           edgeID,
		initialSecret:    initialSecret,
		freshSecret:      freshSecret,
		authEvents:       make(chan runtimeHandshakeAttempt, 8),
		telemetry:        make(chan string, 8),
		rotationDetached: make(chan struct{}, 1),
		rotateRequests:   make(chan struct{}, 1),
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

		if err := conn.WriteMessage(websocket.TextMessage, []byte(`0{"sid":"t021-sid","upgrades":[],"pingInterval":25000,"pingTimeout":20000,"maxPayload":1000000}`)); err != nil {
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
		srv.authEvents <- attempt

		switch {
		case attempt.CredentialSecret == srv.initialSecret && srv.markRotationIssued():
			if err := conn.WriteMessage(websocket.TextMessage, []byte(`40/edge,{"sid":"edge-before-rotation"}`)); err != nil {
				return
			}
			srv.readUntilFirstTelemetryThenRotate(conn)
		case attempt.CredentialSecret == srv.initialSecret:
			connectErrorMessage := fmt.Sprintf(`44/edge,{"message":%q}`, string(cloud.ConnectErrorInvalidCredential))
			_ = conn.WriteMessage(websocket.TextMessage, []byte(connectErrorMessage))
			time.Sleep(25 * time.Millisecond)
		case attempt.CredentialSecret == srv.freshSecret:
			if err := conn.WriteMessage(websocket.TextMessage, []byte(`40/edge,{"sid":"edge-after-rotation"}`)); err != nil {
				return
			}
			srv.readTelemetryUntilClose(conn)
		default:
			connectErrorMessage := fmt.Sprintf(`44/edge,{"message":%q}`, string(cloud.ConnectErrorInvalidCredential))
			_ = conn.WriteMessage(websocket.TextMessage, []byte(connectErrorMessage))
			t.Errorf("unexpected credential secret in handshake: %q", attempt.CredentialSecret)
		}
	})

	srv.server = httptest.NewServer(handler)
	return srv
}

func (s *t021CredentialRotationSocketIOServer) Close() {
	if s.server != nil {
		s.server.Close()
	}
}

func (s *t021CredentialRotationSocketIOServer) URL() string {
	return s.server.URL
}

func (s *t021CredentialRotationSocketIOServer) WaitForAttempt(t *testing.T, timeout time.Duration) runtimeHandshakeAttempt {
	t.Helper()

	select {
	case attempt := <-s.authEvents:
		return attempt
	case <-time.After(timeout):
		t.Fatal("timed out waiting for runtime handshake attempt")
		return runtimeHandshakeAttempt{}
	}
}

func (s *t021CredentialRotationSocketIOServer) AssertNoAttempt(t *testing.T, timeout time.Duration) {
	t.Helper()

	select {
	case attempt := <-s.authEvents:
		t.Fatalf("expected no runtime handshake attempt, got %+v", attempt)
	case <-time.After(timeout):
	}
}

func (s *t021CredentialRotationSocketIOServer) WaitForPayload(t *testing.T, timeout time.Duration) string {
	t.Helper()

	select {
	case payload := <-s.telemetry:
		return payload
	case <-time.After(timeout):
		t.Fatal("timed out waiting for telemetry payload")
		return ""
	}
}

func (s *t021CredentialRotationSocketIOServer) AssertNoPayload(t *testing.T, timeout time.Duration) {
	t.Helper()

	select {
	case payload := <-s.telemetry:
		t.Fatalf("expected no telemetry payload, got %s", payload)
	case <-time.After(timeout):
	}
}

func (s *t021CredentialRotationSocketIOServer) WaitForRotationDisconnect(t *testing.T, timeout time.Duration) {
	t.Helper()

	select {
	case <-s.rotationDetached:
	case <-time.After(timeout):
		t.Fatal("timed out waiting for runtime to detach the rotated trusted session")
	}
}

func (s *t021CredentialRotationSocketIOServer) RotateAfterPayload(t *testing.T, timeout time.Duration) {
	t.Helper()

	select {
	case s.rotateRequests <- struct{}{}:
	case <-time.After(timeout):
		t.Fatal("timed out requesting credential rotation")
	}
}

func (s *t021CredentialRotationSocketIOServer) markRotationIssued() bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.rotationIssued {
		return false
	}
	s.rotationIssued = true
	return true
}

func (s *t021CredentialRotationSocketIOServer) readUntilFirstTelemetryThenRotate(conn *websocket.Conn) {
	for {
		messageType, payload, err := conn.ReadMessage()
		if err != nil {
			return
		}
		if messageType != websocket.TextMessage || !isNamespaceEventForTest(string(payload), "/edge") {
			continue
		}

		eventName, eventPayload, err := parseNamespaceEventForTest(string(payload), "/edge")
		if err != nil {
			s.t.Errorf("parse namespace event: %v", err)
			return
		}
		if eventName != "telemetry" {
			continue
		}

		encoded, err := json.Marshal(eventPayload)
		if err != nil {
			s.t.Errorf("encode telemetry payload: %v", err)
			return
		}
		s.telemetry <- string(encoded)

		select {
		case <-s.rotateRequests:
		case <-time.After(2 * time.Second):
			s.t.Errorf("timed out waiting for credential rotation request")
			return
		}

		disconnectMessage := fmt.Sprintf(
			`42/edge,["edge_disconnect",{"edgeId":%q,"reason":"credential_rotated"}]`,
			s.edgeID,
		)
		if err := conn.WriteMessage(websocket.TextMessage, []byte(disconnectMessage)); err != nil {
			s.t.Errorf("write credential_rotated disconnect: %v", err)
			return
		}
		s.waitForClientNamespaceDisconnect(conn)
		return
	}
}

func (s *t021CredentialRotationSocketIOServer) waitForClientNamespaceDisconnect(conn *websocket.Conn) {
	_ = conn.SetReadDeadline(time.Now().Add(1500 * time.Millisecond))
	for {
		messageType, payload, err := conn.ReadMessage()
		if err != nil {
			return
		}
		if messageType == websocket.TextMessage && strings.HasPrefix(string(payload), "41/edge") {
			select {
			case s.rotationDetached <- struct{}{}:
			default:
			}
			return
		}
		if messageType == websocket.TextMessage && isNamespaceEventForTest(string(payload), "/edge") {
			eventName, eventPayload, err := parseNamespaceEventForTest(string(payload), "/edge")
			if err != nil {
				s.t.Errorf("parse post-rotation namespace event: %v", err)
				return
			}
			if eventName == "telemetry" {
				encoded, err := json.Marshal(eventPayload)
				if err != nil {
					s.t.Errorf("encode post-rotation telemetry payload: %v", err)
					return
				}
				s.telemetry <- string(encoded)
			}
		}
	}
}

func (s *t021CredentialRotationSocketIOServer) readTelemetryUntilClose(conn *websocket.Conn) {
	for {
		messageType, payload, err := conn.ReadMessage()
		if err != nil {
			return
		}
		if messageType != websocket.TextMessage || !isNamespaceEventForTest(string(payload), "/edge") {
			continue
		}

		eventName, eventPayload, err := parseNamespaceEventForTest(string(payload), "/edge")
		if err != nil {
			s.t.Errorf("parse namespace event: %v", err)
			return
		}
		if eventName != "telemetry" {
			continue
		}

		encoded, err := json.Marshal(eventPayload)
		if err != nil {
			s.t.Errorf("encode telemetry payload: %v", err)
			return
		}
		s.telemetry <- string(encoded)
	}
}

func startT021RuntimeProcess(
	t *testing.T,
	cfg config.Config,
	cloudURL string,
) (*runtimeapp.Process, context.Context, chan error, context.CancelFunc) {
	t.Helper()

	transport, err := cloud.NewWebSocketTransport(cloud.WebSocketTransportConfig{
		CloudURL:  cloudURL,
		Namespace: cfg.Cloud.Namespace,
	})
	if err != nil {
		t.Fatalf("create websocket transport: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	process, err := runtimeapp.New(ctx, cfg, transport)
	if err != nil {
		cancel()
		t.Fatalf("construct runtime app: %v", err)
	}

	runErr := runT021Runner(ctx, process)

	return process, ctx, runErr, cancel
}

func loadT021RuntimeConfig(t *testing.T, stateDir string) config.Config {
	t.Helper()

	t.Setenv("RUNTIME_STATE_DIR", stateDir)
	configPath := writeT021ModbusRuntimeConfig(t, stateDir)
	cfg, err := config.LoadFromFile(configPath)
	if err != nil {
		t.Fatalf("load modbus runtime config: %v", err)
	}
	return cfg
}

func writeT021ModbusRuntimeConfig(t *testing.T, stateDir string) string {
	t.Helper()

	configPath := filepath.Join(t.TempDir(), "edge-runtime.yaml")
	body := fmt.Sprintf(`runtime:
  edgeId: %s
  stateDir: "%s"
  instanceName: rotation-modbus-edge

cloud:
  url: ${CLOUD_SOCKET_URL}
  namespace: /edge
  connectTimeoutMs: 10000
  reconnect:
    baseDelayMs: 1000
    maxDelayMs: 30000
    maxAttempts: 0

batch:
  intervalMs: 25
  maxReadings: 1

sources:
  - sourceId: rtu-rotation
    adapterKind: modbus_rtu
    enabled: true
    pollIntervalMs: 100
    connection:
      port: "COM_FAKE_ROTATE"
      baudRate: 9600
      dataBits: 8
      parity: none
      stopBits: 1
      slaveId: 1
      timeoutMs: 100
    devices:
      - deviceId: pump-1
        address:
          node: 1
        metrics:
          - metric: pressure
            valueType: number
            mapping:
              registerType: input
              address: 0
              scale: 0.25

logging:
  level: info
`, t021EdgeID, strings.ReplaceAll(stateDir, `\`, `/`))

	if err := os.WriteFile(configPath, []byte(body), 0o600); err != nil {
		t.Fatalf("write T021 modbus runtime config: %v", err)
	}
	return configPath
}

func writeT021Credential(t *testing.T, stateDir string, secret string, version int, sourceName string) {
	t.Helper()

	issuedAt := time.Date(2026, 4, 19, 8, 20, 0, 0, time.UTC).Add(time.Duration(version) * time.Minute)
	if err := state.NewCredentialStore(stateDir).Save(state.Credential{
		EdgeID:           t021EdgeID,
		CredentialSecret: secret,
		Version:          version,
		IssuedAt:         issuedAt,
		Source:           sourceName,
		InstalledAt:      issuedAt.Add(time.Minute),
	}); err != nil {
		t.Fatalf("write credential.json: %v", err)
	}
}

func runT021Runner(ctx context.Context, process *runtimeapp.Process) chan error {
	runErr := make(chan error, 1)
	go func() {
		runErr <- process.Runner.Run(ctx)
	}()
	return runErr
}

func assertT021PersistentAttempt(t *testing.T, attempt runtimeHandshakeAttempt, wantSecret string) {
	t.Helper()

	if attempt.EdgeID != t021EdgeID {
		t.Fatalf("expected edgeId %q, got %q", t021EdgeID, attempt.EdgeID)
	}
	if attempt.CredentialSecret != wantSecret {
		t.Fatalf("expected credential secret %q, got %q", wantSecret, attempt.CredentialSecret)
	}
	if _, hasCredentialMode := attempt.AuthPayload["credentialMode"]; hasCredentialMode {
		t.Fatalf("active /edge handshake must not include legacy credentialMode, payload=%v", attempt.AuthPayload)
	}
}

func waitT021RunnerExit(runErr <-chan error, timeout time.Duration) error {
	select {
	case err := <-runErr:
		return err
	case <-time.After(timeout):
		return fmt.Errorf("timed out waiting for runner exit")
	}
}
