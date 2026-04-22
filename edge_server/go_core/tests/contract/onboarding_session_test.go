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
	requireLegacyOnboardingReference(t)
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
	if err := firstProcess.MarkDisconnected("transport_close"); err != nil {
		t.Fatalf("mark first process disconnected: %v", err)
	}

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

func TestReproTaskT011bConsumedOnboardingDoesNotCreateFutureTrustPathWithoutFreshOperatorInput(t *testing.T) {
	requireLegacyOnboardingReference(t)
	t.Setenv("EDGE_ONBOARDING_SECRET", "stale-onboarding-secret")
	onboardingPath := onboardingFixturePath(t, "onboarding-package.json")

	firstProcess := runtime.New()
	firstSession := runtime.NewBootstrapSession(firstProcess)
	if err := firstSession.Bootstrap(runtime.BootstrapInput{
		OnboardingPackagePath: onboardingPath,
	}); err != nil {
		t.Fatalf("bootstrap first process from operator onboarding input: %v", err)
	}

	if err := firstSession.HandleEdgeActivation(cloud.EdgeActivation{
		EdgeID:         "507f1f77bcf86cd799439011",
		LifecycleState: "Active",
		PersistentCredential: cloud.PersistentCredential{
			Version:  1,
			Secret:   "persistent-secret-v1",
			IssuedAt: time.Date(2026, time.April, 6, 10, 0, 0, 0, time.UTC),
		},
	}); err != nil {
		t.Fatalf("handle edge activation: %v", err)
	}

	if err := firstProcess.MarkUntrusted("trust_revoked", true); err != nil {
		t.Fatalf("mark first process untrusted: %v", err)
	}

	if _, err := firstSession.BuildHandshakeAuth(); err == nil {
		t.Fatal("expected consumed onboarding package to be unusable after trust loss without fresh operator input")
	}
}

func TestReproTaskT014bOnboardingTimestampsAreOptionalAndValidatedOnlyWhenPresent(t *testing.T) {
	requireLegacyOnboardingReference(t)
	t.Setenv("EDGE_ONBOARDING_SECRET", "optional-ts-secret")

	testCases := []struct {
		name    string
		rawJSON string
		wantErr bool
	}{
		{
			name: "accepts onboarding package without issuedAt and expiresAt",
			rawJSON: `{
				"edgeId": "507f1f77bcf86cd799439011",
				"onboardingSecret": "${EDGE_ONBOARDING_SECRET}"
			}`,
			wantErr: false,
		},
		{
			name: "accepts onboarding package with issuedAt only",
			rawJSON: `{
				"edgeId": "507f1f77bcf86cd799439011",
				"onboardingSecret": "${EDGE_ONBOARDING_SECRET}",
				"issuedAt": "2026-04-07T09:00:00Z"
			}`,
			wantErr: false,
		},
		{
			name: "accepts onboarding package with expiresAt only",
			rawJSON: `{
				"edgeId": "507f1f77bcf86cd799439011",
				"onboardingSecret": "${EDGE_ONBOARDING_SECRET}",
				"expiresAt": "2026-04-07T10:00:00Z"
			}`,
			wantErr: false,
		},
		{
			name: "rejects onboarding package when both timestamps are present but inconsistent",
			rawJSON: `{
				"edgeId": "507f1f77bcf86cd799439011",
				"onboardingSecret": "${EDGE_ONBOARDING_SECRET}",
				"issuedAt": "2026-04-07T10:00:00Z",
				"expiresAt": "2026-04-07T09:00:00Z"
			}`,
			wantErr: true,
		},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			_, err := runtime.ParseOnboardingPackage([]byte(tc.rawJSON))
			if tc.wantErr && err == nil {
				t.Fatal("expected onboarding package parse to fail")
			}
			if !tc.wantErr && err != nil {
				t.Fatalf("expected onboarding package parse to succeed, got error: %v", err)
			}
		})
	}
}
