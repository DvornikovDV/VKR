package integration

import (
	"context"
	"encoding/json"
	"fmt"
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

	"github.com/simonvetter/modbus"
)

func TestT015ProductionModbusRTUTelemetryPipeline(t *testing.T) {
	t.Setenv("CLOUD_SOCKET_URL", "https://cloud.example.test")

	stateDir := t.TempDir()
	installCredentialFixture(t, stateDir, "valid/credential.json")
	configPath := writeModbusRuntimeConfig(t, stateDir)

	okClient := newIntegrationModbusClient(map[integrationModbusReadKey]uint16{
		{address: 0, registerType: modbus.INPUT_REGISTER}:   215,
		{address: 1, registerType: modbus.HOLDING_REGISTER}: 1,
	}, nil)
	faultClient := newIntegrationModbusClient(nil, map[uint16]error{
		7: timeoutErr{},
	})
	clients := []*integrationModbusClient{okClient, faultClient}

	var factoryMu sync.Mutex
	restore := source.OverrideModbusSerialClientFactoryForTest(
		func(source.ModbusSerialConnection) (source.ModbusRegisterClient, error) {
			factoryMu.Lock()
			defer factoryMu.Unlock()

			if len(clients) == 0 {
				return nil, fmt.Errorf("unexpected extra modbus client request")
			}
			client := clients[0]
			clients = clients[1:]
			return client, nil
		},
		func() time.Time {
			return time.UnixMilli(1710000000123)
		},
	)
	defer restore()

	cfg, err := config.LoadFromFile(configPath)
	if err != nil {
		t.Fatalf("load modbus runtime config: %v", err)
	}

	transport := newTelemetryCaptureTransport()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	process, err := runtimeapp.New(ctx, cfg, transport)
	if err != nil {
		t.Fatalf("construct production runtime app with modbus_rtu source: %v", err)
	}

	runErr := make(chan error, 1)
	go func() {
		runErr <- process.Runner.Run(ctx)
	}()

	attempt := transport.WaitForConnect(t, 2*time.Second)
	if attempt.EdgeID != "507f1f77bcf86cd799439011" || attempt.CredentialSecret != "persistent-secret-fixture-valid" {
		t.Fatalf("expected persistent credential handshake from credential.json, got %+v", attempt)
	}
	waitForTrustedSession(t, process, 2*time.Second)

	select {
	case fault := <-process.Sources.Faults():
		if fault.SourceID != "rtu-fault" || fault.Code != "modbus_timeout" {
			t.Fatalf("expected local rtu-fault timeout, got %+v", fault)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("expected faulting modbus source to publish a local source fault")
	}

	waitForSourceHealth(t, process.Sources, "rtu-fault", source.SourceHealthFailed, 2*time.Second)
	transport.DrainPayloads()

	okClient.ReplaceValues(map[integrationModbusReadKey]uint16{
		{address: 0, registerType: modbus.INPUT_REGISTER}:   221,
		{address: 1, registerType: modbus.HOLDING_REGISTER}: 0,
	})
	transport.WaitForCanonicalPayloadWithoutLocalFields(t, 2*time.Second, []map[string]any{
		{"deviceId": "environment", "metric": "temperature", "value": 22.1},
		{"deviceId": "pump_main", "metric": "actual_state", "value": false},
	})
	waitForSourceHealth(t, process.Sources, "rtu-ok", source.SourceHealthRunning, 2*time.Second)

	okClient.AssertRead(t, 0, modbus.INPUT_REGISTER)
	okClient.AssertRead(t, 1, modbus.HOLDING_REGISTER)
	faultClient.AssertRead(t, 7, modbus.INPUT_REGISTER)

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

func TestT020ProductionRuntimeRejectsMockAdapterKindByDefault(t *testing.T) {
	t.Setenv("CLOUD_SOCKET_URL", "https://cloud.example.test")

	stateDir := t.TempDir()
	installCredentialFixture(t, stateDir, "valid/credential.json")
	configPath := writeMockRuntimeConfig(t, stateDir)

	cfg, err := config.LoadFromFile(configPath)
	if err != nil {
		t.Fatalf("load mock runtime config: %v", err)
	}

	_, err = runtimeapp.New(context.Background(), cfg, noopTransport{})
	if err == nil {
		t.Fatal("expected production runtime app to reject mock adapter kind")
	}
	if !strings.Contains(err.Error(), `source adapter kind "mock" is not registered`) {
		t.Fatalf("expected production registry rejection for mock adapter, got %v", err)
	}
}

type telemetryCaptureTransport struct {
	connects       chan cloud.HandshakeAuth
	payloads       chan string
	executeCommand func(any)
}

func newTelemetryCaptureTransport() *telemetryCaptureTransport {
	return &telemetryCaptureTransport{
		connects: make(chan cloud.HandshakeAuth, 4),
		payloads: make(chan string, 8),
	}
}

func (t *telemetryCaptureTransport) Connect(_ context.Context, auth cloud.HandshakeAuth) error {
	t.connects <- auth
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

func (t *telemetryCaptureTransport) OnEdgeDisconnect(_ func(any)) {}

func (t *telemetryCaptureTransport) OnExecuteCommand(handler func(any)) {
	t.executeCommand = handler
}

func (t *telemetryCaptureTransport) InjectExecuteCommand(payload any) {
	if t.executeCommand != nil {
		t.executeCommand(payload)
	}
}

var _ cloud.Transport = (*telemetryCaptureTransport)(nil)

func (t *telemetryCaptureTransport) OnConnect(_ func() error) {}

func (t *telemetryCaptureTransport) OnConnectError(_ func(error)) {}

func (t *telemetryCaptureTransport) OnDisconnect(_ func(string)) {}

func (t *telemetryCaptureTransport) WaitForConnect(tst *testing.T, timeout time.Duration) cloud.HandshakeAuth {
	tst.Helper()

	select {
	case auth := <-t.connects:
		return auth
	case <-time.After(timeout):
		tst.Fatal("timed out waiting for runtime handshake")
		return cloud.HandshakeAuth{}
	}
}

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

func (t *telemetryCaptureTransport) WaitForCanonicalPayloadWithoutLocalFields(tst *testing.T, timeout time.Duration, want []map[string]any) {
	tst.Helper()

	deadline := time.Now().Add(timeout)
	var lastPayload string
	for time.Now().Before(deadline) {
		select {
		case payload := <-t.payloads:
			lastPayload = payload
			if canonicalPayloadMatches(payload, want) {
				assertCanonicalTelemetryPayloadWithoutLocalFields(tst, payload, want)
				return
			}
		case <-time.After(10 * time.Millisecond):
		}
	}

	tst.Fatalf("timed out waiting for canonical telemetry payload %v, last payload %s", want, lastPayload)
}

func (t *telemetryCaptureTransport) DrainPayloads() {
	for {
		select {
		case <-t.payloads:
		default:
			return
		}
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

type integrationModbusReadKey struct {
	address      uint16
	registerType modbus.RegType
}

type integrationModbusReadCall struct {
	address      uint16
	registerType modbus.RegType
}

type integrationModbusWriteCall struct {
	address uint16
	value   uint16
}

type integrationModbusClient struct {
	mu         sync.Mutex
	values     map[integrationModbusReadKey]uint16
	errors     map[uint16]error
	calls      []integrationModbusReadCall
	writeCalls []integrationModbusWriteCall
	openCount  int
	closeCount int
}

func newIntegrationModbusClient(values map[integrationModbusReadKey]uint16, errors map[uint16]error) *integrationModbusClient {
	return &integrationModbusClient{
		values: values,
		errors: errors,
	}
}

func (c *integrationModbusClient) Open() error {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.openCount++
	return nil
}

func (c *integrationModbusClient) Close() error {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.closeCount++
	return nil
}

func (c *integrationModbusClient) ReadRegister(address uint16, registerType modbus.RegType) (uint16, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.calls = append(c.calls, integrationModbusReadCall{address: address, registerType: registerType})
	if err := c.errors[address]; err != nil {
		return 0, err
	}
	value, ok := c.values[integrationModbusReadKey{address: address, registerType: registerType}]
	if !ok {
		return 0, fmt.Errorf("register %d not configured", address)
	}
	return value, nil
}

func (c *integrationModbusClient) WriteRegister(address uint16, value uint16) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.writeCalls = append(c.writeCalls, integrationModbusWriteCall{address: address, value: value})
	if err := c.errors[address]; err != nil {
		return err
	}
	return nil
}

func (c *integrationModbusClient) ReplaceValues(values map[integrationModbusReadKey]uint16) {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.values = values
}

func (c *integrationModbusClient) AssertRead(t *testing.T, address uint16, registerType modbus.RegType) {
	t.Helper()

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		c.mu.Lock()
		for _, call := range c.calls {
			if call.address == address && call.registerType == registerType {
				c.mu.Unlock()
				return
			}
		}
		c.mu.Unlock()
		time.Sleep(10 * time.Millisecond)
	}

	c.mu.Lock()
	defer c.mu.Unlock()
	t.Fatalf("expected modbus read address=%d registerType=%v, got %+v", address, registerType, c.calls)
}

type timeoutErr struct{}

func (timeoutErr) Error() string {
	return "serial transaction timed out"
}

func (timeoutErr) Timeout() bool {
	return true
}

func (timeoutErr) Temporary() bool {
	return true
}

func writeModbusRuntimeConfig(t *testing.T, stateDir string) string {
	t.Helper()

	configPath := filepath.Join(t.TempDir(), "edge-runtime.yaml")
	body := fmt.Sprintf(`runtime:
  edgeId: 507f1f77bcf86cd799439011
  stateDir: "%s"
  instanceName: integration-modbus-edge

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
  maxReadings: 2

sources:
  - sourceId: rtu-ok
    adapterKind: modbus_rtu
    enabled: true
    pollIntervalMs: 20
    connection:
      port: "COM_FAKE_OK"
      baudRate: 9600
      dataBits: 8
      parity: none
      stopBits: 1
      slaveId: 1
      timeoutMs: 100
    devices:
      - deviceId: environment
        address:
          node: 1
        metrics:
          - metric: temperature
            valueType: number
            mapping:
              registerType: input
              address: 0
              scale: 0.1
      - deviceId: pump_main
        address:
          node: 2
        metrics:
          - metric: actual_state
            valueType: boolean
            mapping:
              registerType: holding
              address: 1
  - sourceId: rtu-fault
    adapterKind: modbus_rtu
    enabled: true
    pollIntervalMs: 20
    connection:
      port: "COM_FAKE_FAIL"
      baudRate: 9600
      dataBits: 8
      parity: none
      stopBits: 1
      slaveId: 2
      timeoutMs: 100
    devices:
      - deviceId: broken_sensor
        address:
          node: 3
        metrics:
          - metric: temperature
            valueType: number
            mapping:
              registerType: input
              address: 7

logging:
  level: info
`, strings.ReplaceAll(stateDir, `\`, `/`))

	if err := os.WriteFile(configPath, []byte(body), 0o600); err != nil {
		t.Fatalf("write modbus runtime config: %v", err)
	}
	return configPath
}

func writeMockRuntimeConfig(t *testing.T, stateDir string) string {
	t.Helper()

	configPath := filepath.Join(t.TempDir(), "edge-runtime.yaml")
	body := fmt.Sprintf(`runtime:
  edgeId: 507f1f77bcf86cd799439011
  stateDir: "%s"
  instanceName: integration-mock-edge

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
  maxReadings: 2

sources:
  - sourceId: mock-source-1
    adapterKind: mock
    enabled: true
    pollIntervalMs: 20
    connection:
      profile: default
    devices:
      - deviceId: pump-1
        address:
          node: 1
        metrics:
          - metric: pressure
            valueType: number
            mapping:
              register: 40001

logging:
  level: info
`, strings.ReplaceAll(stateDir, `\`, `/`))

	if err := os.WriteFile(configPath, []byte(body), 0o600); err != nil {
		t.Fatalf("write mock runtime config: %v", err)
	}
	return configPath
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

func waitForSourceHealth(t *testing.T, manager *source.Manager, sourceID string, state source.SourceHealthState, timeout time.Duration) {
	t.Helper()

	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		snapshot := manager.HealthSnapshot()
		if snapshot[sourceID].State == state {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}

	t.Fatalf("timed out waiting for source %s health %s, last snapshot: %+v", sourceID, state, manager.HealthSnapshot())
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

func assertCanonicalTelemetryPayloadWithoutLocalFields(t *testing.T, raw string, want []map[string]any) {
	t.Helper()

	if strings.Contains(raw, "sourceId") || strings.Contains(raw, "registerType") || strings.Contains(raw, "address") {
		t.Fatalf("cloud telemetry payload must not expose local source or modbus mapping fields: %s", raw)
	}

	var envelope map[string]any
	if err := json.Unmarshal([]byte(raw), &envelope); err != nil {
		t.Fatalf("parse telemetry payload json: %v", err)
	}
	if len(envelope) != 1 {
		t.Fatalf("expected telemetry envelope to contain only readings, got %v", envelope)
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
		if _, ok := reading["ts"].(float64); !ok {
			t.Fatalf("expected telemetry reading %d to contain numeric ts, got %v", i, reading)
		}
		for key, expectedValue := range expected {
			if gotValue, exists := reading[key]; !exists || fmt.Sprint(gotValue) != fmt.Sprint(expectedValue) {
				t.Fatalf("expected telemetry reading %d field %s=%v, got %v in %v", i, key, expectedValue, reading[key], reading)
			}
		}
	}
}

func canonicalPayloadMatches(raw string, want []map[string]any) bool {
	var envelope map[string]any
	if err := json.Unmarshal([]byte(raw), &envelope); err != nil {
		return false
	}

	readingsRaw, ok := envelope["readings"].([]any)
	if !ok || len(readingsRaw) != len(want) {
		return false
	}

	for i, expected := range want {
		reading, ok := readingsRaw[i].(map[string]any)
		if !ok {
			return false
		}
		for key, expectedValue := range expected {
			if gotValue, exists := reading[key]; !exists || fmt.Sprint(gotValue) != fmt.Sprint(expectedValue) {
				return false
			}
		}
	}

	return true
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
