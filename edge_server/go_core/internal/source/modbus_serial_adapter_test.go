package source

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"math"
	"net"
	"slices"
	"strings"
	"sync"
	"syscall"
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
		{
			name: "invalid settle delay",
			connection: map[string]any{
				"port":          "COM3",
				"baudRate":      9600,
				"dataBits":      8,
				"parity":        "none",
				"stopBits":      1,
				"slaveId":       1,
				"timeoutMs":     100,
				"settleDelayMs": 60001,
			},
			errSnippet: "connection.settleDelayMs must be between 0 and 60000",
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

func TestModbusSerialAdapterParsesOptionalSettleDelay(t *testing.T) {
	client := &fakeModbusClient{
		values: map[modbusReadKey]uint16{
			{address: 10, registerType: modbus.INPUT_REGISTER}: 42,
		},
	}
	adapter := newModbusSerialAdapterWithFactory(func(connection modbusSerialConnection) (modbusRegisterClient, error) {
		if connection.settleDelay != 1500*time.Millisecond {
			t.Fatalf("expected settle delay 1500ms, got %s", connection.settleDelay)
		}
		return client, nil
	}, fixedNow)
	definition := validModbusDefinition([]MetricDefinition{
		modbusMetric("temperature", "number", "input", 10, nil),
	})
	definition.Connection["settleDelayMs"] = 1500

	if err := adapter.ApplyDefinition(definition, &captureModbusSink{}); err != nil {
		t.Fatalf("apply modbus definition: %v", err)
	}
	defer adapter.Close()
}

func TestModbusSerialAdapterUsesAdapterLocalReconnectDefaults(t *testing.T) {
	client := &fakeModbusClient{
		values: map[modbusReadKey]uint16{
			{address: 10, registerType: modbus.INPUT_REGISTER}: 42,
		},
	}
	adapter := newModbusSerialAdapterWithFactory(func(modbusSerialConnection) (modbusRegisterClient, error) {
		return client, nil
	}, fixedNow)

	if adapter.reconnectState != modbusReconnectStateDisconnected {
		t.Fatalf("new adapter should start disconnected, got %q", adapter.reconnectState)
	}
	if adapter.reconnectPolicy.failureThreshold != modbusReconnectFailureThreshold {
		t.Fatalf("expected failure threshold %d, got %d", modbusReconnectFailureThreshold, adapter.reconnectPolicy.failureThreshold)
	}
	if adapter.reconnectPolicy.initialBackoff != modbusReconnectInitialBackoff {
		t.Fatalf("expected initial backoff %s, got %s", modbusReconnectInitialBackoff, adapter.reconnectPolicy.initialBackoff)
	}
	if adapter.reconnectPolicy.maxBackoff != modbusReconnectMaxBackoff {
		t.Fatalf("expected max backoff %s, got %s", modbusReconnectMaxBackoff, adapter.reconnectPolicy.maxBackoff)
	}

	if err := adapter.ApplyDefinition(validModbusDefinition([]MetricDefinition{
		modbusMetric("temperature", "number", "input", 10, nil),
	}), &captureModbusSink{}); err != nil {
		t.Fatalf("apply modbus definition: %v", err)
	}
	adapter.mu.RLock()
	runningState := adapter.reconnectState
	adapter.mu.RUnlock()
	if runningState != modbusReconnectStateConnected {
		t.Fatalf("applied adapter should be connected, got %q", runningState)
	}

	if err := adapter.Close(); err != nil {
		t.Fatalf("close modbus adapter: %v", err)
	}
	adapter.mu.RLock()
	closedState := adapter.reconnectState
	adapter.mu.RUnlock()
	if closedState != modbusReconnectStateDisconnected {
		t.Fatalf("closed adapter should be disconnected, got %q", closedState)
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

func TestModbusSerialAdapterParsesAndConvertsDataType(t *testing.T) {
	cases := []struct {
		name     string
		metric   MetricDefinition
		raw      uint16
		expected any
	}{
		{
			name:     "omitted dataType defaults to uint16",
			metric:   modbusMetric("temperature", "number", "input", 10, 0.1),
			raw:      400,
			expected: 40.0,
		},
		{
			name: "explicit uint16",
			metric: func() MetricDefinition {
				m := modbusMetric("temperature", "number", "input", 10, 0.1)
				m.Mapping["dataType"] = "uint16"
				return m
			}(),
			raw:      400,
			expected: 40.0,
		},
		{
			name: "positive int16",
			metric: func() MetricDefinition {
				m := modbusMetric("temperature", "number", "input", 10, 0.1)
				m.Mapping["dataType"] = "int16"
				return m
			}(),
			raw:      400,
			expected: 40.0,
		},
		{
			name: "negative int16",
			metric: func() MetricDefinition {
				m := modbusMetric("temperature", "number", "input", 10, 0.1)
				m.Mapping["dataType"] = "int16"
				return m
			}(),
			raw:      65136, // -400 in two's complement
			expected: -40.0,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			client := &fakeModbusClient{
				values: map[modbusReadKey]uint16{
					{address: 10, registerType: modbus.INPUT_REGISTER}: tc.raw,
				},
			}
			adapter := newModbusSerialAdapterWithFactory(func(modbusSerialConnection) (modbusRegisterClient, error) {
				return client, nil
			}, fixedNow)

			definition := validModbusDefinition([]MetricDefinition{tc.metric})
			sink := &captureModbusSink{}

			if err := adapter.ApplyDefinition(definition, sink); err != nil {
				t.Fatalf("apply modbus definition: %v", err)
			}
			defer adapter.Close()

			if _, err := adapter.pollOnce(); err != nil {
				t.Fatalf("poll once: %v", err)
			}

			readings := sink.readingsSnapshot()
			if len(readings) != 1 {
				t.Fatalf("expected one reading, got %d", len(readings))
			}
			if readings[0].Value != tc.expected {
				t.Fatalf("expected value %v, got %v", tc.expected, readings[0].Value)
			}
		})
	}
}

func TestModbusSerialAdapterRejectsInvalidDataType(t *testing.T) {
	factoryCalled := false
	adapter := newModbusSerialAdapterWithFactory(func(modbusSerialConnection) (modbusRegisterClient, error) {
		factoryCalled = true
		return &fakeModbusClient{}, nil
	}, fixedNow)

	metric := modbusMetric("temperature", "number", "input", 10, 0.1)
	metric.Mapping["dataType"] = "int32" // invalid
	definition := validModbusDefinition([]MetricDefinition{metric})

	err := adapter.ApplyDefinition(definition, &captureModbusSink{})
	if err == nil {
		t.Fatal("expected invalid dataType to be rejected")
	}
	if !strings.Contains(err.Error(), "mapping.dataType must be uint16 or int16") {
		t.Fatalf("expected error containing 'mapping.dataType must be uint16 or int16', got %v", err)
	}
	if factoryCalled {
		t.Fatal("client factory must not run for invalid mapping")
	}
}

func TestModbusSerialAdapterParsesConfiguredCommandMappings(t *testing.T) {
	adapter := newModbusSerialAdapterWithFactory(func(modbusSerialConnection) (modbusRegisterClient, error) {
		return &fakeModbusClient{}, nil
	}, fixedNow)
	definition := validModbusDefinitionWithCommands(
		[]MetricDefinition{
			modbusMetric("feedback_enabled", "boolean", "input", 31, nil),
			modbusMetric("level_feedback", "number", "input", 52, nil),
		},
		[]CommandDefinition{
			modbusCommand("set_bool", "holding", 321, "feedback_enabled"),
			modbusNumberCommand("set_number", "holding", 444, 10, 90, "level_feedback"),
		},
	)
	definition.Devices[0].DeviceID = "mixing-skid"

	if err := adapter.ApplyDefinition(definition, &captureModbusSink{}); err != nil {
		t.Fatalf("apply modbus definition: %v", err)
	}
	defer adapter.Close()

	adapter.mu.RLock()
	commandMappings := append([]modbusCommandMapping(nil), adapter.commandMappings...)
	adapter.mu.RUnlock()

	if len(commandMappings) != 2 {
		t.Fatalf("expected two command mappings, got %+v", commandMappings)
	}
	boolCommand := commandMappings[0]
	if boolCommand.deviceID != "mixing-skid" || boolCommand.command != "set_bool" {
		t.Fatalf("unexpected set_bool command identity: %+v", boolCommand)
	}
	if boolCommand.registerType != modbus.HOLDING_REGISTER || boolCommand.address != 321 || boolCommand.reportedMetric != "feedback_enabled" || boolCommand.reportedMetricType != "boolean" {
		t.Fatalf("unexpected configured set_bool command mapping: %+v", boolCommand)
	}

	numberCommand := commandMappings[1]
	if numberCommand.deviceID != "mixing-skid" || numberCommand.command != "set_number" {
		t.Fatalf("unexpected set_number command identity: %+v", numberCommand)
	}
	if numberCommand.registerType != modbus.HOLDING_REGISTER || numberCommand.address != 444 || numberCommand.reportedMetric != "level_feedback" || numberCommand.reportedMetricType != "number" {
		t.Fatalf("unexpected configured set_number command mapping: %+v", numberCommand)
	}
	if numberCommand.min != 10 || numberCommand.max != 90 {
		t.Fatalf("expected configured set_number range 10..90, got min=%d max=%d", numberCommand.min, numberCommand.max)
	}
}

func TestModbusSerialAdapterRejectsInvalidCommandMappings(t *testing.T) {
	cases := []struct {
		name       string
		metrics    []MetricDefinition
		command    CommandDefinition
		errSnippet string
	}{
		{
			name: "unsupported command type",
			metrics: []MetricDefinition{
				modbusMetric("feedback_enabled", "boolean", "input", 31, nil),
			},
			command:    modbusCommand("set_float", "holding", 321, "feedback_enabled"),
			errSnippet: "command must be set_bool or set_number",
		},
		{
			name: "set_bool non-holding register",
			metrics: []MetricDefinition{
				modbusMetric("feedback_enabled", "boolean", "input", 31, nil),
			},
			command:    modbusCommand("set_bool", "input", 321, "feedback_enabled"),
			errSnippet: "mapping.registerType must be holding",
		},
		{
			name: "unknown reported metric",
			metrics: []MetricDefinition{
				modbusMetric("feedback_enabled", "boolean", "input", 31, nil),
			},
			command:    modbusCommand("set_bool", "holding", 321, "missing_feedback"),
			errSnippet: "reportedMetric must reference a device metric",
		},
		{
			name: "non-boolean reported metric",
			metrics: []MetricDefinition{
				modbusMetric("feedback_level", "number", "input", 31, nil),
			},
			command:    modbusCommand("set_bool", "holding", 321, "feedback_level"),
			errSnippet: "reportedMetric must reference a boolean metric",
		},
		{
			name: "set_number non-holding register",
			metrics: []MetricDefinition{
				modbusMetric("level_feedback", "number", "input", 52, nil),
			},
			command:    modbusNumberCommand("set_number", "input", 444, 10, 90, "level_feedback"),
			errSnippet: "mapping.registerType must be holding",
		},
		{
			name: "set_number unknown reported metric",
			metrics: []MetricDefinition{
				modbusMetric("level_feedback", "number", "input", 52, nil),
			},
			command:    modbusNumberCommand("set_number", "holding", 444, 10, 90, "missing_feedback"),
			errSnippet: "reportedMetric must reference a device metric",
		},
		{
			name: "set_number non-number reported metric",
			metrics: []MetricDefinition{
				modbusMetric("level_feedback", "boolean", "input", 52, nil),
			},
			command:    modbusNumberCommand("set_number", "holding", 444, 10, 90, "level_feedback"),
			errSnippet: "reportedMetric must reference a number metric",
		},
		{
			name: "set_number missing min",
			metrics: []MetricDefinition{
				modbusMetric("level_feedback", "number", "input", 52, nil),
			},
			command: CommandDefinition{
				Command: "set_number",
				Mapping: map[string]any{
					"registerType": "holding",
					"address":      444,
				},
				Max:            90,
				ReportedMetric: "level_feedback",
			},
			errSnippet: "min is required",
		},
		{
			name: "set_number missing max",
			metrics: []MetricDefinition{
				modbusMetric("level_feedback", "number", "input", 52, nil),
			},
			command: CommandDefinition{
				Command: "set_number",
				Mapping: map[string]any{
					"registerType": "holding",
					"address":      444,
				},
				Min:            10,
				ReportedMetric: "level_feedback",
			},
			errSnippet: "max is required",
		},
		{
			name: "set_number min must be integer",
			metrics: []MetricDefinition{
				modbusMetric("level_feedback", "number", "input", 52, nil),
			},
			command:    modbusNumberCommand("set_number", "holding", 444, 10.5, 90, "level_feedback"),
			errSnippet: "min must be an integer",
		},
		{
			name: "set_number max cannot exceed uint16",
			metrics: []MetricDefinition{
				modbusMetric("level_feedback", "number", "input", 52, nil),
			},
			command:    modbusNumberCommand("set_number", "holding", 444, 10, 70000, "level_feedback"),
			errSnippet: "max must be between 0 and 65535",
		},
		{
			name: "set_number min must not exceed max",
			metrics: []MetricDefinition{
				modbusMetric("level_feedback", "number", "input", 52, nil),
			},
			command:    modbusNumberCommand("set_number", "holding", 444, 90, 10, "level_feedback"),
			errSnippet: "min must be less than or equal to max",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			factoryCalled := false
			adapter := newModbusSerialAdapterWithFactory(func(modbusSerialConnection) (modbusRegisterClient, error) {
				factoryCalled = true
				return &fakeModbusClient{}, nil
			}, fixedNow)

			err := adapter.ApplyDefinition(validModbusDefinitionWithCommands(tc.metrics, []CommandDefinition{tc.command}), &captureModbusSink{})
			if err == nil {
				t.Fatal("expected invalid command mapping to be rejected")
			}
			if !strings.Contains(err.Error(), tc.errSnippet) {
				t.Fatalf("expected error containing %q, got %v", tc.errSnippet, err)
			}
			if factoryCalled {
				t.Fatal("client factory must not run for invalid command mapping")
			}
		})
	}
}

func TestModbusSerialAdapterWritesSetBoolValuesToConfiguredHoldingRegister(t *testing.T) {
	cases := []struct {
		name      string
		value     bool
		wantValue uint16
	}{
		{name: "true writes one", value: true, wantValue: 1},
		{name: "false writes zero", value: false, wantValue: 0},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			client := &fakeModbusClient{
				values: map[modbusReadKey]uint16{
					{address: 31, registerType: modbus.INPUT_REGISTER}: tc.wantValue,
				},
				delay: 10 * time.Millisecond,
			}
			adapter := newModbusSerialAdapterWithFactory(func(modbusSerialConnection) (modbusRegisterClient, error) {
				return client, nil
			}, fixedNow)

			definition := validModbusDefinitionWithCommands(
				[]MetricDefinition{
					modbusMetric("actual_state", "boolean", "input", 31, nil),
				},
				[]CommandDefinition{
					modbusCommand("set_bool", "holding", 160, "actual_state"),
				},
			)
			definition.PollIntervalMs = 60000

			err := adapter.ApplyDefinition(definition, &captureModbusSink{})
			if err != nil {
				t.Fatalf("apply modbus definition: %v", err)
			}
			defer adapter.Close()

			ctx, cancel := context.WithTimeout(context.Background(), time.Second)
			defer cancel()

			resultCh := executeSetBoolCommandAsync(ctx, adapter, tc.value)
			client.waitForWriteCalls(t, 1)

			writes := client.writeCallsSnapshot()
			if len(writes) != 1 {
				t.Fatalf("expected one Modbus write, got %+v", writes)
			}
			if writes[0].address != 160 || writes[0].value != tc.wantValue {
				t.Fatalf("expected holding register 160 write value %d, got %+v", tc.wantValue, writes[0])
			}

			execution := receiveCommandExecution(t, resultCh)
			if execution.err != nil {
				t.Fatalf("execute modbus command: %v", execution.err)
			}
			if execution.result.Status != CommandStatusConfirmed {
				t.Fatalf("successful write should wait for reported state confirmation, got %+v", execution.result)
			}
		})
	}
}

