package runtime

import (
	"strings"
	"testing"
	"time"

	"edge_server/go_core/internal/cloud"
	"edge_server/go_core/internal/config"
	"edge_server/go_core/internal/source"
)

type alarmEmitterStub struct {
	payloads []cloud.AlarmPayload
}

func (s *alarmEmitterStub) EmitAlarmEvent(payload cloud.AlarmPayload) error {
	s.payloads = append(s.payloads, payload)
	return nil
}

func TestAlarmDetectorIndexesEnabledRulesEvaluatesConditionsAndSuppressesUnchangedStates(t *testing.T) {
	enabled := true
	disabled := false
	triggerHigh := 30.0
	clearHigh := 28.0
	triggerLow := 10.0
	clearLow := 12.0
	expectedStopped := false
	expectedMode := 2.0
	emitter := &alarmEmitterStub{}
	detectedAt := time.UnixMilli(1_779_999_010).UTC()

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
			{
				RuleID:           "pressure_low",
				Enabled:          &enabled,
				SourceID:         "arduino_stand",
				DeviceID:         "hydraulics",
				Metric:           "pressure",
				ConditionType:    "low",
				TriggerThreshold: &triggerLow,
				ClearThreshold:   &clearLow,
				Severity:         "danger",
				Label:            "Low pressure",
			},
			{
				RuleID:        "pump_stopped",
				Enabled:       &enabled,
				SourceID:      "arduino_stand",
				DeviceID:      "pump",
				Metric:        "running",
				ConditionType: "state",
				ExpectedValue: expectedStopped,
				Severity:      "warning",
				Label:         "Pump stopped",
			},
			{
				RuleID:        "mode_two",
				Enabled:       &enabled,
				SourceID:      "arduino_stand",
				DeviceID:      "pump",
				Metric:        "mode",
				ConditionType: "state",
				ExpectedValue: expectedMode,
				Severity:      "warning",
				Label:         "Mode two",
			},
			{
				RuleID:           "disabled_temp",
				Enabled:          &disabled,
				SourceID:         "arduino_stand",
				DeviceID:         "environment",
				Metric:           "temperature",
				ConditionType:    "high",
				TriggerThreshold: &triggerHigh,
				ClearThreshold:   &clearHigh,
				Severity:         "danger",
				Label:            "Disabled high temperature",
			},
			{
				RuleID:           "implicit_disabled_temp",
				SourceID:         "arduino_stand",
				DeviceID:         "environment",
				Metric:           "temperature",
				ConditionType:    "high",
				TriggerThreshold: &triggerHigh,
				ClearThreshold:   &clearHigh,
				Severity:         "danger",
				Label:            "Implicit disabled high temperature",
			},
		},
		Emitter: emitter,
		StateSnapshot: func() SessionStateSnapshot {
			return SessionStateSnapshot{
				Trusted:      true,
				Connected:    true,
				SessionEpoch: 1,
			}
		},
		Now: func() time.Time {
			return detectedAt
		},
	})
	if err != nil {
		t.Fatalf("create alarm detector: %v", err)
	}

	observe := func(reading source.Reading) {
		t.Helper()
		if err := detector.Observe(reading); err != nil {
			t.Fatalf("observe reading %+v: %v", reading, err)
		}
	}
	assertEvents := func(want int) {
		t.Helper()
		if got := len(emitter.payloads); got != want {
			t.Fatalf("expected %d alarm events, got %d: %+v", want, got, emitter.payloads)
		}
	}

	observe(source.Reading{SourceID: "arduino_stand", DeviceID: "environment", Metric: "temperature", Value: "30.0", TS: 1000})
	observe(source.Reading{SourceID: "arduino_stand", DeviceID: "environment", Metric: "temperature", Value: 29.9, TS: 1001})
	assertEvents(0)

	observe(source.Reading{SourceID: "arduino_stand", DeviceID: "environment", Metric: "temperature", Value: 30.0, TS: 1002})
	assertEvents(1)
	active := emitter.payloads[0]
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

	observe(source.Reading{SourceID: "arduino_stand", DeviceID: "environment", Metric: "temperature", Value: 31.0, TS: 1003})
	assertEvents(1)

	observe(source.Reading{SourceID: "arduino_stand", DeviceID: "environment", Metric: "temperature", Value: 28.0, TS: 1004})
	assertEvents(2)
	clear := emitter.payloads[1]
	if clear.EventType != cloud.AlarmEventTypeClear || clear.Rule.RuleID != "temp_high" {
		t.Fatalf("expected clear temp_high event, got %+v", clear)
	}
	if clear.Rule.RuleRevision != active.Rule.RuleRevision {
		t.Fatalf("expected revision to stay stable across event fields, active=%q clear=%q", active.Rule.RuleRevision, clear.Rule.RuleRevision)
	}

	observe(source.Reading{SourceID: "arduino_stand", DeviceID: "environment", Metric: "temperature", Value: 27.5, TS: 1005})
	assertEvents(2)

	observe(source.Reading{SourceID: "arduino_stand", DeviceID: "hydraulics", Metric: "pressure", Value: 10.0, TS: 1006})
	observe(source.Reading{SourceID: "arduino_stand", DeviceID: "hydraulics", Metric: "pressure", Value: 12.0, TS: 1007})
	observe(source.Reading{SourceID: "arduino_stand", DeviceID: "pump", Metric: "running", Value: false, TS: 1008})
	observe(source.Reading{SourceID: "arduino_stand", DeviceID: "pump", Metric: "running", Value: false, TS: 1009})
	observe(source.Reading{SourceID: "arduino_stand", DeviceID: "pump", Metric: "running", Value: true, TS: 1010})
	observe(source.Reading{SourceID: "arduino_stand", DeviceID: "pump", Metric: "mode", Value: 2.0, TS: 1011})
	observe(source.Reading{SourceID: "arduino_stand", DeviceID: "pump", Metric: "mode", Value: 3.0, TS: 1012})
	assertEvents(8)

	gotTransitions := []struct {
		eventType cloud.AlarmEventType
		ruleID    string
	}{
		{emitter.payloads[2].EventType, emitter.payloads[2].Rule.RuleID},
		{emitter.payloads[3].EventType, emitter.payloads[3].Rule.RuleID},
		{emitter.payloads[4].EventType, emitter.payloads[4].Rule.RuleID},
		{emitter.payloads[5].EventType, emitter.payloads[5].Rule.RuleID},
		{emitter.payloads[6].EventType, emitter.payloads[6].Rule.RuleID},
		{emitter.payloads[7].EventType, emitter.payloads[7].Rule.RuleID},
	}
	wantTransitions := []struct {
		eventType cloud.AlarmEventType
		ruleID    string
	}{
		{cloud.AlarmEventTypeActive, "pressure_low"},
		{cloud.AlarmEventTypeClear, "pressure_low"},
		{cloud.AlarmEventTypeActive, "pump_stopped"},
		{cloud.AlarmEventTypeClear, "pump_stopped"},
		{cloud.AlarmEventTypeActive, "mode_two"},
		{cloud.AlarmEventTypeClear, "mode_two"},
	}
	for i := range wantTransitions {
		if gotTransitions[i] != wantTransitions[i] {
			t.Fatalf("transition %d: expected %+v, got %+v", i, wantTransitions[i], gotTransitions[i])
		}
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
