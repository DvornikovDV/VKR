package integration

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"edge_server/go_core/internal/cloud"
	"edge_server/go_core/internal/config"
	"edge_server/go_core/internal/mockadapter"
	"edge_server/go_core/internal/runtime"
	"edge_server/go_core/internal/runtimeapp"
	"edge_server/go_core/internal/source"

	"github.com/gorilla/websocket"
)

func TestReproTaskT008bTelemetryPipelineExercisesMockSourceThroughManagerBoundary(t *testing.T) {
	t.Setenv("CLOUD_SOCKET_URL", "wss://cloud.example.test")

	cfg, err := config.LoadFromFile(runtimeFixturePath(t, "config.yaml"))
	if err != nil {
		t.Fatalf("load runtime config fixture: %v", err)
	}

	manager := source.NewManager(source.FactoryRegistry{
		mockadapter.Kind: func() (source.Adapter, error) {
			return mockadapter.New(), nil
		},
	})

	report, err := manager.ApplyDefinitions(source.DefinitionsFromConfig(cfg.Sources))
	if err != nil {
		t.Fatalf("apply source definitions from runtime config: %v", err)
	}
	if len(report.Applied) != 1 || report.Applied[0] != "mock-source-1" {
		t.Fatalf("expected runtime config to apply mock-source-1, got %+v", report)
	}

	control, err := manager.MockControl("mock-source-1")
	if err != nil {
		t.Fatalf("get mock control through manager boundary: %v", err)
	}

	ts := time.Now().UnixMilli()
	if err := control.EmitReading(source.RawReading{
		SourceID: "spoofed-source",
		DeviceID: "pump-1",
		Metric:   "pressure",
		Value:    18.75,
		TS:       ts,
		Metadata: map[string]any{"ignored": "metadata"},
	}); err != nil {
		t.Fatalf("emit reading through manager boundary: %v", err)
	}

	select {
	case reading := <-manager.Readings():
		if reading.SourceID != "mock-source-1" {
			t.Fatalf("expected manager-owned sourceId, got %+v", reading)
		}
		if reading.DeviceID != "pump-1" || reading.Metric != "pressure" {
			t.Fatalf("unexpected reading identity: %+v", reading)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for normalized reading")
	}

	if err := control.EmitFault(source.Fault{
		SourceID: "spoofed-source",
		Severity: source.SeverityError,
		Code:     "mock_connection_lost",
		Message:  "mock connection lost",
		TS:       ts,
	}); err != nil {
		t.Fatalf("emit fault through manager boundary: %v", err)
	}

	select {
	case fault := <-manager.Faults():
		if fault.SourceID != "mock-source-1" {
			t.Fatalf("expected manager-owned fault sourceId, got %+v", fault)
		}
		if fault.Code != "mock_connection_lost" {
			t.Fatalf("unexpected fault payload: %+v", fault)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for source fault")
	}
}

func TestReproTaskT023bStableDefinitionsReuseAcrossSessionTransitionsAndKeepCanonicalReadingShape(t *testing.T) {
	t.Setenv("CLOUD_SOCKET_URL", "wss://cloud.example.test")

	cfg, err := config.LoadFromFile(runtimeFixturePath(t, "config.yaml"))
	if err != nil {
		t.Fatalf("load runtime config fixture: %v", err)
	}

	manager := source.NewManager(source.FactoryRegistry{
		mockadapter.Kind: func() (source.Adapter, error) {
			return mockadapter.New(), nil
		},
	})

	definitions := source.DefinitionsFromConfig(cfg.Sources)
	if _, err := manager.ApplyDefinitions(definitions); err != nil {
		t.Fatalf("apply initial source definitions: %v", err)
	}

	controlBefore, err := manager.MockControl("mock-source-1")
	if err != nil {
		t.Fatalf("get initial mock control: %v", err)
	}

	for _, phase := range []string{"reconnect", "trust-loss", "fresh re-onboarding"} {
		report, err := manager.ApplyDefinitions(definitions)
		if err != nil {
			t.Fatalf("reapply unchanged definitions for %s: %v", phase, err)
		}
		if len(report.Reused) != 1 || report.Reused[0] != "mock-source-1" {
			t.Fatalf("expected mock-source-1 to be reused for %s, got %+v", phase, report)
		}
	}

	controlAfter, err := manager.MockControl("mock-source-1")
	if err != nil {
		t.Fatalf("get reused mock control: %v", err)
	}
	if controlBefore != controlAfter {
		t.Fatal("expected unchanged runtime config to keep the same mock control instance")
	}
	if controlAfter.ApplyCount() != 1 {
		t.Fatalf("expected unchanged runtime config to avoid redefinition, got apply count %d", controlAfter.ApplyCount())
	}

	if err := controlAfter.EmitReading(source.RawReading{
		SourceID: "spoofed-source",
		DeviceID: "pump-1",
		Metric:   "pressure",
		Value:    21.5,
		TS:       4242,
		Metadata: map[string]any{"ignored": true},
	}); err != nil {
		t.Fatalf("emit reading after definition reuse: %v", err)
	}

	select {
	case reading := <-manager.Readings():
		payload, err := json.Marshal(reading)
		if err != nil {
			t.Fatalf("marshal normalized reading: %v", err)
		}

		const want = `{"sourceId":"mock-source-1","deviceId":"pump-1","metric":"pressure","value":21.5,"ts":4242}`
		if string(payload) != want {
			t.Fatalf("expected canonical normalized reading shape %s, got %s", want, string(payload))
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for normalized reading after definition reuse")
	}
}

type telemetryCaptureTransport struct {
	payloads chan string
}

func newTelemetryCaptureTransport() *telemetryCaptureTransport {
	return &telemetryCaptureTransport{
		payloads: make(chan string, 8),
	}
}

func (t *telemetryCaptureTransport) Connect(_ context.Context, _ cloud.HandshakeAuth) error {
	return nil
}

func (t *telemetryCaptureTransport) Disconnect() error {
	return nil
}

func (t *telemetryCaptureTransport) Emit(event string, payload any) error {
	if event != "telemetry" {
		return nil
	}

	encoded, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	t.payloads <- string(encoded)
	return nil
}

func (t *telemetryCaptureTransport) OnEdgeActivation(_ func(any)) {}

func (t *telemetryCaptureTransport) OnEdgeDisconnect(_ func(any)) {}

func (t *telemetryCaptureTransport) OnConnect(_ func() error) {}

func (t *telemetryCaptureTransport) OnConnectError(_ func(error)) {}

func (t *telemetryCaptureTransport) OnDisconnect(_ func(string)) {}

func (t *telemetryCaptureTransport) WaitForPayload(tst *testing.T, timeout time.Duration) string {
	tst.Helper()

	select {
	case payload := <-t.payloads:
		return payload
	case <-time.After(timeout):
		tst.Fatal("timed out waiting for telemetry payload")
		return ""
	}
}

func (t *telemetryCaptureTransport) AssertNoPayload(tst *testing.T, timeout time.Duration) {
	tst.Helper()

	select {
	case payload := <-t.payloads:
		tst.Fatalf("expected no telemetry payload, got %s", payload)
	case <-time.After(timeout):
	}
}

func TestReproTaskT018RuntimeOwnedTelemetryPathDropsPreRecoveryPendingReadings(t *testing.T) {
	t.Setenv("CLOUD_SOCKET_URL", "wss://cloud.example.test")

	cfg, err := config.LoadFromFile(runtimeFixturePath(t, "config.yaml"))
	if err != nil {
		t.Fatalf("load runtime config fixture: %v", err)
	}
	cfg.Batch.IntervalMs = 1000
	cfg.Batch.MaxReadings = 2

	transport := newTelemetryCaptureTransport()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	process, err := runtimeapp.New(ctx, cfg, transport)
	if err != nil {
		t.Fatalf("construct production runtime app: %v", err)
	}

	if err := process.Runner.ActivateTrustedSession("edge-telemetry-1", "persistent-secret-1"); err != nil {
		t.Fatalf("activate initial trusted session: %v", err)
	}

	control, err := process.Sources.MockControl("mock-source-1")
	if err != nil {
		t.Fatalf("get mock control through production runtime app: %v", err)
	}

	if err := control.EmitReading(source.RawReading{
		DeviceID: "pump-1",
		Metric:   "pressure",
		Value:    18.75,
		TS:       3001,
	}); err != nil {
		t.Fatalf("emit pre-recovery reading through manager boundary: %v", err)
	}

	time.Sleep(50 * time.Millisecond)

	process.Runner.MarkDisconnected("transport_closed")

	if err := process.Runner.ActivateTrustedSession("edge-telemetry-1", "persistent-secret-2"); err != nil {
		t.Fatalf("activate recovered trusted session: %v", err)
	}

	if err := control.EmitReading(source.RawReading{
		DeviceID: "pump-2",
		Metric:   "pressure",
		Value:    19.75,
		TS:       3002,
	}); err != nil {
		t.Fatalf("emit recovered reading through manager boundary: %v", err)
	}
	if err := control.EmitReading(source.RawReading{
		DeviceID: "pump-3",
		Metric:   "running",
		Value:    true,
		TS:       3003,
	}); err != nil {
		t.Fatalf("emit second recovered reading through manager boundary: %v", err)
	}

	assertCanonicalTelemetryPayload(t, transport.WaitForPayload(t, time.Second), []map[string]any{
		{"deviceId": "pump-2", "metric": "pressure", "value": 19.75, "ts": 3002},
		{"deviceId": "pump-3", "metric": "running", "value": true, "ts": 3003},
	})
}

type telemetrySocketIOServer struct {
	t *testing.T

	server *httptest.Server

	authEvents     chan cloud.HandshakeAuth
	telemetry      chan string
	closeFirstConn chan struct{}

	persistentSecret string
	persistentError  string
}

func newTelemetrySocketIOServer(t *testing.T) *telemetrySocketIOServer {
	t.Helper()

	srv := &telemetrySocketIOServer{
		t:                t,
		authEvents:       make(chan cloud.HandshakeAuth, 8),
		telemetry:        make(chan string, 8),
		closeFirstConn:   make(chan struct{}),
		persistentSecret: "persistent-from-activation",
		persistentError:  string(cloud.ConnectErrorPersistentCredentialRevoked),
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
				`42/edge,["edge_activation",{"edgeId":%q,"lifecycleState":"Active","persistentCredential":{"version":1,"secret":%q,"issuedAt":"2026-04-07T10:00:00Z"}}]`,
				auth.EdgeID,
				srv.persistentSecret,
			)
			if err := conn.WriteMessage(websocket.TextMessage, []byte(activationMessage)); err != nil {
				return
			}

			closedByTest := false
			for !closedByTest {
				select {
				case <-srv.closeFirstConn:
					closedByTest = true
					_ = conn.Close()
				default:
					_ = conn.SetReadDeadline(time.Now().Add(50 * time.Millisecond))
					messageType, payload, err := conn.ReadMessage()
					if err != nil {
						if websocket.IsCloseError(err, websocket.CloseNormalClosure, websocket.CloseGoingAway) {
							return
						}
						if errors.Is(err, context.DeadlineExceeded) {
							continue
						}
						if netErr, ok := err.(interface{ Timeout() bool }); ok && netErr.Timeout() {
							continue
						}
						return
					}
					if messageType != websocket.TextMessage {
						continue
					}
					if !isNamespaceEventForTest(string(payload), "/edge") {
						continue
					}

					eventName, eventPayload, err := parseNamespaceEventForTest(string(payload), "/edge")
					if err != nil {
						t.Errorf("parse namespace event: %v", err)
						return
					}
					if eventName != "telemetry" {
						continue
					}

					encoded, err := json.Marshal(eventPayload)
					if err != nil {
						t.Errorf("encode telemetry payload: %v", err)
						return
					}
					srv.telemetry <- string(encoded)
				}
			}
		case cloud.CredentialModePersistent:
			connectErrorMessage := fmt.Sprintf(`44/edge,{"message":%q}`, srv.persistentError)
			if err := conn.WriteMessage(websocket.TextMessage, []byte(connectErrorMessage)); err != nil {
				return
			}
			time.Sleep(25 * time.Millisecond)
		default:
			t.Errorf("unexpected credential mode %q", auth.CredentialMode)
		}
	})

	srv.server = httptest.NewServer(handler)
	return srv
}

