package source

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"edge_server/go_core/internal/config"

	"github.com/simonvetter/modbus"
)

func TestManagerAcceptsProductionModbusRTUAdapterThroughProtocolFactory(t *testing.T) {
	client := &fakeModbusClient{
		values: map[modbusReadKey]uint16{
			{address: 10, registerType: modbus.INPUT_REGISTER}: 42,
		},
	}
	manager := NewManager(FactoryRegistry{
		ModbusRTUKind: func() (Adapter, error) {
			return newModbusSerialAdapterWithFactory(func(connection modbusSerialConnection) (modbusRegisterClient, error) {
				if connection.port != "COM3" || connection.slaveID != 7 {
					t.Fatalf("unexpected production modbus connection: %+v", connection)
				}
				return client, nil
			}, fixedNow), nil
		},
	})
	defer manager.ApplyDefinitions(nil)

	report, err := manager.ApplyDefinitions([]Definition{
		validModbusDefinition([]MetricDefinition{
			modbusMetric("temperature", "number", "input", 10, 0.5),
		}),
	})
	if err != nil {
		t.Fatalf("apply production modbus source definition: %v", err)
	}
	if len(report.Applied) != 1 || report.Applied[0] != "source-rtu" {
		t.Fatalf("expected source-rtu to be applied, got %+v", report)
	}
	if _, err := manager.MockControl("source-rtu"); err == nil {
		t.Fatal("production modbus source must not expose mock control")
	}

	select {
	case reading := <-manager.Readings():
		assertCloudSafeReading(t, reading, "source-rtu", "device-1", "temperature", 21.0)
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for production modbus reading")
	}
}

