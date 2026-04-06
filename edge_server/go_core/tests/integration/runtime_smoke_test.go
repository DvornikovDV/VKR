package integration

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
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
		"intervalMs: 1000",
		"maxReadings: 100",
		"maxReadings: 1000",
		"overflowBehavior: drop_oldest",
		"mode: mock-internal",
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
