package config

import (
	"fmt"
	"math"
	"net/url"
	"os"
	"strings"

	"gopkg.in/yaml.v3"
)

const (
	defaultCloudNamespace   = "/edge"
	defaultBatchIntervalMs  = 1000
	defaultBatchMaxReadings = 100
	defaultLoggingLevel     = "info"

	// DefaultFreshOnboardingInputWaitMs bounds in-process waiting for newly supplied onboarding input.
	DefaultFreshOnboardingInputWaitMs = 3000
)

type Config struct {
	Runtime RuntimeConfig             `yaml:"runtime"`
	Cloud   CloudConfig               `yaml:"cloud"`
	Batch   BatchConfig               `yaml:"batch"`
	Sources []PollingSourceDefinition `yaml:"sources"`
	Alarms  []AlarmRuleDefinition     `yaml:"alarms"`
	Logging LoggingConfig             `yaml:"logging"`
}

type RuntimeConfig struct {
	EdgeID       string `yaml:"edgeId"`
	StateDir     string `yaml:"stateDir"`
	InstanceName string `yaml:"instanceName"`
}

type CloudConfig struct {
	URL              string          `yaml:"url"`
	Namespace        string          `yaml:"namespace"`
	ConnectTimeoutMs int             `yaml:"connectTimeoutMs"`
	Reconnect        ReconnectConfig `yaml:"reconnect"`
}

type ReconnectConfig struct {
	BaseDelayMs int `yaml:"baseDelayMs"`
	MaxDelayMs  int `yaml:"maxDelayMs"`
	MaxAttempts int `yaml:"maxAttempts"`
}

type BatchConfig struct {
	IntervalMs  int `yaml:"intervalMs"`
	MaxReadings int `yaml:"maxReadings"`
}

type LoggingConfig struct {
	Level string `yaml:"level"`
}

type PollingSourceDefinition struct {
	SourceID       string                  `yaml:"sourceId"`
	AdapterKind    string                  `yaml:"adapterKind"`
	Enabled        bool                    `yaml:"enabled"`
	PollIntervalMs int                     `yaml:"pollIntervalMs"`
	Connection     map[string]any          `yaml:"connection"`
	Devices        []LocalDeviceDefinition `yaml:"devices"`
}

type LocalDeviceDefinition struct {
	DeviceID string              `yaml:"deviceId"`
	Address  map[string]any      `yaml:"address"`
	Metrics  []MetricDefinition  `yaml:"metrics"`
	Commands []CommandDefinition `yaml:"commands"`
}

type MetricDefinition struct {
	Metric    string         `yaml:"metric"`
	ValueType string         `yaml:"valueType"`
	Mapping   map[string]any `yaml:"mapping"`
}

type CommandDefinition struct {
	Command        string         `yaml:"command"`
	Mapping        map[string]any `yaml:"mapping"`
	Min            any            `yaml:"min"`
	Max            any            `yaml:"max"`
	ReportedMetric string         `yaml:"reportedMetric"`
}

type AlarmRuleDefinition struct {
	RuleID           string   `yaml:"ruleId"`
	Enabled          *bool    `yaml:"enabled"`
	SourceID         string   `yaml:"sourceId"`
	DeviceID         string   `yaml:"deviceId"`
	Metric           string   `yaml:"metric"`
	ConditionType    string   `yaml:"conditionType"`
	TriggerThreshold *float64 `yaml:"triggerThreshold"`
	ClearThreshold   *float64 `yaml:"clearThreshold"`
	ExpectedValue    any      `yaml:"expectedValue"`
	Severity         string   `yaml:"severity"`
	Label            string   `yaml:"label"`
}

func LoadFromFile(path string) (Config, error) {
	if strings.TrimSpace(path) == "" {
		return Config{}, fmt.Errorf("config path is required")
	}

	raw, err := os.ReadFile(path)
	if err != nil {
		return Config{}, fmt.Errorf("read config: %w", err)
	}

	return Parse(raw)
}

func Parse(raw []byte) (Config, error) {
	var cfg Config
	expanded := os.ExpandEnv(string(raw))
	decoder := yaml.NewDecoder(strings.NewReader(expanded))
	decoder.KnownFields(true)
	if err := decoder.Decode(&cfg); err != nil {
		return Config{}, fmt.Errorf("parse config yaml: %w", err)
	}

	cfg.applyDefaults()
	if err := cfg.validate(); err != nil {
		return Config{}, err
	}

	return cfg, nil
}

