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

func TestRuntimeStateReconnectOutageAndExhaustionPreserveCredential(t *testing.T) {
	sessionState := NewRuntimeState()

	if err := sessionState.SetSourceSnapshot("edge-1", "rev-009"); err != nil {
		t.Fatalf("set source snapshot: %v", err)
	}
	if err := sessionState.LoadPersistentCredential("edge-1", 7, "persist-secret-v7"); err != nil {
		t.Fatalf("load persistent credential: %v", err)
	}
	if err := sessionState.MarkConnectAttempt("edge-1"); err != nil {
		t.Fatalf("mark connect attempt: %v", err)
	}

	sessionState.MarkRetryableConnectFailure("cloud_unavailable")

	retryable := sessionState.Snapshot()
	if retryable.CredentialVersion == nil || *retryable.CredentialVersion != 7 {
		t.Fatalf("expected retryable outage to preserve credentialVersion=7, got %+v", retryable.CredentialVersion)
	}
	if retryable.CredentialStatus != state.CredentialStatusLoaded {
		t.Fatalf("expected retryable outage to preserve credentialStatus=loaded, got %q", retryable.CredentialStatus)
	}
	if retryable.PersistentCredentialSecret == nil || *retryable.PersistentCredentialSecret != "persist-secret-v7" {
		t.Fatalf("expected retryable outage to preserve in-memory credential secret")
	}
	if retryable.SessionState != state.SessionStateRetryWait {
		t.Fatalf("expected retryable outage sessionState=retry_wait, got %q", retryable.SessionState)
	}
	if retryable.AuthOutcome != state.AuthOutcomeDisconnected {
		t.Fatalf("expected retryable outage authOutcome=disconnected, got %q", retryable.AuthOutcome)
	}
	if !retryable.RetryEligible {
		t.Fatal("expected retryable outage to remain retry eligible")
	}

	sessionState.MarkReconnectExhausted("max_attempts_exhausted")

	exhausted := sessionState.Snapshot()
	if exhausted.CredentialVersion == nil || *exhausted.CredentialVersion != 7 {
		t.Fatalf("expected exhaustion to preserve credentialVersion=7, got %+v", exhausted.CredentialVersion)
	}
	if exhausted.CredentialStatus != state.CredentialStatusLoaded {
		t.Fatalf("expected exhaustion to preserve credentialStatus=loaded, got %q", exhausted.CredentialStatus)
	}
	if exhausted.PersistentCredentialSecret == nil || *exhausted.PersistentCredentialSecret != "persist-secret-v7" {
		t.Fatalf("expected exhaustion to preserve in-memory credential secret")
	}
	if exhausted.SessionState != state.SessionStateOperatorActionRequired {
		t.Fatalf("expected exhaustion sessionState=operator_action_required, got %q", exhausted.SessionState)
	}
	if exhausted.AuthOutcome != state.AuthOutcomeEdgeAuthInternalErr {
		t.Fatalf("expected exhaustion authOutcome=edge_auth_internal_error, got %q", exhausted.AuthOutcome)
	}
	if exhausted.RetryEligible {
		t.Fatal("expected exhaustion to disable retry eligibility")
	}

	persisted := sessionState.PersistenceSnapshot()
	if persisted.CredentialStatus != state.CredentialStatusLoaded || persisted.RetryEligible {
		t.Fatalf("expected persisted exhausted state to keep loaded non-retryable credential, got %+v", persisted)
	}
}
