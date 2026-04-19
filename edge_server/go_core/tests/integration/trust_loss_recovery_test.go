package integration

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"edge_server/go_core/internal/cloud"
	"edge_server/go_core/internal/config"
	"edge_server/go_core/internal/runtime"
	"edge_server/go_core/internal/runtimeapp"
	"edge_server/go_core/internal/source"

	"github.com/gorilla/websocket"
)

type trustLossScenario struct {
	name                   string
	disconnectReason       *cloud.DisconnectReason
	persistentConnectError *cloud.ConnectErrorCode
	expectPersistentRetry  bool
}

func TestReproTaskT028TrustLossAndDisconnectCoverage(t *testing.T) {
	requireLegacyOnboardingReference(t)
	t.Setenv("CLOUD_SOCKET_URL", "wss://cloud.example.test")
	t.Setenv("EDGE_ONBOARDING_SECRET", "trust-loss-suite-secret")

	scenarios := []trustLossScenario{
		{
			name:             "revoke_stops_telemetry_and_requires_future_auth_path",
			disconnectReason: disconnectReasonPointer(cloud.DisconnectReasonTrustRevoked),
		},
		{
			name:             "blocked_stops_telemetry_and_requires_future_auth_path",
			disconnectReason: disconnectReasonPointer(cloud.DisconnectReasonBlocked),
		},
		{
			name:                   "forced_disconnect_stops_and_triggers_persistent_retry_path",
			disconnectReason:       disconnectReasonPointer(cloud.DisconnectReasonForced),
			persistentConnectError: connectErrorPointer(cloud.ConnectErrorPersistentCredentialRevoked),
			expectPersistentRetry:  true,
		},
		{
			name:                   "ordinary_socket_disconnect_stops_and_triggers_persistent_retry_path",
			persistentConnectError: connectErrorPointer(cloud.ConnectErrorPersistentCredentialRevoked),
			expectPersistentRetry:  true,
		},
		{
			name:                   "rejected_reconnect_stops_and_remains_untrusted",
			persistentConnectError: connectErrorPointer(cloud.ConnectErrorPersistentCredentialRevoked),
			expectPersistentRetry:  true,
		},
	}

	for _, scenario := range scenarios {
		scenario := scenario
		t.Run(scenario.name, func(t *testing.T) {
			cfg, err := config.LoadFromFile(runtimeFixturePath(t, "config.yaml"))
			if err != nil {
				t.Fatalf("load runtime config fixture: %v", err)
			}
			cfg.Batch.IntervalMs = 40
			cfg.Batch.MaxReadings = 1

			server := newTrustLossScenarioSocketIOServer(t, scenario)
			defer server.Close()

			process, control, runErr, cancel := startTrustLossProcess(t, cfg, server.URL(), runtimeFixturePath(t, "onboarding-package.json"))
			defer cancel()

			firstAttempt := server.WaitForAttempt(t, 2*time.Second)
			if firstAttempt.CredentialMode != cloud.CredentialModeOnboarding {
				t.Fatalf("expected first attempt credentialMode=onboarding, got %q", firstAttempt.CredentialMode)
			}

			waitForTrustedSession(t, process, 2*time.Second)

			emitTelemetryReading(t, control, 7001, 18.75)
			assertCanonicalTelemetryPayload(t, server.WaitForPayload(t, time.Second), []map[string]any{
				{"deviceId": "pump-1", "metric": "pressure", "value": 18.75, "ts": 7001},
			})

			waitForTelemetryStop(t, process, 2*time.Second)

			emitTelemetryReading(t, control, 7002, 19.25)
			server.AssertNoPayload(t, 200*time.Millisecond)

			if scenario.expectPersistentRetry {
				secondAttempt := server.WaitForAttempt(t, 2*time.Second)
				if secondAttempt.CredentialMode != cloud.CredentialModePersistent {
					t.Fatalf("expected reconnect attempt credentialMode=persistent, got %q", secondAttempt.CredentialMode)
				}

				server.AllowPersistentConnect()
				err := waitRunnerExit(runErr, 2*time.Second)
				if err == nil {
					t.Fatal("expected runner to fail fast after rejected reconnect")
				}
				if process.Runner.StateSnapshot().LastReason == nil || *process.Runner.StateSnapshot().LastReason != string(*scenario.persistentConnectError) {
					t.Fatalf("expected lastReason=%q after rejected reconnect, got %+v", *scenario.persistentConnectError, process.Runner.StateSnapshot())
				}
				return
			}

			err = waitRunnerExit(runErr, 2*time.Second)
			if err == nil {
				t.Fatal("expected runner to fail fast when no valid auth path remains")
			}
		})
	}
}

