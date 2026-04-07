package runtime

import (
	"context"
	"fmt"
	"time"

	"edge_server/go_core/internal/cloud"
	"edge_server/go_core/internal/source"
)

type TelemetryPipelineConfig struct {
	Readings      <-chan source.Reading
	IntervalMs    int
	MaxReadings   int
	Client        *cloud.TelemetryClient
	StateSnapshot func() SessionStateSnapshot
}

type TelemetryPipeline struct {
	readings      <-chan source.Reading
	interval      time.Duration
	client        *cloud.TelemetryClient
	batcher       *telemetryBatcher
	stateSnapshot func() SessionStateSnapshot
	resetCh       chan struct{}
}

func NewTelemetryPipeline(cfg TelemetryPipelineConfig) (*TelemetryPipeline, error) {
	if cfg.Readings == nil {
		return nil, fmt.Errorf("telemetry readings channel is required")
	}
	if cfg.IntervalMs <= 0 {
		return nil, fmt.Errorf("telemetry batch intervalMs must be positive")
	}
	if cfg.Client == nil {
		return nil, fmt.Errorf("telemetry client is required")
	}
	if cfg.StateSnapshot == nil {
		return nil, fmt.Errorf("telemetry state snapshot function is required")
	}

	batcher, err := newTelemetryBatcher(cfg.MaxReadings)
	if err != nil {
		return nil, err
	}

	return &TelemetryPipeline{
		readings:      cfg.Readings,
		interval:      time.Duration(cfg.IntervalMs) * time.Millisecond,
		client:        cfg.Client,
		batcher:       batcher,
		stateSnapshot: cfg.StateSnapshot,
		resetCh:       make(chan struct{}, 1),
	}, nil
}

func (p *TelemetryPipeline) Run(ctx context.Context) {
	if p == nil || ctx == nil {
		return
	}

	ticker := time.NewTicker(p.interval)
	defer ticker.Stop()

	readings := p.readings

	for {
		select {
		case <-ctx.Done():
			return
		case <-p.resetCh:
			p.batcher.Reset()
		case <-ticker.C:
			if p.mustDiscardReadings() {
				p.batcher.Reset()
				continue
			}
			p.flush()
		case reading, ok := <-readings:
			if !ok {
				return
			}

			if p.mustDiscardReadings() {
				continue
			}

			if p.batcher.Add(reading) {
				p.flush()
			}
		}
	}
}

func (p *TelemetryPipeline) Reset() {
	if p == nil {
		return
	}

	select {
	case p.resetCh <- struct{}{}:
	default:
	}
}

func (p *TelemetryPipeline) mustDiscardReadings() bool {
	snapshot := p.stateSnapshot()
	return !snapshot.Trusted || !snapshot.Connected
}

func (p *TelemetryPipeline) flush() {
	if !p.batcher.HasPending() {
		return
	}

	pending := p.batcher.Snapshot()
	if err := p.client.EmitReadings(pending); err != nil {
		return
	}

	p.batcher.Reset()
}
