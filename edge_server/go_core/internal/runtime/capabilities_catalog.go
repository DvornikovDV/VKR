package runtime

import (
	"fmt"
	"math"
	"strings"

	"edge_server/go_core/internal/cloud"
	"edge_server/go_core/internal/source"
)

func BuildCapabilitiesCatalog(edgeServerID string, definitions []source.Definition) (cloud.EdgeCapabilitiesCatalog, error) {
	edgeServerID = strings.TrimSpace(edgeServerID)
	if edgeServerID == "" {
		return cloud.EdgeCapabilitiesCatalog{}, fmt.Errorf("edgeServerId is required")
	}

	catalog := cloud.EdgeCapabilitiesCatalog{
		EdgeServerID: edgeServerID,
		Telemetry:    []cloud.EdgeCatalogTelemetryMetric{},
		Commands:     []cloud.EdgeCatalogCommandCapability{},
	}

	for sourceIndex, definition := range definitions {
		if !definition.Enabled {
			continue
		}

		for deviceIndex, device := range definition.Devices {
			deviceID := strings.TrimSpace(device.DeviceID)
			if deviceID == "" {
				return cloud.EdgeCapabilitiesCatalog{}, fmt.Errorf("definitions[%d].devices[%d].deviceId is required", sourceIndex, deviceIndex)
			}

			metricTypes := make(map[string]cloud.CatalogValueType, len(device.Metrics))
			for metricIndex, metric := range device.Metrics {
				metricName := strings.TrimSpace(metric.Metric)
				if metricName == "" {
					return cloud.EdgeCapabilitiesCatalog{}, fmt.Errorf("definitions[%d].devices[%d].metrics[%d].metric is required", sourceIndex, deviceIndex, metricIndex)
				}

				valueType, err := catalogValueType(metric.ValueType)
				if err != nil {
					return cloud.EdgeCapabilitiesCatalog{}, fmt.Errorf("definitions[%d].devices[%d].metrics[%d]: %w", sourceIndex, deviceIndex, metricIndex, err)
				}
				metricTypes[metricName] = valueType

				catalog.Telemetry = append(catalog.Telemetry, cloud.EdgeCatalogTelemetryMetric{
					DeviceID:  deviceID,
					Metric:    metricName,
					ValueType: valueType,
					Label:     telemetryCatalogLabel(deviceID, metricName),
				})
			}

			for commandIndex, command := range device.Commands {
				capability, err := buildCommandCapability(sourceIndex, deviceIndex, commandIndex, deviceID, command, metricTypes)
				if err != nil {
					return cloud.EdgeCapabilitiesCatalog{}, err
				}
				catalog.Commands = append(catalog.Commands, capability)
			}
		}
	}

	return catalog, nil
}

func buildCommandCapability(
	sourceIndex int,
	deviceIndex int,
	commandIndex int,
	deviceID string,
	command source.CommandDefinition,
	metricTypes map[string]cloud.CatalogValueType,
) (cloud.EdgeCatalogCommandCapability, error) {
	field := fmt.Sprintf("definitions[%d].devices[%d].commands[%d]", sourceIndex, deviceIndex, commandIndex)
	commandType := cloud.CommandType(strings.TrimSpace(command.Command))
	if !cloud.IsSupportedCommandType(commandType) {
		return cloud.EdgeCatalogCommandCapability{}, fmt.Errorf("%s.command is not supported", field)
	}

	reportedMetric := strings.TrimSpace(command.ReportedMetric)
	if reportedMetric == "" {
		return cloud.EdgeCatalogCommandCapability{}, fmt.Errorf("%s.reportedMetric is required", field)
	}
	valueType, ok := metricTypes[reportedMetric]
	if !ok {
		return cloud.EdgeCatalogCommandCapability{}, fmt.Errorf("%s.reportedMetric must reference a telemetry metric", field)
	}

	capability := cloud.EdgeCatalogCommandCapability{
		DeviceID:       deviceID,
		CommandType:    commandType,
		ValueType:      valueType,
		ReportedMetric: reportedMetric,
		Label:          commandCatalogLabel(deviceID, commandType),
	}

	switch commandType {
	case cloud.CommandTypeSetBool:
		if valueType != cloud.CatalogValueTypeBoolean {
			return cloud.EdgeCatalogCommandCapability{}, fmt.Errorf("%s.reportedMetric must reference a boolean metric", field)
		}
	case cloud.CommandTypeSetNumber:
		if valueType != cloud.CatalogValueTypeNumber {
			return cloud.EdgeCatalogCommandCapability{}, fmt.Errorf("%s.reportedMetric must reference a number metric", field)
		}
		min, err := finiteOptionalNumber(command.Min, field+".min")
		if err != nil {
			return cloud.EdgeCatalogCommandCapability{}, err
		}
		max, err := finiteOptionalNumber(command.Max, field+".max")
		if err != nil {
			return cloud.EdgeCatalogCommandCapability{}, err
		}
		capability.Min = min
		capability.Max = max
	}

	return capability, nil
}

func catalogValueType(raw string) (cloud.CatalogValueType, error) {
	switch valueType := cloud.CatalogValueType(strings.TrimSpace(raw)); valueType {
	case cloud.CatalogValueTypeBoolean, cloud.CatalogValueTypeNumber, cloud.CatalogValueTypeString:
		return valueType, nil
	default:
		return "", fmt.Errorf("valueType must be boolean, number, or string")
	}
}

func finiteOptionalNumber(raw any, field string) (*float64, error) {
	if raw == nil {
		return nil, nil
	}

	value, ok := numberAsFloat64(raw)
	if !ok {
		return nil, fmt.Errorf("%s must be a number", field)
	}
	if math.IsNaN(value) || math.IsInf(value, 0) {
		return nil, fmt.Errorf("%s must be finite", field)
	}

	return &value, nil
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

func telemetryCatalogLabel(deviceID string, metric string) string {
	return deviceID + " / " + metric
}

func commandCatalogLabel(deviceID string, commandType cloud.CommandType) string {
	return deviceID + " / " + string(commandType)
}
