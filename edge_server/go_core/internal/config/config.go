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
	ReportedMetric string         `yaml:"reportedMetric"`
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
		if commandType != "set_bool" {
			return fmt.Errorf("%s.command must be set_bool", field)
		}
		if _, exists := commandIDs[commandType]; exists {
			return fmt.Errorf("duplicate command %q for device %q", commandType, deviceID)
		}
		commandIDs[commandType] = struct{}{}

		if err := validateSetBoolCommandMapping(field, command.Mapping); err != nil {
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
		if valueType != "boolean" {
			return fmt.Errorf("%s.reportedMetric must reference a boolean metric", field)
		}
	}

	return nil
}

func validateSetBoolCommandMapping(field string, mapping map[string]any) error {
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
