package source

import (
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/simonvetter/modbus"
)

func TestModbusSerialAdapterRejectsInvalidConnection(t *testing.T) {
	cases := []struct {
		name       string
		connection map[string]any
		errSnippet string
	}{
		{
			name: "missing port",
			connection: map[string]any{
				"baudRate":  9600,
				"dataBits":  8,
				"parity":    "none",
				"stopBits":  1,
				"slaveId":   1,
				"timeoutMs": 100,
			},
			errSnippet: "connection.port is required",
		},
		{
			name: "invalid baud rate",
			connection: map[string]any{
				"port":      "COM3",
				"baudRate":  0,
				"dataBits":  8,
				"parity":    "none",
				"stopBits":  1,
				"slaveId":   1,
				"timeoutMs": 100,
			},
			errSnippet: "connection.baudRate must be positive",
		},
		{
			name: "invalid parity",
			connection: map[string]any{
				"port":      "COM3",
				"baudRate":  9600,
				"dataBits":  8,
				"parity":    "mark",
				"stopBits":  1,
				"slaveId":   1,
				"timeoutMs": 100,
			},
			errSnippet: "connection.parity must be none, even, or odd",
		},
		{
			name: "invalid slave id",
			connection: map[string]any{
				"port":      "COM3",
				"baudRate":  9600,
				"dataBits":  8,
				"parity":    "none",
				"stopBits":  1,
				"slaveId":   0,
				"timeoutMs": 100,
			},
			errSnippet: "connection.slaveId must be between 1 and 247",
		},
		{
			name: "invalid timeout",
			connection: map[string]any{
				"port":      "COM3",
				"baudRate":  9600,
				"dataBits":  8,
				"parity":    "none",
				"stopBits":  1,
				"slaveId":   1,
				"timeoutMs": 0,
			},
			errSnippet: "connection.timeoutMs must be positive",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			factoryCalled := false
			adapter := newModbusSerialAdapterWithFactory(func(modbusSerialConnection) (modbusRegisterClient, error) {
				factoryCalled = true
				return &fakeModbusClient{}, nil
			}, fixedNow)

			definition := validModbusDefinition([]MetricDefinition{
				modbusMetric("temperature", "number", "input", 10, nil),
			})
			definition.Connection = tc.connection

			err := adapter.ApplyDefinition(definition, &captureModbusSink{})
			if err == nil {
				t.Fatal("expected invalid connection to be rejected")
			}
			if !strings.Contains(err.Error(), tc.errSnippet) {
				t.Fatalf("expected error containing %q, got %v", tc.errSnippet, err)
			}
			if factoryCalled {
				t.Fatal("client factory must not run for invalid connection")
			}
		})
	}
}

func TestModbusSerialAdapterRejectsInvalidMapping(t *testing.T) {
	cases := []struct {
		name       string
		metric     MetricDefinition
		errSnippet string
	}{
		{
			name:       "unsupported register type",
			metric:     modbusMetric("temperature", "number", "coil", 10, nil),
			errSnippet: "registerType must be input or holding",
		},
		{
			name:       "missing address",
			metric:     MetricDefinition{Metric: "temperature", ValueType: "number", Mapping: map[string]any{"registerType": "input"}},
			errSnippet: "mapping.address is required",
		},
		{
			name:       "negative address",
			metric:     modbusMetric("temperature", "number", "input", -1, nil),
			errSnippet: "mapping.address must be between 0 and 65535",
		},
		{
			name:       "invalid scale",
			metric:     modbusMetric("temperature", "number", "input", 10, "large"),
			errSnippet: "mapping.scale must be a number",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			factoryCalled := false
			adapter := newModbusSerialAdapterWithFactory(func(modbusSerialConnection) (modbusRegisterClient, error) {
				factoryCalled = true
				return &fakeModbusClient{}, nil
			}, fixedNow)

			err := adapter.ApplyDefinition(validModbusDefinition([]MetricDefinition{tc.metric}), &captureModbusSink{})
			if err == nil {
				t.Fatal("expected invalid mapping to be rejected")
			}
			if !strings.Contains(err.Error(), tc.errSnippet) {
				t.Fatalf("expected error containing %q, got %v", tc.errSnippet, err)
			}
			if factoryCalled {
				t.Fatal("client factory must not run for invalid mapping")
			}
		})
	}
}

