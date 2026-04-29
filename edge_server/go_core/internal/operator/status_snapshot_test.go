package operator

import (
	"strings"
	"testing"
	"time"

	"edge_server/go_core/internal/state"
)

func TestProjectStatusSnapshotTrustedHealthy(t *testing.T) {
	updatedAt := time.Date(2026, 4, 22, 10, 0, 0, 0, time.UTC)
	telemetryAt := time.Date(2026, 4, 22, 9, 59, 0, 0, time.UTC)
	credentialVersion := 5
	lastReason := "steady trusted session"

	snapshot, err := ProjectStatusSnapshot(StatusProjectionInput{
		RuntimeState: state.RuntimeState{
			EdgeID:               "507f1f77bcf86cd799439011",
			CredentialVersion:    &credentialVersion,
			CredentialStatus:     state.CredentialStatusLoaded,
			SessionState:         state.SessionStateTrusted,
			AuthOutcome:          state.AuthOutcomeAccepted,
			RetryEligible:        true,
			LastTelemetrySentAt:  &telemetryAt,
			SourceConfigRevision: "rev-007",
			UpdatedAt:            updatedAt,
		},
		SourceSummary: "healthy",
		LastReason:    &lastReason,
	})
	if err != nil {
		t.Fatalf("project trusted status snapshot: %v", err)
	}

	if snapshot.RuntimeStatus != "trusted" {
		t.Fatalf("expected runtimeStatus=trusted, got %q", snapshot.RuntimeStatus)
	}
	if snapshot.CloudConnection != "trusted" {
		t.Fatalf("expected cloudConnection=trusted, got %q", snapshot.CloudConnection)
	}
	if snapshot.AuthSummary != "ok" {
		t.Fatalf("expected authSummary=ok, got %q", snapshot.AuthSummary)
	}
	if snapshot.LoadedCredentialVersion == nil || *snapshot.LoadedCredentialVersion != credentialVersion {
		t.Fatalf("expected loadedCredentialVersion=%d, got %+v", credentialVersion, snapshot.LoadedCredentialVersion)
	}
	if snapshot.LastTelemetrySentAt == nil || !snapshot.LastTelemetrySentAt.Equal(telemetryAt) {
		t.Fatalf("expected lastTelemetrySentAt=%s, got %+v", telemetryAt.Format(time.RFC3339), snapshot.LastTelemetrySentAt)
	}
	if snapshot.LastReason == nil || *snapshot.LastReason != lastReason {
		t.Fatalf("expected lastReason=%q, got %+v", lastReason, snapshot.LastReason)
	}
}

func TestProjectStatusSnapshotOperatorActionBlocked(t *testing.T) {
	updatedAt := time.Date(2026, 4, 22, 10, 10, 0, 0, time.UTC)

	snapshot, err := ProjectStatusSnapshot(StatusProjectionInput{
		RuntimeState: state.RuntimeState{
			EdgeID:               "507f1f77bcf86cd799439011",
			CredentialStatus:     state.CredentialStatusBlocked,
			SessionState:         state.SessionStateOperatorActionRequired,
			AuthOutcome:          state.AuthOutcomeBlocked,
			RetryEligible:        false,
			SourceConfigRevision: "rev-007",
			UpdatedAt:            updatedAt,
		},
		SourceSummary: "failed",
	})
	if err != nil {
		t.Fatalf("project blocked status snapshot: %v", err)
	}

	if snapshot.RuntimeStatus != "blocked" {
		t.Fatalf("expected runtimeStatus=blocked, got %q", snapshot.RuntimeStatus)
	}
	if snapshot.CloudConnection != "rejected" {
		t.Fatalf("expected cloudConnection=rejected, got %q", snapshot.CloudConnection)
	}
	if snapshot.AuthSummary != "blocked" {
		t.Fatalf("expected authSummary=blocked, got %q", snapshot.AuthSummary)
	}
}

func TestProjectStatusSnapshotUsesOutcomeOverride(t *testing.T) {
	updatedAt := time.Date(2026, 4, 22, 10, 20, 0, 0, time.UTC)

	snapshot, err := ProjectStatusSnapshot(StatusProjectionInput{
		RuntimeState: state.RuntimeState{
			EdgeID:               "507f1f77bcf86cd799439011",
			CredentialStatus:     state.CredentialStatusSuperseded,
			SessionState:         state.SessionStateOperatorActionRequired,
			AuthOutcome:          state.AuthOutcomeCredentialRotated,
			RetryEligible:        false,
			SourceConfigRevision: "rev-007",
			UpdatedAt:            updatedAt,
		},
		SourceSummary: "degraded",
		Outcome: &RuntimeOutcome{
			Code:            "credential_rotated",
			RuntimeStatus:   "waiting_for_credential",
			CloudConnection: "rejected",
			AuthSummary:     "credential_replaced",
		},
	})
	if err != nil {
		t.Fatalf("project status snapshot with outcome override: %v", err)
	}

	if snapshot.RuntimeStatus != "waiting_for_credential" {
		t.Fatalf("expected runtimeStatus=waiting_for_credential, got %q", snapshot.RuntimeStatus)
	}
	if snapshot.CloudConnection != "rejected" {
		t.Fatalf("expected cloudConnection=rejected, got %q", snapshot.CloudConnection)
	}
	if snapshot.AuthSummary != "credential_replaced" {
		t.Fatalf("expected authSummary=credential_replaced, got %q", snapshot.AuthSummary)
	}
}

func TestProjectStatusSnapshotRejectsUnknownSourceSummary(t *testing.T) {
	updatedAt := time.Date(2026, 4, 22, 10, 30, 0, 0, time.UTC)

	_, err := ProjectStatusSnapshot(StatusProjectionInput{
		RuntimeState: state.RuntimeState{
			EdgeID:               "507f1f77bcf86cd799439011",
			CredentialStatus:     state.CredentialStatusLoaded,
			SessionState:         state.SessionStateStartup,
			AuthOutcome:          state.AuthOutcomeNeverAttempted,
			RetryEligible:        false,
			SourceConfigRevision: "rev-007",
			UpdatedAt:            updatedAt,
		},
		SourceSummary: "partial",
	})
	if err == nil || !strings.Contains(err.Error(), "sourceSummary") {
		t.Fatalf("expected sourceSummary validation error, got %v", err)
	}
}

func TestProjectSourceSummary(t *testing.T) {
	summary, err := ProjectSourceSummary([]SourceHealthSnapshot{
		{State: SourceHealthStateRunning},
		{State: SourceHealthStateDegraded},
	})
	if err != nil {
		t.Fatalf("project source summary: %v", err)
	}
	if summary != "degraded" {
		t.Fatalf("expected degraded source summary, got %q", summary)
	}

	failedSummary, err := ProjectSourceSummary([]SourceHealthSnapshot{
		{State: SourceHealthStateRunning},
		{State: SourceHealthStateFailed},
	})
	if err != nil {
		t.Fatalf("project failed source summary: %v", err)
	}
	if failedSummary != "failed" {
		t.Fatalf("expected failed source summary, got %q", failedSummary)
	}
}
