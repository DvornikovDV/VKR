package source_test

import (
	"testing"
	"time"

	"edge_server/go_core/internal/mockadapter"
	"edge_server/go_core/internal/source"
)

func TestReproTaskT008ManagerRoutesMockReadingsAndFaultsThroughBoundary(t *testing.T) {
	manager := source.NewManager(source.FactoryRegistry{
		mockadapter.Kind: func() (source.Adapter, error) {
			return mockadapter.New(), nil
		},
	})

	report, err := manager.ApplyDefinitions([]source.Definition{testDefinition("source-1")})
	if err != nil {
		t.Fatalf("apply source definitions: %v", err)
	}
	if len(report.Applied) != 1 || report.Applied[0] != "source-1" {
		t.Fatalf("expected source-1 to be applied, got %+v", report)
	}

	control, err := manager.MockControl("source-1")
	if err != nil {
		t.Fatalf("get mock control through manager boundary: %v", err)
	}

	ts := time.Now().UnixMilli()
	if err := control.EmitReading(source.RawReading{
		SourceID: "spoofed-source",
		DeviceID: "device-1",
		Metric:   "pressure",
		Value:    42.5,
		TS:       ts,
		Metadata: map[string]any{"ignored": true},
	}); err != nil {
		t.Fatalf("emit mock reading through manager boundary: %v", err)
	}

	select {
	case reading := <-manager.Readings():
		if reading.SourceID != "source-1" {
			t.Fatalf("expected manager to stamp applied sourceId, got %+v", reading)
		}
		if reading.DeviceID != "device-1" || reading.Metric != "pressure" {
			t.Fatalf("unexpected normalized reading identity: %+v", reading)
		}
		if reading.Value != 42.5 || reading.TS != ts {
			t.Fatalf("unexpected normalized reading payload: %+v", reading)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for manager reading")
	}

	if err := control.EmitFault(source.Fault{
		SourceID: "spoofed-source",
		Severity: source.SeverityError,
		Code:     "mock_timeout",
		Message:  "mock source timeout",
		TS:       ts,
	}); err != nil {
		t.Fatalf("emit mock fault through manager boundary: %v", err)
	}

	select {
	case fault := <-manager.Faults():
		if fault.SourceID != "source-1" {
			t.Fatalf("expected manager to stamp applied fault sourceId, got %+v", fault)
		}
		if fault.Code != "mock_timeout" || fault.Message != "mock source timeout" {
			t.Fatalf("unexpected fault payload: %+v", fault)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for manager fault")
	}
}

func TestReproTaskT023ManagerReusesStableDefinitionsWithoutRedefinition(t *testing.T) {
	manager := source.NewManager(source.FactoryRegistry{
		mockadapter.Kind: func() (source.Adapter, error) {
			return mockadapter.New(), nil
		},
	})

	definitions := []source.Definition{testDefinition("source-1")}

	firstReport, err := manager.ApplyDefinitions(definitions)
	if err != nil {
		t.Fatalf("apply initial source definitions: %v", err)
	}
	if len(firstReport.Applied) != 1 || firstReport.Applied[0] != "source-1" {
		t.Fatalf("expected first apply to configure source-1, got %+v", firstReport)
	}

	firstControl, err := manager.MockControl("source-1")
	if err != nil {
		t.Fatalf("get initial mock control: %v", err)
	}
	if firstControl.ApplyCount() != 1 {
		t.Fatalf("expected initial definition apply count 1, got %d", firstControl.ApplyCount())
	}

	for _, phase := range []string{"reconnect", "trust-loss", "fresh re-onboarding"} {
		report, err := manager.ApplyDefinitions(definitions)
		if err != nil {
			t.Fatalf("reapply unchanged definitions across %s: %v", phase, err)
		}
		if len(report.Reused) != 1 || report.Reused[0] != "source-1" {
			t.Fatalf("expected source-1 to be reused across %s, got %+v", phase, report)
		}
	}

	secondControl, err := manager.MockControl("source-1")
	if err != nil {
		t.Fatalf("get reused mock control: %v", err)
	}
	if firstControl != secondControl {
		t.Fatal("expected unchanged definition reuse to keep the same mock control instance")
	}
	if secondControl.ApplyCount() != 1 {
		t.Fatalf("expected unchanged definitions to avoid redefinition, got apply count %d", secondControl.ApplyCount())
	}
}

func testDefinition(sourceID string) source.Definition {
	return source.Definition{
		SourceID:       sourceID,
		AdapterKind:    mockadapter.Kind,
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
	}
}
