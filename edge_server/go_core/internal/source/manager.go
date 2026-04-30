package source

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"sync"
)

type Manager struct {
	mu        sync.RWMutex
	factories FactoryRegistry
	sources   map[string]*managedSource
	inFlight  map[string]struct{}
	readings  chan Reading
	faults    chan Fault
}

type managedSource struct {
	signature string
	adapter   Adapter
	control   MockControl
	identity  map[string]struct{}
	commands  map[string]struct{}
	health    SourceHealthSnapshot
}

type managerSink struct {
	manager  *Manager
	sourceID string
}

func NewManager(factories FactoryRegistry) *Manager {
	clonedFactories := make(FactoryRegistry, len(factories))
	for kind, factory := range factories {
		clonedFactories[kind] = factory
	}

	return &Manager{
		factories: clonedFactories,
		sources:   make(map[string]*managedSource),
		inFlight:  make(map[string]struct{}),
		readings:  make(chan Reading, 64),
		faults:    make(chan Fault, 64),
	}
}

func (m *Manager) ApplyDefinitions(definitions []Definition) (ApplyReport, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	report := ApplyReport{}
	nextSources := make(map[string]*managedSource, len(definitions))
	closedSources := make(map[string]struct{})

	for _, rawDefinition := range definitions {
		definition := cloneDefinition(rawDefinition)
		sourceID := strings.TrimSpace(definition.SourceID)
		if sourceID == "" {
			return report, fmt.Errorf("source definition sourceId is required")
		}
		definition.SourceID = sourceID

		adapterKind := strings.TrimSpace(definition.AdapterKind)
		if adapterKind == "" {
			return report, fmt.Errorf("source definition %s adapterKind is required", sourceID)
		}
		definition.AdapterKind = adapterKind

		existing := m.sources[sourceID]
		if !definition.Enabled {
			if existing != nil {
				_ = existing.adapter.Close()
				closedSources[sourceID] = struct{}{}
				report.Stopped = append(report.Stopped, sourceID)
			}
			continue
		}

		signature, err := definitionSignature(definition)
		if err != nil {
			return report, fmt.Errorf("calculate definition signature for %s: %w", sourceID, err)
		}

		if existing != nil && existing.signature == signature {
			nextSources[sourceID] = existing
			report.Reused = append(report.Reused, sourceID)
			continue
		}

		identities, err := readingIdentities(definition)
		if err != nil {
			return report, fmt.Errorf("validate reading identities for %s: %w", sourceID, err)
		}
		commandIdentities, err := commandIdentities(definition)
		if err != nil {
			return report, fmt.Errorf("validate command identities for %s: %w", sourceID, err)
		}

		factory := m.factories[definition.AdapterKind]
		if factory == nil {
			return report, fmt.Errorf("source adapter kind %q is not registered", definition.AdapterKind)
		}

		adapter, err := factory()
		if err != nil {
			return report, fmt.Errorf("create source adapter for %s: %w", sourceID, err)
		}

		sink := managerSink{
			manager:  m,
			sourceID: sourceID,
		}
		if err := adapter.ApplyDefinition(definition, sink); err != nil {
			_ = adapter.Close()
			return report, fmt.Errorf("apply source definition %s: %w", sourceID, err)
		}

		if existing != nil {
			_ = existing.adapter.Close()
			closedSources[sourceID] = struct{}{}
		}

		managed := &managedSource{
			signature: signature,
			adapter:   adapter,
			identity:  identities,
			commands:  commandIdentities,
			health: SourceHealthSnapshot{
				SourceID: sourceID,
				State:    SourceHealthRunning,
			},
		}
		if control, ok := adapter.(MockControl); ok {
			managed.control = control
		}

		nextSources[sourceID] = managed
		report.Applied = append(report.Applied, sourceID)
	}

	for sourceID, existing := range m.sources {
		if _, kept := nextSources[sourceID]; kept {
			continue
		}
		if _, alreadyClosed := closedSources[sourceID]; alreadyClosed {
			continue
		}

		_ = existing.adapter.Close()
		report.Stopped = append(report.Stopped, sourceID)
	}

	m.sources = nextSources
	sort.Strings(report.Applied)
	sort.Strings(report.Reused)
	sort.Strings(report.Stopped)

	return report, nil
}

