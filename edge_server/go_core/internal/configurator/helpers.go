package configurator

import (
	"fmt"
	"strings"

	_ "embed"

	"edge_server/go_core/internal/config"
	"edge_server/go_core/internal/source"

	"gopkg.in/yaml.v3"
)

//go:embed assets/arduino-stand.yaml
var arduinoStandPreset []byte

type HelperData struct {
	Presets  []HelperPreset  `json:"presets"`
	Enums    []HelperEnum    `json:"enums"`
	Snippets []HelperSnippet `json:"snippets"`
	Hints    []FieldHint     `json:"hints"`
}

type HelperPreset struct {
	ID          string `json:"id"`
	Label       string `json:"label"`
	Description string `json:"description"`
	YAML        string `json:"yaml"`
}

type HelperEnum struct {
	Field       string   `json:"field"`
	Values      []string `json:"values"`
	Description string   `json:"description"`
}

type HelperSnippet struct {
	ID          string `json:"id"`
	Label       string `json:"label"`
	Description string `json:"description"`
	InsertAfter string `json:"insertAfter"`
	YAML        string `json:"yaml"`
}

type FieldHint struct {
	Field string `json:"field"`
	Text  string `json:"text"`
}

func ArduinoStandPresetYAML() string {
	return string(arduinoStandPreset)
}

func HelperCatalog() (HelperData, error) {
	data := HelperData{
		Presets: []HelperPreset{
			{
				ID:          "arduino-stand",
				Label:       "Arduino stand",
				Description: "Sanitized Arduino stand preset with real source, device, metric, command, and alarm mappings.",
				YAML:        ArduinoStandPresetYAML(),
			},
		},
		Enums: []HelperEnum{
			{
				Field:       "sources[].adapterKind",
				Values:      []string{source.ModbusRTUKind},
				Description: "Source adapter kind used by the Arduino stand runtime mapping.",
			},
			{
				Field:       "sources[].devices[].metrics[].valueType",
				Values:      []string{"number", "boolean"},
				Description: "Metric value types accepted by the Edge config parser.",
			},
			{
				Field:       "sources[].devices[].commands[].command",
				Values:      []string{"set_bool", "set_number"},
				Description: "Command types accepted by the Edge config parser.",
			},
			{
				Field:       "sources[].devices[].commands[].mapping.registerType",
				Values:      []string{"holding"},
				Description: "Command writes are restricted to holding registers by Edge config validation.",
			},
			{
				Field:       "alarms[].conditionType",
				Values:      []string{"high", "low", "state", "connectivity"},
				Description: "Alarm condition types accepted by the Edge config parser.",
			},
			{
				Field:       "alarms[].severity",
				Values:      []string{"warning", "danger"},
				Description: "Alarm severities accepted by the Edge config parser.",
			},
			{
				Field:       "logging.level",
				Values:      []string{"debug", "info", "warn", "error"},
				Description: "Logging levels accepted by the Edge config parser.",
			},
		},
		Snippets: []HelperSnippet{
			{
				ID:          "source-modbus-rtu",
				Label:       "Modbus RTU source",
				Description: "Source block shape for a serial Modbus RTU adapter.",
				InsertAfter: "sources:",
				YAML: strings.TrimPrefix(`
  - sourceId: arduino_stand
    adapterKind: modbus_rtu
    enabled: true
    pollIntervalMs: 1000
    connection:
      port: replace-with-serial-port
      baudRate: 9600
      dataBits: 8
      parity: none
      stopBits: 1
      slaveId: 1
      timeoutMs: 500
      settleDelayMs: 2000
    devices:
      - deviceId: environment
        address:
          node: 1
        metrics:
          - metric: humidity
            valueType: number
            mapping:
              registerType: input
              address: 1
              scale: 0.1
`, "\n"),
			},
			{
				ID:          "device-block",
				Label:       "Device with metric",
				Description: "Device block with one numeric metric.",
				InsertAfter: "sources[].devices:",
				YAML: strings.TrimPrefix(`
      - deviceId: environment
        address:
          node: 1
        metrics:
          - metric: humidity
            valueType: number
            mapping:
              registerType: input
              address: 1
              scale: 0.1
`, "\n"),
			},
			{
				ID:          "number-metric",
				Label:       "Number metric",
				Description: "Metric block for a Modbus input register numeric value.",
				InsertAfter: "sources[].devices[].metrics:",
				YAML: strings.TrimPrefix(`
          - metric: humidity
            valueType: number
            mapping:
              registerType: input
              address: 1
              scale: 0.1
`, "\n"),
			},
			{
				ID:          "set-bool-command",
				Label:       "Boolean command",
				Description: "Command block for writing a boolean state to a holding register.",
				InsertAfter: "sources[].devices[].commands:",
				YAML: strings.TrimPrefix(`
          - command: set_bool
            mapping:
              registerType: holding
              address: 160
            reportedMetric: actual_state
`, "\n"),
			},
			{
				ID:          "set-number-command",
				Label:       "Number command",
				Description: "Command block for writing a bounded numeric value to a holding register.",
				InsertAfter: "sources[].devices[].commands:",
				YAML: strings.TrimPrefix(`
          - command: set_number
            mapping:
              registerType: holding
              address: 162
            min: 0
            max: 255
            reportedMetric: actual_value
`, "\n"),
			},
			{
				ID:          "high-alarm",
				Label:       "High alarm",
				Description: "Alarm block for a numeric metric with trigger and clear thresholds.",
				InsertAfter: "alarms:",
				YAML: strings.TrimPrefix(`
  - ruleId: humidity_high_warning
    enabled: true
    sourceId: arduino_stand
    deviceId: environment
    metric: humidity
    conditionType: high
    triggerThreshold: 55.0
    clearThreshold: 50.0
    severity: warning
    label: "High humidity"
`, "\n"),
			},
		},
		Hints: []FieldHint{
			{Field: "runtime.edgeId", Text: "Use the edge id issued during onboarding."},
			{Field: "runtime.stateDir", Text: "Use the directory that contains credential.json and runtime state files."},
			{Field: "cloud.url", Text: "Use the Cloud HTTP URL reachable from this Edge host."},
			{Field: "sources[].connection.port", Text: "Use the local serial port assigned to the Arduino stand."},
			{Field: "sources[].devices[].commands[].reportedMetric", Text: "Reference an existing metric on the same device with a compatible valueType."},
		},
	}

	if err := validateHelperCatalog(data); err != nil {
		return HelperData{}, err
	}

	return data, nil
}

