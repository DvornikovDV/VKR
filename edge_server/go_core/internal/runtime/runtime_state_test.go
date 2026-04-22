package runtime

import (
	"testing"
	"time"

	"edge_server/go_core/internal/state"
)

func TestRuntimeStateTracksCredentialSessionAndSourceState(t *testing.T) {
	sessionState := NewRuntimeState()

	if err := sessionState.SetSourceSnapshot("edge-1", "rev-007"); err != nil {
		t.Fatalf("set source snapshot: %v", err)
	}
	if err := sessionState.LoadPersistentCredential("edge-1", 4, "persist-secret-v4"); err != nil {
		t.Fatalf("load persistent credential: %v", err)
	}
	if err := sessionState.MarkConnectAttempt("edge-1"); err != nil {
		t.Fatalf("mark connect attempt: %v", err)
	}

	connecting := sessionState.Snapshot()
	if connecting.CredentialVersion == nil || *connecting.CredentialVersion != 4 {
		t.Fatalf("expected credentialVersion=4 while connecting, got %+v", connecting.CredentialVersion)
	}
	if connecting.CredentialStatus != state.CredentialStatusLoaded {
		t.Fatalf("expected credentialStatus=loaded while connecting, got %q", connecting.CredentialStatus)
	}
	if connecting.SessionState != state.SessionStateConnecting {
		t.Fatalf("expected sessionState=connecting, got %q", connecting.SessionState)
	}
	if !connecting.RetryEligible {
		t.Fatal("expected loaded credential to remain retry eligible while connecting")
	}
	if connecting.SourceConfigRevision != "rev-007" {
		t.Fatalf("expected source snapshot to be preserved, got %+v", connecting)
	}

	if err := sessionState.ActivateTrustedSession("edge-1", "persist-secret-v4"); err != nil {
		t.Fatalf("activate trusted session: %v", err)
	}
	sentAt := time.Date(2026, 4, 20, 10, 0, 0, 0, time.UTC)
	sessionState.RecordTelemetrySent(sentAt)
	sessionState.MarkDisconnected("transport_closed")

	disconnected := sessionState.PersistenceSnapshot()
	if disconnected.EdgeID != "edge-1" {
		t.Fatalf("expected persisted edgeId=edge-1, got %+v", disconnected)
	}
	if disconnected.CredentialVersion == nil || *disconnected.CredentialVersion != 4 {
		t.Fatalf("expected persisted credentialVersion=4, got %+v", disconnected.CredentialVersion)
	}
	if disconnected.CredentialStatus != state.CredentialStatusLoaded {
		t.Fatalf("expected persisted credentialStatus=loaded after ordinary disconnect, got %q", disconnected.CredentialStatus)
	}
	if disconnected.SessionState != state.SessionStateRetryWait {
		t.Fatalf("expected persisted sessionState=retry_wait after ordinary disconnect, got %q", disconnected.SessionState)
	}
	if disconnected.AuthOutcome != state.AuthOutcomeDisconnected {
		t.Fatalf("expected persisted authOutcome=disconnected, got %q", disconnected.AuthOutcome)
	}
	if !disconnected.RetryEligible {
		t.Fatal("expected ordinary disconnect to remain retry eligible")
	}
	if disconnected.LastTelemetrySentAt == nil || !disconnected.LastTelemetrySentAt.Equal(sentAt) {
		t.Fatalf("expected lastTelemetrySentAt=%s, got %+v", sentAt.Format(time.RFC3339), disconnected.LastTelemetrySentAt)
	}
	if disconnected.LastDisconnectReason == nil || *disconnected.LastDisconnectReason != "transport_closed" {
		t.Fatalf("expected lastDisconnectReason=transport_closed, got %+v", disconnected.LastDisconnectReason)
	}
}
