package runtime

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"testing"
	"time"

	"edge_server/go_core/internal/cloud"
	"edge_server/go_core/internal/source"
)

type telemetryEmitterStub struct {
	mu            sync.Mutex
	failuresLeft  int
	payloads      []string
}

func (s *telemetryEmitterStub) Emit(_ string, payload any) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.failuresLeft > 0 {
		s.failuresLeft--
		return fmt.Errorf("synthetic emit failure")
	}

	encoded, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	s.payloads = append(s.payloads, string(encoded))
	return nil
}

func (s *telemetryEmitterStub) Payloads() []string {
	s.mu.Lock()
	defer s.mu.Unlock()

	cloned := make([]string, len(s.payloads))
	copy(cloned, s.payloads)
	return cloned
}

func TestReproTaskT021TelemetryPipelineDoesNotSilentlyLoseBatchOnEmitFailure(t *testing.T) {
	readings := make(chan source.Reading, 4)
	emitter := &telemetryEmitterStub{failuresLeft: 1}
	client, err := cloud.NewTelemetryClient(emitter)
	if err != nil {
		t.Fatalf("create telemetry client: %v", err)
	}

	pipeline, err := NewTelemetryPipeline(TelemetryPipelineConfig{
		Readings:    readings,
		IntervalMs:  25,
		MaxReadings: 2,
		Client:      client,
		StateSnapshot: func() SessionStateSnapshot {
			return SessionStateSnapshot{Trusted: true, Connected: true}
		},
	})
	if err != nil {
		t.Fatalf("create telemetry pipeline: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	go pipeline.Run(ctx)

	readings <- source.Reading{SourceID: "source-1", DeviceID: "pump-1", Metric: "pressure", Value: 18.5, TS: 1001}
	readings <- source.Reading{SourceID: "source-1", DeviceID: "pump-2", Metric: "pressure", Value: 19.5, TS: 1002}

	deadline := time.Now().Add(500 * time.Millisecond)
	for time.Now().Before(deadline) {
		payloads := emitter.Payloads()
		if len(payloads) > 0 {
			const want = `{"readings":[{"deviceId":"pump-1","metric":"pressure","value":18.5,"ts":1001},{"deviceId":"pump-2","metric":"pressure","value":19.5,"ts":1002}]}`
			if payloads[0] != want {
				t.Fatalf("expected retained batch payload %s, got %s", want, payloads[0])
			}
			return
		}
		time.Sleep(10 * time.Millisecond)
	}

	t.Fatal("expected failed batch to be retried without silent loss")
}