func (c *Config) applyDefaults() {
	if strings.TrimSpace(c.Cloud.Namespace) == "" {
		c.Cloud.Namespace = defaultCloudNamespace
	}
	if c.Batch.IntervalMs == 0 {
		c.Batch.IntervalMs = defaultBatchIntervalMs
	}
	if c.Batch.MaxReadings == 0 {
		c.Batch.MaxReadings = defaultBatchMaxReadings
	}
	if strings.TrimSpace(c.Logging.Level) == "" {
		c.Logging.Level = defaultLoggingLevel
	}
}

func (c Config) validate() error {
	if err := validateRuntimeConfig(c.Runtime); err != nil {
		return err
	}
	if err := validateCloudConfig(c.Cloud); err != nil {
		return err
	}
	if c.Batch.IntervalMs <= 0 {
		return fmt.Errorf("batch.intervalMs must be positive")
	}
	if c.Batch.MaxReadings <= 0 {
		return fmt.Errorf("batch.maxReadings must be positive")
	}
	if c.Logging.Level != "debug" && c.Logging.Level != "info" && c.Logging.Level != "warn" && c.Logging.Level != "error" {
		return fmt.Errorf("logging.level must be one of debug, info, warn, error")
	}
	if err := validateSourceDefinitions(c.Sources); err != nil {
		return err
	}
	if err := validateAlarmDefinitions(c.Alarms, c.Sources); err != nil {
		return err
	}

	return nil
}

func validateRuntimeConfig(runtime RuntimeConfig) error {
	if strings.TrimSpace(runtime.EdgeID) == "" {
		return fmt.Errorf("runtime.edgeId is required")
	}
	if strings.TrimSpace(runtime.StateDir) == "" {
		return fmt.Errorf("runtime.stateDir is required")
	}

	return nil
}

func validateCloudConfig(cloud CloudConfig) error {
	if strings.TrimSpace(cloud.URL) == "" {
		return fmt.Errorf("cloud.url is required")
	}
	if err := validateCloudURL(cloud.URL); err != nil {
		return err
	}
	if cloud.Namespace != defaultCloudNamespace {
		return fmt.Errorf("cloud.namespace must be %q", defaultCloudNamespace)
	}
	if cloud.ConnectTimeoutMs <= 0 {
		return fmt.Errorf("cloud.connectTimeoutMs must be positive")
	}
	if cloud.Reconnect.BaseDelayMs <= 0 {
		return fmt.Errorf("cloud.reconnect.baseDelayMs must be positive")
	}
	if cloud.Reconnect.MaxDelayMs <= 0 {
		return fmt.Errorf("cloud.reconnect.maxDelayMs must be positive")
	}
	if cloud.Reconnect.MaxDelayMs < cloud.Reconnect.BaseDelayMs {
		return fmt.Errorf("cloud.reconnect.maxDelayMs must be greater than or equal to cloud.reconnect.baseDelayMs")
	}
	if cloud.Reconnect.MaxAttempts < 0 {
		return fmt.Errorf("cloud.reconnect.maxAttempts must be zero or positive")
	}

	return nil
}

func validateSourceDefinitions(sources []PollingSourceDefinition) error {
	if len(sources) == 0 {
		return fmt.Errorf("at least one source definition is required")
	}

	sourceIDs := make(map[string]struct{}, len(sources))
	deviceIDs := make(map[string]struct{})
	enabledSources := 0
	for i, source := range sources {
		sourceID := strings.TrimSpace(source.SourceID)
		if sourceID == "" {
			return fmt.Errorf("sources[%d].sourceId is required", i)
		}
		if _, exists := sourceIDs[sourceID]; exists {
			return fmt.Errorf("duplicate sourceId %q", sourceID)
		}
		sourceIDs[sourceID] = struct{}{}

		if !source.Enabled {
			if err := validateDisabledSourceCommands(i, source.Devices); err != nil {
				return err
			}
			// Disabled sources are retained as operator-managed definitions and may
			// stay incomplete until they are enabled for runtime use.
			continue
		}

		enabledSources++
		if strings.TrimSpace(source.AdapterKind) == "" {
			return fmt.Errorf("sources[%d].adapterKind is required", i)
		}
		if source.PollIntervalMs <= 0 {
			return fmt.Errorf("sources[%d].pollIntervalMs must be positive", i)
		}
		if len(source.Devices) == 0 {
			return fmt.Errorf("sources[%d].devices must not be empty", i)
		}

		for j, device := range source.Devices {
			deviceID := strings.TrimSpace(device.DeviceID)
			if deviceID == "" {
				return fmt.Errorf("sources[%d].devices[%d].deviceId is required", i, j)
			}
			if _, exists := deviceIDs[deviceID]; exists {
				return fmt.Errorf("duplicate deviceId %q", deviceID)
			}
			deviceIDs[deviceID] = struct{}{}

			metricTypes, err := validateDeviceMetrics(i, j, deviceID, device.Metrics)
			if err != nil {
				return err
			}

			if err := validateDeviceCommands(i, j, deviceID, device.Commands, metricTypes); err != nil {
				return err
			}
		}
	}

	if enabledSources == 0 {
		return fmt.Errorf("at least one enabled source definition is required")
	}

	return nil
}

