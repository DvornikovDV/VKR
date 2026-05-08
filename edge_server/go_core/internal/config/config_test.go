package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLoadFromFileParsesAndAppliesDefaults(t *testing.T) {
	t.Setenv("CLOUD_SOCKET_URL", "https://runtime.example.test")
	t.Setenv("RUNTIME_STATE_DIR", t.TempDir())

	body := `
runtime:
  edgeId: 507f1f77bcf86cd799439011
  stateDir: ${RUNTIME_STATE_DIR}

cloud:
  url: ${CLOUD_SOCKET_URL}
  connectTimeoutMs: 10000
  reconnect:
    baseDelayMs: 1000
    maxDelayMs: 30000
    maxAttempts: 0

sources:
  - sourceId: source-1
    adapterKind: mock
    enabled: true
    pollIntervalMs: 1000
    connection:
      profile: default
    devices:
      - deviceId: device-1
        address:
          node: 1
        metrics:
          - metric: pressure
            valueType: number
            mapping:
              register: 40001
`

	cfgPath := filepath.Join(t.TempDir(), "config.yaml")
	if err := os.WriteFile(cfgPath, []byte(body), 0o600); err != nil {
		t.Fatalf("write config fixture: %v", err)
	}

	cfg, err := LoadFromFile(cfgPath)
	if err != nil {
		t.Fatalf("load config: %v", err)
	}

	if cfg.Cloud.URL != "https://runtime.example.test" {
		t.Fatalf("expected env substitution in cloud.url, got %q", cfg.Cloud.URL)
	}
	if cfg.Runtime.EdgeID != "507f1f77bcf86cd799439011" {
		t.Fatalf("expected runtime.edgeId to be preserved, got %q", cfg.Runtime.EdgeID)
	}
	if cfg.Runtime.StateDir == "" {
		t.Fatal("expected runtime.stateDir to be preserved")
	}
	if cfg.Cloud.Namespace != "/edge" {
		t.Fatalf("expected default cloud namespace /edge, got %q", cfg.Cloud.Namespace)
	}
	if cfg.Batch.IntervalMs != 1000 || cfg.Batch.MaxReadings != 100 {
		t.Fatalf("unexpected batch defaults: %+v", cfg.Batch)
	}
	if cfg.Logging.Level != "info" {
		t.Fatalf("expected default logging level info, got %q", cfg.Logging.Level)
	}
	if len(cfg.Alarms) != 0 {
		t.Fatalf("expected configs without alarms to preserve empty alarms, got %d", len(cfg.Alarms))
	}
}

func TestLoadFromFileAccepts007FixtureShape(t *testing.T) {
	t.Setenv("RUNTIME_STATE_DIR", t.TempDir())
	t.Setenv("CLOUD_SOCKET_URL", "http://127.0.0.1:4000")

	body := `
runtime:
  edgeId: 507f1f77bcf86cd799439011
  stateDir: ${RUNTIME_STATE_DIR}
  instanceName: fixture-edge

cloud:
  url: ${CLOUD_SOCKET_URL}
  namespace: /edge
  connectTimeoutMs: 10000
  reconnect:
    baseDelayMs: 1000
    maxDelayMs: 30000
    maxAttempts: 0

batch:
  intervalMs: 1000
  maxReadings: 100

sources:
  - sourceId: source-1
    adapterKind: mock
    enabled: true
    pollIntervalMs: 1000
    connection:
      profile: default
    devices:
      - deviceId: device-1
        address:
          node: 1
        metrics:
          - metric: pressure
            valueType: number
            mapping:
              register: 40001
`

	cfgPath := filepath.Join(t.TempDir(), "config.yaml")
	if err := os.WriteFile(cfgPath, []byte(body), 0o600); err != nil {
		t.Fatalf("write config fixture: %v", err)
	}

	cfg, err := LoadFromFile(cfgPath)
	if err != nil {
		t.Fatalf("load 007-shaped config: %v", err)
	}

	if cfg.Runtime.EdgeID != "507f1f77bcf86cd799439011" {
		t.Fatalf("unexpected runtime.edgeId: %q", cfg.Runtime.EdgeID)
	}
	if cfg.Runtime.StateDir == "" {
		t.Fatal("expected runtime.stateDir to be preserved")
	}
	if cfg.Cloud.ConnectTimeoutMs != 10000 {
		t.Fatalf("unexpected connect timeout: %d", cfg.Cloud.ConnectTimeoutMs)
	}
	if cfg.Cloud.Reconnect.BaseDelayMs != 1000 || cfg.Cloud.Reconnect.MaxDelayMs != 30000 {
		t.Fatalf("unexpected reconnect settings: %+v", cfg.Cloud.Reconnect)
	}
}

