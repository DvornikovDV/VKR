package runtime

import (
	"errors"
	"fmt"
	"sync"

	"edge_server/go_core/internal/cloud"
)

var ErrAuthPathUnavailable = errors.New("runtime auth path is unavailable")

type BootstrapInput struct {
	OnboardingPackagePath string
	OnboardingPackageJSON string
}

type BootstrapSession struct {
	runner *Runner

	mu sync.RWMutex
}

func NewBootstrapSession(runner *Runner) *BootstrapSession {
	session := &BootstrapSession{runner: runner}

	if runner != nil {
		runner.attachBootstrapSession(session)
	}

	return session
}

func (s *BootstrapSession) Bootstrap(input BootstrapInput) error {
	if s == nil || s.runner == nil {
		return fmt.Errorf("runtime bootstrap session requires a runner")
	}

	return fmt.Errorf("%w: current credential.json is required", ErrAuthPathUnavailable)
}

func (s *BootstrapSession) BuildHandshakeAuth() (cloud.HandshakeAuth, error) {
	if s == nil || s.runner == nil {
		return cloud.HandshakeAuth{}, fmt.Errorf("runtime bootstrap session requires a runner")
	}

	snapshot := s.runner.StateSnapshot()
	if snapshot.PersistentCredentialSecret != nil {
		auth, err := cloud.BuildPersistentHandshakeAuth(snapshot.EdgeID, *snapshot.PersistentCredentialSecret)
		if err != nil {
			return cloud.HandshakeAuth{}, fmt.Errorf("build persistent handshake auth: %w", err)
		}
		return auth, nil
	}

	return cloud.HandshakeAuth{}, fmt.Errorf("%w: current credential.json is required before handshake", ErrAuthPathUnavailable)
}