func validateDisabledSourceCommands(sourceIndex int, devices []LocalDeviceDefinition) error {
	for deviceIndex, device := range devices {
		if len(device.Commands) == 0 {
			continue
		}
		deviceID := strings.TrimSpace(device.DeviceID)
		if deviceID == "" {
			return fmt.Errorf("sources[%d].devices[%d].deviceId is required", sourceIndex, deviceIndex)
		}
		metricTypes, err := validateDeviceMetrics(sourceIndex, deviceIndex, deviceID, device.Metrics)
		if err != nil {
			return err
		}
		if err := validateDeviceCommands(sourceIndex, deviceIndex, deviceID, device.Commands, metricTypes); err != nil {
			return err
		}
	}

	return nil
}

func validateDeviceMetrics(sourceIndex int, deviceIndex int, deviceID string, metrics []MetricDefinition) (map[string]string, error) {
	if len(metrics) == 0 {
		return nil, fmt.Errorf("sources[%d].devices[%d].metrics must not be empty", sourceIndex, deviceIndex)
	}

	metricTypes := make(map[string]string, len(metrics))
	for metricIndex, metric := range metrics {
		metricID := strings.TrimSpace(metric.Metric)
		if metricID == "" {
			return nil, fmt.Errorf("sources[%d].devices[%d].metrics[%d].metric is required", sourceIndex, deviceIndex, metricIndex)
		}
		if _, exists := metricTypes[metricID]; exists {
			return nil, fmt.Errorf("duplicate metric %q for device %q", metricID, deviceID)
		}
		if metric.ValueType != "number" && metric.ValueType != "boolean" {
			return nil, fmt.Errorf("sources[%d].devices[%d].metrics[%d].valueType must be number or boolean", sourceIndex, deviceIndex, metricIndex)
		}
		metricTypes[metricID] = metric.ValueType
	}

	return metricTypes, nil
}

func validateDeviceCommands(sourceIndex int, deviceIndex int, deviceID string, commands []CommandDefinition, metricTypes map[string]string) error {
	commandIDs := make(map[string]struct{}, len(commands))
	for commandIndex, command := range commands {
		field := fmt.Sprintf("sources[%d].devices[%d].commands[%d]", sourceIndex, deviceIndex, commandIndex)
		commandType := strings.TrimSpace(command.Command)
		if commandType == "" {
			return fmt.Errorf("%s.command is required", field)
		}
		if commandType != "set_bool" && commandType != "set_number" {
			return fmt.Errorf("%s.command must be set_bool or set_number", field)
		}
		if _, exists := commandIDs[commandType]; exists {
			return fmt.Errorf("duplicate command %q for device %q", commandType, deviceID)
		}
		commandIDs[commandType] = struct{}{}

		if err := validateCommandMapping(field, command.Mapping); err != nil {
			return err
		}

		reportedMetric := strings.TrimSpace(command.ReportedMetric)
		if reportedMetric == "" {
			return fmt.Errorf("%s.reportedMetric is required", field)
		}
		valueType, exists := metricTypes[reportedMetric]
		if !exists {
			return fmt.Errorf("%s.reportedMetric must reference a device metric", field)
		}

		switch commandType {
		case "set_bool":
			if err := validateSetBoolCommandShape(field, command.Min, command.Max); err != nil {
				return err
			}
			if valueType != "boolean" {
				return fmt.Errorf("%s.reportedMetric must reference a boolean metric", field)
			}
		case "set_number":
			if valueType != "number" {
				return fmt.Errorf("%s.reportedMetric must reference a number metric", field)
			}
			if _, _, err := validateSetNumberCommandRange(field, command.Min, command.Max); err != nil {
				return err
			}
		}
	}

	return nil
}

type telemetryIdentity struct {
	valueType string
}