func validateHelperCatalog(data HelperData) error {
	for _, preset := range data.Presets {
		if _, err := config.Parse([]byte(preset.YAML)); err != nil {
			return fmt.Errorf("preset %q does not parse through Edge config validation: %w", preset.ID, err)
		}
	}

	for _, enum := range data.Enums {
		for _, value := range enum.Values {
			probe, err := enumProbeYAML(enum.Field, value)
			if err != nil {
				return err
			}
			if _, err := config.Parse([]byte(probe)); err != nil {
				return fmt.Errorf("enum %q value %q is not accepted by Edge config validation: %w", enum.Field, value, err)
			}
		}
	}

	for _, snippet := range data.Snippets {
		if strings.TrimSpace(snippet.YAML) == "" {
			return fmt.Errorf("snippet %q must not be empty", snippet.ID)
		}
		if err := validateSnippetYAMLValues(snippet); err != nil {
			return err
		}
	}

	return nil
}

func validateSnippetYAMLValues(snippet HelperSnippet) error {
	var node yaml.Node
	if err := yaml.Unmarshal([]byte(deindentYAML(snippet.YAML)), &node); err != nil {
		return fmt.Errorf("snippet %q is not valid YAML: %w", snippet.ID, err)
	}

	return validateSnippetNode(snippet.ID, &node, "")
}

