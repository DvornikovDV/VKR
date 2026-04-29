package runtime

import (
	"strings"
	"testing"

	"edge_server/go_core/internal/state"
)

func TestReproTaskT049TracksTrustedUntrustedAndDisconnectedExecution(t *testing.T) {
	runner := New()

	initial := runner.StateSnapshot()
	if initial.Trusted {
		t.Fatal("expected new runner to start untrusted")
	}
	if initial.Connected {
		t.Fatal("expected new runner to start disconnected")
	}
	if initial.CredentialMode != CredentialModeNone {
		t.Fatalf("expected initial credential mode none, got %q", initial.CredentialMode)
	}
	if initial.CredentialStatus != state.CredentialStatusMissing {
		t.Fatalf("expected initial credentialStatus=missing, got %q", initial.CredentialStatus)
	}
	if initial.SessionState != state.SessionStateStartup {
		t.Fatalf("expected initial sessionState=startup, got %q", initial.SessionState)
	}
	if initial.AuthOutcome != state.AuthOutcomeNeverAttempted {
		t.Fatalf("expected initial authOutcome=never_attempted, got %q", initial.AuthOutcome)
	}
	if initial.RetryEligible {
		t.Fatal("expected initial retryEligible=false")
	}
	if initial.SessionEpoch != 0 {
		t.Fatalf("expected initial session epoch 0, got %d", initial.SessionEpoch)
	}

	if err := runner.ActivateTrustedSession("edge-1", "persist-secret-v1"); err != nil {
		t.Fatalf("activate trusted session: %v", err)
	}

	trusted := runner.StateSnapshot()
	if !trusted.Trusted || !trusted.Connected {
		t.Fatalf("expected trusted+connected state after activation, got %+v", trusted)
	}
	if trusted.CredentialMode != CredentialModePersistent {
		t.Fatalf("expected persistent credential mode after activation, got %q", trusted.CredentialMode)
	}
	if trusted.PersistentCredentialSecret == nil || *trusted.PersistentCredentialSecret != "persist-secret-v1" {
		t.Fatalf("expected persistent credential secret to be retained in-memory, got %v", trusted.PersistentCredentialSecret)
	}
	if trusted.CredentialStatus != state.CredentialStatusLoaded {
		t.Fatalf("expected trusted credentialStatus=loaded, got %q", trusted.CredentialStatus)
	}
	if trusted.SessionState != state.SessionStateTrusted {
		t.Fatalf("expected trusted sessionState=trusted, got %q", trusted.SessionState)
	}
	if trusted.AuthOutcome != state.AuthOutcomeAccepted {
		t.Fatalf("expected trusted authOutcome=accepted, got %q", trusted.AuthOutcome)
	}
	if !trusted.RetryEligible {
		t.Fatal("expected trusted session to remain retry eligible")
	}
	if trusted.SessionEpoch != 1 {
		t.Fatalf("expected first trusted activation to set sessionEpoch=1, got %d", trusted.SessionEpoch)
	}
	if !runner.TelemetryAllowed() {
		t.Fatal("expected telemetry to be allowed while trusted and connected")
	}

	if err := runner.MarkDisconnected("transport_closed"); err != nil {
		t.Fatalf("mark disconnected: %v", err)
	}
	disconnected := runner.StateSnapshot()
	if disconnected.Trusted {
		t.Fatalf("expected disconnected state to be untrusted for telemetry gating, got %+v", disconnected)
	}
	if disconnected.Connected {
		t.Fatalf("expected disconnected state to clear connected flag, got %+v", disconnected)
	}
	if disconnected.CredentialMode != CredentialModePersistent {
		t.Fatalf("expected ordinary disconnect to keep persistent credential mode, got %q", disconnected.CredentialMode)
	}
	if disconnected.PersistentCredentialSecret == nil {
		t.Fatal("expected ordinary disconnect to keep in-memory persistent credential")
	}
	if disconnected.LastReason == nil || *disconnected.LastReason != "transport_closed" {
		t.Fatalf("expected disconnected state to store lastReason=transport_closed, got %v", disconnected.LastReason)
	}
	if disconnected.CredentialStatus != state.CredentialStatusLoaded {
		t.Fatalf("expected disconnect to preserve credentialStatus=loaded, got %q", disconnected.CredentialStatus)
	}
	if disconnected.SessionState != state.SessionStateRetryWait {
		t.Fatalf("expected disconnect sessionState=retry_wait, got %q", disconnected.SessionState)
	}
	if disconnected.AuthOutcome != state.AuthOutcomeDisconnected {
		t.Fatalf("expected disconnect authOutcome=disconnected, got %q", disconnected.AuthOutcome)
	}
	if !disconnected.RetryEligible {
		t.Fatal("expected disconnect to remain retry eligible with loaded credential")
	}
	if runner.TelemetryAllowed() {
		t.Fatal("expected telemetry to be blocked while disconnected")
	}

	if err := runner.MarkUntrusted("credential_rotated", true); err != nil {
		t.Fatalf("mark untrusted: %v", err)
	}
	untrusted := runner.StateSnapshot()
	if untrusted.CredentialMode != CredentialModeNone {
		t.Fatalf("expected trust-loss with clearCredential=true to force credentialMode=none, got %q", untrusted.CredentialMode)
	}
	if untrusted.PersistentCredentialSecret != nil {
		t.Fatalf("expected trust-loss to clear in-memory persistent credential, got %v", untrusted.PersistentCredentialSecret)
	}
	if untrusted.CredentialStatus != state.CredentialStatusSuperseded {
		t.Fatalf("expected trust-loss credentialStatus=superseded, got %q", untrusted.CredentialStatus)
	}
	if untrusted.SessionState != state.SessionStateOperatorActionRequired {
		t.Fatalf("expected trust-loss sessionState=operator_action_required, got %q", untrusted.SessionState)
	}
	if untrusted.AuthOutcome != state.AuthOutcomeCredentialRotated {
		t.Fatalf("expected trust-loss authOutcome=credential_rotated, got %q", untrusted.AuthOutcome)
	}
	if untrusted.RetryEligible {
		t.Fatal("expected trust-loss to disable retry eligibility")
	}
	if untrusted.LastReason == nil || *untrusted.LastReason != "credential_rotated" {
		t.Fatalf("expected trust-loss lastReason=credential_rotated, got %v", untrusted.LastReason)
	}
	if untrusted.SessionEpoch != 0 {
		t.Fatalf("expected trust-loss to invalidate active epoch, got %d", untrusted.SessionEpoch)
	}

	if err := runner.ActivateTrustedSession("edge-1", "persist-secret-v2"); err != nil {
		t.Fatalf("reactivate trusted session: %v", err)
	}

	recovered := runner.StateSnapshot()
	if recovered.SessionEpoch != 2 {
		t.Fatalf("expected recovered trusted session to get monotonic epoch=2, got %d", recovered.SessionEpoch)
	}
	if recovered.PersistentCredentialSecret == nil || *recovered.PersistentCredentialSecret != "persist-secret-v2" {
		t.Fatalf("expected recovered session to update in-memory persistent credential, got %v", recovered.PersistentCredentialSecret)
	}
	if !runner.TelemetryAllowed() {
		t.Fatal("expected telemetry to be allowed again after trusted session recovery")
	}
}