func validateAlarmDefinitions(alarms []AlarmRuleDefinition, sources []PollingSourceDefinition) error {
	if len(alarms) == 0 {
		return nil
	}

	identities := buildValidatedTelemetryIdentityIndex(sources)
	ruleIDs := make(map[string]struct{}, len(alarms))
	for i, alarm := range alarms {
		field := fmt.Sprintf("alarms[%d]", i)
		ruleID := strings.TrimSpace(alarm.RuleID)
		if ruleID == "" {
			return fmt.Errorf("%s.ruleId is required", field)
		}
		if _, exists := ruleIDs[ruleID]; exists {
			return fmt.Errorf("%s.ruleId must be unique", field)
		}
		ruleIDs[ruleID] = struct{}{}

		if alarm.Enabled == nil {
			return fmt.Errorf("%s.enabled is required", field)
		}

		sourceID := strings.TrimSpace(alarm.SourceID)
		deviceID := strings.TrimSpace(alarm.DeviceID)
		metric := strings.TrimSpace(alarm.Metric)
		if sourceID == "" {
			return fmt.Errorf("%s.sourceId is required", field)
		}
		if deviceID == "" {
			return fmt.Errorf("%s.deviceId is required", field)
		}
		if metric == "" {
			return fmt.Errorf("%s.metric is required", field)
		}

		identity, exists := identities[telemetryIdentityKey(sourceID, deviceID, metric)]
		if !exists {
			return fmt.Errorf("%s must reference an existing sourceId/deviceId/metric identity", field)
		}

		severity := strings.TrimSpace(alarm.Severity)
		if severity != "warning" && severity != "danger" {
			return fmt.Errorf("%s.severity must be warning or danger", field)
		}

		switch strings.TrimSpace(alarm.ConditionType) {
		case "high":
			if err := validateHighAlarm(field, alarm, identity); err != nil {
				return err
			}
		case "low":
			if err := validateLowAlarm(field, alarm, identity); err != nil {
				return err
			}
		case "state":
			if err := validateStateAlarm(field, alarm); err != nil {
				return err
			}
		case "connectivity":
			if err := validateConnectivityAlarm(field, alarm); err != nil {
				return err
			}
		default:
			return fmt.Errorf("%s.conditionType must be high, low, state, or connectivity", field)
		}
	}

	return nil
}

func buildValidatedTelemetryIdentityIndex(sources []PollingSourceDefinition) map[string]telemetryIdentity {
	identities := make(map[string]telemetryIdentity)
	for _, source := range sources {
		if !source.Enabled {
			continue
		}
		sourceID := strings.TrimSpace(source.SourceID)
		for _, device := range source.Devices {
			deviceID := strings.TrimSpace(device.DeviceID)
			for _, metric := range device.Metrics {
				metricID := strings.TrimSpace(metric.Metric)
				if sourceID == "" || deviceID == "" || metricID == "" {
					continue
				}
				identities[telemetryIdentityKey(sourceID, deviceID, metricID)] = telemetryIdentity{
					valueType: metric.ValueType,
				}
			}
		}
	}

	return identities
}

func telemetryIdentityKey(sourceID string, deviceID string, metric string) string {
	return sourceID + "\x00" + deviceID + "\x00" + metric
}

func validateHighAlarm(field string, alarm AlarmRuleDefinition, identity telemetryIdentity) error {
	if identity.valueType != "number" {
		return fmt.Errorf("%s.metric must reference a number metric for high conditionType", field)
	}
	trigger, clear, err := alarmThresholds(field, alarm)
	if err != nil {
		return err
	}
	if trigger <= clear {
		return fmt.Errorf("%s.triggerThreshold must be greater than clearThreshold for high conditionType", field)
	}
	if alarm.ExpectedValue != nil {
		return fmt.Errorf("%s.expectedValue is only allowed for state conditionType", field)
	}

	return nil
}

func validateLowAlarm(field string, alarm AlarmRuleDefinition, identity telemetryIdentity) error {
	if identity.valueType != "number" {
		return fmt.Errorf("%s.metric must reference a number metric for low conditionType", field)
	}
	trigger, clear, err := alarmThresholds(field, alarm)
	if err != nil {
		return err
	}
	if trigger >= clear {
		return fmt.Errorf("%s.triggerThreshold must be less than clearThreshold for low conditionType", field)
	}
	if alarm.ExpectedValue != nil {
		return fmt.Errorf("%s.expectedValue is only allowed for state conditionType", field)
	}

	return nil
}

func validateStateAlarm(field string, alarm AlarmRuleDefinition) error {
	if alarm.TriggerThreshold != nil {
		return fmt.Errorf("%s.triggerThreshold is only allowed for high or low conditionType", field)
	}
	if alarm.ClearThreshold != nil {
		return fmt.Errorf("%s.clearThreshold is only allowed for high or low conditionType", field)
	}
	if alarm.ExpectedValue == nil {
		return fmt.Errorf("%s.expectedValue is required for state conditionType", field)
	}

	return nil
}