func TestReproTaskT028FreshReOnboardingRecoveryRequiresFreshOperatorInput(t *testing.T) {
	requireLegacyOnboardingReference(t)
	t.Setenv("CLOUD_SOCKET_URL", "wss://cloud.example.test")

	cfg, err := config.LoadFromFile(runtimeFixturePath(t, "config.yaml"))
	if err != nil {
		t.Fatalf("load runtime config fixture: %v", err)
	}
	cfg.Batch.IntervalMs = 40
	cfg.Batch.MaxReadings = 1

	const (
		edgeID          = "507f1f77bcf86cd799439011"
		initialSecret   = "onboarding-initial-secret"
		freshSecret     = "onboarding-fresh-secret"
		revokedReason   = "trust_revoked"
		tempPackageName = "onboarding.json"
	)

	onboardingPath := filepath.Join(t.TempDir(), tempPackageName)
	writeOnboardingPackage(t, onboardingPath, edgeID, initialSecret)

	server := newFreshReOnboardingSocketIOServer(t, edgeID, initialSecret, freshSecret)
	defer server.Close()

	process, control, runErr, cancel := startTrustLossProcess(t, cfg, server.URL(), onboardingPath)
	defer cancel()

	firstAttempt := server.WaitForAttempt(t, 2*time.Second)
	if firstAttempt.CredentialMode != cloud.CredentialModeOnboarding {
		t.Fatalf("expected first attempt credentialMode=onboarding, got %q", firstAttempt.CredentialMode)
	}
	if firstAttempt.CredentialSecret != initialSecret {
		t.Fatalf("expected first onboarding secret %q, got %q", initialSecret, firstAttempt.CredentialSecret)
	}

	waitForTrustedSession(t, process, 2*time.Second)
	emitTelemetryReading(t, control, 8001, 41.5)
	assertCanonicalTelemetryPayload(t, server.WaitForPayload(t, time.Second), []map[string]any{
		{"deviceId": "pump-1", "metric": "pressure", "value": 41.5, "ts": 8001},
	})

	waitForTelemetryStop(t, process, 2*time.Second)
	snapshotAfterRevoke := process.Runner.StateSnapshot()
	if snapshotAfterRevoke.LastReason == nil || *snapshotAfterRevoke.LastReason != revokedReason {
		t.Fatalf("expected lastReason=%q after trust revoke, got %+v", revokedReason, snapshotAfterRevoke)
	}

	select {
	case err := <-runErr:
		t.Fatalf("expected runner to wait for fresh onboarding input after trust loss, got terminal error: %v", err)
	default:
	}

	emitTelemetryReading(t, control, 8002, 42.0)
	server.AssertNoPayload(t, 200*time.Millisecond)

	if err := process.Bootstrap.Bootstrap(runtime.BootstrapInput{OnboardingPackagePath: onboardingPath}); err == nil {
		t.Fatal("expected stale onboarding package to be rejected after trust loss")
	}
	server.AssertNoAttempt(t, 200*time.Millisecond)

	writeOnboardingPackage(t, onboardingPath, edgeID, freshSecret)
	if err := process.Bootstrap.Bootstrap(runtime.BootstrapInput{OnboardingPackagePath: onboardingPath}); err != nil {
		t.Fatalf("supply fresh onboarding package: %v", err)
	}

	recoveryAttempt := server.WaitForAttempt(t, 2*time.Second)
	if recoveryAttempt.CredentialMode != cloud.CredentialModeOnboarding {
		t.Fatalf("expected recovery attempt credentialMode=onboarding, got %q", recoveryAttempt.CredentialMode)
	}
	if recoveryAttempt.CredentialSecret != freshSecret {
		t.Fatalf("expected recovery onboarding secret %q, got %q", freshSecret, recoveryAttempt.CredentialSecret)
	}

	waitForTrustedSession(t, process, 2*time.Second)
	emitTelemetryReading(t, control, 8003, 43.25)
	assertCanonicalTelemetryPayload(t, server.WaitForPayload(t, time.Second), []map[string]any{
		{"deviceId": "pump-1", "metric": "pressure", "value": 43.25, "ts": 8003},
	})

	if control.ApplyCount() != 1 {
		t.Fatalf("expected stable source definition to be preserved during fresh re-onboarding, got apply count %d", control.ApplyCount())
	}

	cancel()
	if err := waitRunnerExit(runErr, 2*time.Second); err != nil {
		t.Fatalf("expected clean runner shutdown after recovery, got %v", err)
	}
}