func TestParseAcceptsArduinoStandCommandMapping(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("..", "..", "..", "samples", "arduino-stand", "edge-runtime.yaml"))
	if err != nil {
		t.Fatalf("read Arduino stand sample: %v", err)
	}

	cfg, err := Parse(raw)
	if err != nil {
		t.Fatalf("parse Arduino stand sample with command mapping: %v", err)
	}

	devices := make(map[string]*LocalDeviceDefinition)
	for sourceIndex := range cfg.Sources {
		for deviceIndex := range cfg.Sources[sourceIndex].Devices {
			device := &cfg.Sources[sourceIndex].Devices[deviceIndex]
			devices[device.DeviceID] = device
		}
	}
	pump := devices["pump_main"]
	if pump == nil {
		t.Fatal("expected pump_main device in Arduino stand sample")
	}
	if len(pump.Commands) != 1 {
		t.Fatalf("expected one pump_main command mapping, got %d", len(pump.Commands))
	}

	command := pump.Commands[0]
	if command.Command != "set_bool" {
		t.Fatalf("unexpected command type: %q", command.Command)
	}
	if command.ReportedMetric != "actual_state" {
		t.Fatalf("unexpected reported metric: %q", command.ReportedMetric)
	}
	if command.Mapping["registerType"] != "holding" {
		t.Fatalf("unexpected command register type: %#v", command.Mapping["registerType"])
	}
	if command.Mapping["address"] != 160 {
		t.Fatalf("unexpected command address: %#v", command.Mapping["address"])
	}

	valve := devices["valve_pwm"]
	if valve == nil {
		t.Fatal("expected valve_pwm device in Arduino stand sample")
	}
	if len(valve.Commands) != 1 {
		t.Fatalf("expected one valve_pwm command mapping, got %d", len(valve.Commands))
	}

	command = valve.Commands[0]
	if command.Command != "set_number" {
		t.Fatalf("unexpected valve_pwm command type: %q", command.Command)
	}
	if command.ReportedMetric != "actual_value" {
		t.Fatalf("unexpected valve_pwm reported metric: %q", command.ReportedMetric)
	}
	if command.Mapping["registerType"] != "holding" {
		t.Fatalf("unexpected valve_pwm command register type: %#v", command.Mapping["registerType"])
	}
	if command.Mapping["address"] != 162 {
		t.Fatalf("unexpected valve_pwm command address: %#v", command.Mapping["address"])
	}
	if command.Min != 0 || command.Max != 255 {
		t.Fatalf("unexpected valve_pwm command range: min=%#v max=%#v", command.Min, command.Max)
	}
}

