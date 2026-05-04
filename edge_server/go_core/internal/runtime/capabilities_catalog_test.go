package runtime

import (
	"encoding/json"
	"math"
	"strings"
	"testing"

	"edge_server/go_core/internal/cloud"
	"edge_server/go_core/internal/source"
)

func TestBuildCapabilitiesCatalogFromParsedDefinitionsSanitizesTelemetryAndCommands(t *testing.T) {
	definitions := []source.Definition{
		{
			SourceID:       "source-main",
			AdapterKind:    source.ModbusRTUKind,
			Enabled:        true,
			PollIntervalMs: 500,
			Connection: map[string]any{
				"port":           "COM3",
				"ip":             "192.168.10.5",
				"credentialHint": "secret",
			},
			Devices: []source.DeviceDefinition{
				{
					DeviceID: "pump-main",
					Address:  map[string]any{"node": 7},
					Metrics: []source.MetricDefinition{
						{
							Metric:    "actual_state",
							ValueType: "boolean",
							Mapping:   map[string]any{"registerType": "input", "address": 12},
						},
						{
							Metric:    "target_value",
							ValueType: "number",
							Mapping:   map[string]any{"registerType": "holding", "address": 13},
						},
					},
					Commands: []source.CommandDefinition{
						{
							Command:        "set_bool",
							Mapping:        map[string]any{"registerType": "holding", "address": 160},
							ReportedMetric: "actual_state",
						},
						{
							Command:        "set_number",
							Mapping:        map[string]any{"registerType": "holding", "address": 161},
							Min:            0,
							Max:            255,
							ReportedMetric: "target_value",
						},
					},
				},
			},
		},
		{
			SourceID: "source-disabled",
			Enabled:  false,
			Devices: []source.DeviceDefinition{
				{
					DeviceID: "disabled-device",
					Metrics: []source.MetricDefinition{
						{Metric: "disabled_metric", ValueType: "number"},
					},
					Commands: []source.CommandDefinition{
						{Command: "set_number", ReportedMetric: "disabled_metric", Min: 1, Max: 2},
					},
				},
			},
		},
	}

	catalog, err := BuildCapabilitiesCatalog("edge-main", definitions)
	if err != nil {
		t.Fatalf("build capabilities catalog: %v", err)
	}

	if catalog.EdgeServerID != "edge-main" {
		t.Fatalf("expected edge-main catalog, got %q", catalog.EdgeServerID)
	}
	if len(catalog.Telemetry) != 2 {
		t.Fatalf("expected two telemetry metrics, got %+v", catalog.Telemetry)
	}
	assertTelemetryMetric(t, catalog.Telemetry[0], "pump-main", "actual_state", cloud.CatalogValueTypeBoolean, "pump-main / actual_state")
	assertTelemetryMetric(t, catalog.Telemetry[1], "pump-main", "target_value", cloud.CatalogValueTypeNumber, "pump-main / target_value")

	if len(catalog.Commands) != 2 {
		t.Fatalf("expected two command capabilities, got %+v", catalog.Commands)
	}
	assertCommandCapability(t, catalog.Commands[0], "pump-main", cloud.CommandTypeSetBool, cloud.CatalogValueTypeBoolean, "actual_state", "pump-main / set_bool", nil, nil)
	assertCommandCapability(t, catalog.Commands[1], "pump-main", cloud.CommandTypeSetNumber, cloud.CatalogValueTypeNumber, "target_value", "pump-main / set_number", float64Ptr(0), float64Ptr(255))

	payload, err := json.Marshal(catalog)
	if err != nil {
		t.Fatalf("marshal catalog: %v", err)
	}
	assertCatalogExcludesRawMapping(t, string(payload))
	if !strings.Contains(string(payload), `"commandType":"set_bool"`) || !strings.Contains(string(payload), `"commandType":"set_number"`) {
		t.Fatalf("catalog must expose public commandType fields, got %s", payload)
	}
	if strings.Contains(string(payload), `"command":`) {
		t.Fatalf("catalog must not expose local YAML command field, got %s", payload)
	}
}

func TestBuildCapabilitiesCatalogRejectsNonFiniteCommandRange(t *testing.T) {
	definitions := []source.Definition{
		{
			SourceID: "source-main",
			Enabled:  true,
			Devices: []source.DeviceDefinition{
				{
					DeviceID: "valve-main",
					Metrics: []source.MetricDefinition{
						{Metric: "target_value", ValueType: "number"},
					},
					Commands: []source.CommandDefinition{
						{
							Command:        "set_number",
							ReportedMetric: "target_value",
							Min:            math.Inf(1),
							Max:            255,
						},
					},
				},
			},
		},
	}

	if _, err := BuildCapabilitiesCatalog("edge-main", definitions); err == nil || !strings.Contains(err.Error(), "must be finite") {
		t.Fatalf("expected finite range validation error, got %v", err)
	}
}

func assertTelemetryMetric(t *testing.T, metric cloud.EdgeCatalogTelemetryMetric, deviceID string, metricName string, valueType cloud.CatalogValueType, label string) {
	t.Helper()

	if metric.DeviceID != deviceID || metric.Metric != metricName || metric.ValueType != valueType || metric.Label != label {
		t.Fatalf("unexpected telemetry metric: %+v", metric)
	}
}

func assertCommandCapability(
	t *testing.T,
	capability cloud.EdgeCatalogCommandCapability,
	deviceID string,
	commandType cloud.CommandType,
	valueType cloud.CatalogValueType,
	reportedMetric string,
	label string,
	min *float64,
	max *float64,
) {
	t.Helper()

	if capability.DeviceID != deviceID ||
		capability.CommandType != commandType ||
		capability.ValueType != valueType ||
		capability.ReportedMetric != reportedMetric ||
		capability.Label != label {
		t.Fatalf("unexpected command capability: %+v", capability)
	}
	assertOptionalFloat64(t, "min", capability.Min, min)
	assertOptionalFloat64(t, "max", capability.Max, max)
}

func assertOptionalFloat64(t *testing.T, field string, got *float64, want *float64) {
	t.Helper()

	if got == nil || want == nil {
		if got != nil || want != nil {
			t.Fatalf("expected %s=%v, got %v", field, optionalFloatValue(want), optionalFloatValue(got))
		}
		return
	}
	if *got != *want {
		t.Fatalf("expected %s=%v, got %v", field, *want, *got)
	}
}

func assertCatalogExcludesRawMapping(t *testing.T, payload string) {
	t.Helper()

	for _, forbidden := range []string{
		"mapping",
		"registerType",
		"address",
		"connection",
		"COM3",
		"192.168.10.5",
		"credentialHint",
		"secret",
		"disabled-device",
		"disabled_metric",
	} {
		if strings.Contains(payload, forbidden) {
			t.Fatalf("catalog payload must not expose %q: %s", forbidden, payload)
		}
	}
}

func float64Ptr(value float64) *float64 {
	return &value
}

func optionalFloatValue(value *float64) any {
	if value == nil {
		return nil
	}
	return *value
}
