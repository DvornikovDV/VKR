package runtime

import (
	"edge_server/go_core/internal/state"
	"fmt"
	"strings"
	"sync"
	"time"
)

type CredentialMode string

const (
	CredentialModeNone       CredentialMode = "none"
	CredentialModeOnboarding CredentialMode = "onboarding"
	CredentialModePersistent CredentialMode = "persistent"
)

type SessionStateSnapshot struct {
	EdgeID               string
	CredentialVersion    *int
	CredentialStatus     state.CredentialStatus
	SessionState         state.SessionState
	AuthOutcome          state.AuthOutcome
	RetryEligible        bool
	LastConnectAttemptAt *time.Time
	LastTrustedSessionAt *time.Time
	LastDisconnectAt     *time.Time
	LastDisconnectReason *string
	LastTelemetrySentAt  *time.Time
	SourceConfigRevision string
	UpdatedAt            time.Time

	// Compatibility shim for the legacy onboarding-era runtime path.
	// Remove after T012/T013/T027 retire the old trust-mode consumers.
	CredentialMode             CredentialMode
	PersistentCredentialSecret *string
	Trusted                    bool
	Connected                  bool
	LastReason                 *string
	SessionEpoch               uint64
}

type RuntimeState struct {
	mu      sync.RWMutex
	epochs  *SessionEpochTracker
	session SessionStateSnapshot
}

func NewRuntimeState() *RuntimeState {
	return &RuntimeState{
		epochs: NewSessionEpochTracker(),
		session: SessionStateSnapshot{
			CredentialStatus: state.CredentialStatusMissing,
			SessionState:     state.SessionStateStartup,
			AuthOutcome:      state.AuthOutcomeNeverAttempted,
			CredentialMode:   CredentialModeNone,
			UpdatedAt:        time.Now().UTC(),
		},
	}
}

func (s *RuntimeState) Snapshot() SessionStateSnapshot {
	s.mu.RLock()
	defer s.mu.RUnlock()

	copy := s.session
	copy.CredentialVersion = cloneIntPointer(s.session.CredentialVersion)
	copy.LastConnectAttemptAt = cloneRuntimeTimePointer(s.session.LastConnectAttemptAt)
	copy.LastTrustedSessionAt = cloneRuntimeTimePointer(s.session.LastTrustedSessionAt)
	copy.LastDisconnectAt = cloneRuntimeTimePointer(s.session.LastDisconnectAt)
	copy.LastDisconnectReason = cloneStringPointer(s.session.LastDisconnectReason)
	copy.LastTelemetrySentAt = cloneRuntimeTimePointer(s.session.LastTelemetrySentAt)
	copy.PersistentCredentialSecret = cloneStringPointer(s.session.PersistentCredentialSecret)
	copy.LastReason = cloneStringPointer(s.session.LastReason)
	return copy
}

