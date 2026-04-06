package operator

import (
	"bytes"
	"encoding/json"
	"testing"
	"time"

	"edge_server/go_core/internal/cloud"
	"edge_server/go_core/internal/runtime"
)

func TestSessionEpochMonotonicity(t *testing.T) {
	tracker := runtime.NewSessionEpochTracker()

	first := tracker.Next()
	second := tracker.Next()

	if first != 1 || second != 2 {
		t.Fatalf("expected monotonic epochs [1,2], got [%d,%d]", first, second)
	}
	if tracker.IsActive(first) {
		t.Fatalf("expected first epoch to be inactive after second starts")
	}
	if !tracker.IsActive(second) {
		t.Fatalf("expected latest epoch to be active")
	}

	tracker.Invalidate()
	if tracker.Current() != 0 {
		t.Fatalf("expected invalidated tracker to reset current epoch to 0, got %d", tracker.Current())
	}
	if tracker.IsActive(second) {
		t.Fatalf("expected previous epoch to become inactive after invalidation")
	}
	third := tracker.Next()
	if third != 3 {
		t.Fatalf("expected next epoch after invalidation to remain monotonic and become 3, got %d", third)
	}
	if !tracker.IsActive(third) {
		t.Fatalf("expected new epoch %d to be active", third)
	}
}

func TestOutcomeMappingFromCloudSignals(t *testing.T) {
	cases := []struct {
		name       string
		got        RuntimeOutcome
		wantCode   string
		wantTrust  string
		wantAction string
	}{
		{
			name:       "blocked connect error maps to blocked trust mode",
			got:        MapConnectError(cloud.ConnectErrorBlocked),
			wantCode:   "blocked",
			wantTrust:  "blocked",
			wantAction: "require_operator_reenable",
		},
		{
			name:       "trust_revoked disconnect maps to re-onboarding-required trust mode",
			got:        MapDisconnectReason(cloud.DisconnectReasonTrustRevoked),
			wantCode:   "trust_revoked",
			wantTrust:  "re_onboarding_required",
			wantAction: "require_re_onboarding",
		},
		{
			name:       "ordinary disconnect maps to disconnected trust mode",
			got:        MapDisconnectReason(cloud.DisconnectReasonClientRequested),
			wantCode:   "client_requested",
			wantTrust:  "disconnected",
			wantAction: "retry_connection",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if tc.got.Code != tc.wantCode {
				t.Fatalf("expected outcome code %q, got %q", tc.wantCode, tc.got.Code)
			}
			if tc.got.TrustMode != tc.wantTrust {
				t.Fatalf("expected trust mode %q, got %q", tc.wantTrust, tc.got.TrustMode)
			}
			if tc.got.OperatorAction != tc.wantAction {
				t.Fatalf("expected operator action %q, got %q", tc.wantAction, tc.got.OperatorAction)
			}
		})
	}
}

func TestStructuredLoggerIncludesEpochAndOutcome(t *testing.T) {
	buf := &bytes.Buffer{}
	tracker := runtime.NewSessionEpochTracker()
	tracker.Next()
	fixedNow := time.Date(2026, 4, 6, 12, 0, 0, 0, time.UTC)

	logger := NewJSONLogger(JSONLoggerConfig{
		Writer:        buf,
		MinLevel:      LogLevelInfo,
		EpochProvider: tracker,
		Now: func() time.Time {
			return fixedNow
		},
	})

	logger.Log(LogLevelWarn, "trusted session rejected", map[string]any{
		"outcome":                    "blocked",
		"cloudErrorCode":             "blocked",
		"credentialSecret":           "plain-credential-secret",
		"onboardingSecret":           "plain-onboarding-secret",
		"persistentCredentialSecret": "plain-persistent-secret",
	})

	var entry map[string]any
	if err := json.Unmarshal(buf.Bytes(), &entry); err != nil {
		t.Fatalf("expected logger to emit JSON: %v", err)
	}

	if entry["level"] != "warn" {
		t.Fatalf("expected warn level, got %v", entry["level"])
	}
	if entry["sessionEpoch"] != float64(1) {
		t.Fatalf("expected sessionEpoch=1, got %v", entry["sessionEpoch"])
	}
	if entry["outcome"] != "blocked" {
		t.Fatalf("expected outcome field, got %v", entry["outcome"])
	}
	if entry["credentialSecret"] != "[REDACTED]" {
		t.Fatalf("expected credentialSecret redaction, got %v", entry["credentialSecret"])
	}
	if entry["onboardingSecret"] != "[REDACTED]" {
		t.Fatalf("expected onboardingSecret redaction, got %v", entry["onboardingSecret"])
	}
	if entry["persistentCredentialSecret"] != "[REDACTED]" {
		t.Fatalf("expected persistentCredentialSecret redaction, got %v", entry["persistentCredentialSecret"])
	}
}