func (s *telemetrySocketIOServer) Close() {
	if s.server != nil {
		s.server.Close()
	}
}

func (s *telemetrySocketIOServer) URL() string {
	return s.server.URL
}

func (s *telemetrySocketIOServer) ForceDisconnect() {
	select {
	case s.closeFirstConn <- struct{}{}:
	default:
	}
}

func (s *telemetrySocketIOServer) WaitForAttempt(t *testing.T, timeout time.Duration) cloud.HandshakeAuth {
	t.Helper()

	select {
	case auth := <-s.authEvents:
		return auth
	case <-time.After(timeout):
		t.Fatal("timed out waiting for runtime handshake attempt")
		return cloud.HandshakeAuth{}
	}
}

func (s *telemetrySocketIOServer) WaitForPayload(t *testing.T, timeout time.Duration) string {
	t.Helper()

	select {
	case payload := <-s.telemetry:
		return payload
	case <-time.After(timeout):
		t.Fatal("timed out waiting for telemetry payload")
		return ""
	}
}

func (s *telemetrySocketIOServer) AssertNoPayload(t *testing.T, timeout time.Duration) {
	t.Helper()

	select {
	case payload := <-s.telemetry:
		t.Fatalf("expected no telemetry payload, got %s", payload)
	case <-time.After(timeout):
	}
}

