package runtime

import "edge_server/go_core/internal/cloud"

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

	if auth.CredentialMode != cloud.CredentialModePersistent {
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
		f.runner.MarkUntrusted(reason, true)
		return true
	}

	f.runner.MarkDisconnected(reason)
	return true
}

func (f trustSessionFlow) HandleConnectError(code cloud.ConnectErrorCode) {
	if f.runner == nil {
		return
	}

	f.runner.MarkUntrusted(string(code), true)
}