func TestParseAcceptsArduinoStandAlarmRule(t *testing.T) {
	cfg, err := Parse(arduinoStandSampleYAML(t))
	if err != nil {
		t.Fatalf("parse Arduino stand sample with alarm rule: %v", err)
	}
	if len(cfg.Alarms) != 1 {
		t.Fatalf("expected one Arduino stand alarm rule, got %d", len(cfg.Alarms))
	}
	alarm := cfg.Alarms[0]
	if alarm.RuleID != "temp_high_warning" {
		t.Fatalf("unexpected alarm ruleId: %q", alarm.RuleID)
	}
	if alarm.Enabled == nil || !*alarm.Enabled {
		t.Fatalf("expected alarm enabled: true, got %#v", alarm.Enabled)
	}
	if alarm.SourceID != "arduino_stand" || alarm.DeviceID != "environment" || alarm.Metric != "temperature" {
		t.Fatalf("unexpected alarm identity: source=%q device=%q metric=%q", alarm.SourceID, alarm.DeviceID, alarm.Metric)
	}
	if alarm.ConditionType != "high" || alarm.Severity != "warning" {
		t.Fatalf("unexpected alarm condition/severity: condition=%q severity=%q", alarm.ConditionType, alarm.Severity)
	}
	if alarm.TriggerThreshold == nil || *alarm.TriggerThreshold != 30.0 {
		t.Fatalf("unexpected alarm triggerThreshold: %#v", alarm.TriggerThreshold)
	}
	if alarm.ClearThreshold == nil || *alarm.ClearThreshold != 28.0 {
		t.Fatalf("unexpected alarm clearThreshold: %#v", alarm.ClearThreshold)
	}
}

func TestParseRejectsHighAlarmInvalidHysteresis(t *testing.T) {
	body := strings.Replace(string(arduinoStandSampleYAML(t)), "    clearThreshold: 28.0", "    clearThreshold: 30.0", 1)

	_, err := Parse([]byte(body))
	if err == nil {
		t.Fatal("expected invalid high alarm hysteresis to be rejected")
	}
	if !strings.Contains(err.Error(), "alarms[0].triggerThreshold must be greater than clearThreshold for high conditionType") {
		t.Fatalf("expected high hysteresis validation error, got %v", err)
	}
}

func TestParseAcceptsArduinoStandMetricMappings(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("..", "..", "..", "samples", "arduino-stand", "edge-runtime.yaml"))
	if err != nil {
		t.Fatalf("read Arduino stand sample: %v", err)
	}

	cfg, err := Parse(raw)
	if err != nil {
		t.Fatalf("parse Arduino stand sample with metric mapping: %v", err)
	}

	devices := make(map[string]*LocalDeviceDefinition)
	for sourceIndex := range cfg.Sources {
		for deviceIndex := range cfg.Sources[sourceIndex].Devices {
			device := &cfg.Sources[sourceIndex].Devices[deviceIndex]
			devices[device.DeviceID] = device
		}
	}
	env := devices["environment"]
	if env == nil {
		t.Fatal("expected environment device in Arduino stand sample")
	}

	var tempMapping, humMapping map[string]interface{}
	for _, m := range env.Metrics {
		if m.Metric == "temperature" {
			tempMapping = m.Mapping
		} else if m.Metric == "humidity" {
			humMapping = m.Mapping
		}
	}

	if tempMapping == nil || humMapping == nil {
		t.Fatal("expected temperature and humidity metrics")
	}

	if tempMapping["dataType"] != "int16" {
		t.Fatalf("expected temperature dataType: int16, got %v", tempMapping["dataType"])
	}

	if _, ok := humMapping["dataType"]; ok {
		t.Fatalf("expected humidity to have omitted dataType, got %v", humMapping["dataType"])
	}
}