func (s *RuntimeState) SetSourceSnapshot(edgeID string, sourceConfigRevision string) error {
	normalizedEdgeID := strings.TrimSpace(edgeID)
	if normalizedEdgeID == "" {
		return fmt.Errorf("edgeID is required")
	}

	normalizedRevision := strings.TrimSpace(sourceConfigRevision)
	if normalizedRevision == "" {
		return fmt.Errorf("sourceConfigRevision is required")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	s.session.EdgeID = normalizedEdgeID
	s.session.SourceConfigRevision = normalizedRevision
	s.touchLocked()

	return nil
}

func (s *RuntimeState) LoadPersistentCredential(edgeID string, version int, persistentSecret string) error {
	normalizedEdgeID := strings.TrimSpace(edgeID)
	if normalizedEdgeID == "" {
		return fmt.Errorf("edgeID is required")
	}
	if version <= 0 {
		return fmt.Errorf("credentialVersion must be > 0")
	}

	normalizedSecret := strings.TrimSpace(persistentSecret)
	if normalizedSecret == "" {
		return fmt.Errorf("persistentSecret is required")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	s.session.EdgeID = normalizedEdgeID
	s.session.CredentialVersion = intPointer(version)
	s.session.CredentialStatus = state.CredentialStatusLoaded
	s.session.SessionState = state.SessionStateStartup
	s.session.AuthOutcome = state.AuthOutcomeNeverAttempted
	s.session.RetryEligible = false
	s.session.CredentialMode = CredentialModePersistent
	s.session.PersistentCredentialSecret = stringPointer(normalizedSecret)
	s.session.LastReason = nil
	s.touchLocked()

	return nil
}

func (s *RuntimeState) MarkConnectAttempt(edgeID string) error {
	normalizedEdgeID := strings.TrimSpace(edgeID)
	if normalizedEdgeID == "" {
		s.mu.RLock()
		normalizedEdgeID = strings.TrimSpace(s.session.EdgeID)
		s.mu.RUnlock()
	}
	if normalizedEdgeID == "" {
		return fmt.Errorf("edgeID is required")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	s.session.EdgeID = normalizedEdgeID
	s.session.SessionState = state.SessionStateConnecting
	s.session.LastConnectAttemptAt = runtimeTimePointer(time.Now().UTC())
	s.session.RetryEligible = s.session.CredentialStatus == state.CredentialStatusLoaded
	s.session.Trusted = false
	s.session.Connected = false
	s.touchLocked()

	return nil
}

func (s *RuntimeState) ActivateTrustedSession(edgeID string, persistentSecret string) error {
	normalizedEdgeID := strings.TrimSpace(edgeID)
	if normalizedEdgeID == "" {
		return fmt.Errorf("edgeID is required")
	}

	normalizedSecret := strings.TrimSpace(persistentSecret)
	if normalizedSecret == "" {
		return fmt.Errorf("persistentSecret is required")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	nextEpoch := s.epochs.Next()

	s.session.EdgeID = normalizedEdgeID
	s.session.CredentialStatus = state.CredentialStatusLoaded
	s.session.SessionState = state.SessionStateTrusted
	s.session.AuthOutcome = state.AuthOutcomeAccepted
	s.session.RetryEligible = true
	s.session.LastTrustedSessionAt = runtimeTimePointer(time.Now().UTC())
	s.session.CredentialMode = CredentialModePersistent
	s.session.PersistentCredentialSecret = stringPointer(normalizedSecret)
	s.session.Trusted = true
	s.session.Connected = true
	s.session.LastReason = nil
	s.session.SessionEpoch = nextEpoch
	s.touchLocked()

	return nil
}

func (s *RuntimeState) MarkOnboardingCandidate(edgeID string) error {
	normalizedEdgeID := strings.TrimSpace(edgeID)
	if normalizedEdgeID == "" {
		return fmt.Errorf("edgeID is required")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	s.epochs.Invalidate()
	s.session.EdgeID = normalizedEdgeID
	s.session.CredentialVersion = nil
	s.session.CredentialStatus = state.CredentialStatusMissing
	s.session.SessionState = state.SessionStateStartup
	s.session.AuthOutcome = state.AuthOutcomeNeverAttempted
	s.session.RetryEligible = false
	s.session.CredentialMode = CredentialModeOnboarding
	s.session.PersistentCredentialSecret = nil
	s.session.Trusted = false
	s.session.Connected = false
	s.session.SessionEpoch = 0
	s.session.LastReason = nil
	s.touchLocked()

	return nil
}

func (s *RuntimeState) MarkDisconnected(reason string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.epochs.Invalidate()
	retryEligible := s.session.CredentialStatus == state.CredentialStatusLoaded && s.session.PersistentCredentialSecret != nil
	sessionState := state.SessionStateOperatorActionRequired
	if retryEligible {
		sessionState = state.SessionStateRetryWait
	}
	now := time.Now().UTC()
	s.session.Trusted = false
	s.session.Connected = false
	s.session.SessionEpoch = 0
	s.session.SessionState = sessionState
	s.session.AuthOutcome = state.AuthOutcomeDisconnected
	s.session.RetryEligible = retryEligible
	s.session.LastDisconnectAt = runtimeTimePointer(now)
	s.session.LastDisconnectReason = normalizeReason(reason)
	s.session.LastReason = normalizeReason(reason)
	if s.session.CredentialMode == "" {
		s.session.CredentialMode = CredentialModeNone
	}
	s.touchLockedAt(now)
}

func (s *RuntimeState) MarkUntrusted(reason string, clearCredential bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.epochs.Invalidate()
	outcome, credentialStatus, retryEligible, sessionState := classifyUntrustedReason(reason, clearCredential)
	s.session.Trusted = false
	s.session.Connected = false
	s.session.SessionEpoch = 0
	s.session.AuthOutcome = outcome
	s.session.CredentialStatus = credentialStatus
	s.session.RetryEligible = retryEligible
	s.session.SessionState = sessionState
	s.session.LastReason = normalizeReason(reason)

	if clearCredential {
		s.session.CredentialMode = CredentialModeNone
		s.session.PersistentCredentialSecret = nil
		s.touchLocked()
		return
	}
	if s.session.CredentialMode == "" {
		s.session.CredentialMode = CredentialModeNone
	}
	s.touchLocked()
}

func (s *RuntimeState) RecordTelemetrySent(at time.Time) {
	if at.IsZero() {
		at = time.Now().UTC()
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	s.session.LastTelemetrySentAt = runtimeTimePointer(at.UTC())
	s.touchLockedAt(at.UTC())
}

func (s *RuntimeState) PersistenceSnapshot() state.RuntimeState {
	s.mu.RLock()
	defer s.mu.RUnlock()

	return state.RuntimeState{
		EdgeID:               s.session.EdgeID,
		CredentialVersion:    cloneIntPointer(s.session.CredentialVersion),
		CredentialStatus:     s.session.CredentialStatus,
		SessionState:         s.session.SessionState,
		AuthOutcome:          s.session.AuthOutcome,
		RetryEligible:        s.session.RetryEligible,
		LastConnectAttemptAt: cloneRuntimeTimePointer(s.session.LastConnectAttemptAt),
		LastTrustedSessionAt: cloneRuntimeTimePointer(s.session.LastTrustedSessionAt),
		LastDisconnectAt:     cloneRuntimeTimePointer(s.session.LastDisconnectAt),
		LastDisconnectReason: cloneStringPointer(s.session.LastDisconnectReason),
		LastTelemetrySentAt:  cloneRuntimeTimePointer(s.session.LastTelemetrySentAt),
		SourceConfigRevision: s.session.SourceConfigRevision,
		UpdatedAt:            s.session.UpdatedAt,
	}
}

func (s *RuntimeState) TelemetryAllowed() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()

	return s.session.Trusted && s.session.Connected
}

func normalizeReason(reason string) *string {
	normalized := strings.TrimSpace(reason)
	if normalized == "" {
		return nil
	}

	return stringPointer(normalized)
}

func cloneStringPointer(value *string) *string {
	if value == nil {
		return nil
	}

	copy := *value
	return &copy
}

func stringPointer(value string) *string {
	copy := value
	return &copy
}

func cloneIntPointer(value *int) *int {
	if value == nil {
		return nil
	}

	copy := *value
	return &copy
}

func intPointer(value int) *int {
	copy := value
	return &copy
}

func cloneRuntimeTimePointer(value *time.Time) *time.Time {
	if value == nil {
		return nil
	}

	copy := value.UTC()
	return &copy
}

func runtimeTimePointer(value time.Time) *time.Time {
	copy := value.UTC()
	return &copy
}

func (s *RuntimeState) touchLocked() {
	s.touchLockedAt(time.Now().UTC())
}

func (s *RuntimeState) touchLockedAt(at time.Time) {
	s.session.UpdatedAt = at.UTC()
}

func classifyUntrustedReason(reason string, clearCredential bool) (state.AuthOutcome, state.CredentialStatus, bool, state.SessionState) {
	switch strings.TrimSpace(reason) {
	case "blocked":
		return state.AuthOutcomeBlocked, state.CredentialStatusBlocked, false, state.SessionStateOperatorActionRequired
	case "trust_revoked", "persistent_credential_revoked", "credential_rotated":
		return state.AuthOutcomeCredentialRotated, state.CredentialStatusSuperseded, false, state.SessionStateOperatorActionRequired
	case "edge_not_found":
		return state.AuthOutcomeEdgeNotFound, state.CredentialStatusRejected, false, state.SessionStateOperatorActionRequired
	case "invalid_credential", "onboarding_not_allowed", "onboarding_package_missing", "onboarding_package_expired", "onboarding_package_reused":
		return state.AuthOutcomeInvalidCredential, state.CredentialStatusRejected, false, state.SessionStateOperatorActionRequired
	case "edge_auth_internal_error", "protocol_error":
		if clearCredential {
			return state.AuthOutcomeEdgeAuthInternalErr, state.CredentialStatusRejected, false, state.SessionStateOperatorActionRequired
		}
		return state.AuthOutcomeEdgeAuthInternalErr, state.CredentialStatusLoaded, true, state.SessionStateRetryWait
	default:
		if clearCredential {
			return state.AuthOutcomeEdgeAuthInternalErr, state.CredentialStatusRejected, false, state.SessionStateOperatorActionRequired
		}
		return state.AuthOutcomeEdgeAuthInternalErr, state.CredentialStatusLoaded, true, state.SessionStateRetryWait
	}
}
