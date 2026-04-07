package contract

import (
	"path/filepath"
	"testing"
	"time"

	"edge_server/go_core/internal/cloud"
	"edge_server/go_core/internal/runtime"
)

func onboardingFixturePath(t *testing.T, name string) string {
	t.Helper()
	return filepath.Join("..", "..", "..", "tests", "fixtures", "runtime", name)
}

func TestReproTaskT011OnboardingSessionLifecycle(t *testing.T) {
	t.Setenv("EDGE_ONBOARDING_SECRET", "first-onboarding-secret")
	onboardingPath := onboardingFixturePath(t, "onboarding-package.json")

	packageInput, err := runtime.LoadOnboardingPackageFromFile(onboardingPath)
	if err != nil {
		t.Fatalf("load onboarding package from operator input: %v", err)
	}

	firstProcess := runtime.New()
	firstSession := runtime.NewBootstrapSession(firstProcess)
	if err := firstSession.Bootstrap(runtime.BootstrapInput{
		OnboardingPackagePath: onboardingPath,
	}); err != nil {
		t.Fatalf("bootstrap first process from operator onboarding input: %v", err)
	}

	firstAuth, err := firstSession.BuildHandshakeAuth()
	if err != nil {
		t.Fatalf("build first process handshake auth: %v", err)
	}
	if firstAuth.EdgeID != packageInput.EdgeID {
		t.Fatalf("expected first process edgeId %q, got %q", packageInput.EdgeID, firstAuth.EdgeID)
	}
	if firstAuth.CredentialMode != cloud.CredentialModeOnboarding {
		t.Fatalf("expected first process onboarding credential mode, got %q", firstAuth.CredentialMode)
	}
	if firstAuth.CredentialSecret != packageInput.OnboardingSecret {
		t.Fatalf("expected first process onboarding secret from operator input, got %q", firstAuth.CredentialSecret)
	}

	activation := cloud.EdgeActivation{
		EdgeID:         packageInput.EdgeID,
		LifecycleState: "Active",
		PersistentCredential: cloud.PersistentCredential{
			Version:  1,
			Secret:   "persistent-secret-v1",
			IssuedAt: time.Date(2026, time.April, 6, 10, 0, 0, 0, time.UTC),
		},
	}
	if err := firstSession.HandleEdgeActivation(activation); err != nil {
		t.Fatalf("handle edge activation: %v", err)
	}
	firstProcess.MarkDisconnected("transport_close")

	reconnectAuth, err := firstSession.BuildHandshakeAuth()
	if err != nil {
		t.Fatalf("build reconnect handshake auth: %v", err)
	}
	if reconnectAuth.CredentialMode != cloud.CredentialModePersistent {
		t.Fatalf("expected same-process reconnect to use persistent mode, got %q", reconnectAuth.CredentialMode)
	}
	if reconnectAuth.CredentialSecret != "persistent-secret-v1" {
		t.Fatalf("expected same-process reconnect to reuse in-memory persistent secret, got %q", reconnectAuth.CredentialSecret)
	}

	freshProcess := runtime.New()
	freshSession := runtime.NewBootstrapSession(freshProcess)
	if err := freshSession.Bootstrap(runtime.BootstrapInput{
		OnboardingPackagePath: onboardingPath,
	}); err != nil {
		t.Fatalf("bootstrap fresh process from operator onboarding input: %v", err)
	}

	freshSnapshot := freshProcess.StateSnapshot()
	if freshSnapshot.Trusted {
		t.Fatalf("expected fresh process startup to remain untrusted, got %+v", freshSnapshot)
	}
	if freshSnapshot.CredentialMode != runtime.CredentialModeOnboarding {
		t.Fatalf("expected fresh process startup to begin in onboarding mode, got %q", freshSnapshot.CredentialMode)
	}

	freshAuth, err := freshSession.BuildHandshakeAuth()
	if err != nil {
		t.Fatalf("build fresh process startup handshake auth: %v", err)
	}
	if freshAuth.CredentialMode != cloud.CredentialModeOnboarding {
		t.Fatalf("expected fresh process startup handshake to require onboarding mode, got %q", freshAuth.CredentialMode)
	}
	if freshAuth.CredentialSecret != packageInput.OnboardingSecret {
		t.Fatalf("expected fresh process startup to require operator onboarding input again, got %q", freshAuth.CredentialSecret)
	}
}
