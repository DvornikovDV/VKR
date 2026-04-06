package runtime

import (
	"context"
	"errors"
)

type Runner struct {
	state *RuntimeState
}

func New() *Runner {
	return &Runner{
		state: NewRuntimeState(),
	}
}

func (r *Runner) StateSnapshot() SessionStateSnapshot {
	return r.state.Snapshot()
}

func (r *Runner) ActivateTrustedSession(edgeID string, persistentSecret string) error {
	return r.state.ActivateTrustedSession(edgeID, persistentSecret)
}

func (r *Runner) MarkDisconnected(reason string) {
	r.state.MarkDisconnected(reason)
}

func (r *Runner) MarkUntrusted(reason string, clearCredential bool) {
	r.state.MarkUntrusted(reason, clearCredential)
}

func (r *Runner) TelemetryAllowed() bool {
	return r.state.TelemetryAllowed()
}

func (r *Runner) Run(ctx context.Context) error {
	if ctx == nil {
		return errors.New("runtime context is required")
	}

	return nil
}