func TestManagerKeepsSourceFaultLocalAndValidatesStableReadingIdentity(t *testing.T) {
	adapters := map[string]*boundaryAdapter{}
	manager := NewManager(FactoryRegistry{
		ModbusRTUKind: func() (Adapter, error) {
			return &boundaryAdapter{adapters: adapters}, nil
		},
	})
	defer manager.ApplyDefinitions(nil)

	definitions := []Definition{
		boundaryDefinition("source-a", "pump-a", "pressure"),
		boundaryDefinition("source-b", "pump-b", "pressure"),
	}
	if _, err := manager.ApplyDefinitions(definitions); err != nil {
		t.Fatalf("apply production-kind source definitions: %v", err)
	}

	adapters["source-a"].publishFault(Fault{
		SourceID: "spoofed",
		Severity: SeverityError,
		Code:     "modbus_timeout",
		Message:  "read timed out",
		TS:       1001,
	})
	adapters["source-a"].publishReading(RawReading{
		SourceID: "spoofed",
		DeviceID: "pump-a",
		Metric:   "unconfigured",
		Value:    10,
		TS:       1002,
		Metadata: map[string]any{
			"registerType": "holding",
			"address":      42,
		},
	})
	adapters["source-b"].publishReading(RawReading{
		SourceID: "spoofed",
		DeviceID: "pump-b",
		Metric:   "pressure",
		Value:    12.5,
		TS:       1003,
		Metadata: map[string]any{
			"registerType": "input",
			"address":      10,
		},
	})

	select {
	case reading := <-manager.Readings():
		assertCloudSafeReading(t, reading, "source-b", "pump-b", "pressure", 12.5)
	case <-time.After(2 * time.Second):
		t.Fatal("unaffected source reading must continue after another source fault")
	}
	select {
	case reading := <-manager.Readings():
		t.Fatalf("unconfigured deviceId+metric must not be accepted: %+v", reading)
	default:
	}

	select {
	case fault := <-manager.Faults():
		if fault.SourceID != "source-a" || fault.Code != "modbus_timeout" {
			t.Fatalf("expected fault to stay local to source-a, got %+v", fault)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for local source fault")
	}

	health := manager.HealthSnapshot()
	if health["source-a"].State != SourceHealthFailed {
		t.Fatalf("expected source-a to be failed only, got %+v", health["source-a"])
	}
	if health["source-b"].State != SourceHealthRunning {
		t.Fatalf("expected source-b to remain running, got %+v", health["source-b"])
	}
}

func TestManagerReusesStableProductionDefinitionsWithoutRedefinition(t *testing.T) {
	adapters := map[string]*boundaryAdapter{}
	manager := NewManager(FactoryRegistry{
		ModbusRTUKind: func() (Adapter, error) {
			return &boundaryAdapter{adapters: adapters}, nil
		},
	})
	defer manager.ApplyDefinitions(nil)

	definitions := []Definition{boundaryDefinition("source-1", "device-1", "pressure")}

	firstReport, err := manager.ApplyDefinitions(definitions)
	if err != nil {
		t.Fatalf("apply initial source definitions: %v", err)
	}
	if len(firstReport.Applied) != 1 || firstReport.Applied[0] != "source-1" {
		t.Fatalf("expected first apply to configure source-1, got %+v", firstReport)
	}

	firstAdapter := adapters["source-1"]
	if firstAdapter == nil {
		t.Fatal("expected source-1 adapter to be captured")
	}
	if firstAdapter.applyCount != 1 {
		t.Fatalf("expected initial definition apply count 1, got %d", firstAdapter.applyCount)
	}

	for _, phase := range []string{"reconnect", "credential rotation", "block recovery"} {
		report, err := manager.ApplyDefinitions(definitions)
		if err != nil {
			t.Fatalf("reapply unchanged definitions across %s: %v", phase, err)
		}
		if len(report.Reused) != 1 || report.Reused[0] != "source-1" {
			t.Fatalf("expected source-1 to be reused across %s, got %+v", phase, report)
		}
	}

	if adapters["source-1"] != firstAdapter {
		t.Fatal("expected unchanged production definition reuse to keep the same adapter instance")
	}
	if firstAdapter.applyCount != 1 {
		t.Fatalf("expected unchanged definitions to avoid redefinition, got apply count %d", firstAdapter.applyCount)
	}
}

func TestManagerPreservesExistingSourceWhenReconfigurationFails(t *testing.T) {
	applyErr := errors.New("adapter apply failed")
	factoryCalls := 0
	manager := NewManager(FactoryRegistry{
		ModbusRTUKind: func() (Adapter, error) {
			factoryCalls++
			if factoryCalls == 2 {
				return &boundaryAdapter{applyErr: applyErr}, nil
			}
			return &boundaryAdapter{}, nil
		},
	})
	defer manager.ApplyDefinitions(nil)

	initialDefinition := boundaryDefinition("source-1", "device-1", "pressure")
	if _, err := manager.ApplyDefinitions([]Definition{initialDefinition}); err != nil {
		t.Fatalf("apply initial source definition: %v", err)
	}
	initialAdapter := manager.sources["source-1"].adapter.(*boundaryAdapter)

	updatedDefinition := boundaryDefinition("source-1", "device-1", "temperature")
	if _, err := manager.ApplyDefinitions([]Definition{updatedDefinition}); !errors.Is(err, applyErr) {
		t.Fatalf("expected reconfiguration failure %v, got %v", applyErr, err)
	}
	if initialAdapter.closed {
		t.Fatal("failed reconfiguration must preserve the existing adapter")
	}

	initialAdapter.publishReading(RawReading{
		SourceID: "spoofed",
		DeviceID: "device-1",
		Metric:   "pressure",
		Value:    15.5,
		TS:       2001,
	})

	select {
	case reading := <-manager.Readings():
		assertCloudSafeReading(t, reading, "source-1", "device-1", "pressure", 15.5)
	case <-time.After(2 * time.Second):
		t.Fatal("existing source must continue publishing after failed reconfiguration")
	}
}

func TestDefinitionsFromConfigPreservesCommands(t *testing.T) {
	cfgDefinitions := []config.PollingSourceDefinition{
		{
			SourceID:       "source-commands",
			AdapterKind:    ModbusRTUKind,
			Enabled:        true,
			PollIntervalMs: 500,
			Connection:     map[string]any{"port": "COM3"},
			Devices: []config.LocalDeviceDefinition{
				{
					DeviceID: "pump-main",
					Metrics: []config.MetricDefinition{
						{
							Metric:    "actual_state",
							ValueType: "boolean",
							Mapping:   map[string]any{"registerType": "input", "address": 12},
						},
					},
					Commands: []config.CommandDefinition{
						{
							Command:        "set_number",
							Mapping:        map[string]any{"registerType": "holding", "address": 160},
							Min:            0,
							Max:            255,
							ReportedMetric: "actual_state",
						},
					},
				},
			},
		},
	}

	definitions := DefinitionsFromConfig(cfgDefinitions)
	if len(definitions) != 1 || len(definitions[0].Devices) != 1 || len(definitions[0].Devices[0].Commands) != 1 {
		t.Fatalf("expected command definition to be preserved, got %+v", definitions)
	}

	command := definitions[0].Devices[0].Commands[0]
	if command.Command != "set_number" || command.ReportedMetric != "actual_state" || command.Mapping["address"] != 160 {
		t.Fatalf("unexpected converted command: %+v", command)
	}
	if command.Min != 0 || command.Max != 255 {
		t.Fatalf("expected converted command range 0..255, got min=%#v max=%#v", command.Min, command.Max)
	}

	cfgDefinitions[0].Devices[0].Commands[0].Mapping["address"] = 161
	if definitions[0].Devices[0].Commands[0].Mapping["address"] != 160 {
		t.Fatal("converted command mapping must be cloned from config")
	}
	cfgDefinitions[0].Devices[0].Commands[0].Min = 1
	cfgDefinitions[0].Devices[0].Commands[0].Max = 254
	if definitions[0].Devices[0].Commands[0].Min != 0 || definitions[0].Devices[0].Commands[0].Max != 255 {
		t.Fatal("converted command range must be copied from config")
	}
}

func TestDefinitionsFromConfigPreservesMetricMappingFields(t *testing.T) {
	cfgDefinitions := []config.PollingSourceDefinition{
		{
			SourceID:       "source-metrics",
			AdapterKind:    ModbusRTUKind,
			Enabled:        true,
			PollIntervalMs: 500,
			Connection:     map[string]any{"port": "COM3"},
			Devices: []config.LocalDeviceDefinition{
				{
					DeviceID: "env",
					Metrics: []config.MetricDefinition{
						{
							Metric:    "temperature",
							ValueType: "number",
							Mapping:   map[string]any{"registerType": "input", "address": 10, "dataType": "int16", "scale": 0.5},
						},
					},
				},
			},
		},
	}

	definitions := DefinitionsFromConfig(cfgDefinitions)
	if len(definitions) != 1 || len(definitions[0].Devices) != 1 || len(definitions[0].Devices[0].Metrics) != 1 {
		t.Fatalf("expected metric definition to be preserved, got %+v", definitions)
	}

	metric := definitions[0].Devices[0].Metrics[0]
	if metric.Mapping["dataType"] != "int16" || metric.Mapping["scale"] != 0.5 {
		t.Fatalf("unexpected converted metric mapping fields: %+v", metric.Mapping)
	}

	cfgDefinitions[0].Devices[0].Metrics[0].Mapping["dataType"] = "uint16"
	if definitions[0].Devices[0].Metrics[0].Mapping["dataType"] != "int16" {
		t.Fatal("converted metric mapping must be cloned from config")
	}
}

func TestManagerApplyDefinitionsClonesCommandRangeMetadata(t *testing.T) {
	adapter := &boundaryAdapter{}
	manager := NewManager(FactoryRegistry{
		ModbusRTUKind: func() (Adapter, error) {
			return adapter, nil
		},
	})
	defer manager.ApplyDefinitions(nil)

	definition := commandDefinition("source-command", "pump-main", "set_number")
	definition.Devices[0].Commands[0].Min = 0
	definition.Devices[0].Commands[0].Max = 255

	if _, err := manager.ApplyDefinitions([]Definition{definition}); err != nil {
		t.Fatalf("apply command source definition: %v", err)
	}

	command := adapter.appliedDefinition.Devices[0].Commands[0]
	if command.Min != 0 || command.Max != 255 {
		t.Fatalf("expected cloned command range 0..255, got min=%#v max=%#v", command.Min, command.Max)
	}

	definition.Devices[0].Commands[0].Mapping["address"] = 161
	definition.Devices[0].Commands[0].Min = 1
	definition.Devices[0].Commands[0].Max = 254
	command = adapter.appliedDefinition.Devices[0].Commands[0]
	if command.Mapping["address"] != 160 {
		t.Fatal("manager-applied command mapping must be cloned from caller-owned definition")
	}
	if command.Min != 0 || command.Max != 255 {
		t.Fatal("manager-applied command range must be copied from caller-owned definition")
	}
}

func TestManagerRoutesCommandThroughConfiguredSource(t *testing.T) {
	adapter := &commandBoundaryAdapter{
		result: CommandResult{Status: CommandStatusConfirmed},
	}
	manager := NewManager(FactoryRegistry{
		ModbusRTUKind: func() (Adapter, error) {
			return adapter, nil
		},
	})
	defer manager.ApplyDefinitions(nil)

	if _, err := manager.ApplyDefinitions([]Definition{commandDefinition("source-command", "pump-main", "set_bool")}); err != nil {
		t.Fatalf("apply command source definition: %v", err)
	}

	result, err := manager.ExecuteCommand(context.Background(), CommandRequest{
		DeviceID: "pump-main",
		Command:  "set_bool",
		Value:    true,
	})
	if err != nil {
		t.Fatalf("execute command through manager: %v", err)
	}
	if result.Status != CommandStatusConfirmed {
		t.Fatalf("expected confirmed command result, got %+v", result)
	}
	if adapter.callCount() != 1 {
		t.Fatalf("expected one adapter delegation, got %d", adapter.callCount())
	}
	if adapter.lastRequest.DeviceID != "pump-main" || adapter.lastRequest.Command != "set_bool" || adapter.lastRequest.Value != true {
		t.Fatalf("manager delegated unexpected command request: %+v", adapter.lastRequest)
	}
}

func TestManagerRoutesSetNumberCommandThroughConfiguredSource(t *testing.T) {
	adapter := &commandBoundaryAdapter{
		result: CommandResult{Status: CommandStatusConfirmed},
	}
	manager := NewManager(FactoryRegistry{
		ModbusRTUKind: func() (Adapter, error) {
			return adapter, nil
		},
	})
	defer manager.ApplyDefinitions(nil)

	if _, err := manager.ApplyDefinitions([]Definition{setNumberCommandDefinition("source-command", "valve-pwm")}); err != nil {
		t.Fatalf("apply set_number command source definition: %v", err)
	}

	result, err := manager.ExecuteCommand(context.Background(), CommandRequest{
		DeviceID: "valve-pwm",
		Command:  "set_number",
		Value:    128,
	})
	if err != nil {
		t.Fatalf("execute set_number command through manager: %v", err)
	}
	if result.Status != CommandStatusConfirmed {
		t.Fatalf("expected confirmed set_number command result, got %+v", result)
	}
	if adapter.callCount() != 1 {
		t.Fatalf("expected one adapter delegation, got %d", adapter.callCount())
	}
	if adapter.lastRequest.DeviceID != "valve-pwm" || adapter.lastRequest.Command != "set_number" || adapter.lastRequest.Value != 128 {
		t.Fatalf("manager delegated unexpected set_number request: %+v", adapter.lastRequest)
	}
}

func TestManagerFailsMissingSetNumberCommandMapping(t *testing.T) {
	adapter := &commandBoundaryAdapter{
		result: CommandResult{Status: CommandStatusConfirmed},
	}
	manager := NewManager(FactoryRegistry{
		ModbusRTUKind: func() (Adapter, error) {
			return adapter, nil
		},
	})
	defer manager.ApplyDefinitions(nil)

	if _, err := manager.ApplyDefinitions([]Definition{commandDefinition("source-command", "valve-pwm", "set_bool")}); err != nil {
		t.Fatalf("apply set_bool-only source definition: %v", err)
	}

	result, err := manager.ExecuteCommand(context.Background(), CommandRequest{
		DeviceID: "valve-pwm",
		Command:  "set_number",
		Value:    128,
	})
	if err != nil {
		t.Fatalf("missing set_number mapping should return failed result, got error %v", err)
	}
	if result.Status != CommandStatusFailed {
		t.Fatalf("expected failed result for missing set_number mapping, got %+v", result)
	}
	if result.Reason != "command target is not configured" {
		t.Fatalf("expected clear missing mapping reason, got %q", result.Reason)
	}
	if adapter.callCount() != 0 {
		t.Fatalf("missing set_number mapping must not delegate to adapter, got %d calls", adapter.callCount())
	}
}

func TestManagerFailsUnknownCommandTargets(t *testing.T) {
	manager := NewManager(FactoryRegistry{
		ModbusRTUKind: func() (Adapter, error) {
			return &commandBoundaryAdapter{result: CommandResult{Status: CommandStatusConfirmed}}, nil
		},
	})
	defer manager.ApplyDefinitions(nil)

	if _, err := manager.ApplyDefinitions([]Definition{commandDefinition("source-command", "pump-main", "set_bool")}); err != nil {
		t.Fatalf("apply command source definition: %v", err)
	}

	for _, tc := range []struct {
		name    string
		request CommandRequest
	}{
		{
			name:    "unknown device",
			request: CommandRequest{DeviceID: "pump-secondary", Command: "set_bool", Value: true},
		},
		{
			name:    "unknown command",
			request: CommandRequest{DeviceID: "pump-main", Command: "set_number", Value: 1},
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			result, err := manager.ExecuteCommand(context.Background(), tc.request)
			if err != nil {
				t.Fatalf("unknown command target should return failed result, got error %v", err)
			}
			if result.Status != CommandStatusFailed {
				t.Fatalf("expected failed result for %s, got %+v", tc.name, result)
			}
		})
	}
}

