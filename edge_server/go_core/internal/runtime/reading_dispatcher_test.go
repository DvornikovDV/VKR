package runtime

import (
	"context"
	"strings"
	"testing"
	"time"

	"edge_server/go_core/internal/cloud"
	"edge_server/go_core/internal/source"
)

func TestReadingDispatcherFansOutToTelemetryAndAlarmConsumersWithoutChangingTelemetryPayload(t *testing.T) {
	sourceReadings := make(chan source.Reading, 1)
	dispatcher, err := NewReadingDispatcher(sourceReadings)
	if err != nil {
		t.Fatalf("create reading dispatcher: %v", err)
	}
	telemetryReadings, err := dispatcher.AddConsumer("telemetry", 4)
	if err != nil {
		t.Fatalf("add telemetry consumer: %v", err)
	}
	alarmReadings, err := dispatcher.AddConsumer("alarm-detector", 4)
	if err != nil {
		t.Fatalf("add alarm consumer: %v", err)
	}

	emitter := &telemetryEmitterStub{}
	client, err := cloud.NewTelemetryClient(emitter)
	if err != nil {
		t.Fatalf("create telemetry client: %v", err)
	}
	pipeline, err := NewTelemetryPipeline(TelemetryPipelineConfig{
		Readings:    telemetryReadings,
		IntervalMs:  1000,
		MaxReadings: 1,
		Client:      client,
		StateSnapshot: func() SessionStateSnapshot {
			return SessionStateSnapshot{Trusted: true, Connected: true, SessionEpoch: 1}
		},
	})
	if err != nil {
		t.Fatalf("create telemetry pipeline: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go dispatcher.Run(ctx)
	go pipeline.Run(ctx)

	reading := source.Reading{
		SourceID: "arduino_stand",
		DeviceID: "environment",
		Metric:   "temperature",
		Value:    30.5,
		TS:       1700000000000,
	}
	sourceReadings <- reading

	select {
	case observed := <-alarmReadings:
		if observed != reading {
			t.Fatalf("expected alarm consumer to receive normalized reading %+v, got %+v", reading, observed)
		}
	case <-time.After(500 * time.Millisecond):
		t.Fatal("expected alarm consumer to receive dispatcher reading")
	}

	deadline := time.Now().Add(500 * time.Millisecond)
	for time.Now().Before(deadline) {
		payloads := emitter.Payloads()
		if len(payloads) == 0 {
			time.Sleep(10 * time.Millisecond)
			continue
		}

		const want = `{"readings":[{"deviceId":"environment","metric":"temperature","value":30.5,"ts":1700000000000}]}`
		if payloads[0] != want {
			t.Fatalf("expected unchanged telemetry payload %s, got %s", want, payloads[0])
		}
		if strings.Contains(payloads[0], "sourceId") {
			t.Fatalf("regular telemetry payload must omit sourceId, got %s", payloads[0])
		}
		return
	}

	t.Fatal("expected telemetry payload from dispatcher reading")
}
