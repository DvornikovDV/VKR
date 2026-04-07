package cloud

import (
	"fmt"
	"strings"

	"edge_server/go_core/internal/source"
)

type telemetryEmitter interface {
	Emit(event string, payload any) error
}

type TelemetryClient struct {
	emitter telemetryEmitter
}

type TelemetryPayload struct {
	Readings []TelemetryReading `json:"readings"`
}

type TelemetryReading struct {
	DeviceID string `json:"deviceId"`
	Metric   string `json:"metric"`
	Value    any    `json:"value"`
	TS       int64  `json:"ts"`
}

func NewTelemetryClient(emitter telemetryEmitter) (*TelemetryClient, error) {
	if emitter == nil {
		return nil, fmt.Errorf("telemetry emitter is required")
	}

	return &TelemetryClient{emitter: emitter}, nil
}

func (c *TelemetryClient) EmitReadings(readings []source.Reading) error {
	if c == nil || c.emitter == nil {
		return fmt.Errorf("telemetry client is not configured")
	}
	if len(readings) == 0 {
		return nil
	}

	canonical := make([]TelemetryReading, 0, len(readings))
	for _, reading := range readings {
		normalized, err := normalizeTelemetryReading(reading)
		if err != nil {
			return err
		}
		canonical = append(canonical, normalized)
	}

	return c.emitter.Emit("telemetry", TelemetryPayload{Readings: canonical})
}

func normalizeTelemetryReading(reading source.Reading) (TelemetryReading, error) {
	deviceID := strings.TrimSpace(reading.DeviceID)
	if deviceID == "" {
		return TelemetryReading{}, fmt.Errorf("telemetry reading deviceId is required")
	}

	metric := strings.TrimSpace(reading.Metric)
	if metric == "" {
		return TelemetryReading{}, fmt.Errorf("telemetry reading metric is required")
	}

	if reading.TS <= 0 {
		return TelemetryReading{}, fmt.Errorf("telemetry reading ts must be positive")
	}

	value, err := normalizeTelemetryValue(reading.Value)
	if err != nil {
		return TelemetryReading{}, err
	}

	return TelemetryReading{
		DeviceID: deviceID,
		Metric:   metric,
		Value:    value,
		TS:       reading.TS,
	}, nil
}

func normalizeTelemetryValue(value any) (any, error) {
	switch typed := value.(type) {
	case bool:
		return typed, nil
	case float64:
		return typed, nil
	case float32:
		return float64(typed), nil
	case int:
		return float64(typed), nil
	case int8:
		return float64(typed), nil
	case int16:
		return float64(typed), nil
	case int32:
		return float64(typed), nil
	case int64:
		return float64(typed), nil
	case uint:
		return float64(typed), nil
	case uint8:
		return float64(typed), nil
	case uint16:
		return float64(typed), nil
	case uint32:
		return float64(typed), nil
	case uint64:
		return float64(typed), nil
	default:
		return nil, fmt.Errorf("telemetry reading value must be number or boolean")
	}
}
