package runtime

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"

	"edge_server/go_core/internal/cloud"
	"edge_server/go_core/internal/config"
	"edge_server/go_core/internal/source"
)

type alarmEmitterStub struct {
	mu       sync.Mutex
	payloads []cloud.AlarmPayload
}

func (s *alarmEmitterStub) EmitAlarmEvent(payload cloud.AlarmPayload) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.payloads = append(s.payloads, payload)
	return nil
}

func (s *alarmEmitterStub) Payloads() []cloud.AlarmPayload {
	s.mu.Lock()
	defer s.mu.Unlock()

	cloned := make([]cloud.AlarmPayload, len(s.payloads))
	copy(cloned, s.payloads)
	return cloned
}

type blockingAlarmEmitter struct {
	started     chan struct{}
	release     chan struct{}
	startedOnce sync.Once
	releaseOnce sync.Once
}

func newBlockingAlarmEmitter() *blockingAlarmEmitter {
	return &blockingAlarmEmitter{
		started: make(chan struct{}),
		release: make(chan struct{}),
	}
}

func (e *blockingAlarmEmitter) EmitAlarmEvent(cloud.AlarmPayload) error {
	e.startedOnce.Do(func() {
		close(e.started)
	})
	<-e.release
	return fmt.Errorf("synthetic alarm emit failure")
}

func (e *blockingAlarmEmitter) Release() {
	e.releaseOnce.Do(func() {
		close(e.release)
	})
}

type gatedAlarmStateSnapshot struct {
	mu            sync.Mutex
	snapshot      SessionStateSnapshot
	calls         int
	secondStarted chan struct{}
	releaseSecond chan struct{}
	secondOnce    sync.Once
	releaseOnce   sync.Once
}

func newGatedAlarmStateSnapshot(snapshot SessionStateSnapshot) *gatedAlarmStateSnapshot {
	return &gatedAlarmStateSnapshot{
		snapshot:      snapshot,
		secondStarted: make(chan struct{}),
		releaseSecond: make(chan struct{}),
	}
}

func (s *gatedAlarmStateSnapshot) Set(snapshot SessionStateSnapshot) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.snapshot = snapshot
}

func (s *gatedAlarmStateSnapshot) ReleaseSecond() {
	s.releaseOnce.Do(func() {
		close(s.releaseSecond)
	})
}

func (s *gatedAlarmStateSnapshot) Snapshot() SessionStateSnapshot {
	s.mu.Lock()
	s.calls++
	call := s.calls
	snapshot := s.snapshot
	s.mu.Unlock()

	if call == 2 {
		s.secondOnce.Do(func() {
			close(s.secondStarted)
		})
		<-s.releaseSecond

		s.mu.Lock()
		snapshot = s.snapshot
		s.mu.Unlock()
	}

	return snapshot
}

