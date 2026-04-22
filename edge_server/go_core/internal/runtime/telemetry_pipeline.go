package runtime

import (
	"context"
	"fmt"
	"time"

	"edge_server/go_core/internal/cloud"
	"edge_server/go_core/internal/operator"
	"edge_server/go_core/internal/source"
)

type TelemetryPipelineConfig struct {
	Readings      <-chan source.Reading
	IntervalMs    int
	MaxReadings   int
	Client        *cloud.TelemetryClient
	StateSnapshot func() SessionStateSnapshot
	OnEmitSuccess func(time.Time) error
	OnAsyncError  func(error)
}

type TelemetryPipeline struct {
	readings      <-chan source.Reading
	interval      time.Duration
	client        *cloud.TelemetryClient
	batcher       *telemetryBatcher
	stateSnapshot func() SessionStateSnapshot
	onEmitSuccess func(time.Time) error
	onAsyncError  func(error)
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
		onEmitSuccess: cfg.OnEmitSuccess,
		onAsyncError:  cfg.OnAsyncError,
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
			snapshot, eligible := p.eligibleSnapshot()
			if !eligible {
				p.batcher.Reset()
				continue
			}
			p.flush(snapshot)
		case reading, ok := <-readings:
			if !ok {
				return
			}

			snapshot, eligible := p.eligibleSnapshot()
			if !eligible {
				continue
			}

			if p.batcher.Add(snapshot.SessionEpoch, reading) {
				p.flush(snapshot)
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

func (p *TelemetryPipeline) eligibleSnapshot() (SessionStateSnapshot, bool) {
	snapshot := p.stateSnapshot()
	_, discard := operator.MapTelemetryDiscardState(snapshot.Trusted, snapshot.Connected)
	if discard || snapshot.SessionEpoch == 0 {
		return snapshot, false
	}

	return snapshot, true
}

func (p *TelemetryPipeline) flush(snapshot SessionStateSnapshot) {
	if !p.batcher.HasPending() {
		return
	}

	if !p.batcher.Matches(snapshot.SessionEpoch) {
		p.batcher.Reset()
		return
	}

	pending := p.batcher.Snapshot(snapshot.SessionEpoch)
	if len(pending) == 0 {
		return
	}

	if err := p.client.EmitReadings(pending); err != nil {
		return
	}
	if p.onEmitSuccess != nil {
		if err := p.onEmitSuccess(time.Now().UTC()); err != nil && p.onAsyncError != nil {
			p.onAsyncError(err)
		}
	}

	p.batcher.Reset()
}
