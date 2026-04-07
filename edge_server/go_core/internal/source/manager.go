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

		if existing != nil {
			_ = existing.adapter.Close()
			closedSources[sourceID] = struct{}{}
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

		managed := &managedSource{
			signature: signature,
			adapter:   adapter,
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

func (s managerSink) PublishReading(reading RawReading) {
	if s.manager == nil {
		return
	}

	normalized, err := NormalizeReading(s.sourceID, reading)
	if err != nil {
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

	s.manager.faults <- normalized
}

func definitionSignature(definition Definition) (string, error) {
	payload, err := json.Marshal(definition)
	if err != nil {
		return "", err
	}

	return string(payload), nil
}
