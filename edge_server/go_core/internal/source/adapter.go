package source

import "edge_server/go_core/internal/config"

type Definition struct {
	SourceID       string
	AdapterKind    string
	Enabled        bool
	PollIntervalMs int
	Connection     map[string]any
	Devices        []DeviceDefinition
}

type DeviceDefinition struct {
	DeviceID string
	Address  map[string]any
	Metrics  []MetricDefinition
	Commands []CommandDefinition
}

type MetricDefinition struct {
	Metric    string
	ValueType string
	Mapping   map[string]any
}

type CommandDefinition struct {
	Command        string
	Mapping        map[string]any
	Min            any
	Max            any
	ReportedMetric string
}

type Sink interface {
	PublishReading(reading RawReading)
	PublishFault(fault Fault)
}

type Adapter interface {
	ApplyDefinition(definition Definition, sink Sink) error
	Close() error
}

type Factory func() (Adapter, error)

type FactoryRegistry map[string]Factory

type MockControl interface {
	EmitReading(reading RawReading) error
	EmitFault(fault Fault) error
	ApplyCount() int
}

type SourceHealthState string

const (
	SourceHealthRunning  SourceHealthState = "running"
	SourceHealthDegraded SourceHealthState = "degraded"
	SourceHealthFailed   SourceHealthState = "failed"
	SourceHealthStopped  SourceHealthState = "stopped"
)

type SourceHealthSnapshot struct {
	SourceID          string
	State             SourceHealthState
	LastReadingAt     int64
	LastFaultCode     string
	LastFaultAt       int64
	ConsecutiveFaults int
}

type ApplyReport struct {
	Applied []string
	Reused  []string
	Stopped []string
}

func DefinitionsFromConfig(definitions []config.PollingSourceDefinition) []Definition {
	converted := make([]Definition, 0, len(definitions))
	for _, definition := range definitions {
		deviceDefinitions := make([]DeviceDefinition, 0, len(definition.Devices))
		for _, device := range definition.Devices {
			metricDefinitions := make([]MetricDefinition, 0, len(device.Metrics))
			for _, metric := range device.Metrics {
				metricDefinitions = append(metricDefinitions, MetricDefinition{
					Metric:    metric.Metric,
					ValueType: metric.ValueType,
					Mapping:   cloneMap(metric.Mapping),
				})
			}
			commandDefinitions := make([]CommandDefinition, 0, len(device.Commands))
			for _, command := range device.Commands {
				commandDefinitions = append(commandDefinitions, CommandDefinition{
					Command:        command.Command,
					Mapping:        cloneMap(command.Mapping),
					Min:            cloneValue(command.Min),
					Max:            cloneValue(command.Max),
					ReportedMetric: command.ReportedMetric,
				})
			}

			deviceDefinitions = append(deviceDefinitions, DeviceDefinition{
				DeviceID: device.DeviceID,
				Address:  cloneMap(device.Address),
				Metrics:  metricDefinitions,
				Commands: commandDefinitions,
			})
		}

		converted = append(converted, Definition{
			SourceID:       definition.SourceID,
			AdapterKind:    definition.AdapterKind,
			Enabled:        definition.Enabled,
			PollIntervalMs: definition.PollIntervalMs,
			Connection:     cloneMap(definition.Connection),
			Devices:        deviceDefinitions,
		})
	}

	return converted
}

func cloneDefinition(definition Definition) Definition {
	return Definition{
		SourceID:       definition.SourceID,
		AdapterKind:    definition.AdapterKind,
		Enabled:        definition.Enabled,
		PollIntervalMs: definition.PollIntervalMs,
		Connection:     cloneMap(definition.Connection),
		Devices:        cloneDeviceDefinitions(definition.Devices),
	}
}

func cloneDeviceDefinitions(devices []DeviceDefinition) []DeviceDefinition {
	cloned := make([]DeviceDefinition, 0, len(devices))
	for _, device := range devices {
		cloned = append(cloned, DeviceDefinition{
			DeviceID: device.DeviceID,
			Address:  cloneMap(device.Address),
			Metrics:  cloneMetricDefinitions(device.Metrics),
			Commands: cloneCommandDefinitions(device.Commands),
		})
	}

	return cloned
}

func cloneMetricDefinitions(metrics []MetricDefinition) []MetricDefinition {
	cloned := make([]MetricDefinition, 0, len(metrics))
	for _, metric := range metrics {
		cloned = append(cloned, MetricDefinition{
			Metric:    metric.Metric,
			ValueType: metric.ValueType,
			Mapping:   cloneMap(metric.Mapping),
		})
	}

	return cloned
}

func cloneCommandDefinitions(commands []CommandDefinition) []CommandDefinition {
	cloned := make([]CommandDefinition, 0, len(commands))
	for _, command := range commands {
		cloned = append(cloned, CommandDefinition{
			Command:        command.Command,
			Mapping:        cloneMap(command.Mapping),
			Min:            cloneValue(command.Min),
			Max:            cloneValue(command.Max),
			ReportedMetric: command.ReportedMetric,
		})
	}

	return cloned
}

func cloneMap(input map[string]any) map[string]any {
	if len(input) == 0 {
		return nil
	}

	cloned := make(map[string]any, len(input))
	for key, value := range input {
		cloned[key] = cloneValue(value)
	}

	return cloned
}

func cloneValue(value any) any {
	switch typed := value.(type) {
	case map[string]any:
		return cloneMap(typed)
	case []any:
		cloned := make([]any, len(typed))
		for i := range typed {
			cloned[i] = cloneValue(typed[i])
		}
		return cloned
	default:
		return typed
	}
}