func TestModbusSerialAdapterWritesSetNumberValuesToConfiguredHoldingRegister(t *testing.T) {
	cases := []struct {
		name  string
		value any
		want  uint16
	}{
		{name: "zero", value: 0, want: 0},
		{name: "mid range", value: 128, want: 128},
		{name: "max", value: 255, want: 255},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			client := &fakeModbusClient{
				values: map[modbusReadKey]uint16{
					{address: 52, registerType: modbus.INPUT_REGISTER}: tc.want,
				},
				delay: 10 * time.Millisecond,
			}
			adapter := newModbusSerialAdapterWithFactory(func(modbusSerialConnection) (modbusRegisterClient, error) {
				return client, nil
			}, fixedNow)

			definition := validModbusDefinitionWithCommands(
				[]MetricDefinition{
					modbusMetric("actual_value", "number", "input", 52, nil),
				},
				[]CommandDefinition{
					modbusNumberCommand("set_number", "holding", 162, 0, 255, "actual_value"),
				},
			)
			definition.PollIntervalMs = 60000

			if err := adapter.ApplyDefinition(definition, &captureModbusSink{}); err != nil {
				t.Fatalf("apply modbus definition: %v", err)
			}
			defer adapter.Close()

			ctx, cancel := context.WithTimeout(context.Background(), time.Second)
			defer cancel()

			resultCh := executeSetNumberCommandAsync(ctx, adapter, tc.value)
			client.waitForWriteCalls(t, 1)

			writes := client.writeCallsSnapshot()
			if len(writes) != 1 {
				t.Fatalf("expected one Modbus write, got %+v", writes)
			}
			if writes[0].address != 162 || writes[0].value != tc.want {
				t.Fatalf("expected holding register 162 write value %d, got %+v", tc.want, writes[0])
			}

			execution := receiveCommandExecution(t, resultCh)
			if execution.err != nil {
				t.Fatalf("execute modbus command: %v", execution.err)
			}
			if execution.result.Status != CommandStatusConfirmed {
				t.Fatalf("successful set_number write should wait for reported value confirmation, got %+v", execution.result)
			}
		})
	}
}

func TestModbusSerialAdapterCommandConfirmationRequiresFreshPollObservations(t *testing.T) {
	client := &fakeModbusClient{
		values: map[modbusReadKey]uint16{
			{address: 31, registerType: modbus.INPUT_REGISTER}: 1,
		},
		delay: 10 * time.Millisecond,
	}
	adapter := newModbusSerialAdapterWithFactory(func(modbusSerialConnection) (modbusRegisterClient, error) {
		return client, nil
	}, fixedNow)
	sink := &captureModbusSink{}

	definition := validModbusDefinitionWithCommands(
		[]MetricDefinition{
			modbusMetric("actual_state", "boolean", "input", 31, nil),
		},
		[]CommandDefinition{
			modbusCommand("set_bool", "holding", 160, "actual_state"),
		},
	)
	definition.PollIntervalMs = 60000

	if err := adapter.ApplyDefinition(definition, sink); err != nil {
		t.Fatalf("apply modbus definition: %v", err)
	}
	defer adapter.Close()

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()

	resultCh := executeSetBoolCommandAsync(ctx, adapter, true)
	client.waitForWriteCalls(t, 1)

	execution := receiveCommandExecution(t, resultCh)
	if execution.err != nil {
		t.Fatalf("execute modbus command: %v", execution.err)
	}
	if execution.result.Status != CommandStatusConfirmed {
		t.Fatalf("fresh post-write actual_state readings must confirm command, got %+v", execution.result)
	}

	calls := client.callsSnapshot()
	if len(calls) < modbusCommandConfirmationObservationCount {
		t.Fatalf("confirmation proof needs fresh poll observations, got reads %+v", calls)
	}
	assertOnlyInputReads(t, calls, 31)

	writes := client.writeCallsSnapshot()
	if len(writes) != 1 || writes[0].address != 160 || writes[0].value != 1 {
		t.Fatalf("expected one command write, got %+v", writes)
	}
	if readings := sink.readingsSnapshot(); len(readings) < modbusCommandConfirmationObservationCount {
		t.Fatalf("pollOnce should publish confirmation observations, got %+v", readings)
	}
}

func TestModbusSerialAdapterCommandConfirmationRejectsStalePreWriteState(t *testing.T) {
	client := &fakeModbusClient{
		values: map[modbusReadKey]uint16{
			{address: 31, registerType: modbus.INPUT_REGISTER}: 1,
		},
		delay: 10 * time.Millisecond,
	}
	adapter := newModbusSerialAdapterWithFactory(func(modbusSerialConnection) (modbusRegisterClient, error) {
		return client, nil
	}, fixedNow)

	definition := validModbusDefinitionWithCommands(
		[]MetricDefinition{
			modbusMetric("actual_state", "boolean", "input", 31, nil),
		},
		[]CommandDefinition{
			modbusCommand("set_bool", "holding", 160, "actual_state"),
		},
	)
	definition.PollIntervalMs = 60000

	if err := adapter.ApplyDefinition(definition, &captureModbusSink{}); err != nil {
		t.Fatalf("apply modbus definition: %v", err)
	}
	defer adapter.Close()

	for i := 0; i < 2; i++ {
		if _, err := adapter.pollOnce(); err != nil {
			t.Fatalf("poll stale state fixture: %v", err)
		}
	}
	client.setValue(modbusReadKey{address: 31, registerType: modbus.INPUT_REGISTER}, 0)

	ctx, cancel := context.WithTimeout(context.Background(), 150*time.Millisecond)
	defer cancel()

	resultCh := executeSetBoolCommandAsync(ctx, adapter, true)
	client.waitForWriteCalls(t, 1)

	execution := receiveCommandExecution(t, resultCh)
	if execution.err != nil {
		t.Fatalf("execute modbus command: %v", execution.err)
	}
	if execution.result.Status != CommandStatusTimeout {
		t.Fatalf("stale pre-write actual_state must not confirm command, got %+v", execution.result)
	}
	assertOnlyInputReads(t, client.callsSnapshot(), 31)
}

func TestModbusSerialAdapterCommandConfirmationRejectsInFlightPreWritePollObservations(t *testing.T) {
	client := &fakeModbusClient{
		values: map[modbusReadKey]uint16{
			{address: 31, registerType: modbus.INPUT_REGISTER}: 1,
		},
	}
	adapter := newModbusSerialAdapterWithFactory(func(modbusSerialConnection) (modbusRegisterClient, error) {
		return client, nil
	}, fixedNow)
	sink := newBlockingModbusSink()

	definition := validModbusDefinitionWithCommands(
		[]MetricDefinition{
			modbusMetric("actual_state", "boolean", "input", 31, nil),
		},
		[]CommandDefinition{
			modbusCommand("set_bool", "holding", 160, "actual_state"),
		},
	)
	definition.PollIntervalMs = 60000

	if err := adapter.ApplyDefinition(definition, sink); err != nil {
		t.Fatalf("apply modbus definition: %v", err)
	}
	defer adapter.Close()

	pollResults := make(chan error, 2)
	for i := 0; i < 2; i++ {
		go func() {
			_, err := adapter.pollOnce()
			pollResults <- err
		}()
	}
	sink.waitForBlockedReadings(t, 2)
	client.setValue(modbusReadKey{address: 31, registerType: modbus.INPUT_REGISTER}, 0)

	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()

	resultCh := executeSetBoolCommandAsync(ctx, adapter, true)
	client.waitForWriteCalls(t, 1)
	sink.release()

	for i := 0; i < 2; i++ {
		if err := <-pollResults; err != nil {
			t.Fatalf("poll stale in-flight state fixture: %v", err)
		}
	}

	execution := receiveCommandExecution(t, resultCh)
	if execution.err != nil {
		t.Fatalf("execute modbus command: %v", execution.err)
	}
	if execution.result.Status != CommandStatusTimeout {
		t.Fatalf("pre-write poll observations recorded after write must not confirm command, got %+v", execution.result)
	}
	assertOnlyInputReads(t, client.callsSnapshot(), 31)
}

func TestModbusSerialAdapterCommandConfirmationTimesOutWithoutMatchingState(t *testing.T) {
	client := &fakeModbusClient{
		values: map[modbusReadKey]uint16{
			{address: 31, registerType: modbus.INPUT_REGISTER}: 0,
		},
		delay: 10 * time.Millisecond,
	}
	adapter := newModbusSerialAdapterWithFactory(func(modbusSerialConnection) (modbusRegisterClient, error) {
		return client, nil
	}, fixedNow)

	definition := validModbusDefinitionWithCommands(
		[]MetricDefinition{
			modbusMetric("actual_state", "boolean", "input", 31, nil),
		},
		[]CommandDefinition{
			modbusCommand("set_bool", "holding", 160, "actual_state"),
		},
	)
	definition.PollIntervalMs = 60000

	if err := adapter.ApplyDefinition(definition, &captureModbusSink{}); err != nil {
		t.Fatalf("apply modbus definition: %v", err)
	}
	defer adapter.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()

	resultCh := executeSetBoolCommandAsync(ctx, adapter, true)
	client.waitForWriteCalls(t, 1)

	execution := receiveCommandExecution(t, resultCh)
	if execution.err != nil {
		t.Fatalf("execute modbus command: %v", execution.err)
	}
	if execution.result.Status != CommandStatusTimeout {
		t.Fatalf("missing matching reported state must time out, got %+v", execution.result)
	}
	assertOnlyInputReads(t, client.callsSnapshot(), 31)
}

