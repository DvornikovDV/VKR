package runtime

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math"
	"strings"
	"sync"
	"time"

	"edge_server/go_core/internal/cloud"
	"edge_server/go_core/internal/config"
	"edge_server/go_core/internal/source"
)

type AlarmRuleSnapshot = cloud.AlarmRuleSnapshot

type AlarmEmitter interface {
	EmitAlarmEvent(payload cloud.AlarmPayload) error
}

type AlarmDetectorConfig struct {
	EdgeID        string
	Rules         []config.AlarmRuleDefinition
	Emitter       AlarmEmitter
	StateSnapshot func() SessionStateSnapshot
	OnAsyncError  func(error)
	Context       context.Context
	Now           func() time.Time
}

type AlarmDetector struct {
	edgeID          string
	emitter         AlarmEmitter
	stateSnapshot   func() SessionStateSnapshot
	now             func() time.Time
	onAsyncError    func(error)
	emissions       chan alarmEmission
	mu              sync.Mutex
	rulesByIdentity map[alarmReadingKey][]alarmRuntimeRule
	states          map[string]alarmRuleState
}

const defaultAlarmEmissionBuffer = 16

type alarmReadingKey struct {
	sourceID string
	deviceID string
	metric   string
}

type alarmRuntimeRule struct {
	key      alarmReadingKey
	snapshot cloud.AlarmRuleSnapshot
}

type alarmRuleState struct {
	active  bool
	pending *bool
}

type alarmEmission struct {
	ruleID     string
	nextActive bool
	payload    cloud.AlarmPayload
}

func NewAlarmDetector(cfg AlarmDetectorConfig) (*AlarmDetector, error) {
	edgeID := strings.TrimSpace(cfg.EdgeID)
	if edgeID == "" {
		return nil, fmt.Errorf("alarm detector edgeId is required")
	}

	now := cfg.Now
	if now == nil {
		now = func() time.Time {
			return time.Now().UTC()
		}
	}

	detector := &AlarmDetector{
		edgeID:          edgeID,
		emitter:         cfg.Emitter,
		stateSnapshot:   cfg.StateSnapshot,
		now:             now,
		onAsyncError:    cfg.OnAsyncError,
		rulesByIdentity: make(map[alarmReadingKey][]alarmRuntimeRule),
		states:          make(map[string]alarmRuleState),
	}

	for _, rule := range cfg.Rules {
		if rule.Enabled == nil || !*rule.Enabled {
			continue
		}
		runtimeRule, err := newAlarmRuntimeRule(rule)
		if err != nil {
			return nil, err
		}
		detector.rulesByIdentity[runtimeRule.key] = append(detector.rulesByIdentity[runtimeRule.key], runtimeRule)
	}

	if len(detector.rulesByIdentity) > 0 {
		if detector.emitter == nil {
			return nil, fmt.Errorf("alarm detector emitter is required when alarm rules are enabled")
		}
		if detector.stateSnapshot == nil {
			return nil, fmt.Errorf("alarm detector state snapshot is required when alarm rules are enabled")
		}
		ctx := cfg.Context
		if ctx == nil {
			ctx = context.Background()
		}
		detector.emissions = make(chan alarmEmission, defaultAlarmEmissionBuffer)
		go detector.runEmitter(ctx)
	}

	return detector, nil
}

func (d *AlarmDetector) Observe(reading source.Reading) error {
	if d == nil {
		return nil
	}

	key := alarmReadingKey{
		sourceID: strings.TrimSpace(reading.SourceID),
		deviceID: strings.TrimSpace(reading.DeviceID),
		metric:   strings.TrimSpace(reading.Metric),
	}
	if key.sourceID == "" || key.deviceID == "" || key.metric == "" {
		return nil
	}

	rules := d.rulesByIdentity[key]
	for _, rule := range rules {
		ruleState := d.currentRuleState(rule.snapshot.RuleID)
		nextActive, ok := rule.evaluate(reading.Value, ruleState.active)
		if !ok {
			continue
		}

		if ruleState.active == nextActive || ruleState.pending != nil {
			continue
		}
		if !d.emissionAllowed() {
			continue
		}

		eventType := cloud.AlarmEventTypeClear
		if nextActive {
			eventType = cloud.AlarmEventTypeActive
		}

		payload, err := cloud.NewAlarmPayload(cloud.AlarmPayloadInput{
			EdgeID:     d.edgeID,
			EventType:  eventType,
			Reading:    reading,
			DetectedAt: d.now().UTC().UnixMilli(),
			Rule:       rule.snapshot,
		})
		if err != nil {
			return err
		}
		if !d.enqueueEmission(rule.snapshot.RuleID, nextActive, payload) {
			continue
		}
	}

	return nil
}

