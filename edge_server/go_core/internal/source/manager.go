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
	applyMu   sync.Mutex
	mu        sync.RWMutex
	factories FactoryRegistry
	sources   map[string]*managedSource
	inFlight  map[string]struct{}
	readings  chan Reading
	faults    chan Fault
}

type managedSource struct {
	signature  string
	adapter    Adapter
	control    MockControl
	generation *sourceGeneration
	identity   map[string]struct{}
	commands   map[string]struct{}
	health     SourceHealthSnapshot
}

type managerSink struct {
	manager    *Manager
	sourceID   string
	generation *sourceGeneration
}

type sourceGeneration struct {
	ready     chan struct{}
	done      chan struct{}
	readyOnce sync.Once
	doneOnce  sync.Once
}

func newSourceGeneration() *sourceGeneration {
	return &sourceGeneration{
		ready: make(chan struct{}),
		done:  make(chan struct{}),
	}
}

func (g *sourceGeneration) activate() {
	g.readyOnce.Do(func() {
		close(g.ready)
	})
}

func (g *sourceGeneration) deactivate() {
	g.doneOnce.Do(func() {
		close(g.done)
	})
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
	m.applyMu.Lock()
	defer m.applyMu.Unlock()

	report := ApplyReport{}
	nextSources := make(map[string]*managedSource, len(definitions))
	closedSources := make(map[string]struct{})
	adaptersToClose := make([]Adapter, 0)
	startedAdapters := make([]Adapter, 0)
	startedGenerations := make([]*sourceGeneration, 0)

	m.mu.RLock()
	currentSources := make(map[string]*managedSource, len(m.sources))
	for sourceID, managed := range m.sources {
		currentSources[sourceID] = managed
	}
	m.mu.RUnlock()

	abort := func(err error) (ApplyReport, error) {
		for _, generation := range startedGenerations {
			generation.deactivate()
		}
		for _, adapter := range startedAdapters {
			_ = adapter.Close()
		}
		return report, err
	}

	for _, rawDefinition := range definitions {
		definition := cloneDefinition(rawDefinition)
		sourceID := strings.TrimSpace(definition.SourceID)
		if sourceID == "" {
			return abort(fmt.Errorf("source definition sourceId is required"))
		}
		definition.SourceID = sourceID

		adapterKind := strings.TrimSpace(definition.AdapterKind)
		if adapterKind == "" {
			return abort(fmt.Errorf("source definition %s adapterKind is required", sourceID))
		}
		definition.AdapterKind = adapterKind

		existing := currentSources[sourceID]
		if !definition.Enabled {
			if existing != nil {
				adaptersToClose = append(adaptersToClose, existing.adapter)
				closedSources[sourceID] = struct{}{}
				report.Stopped = append(report.Stopped, sourceID)
			}
			continue
		}

		signature, err := definitionSignature(definition)
		if err != nil {
			return abort(fmt.Errorf("calculate definition signature for %s: %w", sourceID, err))
		}

		if existing != nil && existing.signature == signature {
			nextSources[sourceID] = existing
			report.Reused = append(report.Reused, sourceID)
			continue
		}

		identities, err := readingIdentities(definition)
		if err != nil {
			return abort(fmt.Errorf("validate reading identities for %s: %w", sourceID, err))
		}
		commandIdentities, err := commandIdentities(definition)
		if err != nil {
			return abort(fmt.Errorf("validate command identities for %s: %w", sourceID, err))
		}

		factory := m.factories[definition.AdapterKind]
		if factory == nil {
			return abort(fmt.Errorf("source adapter kind %q is not registered", definition.AdapterKind))
		}

		adapter, err := factory()
		if err != nil {
			return abort(fmt.Errorf("create source adapter for %s: %w", sourceID, err))
		}

		generation := newSourceGeneration()
		sink := managerSink{
			manager:    m,
			sourceID:   sourceID,
			generation: generation,
		}
		if err := adapter.ApplyDefinition(definition, sink); err != nil {
			_ = adapter.Close()
			return abort(fmt.Errorf("apply source definition %s: %w", sourceID, err))
		}
		startedAdapters = append(startedAdapters, adapter)
		startedGenerations = append(startedGenerations, generation)

		if existing != nil {
			adaptersToClose = append(adaptersToClose, existing.adapter)
			closedSources[sourceID] = struct{}{}
		}

		managed := &managedSource{
			signature:  signature,
			adapter:    adapter,
			generation: generation,
			identity:   identities,
			commands:   commandIdentities,
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

	for sourceID, existing := range currentSources {
		if _, kept := nextSources[sourceID]; kept {
			continue
		}
		if _, alreadyClosed := closedSources[sourceID]; alreadyClosed {
			continue
		}

		adaptersToClose = append(adaptersToClose, existing.adapter)
		report.Stopped = append(report.Stopped, sourceID)
	}

	m.mu.Lock()
	for sourceID, existing := range currentSources {
		if nextSources[sourceID] != existing && existing.generation != nil {
			existing.generation.deactivate()
		}
	}
	m.sources = nextSources
	for _, generation := range startedGenerations {
		generation.activate()
	}
	m.mu.Unlock()

	for _, adapter := range adaptersToClose {
		_ = adapter.Close()
	}

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
	if s.manager == nil || !s.waitUntilActive() {
		return
	}

	normalized, err := NormalizeReading(s.sourceID, reading)
	if err != nil {
		return
	}
	if !s.manager.acceptAndMarkReading(normalized, s.generation) {
		return
	}

	select {
	case s.manager.readings <- normalized:
	case <-s.generation.done:
	}
}

func (s managerSink) PublishFault(fault Fault) {
	if s.manager == nil || !s.waitUntilActive() {
		return
	}

	normalized, err := NormalizeFault(s.sourceID, fault)
	if err != nil {
		return
	}
	if !s.manager.markFault(normalized, s.generation) {
		return
	}

	select {
	case s.manager.faults <- normalized:
	case <-s.generation.done:
	default:
	}
}

func (s managerSink) waitUntilActive() bool {
	if s.generation == nil {
		return true
	}

	select {
	case <-s.generation.ready:
		return true
	case <-s.generation.done:
		return false
	}
}

func (m *Manager) acceptAndMarkReading(reading Reading, generation *sourceGeneration) bool {
	m.mu.Lock()
	defer m.mu.Unlock()

	managed := m.sources[reading.SourceID]
	if managed == nil || managed.generation != generation {
		return false
	}
	if _, ok := managed.identity[readingIdentityKey(reading.DeviceID, reading.Metric)]; !ok {
		return false
	}
	managed.health.State = SourceHealthRunning
	managed.health.LastReadingAt = reading.TS
	managed.health.ConsecutiveFaults = 0
	return true
}

func (m *Manager) markFault(fault Fault, generation *sourceGeneration) bool {
	m.mu.Lock()
	defer m.mu.Unlock()

	managed := m.sources[fault.SourceID]
	if managed == nil || managed.generation != generation {
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