func TestModbusSerialAdapterSetNumberCommandConfirmationRequiresFreshActualValuePolling(t *testing.T) {
	actualValueKey := modbusReadKey{address: 52, registerType: modbus.INPUT_REGISTER}
	client := &fakeModbusClient{
		values: map[modbusReadKey]uint16{
			actualValueKey: 128,
		},
		readSequences: map[modbusReadKey][]uint16{
			actualValueKey: {7, 128, 128},
		},
	}
	adapter := newModbusSerialAdapterWithFactory(func(modbusSerialConnection) (modbusRegisterClient, error) {
		return client, nil
	}, fixedNow)
	sink := &captureModbusSink{}

	definition := validModbusDefinitionWithCommands(
		[]MetricDefinition{
			modbusMetric("actual_value", "number", "input", 52, nil),
		},
		[]CommandDefinition{
			modbusNumberCommand("set_number", "holding", 162, 0, 255, "actual_value"),
		},
	)
	definition.PollIntervalMs = 60000

	if err := adapter.ApplyDefinition(definition, sink); err != nil {
		t.Fatalf("apply modbus definition: %v", err)
	}
	defer adapter.Close()

	client.waitForReadCalls(t, 1)
	client.clearCalls()
	sink.clearReadings()

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()

	resultCh := executeSetNumberCommandAsync(ctx, adapter, 128)
	client.waitForWriteCalls(t, 1)

	execution := receiveCommandExecution(t, resultCh)
	if execution.err != nil {
		t.Fatalf("execute modbus set_number command: %v", execution.err)
	}
	if execution.result.Status != CommandStatusConfirmed {
		t.Fatalf("fresh post-write actual_value readings must confirm set_number, got %+v", execution.result)
	}

	calls := client.callsSnapshot()
	if len(calls) != modbusCommandForcedPollAttempts {
		t.Fatalf("confirmation should use exactly bounded forced normal polls after write, got reads %+v", calls)
	}
	assertOnlyInputReads(t, calls, 52)

	writes := client.writeCallsSnapshot()
	if len(writes) != 1 || writes[0].address != 162 || writes[0].value != 128 {
		t.Fatalf("expected one set_number command write, got %+v", writes)
	}
	readings := sink.readingsSnapshot()
	if len(readings) != modbusCommandForcedPollAttempts {
		t.Fatalf("forced poll observations should publish as normal telemetry, got %+v", readings)
	}
	for _, reading := range readings {
		assertReading(t, reading, "source-rtu", "device-1", "actual_value", 128.0)
	}
}

func TestModbusSerialAdapterSetNumberCommandConfirmationRejectsStaleSameValueActualValue(t *testing.T) {
	actualValueKey := modbusReadKey{address: 52, registerType: modbus.INPUT_REGISTER}
	client := &fakeModbusClient{
		values: map[modbusReadKey]uint16{
			actualValueKey: 128,
		},
		readSequences: map[modbusReadKey][]uint16{
			actualValueKey: {128},
		},
	}
	adapter := newModbusSerialAdapterWithFactory(func(modbusSerialConnection) (modbusRegisterClient, error) {
		return client, nil
	}, fixedNow)

	definition := validModbusDefinitionWithCommands(
		[]MetricDefinition{
			modbusMetric("actual_value", "number", "input", 52, nil),
		},
		[]CommandDefinition{
			modbusNumberCommand("set_number", "holding", 162, 0, 255, "actual_value"),
		},
	)
	definition.PollIntervalMs = 60000

	if err := adapter.ApplyDefinition(definition, &captureModbusSink{}); err != nil {
		t.Fatalf("apply modbus definition: %v", err)
	}
	defer adapter.Close()

	client.waitForReadCalls(t, 1)
	client.setValue(actualValueKey, 0)
	client.clearCalls()

	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()

	resultCh := executeSetNumberCommandAsync(ctx, adapter, 128)
	client.waitForWriteCalls(t, 1)

	execution := receiveCommandExecution(t, resultCh)
	if execution.err != nil {
		t.Fatalf("execute modbus set_number command: %v", execution.err)
	}
	if execution.result.Status != CommandStatusTimeout {
		t.Fatalf("stale same-value pre-write actual_value must not confirm set_number, got %+v", execution.result)
	}
	assertOnlyInputReads(t, client.callsSnapshot(), 52)
}

func TestModbusSerialAdapterSetNumberCommandConfirmationTimesOutWithoutMatchingActualValue(t *testing.T) {
	client := &fakeModbusClient{
		values: map[modbusReadKey]uint16{
			{address: 52, registerType: modbus.INPUT_REGISTER}: 64,
		},
	}
	adapter := newModbusSerialAdapterWithFactory(func(modbusSerialConnection) (modbusRegisterClient, error) {
		return client, nil
	}, fixedNow)

	definition := validModbusDefinitionWithCommands(
		[]MetricDefinition{
			modbusMetric("actual_value", "number", "input", 52, nil),
		},
		[]CommandDefinition{
			modbusNumberCommand("set_number", "holding", 162, 0, 255, "actual_value"),
		},
	)
	definition.PollIntervalMs = 60000

	if err := adapter.ApplyDefinition(definition, &captureModbusSink{}); err != nil {
		t.Fatalf("apply modbus definition: %v", err)
	}
	defer adapter.Close()

	client.waitForReadCalls(t, 1)
	client.clearCalls()

	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()

	resultCh := executeSetNumberCommandAsync(ctx, adapter, 128)
	client.waitForWriteCalls(t, 1)

	execution := receiveCommandExecution(t, resultCh)
	if execution.err != nil {
		t.Fatalf("execute modbus set_number command: %v", execution.err)
	}
	if execution.result.Status != CommandStatusTimeout {
		t.Fatalf("missing matching actual_value must time out, got %+v", execution.result)
	}
	assertOnlyInputReads(t, client.callsSnapshot(), 52)
}

func TestModbusSerialAdapterSetNumberCommandDoesNotPublishDesiredValueAsTelemetry(t *testing.T) {
	actualValueKey := modbusReadKey{address: 52, registerType: modbus.INPUT_REGISTER}
	client := &fakeModbusClient{
		values: map[modbusReadKey]uint16{
			actualValueKey: 7,
		},
	}
	adapter := newModbusSerialAdapterWithFactory(func(modbusSerialConnection) (modbusRegisterClient, error) {
		return client, nil
	}, fixedNow)
	sink := &captureModbusSink{}

	definition := validModbusDefinitionWithCommands(
		[]MetricDefinition{
			modbusMetric("actual_value", "number", "input", 52, nil),
		},
		[]CommandDefinition{
			modbusNumberCommand("set_number", "holding", 162, 0, 255, "actual_value"),
		},
	)
	definition.PollIntervalMs = 60000

	if err := adapter.ApplyDefinition(definition, sink); err != nil {
		t.Fatalf("apply modbus definition: %v", err)
	}
	defer adapter.Close()

	client.waitForReadCalls(t, 1)
	client.clearCalls()
	sink.clearReadings()

	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()

	resultCh := executeSetNumberCommandAsync(ctx, adapter, 128)
	client.waitForWriteCalls(t, 1)

	execution := receiveCommandExecution(t, resultCh)
	if execution.err != nil {
		t.Fatalf("execute modbus set_number command: %v", execution.err)
	}
	if execution.result.Status != CommandStatusTimeout {
		t.Fatalf("non-matching actual_value fixture should time out, got %+v", execution.result)
	}

	for _, reading := range sink.readingsSnapshot() {
		if reading.Metric != "actual_value" {
			t.Fatalf("unexpected telemetry metric during confirmation: %+v", reading)
		}
		if reading.Value == 128.0 {
			t.Fatalf("desired set_number value must not be emitted as telemetry, got %+v", reading)
		}
		if reading.Value != 7.0 {
			t.Fatalf("telemetry must publish polled actual_value only, got %+v", reading)
		}
	}
	writes := client.writeCallsSnapshot()
	if len(writes) != 1 || writes[0].address != 162 || writes[0].value != 128 {
		t.Fatalf("expected one set_number command write, got %+v", writes)
	}
}

func executeSetBoolCommandAsync(ctx context.Context, adapter *ModbusSerialAdapter, value bool) <-chan commandExecution {
	resultCh := make(chan commandExecution, 1)
	go func() {
		result, err := adapter.ExecuteCommand(ctx, CommandRequest{
			DeviceID: "device-1",
			Command:  "set_bool",
			Value:    value,
		})
		resultCh <- commandExecution{result: result, err: err}
	}()

	return resultCh
}

func executeSetNumberCommandAsync(ctx context.Context, adapter *ModbusSerialAdapter, value any) <-chan commandExecution {
	resultCh := make(chan commandExecution, 1)
	go func() {
		result, err := adapter.ExecuteCommand(ctx, CommandRequest{
			DeviceID: "device-1",
			Command:  "set_number",
			Value:    value,
		})
		resultCh <- commandExecution{result: result, err: err}
	}()

	return resultCh
}

type commandExecution struct {
	result CommandResult
	err    error
}

func receiveCommandExecution(t *testing.T, resultCh <-chan commandExecution) commandExecution {
	t.Helper()

	select {
	case execution := <-resultCh:
		return execution
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for command execution")
		return commandExecution{}
	}
}

func TestModbusSerialAdapterReturnsFailedWhenSetBoolWriteFails(t *testing.T) {
	client := &fakeModbusClient{writeErr: errors.New("serial write rejected")}
	adapter := newModbusSerialAdapterWithFactory(func(modbusSerialConnection) (modbusRegisterClient, error) {
		return client, nil
	}, fixedNow)

	err := adapter.ApplyDefinition(validModbusDefinitionWithCommands(
		[]MetricDefinition{
			modbusMetric("actual_state", "boolean", "input", 31, nil),
		},
		[]CommandDefinition{
			modbusCommand("set_bool", "holding", 160, "actual_state"),
		},
	), &captureModbusSink{})
	if err != nil {
		t.Fatalf("apply modbus definition: %v", err)
	}
	defer adapter.Close()

	result, err := adapter.ExecuteCommand(context.Background(), CommandRequest{
		DeviceID: "device-1",
		Command:  "set_bool",
		Value:    true,
	})
	if err != nil {
		t.Fatalf("execute modbus command: %v", err)
	}
	if result.Status != CommandStatusFailed {
		t.Fatalf("write failure must return failed, got %+v", result)
	}
	if !strings.Contains(result.Reason, "write modbus command") {
		t.Fatalf("expected write failure reason, got %+v", result)
	}

	writes := client.writeCallsSnapshot()
	if len(writes) != 1 || writes[0].address != 160 || writes[0].value != 1 {
		t.Fatalf("failed write should still be attempted through the write abstraction, got %+v", writes)
	}
}

func TestModbusSerialAdapterRejectsNonBooleanSetBoolValueWithoutWriting(t *testing.T) {
	client := &fakeModbusClient{}
	adapter := newModbusSerialAdapterWithFactory(func(modbusSerialConnection) (modbusRegisterClient, error) {
		return client, nil
	}, fixedNow)

	err := adapter.ApplyDefinition(validModbusDefinitionWithCommands(
		[]MetricDefinition{
			modbusMetric("actual_state", "boolean", "input", 31, nil),
		},
		[]CommandDefinition{
			modbusCommand("set_bool", "holding", 160, "actual_state"),
		},
	), &captureModbusSink{})
	if err != nil {
		t.Fatalf("apply modbus definition: %v", err)
	}
	defer adapter.Close()

	result, err := adapter.ExecuteCommand(context.Background(), CommandRequest{
		DeviceID: "device-1",
		Command:  "set_bool",
		Value:    "true",
	})
	if err != nil {
		t.Fatalf("execute modbus command: %v", err)
	}
	if result.Status != CommandStatusFailed {
		t.Fatalf("non-boolean set_bool value must fail, got %+v", result)
	}
	if !strings.Contains(result.Reason, "boolean") {
		t.Fatalf("expected boolean validation reason, got %+v", result)
	}
	if writes := client.writeCallsSnapshot(); len(writes) != 0 {
		t.Fatalf("invalid value must not invoke Modbus write, got %+v", writes)
	}
}