func validateSnippetNode(snippetID string, node *yaml.Node, parentKey string) error {
	if node == nil {
		return nil
	}
	if node.Kind == yaml.DocumentNode && len(node.Content) > 0 {
		return validateSnippetNode(snippetID, node.Content[0], parentKey)
	}
	if node.Kind == yaml.SequenceNode {
		for _, item := range node.Content {
			if err := validateSnippetNode(snippetID, item, parentKey); err != nil {
				return err
			}
		}
		return nil
	}
	if node.Kind != yaml.MappingNode {
		return nil
	}

	mappingParent := snippetMappingParent(node)
	for i := 0; i+1 < len(node.Content); i += 2 {
		key := node.Content[i]
		value := node.Content[i+1]
		field, ok := snippetEnumField(key.Value, parentKey)
		if ok {
			rawValue, err := scalarString(value)
			if err != nil {
				return fmt.Errorf("snippet %q field %q must be a scalar string: %w", snippetID, field, err)
			}
			probe, err := enumProbeYAML(field, rawValue)
			if err != nil {
				return err
			}
			if _, err := config.Parse([]byte(probe)); err != nil {
				return fmt.Errorf("snippet %q field %q value %q is not accepted by Edge config validation: %w", snippetID, field, rawValue, err)
			}
		}
		childParent := key.Value
		if key.Value == "mapping" {
			childParent = mappingParent
		}
		if err := validateSnippetNode(snippetID, value, childParent); err != nil {
			return err
		}
	}

	return nil
}

func snippetMappingParent(node *yaml.Node) string {
	for i := 0; i+1 < len(node.Content); i += 2 {
		switch node.Content[i].Value {
		case "command":
			return "command.mapping"
		case "metric":
			return "metric.mapping"
		}
	}
	return "mapping"
}

func snippetEnumField(key string, parentKey string) (string, bool) {
	switch key {
	case "adapterKind":
		return "sources[].adapterKind", true
	case "valueType":
		return "sources[].devices[].metrics[].valueType", true
	case "command":
		return "sources[].devices[].commands[].command", true
	case "registerType":
		if parentKey == "command.mapping" {
			return "sources[].devices[].commands[].mapping.registerType", true
		}
	case "conditionType":
		return "alarms[].conditionType", true
	case "severity":
		return "alarms[].severity", true
	case "level":
		if parentKey == "logging" {
			return "logging.level", true
		}
	}

	return "", false
}

func scalarString(node *yaml.Node) (string, error) {
	if node.Kind != yaml.ScalarNode {
		return "", fmt.Errorf("got YAML node kind %d", node.Kind)
	}
	return strings.TrimSpace(node.Value), nil
}

func deindentYAML(raw string) string {
	lines := strings.Split(strings.Trim(raw, "\r\n"), "\n")
	minIndent := -1
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			continue
		}
		indent := len(line) - len(strings.TrimLeft(line, " \t"))
		if minIndent == -1 || indent < minIndent {
			minIndent = indent
		}
	}
	if minIndent <= 0 {
		return strings.Join(lines, "\n")
	}

	for i, line := range lines {
		if strings.TrimSpace(line) == "" {
			continue
		}
		if len(line) >= minIndent {
			lines[i] = line[minIndent:]
		}
	}
	return strings.Join(lines, "\n")
}

func enumProbeYAML(field string, value string) (string, error) {
	switch field {
	case "sources[].adapterKind":
		return minimalConfigYAML(value, "number", "set_number", "high", "warning", "info"), nil
	case "sources[].devices[].metrics[].valueType":
		command := "set_number"
		condition := "high"
		if value == "boolean" {
			command = "set_bool"
			condition = "state"
		}
		return minimalConfigYAML(source.ModbusRTUKind, value, command, condition, "warning", "info"), nil
	case "sources[].devices[].commands[].command":
		valueType := "number"
		condition := "high"
		if value == "set_bool" {
			valueType = "boolean"
			condition = "state"
		}
		return minimalConfigYAML(source.ModbusRTUKind, valueType, value, condition, "warning", "info"), nil
	case "sources[].devices[].commands[].mapping.registerType":
		return minimalConfigWithCommandRegisterType(value), nil
	case "alarms[].conditionType":
		valueType := "number"
		command := "set_number"
		if value == "state" {
			valueType = "boolean"
			command = "set_bool"
		}
		return minimalConfigYAML(source.ModbusRTUKind, valueType, command, value, "warning", "info"), nil
	case "alarms[].severity":
		return minimalConfigYAML(source.ModbusRTUKind, "number", "set_number", "high", value, "info"), nil
	case "logging.level":
		return minimalConfigYAML(source.ModbusRTUKind, "number", "set_number", "high", "warning", value), nil
	default:
		return "", fmt.Errorf("unsupported helper enum field %q", field)
	}
}

