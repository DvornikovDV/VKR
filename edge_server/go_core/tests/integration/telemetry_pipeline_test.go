package integration

import (
	"encoding/json"
	"testing"
	"time"

	"edge_server/go_core/internal/config"
	"edge_server/go_core/internal/mockadapter"
	"edge_server/go_core/internal/source"
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