func TestParseRejectsInvalidDeviceCommandMappings(t *testing.T) {
	t.Setenv("CLOUD_SOCKET_URL", "https://runtime.example.test")
	t.Setenv("RUNTIME_STATE_DIR", t.TempDir())

	valid := validCommandConfigYAML()
	cases := []struct {
		name       string
		body       string
		errSnippet string
	}{
		{
			name:       "set_bool regression accepts existing command shape",
			body:       valid,
			errSnippet: "",
		},
		{
			name:       "valid set_number command shape",
			body:       validSetNumberCommandConfigYAML(),
			errSnippet: "",
		},
		{
			name:       "unsupported command type",
			body:       strings.Replace(valid, "command: set_bool", "command: set_float", 1),
			errSnippet: "command must be set_bool or set_number",
		},
		{
			name:       "missing command mapping",
			body:       strings.Replace(valid, "          - command: set_bool\n            mapping:\n              registerType: holding\n              address: 160\n            reportedMetric: actual_state\n", "          - command: set_bool\n            reportedMetric: actual_state\n", 1),
			errSnippet: "mapping is required",
		},
		{
			name:       "non holding register",
			body:       strings.Replace(valid, "registerType: holding", "registerType: input", 1),
			errSnippet: "mapping.registerType must be holding",
		},
		{
			name:       "missing command address",
			body:       strings.Replace(valid, "              address: 160\n", "", 1),
			errSnippet: "mapping.address is required",
		},
		{
			name:       "out of range command address",
			body:       strings.Replace(valid, "address: 160", "address: 70000", 1),
			errSnippet: "mapping.address must be between 0 and 65535",
		},
		{
			name:       "unknown mapping field",
			body:       strings.Replace(valid, "              address: 160\n", "              address: 160\n              functionCode: 6\n", 1),
			errSnippet: "mapping must contain only address and registerType",
		},
		{
			name:       "unknown reported metric",
			body:       strings.Replace(valid, "reportedMetric: actual_state", "reportedMetric: desired_state", 1),
			errSnippet: "reportedMetric must reference a device metric",
		},
		{
			name:       "non boolean reported metric",
			body:       strings.Replace(valid, "valueType: boolean", "valueType: number", 1),
			errSnippet: "reportedMetric must reference a boolean metric",
		},
		{
			name:       "set_bool rejects min metadata",
			body:       strings.Replace(valid, "            reportedMetric: actual_state\n", "            min: 0\n            reportedMetric: actual_state\n", 1),
			errSnippet: "min is only allowed for set_number",
		},
		{
			name:       "set_bool rejects max metadata",
			body:       strings.Replace(valid, "            reportedMetric: actual_state\n", "            max: 1\n            reportedMetric: actual_state\n", 1),
			errSnippet: "max is only allowed for set_number",
		},
		{
			name:       "set_bool rejects range metadata",
			body:       strings.Replace(valid, "            reportedMetric: actual_state\n", "            min: 0\n            max: 1\n            reportedMetric: actual_state\n", 1),
			errSnippet: "min is only allowed for set_number",
		},
		{
			name:       "set_number missing min",
			body:       strings.Replace(validSetNumberCommandConfigYAML(), "            min: 0\n", "", 1),
			errSnippet: "min is required",
		},
		{
			name:       "set_number missing max",
			body:       strings.Replace(validSetNumberCommandConfigYAML(), "            max: 255\n", "", 1),
			errSnippet: "max is required",
		},
		{
			name:       "set_number min must be integer",
			body:       strings.Replace(validSetNumberCommandConfigYAML(), "min: 0", "min: 0.5", 1),
			errSnippet: "min must be an integer",
		},
		{
			name:       "set_number max must be integer",
			body:       strings.Replace(validSetNumberCommandConfigYAML(), "max: 255", "max: 255.5", 1),
			errSnippet: "max must be an integer",
		},
		{
			name:       "set_number min cannot be below uint16",
			body:       strings.Replace(validSetNumberCommandConfigYAML(), "min: 0", "min: -1", 1),
			errSnippet: "min must be between 0 and 65535",
		},
		{
			name:       "set_number max cannot exceed uint16",
			body:       strings.Replace(validSetNumberCommandConfigYAML(), "max: 255", "max: 70000", 1),
			errSnippet: "max must be between 0 and 65535",
		},
		{
			name:       "set_number min must not exceed max",
			body:       strings.Replace(strings.Replace(validSetNumberCommandConfigYAML(), "min: 0", "min: 300", 1), "max: 255", "max: 255", 1),
			errSnippet: "min must be less than or equal to max",
		},
		{
			name:       "set_number non holding register",
			body:       strings.Replace(validSetNumberCommandConfigYAML(), "registerType: holding", "registerType: input", 1),
			errSnippet: "mapping.registerType must be holding",
		},
		{
			name:       "set_number unknown reported metric",
			body:       strings.Replace(validSetNumberCommandConfigYAML(), "reportedMetric: actual_value", "reportedMetric: desired_value", 1),
			errSnippet: "reportedMetric must reference a device metric",
		},
		{
			name:       "set_number non number reported metric",
			body:       strings.Replace(validSetNumberCommandConfigYAML(), "valueType: number", "valueType: boolean", 1),
			errSnippet: "reportedMetric must reference a number metric",
		},
		{
			name:       "source level commands are rejected",
			body:       strings.Replace(valid, "    devices:\n", "    commands:\n      - command: set_bool\n        mapping:\n          registerType: holding\n          address: 160\n        reportedMetric: actual_state\n    devices:\n", 1),
			errSnippet: "field commands not found",
		},
		{
			name:       "disabled source command mapping is still validated",
			body:       strings.Replace(strings.Replace(valid, "enabled: true", "enabled: false", 1), "registerType: holding", "registerType: input", 1),
			errSnippet: "mapping.registerType must be holding",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := Parse([]byte(tc.body))
			if tc.errSnippet == "" {
				if err != nil {
					t.Fatalf("expected config to be valid: %v", err)
				}
				return
			}
			if err == nil {
				t.Fatalf("expected validation error containing %q", tc.errSnippet)
			}
			if !strings.Contains(err.Error(), tc.errSnippet) {
				t.Fatalf("expected error to contain %q, got %v", tc.errSnippet, err)
			}
		})
	}
}

