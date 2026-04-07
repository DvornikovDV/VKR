package mockadapter

import (
	"fmt"
	"strings"
	"sync"

	"edge_server/go_core/internal/source"
)

const Kind = "mock"

type Adapter struct {
	mu         sync.RWMutex
	sourceID   string
	sink       source.Sink
	applyCount int
	closed     bool
}

func New() *Adapter {
	return &Adapter{}
}

func (a *Adapter) ApplyDefinition(definition source.Definition, sink source.Sink) error {
	sourceID := strings.TrimSpace(definition.SourceID)
	if sourceID == "" {
		return fmt.Errorf("mock adapter sourceId is required")
	}
	if strings.TrimSpace(definition.AdapterKind) != Kind {
		return fmt.Errorf("mock adapter requires adapterKind %q", Kind)
	}
	if sink == nil {
		return fmt.Errorf("mock adapter sink is required")
	}

	a.mu.Lock()
	defer a.mu.Unlock()

	a.sourceID = sourceID
	a.sink = sink
	a.applyCount++
	a.closed = false

	return nil
}

func (a *Adapter) Close() error {
	a.mu.Lock()
	defer a.mu.Unlock()

	a.closed = true
	return nil
}

func (a *Adapter) EmitReading(reading source.RawReading) error {
	a.mu.RLock()
	defer a.mu.RUnlock()

	if err := a.ensureReady(); err != nil {
		return err
	}

	a.sink.PublishReading(source.RawReading{
		SourceID: a.sourceID,
		DeviceID: reading.DeviceID,
		Metric:   reading.Metric,
		Value:    reading.Value,
		TS:       reading.TS,
		Metadata: sourceCloneMap(reading.Metadata),
	})

	return nil
}

func (a *Adapter) EmitFault(fault source.Fault) error {
	a.mu.RLock()
	defer a.mu.RUnlock()

	if err := a.ensureReady(); err != nil {
		return err
	}

	a.sink.PublishFault(source.Fault{
		SourceID: a.sourceID,
		Severity: fault.Severity,
		Code:     fault.Code,
		Message:  fault.Message,
		TS:       fault.TS,
	})

	return nil
}

func (a *Adapter) ApplyCount() int {
	a.mu.RLock()
	defer a.mu.RUnlock()

	return a.applyCount
}

func (a *Adapter) ensureReady() error {
	if a.closed {
		return fmt.Errorf("mock adapter is closed")
	}
	if strings.TrimSpace(a.sourceID) == "" || a.sink == nil {
		return fmt.Errorf("mock adapter definition is not applied")
	}

	return nil
}

func sourceCloneMap(input map[string]any) map[string]any {
	if len(input) == 0 {
		return nil
	}

	cloned := make(map[string]any, len(input))
	for key, value := range input {
		cloned[key] = value
	}

	return cloned
}