func (d *AlarmDetector) currentRuleState(ruleID string) alarmRuleState {
	if d == nil {
		return alarmRuleState{}
	}

	d.mu.Lock()
	defer d.mu.Unlock()

	return d.states[ruleID]
}

func (d *AlarmDetector) enqueueEmission(ruleID string, nextActive bool, payload cloud.AlarmPayload) bool {
	if d == nil || d.emissions == nil {
		return false
	}
	if !d.markPending(ruleID, nextActive) {
		return false
	}

	select {
	case d.emissions <- alarmEmission{
		ruleID:     ruleID,
		nextActive: nextActive,
		payload:    payload,
	}:
		return true
	default:
		d.clearPending(ruleID)
		d.reportAsyncError(fmt.Errorf("alarm event emission queue is full for rule %q", payload.Rule.RuleID))
		return false
	}
}

func (d *AlarmDetector) markPending(ruleID string, nextActive bool) bool {
	d.mu.Lock()
	defer d.mu.Unlock()

	current := d.states[ruleID]
	if current.pending != nil {
		return false
	}

	pending := nextActive
	current.pending = &pending
	d.states[ruleID] = current
	return true
}

func (d *AlarmDetector) clearPending(ruleID string) {
	d.mu.Lock()
	defer d.mu.Unlock()

	current := d.states[ruleID]
	current.pending = nil
	d.states[ruleID] = current
}

func (d *AlarmDetector) commitEmission(ruleID string, nextActive bool) {
	d.mu.Lock()
	defer d.mu.Unlock()

	d.states[ruleID] = alarmRuleState{active: nextActive}
}

func (d *AlarmDetector) runEmitter(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case emission := <-d.emissions:
			if !d.emissionAllowed() {
				d.clearPending(emission.ruleID)
				continue
			}
			if err := d.emitter.EmitAlarmEvent(emission.payload); err != nil {
				d.clearPending(emission.ruleID)
				d.reportAsyncError(fmt.Errorf("emit alarm event: %w", err))
				continue
			}
			d.commitEmission(emission.ruleID, emission.nextActive)
		}
	}
}

func (d *AlarmDetector) reportAsyncError(err error) {
	if err == nil || d == nil || d.onAsyncError == nil {
		return
	}

	d.onAsyncError(err)
}

func (d *AlarmDetector) emissionAllowed() bool {
	if d == nil || d.stateSnapshot == nil {
		return false
	}

	snapshot := d.stateSnapshot()
	return snapshot.Trusted && snapshot.Connected && snapshot.SessionEpoch != 0
}

func newAlarmRuntimeRule(rule config.AlarmRuleDefinition) (alarmRuntimeRule, error) {
	key := alarmReadingKey{
		sourceID: strings.TrimSpace(rule.SourceID),
		deviceID: strings.TrimSpace(rule.DeviceID),
		metric:   strings.TrimSpace(rule.Metric),
	}
	if key.sourceID == "" || key.deviceID == "" || key.metric == "" {
		return alarmRuntimeRule{}, fmt.Errorf("alarm rule %q identity is required", strings.TrimSpace(rule.RuleID))
	}

	conditionType := strings.TrimSpace(rule.ConditionType)
	snapshot := cloud.AlarmRuleSnapshot{
		RuleID:           strings.TrimSpace(rule.RuleID),
		ConditionType:    conditionType,
		TriggerThreshold: cloneOptionalFloat64(rule.TriggerThreshold),
		ClearThreshold:   cloneOptionalFloat64(rule.ClearThreshold),
		ExpectedValue:    normalizeAlarmStateValue(rule.ExpectedValue),
		Severity:         cloud.AlarmSeverity(strings.TrimSpace(rule.Severity)),
		Label:            strings.TrimSpace(rule.Label),
	}
	if snapshot.RuleID == "" {
		return alarmRuntimeRule{}, fmt.Errorf("alarm rule ruleId is required")
	}
	if snapshot.ConditionType == "" {
		return alarmRuntimeRule{}, fmt.Errorf("alarm rule %q conditionType is required", snapshot.RuleID)
	}

	revision, err := deriveAlarmRuleRevision(key, snapshot)
	if err != nil {
		return alarmRuntimeRule{}, err
	}
	snapshot.RuleRevision = revision

	return alarmRuntimeRule{
		key:      key,
		snapshot: snapshot,
	}, nil
}