func TestModbusSerialAdapterRejectsInvalidSetNumberValuesWithoutWriting(t *testing.T) {
	cases := []struct {
		name       string
		value      any
		errSnippet string
	}{
		{name: "non-number", value: "128", errSnippet: "set_number value must be numeric"},
		{name: "fractional", value: 12.5, errSnippet: "set_number value must be an integer"},
		{name: "NaN", value: math.NaN(), errSnippet: "set_number value must be finite"},
		{name: "infinity", value: math.Inf(1), errSnippet: "set_number value must be finite"},
		{name: "below configured range", value: -1, errSnippet: "set_number value must be between 0 and 255"},
		{name: "above configured range", value: 256, errSnippet: "set_number value must be between 0 and 255"},
		{name: "outside uint16", value: 70000, errSnippet: "set_number value must be between 0 and 65535"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			client := &fakeModbusClient{}
			adapter := newModbusSerialAdapterWithFactory(func(modbusSerialConnection) (modbusRegisterClient, error) {
				return client, nil
			}, fixedNow)

			err := adapter.ApplyDefinition(validModbusDefinitionWithCommands(
				[]MetricDefinition{
					modbusMetric("actual_value", "number", "input", 52, nil),
				},
				[]CommandDefinition{
					modbusNumberCommand("set_number", "holding", 162, 0, 255, "actual_value"),
				},
			), &captureModbusSink{})
			if err != nil {
				t.Fatalf("apply modbus definition: %v", err)
			}
			defer adapter.Close()

			result, err := adapter.ExecuteCommand(context.Background(), CommandRequest{
				DeviceID: "device-1",
				Command:  "set_number",
				Value:    tc.value,
			})
			if err != nil {
				t.Fatalf("execute modbus command: %v", err)
			}
			if result.Status != CommandStatusFailed {
				t.Fatalf("invalid set_number value must fail, got %+v", result)
			}
			if !strings.Contains(result.Reason, tc.errSnippet) {
				t.Fatalf("expected reason containing %q, got %+v", tc.errSnippet, result)
			}
			if writes := client.writeCallsSnapshot(); len(writes) != 0 {
				t.Fatalf("invalid set_number value must not invoke Modbus write, got %+v", writes)
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

func TestSequentialFakeModbusClientFactoryTracksLifecycle(t *testing.T) {
	first := &fakeModbusClient{
		values: map[modbusReadKey]uint16{
			{address: 31, registerType: modbus.INPUT_REGISTER}: 0,
		},
	}
	second := &fakeModbusClient{
		values: map[modbusReadKey]uint16{
			{address: 31, registerType: modbus.INPUT_REGISTER}: 1,
		},
	}
	factory := newSequentialFakeModbusClientFactory(t, first, second)
	adapter := newModbusSerialAdapterWithFactory(factory.factory, fixedNow)
	definition := validModbusDefinitionWithCommands(
		[]MetricDefinition{
			modbusMetric("actual_state", "boolean", "input", 31, nil),
		},
		[]CommandDefinition{
			modbusCommand("set_bool", "holding", 160, "actual_state"),
		},
	)
	definition.PollIntervalMs = 60000

	if err := adapter.ApplyDefinition(definition, &captureModbusSink{}); err != nil {
		t.Fatalf("apply first modbus definition: %v", err)
	}
	first.waitForReadCalls(t, 1)

	secondSink := &captureModbusSink{}
	if err := adapter.ApplyDefinition(definition, secondSink); err != nil {
		t.Fatalf("apply second modbus definition: %v", err)
	}
	second.waitForReadCalls(t, 1)

	connections := factory.connectionsSnapshot()
	adapter.mu.RLock()
	storedSourceID := adapter.sourceID
	storedSink := adapter.sink
	storedConnection := adapter.connection
	storedMappings := append([]modbusMetricMapping(nil), adapter.mappings...)
	storedCommandMappings := append([]modbusCommandMapping(nil), adapter.commandMappings...)
	adapter.mu.RUnlock()
	if storedSourceID != definition.SourceID || storedSink != secondSink {
		t.Fatalf("expected applied source identity and sink to be retained for reconnect")
	}
	if len(connections) != 2 || storedConnection != connections[1] {
		t.Fatalf("expected parsed connection to be retained for reconnect, got %+v", storedConnection)
	}
	if len(storedMappings) != 1 || len(storedCommandMappings) != 1 {
		t.Fatalf("expected parsed metric and command mappings to be retained for reconnect")
	}

	result, err := adapter.ExecuteCommand(context.Background(), CommandRequest{
		DeviceID: "device-1",
		Command:  "set_bool",
		Value:    true,
	})
	if err != nil {
		t.Fatalf("execute command through second client: %v", err)
	}
	if result.Status != CommandStatusConfirmed {
		t.Fatalf("expected confirmed command through second client, got %+v", result)
	}

	if err := adapter.Close(); err != nil {
		t.Fatalf("close modbus adapter: %v", err)
	}

	factory.assertConnectionCount(t, 2)
	factory.assertAllConnectionsEqual(t)
	factory.assertLifecycle(t, []string{
		"client[0].open",
		"client[0].close",
		"client[1].open",
		"client[1].close",
	})
	first.assertOpenCount(t, 1)
	first.assertCloseCount(t, 1)
	first.assertReadCalls(t, []modbusReadCall{{address: 31, registerType: modbus.INPUT_REGISTER}})
	second.assertOpenCount(t, 1)
	second.assertCloseCount(t, 1)
	second.assertReadCalls(t, []modbusReadCall{
		{address: 31, registerType: modbus.INPUT_REGISTER},
		{address: 31, registerType: modbus.INPUT_REGISTER},
		{address: 31, registerType: modbus.INPUT_REGISTER},
	})
	second.assertWriteCalls(t, []modbusWriteCall{{address: 160, value: 1}})
}

func TestModbusSerialAdapterRejectsStaleClientSnapshotAfterReplacement(t *testing.T) {
	first := &fakeModbusClient{
		values: map[modbusReadKey]uint16{
			{address: 31, registerType: modbus.INPUT_REGISTER}: 0,
		},
	}
	second := &fakeModbusClient{
		values: map[modbusReadKey]uint16{
			{address: 52, registerType: modbus.INPUT_REGISTER}: 1,
		},
	}
	factory := newSequentialFakeModbusClientFactory(t, first, second)
	adapter := newModbusSerialAdapterWithFactory(factory.factory, fixedNow)

	firstDefinition := validModbusDefinitionWithCommands(
		[]MetricDefinition{
			modbusMetric("first_state", "boolean", "input", 31, nil),
		},
		[]CommandDefinition{
			modbusCommand("set_bool", "holding", 160, "first_state"),
		},
	)
	firstDefinition.PollIntervalMs = 60000
	if err := adapter.ApplyDefinition(firstDefinition, &captureModbusSink{}); err != nil {
		t.Fatalf("apply first modbus definition: %v", err)
	}
	first.waitForReadCalls(t, 1)

	_, _, staleClient, staleMappings, err := adapter.snapshot()
	if err != nil {
		t.Fatalf("snapshot first applied definition: %v", err)
	}
	staleCommandClient, staleCommandMapping, ok, err := adapter.commandSnapshot("device-1", "set_bool")
	if err != nil || !ok {
		t.Fatalf("snapshot first command mapping: ok=%t err=%v", ok, err)
	}

	secondDefinition := validModbusDefinition([]MetricDefinition{
		modbusMetric("second_state", "boolean", "input", 52, nil),
	})
	secondDefinition.PollIntervalMs = 60000
	if err := adapter.ApplyDefinition(secondDefinition, &captureModbusSink{}); err != nil {
		t.Fatalf("apply second modbus definition: %v", err)
	}
	defer adapter.Close()
	second.waitForReadCalls(t, 1)

	first.clearCalls()
	if _, _, err := adapter.readModbusRegister(staleClient, staleMappings[0]); err == nil {
		t.Fatal("expected stale client snapshot to be rejected after replacement")
	}
	if calls := first.callsSnapshot(); len(calls) != 0 {
		t.Fatalf("stale client snapshot must not perform Modbus I/O, got %+v", calls)
	}
	if _, err := adapter.writeModbusCommandRegister(staleCommandClient, staleCommandMapping.address, 1); err == nil {
		t.Fatal("expected stale command client snapshot to be rejected after replacement")
	}
	if writes := first.writeCallsSnapshot(); len(writes) != 0 {
		t.Fatalf("stale command client snapshot must not perform Modbus I/O, got %+v", writes)
	}
}

func TestModbusSerialAdapterRepeatedReadFailuresEnterReconnect(t *testing.T) {
	stale := &fakeModbusClient{
		values: map[modbusReadKey]uint16{
			{address: 10, registerType: modbus.INPUT_REGISTER}: 42,
		},
		readErrSequences: map[modbusReadKey][]error{
			{address: 20, registerType: modbus.INPUT_REGISTER}: repeatModbusErrors(syscall.Errno(5), 100),
		},
	}
	unusedReplacement := &fakeModbusClient{}
	factory := newSequentialFakeModbusClientFactory(t, stale, unusedReplacement)
	adapter := newModbusSerialAdapterWithFactory(factory.factory, fixedNow)
	adapter.reconnectPolicy.initialBackoff = time.Second
	adapter.reconnectPolicy.maxBackoff = time.Second
	sink := &captureModbusSink{}

	definition := validModbusDefinition([]MetricDefinition{
		modbusMetric("temperature", "number", "input", 10, nil),
		modbusMetric("pressure", "number", "input", 20, nil),
	})
	definition.PollIntervalMs = 2
	if err := adapter.ApplyDefinition(definition, sink); err != nil {
		t.Fatalf("apply modbus definition: %v", err)
	}

	stale.waitForCloseCalls(t, 1)
	waitForModbusReconnectState(t, adapter, modbusReconnectStateReconnecting)

	if faults := sink.faultsSnapshot(); len(faults) < modbusReconnectFailureThreshold {
		t.Fatalf("expected at least %d read faults before reconnect, got %+v", modbusReconnectFailureThreshold, faults)
	}
	if readings := sink.readingsSnapshot(); len(readings) != 0 {
		t.Fatalf("reconnect-candidate poll cycles must not publish partial telemetry, got %+v", readings)
	}
	factory.assertConnectionCount(t, 1)
	stale.assertCloseCount(t, 1)
	unusedReplacement.assertOpenCount(t, 0)

	if err := adapter.Close(); err != nil {
		t.Fatalf("close reconnecting modbus adapter: %v", err)
	}
	stale.assertCloseCount(t, 1)
}

func TestModbusSerialAdapterReconnectRequiresSuccessfulPoll(t *testing.T) {
	stale := &fakeModbusClient{err: timeoutErr{}}
	openedWithoutReading := &fakeModbusClient{
		values: map[modbusReadKey]uint16{
			{address: 10, registerType: modbus.INPUT_REGISTER}: 41,
		},
		readErrSequences: map[modbusReadKey][]error{
			{address: 20, registerType: modbus.INPUT_REGISTER}: {timeoutErr{}},
		},
	}
	recovered := &fakeModbusClient{
		values: map[modbusReadKey]uint16{
			{address: 10, registerType: modbus.INPUT_REGISTER}: 42,
			{address: 20, registerType: modbus.INPUT_REGISTER}: 84,
		},
	}
	factory := newSequentialFakeModbusClientFactory(t, stale, openedWithoutReading, recovered)
	adapter := newModbusSerialAdapterWithFactory(factory.factory, fixedNow)
	adapter.reconnectPolicy.failureThreshold = 1
	adapter.reconnectPolicy.initialBackoff = time.Millisecond
	adapter.reconnectPolicy.maxBackoff = time.Millisecond
	sink := &captureModbusSink{}

	definition := validModbusDefinition([]MetricDefinition{
		modbusMetric("temperature", "number", "input", 10, nil),
		modbusMetric("pressure", "number", "input", 20, nil),
	})
	definition.Connection["settleDelayMs"] = 1
	definition.PollIntervalMs = 60000
	if err := adapter.ApplyDefinition(definition, sink); err != nil {
		t.Fatalf("apply modbus definition: %v", err)
	}
	defer adapter.Close()

	openedWithoutReading.waitForReadCalls(t, 1)
	waitForModbusReconnectState(t, adapter, modbusReconnectStateReconnecting)
	if readings := sink.readingsSnapshot(); len(readings) != 0 {
		t.Fatalf("successful reopen without a successful poll must not publish telemetry, got %+v", readings)
	}
	openedWithoutReading.waitForCloseCalls(t, 1)

	recovered.waitForReadCalls(t, 1)
	waitForModbusReconnectState(t, adapter, modbusReconnectStateConnected)

	factory.assertConnectionCount(t, 3)
	factory.assertAllConnectionsEqual(t)
	stale.assertCloseCount(t, 1)
	openedWithoutReading.assertOpenCount(t, 1)
	openedWithoutReading.assertCloseCount(t, 1)
	recovered.assertOpenCount(t, 1)

	readings := sink.readingsSnapshot()
	if len(readings) == 0 {
		t.Fatal("expected telemetry after the successful recovery poll")
	}
	for _, reading := range readings {
		if reading.Value == 41.0 {
			t.Fatalf("partial reconnect probe must not publish telemetry, got %+v", readings)
		}
	}
}

func TestModbusSerialAdapterSharesReadAndWriteTransportFailureAccounting(t *testing.T) {
	client := &fakeModbusClient{
		err:      timeoutErr{},
		writeErr: timeoutErr{},
	}
	factory := newSequentialFakeModbusClientFactory(t, client, &fakeModbusClient{})
	adapter := newModbusSerialAdapterWithFactory(factory.factory, fixedNow)
	adapter.reconnectPolicy.initialBackoff = time.Second
	adapter.reconnectPolicy.maxBackoff = time.Second

	definition := validModbusDefinitionWithCommands(
		[]MetricDefinition{
			modbusMetric("actual_state", "boolean", "input", 31, nil),
		},
		[]CommandDefinition{
			modbusCommand("set_bool", "holding", 160, "actual_state"),
		},
	)
	definition.PollIntervalMs = 60000
	if err := adapter.ApplyDefinition(definition, &captureModbusSink{}); err != nil {
		t.Fatalf("apply modbus definition: %v", err)
	}
	defer adapter.Close()
	client.waitForReadCalls(t, 1)

	for i := 0; i < 2; i++ {
		result, err := adapter.ExecuteCommand(context.Background(), CommandRequest{
			DeviceID: "device-1",
			Command:  "set_bool",
			Value:    true,
		})
		if err != nil {
			t.Fatalf("execute failing command %d: %v", i+1, err)
		}
		if result.Status != CommandStatusFailed {
			t.Fatalf("transport write failure must fail command, got %+v", result)
		}
	}

	client.waitForCloseCalls(t, 1)
	result, err := adapter.ExecuteCommand(context.Background(), CommandRequest{
		DeviceID: "device-1",
		Command:  "set_bool",
		Value:    true,
	})
	if err != nil {
		t.Fatalf("execute command while reconnecting: %v", err)
	}
	if result.Status != CommandStatusFailed || !strings.Contains(result.Reason, "unavailable") {
		t.Fatalf("reconnecting command must fail unavailable, got %+v", result)
	}
	client.assertWriteCalls(t, []modbusWriteCall{
		{address: 160, value: 1},
		{address: 160, value: 1},
	})
}

func TestModbusSerialAdapterRepeatedWriteFailuresReconnectWithoutObservationLock(t *testing.T) {
	stale := &fakeModbusClient{
		values: map[modbusReadKey]uint16{
			{address: 31, registerType: modbus.INPUT_REGISTER}: 0,
		},
		writeErr: errors.New("unrecognized serial write failure"),
	}
	recovered := &fakeModbusClient{
		values: map[modbusReadKey]uint16{
			{address: 31, registerType: modbus.INPUT_REGISTER}: 1,
		},
	}
	factory := newSequentialFakeModbusClientFactory(t, stale, recovered)
	adapter := newModbusSerialAdapterWithFactory(factory.factory, fixedNow)
	adapter.reconnectPolicy.failureThreshold = 2
	adapter.reconnectPolicy.initialBackoff = time.Millisecond
	adapter.reconnectPolicy.maxBackoff = time.Millisecond

	definition := validModbusDefinitionWithCommands(
		[]MetricDefinition{
			modbusMetric("actual_state", "boolean", "input", 31, nil),
		},
		[]CommandDefinition{
			modbusCommand("set_bool", "holding", 160, "actual_state"),
		},
	)
	definition.PollIntervalMs = 60000
	if err := adapter.ApplyDefinition(definition, &captureModbusSink{}); err != nil {
		t.Fatalf("apply modbus definition: %v", err)
	}
	defer adapter.Close()
	stale.waitForReadCalls(t, 1)
	stale.clearCalls()

	adapter.commandMu.Lock()
	commandMuLocked := true
	defer func() {
		if commandMuLocked {
			adapter.commandMu.Unlock()
		}
	}()

	for i := 0; i < adapter.reconnectPolicy.failureThreshold; i++ {
		resultCh := executeSetBoolCommandAsync(context.Background(), adapter, true)
		select {
		case execution := <-resultCh:
			if execution.err != nil {
				t.Fatalf("execute failing command %d: %v", i+1, execution.err)
			}
			if execution.result.Status != CommandStatusFailed || !strings.Contains(execution.result.Reason, "write modbus command") {
				t.Fatalf("transport write failure must fail without confirmation waiting, got %+v", execution.result)
			}
		case <-time.After(100 * time.Millisecond):
			t.Fatalf("transport write failure %d waited for command observation lock or confirmation", i+1)
		}
	}

	stale.waitForCloseCalls(t, 1)
	recovered.waitForReadCalls(t, 1)

	adapter.commandMu.Unlock()
	commandMuLocked = false
	waitForModbusReconnectState(t, adapter, modbusReconnectStateConnected)

	factory.assertConnectionCount(t, 2)
	factory.assertAllConnectionsEqual(t)
	factory.assertLifecycle(t, []string{
		"client[0].open",
		"client[0].close",
		"client[1].open",
	})
	stale.assertWriteCalls(t, []modbusWriteCall{
		{address: 160, value: 1},
		{address: 160, value: 1},
	})
	recovered.assertOpenCount(t, 1)
}

func TestModbusSerialAdapterFailsCommandsWithoutWritingWhileEquipmentUnavailable(t *testing.T) {
	client := &fakeModbusClient{
		values: map[modbusReadKey]uint16{
			{address: 31, registerType: modbus.INPUT_REGISTER}: 0,
		},
	}
	adapter := newModbusSerialAdapterWithFactory(func(modbusSerialConnection) (modbusRegisterClient, error) {
		return client, nil
	}, fixedNow)

	definition := validModbusDefinitionWithCommands(
		[]MetricDefinition{
			modbusMetric("actual_state", "boolean", "input", 31, nil),
		},
		[]CommandDefinition{
			modbusCommand("set_bool", "holding", 160, "actual_state"),
		},
	)
	definition.PollIntervalMs = 60000
	if err := adapter.ApplyDefinition(definition, &captureModbusSink{}); err != nil {
		t.Fatalf("apply modbus definition: %v", err)
	}
	defer adapter.Close()
	client.waitForReadCalls(t, 1)
	client.clearCalls()

	for _, state := range []modbusReconnectState{
		modbusReconnectStateDisconnected,
		modbusReconnectStateReconnecting,
	} {
		t.Run(string(state), func(t *testing.T) {
			adapter.mu.Lock()
			adapter.reconnectState = state
			adapter.mu.Unlock()

			resultCh := executeSetBoolCommandAsync(context.Background(), adapter, true)
			select {
			case execution := <-resultCh:
				if execution.err != nil {
					t.Fatalf("execute command while %s: %v", state, execution.err)
				}
				if execution.result.Status != CommandStatusFailed || !strings.Contains(execution.result.Reason, "unavailable") {
					t.Fatalf("command while %s must fail with unavailable reason, got %+v", state, execution.result)
				}
			case <-time.After(100 * time.Millisecond):
				t.Fatalf("command while %s must fail quickly", state)
			}

			client.assertWriteCalls(t, nil)
		})
	}

	if _, err := adapter.writeModbusCommandRegister(client, 160, 1); err == nil {
		t.Fatal("reconnecting command write snapshot must be rejected before Modbus I/O")
	}
	client.assertWriteCalls(t, nil)
}

func TestModbusSerialAdapterSerializesCommandWriteWithDisconnectTransition(t *testing.T) {
	writeStarted := make(chan struct{})
	writeRelease := make(chan struct{})
	var releaseWrite sync.Once
	release := func() {
		releaseWrite.Do(func() {
			close(writeRelease)
		})
	}
	client := &fakeModbusClient{
		values: map[modbusReadKey]uint16{
			{address: 31, registerType: modbus.INPUT_REGISTER}: 0,
		},
		writeStarted: writeStarted,
		writeRelease: writeRelease,
	}
	adapter := newModbusSerialAdapterWithFactory(func(modbusSerialConnection) (modbusRegisterClient, error) {
		return client, nil
	}, fixedNow)
	adapter.reconnectPolicy.failureThreshold = 1

	definition := validModbusDefinitionWithCommands(
		[]MetricDefinition{
			modbusMetric("actual_state", "boolean", "input", 31, nil),
		},
		[]CommandDefinition{
			modbusCommand("set_bool", "holding", 160, "actual_state"),
		},
	)
	definition.PollIntervalMs = 60000
	if err := adapter.ApplyDefinition(definition, &captureModbusSink{}); err != nil {
		t.Fatalf("apply modbus definition: %v", err)
	}
	defer adapter.Close()
	defer release()
	client.waitForReadCalls(t, 1)
	client.clearCalls()

	ctx, cancel := context.WithCancel(context.Background())
	resultCh := executeSetBoolCommandAsync(ctx, adapter, true)
	waitForSignal(t, writeStarted, "command write")

	disconnectDone := make(chan bool, 1)
	go func() {
		disconnectDone <- adapter.recordTransportFailure(timeoutErr{})
	}()

	select {
	case <-disconnectDone:
		t.Fatal("disconnect transition completed while an accepted command write was still in flight")
	case <-time.After(20 * time.Millisecond):
	}

	release()
	if transitioned := <-disconnectDone; !transitioned {
		t.Fatal("expected transport failure to transition adapter to disconnected")
	}
	cancel()

	execution := receiveCommandExecution(t, resultCh)
	if execution.err != nil {
		t.Fatalf("execute command during disconnect transition: %v", execution.err)
	}
	if execution.result.Status == CommandStatusConfirmed {
		t.Fatalf("command without post-write confirmation must not be confirmed, got %+v", execution.result)
	}
	client.assertWriteCalls(t, []modbusWriteCall{{address: 160, value: 1}})
}

func TestModbusRuntimeIORecoveryDecisionMatrix(t *testing.T) {
	cases := []struct {
		name      string
		err       error
		candidate bool
	}{
		{name: "nil", err: nil, candidate: false},
		{name: "adapter not running", err: errModbusAdapterNotRunning, candidate: false},
		{name: "stale client", err: errModbusClientSnapshotStale, candidate: false},
		{name: "source unavailable", err: modbusSourceUnavailableError{state: modbusReconnectStateReconnecting}, candidate: false},
		{name: "configuration", err: modbus.ErrConfigurationError, candidate: false},
		{name: "unexpected parameters", err: modbus.ErrUnexpectedParameters, candidate: false},
		{name: "illegal function response", err: modbus.ErrIllegalFunction, candidate: false},
		{name: "illegal address response", err: modbus.ErrIllegalDataAddress, candidate: false},
		{name: "illegal value response", err: modbus.ErrIllegalDataValue, candidate: false},
		{name: "server failure response", err: modbus.ErrServerDeviceFailure, candidate: false},
		{name: "acknowledge response", err: modbus.ErrAcknowledge, candidate: false},
		{name: "server busy response", err: modbus.ErrServerDeviceBusy, candidate: false},
		{name: "parity response", err: modbus.ErrMemoryParityError, candidate: false},
		{name: "gateway path response", err: modbus.ErrGWPathUnavailable, candidate: false},
		{name: "gateway target response", err: modbus.ErrGWTargetFailedToRespond, candidate: false},
		{name: "bad crc", err: modbus.ErrBadCRC, candidate: true},
		{name: "short frame", err: modbus.ErrShortFrame, candidate: true},
		{name: "protocol error", err: modbus.ErrProtocolError, candidate: true},
		{name: "bad unit id", err: modbus.ErrBadUnitId, candidate: true},
		{name: "request timeout", err: modbus.ErrRequestTimedOut, candidate: true},
		{name: "net timeout", err: timeoutErr{}, candidate: true},
		{name: "eof", err: io.EOF, candidate: true},
		{name: "closed connection", err: net.ErrClosed, candidate: true},
		{name: "confirmed windows unplug errno", err: syscall.Errno(5), candidate: true},
		{name: "wrapped os error", err: fmt.Errorf("read serial device: %w", syscall.Errno(1167)), candidate: true},
		{name: "unknown runtime io error", err: errors.New("unrecognized serial failure"), candidate: true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := isModbusReconnectCandidate(tc.err); got != tc.candidate {
				t.Fatalf("expected reconnect candidate=%t for %v, got %t", tc.candidate, tc.err, got)
			}
		})
	}
}

func TestModbusRuntimeIORecoveryDecisionDrivesExistingReconnectAccounting(t *testing.T) {
	adapter := newModbusSerialAdapterWithFactory(func(modbusSerialConnection) (modbusRegisterClient, error) {
		return &fakeModbusClient{}, nil
	}, fixedNow)
	adapter.mu.Lock()
	adapter.sourceID = "source-rtu"
	adapter.closed = false
	adapter.reconnectState = modbusReconnectStateConnected
	adapter.reconnectPolicy.failureThreshold = 2
	adapter.mu.Unlock()

	for _, excluded := range []error{
		errModbusClientSnapshotStale,
		modbus.ErrConfigurationError,
		modbus.ErrIllegalDataAddress,
	} {
		if adapter.recordTransportFailure(excluded) {
			t.Fatalf("excluded runtime failure must not transition reconnect state: %v", excluded)
		}
	}

	adapter.mu.RLock()
	if adapter.transportFailures != 0 || adapter.reconnectState != modbusReconnectStateConnected {
		t.Fatalf("excluded failures must not affect reconnect accounting, failures=%d state=%s", adapter.transportFailures, adapter.reconnectState)
	}
	adapter.mu.RUnlock()

	if adapter.recordTransportFailure(syscall.Errno(5)) {
		t.Fatal("first confirmed Windows unplug error must not transition before the existing threshold")
	}
	if !adapter.recordTransportFailure(syscall.Errno(5)) {
		t.Fatal("repeated confirmed Windows unplug error must transition at the existing threshold")
	}

	adapter.mu.RLock()
	if adapter.transportFailures != 2 || adapter.reconnectState != modbusReconnectStateDisconnected {
		t.Fatalf("confirmed Windows unplug error must drive existing reconnect accounting, failures=%d state=%s", adapter.transportFailures, adapter.reconnectState)
	}
	adapter.mu.RUnlock()
}

func TestDiagnoseModbusRuntimeIOFailurePreservesCauseAndOptionalOSErrorCode(t *testing.T) {
	wrapped := fmt.Errorf("read serial device: %w", syscall.Errno(1167))

	diagnostic := diagnoseModbusRuntimeIOFailure(modbusRuntimeIORead, wrapped)

	if diagnostic.operation != modbusRuntimeIORead {
		t.Fatalf("expected read operation, got %q", diagnostic.operation)
	}
	if diagnostic.errorType != "*fmt.wrapError" {
		t.Fatalf("expected concrete wrapped error type, got %q", diagnostic.errorType)
	}
	if !diagnostic.hasOSErrorCode || diagnostic.osErrorCode != 1167 {
		t.Fatalf("expected wrapped OS error code 1167, got %+v", diagnostic)
	}
	if !errors.Is(diagnostic.cause, syscall.Errno(1167)) {
		t.Fatalf("expected original wrapped cause to be retained, got %v", diagnostic.cause)
	}

	withoutErrno := diagnoseModbusRuntimeIOFailure(modbusRuntimeIOWrite, errors.New("serial write rejected"))
	if withoutErrno.hasOSErrorCode {
		t.Fatalf("OS error code must remain optional, got %+v", withoutErrno)
	}
}

func TestDiagnoseModbusRuntimeIOFailureIdentifiesAdapterInternalErrors(t *testing.T) {
	for _, err := range []error{
		errModbusAdapterNotRunning,
		errModbusClientSnapshotStale,
		modbusSourceUnavailableError{state: modbusReconnectStateReconnecting},
	} {
		diagnostic := diagnoseModbusRuntimeIOFailure(modbusRuntimeIORead, err)
		if diagnostic.currentDecision != modbusCurrentReconnectInternal {
			t.Fatalf("adapter-internal error must be identified as internal, got %+v", diagnostic)
		}
	}
}

func TestModbusRuntimeIOFailureDiagnosticLogsFirstFailurePerStreak(t *testing.T) {
	var logs bytes.Buffer
	previousWriter := log.Writer()
	log.SetOutput(&logs)
	t.Cleanup(func() {
		log.SetOutput(previousWriter)
	})

	adapter := newModbusSerialAdapterWithFactory(func(modbusSerialConnection) (modbusRegisterClient, error) {
		return &fakeModbusClient{}, nil
	}, fixedNow)
	adapter.mu.Lock()
	adapter.sourceID = "source-rtu"
	adapter.closed = false
	adapter.mu.Unlock()

	candidate := diagnoseModbusRuntimeIOFailure(modbusRuntimeIORead, errors.New("unrecognized serial failure"))
	adapter.recordRuntimeIOFailureDiagnostic(candidate)
	adapter.recordRuntimeIOFailureDiagnostic(candidate)

	if count := strings.Count(logs.String(), "runtime I/O failure"); count != 1 {
		t.Fatalf("expected one diagnostic log in a failure streak, got %d logs: %q", count, logs.String())
	}
	for _, expected := range []string{
		`source "source-rtu"`,
		"operation=read",
		"currentDecision=reconnect_candidate",
		"errorType=*errors.errorString",
		"osCode=none",
		"unrecognized serial failure",
	} {
		if !strings.Contains(logs.String(), expected) {
			t.Fatalf("expected diagnostic log containing %q, got %q", expected, logs.String())
		}
	}

	adapter.recordRuntimeIOSuccess()
	withOSErrorCode := diagnoseModbusRuntimeIOFailure(
		modbusRuntimeIOWrite,
		fmt.Errorf("write serial device: %w", syscall.Errno(1167)),
	)
	adapter.recordRuntimeIOFailureDiagnostic(withOSErrorCode)
	if count := strings.Count(logs.String(), "runtime I/O failure"); count != 2 {
		t.Fatalf("expected a new diagnostic after successful streak reset, got %d logs: %q", count, logs.String())
	}
	for _, expected := range []string{"operation=write", "osCode=1167"} {
		if !strings.Contains(logs.String(), expected) {
			t.Fatalf("expected diagnostic log containing %q, got %q", expected, logs.String())
		}
	}
}

func TestModbusRuntimeIOFailureDiagnosticIgnoresInternalErrors(t *testing.T) {
	var logs bytes.Buffer
	previousWriter := log.Writer()
	log.SetOutput(&logs)
	t.Cleanup(func() {
		log.SetOutput(previousWriter)
	})

	adapter := newModbusSerialAdapterWithFactory(func(modbusSerialConnection) (modbusRegisterClient, error) {
		return &fakeModbusClient{}, nil
	}, fixedNow)
	adapter.mu.Lock()
	adapter.sourceID = "source-rtu"
	adapter.closed = false
	adapter.mu.Unlock()

	adapter.recordRuntimeIOFailureDiagnostic(diagnoseModbusRuntimeIOFailure(modbusRuntimeIORead, errModbusClientSnapshotStale))

	if logs.Len() != 0 {
		t.Fatalf("adapter-internal failure must not emit runtime I/O diagnostic, got %q", logs.String())
	}
}

func TestModbusRuntimeIOFailureDiagnosticDoesNotFloodRepeatedFailedPolls(t *testing.T) {
	var logs bytes.Buffer
	previousWriter := log.Writer()
	log.SetOutput(&logs)
	t.Cleanup(func() {
		log.SetOutput(previousWriter)
	})

	client := &fakeModbusClient{err: errors.New("unrecognized serial failure")}
	adapter := newModbusSerialAdapterWithFactory(func(modbusSerialConnection) (modbusRegisterClient, error) {
		return client, nil
	}, fixedNow)
	definition := validModbusDefinition([]MetricDefinition{
		modbusMetric("temperature", "number", "input", 10, nil),
	})
	definition.PollIntervalMs = 60000
	if err := adapter.ApplyDefinition(definition, &captureModbusSink{}); err != nil {
		t.Fatalf("apply modbus definition: %v", err)
	}
	defer adapter.Close()
	client.waitForReadCalls(t, 1)

	if _, err := adapter.pollOnce(); err != nil {
		t.Fatalf("repeat failed poll: %v", err)
	}
	if count := strings.Count(logs.String(), "runtime I/O failure"); count != 1 {
		t.Fatalf("repeated failed polls must emit one streak diagnostic, got %d logs: %q", count, logs.String())
	}

	client.mu.Lock()
	client.err = nil
	client.values = map[modbusReadKey]uint16{
		{address: 10, registerType: modbus.INPUT_REGISTER}: 42,
	}
	client.mu.Unlock()
	if _, err := adapter.pollOnce(); err != nil {
		t.Fatalf("successful poll: %v", err)
	}

	client.mu.Lock()
	client.err = errors.New("unrecognized serial failure")
	client.mu.Unlock()
	if _, err := adapter.pollOnce(); err != nil {
		t.Fatalf("failed poll after streak reset: %v", err)
	}
	if count := strings.Count(logs.String(), "runtime I/O failure"); count != 2 {
		t.Fatalf("failure after a fully successful poll must start a new diagnostic streak, got %d logs: %q", count, logs.String())
	}
}

func TestModbusSerialAdapterCloseClosesCurrentClient(t *testing.T) {
	client := &fakeModbusClient{
		values: map[modbusReadKey]uint16{
			{address: 10, registerType: modbus.INPUT_REGISTER}: 42,
		},
	}
	factory := newSequentialFakeModbusClientFactory(t, client)
	adapter := newModbusSerialAdapterWithFactory(factory.factory, fixedNow)

	definition := validModbusDefinition([]MetricDefinition{
		modbusMetric("temperature", "number", "input", 10, nil),
	})
	definition.PollIntervalMs = 60000
	if err := adapter.ApplyDefinition(definition, &captureModbusSink{}); err != nil {
		t.Fatalf("apply modbus definition: %v", err)
	}
	client.waitForReadCalls(t, 1)

	if err := adapter.Close(); err != nil {
		t.Fatalf("close connected modbus adapter: %v", err)
	}

	factory.assertConnectionCount(t, 1)
	client.assertOpenCount(t, 1)
	client.assertCloseCount(t, 1)
}

func TestModbusSerialAdapterCloseWaitsForInitialOpenAndPreventsLateRun(t *testing.T) {
	openStarted := make(chan struct{})
	openRelease := make(chan struct{})
	client := &fakeModbusClient{
		openStarted: openStarted,
		openRelease: openRelease,
		values: map[modbusReadKey]uint16{
			{address: 10, registerType: modbus.INPUT_REGISTER}: 42,
		},
	}
	factory := newSequentialFakeModbusClientFactory(t, client)
	adapter := newModbusSerialAdapterWithFactory(factory.factory, fixedNow)
	definition := validModbusDefinition([]MetricDefinition{
		modbusMetric("temperature", "number", "input", 10, nil),
	})
	definition.PollIntervalMs = 5

	applyResult := make(chan error, 1)
	go func() {
		applyResult <- adapter.ApplyDefinition(definition, &captureModbusSink{})
	}()
	waitForSignal(t, openStarted, "initial Modbus open")

	closeResult := make(chan error, 1)
	go func() {
		closeResult <- adapter.Close()
	}()
	assertCallStillRunning(t, closeResult, "Close during initial Modbus open")

	close(openRelease)
	if err := receiveAdapterCall(t, applyResult, "ApplyDefinition after initial open release"); err != nil {
		t.Fatalf("apply modbus definition: %v", err)
	}
	if err := receiveAdapterCall(t, closeResult, "Close after initial open release"); err != nil {
		t.Fatalf("close modbus adapter: %v", err)
	}
	time.Sleep(20 * time.Millisecond)

	factory.assertConnectionCount(t, 1)
	client.assertOpenCount(t, 1)
	client.assertCloseCount(t, 1)
}

func TestModbusSerialAdapterCloseStopsReconnectBackoff(t *testing.T) {
	stale := &fakeModbusClient{err: timeoutErr{}}
	replacement := &fakeModbusClient{}
	factory := newSequentialFakeModbusClientFactory(t, stale, replacement)
	adapter := newModbusSerialAdapterWithFactory(factory.factory, fixedNow)
	adapter.reconnectPolicy.initialBackoff = 100 * time.Millisecond
	adapter.reconnectPolicy.maxBackoff = 100 * time.Millisecond

	definition := validModbusDefinition([]MetricDefinition{
		modbusMetric("temperature", "number", "input", 10, nil),
	})
	definition.PollIntervalMs = 5
	if err := adapter.ApplyDefinition(definition, &captureModbusSink{}); err != nil {
		t.Fatalf("apply modbus definition: %v", err)
	}
	stale.waitForCloseCalls(t, 1)

	if err := adapter.Close(); err != nil {
		t.Fatalf("close modbus adapter during reconnect backoff: %v", err)
	}
	time.Sleep(2 * adapter.reconnectPolicy.initialBackoff)

	factory.assertConnectionCount(t, 1)
	stale.assertCloseCount(t, 1)
	replacement.assertOpenCount(t, 0)
	replacement.assertCloseCount(t, 0)
}

func TestModbusSerialAdapterCloseWaitsForReconnectOpenAndPreventsLaterAttempts(t *testing.T) {
	openStarted := make(chan struct{})
	openRelease := make(chan struct{})
	stale := &fakeModbusClient{err: timeoutErr{}}
	replacement := &fakeModbusClient{
		openStarted: openStarted,
		openRelease: openRelease,
		values: map[modbusReadKey]uint16{
			{address: 10, registerType: modbus.INPUT_REGISTER}: 42,
		},
	}
	unused := &fakeModbusClient{}
	factory := newSequentialFakeModbusClientFactory(t, stale, replacement, unused)
	adapter := newModbusSerialAdapterWithFactory(factory.factory, fixedNow)
	adapter.reconnectPolicy.initialBackoff = time.Millisecond
	adapter.reconnectPolicy.maxBackoff = time.Millisecond

	definition := validModbusDefinition([]MetricDefinition{
		modbusMetric("temperature", "number", "input", 10, nil),
	})
	definition.PollIntervalMs = 5
	if err := adapter.ApplyDefinition(definition, &captureModbusSink{}); err != nil {
		t.Fatalf("apply modbus definition: %v", err)
	}
	waitForSignal(t, openStarted, "reconnect Modbus open")

	closeResult := make(chan error, 1)
	go func() {
		closeResult <- adapter.Close()
	}()
	assertCallStillRunning(t, closeResult, "Close during reconnect Modbus open")

	close(openRelease)
	if err := receiveAdapterCall(t, closeResult, "Close after reconnect open release"); err != nil {
		t.Fatalf("close modbus adapter: %v", err)
	}
	time.Sleep(20 * time.Millisecond)

	factory.assertConnectionCount(t, 2)
	stale.assertCloseCount(t, 1)
	replacement.assertOpenCount(t, 1)
	replacement.assertCloseCount(t, 1)
	unused.assertOpenCount(t, 0)
}

func TestModbusSerialAdapterLogsReconnectLifecycle(t *testing.T) {
	var logs bytes.Buffer
	previousWriter := log.Writer()
	log.SetOutput(&logs)
	t.Cleanup(func() {
		log.SetOutput(previousWriter)
	})

	stale := &fakeModbusClient{err: timeoutErr{}}
	failedReconnect := &fakeModbusClient{openErr: errors.New("serial port unavailable")}
	recovered := &fakeModbusClient{
		values: map[modbusReadKey]uint16{
			{address: 10, registerType: modbus.INPUT_REGISTER}: 42,
		},
	}
	factory := newSequentialFakeModbusClientFactory(t, stale, failedReconnect, recovered)
	adapter := newModbusSerialAdapterWithFactory(factory.factory, fixedNow)
	adapter.reconnectPolicy.initialBackoff = time.Millisecond
	adapter.reconnectPolicy.maxBackoff = time.Millisecond

	definition := validModbusDefinition([]MetricDefinition{
		modbusMetric("temperature", "number", "input", 10, nil),
	})
	definition.PollIntervalMs = 5
	if err := adapter.ApplyDefinition(definition, &captureModbusSink{}); err != nil {
		t.Fatalf("apply modbus definition: %v", err)
	}
	defer adapter.Close()
	recovered.waitForReadCalls(t, 1)

	for _, expected := range []string{
		"disconnect detected",
		"reconnect attempt",
		"reconnect failed",
		"reconnect succeeded",
	} {
		if !strings.Contains(logs.String(), expected) {
			t.Fatalf("expected reconnect log containing %q, got %q", expected, logs.String())
		}
	}
}

func TestModbusSerialAdapterEmitsTimeoutFault(t *testing.T) {
	client := &fakeModbusClient{err: timeoutErr{}}
	adapter := newModbusSerialAdapterWithFactory(func(modbusSerialConnection) (modbusRegisterClient, error) {
		return client, nil
	}, fixedNow)
	sink := &captureModbusSink{}

	definition := validModbusDefinition([]MetricDefinition{
		modbusMetric("temperature", "number", "input", 10, nil),
	})
	definition.PollIntervalMs = 60000
	if err := adapter.ApplyDefinition(definition, sink); err != nil {
		t.Fatalf("apply modbus definition: %v", err)
	}
	defer adapter.Close()
	client.waitForReadCalls(t, 1)

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
	if len(client.callsSnapshot()) < 2 {
		t.Fatalf("expected both polls to complete, got calls %+v", client.callsSnapshot())
	}
}

func TestModbusSerialAdapterSerializesPollingAndCommandTransactions(t *testing.T) {
	client := &fakeModbusClient{
		values: map[modbusReadKey]uint16{
			{address: 31, registerType: modbus.INPUT_REGISTER}: 1,
		},
		delay: 50 * time.Millisecond,
	}
	adapter := newModbusSerialAdapterWithFactory(func(modbusSerialConnection) (modbusRegisterClient, error) {
		return client, nil
	}, fixedNow)

	if err := adapter.ApplyDefinition(validModbusDefinitionWithCommands(
		[]MetricDefinition{
			modbusMetric("actual_state", "boolean", "input", 31, nil),
		},
		[]CommandDefinition{
			modbusCommand("set_bool", "holding", 160, "actual_state"),
		},
	), &captureModbusSink{}); err != nil {
		t.Fatalf("apply modbus definition: %v", err)
	}
	defer adapter.Close()

	pollDone := make(chan error, 1)
	go func() {
		_, err := adapter.pollOnce()
		pollDone <- err
	}()

	client.waitForInFlightTransactions(t, 1)

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()

	resultCh := executeSetBoolCommandAsync(ctx, adapter, true)
	client.waitForWriteCalls(t, 1)

	if err := <-pollDone; err != nil {
		t.Fatalf("poll modbus registers: %v", err)
	}
	execution := receiveCommandExecution(t, resultCh)
	if execution.err != nil {
		t.Fatalf("execute modbus command: %v", execution.err)
	}
	if execution.result.Status != CommandStatusConfirmed {
		t.Fatalf("successful write should wait for reported state confirmation, got %+v", execution.result)
	}
	if client.maxConcurrentTransactions() != 1 {
		t.Fatalf("expected one Modbus transaction at a time, observed %d", client.maxConcurrentTransactions())
	}
	if len(client.callsSnapshot()) < 3 {
		t.Fatalf("expected polling reads for initial, overlapping, and forced confirmation polls, got calls %+v", client.callsSnapshot())
	}
	writes := client.writeCallsSnapshot()
	if len(writes) != 1 || writes[0].address != 160 || writes[0].value != 1 {
		t.Fatalf("expected one command write, got %+v", writes)
	}
}

func TestModbusSerialAdapterSerializesPollingAndSetNumberCommandTransactions(t *testing.T) {
	client := &fakeModbusClient{
		values: map[modbusReadKey]uint16{
			{address: 52, registerType: modbus.INPUT_REGISTER}: 128,
		},
		delay: 50 * time.Millisecond,
	}
	adapter := newModbusSerialAdapterWithFactory(func(modbusSerialConnection) (modbusRegisterClient, error) {
		return client, nil
	}, fixedNow)

	if err := adapter.ApplyDefinition(validModbusDefinitionWithCommands(
		[]MetricDefinition{
			modbusMetric("actual_value", "number", "input", 52, nil),
		},
		[]CommandDefinition{
			modbusNumberCommand("set_number", "holding", 162, 0, 255, "actual_value"),
		},
	), &captureModbusSink{}); err != nil {
		t.Fatalf("apply modbus definition: %v", err)
	}
	defer adapter.Close()

	adapter.commandMu.Lock()
	commandMuLocked := true
	defer func() {
		if commandMuLocked {
			adapter.commandMu.Unlock()
		}
	}()

	pollDone := make(chan error, 1)
	go func() {
		_, err := adapter.pollOnce()
		pollDone <- err
	}()

	client.waitForReadCalls(t, 1)

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()

	resultCh := executeSetNumberCommandAsync(ctx, adapter, 128)
	if !client.waitForWriteCallsWithin(1, 500*time.Millisecond) {
		adapter.commandMu.Unlock()
		commandMuLocked = false
		if err := <-pollDone; err != nil {
			t.Fatalf("poll modbus registers after releasing observation lock: %v", err)
		}
		t.Fatal("set_number write waited for command observation lock held after a polling read")
	}

	adapter.commandMu.Unlock()
	commandMuLocked = false

	if err := <-pollDone; err != nil {
		t.Fatalf("poll modbus registers: %v", err)
	}
	execution := receiveCommandExecution(t, resultCh)
	if execution.err != nil {
		t.Fatalf("execute modbus set_number command: %v", execution.err)
	}
	if execution.result.Status != CommandStatusConfirmed {
		t.Fatalf("successful set_number write should wait for reported value confirmation, got %+v", execution.result)
	}
	if client.maxConcurrentTransactions() != 1 {
		t.Fatalf("expected max concurrent Modbus transactions to be 1, observed %d", client.maxConcurrentTransactions())
	}
	assertOnlyInputReads(t, client.callsSnapshot(), 52)
	writes := client.writeCallsSnapshot()
	if len(writes) != 1 || writes[0].address != 162 || writes[0].value != 128 {
		t.Fatalf("expected one set_number command write, got %+v", writes)
	}
}

const fixedUnixMilli int64 = 1710000000123

func fixedNow() time.Time {
	return time.UnixMilli(fixedUnixMilli)
}

func validModbusDefinition(metrics []MetricDefinition) Definition {
	return validModbusDefinitionWithCommands(metrics, nil)
}

func validModbusDefinitionWithCommands(metrics []MetricDefinition, commands []CommandDefinition) Definition {
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
				Commands: commands,
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

func modbusCommand(command string, registerType string, address int, reportedMetric string) CommandDefinition {
	return CommandDefinition{
		Command: command,
		Mapping: map[string]any{
			"registerType": registerType,
			"address":      address,
		},
		ReportedMetric: reportedMetric,
	}
}

func modbusNumberCommand(command string, registerType string, address int, min any, max any, reportedMetric string) CommandDefinition {
	definition := modbusCommand(command, registerType, address, reportedMetric)
	definition.Min = min
	definition.Max = max
	return definition
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

func assertOnlyInputReads(t *testing.T, calls []modbusReadCall, address uint16) {
	t.Helper()

	if len(calls) == 0 {
		t.Fatal("expected at least one input-register polling read")
	}
	for _, call := range calls {
		if call.address != address || call.registerType != modbus.INPUT_REGISTER {
			t.Fatalf("expected only normal polling reads of input register %d, got %+v", address, calls)
		}
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

func (s *captureModbusSink) clearReadings() {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.readings = nil
}

func (s *captureModbusSink) faultsSnapshot() []Fault {
	s.mu.Lock()
	defer s.mu.Unlock()

	return append([]Fault(nil), s.faults...)
}

type blockingModbusSink struct {
	mu       sync.Mutex
	releaseC chan struct{}
	once     sync.Once
	readings []RawReading
	faults   []Fault
}

func newBlockingModbusSink() *blockingModbusSink {
	return &blockingModbusSink{releaseC: make(chan struct{})}
}

func (s *blockingModbusSink) PublishReading(reading RawReading) {
	s.mu.Lock()
	s.readings = append(s.readings, reading)
	s.mu.Unlock()

	<-s.releaseC
}

func (s *blockingModbusSink) PublishFault(fault Fault) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.faults = append(s.faults, fault)
}

func (s *blockingModbusSink) waitForBlockedReadings(t *testing.T, want int) {
	t.Helper()

	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		s.mu.Lock()
		blocked := len(s.readings)
		s.mu.Unlock()
		if blocked >= want {
			return
		}
		time.Sleep(time.Millisecond)
	}

	s.mu.Lock()
	blocked := len(s.readings)
	s.mu.Unlock()
	t.Fatalf("timed out waiting for %d blocked readings, observed %d", want, blocked)
}

func (s *blockingModbusSink) release() {
	s.once.Do(func() {
		close(s.releaseC)
	})
}

type modbusReadKey struct {
	address      uint16
	registerType modbus.RegType
}

type modbusReadCall struct {
	address      uint16
	registerType modbus.RegType
}

type modbusWriteCall struct {
	address uint16
	value   uint16
}

type fakeModbusClient struct {
	mu                        sync.Mutex
	values                    map[modbusReadKey]uint16
	readSequences             map[modbusReadKey][]uint16
	readErrSequences          map[modbusReadKey][]error
	err                       error
	openErr                   error
	closeErr                  error
	writeErr                  error
	writeErrSequence          []error
	delay                     time.Duration
	openStarted               chan struct{}
	openRelease               <-chan struct{}
	openStartedOnce           sync.Once
	writeStarted              chan struct{}
	writeRelease              <-chan struct{}
	writeStartedOnce          sync.Once
	calls                     []modbusReadCall
	writeCalls                []modbusWriteCall
	lifecycle                 func(string)
	openCount                 int
	closeCount                int
	inFlightReads             int
	maxConcurrency            int
	inFlightTransactions      int
	maxTransactionConcurrency int
}

func (c *fakeModbusClient) Open() error {
	c.mu.Lock()
	c.openCount++
	lifecycle := c.lifecycle
	openStarted := c.openStarted
	openRelease := c.openRelease
	openErr := c.openErr
	c.mu.Unlock()

	if lifecycle != nil {
		lifecycle("open")
	}
	if openStarted != nil {
		c.openStartedOnce.Do(func() {
			close(openStarted)
		})
	}
	if openRelease != nil {
		<-openRelease
	}
	return openErr
}

func (c *fakeModbusClient) Close() error {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.closeCount++
	if c.lifecycle != nil {
		c.lifecycle("close")
	}
	return c.closeErr
}

func (c *fakeModbusClient) ReadRegister(address uint16, registerType modbus.RegType) (uint16, error) {
	c.mu.Lock()
	c.inFlightReads++
	if c.inFlightReads > c.maxConcurrency {
		c.maxConcurrency = c.inFlightReads
	}
	c.inFlightTransactions++
	if c.inFlightTransactions > c.maxTransactionConcurrency {
		c.maxTransactionConcurrency = c.inFlightTransactions
	}
	c.calls = append(c.calls, modbusReadCall{address: address, registerType: registerType})
	c.mu.Unlock()

	if c.delay > 0 {
		time.Sleep(c.delay)
	}

	c.mu.Lock()
	defer c.mu.Unlock()
	c.inFlightReads--
	c.inFlightTransactions--

	key := modbusReadKey{address: address, registerType: registerType}
	if sequence := c.readErrSequences[key]; len(sequence) > 0 {
		err := sequence[0]
		c.readErrSequences[key] = sequence[1:]
		if err != nil {
			return 0, err
		}
	}
	if c.err != nil {
		return 0, c.err
	}

	if sequence := c.readSequences[key]; len(sequence) > 0 {
		value := sequence[0]
		c.readSequences[key] = sequence[1:]
		return value, nil
	}

	value, ok := c.values[key]
	if !ok {
		return 0, errors.New("register not found")
	}

	return value, nil
}

func (c *fakeModbusClient) WriteRegister(address uint16, value uint16) error {
	c.mu.Lock()
	c.inFlightTransactions++
	if c.inFlightTransactions > c.maxTransactionConcurrency {
		c.maxTransactionConcurrency = c.inFlightTransactions
	}
	c.writeCalls = append(c.writeCalls, modbusWriteCall{address: address, value: value})
	writeStarted := c.writeStarted
	writeRelease := c.writeRelease
	c.mu.Unlock()

	if writeStarted != nil {
		c.writeStartedOnce.Do(func() {
			close(writeStarted)
		})
	}
	if writeRelease != nil {
		<-writeRelease
	}
	if c.delay > 0 {
		time.Sleep(c.delay)
	}

	c.mu.Lock()
	defer c.mu.Unlock()
	c.inFlightTransactions--
	if len(c.writeErrSequence) > 0 {
		err := c.writeErrSequence[0]
		c.writeErrSequence = c.writeErrSequence[1:]
		if err != nil {
			return err
		}
	}
	return c.writeErr
}

func (c *fakeModbusClient) callsSnapshot() []modbusReadCall {
	c.mu.Lock()
	defer c.mu.Unlock()

	return append([]modbusReadCall(nil), c.calls...)
}

func (c *fakeModbusClient) clearCalls() {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.calls = nil
	c.writeCalls = nil
}

func (c *fakeModbusClient) writeCallsSnapshot() []modbusWriteCall {
	c.mu.Lock()
	defer c.mu.Unlock()

	return append([]modbusWriteCall(nil), c.writeCalls...)
}

func (c *fakeModbusClient) openCountSnapshot() int {
	c.mu.Lock()
	defer c.mu.Unlock()

	return c.openCount
}

func (c *fakeModbusClient) closeCountSnapshot() int {
	c.mu.Lock()
	defer c.mu.Unlock()

	return c.closeCount
}

func (c *fakeModbusClient) assertOpenCount(t *testing.T, want int) {
	t.Helper()

	if got := c.openCountSnapshot(); got != want {
		t.Fatalf("expected %d fake Modbus opens, got %d", want, got)
	}
}

func (c *fakeModbusClient) assertCloseCount(t *testing.T, want int) {
	t.Helper()

	if got := c.closeCountSnapshot(); got != want {
		t.Fatalf("expected %d fake Modbus closes, got %d", want, got)
	}
}

func (c *fakeModbusClient) assertReadCalls(t *testing.T, want []modbusReadCall) {
	t.Helper()

	got := c.callsSnapshot()
	if len(got) != len(want) {
		t.Fatalf("expected read calls %+v, got %+v", want, got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("expected read calls %+v, got %+v", want, got)
		}
	}
}

func (c *fakeModbusClient) assertWriteCalls(t *testing.T, want []modbusWriteCall) {
	t.Helper()

	got := c.writeCallsSnapshot()
	if len(got) != len(want) {
		t.Fatalf("expected write calls %+v, got %+v", want, got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("expected write calls %+v, got %+v", want, got)
		}
	}
}

func (c *fakeModbusClient) setValue(key modbusReadKey, value uint16) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.values == nil {
		c.values = make(map[modbusReadKey]uint16)
	}
	c.values[key] = value
}

func (c *fakeModbusClient) maxConcurrentReads() int {
	c.mu.Lock()
	defer c.mu.Unlock()

	return c.maxConcurrency
}

func (c *fakeModbusClient) maxConcurrentTransactions() int {
	c.mu.Lock()
	defer c.mu.Unlock()

	return c.maxTransactionConcurrency
}

func (c *fakeModbusClient) waitForInFlightTransactions(t *testing.T, want int) {
	t.Helper()

	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		c.mu.Lock()
		inFlight := c.inFlightTransactions
		c.mu.Unlock()
		if inFlight >= want {
			return
		}
		time.Sleep(time.Millisecond)
	}

	c.mu.Lock()
	inFlight := c.inFlightTransactions
	c.mu.Unlock()
	t.Fatalf("timed out waiting for %d in-flight Modbus transactions, observed %d", want, inFlight)
}

func (c *fakeModbusClient) waitForReadCalls(t *testing.T, want int) {
	t.Helper()

	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		c.mu.Lock()
		reads := len(c.calls)
		c.mu.Unlock()
		if reads >= want {
			return
		}
		time.Sleep(time.Millisecond)
	}

	c.mu.Lock()
	reads := len(c.calls)
	c.mu.Unlock()
	t.Fatalf("timed out waiting for %d Modbus reads, observed %d", want, reads)
}

func (c *fakeModbusClient) waitForWriteCalls(t *testing.T, want int) {
	t.Helper()

	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		c.mu.Lock()
		writes := len(c.writeCalls)
		c.mu.Unlock()
		if writes >= want {
			return
		}
		time.Sleep(time.Millisecond)
	}

	c.mu.Lock()
	writes := len(c.writeCalls)
	c.mu.Unlock()
	t.Fatalf("timed out waiting for %d Modbus writes, observed %d", want, writes)
}

func (c *fakeModbusClient) waitForCloseCalls(t *testing.T, want int) {
	t.Helper()

	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		if c.closeCountSnapshot() >= want {
			return
		}
		time.Sleep(time.Millisecond)
	}

	t.Fatalf("timed out waiting for %d Modbus closes, observed %d", want, c.closeCountSnapshot())
}