type trustRecoverySocketIOServer struct {
	t *testing.T

	server *httptest.Server

	authEvents      chan cloud.HandshakeAuth
	telemetry       chan string
	allowPersistent chan struct{}
}

func newTrustRecoverySocketIOServer(t *testing.T) *trustRecoverySocketIOServer {
	t.Helper()

	srv := &trustRecoverySocketIOServer{
		t:               t,
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

		if auth.CredentialMode == cloud.CredentialModeOnboarding {
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
		} else {
			<-srv.allowPersistent
			if err := conn.WriteMessage(websocket.TextMessage, []byte(`40/edge,{"sid":"edge-socket-2"}`)); err != nil {
				return
			}
		}

		for {
			messageType, payload, err := conn.ReadMessage()
			if err != nil {
				return
			}
			if messageType != websocket.TextMessage {
				continue
			}
			if !isNamespaceEventForTest(string(payload), "/edge") {
				continue
			}

			eventName, eventPayload, err := parseNamespaceEventForTest(string(payload), "/edge")
			if err != nil {
				t.Errorf("parse namespace event: %v", err)
				return
			}
			if eventName != "telemetry" {
				continue
			}

			encoded, err := json.Marshal(eventPayload)
			if err != nil {
				t.Errorf("encode telemetry payload: %v", err)
				return
			}
			srv.telemetry <- string(encoded)

			if auth.CredentialMode == cloud.CredentialModeOnboarding {
				message := fmt.Sprintf(
					`42/edge,["edge_disconnect",{"edgeId":%q,"reason":%q}]`,
					auth.EdgeID,
					string(cloud.DisconnectReasonForced),
				)
				if err := conn.WriteMessage(websocket.TextMessage, []byte(message)); err != nil {
					return
				}
				_ = conn.WriteMessage(websocket.TextMessage, []byte(`41/edge,`))
				return
			}
		}
	})

	srv.server = httptest.NewServer(handler)
	return srv
}

