package runtime

import (
	"errors"
	"fmt"
	"strings"

	"edge_server/go_core/internal/cloud"
)

var ErrAuthPathUnavailable = errors.New("runtime auth path is unavailable")

type BootstrapInput struct {
	OnboardingPackagePath string
	OnboardingPackageJSON string
}

type BootstrapSession struct {
	runner     *Runner
	onboarding *OnboardingPackage
}

func NewBootstrapSession(runner *Runner) *BootstrapSession {
	session := &BootstrapSession{
		runner: runner,
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

	s.onboarding = &pkg
	if err := s.runner.state.MarkOnboardingCandidate(pkg.EdgeID); err != nil {
		return fmt.Errorf("initialize onboarding candidate state: %w", err)
	}

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

	if s.onboarding == nil {
		return cloud.HandshakeAuth{}, fmt.Errorf("%w: onboarding package is required before handshake", ErrAuthPathUnavailable)
	}

	auth, err := cloud.BuildOnboardingHandshakeAuth(s.onboarding.EdgeID, s.onboarding.OnboardingSecret)
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

	if s.onboarding != nil && event.EdgeID != s.onboarding.EdgeID {
		return fmt.Errorf(
			"edge activation edgeId %q does not match onboarding edgeId %q",
			event.EdgeID,
			s.onboarding.EdgeID,
		)
	}

	if err := s.runner.ActivateTrustedSession(event.EdgeID, event.PersistentCredential.Secret); err != nil {
		return err
	}

	// A successful activation consumes operator onboarding input in this session.
	s.onboarding = nil

	return nil
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