func minimalConfigWithCommandRegisterType(registerType string) string {
	body := minimalConfigYAML(source.ModbusRTUKind, "boolean", "set_bool", "state", "warning", "info")
	return strings.Replace(body, "registerType: holding", "registerType: "+registerType, 1)
}

func minimalConfigYAML(adapterKind string, metricValueType string, commandType string, alarmCondition string, alarmSeverity string, loggingLevel string) string {
	metricName := "actual_value"
	commandRange := "            min: 0\n            max: 255\n"
	alarmBody := strings.TrimPrefix(`
  - ruleId: helper_alarm
    enabled: true
    sourceId: arduino_stand
    deviceId: environment
    metric: actual_value
    conditionType: high
    triggerThreshold: 55.0
    clearThreshold: 50.0
    severity: warning
    label: "Helper alarm"
`, "\n")

	if commandType == "set_bool" || metricValueType == "boolean" || alarmCondition == "state" {
		metricName = "actual_state"
		commandRange = ""
	}

	switch alarmCondition {
	case "high":
		alarmBody = strings.TrimPrefix(fmt.Sprintf(`
  - ruleId: helper_alarm
    enabled: true
    sourceId: arduino_stand
    deviceId: environment
    metric: %s
    conditionType: high
    triggerThreshold: 55.0
    clearThreshold: 50.0
    severity: %s
    label: "Helper alarm"
`, metricName, alarmSeverity), "\n")
	case "low":
		alarmBody = strings.TrimPrefix(fmt.Sprintf(`
  - ruleId: helper_alarm
    enabled: true
    sourceId: arduino_stand
    deviceId: environment
    metric: %s
    conditionType: low
    triggerThreshold: 45.0
    clearThreshold: 50.0
    severity: %s
    label: "Helper alarm"
`, metricName, alarmSeverity), "\n")
	case "state":
		alarmBody = strings.TrimPrefix(fmt.Sprintf(`
  - ruleId: helper_alarm
    enabled: true
    sourceId: arduino_stand
    deviceId: environment
    metric: %s
    conditionType: state
    expectedValue: true
    severity: %s
    label: "Helper alarm"
`, metricName, alarmSeverity), "\n")
	case "connectivity":
		alarmBody = strings.TrimPrefix(fmt.Sprintf(`
  - ruleId: helper_alarm
    enabled: true
    sourceId: arduino_stand
    deviceId: environment
    metric: %s
    conditionType: connectivity
    severity: %s
    label: "Helper alarm"
`, metricName, alarmSeverity), "\n")
	default:
		alarmBody = strings.TrimPrefix(fmt.Sprintf(`
  - ruleId: helper_alarm
    enabled: true
    sourceId: arduino_stand
    deviceId: environment
    metric: %s
    conditionType: %s
    severity: %s
    label: "Helper alarm"
`, metricName, alarmCondition, alarmSeverity), "\n")
	}

	return fmt.Sprintf(`runtime:
  edgeId: helper-edge
  stateDir: ./helper-state
  instanceName: helper-edge

cloud:
  url: http://helper-cloud.invalid
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
  - sourceId: arduino_stand
    adapterKind: %s
    enabled: true
    pollIntervalMs: 1000
    connection:
      port: replace-with-serial-port
      baudRate: 9600
      dataBits: 8
      parity: none
      stopBits: 1
      slaveId: 1
      timeoutMs: 500
      settleDelayMs: 2000
    devices:
      - deviceId: environment
        address:
          node: 1
        metrics:
          - metric: %s
            valueType: %s
            mapping:
              registerType: input
              address: 1
              scale: 0.1
        commands:
          - command: %s
            mapping:
              registerType: holding
              address: 160
%s            reportedMetric: %s

alarms:
%s
logging:
  level: %s
`, adapterKind, metricName, metricValueType, commandType, commandRange, metricName, alarmBody, loggingLevel)
}