func (s *trustRecoverySocketIOServer) Close() {
	if s.server != nil {
		s.server.Close()
	}
}

func (s *trustRecoverySocketIOServer) URL() string {
	return s.server.URL
}

func (s *trustRecoverySocketIOServer) WaitForAttempt(t *testing.T, timeout time.Duration) cloud.HandshakeAuth {
	t.Helper()

	select {
	case auth := <-s.authEvents:
		return auth
	case <-time.After(timeout):
		t.Fatal("timed out waiting for runtime handshake attempt")
		return cloud.HandshakeAuth{}
	}
}

func (s *trustRecoverySocketIOServer) WaitForPayload(t *testing.T, timeout time.Duration) string {
	t.Helper()

	select {
	case payload := <-s.telemetry:
		return payload
	case <-time.After(timeout):
		t.Fatal("timed out waiting for telemetry payload")
		return ""
	}
}

func (s *trustRecoverySocketIOServer) AssertNoPayload(t *testing.T, timeout time.Duration) {
	t.Helper()

	select {
	case payload := <-s.telemetry:
		t.Fatalf("expected no telemetry payload, got %s", payload)
	case <-time.After(timeout):
	}
}

func (s *trustRecoverySocketIOServer) AllowPersistentConnect() {
	select {
	case s.allowPersistent <- struct{}{}:
	default:
	}
}