func (c *fakeModbusClient) waitForWriteCallsWithin(want int, timeout time.Duration) bool {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		c.mu.Lock()
		writes := len(c.writeCalls)
		c.mu.Unlock()
		if writes >= want {
			return true
		}
		time.Sleep(time.Millisecond)
	}

	c.mu.Lock()
	defer c.mu.Unlock()
	return len(c.writeCalls) >= want
}

func waitForSignal(t *testing.T, signal <-chan struct{}, operation string) {
	t.Helper()

	select {
	case <-signal:
	case <-time.After(time.Second):
		t.Fatalf("timed out waiting for %s", operation)
	}
}

func repeatModbusErrors(err error, count int) []error {
	errors := make([]error, count)
	for i := range errors {
		errors[i] = err
	}
	return errors
}

func waitForModbusReconnectState(t *testing.T, adapter *ModbusSerialAdapter, want modbusReconnectState) {
	t.Helper()

	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		state, _ := adapter.reconnectStateSnapshot()
		if state == want {
			return
		}
		time.Sleep(time.Millisecond)
	}

	state, _ := adapter.reconnectStateSnapshot()
	t.Fatalf("timed out waiting for reconnect state %q, got %q", want, state)
}

func assertCallStillRunning(t *testing.T, result <-chan error, operation string) {
	t.Helper()

	select {
	case err := <-result:
		t.Fatalf("%s returned before owned open work completed: %v", operation, err)
	case <-time.After(20 * time.Millisecond):
	}
}