func TestAlarmDetectorRuntimeDispatcherEmitsHighActiveClearAndFeedsTelemetry(t *testing.T) {
	enabled := true
	triggerHigh := 30.0
	clearHigh := 28.0
	emitter := &alarmEmitterStub{}
	detectedAt := time.UnixMilli(1_779_999_010).UTC()

	sourceReadings := make(chan source.Reading, 8)
	dispatcher, telemetrySink, alarmSink := newAlarmRuntimeDispatcherForTest(t, sourceReadings, 8)

	telemetryEmitter := &telemetryEmitterStub{}
	telemetryClient, err := cloud.NewTelemetryClient(telemetryEmitter)
	if err != nil {
		t.Fatalf("create telemetry client: %v", err)
	}
	telemetry, err := NewTelemetryPipeline(TelemetryPipelineConfig{
		Readings:    telemetrySink,
		IntervalMs:  1000,
		MaxReadings: 1,
		Client:      telemetryClient,
		StateSnapshot: func() SessionStateSnapshot {
			return SessionStateSnapshot{Trusted: true, Connected: true, SessionEpoch: 1}
		},
	})
	if err != nil {
		t.Fatalf("create telemetry pipeline: %v", err)
	}

	runner := New()
	if err := runner.ActivateTrustedSession("edge-1", "persist-secret"); err != nil {
		t.Fatalf("activate trusted runtime session: %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	if _, err := runner.BindAlarmReadings(ctx, alarmSink, AlarmDetectorConfig{
		EdgeID: "edge-1",
		Rules: []config.AlarmRuleDefinition{
			{
				RuleID:           "temp_high",
				Enabled:          &enabled,
				SourceID:         "arduino_stand",
				DeviceID:         "environment",
				Metric:           "temperature",
				ConditionType:    "high",
				TriggerThreshold: &triggerHigh,
				ClearThreshold:   &clearHigh,
				Severity:         "warning",
				Label:            "High temperature",
			},
		},
		Emitter: emitter,
		Now: func() time.Time {
			return detectedAt
		},
	}); err != nil {
		t.Fatalf("bind alarm detector: %v", err)
	}

	go dispatcher.Run(ctx)
	go telemetry.Run(ctx)

	sourceReadings <- source.Reading{SourceID: "arduino_stand", DeviceID: "environment", Metric: "temperature", Value: 29.9, TS: 1001}
	assertAlarmPayloadCountWithin(t, emitter, 0, 100*time.Millisecond)

	sourceReadings <- source.Reading{SourceID: "arduino_stand", DeviceID: "environment", Metric: "temperature", Value: 30.0, TS: 1002}
	payloads := waitAlarmPayloadCount(t, emitter, 1)
	active := payloads[0]
	if active.EventType != cloud.AlarmEventTypeActive || active.Rule.RuleID != "temp_high" {
		t.Fatalf("expected active temp_high event, got %+v", active)
	}
	if active.EdgeID != "edge-1" || active.SourceID != "arduino_stand" || active.DeviceID != "environment" || active.Metric != "temperature" {
		t.Fatalf("unexpected active event identity: %+v", active)
	}
	if active.Value != 30.0 || active.TS != 1002 || active.DetectedAt != detectedAt.UnixMilli() {
		t.Fatalf("unexpected active event values: %+v", active)
	}
	if active.Rule.RuleRevision == "" || active.Rule.TriggerThreshold == nil || *active.Rule.TriggerThreshold != triggerHigh {
		t.Fatalf("expected full deterministic rule snapshot, got %+v", active.Rule)
	}
	if active.Rule.ClearThreshold == nil || *active.Rule.ClearThreshold != clearHigh || active.Rule.ConditionType != "high" || active.Rule.Severity != cloud.AlarmSeverityWarning || active.Rule.Label != "High temperature" {
		t.Fatalf("expected complete rule snapshot, got %+v", active.Rule)
	}

	sourceReadings <- source.Reading{SourceID: "arduino_stand", DeviceID: "environment", Metric: "temperature", Value: 28.0, TS: 1004}
	payloads = waitAlarmPayloadCount(t, emitter, 2)
	clear := payloads[1]
	if clear.EventType != cloud.AlarmEventTypeClear || clear.Rule.RuleID != "temp_high" {
		t.Fatalf("expected clear temp_high event, got %+v", clear)
	}
	if clear.Rule.RuleRevision != active.Rule.RuleRevision {
		t.Fatalf("expected revision to stay stable across event fields, active=%q clear=%q", active.Rule.RuleRevision, clear.Rule.RuleRevision)
	}

	const firstTelemetryPayload = `{"readings":[{"deviceId":"environment","metric":"temperature","value":29.9,"ts":1001}]}`
	if got := waitTelemetryPayload(t, telemetryEmitter, firstTelemetryPayload); got != firstTelemetryPayload {
		t.Fatalf("expected telemetry sink to receive unchanged normalized reading payload %s, got %s", firstTelemetryPayload, got)
	}
}