func TestManagerFailsWhenAdapterIsNotCommandCapable(t *testing.T) {
	manager := NewManager(FactoryRegistry{
		ModbusRTUKind: func() (Adapter, error) {
			return &boundaryAdapter{}, nil
		},
	})
	defer manager.ApplyDefinitions(nil)

	if _, err := manager.ApplyDefinitions([]Definition{commandDefinition("source-command", "pump-main", "set_bool")}); err != nil {
		t.Fatalf("apply command source definition: %v", err)
	}

	result, err := manager.ExecuteCommand(context.Background(), CommandRequest{
		DeviceID: "pump-main",
		Command:  "set_bool",
		Value:    true,
	})
	if err != nil {
		t.Fatalf("non-command-capable adapter should return failed result, got error %v", err)
	}
	if result.Status != CommandStatusFailed {
		t.Fatalf("expected failed result for non-command-capable adapter, got %+v", result)
	}
}

func TestManagerRejectsBusyCommandTarget(t *testing.T) {
	started := make(chan struct{})
	release := make(chan struct{})
	adapter := &commandBoundaryAdapter{
		blockStarted: started,
		blockRelease: release,
		result:       CommandResult{Status: CommandStatusConfirmed},
	}
	manager := NewManager(FactoryRegistry{
		ModbusRTUKind: func() (Adapter, error) {
			return adapter, nil
		},
	})
	defer manager.ApplyDefinitions(nil)

	if _, err := manager.ApplyDefinitions([]Definition{commandDefinition("source-command", "pump-main", "set_bool")}); err != nil {
		t.Fatalf("apply command source definition: %v", err)
	}

	firstDone := make(chan CommandResult, 1)
	go func() {
		result, _ := manager.ExecuteCommand(context.Background(), CommandRequest{
			DeviceID: "pump-main",
			Command:  "set_bool",
			Value:    true,
		})
		firstDone <- result
	}()

	select {
	case <-started:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for first command to enter adapter")
	}

	busyResult, err := manager.ExecuteCommand(context.Background(), CommandRequest{
		DeviceID: "pump-main",
		Command:  "set_bool",
		Value:    false,
	})
	if err != nil {
		t.Fatalf("busy command should return failed result, got error %v", err)
	}
	if busyResult.Status != CommandStatusFailed {
		t.Fatalf("expected failed busy result, got %+v", busyResult)
	}

	close(release)
	select {
	case result := <-firstDone:
		if result.Status != CommandStatusConfirmed {
			t.Fatalf("expected first command to complete confirmed, got %+v", result)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for first command to finish")
	}
	if adapter.callCount() != 1 {
		t.Fatalf("busy command must not delegate a second adapter call, got %d", adapter.callCount())
	}
}

func TestManagerRejectsBusySetNumberCommandTarget(t *testing.T) {
	started := make(chan struct{})
	release := make(chan struct{})
	adapter := &commandBoundaryAdapter{
		blockStarted: started,
		blockRelease: release,
		result:       CommandResult{Status: CommandStatusConfirmed},
	}
	manager := NewManager(FactoryRegistry{
		ModbusRTUKind: func() (Adapter, error) {
			return adapter, nil
		},
	})
	defer manager.ApplyDefinitions(nil)

	if _, err := manager.ApplyDefinitions([]Definition{setNumberCommandDefinition("source-command", "valve-pwm")}); err != nil {
		t.Fatalf("apply set_number command source definition: %v", err)
	}

	firstDone := make(chan CommandResult, 1)
	go func() {
		result, _ := manager.ExecuteCommand(context.Background(), CommandRequest{
			DeviceID: "valve-pwm",
			Command:  "set_number",
			Value:    128,
		})
		firstDone <- result
	}()

	select {
	case <-started:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for first set_number command to enter adapter")
	}

	busyResult, err := manager.ExecuteCommand(context.Background(), CommandRequest{
		DeviceID: "valve-pwm",
		Command:  "set_number",
		Value:    129,
	})
	if err != nil {
		t.Fatalf("busy set_number command should return failed result, got error %v", err)
	}
	if busyResult.Status != CommandStatusFailed {
		t.Fatalf("expected failed busy set_number result, got %+v", busyResult)
	}
	if busyResult.Reason != "command target is busy" {
		t.Fatalf("expected busy command reason, got %q", busyResult.Reason)
	}

	close(release)
	select {
	case result := <-firstDone:
		if result.Status != CommandStatusConfirmed {
			t.Fatalf("expected first set_number command to complete confirmed, got %+v", result)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for first set_number command to finish")
	}
	if adapter.callCount() != 1 {
		t.Fatalf("busy set_number command must not delegate a second adapter call, got %d", adapter.callCount())
	}
}

func assertCloudSafeReading(t *testing.T, reading Reading, sourceID string, deviceID string, metric string, value any) {
	t.Helper()

	if reading.SourceID != sourceID || reading.DeviceID != deviceID || reading.Metric != metric || reading.Value != value {
		t.Fatalf("unexpected normalized reading: %+v", reading)
	}
	payload, err := json.Marshal(reading)
	if err != nil {
		t.Fatalf("marshal normalized reading: %v", err)
	}
	if strings.Contains(string(payload), "registerType") || strings.Contains(string(payload), "address") {
		t.Fatalf("normalized cloud-bound reading must not expose modbus register metadata: %s", payload)
	}
}

func boundaryDefinition(sourceID string, deviceID string, metric string) Definition {
	return Definition{
		SourceID:       sourceID,
		AdapterKind:    ModbusRTUKind,
		Enabled:        true,
		PollIntervalMs: 1000,
		Connection: map[string]any{
			"transport": "rtu",
		},
		Devices: []DeviceDefinition{
			{
				DeviceID: deviceID,
				Address:  map[string]any{"node": 1},
				Metrics: []MetricDefinition{
					{
						Metric:    metric,
						ValueType: "number",
						Mapping:   map[string]any{"registerType": "input", "address": 10},
					},
				},
			},
		},
	}
}

func commandDefinition(sourceID string, deviceID string, commandType string) Definition {
	definition := boundaryDefinition(sourceID, deviceID, "actual_state")
	definition.Devices[0].Metrics[0].ValueType = "boolean"
	definition.Devices[0].Commands = []CommandDefinition{
		{
			Command:        commandType,
			Mapping:        map[string]any{"registerType": "holding", "address": 160},
			ReportedMetric: "actual_state",
		},
	}
	return definition
}

func setNumberCommandDefinition(sourceID string, deviceID string) Definition {
	definition := boundaryDefinition(sourceID, deviceID, "actual_value")
	definition.Devices[0].Metrics[0].ValueType = "number"
	definition.Devices[0].Commands = []CommandDefinition{
		{
			Command:        "set_number",
			Mapping:        map[string]any{"registerType": "holding", "address": 160},
			Min:            0,
			Max:            255,
			ReportedMetric: "actual_value",
		},
	}
	return definition
}

type boundaryAdapter struct {
	sourceID          string
	sink              Sink
	applyCount        int
	closed            bool
	adapters          map[string]*boundaryAdapter
	applyErr          error
	appliedDefinition Definition
}

func (a *boundaryAdapter) ApplyDefinition(definition Definition, sink Sink) error {
	if a.applyErr != nil {
		return a.applyErr
	}
	a.sourceID = definition.SourceID
	a.sink = sink
	a.appliedDefinition = definition
	a.applyCount++
	a.closed = false
	if a.adapters != nil {
		a.adapters[a.sourceID] = a
	}
	return nil
}

func (a *boundaryAdapter) Close() error {
	a.closed = true
	return nil
}

func (a *boundaryAdapter) publishReading(reading RawReading) {
	if a.closed {
		return
	}
	a.sink.PublishReading(reading)
}

func (a *boundaryAdapter) publishFault(fault Fault) {
	if a.closed {
		return
	}
	a.sink.PublishFault(fault)
}

type commandBoundaryAdapter struct {
	boundaryAdapter
	mu           sync.Mutex
	lastRequest  CommandRequest
	calls        int
	result       CommandResult
	blockStarted chan struct{}
	blockRelease chan struct{}
}

func (a *commandBoundaryAdapter) ExecuteCommand(ctx context.Context, request CommandRequest) (CommandResult, error) {
	a.mu.Lock()
	a.lastRequest = request
	a.calls++
	started := a.blockStarted
	release := a.blockRelease
	a.mu.Unlock()

	if started != nil {
		close(started)
	}
	if release != nil {
		select {
		case <-release:
		case <-ctx.Done():
			return CommandResult{Status: CommandStatusFailed, Reason: ctx.Err().Error()}, nil
		}
	}

	result := a.result
	result.DeviceID = request.DeviceID
	result.Command = request.Command
	return result, nil
}

func (a *commandBoundaryAdapter) callCount() int {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.calls
}
