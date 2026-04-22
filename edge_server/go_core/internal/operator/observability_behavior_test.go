package operator

import (
	"bytes"
	"encoding/json"
	"testing"
	"time"

	"edge_server/go_core/internal/cloud"
)

type fixedEpochProvider struct {
	epoch uint64
}

func (p fixedEpochProvider) Current() uint64 {
	return p.epoch
}

func TestOutcomeMappingFromCloudSignals(t *testing.T) {
	cases := []struct {
		name              string
		got               RuntimeOutcome
		wantCode          string
		wantRuntimeStatus string
		wantCloud         string
		wantAuthSummary   string
	}{
		{
			name:              "blocked connect error maps to blocked status contract",
			got:               MapConnectError(cloud.ConnectErrorBlocked),
			wantCode:          "blocked",
			wantRuntimeStatus: "blocked",
			wantCloud:         "rejected",
			wantAuthSummary:   "blocked",
		},
		{
			name:              "trust revoked disconnect maps to waiting_for_credential status contract",
			got:               MapDisconnectReason(cloud.DisconnectReasonTrustRevoked),
			wantCode:          "trust_revoked",
			wantRuntimeStatus: "waiting_for_credential",
			wantCloud:         "rejected",
			wantAuthSummary:   "credential_replaced",
		},
		{
			name:              "ordinary disconnect maps to retrying status contract",
			got:               MapDisconnectReason(cloud.DisconnectReasonClientRequested),
			wantCode:          "client_requested",
			wantRuntimeStatus: "retrying",
			wantCloud:         "disconnected",
			wantAuthSummary:   "retryable_disconnect",
		},
		{
			name:              "telemetry discard while disconnected maps to retrying status contract",
			got:               telemetryDiscardOutcome(t, false, false),
			wantCode:          "telemetry_discarded_disconnected",
			wantRuntimeStatus: "retrying",
			wantCloud:         "disconnected",
			wantAuthSummary:   "retryable_disconnect",
		},
		{
			name:              "telemetry discard while untrusted maps to waiting_for_credential status contract",
			got:               telemetryDiscardOutcome(t, false, true),
			wantCode:          "telemetry_discarded_untrusted",
			wantRuntimeStatus: "waiting_for_credential",
			wantCloud:         "rejected",
			wantAuthSummary:   "credential_replaced",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if tc.got.Code != tc.wantCode {
				t.Fatalf("expected outcome code %q, got %q", tc.wantCode, tc.got.Code)
			}
			if tc.got.RuntimeStatus != tc.wantRuntimeStatus {
				t.Fatalf("expected runtimeStatus %q, got %q", tc.wantRuntimeStatus, tc.got.RuntimeStatus)
			}
			if tc.got.CloudConnection != tc.wantCloud {
				t.Fatalf("expected cloudConnection %q, got %q", tc.wantCloud, tc.got.CloudConnection)
			}
			if tc.got.AuthSummary != tc.wantAuthSummary {
				t.Fatalf("expected authSummary %q, got %q", tc.wantAuthSummary, tc.got.AuthSummary)
			}
		})
	}
}

func telemetryDiscardOutcome(t *testing.T, trusted bool, connected bool) RuntimeOutcome {
	t.Helper()

	outcome, discard := MapTelemetryDiscardState(trusted, connected)
	if !discard {
		t.Fatal("expected telemetry state to require discard")
	}

	return outcome
}

func TestStructuredLoggerIncludesEpochAndOutcome(t *testing.T) {
	buf := &bytes.Buffer{}
	fixedNow := time.Date(2026, 4, 6, 12, 0, 0, 0, time.UTC)

	logger := NewJSONLogger(JSONLoggerConfig{
		Writer:        buf,
		MinLevel:      LogLevelInfo,
		EpochProvider: fixedEpochProvider{epoch: 1},
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