type trustLossScenarioSocketIOServer struct {
	t *testing.T

	scenario trustLossScenario

	server          *httptest.Server
	authEvents      chan cloud.HandshakeAuth
	telemetry       chan string
	allowPersistent chan struct{}
}

func newTrustLossScenarioSocketIOServer(t *testing.T, scenario trustLossScenario) *trustLossScenarioSocketIOServer {
	t.Helper()

	srv := &trustLossScenarioSocketIOServer{
		t:               t,
		scenario:        scenario,
		authEvents:      make(chan cloud.HandshakeAuth, 8),
		telemetry:       make(chan string, 8),
		allowPersistent: make(chan struct{}, 1),
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
		srv.authEvents <- auth

		switch auth.CredentialMode {
		case cloud.CredentialModeOnboarding:
			if err := conn.WriteMessage(websocket.TextMessage, []byte(`40/edge,{"sid":"edge-socket-1"}`)); err != nil {
				return
			}

			activationMessage := fmt.Sprintf(
				`42/edge,["edge_activation",{"edgeId":%q,"lifecycleState":"Active","persistentCredential":{"version":1,"secret":"persistent-from-activation","issuedAt":"2026-04-07T10:00:00Z"}}]`,
				auth.EdgeID,
			)
			if err := conn.WriteMessage(websocket.TextMessage, []byte(activationMessage)); err != nil {
				return
			}

			if err := readTelemetryUntilDisconnect(t, conn, srv.telemetry, func() {
				if srv.scenario.disconnectReason != nil {
					disconnectMessage := fmt.Sprintf(
						`42/edge,["edge_disconnect",{"edgeId":%q,"reason":%q}]`,
						auth.EdgeID,
						string(*srv.scenario.disconnectReason),
					)
					if writeErr := conn.WriteMessage(websocket.TextMessage, []byte(disconnectMessage)); writeErr != nil {
						t.Errorf("write edge_disconnect message: %v", writeErr)
						return
					}
					_ = conn.WriteMessage(websocket.TextMessage, []byte(`41/edge,`))
					return
				}

				_ = conn.Close()
			}); err != nil {
				t.Errorf("capture onboarding telemetry: %v", err)
			}
		case cloud.CredentialModePersistent:
			<-srv.allowPersistent

			if srv.scenario.persistentConnectError != nil {
				connectErrorMessage := fmt.Sprintf(`44/edge,{"message":%q}`, string(*srv.scenario.persistentConnectError))
				if err := conn.WriteMessage(websocket.TextMessage, []byte(connectErrorMessage)); err != nil {
					return
				}
				time.Sleep(25 * time.Millisecond)
				return
			}

			if err := conn.WriteMessage(websocket.TextMessage, []byte(`40/edge,{"sid":"edge-socket-2"}`)); err != nil {
				return
			}

			if err := readTelemetryUntilDisconnect(t, conn, srv.telemetry, nil); err != nil {
				t.Errorf("capture persistent telemetry: %v", err)
			}
		default:
			t.Errorf("unexpected credential mode %q", auth.CredentialMode)
		}
	})

	srv.server = httptest.NewServer(handler)
	return srv
}

func (s *trustLossScenarioSocketIOServer) Close() {
	if s.server != nil {
		s.server.Close()
	}
}

func (s *trustLossScenarioSocketIOServer) URL() string {
	return s.server.URL
}

func (s *trustLossScenarioSocketIOServer) WaitForAttempt(t *testing.T, timeout time.Duration) cloud.HandshakeAuth {
	t.Helper()

	select {
	case auth := <-s.authEvents:
		return auth
	case <-time.After(timeout):
		t.Fatal("timed out waiting for runtime handshake attempt")
		return cloud.HandshakeAuth{}
	}
}

func (s *trustLossScenarioSocketIOServer) AllowPersistentConnect() {
	select {
	case s.allowPersistent <- struct{}{}:
	default:
	}
}

func (s *trustLossScenarioSocketIOServer) WaitForPayload(t *testing.T, timeout time.Duration) string {
	t.Helper()

	select {
	case payload := <-s.telemetry:
		return payload
	case <-time.After(timeout):
		t.Fatal("timed out waiting for telemetry payload")
		return ""
	}
}

