package source

import (
	"context"
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

func TestModbusSerialAdapterParsesConfiguredCommandMapping(t *testing.T) {
	adapter := newModbusSerialAdapterWithFactory(func(modbusSerialConnection) (modbusRegisterClient, error) {
		return &fakeModbusClient{}, nil
	}, fixedNow)
	definition := validModbusDefinitionWithCommands(
		[]MetricDefinition{
			modbusMetric("feedback_enabled", "boolean", "input", 31, nil),
			modbusMetric("temperature", "number", "input", 32, nil),
		},
		[]CommandDefinition{
			modbusCommand("set_bool", "holding", 321, "feedback_enabled"),
		},
	)
	definition.Devices[0].DeviceID = "valve_aux"

	if err := adapter.ApplyDefinition(definition, &captureModbusSink{}); err != nil {
		t.Fatalf("apply modbus definition: %v", err)
	}
	defer adapter.Close()

	adapter.mu.RLock()
	commandMappings := append([]modbusCommandMapping(nil), adapter.commandMappings...)
	adapter.mu.RUnlock()

	if len(commandMappings) != 1 {
		t.Fatalf("expected one command mapping, got %+v", commandMappings)
	}
	command := commandMappings[0]
	if command.deviceID != "valve_aux" || command.command != "set_bool" {
		t.Fatalf("unexpected command identity: %+v", command)
	}
	if command.registerType != modbus.HOLDING_REGISTER || command.address != 321 || command.reportedMetric != "feedback_enabled" {
		t.Fatalf("unexpected configured command mapping: %+v", command)
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
			command:    modbusCommand("set_number", "holding", 321, "feedback_enabled"),
			errSnippet: "command must be set_bool",
		},
		{
			name: "non-holding register",
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

			for i := 0; i < 2; i++ {
				if _, err := adapter.pollOnce(); err != nil {
					t.Fatalf("poll command confirmation reading: %v", err)
				}
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

	for i := 0; i < 2; i++ {
		if _, err := adapter.pollOnce(); err != nil {
			t.Fatalf("poll command confirmation reading: %v", err)
		}
	}

	execution := receiveCommandExecution(t, resultCh)
	if execution.err != nil {
		t.Fatalf("execute modbus command: %v", execution.err)
	}
	if execution.result.Status != CommandStatusConfirmed {
		t.Fatalf("fresh post-write actual_state readings must confirm command, got %+v", execution.result)
	}

	calls := client.callsSnapshot()
	if len(calls) != 2 {
		t.Fatalf("confirmation must not perform separate reads outside pollOnce, got reads %+v", calls)
	}
	for _, call := range calls {
		if call.address != 31 || call.registerType != modbus.INPUT_REGISTER {
			t.Fatalf("confirmation must observe the configured reported metric, got read %+v", call)
		}
	}

	writes := client.writeCallsSnapshot()
	if len(writes) != 1 || writes[0].address != 160 || writes[0].value != 1 {
		t.Fatalf("expected one command write, got %+v", writes)
	}
	if readings := sink.readingsSnapshot(); len(readings) != 2 {
		t.Fatalf("pollOnce should publish the two confirmation observations, got %+v", readings)
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
	if reads := client.callsSnapshot(); len(reads) != 2 {
		t.Fatalf("ExecuteCommand must not read actual_state directly for confirmation, got reads %+v", reads)
	}
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
	if reads := client.callsSnapshot(); len(reads) != 2 {
		t.Fatalf("ExecuteCommand must not read actual_state directly for confirmation, got reads %+v", reads)
	}
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

	for i := 0; i < 2; i++ {
		if _, err := adapter.pollOnce(); err != nil {
			t.Fatalf("poll non-matching command state: %v", err)
		}
	}

	execution := receiveCommandExecution(t, resultCh)
	if execution.err != nil {
		t.Fatalf("execute modbus command: %v", execution.err)
	}
	if execution.result.Status != CommandStatusTimeout {
		t.Fatalf("missing matching reported state must time out, got %+v", execution.result)
	}
	if calls := client.callsSnapshot(); len(calls) != 2 {
		t.Fatalf("timeout proof should include only the two pollOnce reads, got %+v", calls)
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
	for i := 0; i < 2; i++ {
		if _, err := adapter.pollOnce(); err != nil {
			t.Fatalf("poll command confirmation reading: %v", err)
		}
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
	if len(client.callsSnapshot()) != 3 {
		t.Fatalf("expected one polling read, got calls %+v", client.callsSnapshot())
	}
	writes := client.writeCallsSnapshot()
	if len(writes) != 1 || writes[0].address != 160 || writes[0].value != 1 {
		t.Fatalf("expected one command write, got %+v", writes)
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
	err                       error
	writeErr                  error
	delay                     time.Duration
	calls                     []modbusReadCall
	writeCalls                []modbusWriteCall
	openCount                 int
	closeCount                int
	inFlightReads             int
	maxConcurrency            int
	inFlightTransactions      int
	maxTransactionConcurrency int
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

	if c.err != nil {
		return 0, c.err
	}

	value, ok := c.values[modbusReadKey{address: address, registerType: registerType}]
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
	c.mu.Unlock()

	if c.delay > 0 {
		time.Sleep(c.delay)
	}

	c.mu.Lock()
	defer c.mu.Unlock()
	c.inFlightTransactions--
	return c.writeErr
}

func (c *fakeModbusClient) callsSnapshot() []modbusReadCall {
	c.mu.Lock()
	defer c.mu.Unlock()

	return append([]modbusReadCall(nil), c.calls...)
}

func (c *fakeModbusClient) writeCallsSnapshot() []modbusWriteCall {
	c.mu.Lock()
	defer c.mu.Unlock()

	return append([]modbusWriteCall(nil), c.writeCalls...)
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