func TestModbusSerialAdapterReadsRegistersWithScaleAndBooleanConversion(t *testing.T) {
	client := &fakeModbusClient{
		values: map[modbusReadKey]uint16{
			{address: 10, registerType: modbus.INPUT_REGISTER}:   42,
			{address: 20, registerType: modbus.HOLDING_REGISTER}: 9,
			{address: 21, registerType: modbus.HOLDING_REGISTER}: 1,
		},
	}
	adapter := newModbusSerialAdapterWithFactory(func(connection modbusSerialConnection) (modbusRegisterClient, error) {
		if connection.port != "COM3" || connection.baudRate != 9600 || connection.slaveID != 7 {
			t.Fatalf("unexpected parsed connection: %+v", connection)
		}
		return client, nil
	}, fixedNow)
	sink := &captureModbusSink{}

	err := adapter.ApplyDefinition(validModbusDefinition([]MetricDefinition{
		modbusMetric("temperature", "number", "input", 10, 0.5),
		modbusMetric("pressure", "number", "holding", 20, 2),
		modbusMetric("pumpRunning", "boolean", "holding", 21, nil),
	}), sink)
	if err != nil {
		t.Fatalf("apply modbus definition: %v", err)
	}
	defer adapter.Close()

	if _, err := adapter.pollOnce(); err != nil {
		t.Fatalf("poll modbus registers: %v", err)
	}

	readings := sink.readingsSnapshot()
	if len(readings) != 3 {
		t.Fatalf("expected three readings, got %+v", readings)
	}
	assertReading(t, readings[0], "source-rtu", "device-1", "temperature", 21.0)
	assertReading(t, readings[1], "source-rtu", "device-1", "pressure", 18.0)
	assertReading(t, readings[2], "source-rtu", "device-1", "pumpRunning", true)

	calls := client.callsSnapshot()
	if len(calls) != 3 {
		t.Fatalf("expected three modbus reads, got %+v", calls)
	}
	if calls[0].address != 10 || calls[0].registerType != modbus.INPUT_REGISTER {
		t.Fatalf("expected first read to use input register mapping, got %+v", calls[0])
	}
	if calls[1].address != 20 || calls[1].registerType != modbus.HOLDING_REGISTER {
		t.Fatalf("expected second read to use holding register mapping, got %+v", calls[1])
	}
	if calls[2].address != 21 || calls[2].registerType != modbus.HOLDING_REGISTER {
		t.Fatalf("expected boolean read to use holding register mapping, got %+v", calls[2])
	}
}

func TestModbusSerialAdapterEmitsTimeoutFault(t *testing.T) {
	client := &fakeModbusClient{err: timeoutErr{}}
	adapter := newModbusSerialAdapterWithFactory(func(modbusSerialConnection) (modbusRegisterClient, error) {
		return client, nil
	}, fixedNow)
	sink := &captureModbusSink{}

	if err := adapter.ApplyDefinition(validModbusDefinition([]MetricDefinition{
		modbusMetric("temperature", "number", "input", 10, nil),
	}), sink); err != nil {
		t.Fatalf("apply modbus definition: %v", err)
	}
	defer adapter.Close()

	if _, err := adapter.pollOnce(); err != nil {
		t.Fatalf("poll with timeout fault: %v", err)
	}

	if readings := sink.readingsSnapshot(); len(readings) != 0 {
		t.Fatalf("timeout must not publish readings, got %+v", readings)
	}
	faults := sink.faultsSnapshot()
	if len(faults) != 1 {
		t.Fatalf("expected one timeout fault, got %+v", faults)
	}
	if faults[0].SourceID != "source-rtu" || faults[0].Severity != SeverityError || faults[0].Code != "modbus_timeout" {
		t.Fatalf("unexpected timeout fault: %+v", faults[0])
	}
	if faults[0].TS != fixedUnixMilli {
		t.Fatalf("expected deterministic fault timestamp, got %+v", faults[0])
	}
}

func TestModbusSerialAdapterSerializesTransactions(t *testing.T) {
	client := &fakeModbusClient{
		values: map[modbusReadKey]uint16{
			{address: 10, registerType: modbus.INPUT_REGISTER}: 42,
		},
		delay: 50 * time.Millisecond,
	}
	adapter := newModbusSerialAdapterWithFactory(func(modbusSerialConnection) (modbusRegisterClient, error) {
		return client, nil
	}, fixedNow)

	if err := adapter.ApplyDefinition(validModbusDefinition([]MetricDefinition{
		modbusMetric("temperature", "number", "input", 10, nil),
	}), &captureModbusSink{}); err != nil {
		t.Fatalf("apply modbus definition: %v", err)
	}
	defer adapter.Close()

	var wg sync.WaitGroup
	wg.Add(2)
	for i := 0; i < 2; i++ {
		go func() {
			defer wg.Done()
			if _, err := adapter.pollOnce(); err != nil {
				t.Errorf("poll modbus registers: %v", err)
			}
		}()
	}
	wg.Wait()

	if client.maxConcurrentReads() != 1 {
		t.Fatalf("expected one serial transaction at a time, observed %d concurrent reads", client.maxConcurrentReads())
	}
	if len(client.callsSnapshot()) != 2 {
		t.Fatalf("expected both polls to complete, got calls %+v", client.callsSnapshot())
	}
}