func (m *Manager) Readings() <-chan Reading {
	return m.readings
}

func (m *Manager) Faults() <-chan Fault {
	return m.faults
}

func (m *Manager) MockControl(sourceID string) (MockControl, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	managed := m.sources[strings.TrimSpace(sourceID)]
	if managed == nil {
		return nil, fmt.Errorf("source %q is not configured", strings.TrimSpace(sourceID))
	}
	if managed.control == nil {
		return nil, fmt.Errorf("source %q does not expose mock control", strings.TrimSpace(sourceID))
	}

	return managed.control, nil
}

func (m *Manager) ExecuteCommand(ctx context.Context, request CommandRequest) (CommandResult, error) {
	if ctx == nil {
		ctx = context.Background()
	}

	normalized := CommandRequest{
		DeviceID: strings.TrimSpace(request.DeviceID),
		Command:  strings.TrimSpace(request.Command),
		Value:    request.Value,
	}
	result := CommandResult{
		DeviceID: normalized.DeviceID,
		Command:  normalized.Command,
		Status:   CommandStatusFailed,
	}
	if normalized.DeviceID == "" {
		result.Reason = "deviceId is required"
		return result, nil
	}
	if normalized.Command == "" {
		result.Reason = "command is required"
		return result, nil
	}

	key := commandIdentityKey(normalized.DeviceID, normalized.Command)
	adapter, ok, busy := m.reserveCommandTarget(key)
	if busy {
		result.Reason = "command target is busy"
		return result, nil
	}
	if !ok {
		result.Reason = "command target is not configured"
		return result, nil
	}
	defer m.releaseCommandTarget(key)

	commandAdapter, ok := adapter.(CommandCapable)
	if !ok {
		result.Reason = "source adapter is not command-capable"
		return result, nil
	}

	delegatedResult, err := commandAdapter.ExecuteCommand(ctx, normalized)
	if delegatedResult.DeviceID == "" {
		delegatedResult.DeviceID = normalized.DeviceID
	}
	if delegatedResult.Command == "" {
		delegatedResult.Command = normalized.Command
	}
	if err != nil {
		delegatedResult.Status = CommandStatusFailed
		delegatedResult.Reason = err.Error()
		return delegatedResult, nil
	}
	if delegatedResult.Status == "" {
		delegatedResult.Status = CommandStatusFailed
		delegatedResult.Reason = "source adapter returned empty command status"
	}

	return delegatedResult, nil
}

func (m *Manager) reserveCommandTarget(key string) (Adapter, bool, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()

	for _, managed := range m.sources {
		if _, exists := managed.commands[key]; !exists {
			continue
		}
		if _, busy := m.inFlight[key]; busy {
			return nil, true, true
		}
		m.inFlight[key] = struct{}{}
		return managed.adapter, true, false
	}

	return nil, false, false
}

func (m *Manager) releaseCommandTarget(key string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	delete(m.inFlight, key)
}

func (m *Manager) HealthSnapshot() map[string]SourceHealthSnapshot {
	m.mu.RLock()
	defer m.mu.RUnlock()

	snapshot := make(map[string]SourceHealthSnapshot, len(m.sources))
	for sourceID, managed := range m.sources {
		snapshot[sourceID] = managed.health
	}

	return snapshot
}

func (s managerSink) PublishReading(reading RawReading) {
	if s.manager == nil {
		return
	}

	normalized, err := NormalizeReading(s.sourceID, reading)
	if err != nil {
		return
	}
	if !s.manager.acceptReading(normalized) {
		return
	}
	if !s.manager.markReading(normalized) {
		return
	}

	s.manager.readings <- normalized
}

func (s managerSink) PublishFault(fault Fault) {
	if s.manager == nil {
		return
	}

	normalized, err := NormalizeFault(s.sourceID, fault)
	if err != nil {
		return
	}
	if !s.manager.markFault(normalized) {
		return
	}

	s.manager.faults <- normalized
}

