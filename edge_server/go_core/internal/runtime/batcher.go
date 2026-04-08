package runtime

import (
	"fmt"

	"edge_server/go_core/internal/source"
)

type telemetryBatcher struct {
	maxReadings  int
	sessionEpoch uint64
	pending      []source.Reading
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

func (b *telemetryBatcher) Add(sessionEpoch uint64, reading source.Reading) bool {
	if sessionEpoch == 0 {
		b.Reset()
		return false
	}

	if b.sessionEpoch != 0 && b.sessionEpoch != sessionEpoch {
		b.Reset()
	}
	if b.sessionEpoch == 0 {
		b.sessionEpoch = sessionEpoch
	}

	b.pending = append(b.pending, reading)
	return len(b.pending) >= b.maxReadings
}

func (b *telemetryBatcher) HasPending() bool {
	return len(b.pending) > 0
}

func (b *telemetryBatcher) Matches(sessionEpoch uint64) bool {
	return sessionEpoch != 0 && b.sessionEpoch == sessionEpoch
}

func (b *telemetryBatcher) Snapshot(sessionEpoch uint64) []source.Reading {
	if len(b.pending) == 0 || !b.Matches(sessionEpoch) {
		return nil
	}

	snapshot := make([]source.Reading, len(b.pending))
	copy(snapshot, b.pending)

	return snapshot
}

func (b *telemetryBatcher) Reset() {
	b.sessionEpoch = 0
	b.pending = b.pending[:0]
}