func TestReproTaskT049RequiresReplacedCredentialAfterRotation(t *testing.T) {
	runner := New()
	if err := runner.LoadPersistentCredential("edge-1", 3, "persist-secret-v1"); err != nil {
		t.Fatalf("load initial persistent credential: %v", err)
	}
	if err := runner.ActivateTrustedSession("edge-1", "persist-secret-v1"); err != nil {
		t.Fatalf("activate trusted session: %v", err)
	}

	if err := runner.MarkUntrusted("credential_rotated", true); err != nil {
		t.Fatalf("mark credential rotated: %v", err)
	}
	superseded := runner.StateSnapshot()
	if superseded.CredentialStatus != state.CredentialStatusSuperseded {
		t.Fatalf("expected credentialStatus=superseded after rotation, got %q", superseded.CredentialStatus)
	}
	if superseded.SessionState != state.SessionStateOperatorActionRequired {
		t.Fatalf("expected operator_action_required after rotation, got %q", superseded.SessionState)
	}
	if superseded.RetryEligible {
		t.Fatal("expected superseded credential to disable automatic retry")
	}

	err := runner.LoadPersistentCredential("edge-1", 3, "persist-secret-v1")
	if err == nil {
		t.Fatal("expected old credential version to be rejected after rotation")
	}
	if strings.Contains(strings.ToLower(err.Error()), "onboarding") {
		t.Fatalf("old credential rejection must not mention onboarding, got %v", err)
	}
	stillSuperseded := runner.StateSnapshot()
	if stillSuperseded.CredentialStatus != state.CredentialStatusSuperseded {
		t.Fatalf("expected stale reload to preserve superseded status, got %q", stillSuperseded.CredentialStatus)
	}
	if stillSuperseded.PersistentCredentialSecret != nil {
		t.Fatalf("expected stale reload to keep credential secret cleared, got %v", stillSuperseded.PersistentCredentialSecret)
	}

	if err := runner.LoadPersistentCredential("edge-1", 4, "persist-secret-v2"); err != nil {
		t.Fatalf("load replaced credential: %v", err)
	}
	if err := runner.ActivateTrustedSession("edge-1", "persist-secret-v2"); err != nil {
		t.Fatalf("activate trusted session with replaced credential: %v", err)
	}

	recovered := runner.StateSnapshot()
	if recovered.CredentialVersion == nil || *recovered.CredentialVersion != 4 {
		t.Fatalf("expected recovered credential version 4, got %+v", recovered.CredentialVersion)
	}
	if recovered.PersistentCredentialSecret == nil || *recovered.PersistentCredentialSecret != "persist-secret-v2" {
		t.Fatalf("expected recovery to use replaced credential secret, got %v", recovered.PersistentCredentialSecret)
	}
	if !runner.TelemetryAllowed() {
		t.Fatal("expected telemetry to recover only after replaced credential is trusted")
	}
}
