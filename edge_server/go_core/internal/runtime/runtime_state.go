package runtime

import (
	"fmt"
	"strings"
	"sync"
)

type CredentialMode string

const (
	CredentialModeNone       CredentialMode = "none"
	CredentialModeOnboarding CredentialMode = "onboarding"
	CredentialModePersistent CredentialMode = "persistent"
)

type SessionStateSnapshot struct {
	EdgeID                     string
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
			CredentialMode: CredentialModeNone,
		},
	}
}

func (s *RuntimeState) Snapshot() SessionStateSnapshot {
	s.mu.RLock()
	defer s.mu.RUnlock()

	copy := s.session
	copy.PersistentCredentialSecret = cloneStringPointer(s.session.PersistentCredentialSecret)
	copy.LastReason = cloneStringPointer(s.session.LastReason)
	return copy
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
	s.session.CredentialMode = CredentialModePersistent
	s.session.PersistentCredentialSecret = stringPointer(normalizedSecret)
	s.session.Trusted = true
	s.session.Connected = true
	s.session.LastReason = nil
	s.session.SessionEpoch = nextEpoch

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
	s.session.CredentialMode = CredentialModeOnboarding
	s.session.PersistentCredentialSecret = nil
	s.session.Trusted = false
	s.session.Connected = false
	s.session.SessionEpoch = 0
	s.session.LastReason = nil

	return nil
}

func (s *RuntimeState) MarkDisconnected(reason string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.epochs.Invalidate()
	s.session.Trusted = false
	s.session.Connected = false
	s.session.SessionEpoch = 0
	s.session.LastReason = normalizeReason(reason)
	if s.session.CredentialMode == "" {
		s.session.CredentialMode = CredentialModeNone
	}
}

func (s *RuntimeState) MarkUntrusted(reason string, clearCredential bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.epochs.Invalidate()
	s.session.Trusted = false
	s.session.Connected = false
	s.session.SessionEpoch = 0
	s.session.LastReason = normalizeReason(reason)

	if clearCredential {
		s.session.CredentialMode = CredentialModeNone
		s.session.PersistentCredentialSecret = nil
		return
	}
	if s.session.CredentialMode == "" {
		s.session.CredentialMode = CredentialModeNone
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
