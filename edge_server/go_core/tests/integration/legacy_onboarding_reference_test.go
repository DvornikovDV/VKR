package integration

import (
	"os"
	"testing"
)

func requireLegacyOnboardingReference(t *testing.T) {
	t.Helper()

	if os.Getenv("EDGE_ENABLE_LEGACY_ONBOARDING_REFERENCE") == "1" {
		return
	}

	t.Skip("legacy onboarding reference coverage is quarantined from default acceptance; set EDGE_ENABLE_LEGACY_ONBOARDING_REFERENCE=1 to run it explicitly")
}
