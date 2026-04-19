package config

import (
	"fmt"
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
	if strings.TrimSpace(c.Logging.Level) == "" {
		c.Logging.Level = defaultLoggingLevel
	}
}

func (c Config) validate() error {
	hasRuntimeSection := strings.TrimSpace(c.Runtime.EdgeID) != "" ||
		strings.TrimSpace(c.Runtime.StateDir) != "" ||
		strings.TrimSpace(c.Runtime.InstanceName) != ""
	if hasRuntimeSection {
		// Temporary T001 compatibility shim: accept the 007 runtime block now and
		// remove this optional path when T004 makes runtime.edgeId/stateDir mandatory.
		if strings.TrimSpace(c.Runtime.EdgeID) == "" {
			return fmt.Errorf("runtime.edgeId is required when runtime block is present")
		}
		if strings.TrimSpace(c.Runtime.StateDir) == "" {
			return fmt.Errorf("runtime.stateDir is required when runtime block is present")
		}
	}
	if strings.TrimSpace(c.Cloud.URL) == "" {
		return fmt.Errorf("cloud.url is required")
	}
	if c.Cloud.Namespace != defaultCloudNamespace {
		return fmt.Errorf("cloud.namespace must be %q", defaultCloudNamespace)
	}
	if c.Cloud.ConnectTimeoutMs < 0 {
		return fmt.Errorf("cloud.connectTimeoutMs must be positive when provided")
	}
	hasReconnectBlock := c.Cloud.Reconnect.BaseDelayMs != 0 ||
		c.Cloud.Reconnect.MaxDelayMs != 0 ||
		c.Cloud.Reconnect.MaxAttempts != 0
	if hasReconnectBlock {
		if c.Cloud.Reconnect.BaseDelayMs <= 0 {
			return fmt.Errorf("cloud.reconnect.baseDelayMs must be positive when reconnect block is present")
		}
		if c.Cloud.Reconnect.MaxDelayMs <= 0 {
			return fmt.Errorf("cloud.reconnect.maxDelayMs must be positive when reconnect block is present")
		}
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