func TestParseRejectsInvalidOperatorConfig(t *testing.T) {
	t.Setenv("CLOUD_SOCKET_URL", "https://runtime.example.test")
	t.Setenv("RUNTIME_STATE_DIR", t.TempDir())

	base := validConfigYAML()
	cases := []struct {
		name       string
		body       string
		errSnippet string
	}{
		{
			name:       "missing runtime edge id",
			body:       strings.Replace(validConfigYAML(), "  edgeId: 507f1f77bcf86cd799439011\n", "", 1),
			errSnippet: "runtime.edgeId is required",
		},
		{
			name:       "missing runtime state dir",
			body:       strings.Replace(validConfigYAML(), "  stateDir: ${RUNTIME_STATE_DIR}\n", "", 1),
			errSnippet: "runtime.stateDir is required",
		},
		{
			name:       "duplicate source ids",
			body:       strings.Replace(base, "source-2", "source-1", 1),
			errSnippet: "duplicate sourceId",
		},
		{
			name:       "duplicate device ids across sources",
			body:       strings.Replace(base, "device-2", "device-1", 1),
			errSnippet: "duplicate deviceId",
		},
		{
			name:       "invalid metric value type",
			body:       strings.Replace(base, "valueType: number", "valueType: string", 1),
			errSnippet: "valueType must be number or boolean",
		},
		{
			name: "duplicate metrics within one device",
			body: strings.Replace(
				base,
				"          - metric: pressure\n            valueType: number\n            mapping:\n              register: 40001\n",
				"          - metric: pressure\n            valueType: number\n            mapping:\n              register: 40001\n          - metric: pressure\n            valueType: number\n            mapping:\n              register: 40002\n",
				1,
			),
			errSnippet: "duplicate metric",
		},
		{
			name:       "cloud namespace must match contract",
			body:       strings.Replace(base, "namespace: /edge", "namespace: /custom", 1),
			errSnippet: "cloud.namespace must be",
		},
		{
			name:       "cloud url must be valid",
			body:       strings.Replace(base, "url: ${CLOUD_SOCKET_URL}", "url: http://[::1", 1),
			errSnippet: "cloud.url must be a valid URL",
		},
		{
			name:       "cloud url scheme must be http or https",
			body:       strings.Replace(base, "url: ${CLOUD_SOCKET_URL}", "url: ws://cloud.example.test", 1),
			errSnippet: "cloud.url scheme must be http or https",
		},
		{
			name:       "cloud url host is required",
			body:       strings.Replace(base, "url: ${CLOUD_SOCKET_URL}", "url: https:///edge", 1),
			errSnippet: "cloud.url host is required",
		},
		{
			name:       "cloud connect timeout must be positive",
			body:       strings.Replace(base, "connectTimeoutMs: 10000", "connectTimeoutMs: 0", 1),
			errSnippet: "cloud.connectTimeoutMs must be positive",
		},
		{
			name:       "cloud reconnect max delay must be greater than or equal to base delay",
			body:       strings.Replace(base, "maxDelayMs: 30000", "maxDelayMs: 500", 1),
			errSnippet: "cloud.reconnect.maxDelayMs must be greater than or equal to cloud.reconnect.baseDelayMs",
		},
		{
			name:       "cloud reconnect max attempts cannot be negative",
			body:       strings.Replace(base, "maxAttempts: 0", "maxAttempts: -1", 1),
			errSnippet: "cloud.reconnect.maxAttempts must be zero or positive",
		},
		{
			name:       "unknown field in operator config is rejected",
			body:       strings.Replace(base, "batch:", "unknownSetting: true\n\nbatch:", 1),
			errSnippet: "field unknownSetting not found",
		},
		{
			name:       "enabled source requires adapter kind",
			body:       strings.Replace(base, "    adapterKind: mock\n", "", 1),
			errSnippet: "sources[0].adapterKind is required",
		},
		{
			name:       "enabled source requires devices",
			body:       strings.Replace(base, "    devices:\n      - deviceId: device-1\n        address:\n          node: 1\n        metrics:\n          - metric: pressure\n            valueType: number\n            mapping:\n              register: 40001\n", "", 1),
			errSnippet: "sources[0].devices must not be empty",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := Parse([]byte(tc.body))
			if err == nil {
				t.Fatalf("expected validation error containing %q", tc.errSnippet)
			}
			if !strings.Contains(err.Error(), tc.errSnippet) {
				t.Fatalf("expected error to contain %q, got %v", tc.errSnippet, err)
			}
		})
	}
}

