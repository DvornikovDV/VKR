package mockadapter

import (
	"testing"

	"edge_server/go_core/internal/source"
)

func TestMockAdapterRemainsReferenceHarnessWithoutCloudContext(t *testing.T) {
	adapter := New()
	sink := &captureSink{}

	if err := adapter.ApplyDefinition(source.Definition{
		SourceID:       "source-1",
		AdapterKind:    Kind,
		Enabled:        true,
		PollIntervalMs: 1000,
		Connection: map[string]any{
			"profile": "default",
		},
		Devices: []source.DeviceDefinition{
			{
				DeviceID: "device-1",
				Address: map[string]any{
					"node": 1,
				},
				Metrics: []source.MetricDefinition{
					{
						Metric:    "pressure",
						ValueType: "number",
						Mapping: map[string]any{
							"register": 40001,
						},
					},
				},
			},
		},
	}, sink); err != nil {
		t.Fatalf("apply definition without cloud lifecycle context: %v", err)
	}

	if adapter.ApplyCount() != 1 {
		t.Fatalf("expected definition apply count 1, got %d", adapter.ApplyCount())
	}

	if err := adapter.EmitReading(source.RawReading{
		SourceID: "spoofed-source",
		DeviceID: "device-1",
		Metric:   "pressure",
		Value:    true,
		TS:       1234,
		Metadata: map[string]any{"ignored": "value"},
	}); err != nil {
		t.Fatalf("emit reading without cloud lifecycle context: %v", err)
	}

	if len(sink.readings) != 1 {
		t.Fatalf("expected one reading, got %d", len(sink.readings))
	}
	if sink.readings[0].SourceID != "source-1" {
		t.Fatalf("expected adapter to emit applied sourceId, got %+v", sink.readings[0])
	}

	if err := adapter.EmitFault(source.Fault{
		SourceID: "spoofed-source",
		Severity: source.SeverityWarning,
		Code:     "mock_warning",
		Message:  "mock adapter warning",
		TS:       5678,
	}); err != nil {
		t.Fatalf("emit fault without cloud lifecycle context: %v", err)
	}

	if len(sink.faults) != 1 {
		t.Fatalf("expected one fault, got %d", len(sink.faults))
	}
	if sink.faults[0].SourceID != "source-1" {
		t.Fatalf("expected adapter to emit applied sourceId on faults, got %+v", sink.faults[0])
	}
}

func TestMockAdapterRejectsProductionAdapterKind(t *testing.T) {
	adapter := New()

	err := adapter.ApplyDefinition(source.Definition{
		SourceID:       "source-rtu",
		AdapterKind:    source.ModbusRTUKind,
		Enabled:        true,
		PollIntervalMs: 1000,
		Connection:     map[string]any{"transport": "rtu"},
		Devices: []source.DeviceDefinition{
			{
				DeviceID: "device-1",
				Metrics: []source.MetricDefinition{
					{
						Metric:    "temperature",
						ValueType: "number",
						Mapping:   map[string]any{"registerType": "input", "address": 10},
					},
				},
			},
		},
	}, &captureSink{})
	if err == nil {
		t.Fatal("mock adapter must not accept the production modbus_rtu adapter kind")
	}
	if adapter.ApplyCount() != 0 {
		t.Fatalf("production adapter rejection must not apply mock state, got apply count %d", adapter.ApplyCount())
	}
}

type captureSink struct {
	readings []source.RawReading
	faults   []source.Fault
}

func (s *captureSink) PublishReading(reading source.RawReading) {
	s.readings = append(s.readings, reading)
}

func (s *captureSink) PublishFault(fault source.Fault) {
	s.faults = append(s.faults, fault)
}