func deriveAlarmRuleRevision(key alarmReadingKey, snapshot cloud.AlarmRuleSnapshot) (string, error) {
	revisionInput := struct {
		RuleID           string              `json:"ruleId"`
		SourceID         string              `json:"sourceId"`
		DeviceID         string              `json:"deviceId"`
		Metric           string              `json:"metric"`
		ConditionType    string              `json:"conditionType"`
		TriggerThreshold *float64            `json:"triggerThreshold"`
		ClearThreshold   *float64            `json:"clearThreshold"`
		ExpectedValue    any                 `json:"expectedValue"`
		Severity         cloud.AlarmSeverity `json:"severity"`
		Label            string              `json:"label"`
	}{
		RuleID:           snapshot.RuleID,
		SourceID:         key.sourceID,
		DeviceID:         key.deviceID,
		Metric:           key.metric,
		ConditionType:    snapshot.ConditionType,
		TriggerThreshold: cloneOptionalFloat64(snapshot.TriggerThreshold),
		ClearThreshold:   cloneOptionalFloat64(snapshot.ClearThreshold),
		ExpectedValue:    normalizeAlarmStateValue(snapshot.ExpectedValue),
		Severity:         snapshot.Severity,
		Label:            snapshot.Label,
	}

	encoded, err := json.Marshal(revisionInput)
	if err != nil {
		return "", fmt.Errorf("derive alarm rule revision: %w", err)
	}
	sum := sha256.Sum256(encoded)
	return hex.EncodeToString(sum[:16]), nil
}

func (r alarmRuntimeRule) evaluate(value any, currentlyActive bool) (bool, bool) {
	switch r.snapshot.ConditionType {
	case "high":
		number, ok := alarmNumber(value)
		if !ok || r.snapshot.TriggerThreshold == nil || r.snapshot.ClearThreshold == nil {
			return false, false
		}
		if currentlyActive {
			if number <= *r.snapshot.ClearThreshold {
				return false, true
			}
			return true, true
		}
		if number >= *r.snapshot.TriggerThreshold {
			return true, true
		}
		return false, true
	case "low":
		number, ok := alarmNumber(value)
		if !ok || r.snapshot.TriggerThreshold == nil || r.snapshot.ClearThreshold == nil {
			return false, false
		}
		if currentlyActive {
			if number >= *r.snapshot.ClearThreshold {
				return false, true
			}
			return true, true
		}
		if number <= *r.snapshot.TriggerThreshold {
			return true, true
		}
		return false, true
	case "state":
		matches, ok := alarmStateEquals(value, r.snapshot.ExpectedValue)
		if !ok {
			return false, false
		}
		return matches, true
	default:
		return false, false
	}
}

func alarmStateEquals(value any, expected any) (bool, bool) {
	actualBool, actualBoolOK := value.(bool)
	expectedBool, expectedBoolOK := expected.(bool)
	if actualBoolOK || expectedBoolOK {
		if !actualBoolOK || !expectedBoolOK {
			return false, false
		}
		return actualBool == expectedBool, true
	}

	actualNumber, actualNumberOK := alarmNumber(value)
	expectedNumber, expectedNumberOK := alarmNumber(expected)
	if actualNumberOK || expectedNumberOK {
		if !actualNumberOK || !expectedNumberOK {
			return false, false
		}
		return actualNumber == expectedNumber, true
	}

	return false, false
}

func alarmNumber(value any) (float64, bool) {
	switch typed := value.(type) {
	case float64:
		return finiteAlarmNumber(typed)
	case float32:
		return finiteAlarmNumber(float64(typed))
	case int:
		return float64(typed), true
	case int8:
		return float64(typed), true
	case int16:
		return float64(typed), true
	case int32:
		return float64(typed), true
	case int64:
		return float64(typed), true
	case uint:
		return float64(typed), true
	case uint8:
		return float64(typed), true
	case uint16:
		return float64(typed), true
	case uint32:
		return float64(typed), true
	case uint64:
		return float64(typed), true
	default:
		return 0, false
	}
}

func finiteAlarmNumber(value float64) (float64, bool) {
	if math.IsNaN(value) || math.IsInf(value, 0) {
		return 0, false
	}
	return value, true
}

func normalizeAlarmStateValue(value any) any {
	if number, ok := alarmNumber(value); ok {
		return number
	}
	if typed, ok := value.(bool); ok {
		return typed
	}
	return nil
}

func cloneOptionalFloat64(value *float64) *float64 {
	if value == nil {
		return nil
	}
	copied := *value
	return &copied
}