const fixedUnixMilli int64 = 1710000000123

func fixedNow() time.Time {
	return time.UnixMilli(fixedUnixMilli)
}

func validModbusDefinition(metrics []MetricDefinition) Definition {
	return Definition{
		SourceID:       "source-rtu",
		AdapterKind:    ModbusRTUKind,
		Enabled:        true,
		PollIntervalMs: 1000,
		Connection: map[string]any{
			"port":      "COM3",
			"baudRate":  9600,
			"dataBits":  8,
			"parity":    "none",
			"stopBits":  1,
			"slaveId":   7,
			"timeoutMs": 250,
		},
		Devices: []DeviceDefinition{
			{
				DeviceID: "device-1",
				Address:  map[string]any{"line": "A"},
				Metrics:  metrics,
			},
		},
	}
}

func modbusMetric(metric string, valueType string, registerType string, address int, scale any) MetricDefinition {
	mapping := map[string]any{
		"registerType": registerType,
		"address":      address,
	}
	if scale != nil {
		mapping["scale"] = scale
	}

	return MetricDefinition{
		Metric:    metric,
		ValueType: valueType,
		Mapping:   mapping,
	}
}

func assertReading(t *testing.T, reading RawReading, sourceID string, deviceID string, metric string, value any) {
	t.Helper()

	if reading.SourceID != sourceID || reading.DeviceID != deviceID || reading.Metric != metric || reading.Value != value || reading.TS != fixedUnixMilli {
		t.Fatalf("unexpected reading: %+v", reading)
	}
	if len(reading.Metadata) != 0 {
		t.Fatalf("adapter must not expose modbus register metadata in readings, got %+v", reading.Metadata)
	}
}

type captureModbusSink struct {
	mu       sync.Mutex
	readings []RawReading
	faults   []Fault
}

func (s *captureModbusSink) PublishReading(reading RawReading) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.readings = append(s.readings, reading)
}

func (s *captureModbusSink) PublishFault(fault Fault) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.faults = append(s.faults, fault)
}

func (s *captureModbusSink) readingsSnapshot() []RawReading {
	s.mu.Lock()
	defer s.mu.Unlock()

	return append([]RawReading(nil), s.readings...)
}

func (s *captureModbusSink) faultsSnapshot() []Fault {
	s.mu.Lock()
	defer s.mu.Unlock()

	return append([]Fault(nil), s.faults...)
}

type modbusReadKey struct {
	address      uint16
	registerType modbus.RegType
}

type modbusReadCall struct {
	address      uint16
	registerType modbus.RegType
}

type fakeModbusClient struct {
	mu             sync.Mutex
	values         map[modbusReadKey]uint16
	err            error
	delay          time.Duration
	calls          []modbusReadCall
	openCount      int
	closeCount     int
	inFlightReads  int
	maxConcurrency int
}

func (c *fakeModbusClient) Open() error {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.openCount++
	return nil
}

func (c *fakeModbusClient) Close() error {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.closeCount++
	return nil
}

func (c *fakeModbusClient) ReadRegister(address uint16, registerType modbus.RegType) (uint16, error) {
	c.mu.Lock()
	c.inFlightReads++
	if c.inFlightReads > c.maxConcurrency {
		c.maxConcurrency = c.inFlightReads
	}
	c.calls = append(c.calls, modbusReadCall{address: address, registerType: registerType})
	c.mu.Unlock()

	if c.delay > 0 {
		time.Sleep(c.delay)
	}

	c.mu.Lock()
	defer c.mu.Unlock()
	c.inFlightReads--

	if c.err != nil {
		return 0, c.err
	}

	value, ok := c.values[modbusReadKey{address: address, registerType: registerType}]
	if !ok {
		return 0, errors.New("register not found")
	}

	return value, nil
}

func (c *fakeModbusClient) callsSnapshot() []modbusReadCall {
	c.mu.Lock()
	defer c.mu.Unlock()

	return append([]modbusReadCall(nil), c.calls...)
}

func (c *fakeModbusClient) maxConcurrentReads() int {
	c.mu.Lock()
	defer c.mu.Unlock()

	return c.maxConcurrency
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
