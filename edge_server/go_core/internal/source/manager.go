package source

import (
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
	readings  chan Reading
	faults    chan Fault
}

type managedSource struct {
	signature string
	adapter   Adapter
	control   MockControl
	identity  map[string]struct{}
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