func TestLoadFromFileBehaviorForStableSources(t *testing.T) {
	t.Setenv("CLOUD_SOCKET_URL", "https://cloud.example.test")
	t.Setenv("RUNTIME_STATE_DIR", t.TempDir())

	cases := []struct {
		name       string
		body       string
		wantErr    bool
		errSnippet string
	}{
		{
			name: "accepts valid operator config with stable source definitions",
			body: validConfigYAML(),
		},
		{
			name: "accepts disabled source retained for later use without adapter-ready fields",
			body: validConfigYAML() + `
  - sourceId: source-disabled
    enabled: false
`,
		},
		{
			name:       "rejects duplicate runtime-local device ids across sources",
			body:       strings.Replace(validConfigYAML(), "device-2", "device-1", 1),
			wantErr:    true,
			errSnippet: "duplicate deviceId",
		},
		{
			name:       "rejects configs without enabled sources",
			body:       strings.ReplaceAll(validConfigYAML(), "enabled: true", "enabled: false"),
			wantErr:    true,
			errSnippet: "at least one enabled source definition is required",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			cfgPath := filepath.Join(t.TempDir(), "config.yaml")
			if err := os.WriteFile(cfgPath, []byte(tc.body), 0o600); err != nil {
				t.Fatalf("write config fixture: %v", err)
			}

			cfg, err := LoadFromFile(cfgPath)
			if tc.wantErr {
				if err == nil {
					t.Fatalf("expected validation error containing %q", tc.errSnippet)
				}
				if !strings.Contains(err.Error(), tc.errSnippet) {
					t.Fatalf("expected error to contain %q, got %v", tc.errSnippet, err)
				}
				return
			}

			if err != nil {
				t.Fatalf("expected config to be valid: %v", err)
			}
			if cfg.Cloud.URL != "https://cloud.example.test" {
				t.Fatalf("expected env substitution, got %q", cfg.Cloud.URL)
			}
			if cfg.Cloud.Namespace != "/edge" {
				t.Fatalf("expected cloud namespace /edge, got %q", cfg.Cloud.Namespace)
			}
		})
	}
}

