package source

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"

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

type boundaryAdapter struct {
	sourceID   string
	sink       Sink
	applyCount int
	closed     bool
	adapters   map[string]*boundaryAdapter
	applyErr   error
}

func (a *boundaryAdapter) ApplyDefinition(definition Definition, sink Sink) error {
	if a.applyErr != nil {
		return a.applyErr
	}
	a.sourceID = definition.SourceID
	a.sink = sink
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