func isNamespaceEventForTest(message string, namespace string) bool {
	return len(message) >= len("42"+namespace+",") && message[:len("42"+namespace+",")] == "42"+namespace+","
}

func parseNamespaceEventForTest(message string, namespace string) (string, map[string]any, error) {
	payload := message[len("42"+namespace+","):]

	var body []json.RawMessage
	if err := json.Unmarshal([]byte(payload), &body); err != nil {
		return "", nil, fmt.Errorf("parse namespace event payload: %w", err)
	}
	if len(body) < 2 {
		return "", nil, fmt.Errorf("socket.io namespace event payload must contain event name and data")
	}

	var eventName string
	if err := json.Unmarshal(body[0], &eventName); err != nil {
		return "", nil, fmt.Errorf("parse namespace event name: %w", err)
	}

	var eventPayload map[string]any
	if err := json.Unmarshal(body[1], &eventPayload); err != nil {
		return "", nil, fmt.Errorf("parse namespace event data: %w", err)
	}

	return eventName, eventPayload, nil
}

func waitForTrustedSession(t *testing.T, process *runtimeapp.Process, timeout time.Duration) {
	t.Helper()

	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		snapshot := process.Runner.StateSnapshot()
		if snapshot.Trusted && snapshot.Connected {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}

	t.Fatalf("timed out waiting for trusted connected session, last snapshot: %+v", process.Runner.StateSnapshot())
}

func waitForTelemetryStop(t *testing.T, process *runtimeapp.Process, timeout time.Duration) {
	t.Helper()

	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		snapshot := process.Runner.StateSnapshot()
		if !snapshot.Trusted && !snapshot.Connected {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}

	t.Fatalf("timed out waiting for telemetry stop, last snapshot: %+v", process.Runner.StateSnapshot())
}

func assertCanonicalTelemetryPayload(t *testing.T, raw string, want []map[string]any) {
	t.Helper()

	var envelope map[string]any
	if err := json.Unmarshal([]byte(raw), &envelope); err != nil {
		t.Fatalf("parse telemetry payload json: %v", err)
	}

	readingsRaw, ok := envelope["readings"].([]any)
	if !ok {
		t.Fatalf("expected telemetry payload to contain readings array, got %v", envelope["readings"])
	}
	if len(readingsRaw) != len(want) {
		t.Fatalf("expected %d telemetry readings, got %d in %s", len(want), len(readingsRaw), raw)
	}

	for i, expected := range want {
		reading, ok := readingsRaw[i].(map[string]any)
		if !ok {
			t.Fatalf("expected telemetry reading %d to be an object, got %T", i, readingsRaw[i])
		}
		if len(reading) != 4 {
			t.Fatalf("expected telemetry reading %d to contain only canonical fields, got %v", i, reading)
		}
		for key, expectedValue := range expected {
			if gotValue, exists := reading[key]; !exists || fmt.Sprint(gotValue) != fmt.Sprint(expectedValue) {
				t.Fatalf("expected telemetry reading %d field %s=%v, got %v in %v", i, key, expectedValue, reading[key], reading)
			}
		}
	}
}

