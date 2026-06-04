package runtime

import (
	"testing"

	"edge_server/go_core/internal/cloud"
	"edge_server/go_core/internal/state"
)

func TestTrustSessionFlowHandleConnectErrorClassifiesRetryableAndTerminal(t *testing.T) {
	cases := []struct {
		name                 string
		code                 cloud.ConnectErrorCode
		wantCredentialStatus state.CredentialStatus
		wantSessionState     state.SessionState
		wantAuthOutcome      state.AuthOutcome
		wantRetryEligible    bool
		wantSecretPreserved  bool
	}{
		{
			name:                 "internal auth error remains retryable",
			code:                 cloud.ConnectErrorEdgeAuthInternalError,
			wantCredentialStatus: state.CredentialStatusLoaded,
			wantSessionState:     state.SessionStateRetryWait,
			wantAuthOutcome:      state.AuthOutcomeEdgeAuthInternalErr,
			wantRetryEligible:    true,
			wantSecretPreserved:  true,
		},
		{
			name:                 "unknown connect error remains retryable",
			code:                 cloud.ConnectErrorCode("socket_transport_closed"),
			wantCredentialStatus: state.CredentialStatusLoaded,
			wantSessionState:     state.SessionStateRetryWait,
			wantAuthOutcome:      state.AuthOutcomeDisconnected,
			wantRetryEligible:    true,
			wantSecretPreserved:  true,
		},
		{
			name:                 "invalid credential is terminal",
			code:                 cloud.ConnectErrorInvalidCredential,
			wantCredentialStatus: state.CredentialStatusRejected,
			wantSessionState:     state.SessionStateOperatorActionRequired,
			wantAuthOutcome:      state.AuthOutcomeInvalidCredential,
			wantRetryEligible:    false,
			wantSecretPreserved:  false,
		},
		{
			name:                 "blocked edge is terminal",
			code:                 cloud.ConnectErrorBlocked,
			wantCredentialStatus: state.CredentialStatusBlocked,
			wantSessionState:     state.SessionStateOperatorActionRequired,
			wantAuthOutcome:      state.AuthOutcomeBlocked,
			wantRetryEligible:    false,
			wantSecretPreserved:  false,
		},
		{
			name:                 "edge not found is terminal",
			code:                 cloud.ConnectErrorEdgeNotFound,
			wantCredentialStatus: state.CredentialStatusRejected,
			wantSessionState:     state.SessionStateOperatorActionRequired,
			wantAuthOutcome:      state.AuthOutcomeEdgeNotFound,
			wantRetryEligible:    false,
			wantSecretPreserved:  false,
		},
		{
			name:                 "revoked persistent credential is terminal",
			code:                 cloud.ConnectErrorPersistentCredentialRevoked,
			wantCredentialStatus: state.CredentialStatusRejected,
			wantSessionState:     state.SessionStateOperatorActionRequired,
			wantAuthOutcome:      state.AuthOutcomeInvalidCredential,
			wantRetryEligible:    false,
			wantSecretPreserved:  false,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			runner := New()
			if err := runner.LoadPersistentCredential("edge-1", 3, "persist-secret-v3"); err != nil {
				t.Fatalf("load persistent credential: %v", err)
			}
			if err := runner.MarkConnectAttempt("edge-1"); err != nil {
				t.Fatalf("mark connect attempt: %v", err)
			}

			newTrustSessionFlow(runner).HandleConnectError(tc.code)

			snapshot := runner.StateSnapshot()
			if snapshot.CredentialStatus != tc.wantCredentialStatus {
				t.Fatalf("expected credentialStatus=%q, got %q", tc.wantCredentialStatus, snapshot.CredentialStatus)
			}
			if snapshot.SessionState != tc.wantSessionState {
				t.Fatalf("expected sessionState=%q, got %q", tc.wantSessionState, snapshot.SessionState)
			}
			if snapshot.AuthOutcome != tc.wantAuthOutcome {
				t.Fatalf("expected authOutcome=%q, got %q", tc.wantAuthOutcome, snapshot.AuthOutcome)
			}
			if snapshot.RetryEligible != tc.wantRetryEligible {
				t.Fatalf("expected retryEligible=%v, got %v", tc.wantRetryEligible, snapshot.RetryEligible)
			}
			secretPreserved := snapshot.PersistentCredentialSecret != nil && *snapshot.PersistentCredentialSecret == "persist-secret-v3"
			if secretPreserved != tc.wantSecretPreserved {
				t.Fatalf("expected secretPreserved=%v, got %v", tc.wantSecretPreserved, secretPreserved)
			}
		})
	}
}