func receiveAdapterCall(t *testing.T, result <-chan error, operation string) error {
	t.Helper()

	select {
	case err := <-result:
		return err
	case <-time.After(time.Second):
		t.Fatalf("timed out waiting for %s", operation)
		return nil
	}
}

type sequentialFakeModbusClientFactory struct {
	mu          sync.Mutex
	clients     []*fakeModbusClient
	connections []modbusSerialConnection
	lifecycle   []string
}

func newSequentialFakeModbusClientFactory(t *testing.T, clients ...*fakeModbusClient) *sequentialFakeModbusClientFactory {
	t.Helper()

	return &sequentialFakeModbusClientFactory{clients: clients}
}

func (f *sequentialFakeModbusClientFactory) factory(connection modbusSerialConnection) (modbusRegisterClient, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	f.connections = append(f.connections, connection)
	index := len(f.connections) - 1
	if index >= len(f.clients) {
		return nil, errors.New("sequential fake Modbus client factory exhausted")
	}
	if f.clients[index] == nil {
		return nil, errors.New("sequential fake Modbus client factory returned nil client")
	}
	f.clients[index].lifecycle = func(event string) {
		f.mu.Lock()
		defer f.mu.Unlock()

		f.lifecycle = append(f.lifecycle, fmt.Sprintf("client[%d].%s", index, event))
	}
	return f.clients[index], nil
}