func TestAlarmDetectorSuppressesDuplicateTransitionsThroughDispatcher(t *testing.T) {
	enabled := true
	triggerHigh := 30.0
	clearHigh := 28.0
	emitter := &alarmEmitterStub{}
	sourceReadings := make(chan source.Reading, 8)
	dispatcher, _, alarmSink := newAlarmRuntimeDispatcherForTest(t, sourceReadings, 8)

	runner := New()
	if err := runner.ActivateTrustedSession("edge-1", "persist-secret"); err != nil {
		t.Fatalf("activate trusted runtime session: %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	if _, err := runner.BindAlarmReadings(ctx, alarmSink, AlarmDetectorConfig{
		EdgeID: "edge-1",
		Rules: []config.AlarmRuleDefinition{
			{
				RuleID:           "temp_high",
				Enabled:          &enabled,
				SourceID:         "arduino_stand",
				DeviceID:         "environment",
				Metric:           "temperature",
				ConditionType:    "high",
				TriggerThreshold: &triggerHigh,
				ClearThreshold:   &clearHigh,
				Severity:         "warning",
				Label:            "High temperature",
			},
		},
		Emitter: emitter,
		Now: func() time.Time {
			return time.UnixMilli(1_779_999_010).UTC()
		},
	}); err != nil {
		t.Fatalf("bind alarm detector: %v", err)
	}

	go dispatcher.Run(ctx)

	sourceReadings <- source.Reading{SourceID: "arduino_stand", DeviceID: "environment", Metric: "temperature", Value: 30.0, TS: 1001}
	waitAlarmPayloadCount(t, emitter, 1)

	sourceReadings <- source.Reading{SourceID: "arduino_stand", DeviceID: "environment", Metric: "temperature", Value: 30.0, TS: 1002}
	sourceReadings <- source.Reading{SourceID: "arduino_stand", DeviceID: "environment", Metric: "temperature", Value: 31.0, TS: 1003}
	assertAlarmPayloadCountWithin(t, emitter, 1, 150*time.Millisecond)

	sourceReadings <- source.Reading{SourceID: "arduino_stand", DeviceID: "environment", Metric: "temperature", Value: 28.0, TS: 1004}
	waitAlarmPayloadCount(t, emitter, 2)

	sourceReadings <- source.Reading{SourceID: "arduino_stand", DeviceID: "environment", Metric: "temperature", Value: 28.0, TS: 1005}
	sourceReadings <- source.Reading{SourceID: "arduino_stand", DeviceID: "environment", Metric: "temperature", Value: 27.5, TS: 1006}
	assertAlarmPayloadCountWithin(t, emitter, 2, 150*time.Millisecond)
}