func validConfigYAML() string {
	return `
runtime:
  edgeId: 507f1f77bcf86cd799439011
  stateDir: ${RUNTIME_STATE_DIR}

cloud:
  url: ${CLOUD_SOCKET_URL}
  namespace: /edge
  connectTimeoutMs: 10000
  reconnect:
    baseDelayMs: 1000
    maxDelayMs: 30000
    maxAttempts: 0

batch:
  intervalMs: 1000
  maxReadings: 100

sources:
  - sourceId: source-1
    adapterKind: mock
    enabled: true
    pollIntervalMs: 1000
    connection:
      profile: primary
    devices:
      - deviceId: device-1
        address:
          node: 1
        metrics:
          - metric: pressure
            valueType: number
            mapping:
              register: 40001
  - sourceId: source-2
    adapterKind: mock
    enabled: true
    pollIntervalMs: 2000
    connection:
      profile: secondary
    devices:
      - deviceId: device-2
        address:
          node: 2
        metrics:
          - metric: is_running
            valueType: boolean
            mapping:
              coil: 1
`
}

func validCommandConfigYAML() string {
	return `
runtime:
  edgeId: 507f1f77bcf86cd799439011
  stateDir: ${RUNTIME_STATE_DIR}

cloud:
  url: ${CLOUD_SOCKET_URL}
  namespace: /edge
  connectTimeoutMs: 10000
  reconnect:
    baseDelayMs: 1000
    maxDelayMs: 30000
    maxAttempts: 0

sources:
  - sourceId: source-1
    adapterKind: modbus_rtu
    enabled: true
    pollIntervalMs: 1000
    connection:
      port: COM7
      baudRate: 9600
      dataBits: 8
      parity: none
      stopBits: 1
      slaveId: 1
      timeoutMs: 500
    devices:
      - deviceId: pump_main
        address:
          node: 2
        metrics:
          - metric: actual_state
            valueType: boolean
            mapping:
              registerType: input
              address: 16
        commands:
          - command: set_bool
            mapping:
              registerType: holding
              address: 160
            reportedMetric: actual_state
`
}

func validSetNumberCommandConfigYAML() string {
	return `
runtime:
  edgeId: 507f1f77bcf86cd799439011
  stateDir: ${RUNTIME_STATE_DIR}

cloud:
  url: ${CLOUD_SOCKET_URL}
  namespace: /edge
  connectTimeoutMs: 10000
  reconnect:
    baseDelayMs: 1000
    maxDelayMs: 30000
    maxAttempts: 0

sources:
  - sourceId: source-1
    adapterKind: modbus_rtu
    enabled: true
    pollIntervalMs: 1000
    connection:
      port: COM7
      baudRate: 9600
      dataBits: 8
      parity: none
      stopBits: 1
      slaveId: 1
      timeoutMs: 500
    devices:
      - deviceId: valve_pwm
        address:
          node: 4
        metrics:
          - metric: actual_value
            valueType: number
            mapping:
              registerType: input
              address: 18
        commands:
          - command: set_number
            mapping:
              registerType: holding
              address: 162
            min: 0
            max: 255
            reportedMetric: actual_value
`
}

func arduinoStandSampleYAML(t *testing.T) []byte {
	t.Helper()

	raw, err := os.ReadFile(filepath.Join("..", "..", "..", "samples", "arduino-stand", "edge-runtime.yaml"))
	if err != nil {
		t.Fatalf("read Arduino stand sample: %v", err)
	}

	return raw
}