func (f *sequentialFakeModbusClientFactory) connectionsSnapshot() []modbusSerialConnection {
	f.mu.Lock()
	defer f.mu.Unlock()

	return append([]modbusSerialConnection(nil), f.connections...)
}

func (f *sequentialFakeModbusClientFactory) assertConnectionCount(t *testing.T, want int) {
	t.Helper()

	got := len(f.connectionsSnapshot())
	if got != want {
		t.Fatalf("expected %d fake Modbus factory connections, got %d", want, got)
	}
}

func (f *sequentialFakeModbusClientFactory) assertAllConnectionsEqual(t *testing.T) {
	t.Helper()

	connections := f.connectionsSnapshot()
	if len(connections) == 0 {
		t.Fatal("expected at least one fake Modbus factory connection")
	}
	first := connections[0]
	for _, connection := range connections[1:] {
		if connection != first {
			t.Fatalf("expected reconnect factory calls to reuse parsed connection %+v, got %+v", first, connections)
		}
	}
}

func (f *sequentialFakeModbusClientFactory) assertLifecycle(t *testing.T, want []string) {
	t.Helper()

	f.mu.Lock()
	got := append([]string(nil), f.lifecycle...)
	f.mu.Unlock()
	if !slices.Equal(got, want) {
		t.Fatalf("expected fake Modbus lifecycle %+v, got %+v", want, got)
	}
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