func (m *Manager) acceptReading(reading Reading) bool {
	m.mu.RLock()
	defer m.mu.RUnlock()

	managed := m.sources[reading.SourceID]
	if managed == nil {
		return false
	}
	_, ok := managed.identity[readingIdentityKey(reading.DeviceID, reading.Metric)]
	return ok
}

func (m *Manager) markReading(reading Reading) bool {
	m.mu.Lock()
	defer m.mu.Unlock()

	managed := m.sources[reading.SourceID]
	if managed == nil {
		return false
	}
	managed.health.State = SourceHealthRunning
	managed.health.LastReadingAt = reading.TS
	managed.health.ConsecutiveFaults = 0
	return true
}

func (m *Manager) markFault(fault Fault) bool {
	m.mu.Lock()
	defer m.mu.Unlock()

	managed := m.sources[fault.SourceID]
	if managed == nil {
		return false
	}
	if fault.Severity == SeverityWarning {
		managed.health.State = SourceHealthDegraded
	} else {
		managed.health.State = SourceHealthFailed
	}
	managed.health.LastFaultCode = fault.Code
	managed.health.LastFaultAt = fault.TS
	managed.health.ConsecutiveFaults++
	return true
}

func definitionSignature(definition Definition) (string, error) {
	payload, err := json.Marshal(definition)
	if err != nil {
		return "", err
	}

	return string(payload), nil
}

func readingIdentities(definition Definition) (map[string]struct{}, error) {
	if len(definition.Devices) == 0 {
		return nil, fmt.Errorf("devices must not be empty")
	}

	identities := make(map[string]struct{})
	for deviceIndex, device := range definition.Devices {
		deviceID := strings.TrimSpace(device.DeviceID)
		if deviceID == "" {
			return nil, fmt.Errorf("devices[%d].deviceId is required", deviceIndex)
		}
		if len(device.Metrics) == 0 {
			return nil, fmt.Errorf("devices[%d].metrics must not be empty", deviceIndex)
		}
		for metricIndex, metric := range device.Metrics {
			metricID := strings.TrimSpace(metric.Metric)
			if metricID == "" {
				return nil, fmt.Errorf("devices[%d].metrics[%d].metric is required", deviceIndex, metricIndex)
			}
			if metric.ValueType != "number" && metric.ValueType != "boolean" {
				return nil, fmt.Errorf("devices[%d].metrics[%d].valueType must be number or boolean", deviceIndex, metricIndex)
			}
			key := readingIdentityKey(deviceID, metricID)
			if _, exists := identities[key]; exists {
				return nil, fmt.Errorf("duplicate deviceId+metric identity %q/%q", deviceID, metricID)
			}
			identities[key] = struct{}{}
		}
	}

	return identities, nil
}

func readingIdentityKey(deviceID string, metric string) string {
	return strings.TrimSpace(deviceID) + "\x00" + strings.TrimSpace(metric)
}

func commandIdentities(definition Definition) (map[string]struct{}, error) {
	identities := make(map[string]struct{})
	for deviceIndex, device := range definition.Devices {
		deviceID := strings.TrimSpace(device.DeviceID)
		if deviceID == "" {
			return nil, fmt.Errorf("devices[%d].deviceId is required", deviceIndex)
		}

		deviceCommands := make(map[string]struct{}, len(device.Commands))
		for commandIndex, command := range device.Commands {
			commandType := strings.TrimSpace(command.Command)
			if commandType == "" {
				return nil, fmt.Errorf("devices[%d].commands[%d].command is required", deviceIndex, commandIndex)
			}
			if _, exists := deviceCommands[commandType]; exists {
				return nil, fmt.Errorf("duplicate command %q for device %q", commandType, deviceID)
			}
			deviceCommands[commandType] = struct{}{}

			key := commandIdentityKey(deviceID, commandType)
			if _, exists := identities[key]; exists {
				return nil, fmt.Errorf("duplicate deviceId+command identity %q/%q", deviceID, commandType)
			}
			identities[key] = struct{}{}
		}
	}

	return identities, nil
}

func commandIdentityKey(deviceID string, command string) string {
	return strings.TrimSpace(deviceID) + "\x00" + strings.TrimSpace(command)
}
