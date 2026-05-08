package cloud

import (
	"context"
	"encoding/json"
	"reflect"
	"strings"
	"testing"

	"edge_server/go_core/internal/source"
)

func TestAlarmEventPayloadBuildsTypedContract(t *testing.T) {
	trigger := 30.0
	clear := 28.0

	payload, err := NewAlarmPayload(AlarmPayloadInput{
		EdgeID:    " edge-1 ",
		EventType: AlarmEventTypeActive,
		Reading: source.Reading{
			SourceID: " arduino_stand ",
			DeviceID: " environment ",
			Metric:   " temperature ",
			Value:    float32(30.5),
			TS:       1_779_999_001,
		},
		DetectedAt: 1_779_999_010,
		Rule: AlarmRuleSnapshot{
			RuleID:           " temp_high_warning ",
			RuleRevision:     " rev-001 ",
			ConditionType:    " high ",
			TriggerThreshold: &trigger,
			ClearThreshold:   &clear,
			Severity:         AlarmSeverityWarning,
			Label:            " Temperature high ",
		},
	})
	if err != nil {
		t.Fatalf("build alarm payload: %v", err)
	}

	if payload.EdgeID != "edge-1" || payload.EventType != AlarmEventTypeActive {
		t.Fatalf("unexpected alarm identity: %+v", payload)
	}
	if payload.SourceID != "arduino_stand" || payload.DeviceID != "environment" || payload.Metric != "temperature" {
		t.Fatalf("unexpected reading identity: %+v", payload)
	}
	if payload.Value != 30.5 || payload.TS != 1_779_999_001 || payload.DetectedAt != 1_779_999_010 {
		t.Fatalf("unexpected observed values: %+v", payload)
	}
	if payload.Rule.RuleID != "temp_high_warning" || payload.Rule.RuleRevision != "rev-001" || payload.Rule.ConditionType != "high" {
		t.Fatalf("unexpected rule identity: %+v", payload.Rule)
	}
	if payload.Rule.Severity != AlarmSeverityWarning {
		t.Fatalf("expected alarm severity to use warning, got %q", payload.Rule.Severity)
	}
	if payload.Rule.TriggerThreshold == nil || *payload.Rule.TriggerThreshold != 30.0 {
		t.Fatalf("expected trigger threshold in rule snapshot, got %+v", payload.Rule.TriggerThreshold)
	}
	if payload.Rule.ClearThreshold == nil || *payload.Rule.ClearThreshold != 28.0 {
		t.Fatalf("expected clear threshold in rule snapshot, got %+v", payload.Rule.ClearThreshold)
	}

	rawPayload := map[string]any{}
	encoded, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal alarm payload: %v", err)
	}
	if err := json.Unmarshal(encoded, &rawPayload); err != nil {
		t.Fatalf("unmarshal alarm payload: %v", err)
	}
	rawRule, ok := rawPayload["rule"].(map[string]any)
	if !ok {
		t.Fatalf("expected nested rule object, got %+v", rawPayload["rule"])
	}
	for _, field := range []string{"ruleId", "ruleRevision", "conditionType", "triggerThreshold", "clearThreshold", "expectedValue", "severity", "label"} {
		if _, ok := rawRule[field]; !ok {
			t.Fatalf("expected rule snapshot field %q in alarm payload JSON: %+v", field, rawRule)
		}
	}

	_, err = NewAlarmPayload(AlarmPayloadInput{
		EdgeID:    "edge-1",
		EventType: AlarmEventTypeClear,
		Reading: source.Reading{
			SourceID: "arduino_stand",
			DeviceID: "environment",
			Metric:   "temperature",
			Value:    27.5,
			TS:       1_779_999_011,
		},
		DetectedAt: 1_779_999_020,
		Rule: AlarmRuleSnapshot{
			RuleID:        "temp_high_warning",
			RuleRevision:  "rev-001",
			ConditionType: "high",
			Severity:      AlarmSeverity("error"),
			Label:         "Temperature high",
		},
	})
	if err == nil || !strings.Contains(err.Error(), "alarm severity must be warning or danger") {
		t.Fatalf("expected source-fault severity error to be rejected, got %v", err)
	}
}

func TestAlarmEventEmitsTypedPayloadThroughSocketTransport(t *testing.T) {
	transport := &inMemoryTransport{}
	client, err := NewSocketIOClient(SocketIOClientConfig{
		ExpectedEdgeID: "edge-1",
		Transport:      transport,
	})
	if err != nil {
		t.Fatalf("create socket client: %v", err)
	}
	if err := client.Connect(context.Background(), HandshakeAuth{
		EdgeID:           "edge-1",
		CredentialSecret: "persist-secret",
	}); err != nil {
		t.Fatalf("connect: %v", err)
	}

	payload := AlarmPayload{
		EdgeID:     "edge-1",
		EventType:  AlarmEventTypeActive,
		SourceID:   "arduino_stand",
		DeviceID:   "environment",
		Metric:     "temperature",
		Value:      30.5,
		TS:         1_779_999_001,
		DetectedAt: 1_779_999_010,
		Rule: AlarmRuleSnapshot{
			RuleID:        "temp_high_warning",
			RuleRevision:  "rev-001",
			ConditionType: "high",
			Severity:      AlarmSeverityDanger,
			Label:         "Temperature high",
		},
	}

	if err := client.EmitAlarmEvent(payload); err != nil {
		t.Fatalf("emit alarm event: %v", err)
	}

	if len(transport.emitted) != 1 {
		t.Fatalf("expected one emitted event, got %+v", transport.emitted)
	}
	if transport.emitted[0].Event != string(EdgeEventAlarmEvent) {
		t.Fatalf("expected event %q, got %q", EdgeEventAlarmEvent, transport.emitted[0].Event)
	}
	if !reflect.DeepEqual(transport.emitted[0].Payload, payload) {
		t.Fatalf("expected typed alarm payload to pass through transport, got %+v", transport.emitted[0].Payload)
	}
}