func TestAlarmDetectorSkipsQueuedEmissionAfterTrustLossWithoutCommittingState(t *testing.T) {
	enabled := true
	triggerHigh := 30.0
	clearHigh := 28.0
	emitter := &alarmEmitterStub{}
	state := newGatedAlarmStateSnapshot(SessionStateSnapshot{
		Trusted:      true,
		Connected:    true,
		SessionEpoch: 1,
	})
	defer state.ReleaseSecond()

	sourceReadings := make(chan source.Reading, 4)
	dispatcher, _, alarmSink := newAlarmRuntimeDispatcherForTest(t, sourceReadings, 4)
	detector, err := NewAlarmDetector(AlarmDetectorConfig{
		EdgeID: "edge-1",
		Rules: []config.AlarmRuleDefinition{
			{
				RuleID:           "temp_high",
				Enabled:          &enabled,
				SourceID:         "arduino_stand",
				DeviceID:         "environment",
				Metric:           "temperature",
				ConditionType:    "high",
				TriggerThreshold: &triggerHigh,
				ClearThreshold:   &clearHigh,
				Severity:         "warning",
				Label:            "High temperature",
			},
		},
		Emitter:       emitter,
		StateSnapshot: state.Snapshot,
		Now: func() time.Time {
			return time.UnixMilli(1_779_999_010).UTC()
		},
	})
	if err != nil {
		t.Fatalf("create alarm detector: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go dispatcher.Run(ctx)
	go observeAlarmReadingsForTest(t, ctx, alarmSink, detector)

	sourceReadings <- source.Reading{SourceID: "arduino_stand", DeviceID: "environment", Metric: "temperature", Value: 30.0, TS: 1001}
	select {
	case <-state.secondStarted:
	case <-time.After(500 * time.Millisecond):
		t.Fatal("expected queued alarm emission to re-check runtime state")
	}

	state.Set(SessionStateSnapshot{})
	state.ReleaseSecond()
	assertAlarmPayloadCountWithin(t, emitter, 0, 100*time.Millisecond)

	state.Set(SessionStateSnapshot{Trusted: true, Connected: true, SessionEpoch: 2})
	sourceReadings <- source.Reading{SourceID: "arduino_stand", DeviceID: "environment", Metric: "temperature", Value: 30.0, TS: 1002}

	payloads := waitAlarmPayloadCount(t, emitter, 1)
	if payloads[0].TS != 1002 || payloads[0].EventType != cloud.AlarmEventTypeActive {
		t.Fatalf("expected active event to retry after trust recovery with the later reading, got %+v", payloads[0])
	}
}

func TestAlarmEventEmissionFailureDoesNotBlockDispatcherOrTelemetry(t *testing.T) {
	enabled := true
	triggerHigh := 30.0
	clearHigh := 28.0
	sourceReadings := make(chan source.Reading, 8)
	dispatcher, telemetrySink, alarmSink := newAlarmRuntimeDispatcherForTest(t, sourceReadings, 0)

	telemetryEmitter := &telemetryEmitterStub{}
	telemetryClient, err := cloud.NewTelemetryClient(telemetryEmitter)
	if err != nil {
		t.Fatalf("create telemetry client: %v", err)
	}
	telemetry, err := NewTelemetryPipeline(TelemetryPipelineConfig{
		Readings:    telemetrySink,
		IntervalMs:  1000,
		MaxReadings: 1,
		Client:      telemetryClient,
		StateSnapshot: func() SessionStateSnapshot {
			return SessionStateSnapshot{Trusted: true, Connected: true, SessionEpoch: 1}
		},
	})
	if err != nil {
		t.Fatalf("create telemetry pipeline: %v", err)
	}

	blockingEmitter := newBlockingAlarmEmitter()
	defer blockingEmitter.Release()

	runner := New()
	if err := runner.ActivateTrustedSession("edge-1", "persist-secret"); err != nil {
		t.Fatalf("activate trusted runtime session: %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	if _, err := runner.BindAlarmReadings(ctx, alarmSink, AlarmDetectorConfig{
		EdgeID: "edge-1",
		Rules: []config.AlarmRuleDefinition{
			{
				RuleID:           "temp_high",
				Enabled:          &enabled,
				SourceID:         "arduino_stand",
				DeviceID:         "environment",
				Metric:           "temperature",
				ConditionType:    "high",
				TriggerThreshold: &triggerHigh,
				ClearThreshold:   &clearHigh,
				Severity:         "warning",
				Label:            "High temperature",
			},
		},
		Emitter: blockingEmitter,
		Now: func() time.Time {
			return time.UnixMilli(1_779_999_010).UTC()
		},
	}); err != nil {
		t.Fatalf("bind alarm detector: %v", err)
	}

	go dispatcher.Run(ctx)
	go telemetry.Run(ctx)

	sourceReadings <- source.Reading{SourceID: "arduino_stand", DeviceID: "environment", Metric: "temperature", Value: 30.0, TS: 1001}
	select {
	case <-blockingEmitter.started:
	case <-time.After(500 * time.Millisecond):
		t.Fatal("expected alarm emitter to receive first transition")
	}

	sourceReadings <- source.Reading{SourceID: "arduino_stand", DeviceID: "environment", Metric: "temperature", Value: 31.0, TS: 1002}
	sourceReadings <- source.Reading{SourceID: "arduino_stand", DeviceID: "environment", Metric: "temperature", Value: 31.5, TS: 1003}

	const want = `{"readings":[{"deviceId":"environment","metric":"temperature","value":31.5,"ts":1003}]}`
	if got := waitTelemetryPayload(t, telemetryEmitter, want); got != want {
		t.Fatalf("expected telemetry to keep receiving while alarm emit is blocked, got %s", got)
	}

	blockingEmitter.Release()
	select {
	case err := <-runner.asyncErrors:
		if err == nil || !strings.Contains(err.Error(), "synthetic alarm emit failure") {
			t.Fatalf("expected alarm emit failure on runtime async error path, got %v", err)
		}
	case <-time.After(500 * time.Millisecond):
		t.Fatal("expected alarm emit failure to be reported through runtime async error path")
	}
}

func TestAlarmDetectorRequiresStateSnapshotForEnabledRules(t *testing.T) {
	enabled := true
	trigger := 30.0
	clear := 28.0

	_, err := NewAlarmDetector(AlarmDetectorConfig{
		EdgeID: "edge-1",
		Rules: []config.AlarmRuleDefinition{
			{
				RuleID:           "temp_high",
				Enabled:          &enabled,
				SourceID:         "arduino_stand",
				DeviceID:         "environment",
				Metric:           "temperature",
				ConditionType:    "high",
				TriggerThreshold: &trigger,
				ClearThreshold:   &clear,
				Severity:         "warning",
				Label:            "High temperature",
			},
		},
		Emitter: &alarmEmitterStub{},
	})
	if err == nil {
		t.Fatal("expected enabled alarm rules to require runtime state snapshot gating")
	}
	if !strings.Contains(err.Error(), "state snapshot") {
		t.Fatalf("expected state snapshot gating error, got %v", err)
	}
}

func newAlarmRuntimeDispatcherForTest(t *testing.T, input <-chan source.Reading, consumerBuffer int) (*ReadingDispatcher, <-chan source.Reading, <-chan source.Reading) {
	t.Helper()

	dispatcher, err := NewReadingDispatcher(input)
	if err != nil {
		t.Fatalf("create reading dispatcher: %v", err)
	}
	telemetrySink, err := dispatcher.AddConsumer("telemetry", consumerBuffer)
	if err != nil {
		t.Fatalf("add telemetry consumer: %v", err)
	}
	alarmSink, err := dispatcher.AddConsumer("alarm-detector", consumerBuffer)
	if err != nil {
		t.Fatalf("add alarm consumer: %v", err)
	}
	return dispatcher, telemetrySink, alarmSink
}

func observeAlarmReadingsForTest(t *testing.T, ctx context.Context, readings <-chan source.Reading, detector *AlarmDetector) {
	t.Helper()

	for {
		select {
		case <-ctx.Done():
			return
		case reading, ok := <-readings:
			if !ok {
				return
			}
			if err := detector.Observe(reading); err != nil {
				t.Errorf("observe alarm reading: %v", err)
				return
			}
		}
	}
}

func waitAlarmPayloadCount(t *testing.T, emitter *alarmEmitterStub, want int) []cloud.AlarmPayload {
	t.Helper()

	deadline := time.Now().Add(500 * time.Millisecond)
	for time.Now().Before(deadline) {
		payloads := emitter.Payloads()
		if len(payloads) == want {
			return payloads
		}
		time.Sleep(10 * time.Millisecond)
	}
	payloads := emitter.Payloads()
	t.Fatalf("expected %d alarm payloads, got %d: %+v", want, len(payloads), payloads)
	return nil
}

func assertAlarmPayloadCountWithin(t *testing.T, emitter *alarmEmitterStub, want int, duration time.Duration) {
	t.Helper()

	deadline := time.Now().Add(duration)
	for time.Now().Before(deadline) {
		payloads := emitter.Payloads()
		if len(payloads) != want {
			t.Fatalf("expected %d alarm payloads, got %d: %+v", want, len(payloads), payloads)
		}
		time.Sleep(10 * time.Millisecond)
	}
}

func waitTelemetryPayload(t *testing.T, emitter *telemetryEmitterStub, want string) string {
	t.Helper()

	deadline := time.Now().Add(500 * time.Millisecond)
	last := ""
	for time.Now().Before(deadline) {
		payloads := emitter.Payloads()
		for _, payload := range payloads {
			if payload == want {
				return payload
			}
			last = payload
		}
		time.Sleep(10 * time.Millisecond)
	}
	return last
}
