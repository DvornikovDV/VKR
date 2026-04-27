package runtime

import (
	"fmt"

	"edge_server/go_core/internal/cloud"
)

type trustSessionFlow struct {
	runner *Runner
}

func newTrustSessionFlow(runner *Runner) trustSessionFlow {
	return trustSessionFlow{runner: runner}
}

func (f trustSessionFlow) HandleSuccessfulConnect(auth cloud.HandshakeAuth) error {
	if f.runner == nil {
		return nil
	}

	return f.runner.ActivateTrustedSession(auth.EdgeID, auth.CredentialSecret)
}

func (f trustSessionFlow) HandleDisconnect(event cloud.EdgeDisconnect) bool {
	if f.runner == nil {
		return false
	}

	reason := string(event.Reason)
	snapshot := f.runner.StateSnapshot()
	if !snapshot.Trusted && !snapshot.Connected && snapshot.LastReason != nil && *snapshot.LastReason == reason {
		return false
	}

	if event.RequiresCredentialReset() {
		if err := f.runner.MarkUntrusted(reason, true); err != nil {
			f.runner.reportAsyncError(fmt.Errorf("persist runtime state after credential reset: %w", err))
		}
		return true
	}

	if err := f.runner.MarkDisconnected(reason); err != nil {
		f.runner.reportAsyncError(fmt.Errorf("persist runtime state after disconnect: %w", err))
	}
	return true
}

func (f trustSessionFlow) HandleConnectError(code cloud.ConnectErrorCode) {
	if f.runner == nil {
		return
	}

	if err := f.runner.MarkUntrusted(string(code), true); err != nil {
		f.runner.reportAsyncError(fmt.Errorf("persist runtime state after connect error: %w", err))
	}
}
