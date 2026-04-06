package runtime

import "testing"

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
	if trusted.SessionEpoch != 1 {
		t.Fatalf("expected first trusted activation to set sessionEpoch=1, got %d", trusted.SessionEpoch)
	}
	if !runner.TelemetryAllowed() {
		t.Fatal("expected telemetry to be allowed while trusted and connected")
	}

	runner.MarkDisconnected("transport_closed")
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
	if runner.TelemetryAllowed() {
		t.Fatal("expected telemetry to be blocked while disconnected")
	}

	runner.MarkUntrusted("trust_revoked", true)
	untrusted := runner.StateSnapshot()
	if untrusted.CredentialMode != CredentialModeNone {
		t.Fatalf("expected trust-loss with clearCredential=true to force credentialMode=none, got %q", untrusted.CredentialMode)
	}
	if untrusted.PersistentCredentialSecret != nil {
		t.Fatalf("expected trust-loss to clear in-memory persistent credential, got %v", untrusted.PersistentCredentialSecret)
	}
	if untrusted.LastReason == nil || *untrusted.LastReason != "trust_revoked" {
		t.Fatalf("expected trust-loss lastReason=trust_revoked, got %v", untrusted.LastReason)
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