func (s *trustLossScenarioSocketIOServer) AssertNoPayload(t *testing.T, timeout time.Duration) {
	t.Helper()

	select {
	case payload := <-s.telemetry:
		t.Fatalf("expected no telemetry payload, got %s", payload)
	case <-time.After(timeout):
	}
}

type freshReOnboardingSocketIOServer struct {
	t *testing.T

	edgeID        string
	initialSecret string
	freshSecret   string

	mu                  sync.Mutex
	initialCycleHandled bool

	server     *httptest.Server
	authEvents chan cloud.HandshakeAuth
	telemetry  chan string
}

func newFreshReOnboardingSocketIOServer(t *testing.T, edgeID string, initialSecret string, freshSecret string) *freshReOnboardingSocketIOServer {
	t.Helper()

	srv := &freshReOnboardingSocketIOServer{
		t:             t,
		edgeID:        edgeID,
		initialSecret: initialSecret,
		freshSecret:   freshSecret,
		authEvents:    make(chan cloud.HandshakeAuth, 8),
		telemetry:     make(chan string, 8),
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
		srv.authEvents <- auth

		if auth.CredentialMode != cloud.CredentialModeOnboarding {
			connectErrorMessage := fmt.Sprintf(`44/edge,{"message":%q}`, string(cloud.ConnectErrorPersistentCredentialRevoked))
			_ = conn.WriteMessage(websocket.TextMessage, []byte(connectErrorMessage))
			return
		}

		srv.mu.Lock()
		initialCycle := !srv.initialCycleHandled && auth.CredentialSecret == srv.initialSecret
		if initialCycle {
			srv.initialCycleHandled = true
		}
		srv.mu.Unlock()

		switch {
		case initialCycle:
			if err := conn.WriteMessage(websocket.TextMessage, []byte(`40/edge,{"sid":"edge-socket-initial"}`)); err != nil {
				return
			}
			activationMessage := fmt.Sprintf(
				`42/edge,["edge_activation",{"edgeId":%q,"lifecycleState":"Active","persistentCredential":{"version":1,"secret":"persistent-initial","issuedAt":"2026-04-07T10:00:00Z"}}]`,
				srv.edgeID,
			)
			if err := conn.WriteMessage(websocket.TextMessage, []byte(activationMessage)); err != nil {
				return
			}

			if err := readTelemetryUntilDisconnect(t, conn, srv.telemetry, func() {
				disconnectMessage := fmt.Sprintf(
					`42/edge,["edge_disconnect",{"edgeId":%q,"reason":"trust_revoked"}]`,
					srv.edgeID,
				)
				if writeErr := conn.WriteMessage(websocket.TextMessage, []byte(disconnectMessage)); writeErr != nil {
					t.Errorf("write trust_revoked disconnect: %v", writeErr)
					return
				}
				_ = conn.WriteMessage(websocket.TextMessage, []byte(`41/edge,`))
			}); err != nil {
				t.Errorf("capture initial telemetry: %v", err)
			}
		case auth.CredentialSecret == srv.freshSecret:
			if err := conn.WriteMessage(websocket.TextMessage, []byte(`40/edge,{"sid":"edge-socket-recovered"}`)); err != nil {
				return
			}
			activationMessage := fmt.Sprintf(
				`42/edge,["edge_activation",{"edgeId":%q,"lifecycleState":"Active","persistentCredential":{"version":2,"secret":"persistent-recovered","issuedAt":"2026-04-07T10:05:00Z"}}]`,
				srv.edgeID,
			)
			if err := conn.WriteMessage(websocket.TextMessage, []byte(activationMessage)); err != nil {
				return
			}

			if err := readTelemetryUntilDisconnect(t, conn, srv.telemetry, nil); err != nil {
				t.Errorf("capture recovered telemetry: %v", err)
			}
		default:
			connectErrorMessage := fmt.Sprintf(`44/edge,{"message":%q}`, string(cloud.ConnectErrorOnboardingPackageReused))
			_ = conn.WriteMessage(websocket.TextMessage, []byte(connectErrorMessage))
			t.Errorf("unexpected onboarding secret on recovery attempt: %q", auth.CredentialSecret)
		}
	})

	srv.server = httptest.NewServer(handler)
	return srv
}

func (s *freshReOnboardingSocketIOServer) Close() {
	if s.server != nil {
		s.server.Close()
	}
}

func (s *freshReOnboardingSocketIOServer) URL() string {
	return s.server.URL
}

