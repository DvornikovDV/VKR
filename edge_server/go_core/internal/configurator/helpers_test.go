package configurator

import (
	"strings"
	"testing"

	"edge_server/go_core/internal/config"
)

func TestHelperArduinoPresetParsesAndIsSanitized(t *testing.T) {
	raw := ArduinoStandPresetYAML()
	cfg, err := config.Parse([]byte(raw))
	if err != nil {
		t.Fatalf("parse sanitized Arduino stand preset: %v", err)
	}

	if strings.Contains(raw, "69fa56e7542f41fc6bfcc233") ||
		strings.Contains(raw, `C:\ProgramData\vkr-edge\state`) ||
		strings.Contains(raw, "http://localhost:4000") ||
		strings.Contains(raw, "COM7") {
		t.Fatal("sanitized preset must not copy operator-specific sample values")
	}

	if cfg.Runtime.EdgeID != "replace-with-edge-id" {
		t.Fatalf("expected editable edgeId placeholder, got %q", cfg.Runtime.EdgeID)
	}
	if cfg.Runtime.StateDir != "./replace-with-edge-state-dir" {
		t.Fatalf("expected editable stateDir placeholder, got %q", cfg.Runtime.StateDir)
	}
	if cfg.Cloud.URL != "http://replace-with-cloud-host.invalid" {
		t.Fatalf("expected editable cloud.url placeholder, got %q", cfg.Cloud.URL)
	}

	if len(cfg.Sources) != 1 {
		t.Fatalf("expected one Arduino stand source, got %d", len(cfg.Sources))
	}
	source := cfg.Sources[0]
	if source.SourceID != "arduino_stand" || source.AdapterKind != "modbus_rtu" {
		t.Fatalf("expected real stand source mapping, got sourceId=%q adapterKind=%q", source.SourceID, source.AdapterKind)
	}
	if source.Connection["port"] != "replace-with-serial-port" {
		t.Fatalf("expected editable serial port placeholder, got %#v", source.Connection["port"])
	}

	devices := make(map[string]config.LocalDeviceDefinition, len(source.Devices))
	for _, device := range source.Devices {
		devices[device.DeviceID] = device
	}
	assertCommandMapping(t, devices["pump_main"], "set_bool", "actual_state", 160, nil, nil)
	assertCommandMapping(t, devices["siren_alert"], "set_bool", "actual_state", 161, nil, nil)
	assertCommandMapping(t, devices["valve_pwm"], "set_number", "actual_value", 162, 0, 255)

	if len(cfg.Alarms) != 2 {
		t.Fatalf("expected two real stand alarm rules, got %d", len(cfg.Alarms))
	}
	if cfg.Alarms[0].RuleID != "humidity_high_warning" || cfg.Alarms[1].RuleID != "humidity_low_warning" {
		t.Fatalf("unexpected alarm rules: %+v", cfg.Alarms)
	}
}

func TestHelperCatalogValuesStayAlignedWithConfigValidation(t *testing.T) {
	helpers, err := HelperCatalog()
	if err != nil {
		t.Fatalf("helper catalog must validate against Edge config behavior: %v", err)
	}

	if len(helpers.Presets) != 1 {
		t.Fatalf("expected one preset, got %d", len(helpers.Presets))
	}
	if len(helpers.Enums) == 0 {
		t.Fatal("expected enum helper references")
	}
	if len(helpers.Snippets) == 0 {
		t.Fatal("expected helper snippets")
	}

	for _, enum := range helpers.Enums {
		for _, value := range enum.Values {
			probe, err := enumProbeYAML(enum.Field, value)
			if err != nil {
				t.Fatalf("build enum probe for %s=%s: %v", enum.Field, value, err)
			}
			if _, err := config.Parse([]byte(probe)); err != nil {
				t.Fatalf("helper enum %s=%s must be accepted by config.Parse: %v", enum.Field, value, err)
			}
		}
	}

	for _, snippet := range helpers.Snippets {
		if err := validateSnippetYAMLValues(snippet); err != nil {
			t.Fatalf("snippet %q actual YAML values must be accepted by config.Parse probes: %v", snippet.ID, err)
		}
	}

	assertConfigRejects(t, strings.Replace(ArduinoStandPresetYAML(), "command: set_bool", "command: set_float", 1), "command must be set_bool or set_number")
	assertConfigRejects(t, strings.Replace(ArduinoStandPresetYAML(), "severity: warning", "severity: info", 1), "severity must be warning or danger")
	assertConfigRejects(t, strings.Replace(ArduinoStandPresetYAML(), "level: info", "level: trace", 1), "logging.level must be one of debug, info, warn, error")
}

func TestHelperSnippetProofUsesActualSnippetYAML(t *testing.T) {
	err := validateSnippetYAMLValues(HelperSnippet{
		ID: "invalid-command-snippet",
		YAML: strings.TrimPrefix(`
          - command: set_float
            mapping:
              registerType: holding
              address: 160
            reportedMetric: actual_state
`, "\n"),
	})
	if err == nil {
		t.Fatal("expected invalid command in actual snippet YAML to be rejected")
	}
	if !strings.Contains(err.Error(), `field "sources[].devices[].commands[].command" value "set_float"`) {
		t.Fatalf("expected rejection to reference actual snippet command value, got %v", err)
	}
}

func assertCommandMapping(t *testing.T, device config.LocalDeviceDefinition, commandType string, reportedMetric string, address int, min any, max any) {
	t.Helper()
	if device.DeviceID == "" {
		t.Fatalf("expected device for command %s", commandType)
	}
	if len(device.Commands) != 1 {
		t.Fatalf("expected one command for device %s, got %d", device.DeviceID, len(device.Commands))
	}
	command := device.Commands[0]
	if command.Command != commandType {
		t.Fatalf("expected command %s for device %s, got %s", commandType, device.DeviceID, command.Command)
	}
	if command.ReportedMetric != reportedMetric {
		t.Fatalf("expected reportedMetric %s for device %s, got %s", reportedMetric, device.DeviceID, command.ReportedMetric)
	}
	if command.Mapping["registerType"] != "holding" || command.Mapping["address"] != address {
		t.Fatalf("unexpected command mapping for device %s: %#v", device.DeviceID, command.Mapping)
	}
	if command.Min != min || command.Max != max {
		t.Fatalf("unexpected command range for device %s: min=%#v max=%#v", device.DeviceID, command.Min, command.Max)
	}
}

func assertConfigRejects(t *testing.T, raw string, snippet string) {
	t.Helper()
	_, err := config.Parse([]byte(raw))
	if err == nil {
		t.Fatalf("expected config.Parse rejection containing %q", snippet)
	}
	if !strings.Contains(err.Error(), snippet) {
		t.Fatalf("expected rejection containing %q, got %v", snippet, err)
	}
}
