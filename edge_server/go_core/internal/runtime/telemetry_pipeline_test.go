package runtime

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"

	"edge_server/go_core/internal/cloud"
	"edge_server/go_core/internal/source"
)

type telemetryEmitterStub struct {
	mu           sync.Mutex
	failuresLeft int
	payloads     []string
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

type telemetryStateStub struct {
	mu       sync.RWMutex
	snapshot SessionStateSnapshot
}

func newTelemetryStateStub(snapshot SessionStateSnapshot) *telemetryStateStub {
	return &telemetryStateStub{snapshot: snapshot}
}

func (s *telemetryStateStub) Set(snapshot SessionStateSnapshot) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.snapshot = snapshot
}

func (s *telemetryStateStub) Snapshot() SessionStateSnapshot {
	s.mu.RLock()
	defer s.mu.RUnlock()

	return s.snapshot
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
			return SessionStateSnapshot{Trusted: true, Connected: true, SessionEpoch: 1}
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

func TestReproTaskT021TelemetryPipelineDoesNotMixPendingReadingsAcrossRecoveredSessionEpochs(t *testing.T) {
	readings := make(chan source.Reading)
	emitter := &telemetryEmitterStub{}
	client, err := cloud.NewTelemetryClient(emitter)
	if err != nil {
		t.Fatalf("create telemetry client: %v", err)
	}

	state := newTelemetryStateStub(SessionStateSnapshot{
		Trusted:      true,
		Connected:    true,
		SessionEpoch: 1,
	})

	pipeline, err := NewTelemetryPipeline(TelemetryPipelineConfig{
		Readings:      readings,
		IntervalMs:    1000,
		MaxReadings:   2,
		Client:        client,
		StateSnapshot: state.Snapshot,
	})
	if err != nil {
		t.Fatalf("create telemetry pipeline: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	go pipeline.Run(ctx)

	readings <- source.Reading{SourceID: "source-1", DeviceID: "pump-1", Metric: "pressure", Value: 18.5, TS: 1001}

	state.Set(SessionStateSnapshot{
		Trusted:      true,
		Connected:    true,
		SessionEpoch: 2,
	})

	readings <- source.Reading{SourceID: "source-1", DeviceID: "pump-2", Metric: "pressure", Value: 19.5, TS: 1002}
	readings <- source.Reading{SourceID: "source-1", DeviceID: "pump-3", Metric: "running", Value: true, TS: 1003}

	deadline := time.Now().Add(250 * time.Millisecond)
	for time.Now().Before(deadline) {
		payloads := emitter.Payloads()
		if len(payloads) == 0 {
			time.Sleep(10 * time.Millisecond)
			continue
		}

		const want = `{"readings":[{"deviceId":"pump-2","metric":"pressure","value":19.5,"ts":1002},{"deviceId":"pump-3","metric":"running","value":true,"ts":1003}]}`
		if payloads[0] != want {
			t.Fatalf("expected recovered session payload %s, got %s", want, payloads[0])
		}
		return
	}

	t.Fatal("expected recovered session payload")
}

func TestReproTaskT050TelemetryPipelineDropsPendingBatchAfterEligibilityLossBeforeRecovery(t *testing.T) {
	readings := make(chan source.Reading)
	emitter := &telemetryEmitterStub{}
	client, err := cloud.NewTelemetryClient(emitter)
	if err != nil {
		t.Fatalf("create telemetry client: %v", err)
	}

	state := newTelemetryStateStub(SessionStateSnapshot{
		Trusted:      true,
		Connected:    true,
		SessionEpoch: 7,
	})

	pipeline, err := NewTelemetryPipeline(TelemetryPipelineConfig{
		Readings:      readings,
		IntervalMs:    1000,
		MaxReadings:   2,
		Client:        client,
		StateSnapshot: state.Snapshot,
	})
	if err != nil {
		t.Fatalf("create telemetry pipeline: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	go pipeline.Run(ctx)

	readings <- source.Reading{SourceID: "source-1", DeviceID: "pump-1", Metric: "pressure", Value: 21.5, TS: 2001}

	state.Set(SessionStateSnapshot{
		Trusted:      false,
		Connected:    false,
		SessionEpoch: 0,
	})

	state.Set(SessionStateSnapshot{
		Trusted:      true,
		Connected:    true,
		SessionEpoch: 8,
	})

	readings <- source.Reading{SourceID: "source-1", DeviceID: "pump-2", Metric: "pressure", Value: 22.5, TS: 2002}
	readings <- source.Reading{SourceID: "source-1", DeviceID: "pump-3", Metric: "running", Value: false, TS: 2003}

	deadline := time.Now().Add(250 * time.Millisecond)
	for time.Now().Before(deadline) {
		payloads := emitter.Payloads()
		if len(payloads) == 0 {
			time.Sleep(10 * time.Millisecond)
			continue
		}

		const want = `{"readings":[{"deviceId":"pump-2","metric":"pressure","value":22.5,"ts":2002},{"deviceId":"pump-3","metric":"running","value":false,"ts":2003}]}`
		if payloads[0] != want {
			t.Fatalf("expected recovery payload %s, got %s", want, payloads[0])
		}
		return
	}

	t.Fatal("expected recovered telemetry payload")
}

func TestTelemetryPipelineReportsOnEmitSuccessPersistenceError(t *testing.T) {
	readings := make(chan source.Reading, 2)
	emitter := &telemetryEmitterStub{}
	client, err := cloud.NewTelemetryClient(emitter)
	if err != nil {
		t.Fatalf("create telemetry client: %v", err)
	}

	reportedErr := make(chan error, 1)
	pipeline, err := NewTelemetryPipeline(TelemetryPipelineConfig{
		Readings:    readings,
		IntervalMs:  25,
		MaxReadings: 1,
		Client:      client,
		StateSnapshot: func() SessionStateSnapshot {
			return SessionStateSnapshot{Trusted: true, Connected: true, SessionEpoch: 1}
		},
		OnEmitSuccess: func(time.Time) error {
			return fmt.Errorf("synthetic runtime-state persistence failure")
		},
		OnAsyncError: func(err error) {
			reportedErr <- err
		},
	})
	if err != nil {
		t.Fatalf("create telemetry pipeline: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	go pipeline.Run(ctx)

	readings <- source.Reading{SourceID: "source-1", DeviceID: "pump-1", Metric: "pressure", Value: 18.5, TS: 1001}

	select {
	case err := <-reportedErr:
		if err == nil || !strings.Contains(err.Error(), "synthetic runtime-state persistence failure") {
			t.Fatalf("expected persistence failure to be reported, got %v", err)
		}
	case <-time.After(500 * time.Millisecond):
		t.Fatal("expected telemetry pipeline to report onEmitSuccess persistence error")
	}

	payloads := emitter.Payloads()
	if len(payloads) != 1 {
		t.Fatalf("expected telemetry payload to still be emitted once, got %+v", payloads)
	}
}
