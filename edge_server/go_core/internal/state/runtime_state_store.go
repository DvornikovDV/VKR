package state

import (
	"fmt"
	"path/filepath"
	"strings"
	"time"
)

type CredentialStatus string

const (
	CredentialStatusLoaded     CredentialStatus = "loaded"
	CredentialStatusMissing    CredentialStatus = "missing"
	CredentialStatusRejected   CredentialStatus = "rejected"
	CredentialStatusSuperseded CredentialStatus = "superseded"
	CredentialStatusBlocked    CredentialStatus = "blocked"
)

type SessionState string

const (
	SessionStateStartup                SessionState = "startup"
	SessionStateConnecting             SessionState = "connecting"
	SessionStateTrusted                SessionState = "trusted"
	SessionStateRetryWait              SessionState = "retry_wait"
	SessionStateOperatorActionRequired SessionState = "operator_action_required"
	SessionStateStopped                SessionState = "stopped"
)

type AuthOutcome string

const (
	AuthOutcomeNeverAttempted      AuthOutcome = "never_attempted"
	AuthOutcomeAccepted            AuthOutcome = "accepted"
	AuthOutcomeInvalidCredential   AuthOutcome = "invalid_credential"
	AuthOutcomeBlocked             AuthOutcome = "blocked"
	AuthOutcomeEdgeNotFound        AuthOutcome = "edge_not_found"
	AuthOutcomeEdgeAuthInternalErr AuthOutcome = "edge_auth_internal_error"
	AuthOutcomeCredentialRotated   AuthOutcome = "credential_rotated"
	AuthOutcomeDisconnected        AuthOutcome = "disconnected"
)

type RuntimeState struct {
	EdgeID               string           `json:"edgeId"`
	CredentialVersion    *int             `json:"credentialVersion"`
	CredentialStatus     CredentialStatus `json:"credentialStatus"`
	SessionState         SessionState     `json:"sessionState"`
	AuthOutcome          AuthOutcome      `json:"authOutcome"`
	RetryEligible        bool             `json:"retryEligible"`
	LastConnectAttemptAt *time.Time       `json:"lastConnectAttemptAt"`
	LastTrustedSessionAt *time.Time       `json:"lastTrustedSessionAt"`
	LastDisconnectAt     *time.Time       `json:"lastDisconnectAt"`
	LastDisconnectReason *string          `json:"lastDisconnectReason"`
	LastTelemetrySentAt  *time.Time       `json:"lastTelemetrySentAt"`
	SourceConfigRevision string           `json:"sourceConfigRevision"`
	UpdatedAt            time.Time        `json:"updatedAt"`
}

type RuntimeStateStore struct {
	path string
}

func NewRuntimeStateStore(stateDir string) *RuntimeStateStore {
	return &RuntimeStateStore{
		path: filepath.Join(stateDir, runtimeStateFileName),
	}
}

func (s *RuntimeStateStore) Save(state RuntimeState) error {
	if err := validateRuntimeState(state); err != nil {
		return err
	}

	return atomicWriteJSON(s.path, state, 0o640)
}

func (s *RuntimeStateStore) Load() (RuntimeState, bool, error) {
	var state RuntimeState
	exists, err := readJSONFile(s.path, &state)
	if err != nil {
		return RuntimeState{}, exists, err
	}
	if !exists {
		return RuntimeState{}, false, nil
	}
	if err := validateRuntimeState(state); err != nil {
		return RuntimeState{}, true, err
	}

	return state, true, nil
}

func validateRuntimeState(state RuntimeState) error {
	if strings.TrimSpace(state.EdgeID) == "" {
		return fmt.Errorf("runtimeState.edgeId is required")
	}
	if state.CredentialVersion != nil && *state.CredentialVersion <= 0 {
		return fmt.Errorf("runtimeState.credentialVersion must be > 0")
	}
	if err := validateCredentialStatus(state.CredentialStatus); err != nil {
		return err
	}
	if err := validateSessionState(state.SessionState); err != nil {
		return err
	}
	if err := validateAuthOutcome(state.AuthOutcome); err != nil {
		return err
	}
	if strings.TrimSpace(state.SourceConfigRevision) == "" {
		return fmt.Errorf("runtimeState.sourceConfigRevision is required")
	}
	if state.LastDisconnectAt != nil && state.LastDisconnectReason == nil {
		return fmt.Errorf("runtimeState.lastDisconnectReason is required when lastDisconnectAt is set")
	}
	if state.LastDisconnectAt == nil && state.LastDisconnectReason != nil {
		return fmt.Errorf("runtimeState.lastDisconnectAt is required when lastDisconnectReason is set")
	}
	if state.UpdatedAt.IsZero() {
		return fmt.Errorf("runtimeState.updatedAt is required")
	}
	if err := validateRetryEligibility(state); err != nil {
		return err
	}

	return nil
}

func validateCredentialStatus(status CredentialStatus) error {
	switch status {
	case CredentialStatusLoaded, CredentialStatusMissing, CredentialStatusRejected, CredentialStatusSuperseded, CredentialStatusBlocked:
		return nil
	default:
		return fmt.Errorf("runtimeState.credentialStatus %q is not supported", status)
	}
}

func validateSessionState(sessionState SessionState) error {
	switch sessionState {
	case SessionStateStartup, SessionStateConnecting, SessionStateTrusted, SessionStateRetryWait, SessionStateOperatorActionRequired, SessionStateStopped:
		return nil
	default:
		return fmt.Errorf("runtimeState.sessionState %q is not supported", sessionState)
	}
}

func validateAuthOutcome(outcome AuthOutcome) error {
	switch outcome {
	case AuthOutcomeNeverAttempted,
		AuthOutcomeAccepted,
		AuthOutcomeInvalidCredential,
		AuthOutcomeBlocked,
		AuthOutcomeEdgeNotFound,
		AuthOutcomeEdgeAuthInternalErr,
		AuthOutcomeCredentialRotated,
		AuthOutcomeDisconnected:
		return nil
	default:
		return fmt.Errorf("runtimeState.authOutcome %q is not supported", outcome)
	}
}

func validateRetryEligibility(state RuntimeState) error {
	if !state.RetryEligible {
		return nil
	}

	switch state.CredentialStatus {
	case CredentialStatusMissing, CredentialStatusRejected, CredentialStatusSuperseded, CredentialStatusBlocked:
		return fmt.Errorf("runtimeState.retryEligible must be false for credentialStatus %q", state.CredentialStatus)
	}

	switch state.AuthOutcome {
	case AuthOutcomeInvalidCredential, AuthOutcomeBlocked, AuthOutcomeEdgeNotFound, AuthOutcomeCredentialRotated:
		return fmt.Errorf("runtimeState.retryEligible must be false for authOutcome %q", state.AuthOutcome)
	}

	switch state.SessionState {
	case SessionStateOperatorActionRequired, SessionStateStopped:
		return fmt.Errorf("runtimeState.retryEligible must be false for sessionState %q", state.SessionState)
	}

	return nil
}
