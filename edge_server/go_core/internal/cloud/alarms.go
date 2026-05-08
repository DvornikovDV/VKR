package cloud

import (
	"fmt"
	"strings"

	"edge_server/go_core/internal/source"
)

const (
	EdgeEventAlarmEvent EdgeEventName = "alarm_event"
)

type AlarmEventType string

const (
	AlarmEventTypeActive AlarmEventType = "active"
	AlarmEventTypeClear  AlarmEventType = "clear"
)

type AlarmSeverity string

const (
	AlarmSeverityWarning AlarmSeverity = "warning"
	AlarmSeverityDanger  AlarmSeverity = "danger"
)

type AlarmPayload struct {
	EdgeID     string            `json:"edgeId"`
	EventType  AlarmEventType    `json:"eventType"`
	SourceID   string            `json:"sourceId"`
	DeviceID   string            `json:"deviceId"`
	Metric     string            `json:"metric"`
	Value      any               `json:"value"`
	TS         int64             `json:"ts"`
	DetectedAt int64             `json:"detectedAt"`
	Rule       AlarmRuleSnapshot `json:"rule"`
}

type AlarmRuleSnapshot struct {
	RuleID           string        `json:"ruleId"`
	RuleRevision     string        `json:"ruleRevision"`
	ConditionType    string        `json:"conditionType"`
	TriggerThreshold *float64      `json:"triggerThreshold"`
	ClearThreshold   *float64      `json:"clearThreshold"`
	ExpectedValue    any           `json:"expectedValue"`
	Severity         AlarmSeverity `json:"severity"`
	Label            string        `json:"label"`
}

type AlarmPayloadInput struct {
	EdgeID     string
	EventType  AlarmEventType
	Reading    source.Reading
	DetectedAt int64
	Rule       AlarmRuleSnapshot
}

func NewAlarmPayload(input AlarmPayloadInput) (AlarmPayload, error) {
	edgeID := strings.TrimSpace(input.EdgeID)
	if edgeID == "" {
		return AlarmPayload{}, fmt.Errorf("alarm payload edgeId is required")
	}
	if input.EventType != AlarmEventTypeActive && input.EventType != AlarmEventTypeClear {
		return AlarmPayload{}, fmt.Errorf("alarm eventType must be active or clear")
	}

	sourceID := strings.TrimSpace(input.Reading.SourceID)
	if sourceID == "" {
		return AlarmPayload{}, fmt.Errorf("alarm reading sourceId is required")
	}
	deviceID := strings.TrimSpace(input.Reading.DeviceID)
	if deviceID == "" {
		return AlarmPayload{}, fmt.Errorf("alarm reading deviceId is required")
	}
	metric := strings.TrimSpace(input.Reading.Metric)
	if metric == "" {
		return AlarmPayload{}, fmt.Errorf("alarm reading metric is required")
	}
	if input.Reading.TS <= 0 {
		return AlarmPayload{}, fmt.Errorf("alarm reading ts must be positive")
	}
	if input.DetectedAt <= 0 {
		return AlarmPayload{}, fmt.Errorf("alarm detectedAt must be positive")
	}

	value, err := normalizeTelemetryValue(input.Reading.Value)
	if err != nil {
		return AlarmPayload{}, fmt.Errorf("alarm reading value: %w", err)
	}
	rule, err := normalizeAlarmRuleSnapshot(input.Rule)
	if err != nil {
		return AlarmPayload{}, err
	}

	return AlarmPayload{
		EdgeID:     edgeID,
		EventType:  input.EventType,
		SourceID:   sourceID,
		DeviceID:   deviceID,
		Metric:     metric,
		Value:      value,
		TS:         input.Reading.TS,
		DetectedAt: input.DetectedAt,
		Rule:       rule,
	}, nil
}

func normalizeAlarmRuleSnapshot(rule AlarmRuleSnapshot) (AlarmRuleSnapshot, error) {
	ruleID := strings.TrimSpace(rule.RuleID)
	if ruleID == "" {
		return AlarmRuleSnapshot{}, fmt.Errorf("alarm rule ruleId is required")
	}
	ruleRevision := strings.TrimSpace(rule.RuleRevision)
	if ruleRevision == "" {
		return AlarmRuleSnapshot{}, fmt.Errorf("alarm rule ruleRevision is required")
	}
	conditionType := strings.TrimSpace(rule.ConditionType)
	if conditionType == "" {
		return AlarmRuleSnapshot{}, fmt.Errorf("alarm rule conditionType is required")
	}
	if rule.Severity != AlarmSeverityWarning && rule.Severity != AlarmSeverityDanger {
		return AlarmRuleSnapshot{}, fmt.Errorf("alarm severity must be warning or danger")
	}

	expectedValue, err := normalizeOptionalAlarmValue(rule.ExpectedValue)
	if err != nil {
		return AlarmRuleSnapshot{}, fmt.Errorf("alarm rule expectedValue: %w", err)
	}

	return AlarmRuleSnapshot{
		RuleID:           ruleID,
		RuleRevision:     ruleRevision,
		ConditionType:    conditionType,
		TriggerThreshold: copyOptionalFloat64(rule.TriggerThreshold),
		ClearThreshold:   copyOptionalFloat64(rule.ClearThreshold),
		ExpectedValue:    expectedValue,
		Severity:         rule.Severity,
		Label:            strings.TrimSpace(rule.Label),
	}, nil
}

func normalizeOptionalAlarmValue(value any) (any, error) {
	if value == nil {
		return nil, nil
	}

	return normalizeTelemetryValue(value)
}

func copyOptionalFloat64(value *float64) *float64 {
	if value == nil {
		return nil
	}

	copied := *value
	return &copied
}
