package integration

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"edge_server/go_core/internal/cloud"
	"edge_server/go_core/internal/runtime"
)

type onboardingPackageFixture struct {
	EdgeID           string `json:"edgeId"`
	OnboardingSecret string `json:"onboardingSecret"`
	IssuedAt         string `json:"issuedAt"`
	ExpiresAt        string `json:"expiresAt"`
}

func runtimeFixturePath(t *testing.T, name string) string {
	t.Helper()
	return filepath.Join("..", "..", "..", "tests", "fixtures", "runtime", name)
}

func TestRuntimeSmokeFixtureContracts(t *testing.T) {
	configBytes, err := os.ReadFile(runtimeFixturePath(t, "config.yaml"))
	if err != nil {
		t.Fatalf("read config fixture: %v", err)
	}

	configText := string(configBytes)
	requiredConfigSnippets := []string{
		"namespace: /edge",
		"intervalMs: 1000",
		"maxReadings: 100",
		"level: info",
	}
	for _, snippet := range requiredConfigSnippets {
		if !strings.Contains(configText, snippet) {
			t.Fatalf("config fixture must contain %q", snippet)
		}
	}

	onboardingBytes, err := os.ReadFile(runtimeFixturePath(t, "onboarding-package.json"))
	if err != nil {
		t.Fatalf("read onboarding package fixture: %v", err)
	}

	var onboarding onboardingPackageFixture
	if err := json.Unmarshal(onboardingBytes, &onboarding); err != nil {
		t.Fatalf("parse onboarding package fixture: %v", err)
	}

	if onboarding.EdgeID == "" {
		t.Fatal("onboarding fixture must include edgeId")
	}
	if onboarding.OnboardingSecret == "" {
		t.Fatal("onboarding fixture must include onboardingSecret")
	}
	if onboarding.IssuedAt == "" || onboarding.ExpiresAt == "" {
		t.Fatal("onboarding fixture must include issuedAt and expiresAt")
	}

	issuedAt, err := time.Parse(time.RFC3339, onboarding.IssuedAt)
	if err != nil {
		t.Fatalf("issuedAt must be RFC3339: %v", err)
	}
	expiresAt, err := time.Parse(time.RFC3339, onboarding.ExpiresAt)
	if err != nil {
		t.Fatalf("expiresAt must be RFC3339: %v", err)
	}
	if !expiresAt.After(issuedAt) {
		t.Fatal("expiresAt must be after issuedAt")
	}
}

func TestRuntimeSmokeOnboardingOperatorInputBootstrap(t *testing.T) {
	t.Setenv("EDGE_ONBOARDING_SECRET", "smoke-onboarding-secret")
	onboardingPath := runtimeFixturePath(t, "onboarding-package.json")

	pkg, err := runtime.LoadOnboardingPackageFromFile(onboardingPath)
	if err != nil {
		t.Fatalf("load onboarding package fixture: %v", err)
	}

	runner := runtime.New()
	bootstrap := runtime.NewBootstrapSession(runner)
	if err := bootstrap.Bootstrap(runtime.BootstrapInput{
		OnboardingPackagePath: onboardingPath,
	}); err != nil {
		t.Fatalf("bootstrap runtime from operator onboarding package: %v", err)
	}

	auth, err := bootstrap.BuildHandshakeAuth()
	if err != nil {
		t.Fatalf("build startup handshake auth: %v", err)
	}
	if auth.EdgeID != pkg.EdgeID {
		t.Fatalf("expected startup edgeId %q from onboarding package, got %q", pkg.EdgeID, auth.EdgeID)
	}
	if auth.CredentialMode != cloud.CredentialModeOnboarding {
		t.Fatalf("expected startup credential mode onboarding, got %q", auth.CredentialMode)
	}
	if auth.CredentialSecret != pkg.OnboardingSecret {
		t.Fatalf("expected startup onboarding secret from operator input, got %q", auth.CredentialSecret)
	}
}

func TestRuntimeSmokeFixtureDoesNotRequirePersistedRuntimeStateFiles(t *testing.T) {
	for _, fileName := range []string{"credential.json", "runtime-state.json", "status.json"} {
		_, err := os.Stat(runtimeFixturePath(t, fileName))
		if err == nil {
			t.Fatalf("fixture set must not require machine-written runtime state file %q", fileName)
		}
		if !errors.Is(err, os.ErrNotExist) {
			t.Fatalf("inspect fixture %q: %v", fileName, err)
		}
	}
}
