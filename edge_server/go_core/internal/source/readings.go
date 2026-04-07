package source

import (
	"fmt"
	"strings"
)

type Reading struct {
	SourceID string `json:"sourceId"`
	DeviceID string `json:"deviceId"`
	Metric   string `json:"metric"`
	Value    any    `json:"value"`
	TS       int64  `json:"ts"`
}

type RawReading struct {
	SourceID string
	DeviceID string
	Metric   string
	Value    any
	TS       int64
	Metadata map[string]any
}

type FaultSeverity string

const (
	SeverityWarning FaultSeverity = "warning"
	SeverityError   FaultSeverity = "error"
)

type Fault struct {
	SourceID string        `json:"sourceId"`
	Severity FaultSeverity `json:"severity"`
	Code     string        `json:"code"`
	Message  string        `json:"message"`
	TS       int64         `json:"ts"`
}

func NormalizeReading(expectedSourceID string, reading RawReading) (Reading, error) {
	sourceID := strings.TrimSpace(expectedSourceID)
	if sourceID == "" {
		return Reading{}, fmt.Errorf("expected sourceId is required")
	}

	deviceID := strings.TrimSpace(reading.DeviceID)
	if deviceID == "" {
		return Reading{}, fmt.Errorf("reading deviceId is required")
	}

	metric := strings.TrimSpace(reading.Metric)
	if metric == "" {
		return Reading{}, fmt.Errorf("reading metric is required")
	}

	if reading.TS <= 0 {
		return Reading{}, fmt.Errorf("reading ts must be positive")
	}

	value, err := normalizeValue(reading.Value)
	if err != nil {
		return Reading{}, err
	}

	return Reading{
		SourceID: sourceID,
		DeviceID: deviceID,
		Metric:   metric,
		Value:    value,
		TS:       reading.TS,
	}, nil
}

func NormalizeFault(expectedSourceID string, fault Fault) (Fault, error) {
	sourceID := strings.TrimSpace(expectedSourceID)
	if sourceID == "" {
		return Fault{}, fmt.Errorf("expected sourceId is required")
	}

	if fault.Severity != SeverityWarning && fault.Severity != SeverityError {
		return Fault{}, fmt.Errorf("fault severity must be warning or error")
	}
	if strings.TrimSpace(fault.Code) == "" {
		return Fault{}, fmt.Errorf("fault code is required")
	}
	if strings.TrimSpace(fault.Message) == "" {
		return Fault{}, fmt.Errorf("fault message is required")
	}
	if fault.TS <= 0 {
		return Fault{}, fmt.Errorf("fault ts must be positive")
	}

	return Fault{
		SourceID: sourceID,
		Severity: fault.Severity,
		Code:     strings.TrimSpace(fault.Code),
		Message:  strings.TrimSpace(fault.Message),
		TS:       fault.TS,
	}, nil
}

func normalizeValue(value any) (any, error) {
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
		return nil, fmt.Errorf("reading value must be number or boolean")
	}
}