func TestReproTaskT018ProductionRuntimeTelemetryPathBatchesCanonicalPayloadsAndDropsOutsideTrustedSession(t *testing.T) {
	requireLegacyOnboardingReference(t)
	t.Setenv("CLOUD_SOCKET_URL", "wss://cloud.example.test")
	t.Setenv("EDGE_ONBOARDING_SECRET", "telemetry-repro-secret")

	cfg, err := config.LoadFromFile(runtimeFixturePath(t, "config.yaml"))
	if err != nil {
		t.Fatalf("load runtime config fixture: %v", err)
	}

	cfg.Batch.IntervalMs = 40
	cfg.Batch.MaxReadings = 3
	cfg.Sources[0].Devices[0].Metrics = append(cfg.Sources[0].Devices[0].Metrics, config.MetricDefinition{
		Metric:    "running",
		ValueType: "boolean",
		Mapping:   map[string]any{"coil": 1},
	})
	cfg.Sources[0].Devices = append(cfg.Sources[0].Devices, config.LocalDeviceDefinition{
		DeviceID: "pump-2",
		Address:  map[string]any{"node": 2},
		Metrics: []config.MetricDefinition{
			{
				Metric:    "pressure",
				ValueType: "number",
				Mapping:   map[string]any{"register": 40002},
			},
		},
	})

	server := newTelemetrySocketIOServer(t)
	defer server.Close()

	transport, err := cloud.NewWebSocketTransport(cloud.WebSocketTransportConfig{
		CloudURL:  server.URL(),
		Namespace: cfg.Cloud.Namespace,
	})
	if err != nil {
		t.Fatalf("create websocket transport: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	process, err := runtimeapp.New(ctx, cfg, transport)
	if err != nil {
		t.Fatalf("construct production runtime app: %v", err)
	}

	if err := process.Bootstrap.Bootstrap(runtime.BootstrapInput{
		OnboardingPackagePath: runtimeFixturePath(t, "onboarding-package.json"),
	}); err != nil {
		t.Fatalf("bootstrap production runtime app: %v", err)
	}

	control, err := process.Sources.MockControl("mock-source-1")
	if err != nil {
		t.Fatalf("get mock control through production runtime app: %v", err)
	}

	runErr := make(chan error, 1)
	go func() {
		runErr <- process.Runner.Run(ctx)
	}()

	firstAttempt := server.WaitForAttempt(t, 2*time.Second)
	if firstAttempt.CredentialMode != cloud.CredentialModeOnboarding {
		t.Fatalf("expected production runtime first attempt to use onboarding credential mode, got %q", firstAttempt.CredentialMode)
	}

	waitForTrustedSession(t, process, 2*time.Second)

	for _, reading := range []source.RawReading{
		{DeviceID: "pump-1", Metric: "pressure", Value: 18.75, TS: 1001},
		{DeviceID: "pump-1", Metric: "running", Value: true, TS: 1002},
		{DeviceID: "pump-2", Metric: "pressure", Value: 20.25, TS: 1003},
	} {
		if err := control.EmitReading(reading); err != nil {
			t.Fatalf("emit trusted reading through manager boundary: %v", err)
		}
	}

	assertCanonicalTelemetryPayload(t, server.WaitForPayload(t, time.Second), []map[string]any{
		{"deviceId": "pump-1", "metric": "pressure", "value": 18.75, "ts": 1001},
		{"deviceId": "pump-1", "metric": "running", "value": true, "ts": 1002},
		{"deviceId": "pump-2", "metric": "pressure", "value": 20.25, "ts": 1003},
	})

	server.ForceDisconnect()
	waitForTelemetryStop(t, process, 2*time.Second)

	if err := control.EmitReading(source.RawReading{
		DeviceID: "pump-1",
		Metric:   "pressure",
		Value:    19.5,
		TS:       2001,
	}); err != nil {
		t.Fatalf("emit disconnected reading through manager boundary: %v", err)
	}

	server.AssertNoPayload(t, 3*time.Duration(cfg.Batch.IntervalMs)*time.Millisecond)

	secondAttempt := server.WaitForAttempt(t, 2*time.Second)
	if secondAttempt.CredentialMode != cloud.CredentialModePersistent {
		t.Fatalf("expected reconnect attempt to use persistent credential mode, got %q", secondAttempt.CredentialMode)
	}

	select {
	case err := <-runErr:
		if err == nil {
			t.Fatal("expected runtime to fail fast after rejected reconnect with no valid auth path")
		}
		if err.Error() == "" {
			t.Fatalf("expected non-empty reconnect failure, got %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for runtime to finish after rejected reconnect")
	}

	if err := control.EmitReading(source.RawReading{
		DeviceID: "pump-2",
		Metric:   "pressure",
		Value:    21.0,
		TS:       2002,
	}); err != nil {
		t.Fatalf("emit untrusted reading through manager boundary: %v", err)
	}

	server.AssertNoPayload(t, 3*time.Duration(cfg.Batch.IntervalMs)*time.Millisecond)
}

func TestT030ProductionRuntimeResumesTelemetryOnlyAfterAcceptedFutureTrustPath(t *testing.T) {
	requireLegacyOnboardingReference(t)
	t.Setenv("CLOUD_SOCKET_URL", "wss://cloud.example.test")
	t.Setenv("EDGE_ONBOARDING_SECRET", "telemetry-recovery-secret")

	cfg, err := config.LoadFromFile(runtimeFixturePath(t, "config.yaml"))
	if err != nil {
		t.Fatalf("load runtime config fixture: %v", err)
	}
	cfg.Batch.IntervalMs = 40
	cfg.Batch.MaxReadings = 2

	server := newTrustRecoverySocketIOServer(t)
	defer server.Close()

	transport, err := cloud.NewWebSocketTransport(cloud.WebSocketTransportConfig{
		CloudURL:  server.URL(),
		Namespace: cfg.Cloud.Namespace,
	})
	if err != nil {
		t.Fatalf("create websocket transport: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	process, err := runtimeapp.New(ctx, cfg, transport)
	if err != nil {
		t.Fatalf("construct production runtime app: %v", err)
	}

	if err := process.Bootstrap.Bootstrap(runtime.BootstrapInput{
		OnboardingPackagePath: runtimeFixturePath(t, "onboarding-package.json"),
	}); err != nil {
		t.Fatalf("bootstrap runtime app: %v", err)
	}

	control, err := process.Sources.MockControl("mock-source-1")
	if err != nil {
		t.Fatalf("get mock control: %v", err)
	}

	runErr := make(chan error, 1)
	go func() {
		runErr <- process.Runner.Run(ctx)
	}()

	firstAttempt := server.WaitForAttempt(t, 2*time.Second)
	if firstAttempt.CredentialMode != cloud.CredentialModeOnboarding {
		t.Fatalf("expected onboarding first attempt, got %q", firstAttempt.CredentialMode)
	}

	waitForTrustedSession(t, process, 2*time.Second)

	if err := control.EmitReading(source.RawReading{
		DeviceID: "pump-1",
		Metric:   "pressure",
		Value:    18.5,
		TS:       4001,
	}); err != nil {
		t.Fatalf("emit trusted reading: %v", err)
	}
	if err := control.EmitReading(source.RawReading{
		DeviceID: "pump-2",
		Metric:   "running",
		Value:    true,
		TS:       4002,
	}); err != nil {
		t.Fatalf("emit second trusted reading: %v", err)
	}

	assertCanonicalTelemetryPayload(t, server.WaitForPayload(t, time.Second), []map[string]any{
		{"deviceId": "pump-1", "metric": "pressure", "value": 18.5, "ts": 4001},
		{"deviceId": "pump-2", "metric": "running", "value": true, "ts": 4002},
	})

	waitForTelemetryStop(t, process, 2*time.Second)

	secondAttempt := server.WaitForAttempt(t, 2*time.Second)
	if secondAttempt.CredentialMode != cloud.CredentialModePersistent {
		t.Fatalf("expected persistent reconnect attempt, got %q", secondAttempt.CredentialMode)
	}

	if err := control.EmitReading(source.RawReading{
		DeviceID: "pump-1",
		Metric:   "pressure",
		Value:    19.5,
		TS:       4003,
	}); err != nil {
		t.Fatalf("emit disconnected reading: %v", err)
	}
	server.AssertNoPayload(t, 150*time.Millisecond)

	server.AllowPersistentConnect()
	waitForTrustedSession(t, process, 2*time.Second)

	if err := control.EmitReading(source.RawReading{
		DeviceID: "pump-1",
		Metric:   "pressure",
		Value:    20.5,
		TS:       4004,
	}); err != nil {
		t.Fatalf("emit reconnected reading: %v", err)
	}
	if err := control.EmitReading(source.RawReading{
		DeviceID: "pump-2",
		Metric:   "running",
		Value:    false,
		TS:       4005,
	}); err != nil {
		t.Fatalf("emit second reconnected reading: %v", err)
	}

	assertCanonicalTelemetryPayload(t, server.WaitForPayload(t, time.Second), []map[string]any{
		{"deviceId": "pump-1", "metric": "pressure", "value": 20.5, "ts": 4004},
		{"deviceId": "pump-2", "metric": "running", "value": false, "ts": 4005},
	})

	cancel()
	select {
	case err := <-runErr:
		if err != nil {
			t.Fatalf("expected clean runtime shutdown, got %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for runtime shutdown")
	}
}
