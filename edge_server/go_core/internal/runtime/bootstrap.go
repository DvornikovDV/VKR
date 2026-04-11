package runtime

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"edge_server/go_core/internal/cloud"
	"edge_server/go_core/internal/config"
)

var ErrAuthPathUnavailable = errors.New("runtime auth path is unavailable")
var ErrOnboardingPackageConsumed = errors.New("onboarding package has already been consumed")

type BootstrapInput struct {
	OnboardingPackagePath string
	OnboardingPackageJSON string
}

type BootstrapSession struct {
	runner *Runner

	mu               sync.RWMutex
	onboarding       *OnboardingPackage
	lastConsumed     *OnboardingPackage
	onboardingEvents chan struct{}
}

func NewBootstrapSession(runner *Runner) *BootstrapSession {
	session := &BootstrapSession{
		runner:           runner,
		onboardingEvents: make(chan struct{}, 1),
	}

	if runner != nil {
		runner.attachBootstrapSession(session)
	}

	return session
}

func (s *BootstrapSession) Bootstrap(input BootstrapInput) error {
	if s == nil || s.runner == nil {
		return fmt.Errorf("runtime bootstrap session requires a runner")
	}

	pkg, err := loadOnboardingFromInput(input)
	if err != nil {
		return err
	}

	s.mu.Lock()
	if s.lastConsumed != nil && sameOnboardingCredential(*s.lastConsumed, pkg) {
		s.mu.Unlock()
		return fmt.Errorf("%w: fresh operator onboarding input is required", ErrOnboardingPackageConsumed)
	}
	candidate := cloneOnboardingPackage(pkg)
	s.onboarding = &candidate
	s.mu.Unlock()

	if err := s.runner.state.MarkOnboardingCandidate(pkg.EdgeID); err != nil {
		return fmt.Errorf("initialize onboarding candidate state: %w", err)
	}
	s.signalOnboardingInput()

	return nil
}

func (s *BootstrapSession) BuildHandshakeAuth() (cloud.HandshakeAuth, error) {
	if s == nil || s.runner == nil {
		return cloud.HandshakeAuth{}, fmt.Errorf("runtime bootstrap session requires a runner")
	}

	snapshot := s.runner.StateSnapshot()
	if snapshot.CredentialMode == CredentialModePersistent && snapshot.PersistentCredentialSecret != nil {
		auth, err := cloud.BuildPersistentHandshakeAuth(snapshot.EdgeID, *snapshot.PersistentCredentialSecret)
		if err != nil {
			return cloud.HandshakeAuth{}, fmt.Errorf("build persistent handshake auth: %w", err)
		}
		return auth, nil
	}

	s.mu.RLock()
	candidate := s.onboarding
	s.mu.RUnlock()

	if candidate == nil {
		return cloud.HandshakeAuth{}, fmt.Errorf("%w: onboarding package is required before handshake", ErrAuthPathUnavailable)
	}

	auth, err := cloud.BuildOnboardingHandshakeAuth(candidate.EdgeID, candidate.OnboardingSecret)
	if err != nil {
		return cloud.HandshakeAuth{}, fmt.Errorf("build onboarding handshake auth: %w", err)
	}

	return auth, nil
}

func (s *BootstrapSession) HandleEdgeActivation(event cloud.EdgeActivation) error {
	if s == nil || s.runner == nil {
		return fmt.Errorf("runtime bootstrap session requires a runner")
	}
	if strings.TrimSpace(event.EdgeID) == "" {
		return fmt.Errorf("edge activation edgeId is required")
	}
	if event.PersistentCredential.Secret == "" {
		return fmt.Errorf("edge activation persistent credential secret is required")
	}

	s.mu.RLock()
	currentOnboarding := s.onboarding
	s.mu.RUnlock()

	if currentOnboarding != nil && event.EdgeID != currentOnboarding.EdgeID {
		return fmt.Errorf(
			"edge activation edgeId %q does not match onboarding edgeId %q",
			event.EdgeID,
			currentOnboarding.EdgeID,
		)
	}

	if err := s.runner.ActivateTrustedSession(event.EdgeID, event.PersistentCredential.Secret); err != nil {
		return err
	}

	// A successful activation consumes operator onboarding input in this session.
	s.mu.Lock()
	if currentOnboarding != nil {
		consumed := cloneOnboardingPackage(*currentOnboarding)
		s.lastConsumed = &consumed
	}
	s.onboarding = nil
	s.mu.Unlock()

	return nil
}

func (s *BootstrapSession) WaitForFreshOnboardingInput(ctx context.Context, lastReason *string) error {
	if s == nil || s.runner == nil {
		return fmt.Errorf("runtime bootstrap session requires a runner")
	}
	if ctx == nil {
		return fmt.Errorf("runtime context is required")
	}
	if lastReason == nil || strings.TrimSpace(*lastReason) == "" {
		return fmt.Errorf("%w: onboarding package is required before handshake", ErrAuthPathUnavailable)
	}

	s.mu.RLock()
	if s.onboarding != nil {
		s.mu.RUnlock()
		return nil
	}
	s.mu.RUnlock()

	timer := time.NewTimer(time.Duration(config.DefaultFreshOnboardingInputWaitMs) * time.Millisecond)
	defer timer.Stop()

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-timer.C:
			return fmt.Errorf("%w: onboarding package is required before handshake", ErrAuthPathUnavailable)
		case <-s.onboardingEvents:
			s.mu.RLock()
			ready := s.onboarding != nil
			s.mu.RUnlock()
			if ready {
				return nil
			}
		}
	}
}

func (s *BootstrapSession) signalOnboardingInput() {
	if s == nil || s.onboardingEvents == nil {
		return
	}

	select {
	case s.onboardingEvents <- struct{}{}:
	default:
	}
}

func loadOnboardingFromInput(input BootstrapInput) (OnboardingPackage, error) {
	onboardingPath := strings.TrimSpace(input.OnboardingPackagePath)
	onboardingJSON := strings.TrimSpace(input.OnboardingPackageJSON)

	if onboardingPath != "" && onboardingJSON != "" {
		return OnboardingPackage{}, fmt.Errorf("bootstrap input must provide onboarding package path or inline json, not both")
	}

	if onboardingPath != "" {
		return LoadOnboardingPackageFromFile(onboardingPath)
	}
	if onboardingJSON != "" {
		return ParseOnboardingPackage([]byte(onboardingJSON))
	}

	return OnboardingPackage{}, fmt.Errorf("bootstrap input must provide onboarding package path or inline json")
}
