package runtime

import (
	"fmt"

	"edge_server/go_core/internal/source"
)

type telemetryBatcher struct {
	maxReadings int
	pending     []source.Reading
}

func newTelemetryBatcher(maxReadings int) (*telemetryBatcher, error) {
	if maxReadings <= 0 {
		return nil, fmt.Errorf("telemetry batch maxReadings must be positive")
	}

	return &telemetryBatcher{
		maxReadings: maxReadings,
		pending:     make([]source.Reading, 0, maxReadings),
	}, nil
}

func (b *telemetryBatcher) Add(reading source.Reading) bool {
	b.pending = append(b.pending, reading)
	return len(b.pending) >= b.maxReadings
}

func (b *telemetryBatcher) HasPending() bool {
	return len(b.pending) > 0
}

func (b *telemetryBatcher) Snapshot() []source.Reading {
	if len(b.pending) == 0 {
		return nil
	}

	snapshot := make([]source.Reading, len(b.pending))
	copy(snapshot, b.pending)

	return snapshot
}

func (b *telemetryBatcher) Reset() {
	b.pending = b.pending[:0]
}