func validateConnectivityAlarm(field string, alarm AlarmRuleDefinition) error {
	if alarm.TriggerThreshold != nil {
		return fmt.Errorf("%s.triggerThreshold is only allowed for high or low conditionType", field)
	}
	if alarm.ClearThreshold != nil {
		return fmt.Errorf("%s.clearThreshold is only allowed for high or low conditionType", field)
	}
	if alarm.ExpectedValue != nil {
		return fmt.Errorf("%s.expectedValue is only allowed for state conditionType", field)
	}

	return nil
}

func alarmThresholds(field string, alarm AlarmRuleDefinition) (float64, float64, error) {
	if alarm.TriggerThreshold == nil {
		return 0, 0, fmt.Errorf("%s.triggerThreshold is required", field)
	}
	if math.IsNaN(*alarm.TriggerThreshold) || math.IsInf(*alarm.TriggerThreshold, 0) {
		return 0, 0, fmt.Errorf("%s.triggerThreshold must be finite", field)
	}
	if alarm.ClearThreshold == nil {
		return 0, 0, fmt.Errorf("%s.clearThreshold is required", field)
	}
	if math.IsNaN(*alarm.ClearThreshold) || math.IsInf(*alarm.ClearThreshold, 0) {
		return 0, 0, fmt.Errorf("%s.clearThreshold must be finite", field)
	}

	return *alarm.TriggerThreshold, *alarm.ClearThreshold, nil
}

func validateSetBoolCommandShape(field string, rawMin any, rawMax any) error {
	if rawMin != nil {
		return fmt.Errorf("%s.min is only allowed for set_number", field)
	}
	if rawMax != nil {
		return fmt.Errorf("%s.max is only allowed for set_number", field)
	}

	return nil
}

func validateCommandMapping(field string, mapping map[string]any) error {
	if len(mapping) == 0 {
		return fmt.Errorf("%s.mapping is required", field)
	}
	if _, exists := mapping["address"]; !exists {
		return fmt.Errorf("%s.mapping.address is required", field)
	}
	if _, exists := mapping["registerType"]; !exists {
		return fmt.Errorf("%s.mapping.registerType is required", field)
	}
	if len(mapping) != 2 {
		return fmt.Errorf("%s.mapping must contain only address and registerType", field)
	}

	registerType, ok := mapping["registerType"].(string)
	if !ok || strings.TrimSpace(registerType) == "" {
		return fmt.Errorf("%s.mapping.registerType is required", field)
	}
	if strings.ToLower(strings.TrimSpace(registerType)) != "holding" {
		return fmt.Errorf("%s.mapping.registerType must be holding", field)
	}

	if _, err := commandMappingAddress(mapping["address"], field+".mapping.address"); err != nil {
		return err
	}

	return nil
}

func validateSetNumberCommandRange(field string, rawMin any, rawMax any) (uint16, uint16, error) {
	if rawMin == nil {
		return 0, 0, fmt.Errorf("%s.min is required", field)
	}
	if rawMax == nil {
		return 0, 0, fmt.Errorf("%s.max is required", field)
	}

	min, err := commandMappingAddress(rawMin, field+".min")
	if err != nil {
		return 0, 0, err
	}
	max, err := commandMappingAddress(rawMax, field+".max")
	if err != nil {
		return 0, 0, err
	}
	if min > max {
		return 0, 0, fmt.Errorf("%s.min must be less than or equal to max", field)
	}

	return min, max, nil
}

func commandMappingAddress(raw any, field string) (uint16, error) {
	value, ok := numberAsFloat64(raw)
	if !ok || math.Trunc(value) != value {
		return 0, fmt.Errorf("%s must be an integer", field)
	}
	if value < 0 || value > math.MaxUint16 {
		return 0, fmt.Errorf("%s must be between 0 and 65535", field)
	}

	return uint16(value), nil
}

func numberAsFloat64(raw any) (float64, bool) {
	switch typed := raw.(type) {
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
	case float32:
		return float64(typed), true
	case float64:
		return typed, true
	default:
		return 0, false
	}
}

func validateCloudURL(raw string) error {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil {
		return fmt.Errorf("cloud.url must be a valid URL: %w", err)
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return fmt.Errorf("cloud.url scheme must be http or https")
	}
	if strings.TrimSpace(parsed.Host) == "" {
		return fmt.Errorf("cloud.url host is required")
	}

	return nil
}