func (s *freshReOnboardingSocketIOServer) WaitForAttempt(t *testing.T, timeout time.Duration) cloud.HandshakeAuth {
	t.Helper()

	select {
	case auth := <-s.authEvents:
		return auth
	case <-time.After(timeout):
		t.Fatal("timed out waiting for runtime handshake attempt")
		return cloud.HandshakeAuth{}
	}
}

func (s *freshReOnboardingSocketIOServer) AssertNoAttempt(t *testing.T, timeout time.Duration) {
	t.Helper()

	select {
	case auth := <-s.authEvents:
		t.Fatalf("expected no handshake attempt, got %+v", auth)
	case <-time.After(timeout):
	}
}

func (s *freshReOnboardingSocketIOServer) WaitForPayload(t *testing.T, timeout time.Duration) string {
	t.Helper()

	select {
	case payload := <-s.telemetry:
		return payload
	case <-time.After(timeout):
		t.Fatal("timed out waiting for telemetry payload")
		return ""
	}
}

func (s *freshReOnboardingSocketIOServer) AssertNoPayload(t *testing.T, timeout time.Duration) {
	t.Helper()

	select {
	case payload := <-s.telemetry:
		t.Fatalf("expected no telemetry payload, got %s", payload)
	case <-time.After(timeout):
	}
}

func startTrustLossProcess(
	t *testing.T,
	cfg config.Config,
	cloudURL string,
	onboardingPath string,
) (*runtimeapp.Process, source.MockControl, chan error, context.CancelFunc) {
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
		t.Fatalf("construct production runtime app: %v", err)
	}

	if err := process.Bootstrap.Bootstrap(runtime.BootstrapInput{
		OnboardingPackagePath: onboardingPath,
	}); err != nil {
		cancel()
		t.Fatalf("bootstrap runtime app from onboarding package: %v", err)
	}

	control, err := process.Sources.MockControl("mock-source-1")
	if err != nil {
		cancel()
		t.Fatalf("get mock source control: %v", err)
	}

	runErr := make(chan error, 1)
	go func() {
		runErr <- process.Runner.Run(ctx)
	}()

	return process, control, runErr, cancel
}

func emitTelemetryReading(t *testing.T, control source.MockControl, ts int64, value float64) {
	t.Helper()

	if err := control.EmitReading(source.RawReading{
		DeviceID: "pump-1",
		Metric:   "pressure",
		Value:    value,
		TS:       ts,
	}); err != nil {
		t.Fatalf("emit reading through manager boundary: %v", err)
	}
}

func waitRunnerExit(runErr <-chan error, timeout time.Duration) error {
	select {
	case err := <-runErr:
		return err
	case <-time.After(timeout):
		return fmt.Errorf("timed out waiting for runner exit")
	}
}

func writeOnboardingPackage(t *testing.T, path string, edgeID string, secret string) {
	t.Helper()

	payload := map[string]any{
		"edgeId":           edgeID,
		"onboardingSecret": secret,
		"issuedAt":         "2026-04-07T10:00:00Z",
		"expiresAt":        "2026-04-07T12:00:00Z",
	}

	raw, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal onboarding package json: %v", err)
	}

	if err := os.WriteFile(path, raw, 0o600); err != nil {
		t.Fatalf("write onboarding package %s: %v", path, err)
	}
}

func readTelemetryUntilDisconnect(
	t *testing.T,
	conn *websocket.Conn,
	telemetry chan<- string,
	onFirstPayload func(),
) error {
	t.Helper()

	triggered := false
	for {
		messageType, payload, err := conn.ReadMessage()
		if err != nil {
			return nil
		}
		if messageType != websocket.TextMessage {
			continue
		}
		if !isNamespaceEventForTest(string(payload), "/edge") {
			continue
		}

		eventName, eventPayload, err := parseNamespaceEventForTest(string(payload), "/edge")
		if err != nil {
			return fmt.Errorf("parse namespace event: %w", err)
		}
		if eventName != "telemetry" {
			continue
		}

		encoded, err := json.Marshal(eventPayload)
		if err != nil {
			return fmt.Errorf("encode telemetry payload: %w", err)
		}
		telemetry <- string(encoded)

		if !triggered && onFirstPayload != nil {
			triggered = true
			onFirstPayload()
		}
	}
}

func disconnectReasonPointer(reason cloud.DisconnectReason) *cloud.DisconnectReason {
	copy := reason
	return &copy
}

func connectErrorPointer(code cloud.ConnectErrorCode) *cloud.ConnectErrorCode {
	copy := code
	return &copy
}
