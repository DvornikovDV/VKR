package config

import (
	"fmt"
	"os"
	"strings"

	"gopkg.in/yaml.v3"
)

const (
	defaultCloudNamespace     = "/edge"
	defaultBatchIntervalMs    = 1000
	defaultBatchMaxReadings   = 100
	defaultBacklogMaxReadings = 1000
	defaultBacklogOverflow    = "drop_oldest"
	defaultReconnectAttempts  = 10
	defaultReconnectBaseDelay = 1000
	defaultReconnectMaxDelay  = 30000
	defaultLoggingLevel       = "info"
	defaultAdapterMode        = "mock-internal"
)

type Config struct {
	Cloud     CloudConfig               `yaml:"cloud"`
	StateDir  string                    `yaml:"stateDir"`
	Batch     BatchConfig               `yaml:"batch"`
	Backlog   BacklogConfig             `yaml:"backlog"`
	Reconnect ReconnectConfig           `yaml:"reconnect"`
	Adapter   AdapterConfig             `yaml:"adapter"`
	Sources   []PollingSourceDefinition `yaml:"sources"`
	Logging   LoggingConfig             `yaml:"logging"`
}

type CloudConfig struct {
	URL       string `yaml:"url"`
	Namespace string `yaml:"namespace"`
}

type BatchConfig struct {
	IntervalMs  int `yaml:"intervalMs"`
	MaxReadings int `yaml:"maxReadings"`
}

type BacklogConfig struct {
	MaxReadings      int    `yaml:"maxReadings"`
	OverflowBehavior string `yaml:"overflowBehavior"`
}

type ReconnectConfig struct {
	MaxAttempts int `yaml:"maxAttempts"`
	BaseDelayMs int `yaml:"baseDelayMs"`
	MaxDelayMs  int `yaml:"maxDelayMs"`
}

type AdapterConfig struct {
	Mode     string  `yaml:"mode"`
	Endpoint *string `yaml:"endpoint"`
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
	DeviceID string             `yaml:"deviceId"`
	Address  map[string]any     `yaml:"address"`
	Metrics  []MetricDefinition `yaml:"metrics"`
}

type MetricDefinition struct {
	Metric    string         `yaml:"metric"`
	ValueType string         `yaml:"valueType"`
	Mapping   map[string]any `yaml:"mapping"`
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
	if c.Backlog.MaxReadings == 0 {
		c.Backlog.MaxReadings = defaultBacklogMaxReadings
	}
	if strings.TrimSpace(c.Backlog.OverflowBehavior) == "" {
		c.Backlog.OverflowBehavior = defaultBacklogOverflow
	}
	if c.Reconnect.MaxAttempts == 0 {
		c.Reconnect.MaxAttempts = defaultReconnectAttempts
	}
	if c.Reconnect.BaseDelayMs == 0 {
		c.Reconnect.BaseDelayMs = defaultReconnectBaseDelay
	}
	if c.Reconnect.MaxDelayMs == 0 {
		c.Reconnect.MaxDelayMs = defaultReconnectMaxDelay
	}
	if strings.TrimSpace(c.Logging.Level) == "" {
		c.Logging.Level = defaultLoggingLevel
	}
	if strings.TrimSpace(c.Adapter.Mode) == "" {
		c.Adapter.Mode = defaultAdapterMode
	}
}

func (c Config) validate() error {
	if strings.TrimSpace(c.Cloud.URL) == "" {
		return fmt.Errorf("cloud.url is required")
	}
	if c.Cloud.Namespace != defaultCloudNamespace {
		return fmt.Errorf("cloud.namespace must be %q", defaultCloudNamespace)
	}
	if strings.TrimSpace(c.StateDir) == "" {
		return fmt.Errorf("stateDir is required")
	}
	if c.Batch.IntervalMs <= 0 {
		return fmt.Errorf("batch.intervalMs must be positive")
	}
	if c.Batch.MaxReadings <= 0 {
		return fmt.Errorf("batch.maxReadings must be positive")
	}
	if c.Backlog.MaxReadings <= 0 {
		return fmt.Errorf("backlog.maxReadings must be positive")
	}
	if c.Backlog.OverflowBehavior != defaultBacklogOverflow {
		return fmt.Errorf("backlog.overflowBehavior must be %q", defaultBacklogOverflow)
	}
	if c.Reconnect.MaxAttempts <= 0 {
		return fmt.Errorf("reconnect.maxAttempts must be positive")
	}
	if c.Reconnect.BaseDelayMs <= 0 {
		return fmt.Errorf("reconnect.baseDelayMs must be positive")
	}
	if c.Reconnect.MaxDelayMs < c.Reconnect.BaseDelayMs {
		return fmt.Errorf("reconnect.maxDelayMs must be >= reconnect.baseDelayMs")
	}
	if c.Adapter.Mode != "mock-internal" && c.Adapter.Mode != "worker-process" {
		return fmt.Errorf("adapter.mode must be mock-internal or worker-process")
	}
	if c.Adapter.Mode == "worker-process" && (c.Adapter.Endpoint == nil || strings.TrimSpace(*c.Adapter.Endpoint) == "") {
		return fmt.Errorf("adapter.endpoint is required when adapter.mode is worker-process")
	}
	if c.Logging.Level != "debug" && c.Logging.Level != "info" && c.Logging.Level != "warn" && c.Logging.Level != "error" {
		return fmt.Errorf("logging.level must be one of debug, info, warn, error")
	}
	if len(c.Sources) == 0 {
		return fmt.Errorf("at least one source definition is required")
	}

	sourceIDs := make(map[string]struct{}, len(c.Sources))
	deviceIDs := make(map[string]struct{})
	for i, source := range c.Sources {
		if strings.TrimSpace(source.SourceID) == "" {
			return fmt.Errorf("sources[%d].sourceId is required", i)
		}
		if _, exists := sourceIDs[source.SourceID]; exists {
			return fmt.Errorf("duplicate sourceId %q", source.SourceID)
		}
		sourceIDs[source.SourceID] = struct{}{}

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
			if strings.TrimSpace(device.DeviceID) == "" {
				return fmt.Errorf("sources[%d].devices[%d].deviceId is required", i, j)
			}
			if _, exists := deviceIDs[device.DeviceID]; exists {
				return fmt.Errorf("duplicate deviceId %q", device.DeviceID)
			}
			deviceIDs[device.DeviceID] = struct{}{}

			if len(device.Metrics) == 0 {
				return fmt.Errorf("sources[%d].devices[%d].metrics must not be empty", i, j)
			}
			for k, metric := range device.Metrics {
				if strings.TrimSpace(metric.Metric) == "" {
					return fmt.Errorf("sources[%d].devices[%d].metrics[%d].metric is required", i, j, k)
				}
				if metric.ValueType != "number" && metric.ValueType != "boolean" {
					return fmt.Errorf("sources[%d].devices[%d].metrics[%d].valueType must be number or boolean", i, j, k)
				}
			}
		}
	}

	return nil
}
