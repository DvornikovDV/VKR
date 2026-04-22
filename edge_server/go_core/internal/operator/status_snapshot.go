package operator

import (
	"fmt"
	"strings"
	"time"

	"edge_server/go_core/internal/state"
)

type SourceHealthState string

const (
	SourceHealthStateStarting SourceHealthState = "starting"
	SourceHealthStateRunning  SourceHealthState = "running"
	SourceHealthStateDegraded SourceHealthState = "degraded"
	SourceHealthStateFailed   SourceHealthState = "failed"
	SourceHealthStateStopped  SourceHealthState = "stopped"
)

type SourceHealthSnapshot struct {
	State SourceHealthState
}

type StatusProjectionInput struct {
	RuntimeState  state.RuntimeState
	SourceSummary string
	LastReason    *string
	Outcome       *RuntimeOutcome
}

func ProjectStatusSnapshot(input StatusProjectionInput) (state.StatusSnapshot, error) {
	sourceSummary, err := normalizeSourceSummary(input.SourceSummary)
	if err != nil {
		return state.StatusSnapshot{}, err
	}

	runtimeStatus := projectRuntimeStatus(input.RuntimeState, sourceSummary)
	cloudConnection := projectCloudConnection(input.RuntimeState)
	authSummary := projectAuthSummary(input.RuntimeState)
	if input.Outcome != nil {
		if override := strings.TrimSpace(input.Outcome.RuntimeStatus); override != "" {
			runtimeStatus = override
		}
		if override := strings.TrimSpace(input.Outcome.CloudConnection); override != "" {
			cloudConnection = override
		}
		if override := strings.TrimSpace(input.Outcome.AuthSummary); override != "" {
			authSummary = override
		}
	}

	edgeID := strings.TrimSpace(input.RuntimeState.EdgeID)
	if edgeID == "" {
		return state.StatusSnapshot{}, fmt.Errorf("runtimeState.edgeId is required for status projection")
	}
	updatedAt := input.RuntimeState.UpdatedAt.UTC()
	if updatedAt.IsZero() {
		return state.StatusSnapshot{}, fmt.Errorf("runtimeState.updatedAt is required for status projection")
	}

	return state.StatusSnapshot{
		EdgeID:                  edgeID,
		RuntimeStatus:           runtimeStatus,
		CloudConnection:         cloudConnection,
		AuthSummary:             authSummary,
		RetryEligible:           input.RuntimeState.RetryEligible,
		LoadedCredentialVersion: cloneIntPointer(input.RuntimeState.CredentialVersion),
		SourceSummary:           sourceSummary,
		LastTelemetrySentAt:     cloneTimePointer(input.RuntimeState.LastTelemetrySentAt),
		LastReason:              normalizeReason(input.LastReason),
		UpdatedAt:               updatedAt,
	}, nil
}

func ProjectSourceSummary(sources []SourceHealthSnapshot) (string, error) {
	if len(sources) == 0 {
		return "healthy", nil
	}

	hasDegraded := false
	for _, source := range sources {
		switch source.State {
		case SourceHealthStateStarting, SourceHealthStateRunning, SourceHealthStateStopped:
			continue
		case SourceHealthStateDegraded:
			hasDegraded = true
		case SourceHealthStateFailed:
			return "failed", nil
		default:
			return "", fmt.Errorf("source state %q is not supported", source.State)
		}
	}

	if hasDegraded {
		return "degraded", nil
	}

	return "healthy", nil
}

func projectRuntimeStatus(runtimeState state.RuntimeState, sourceSummary string) string {
	switch runtimeState.SessionState {
	case state.SessionStateStartup:
		return "starting"
	case state.SessionStateConnecting:
		return "connecting"
	case state.SessionStateTrusted:
		if sourceSummary == "degraded" || sourceSummary == "failed" {
			return "degraded"
		}
		return "trusted"
	case state.SessionStateRetryWait:
		return "retrying"
	case state.SessionStateOperatorActionRequired:
		switch runtimeState.AuthOutcome {
		case state.AuthOutcomeBlocked:
			return "blocked"
		case state.AuthOutcomeInvalidCredential, state.AuthOutcomeEdgeNotFound, state.AuthOutcomeCredentialRotated:
			return "waiting_for_credential"
		default:
			return "stopped"
		}
	case state.SessionStateStopped:
		return "stopped"
	default:
		return "stopped"
	}
}

func projectCloudConnection(runtimeState state.RuntimeState) string {
	switch runtimeState.SessionState {
	case state.SessionStateStartup, state.SessionStateConnecting:
		return "connecting"
	case state.SessionStateTrusted:
		return "trusted"
	case state.SessionStateRetryWait, state.SessionStateStopped:
		return "disconnected"
	case state.SessionStateOperatorActionRequired:
		switch runtimeState.AuthOutcome {
		case state.AuthOutcomeBlocked,
			state.AuthOutcomeInvalidCredential,
			state.AuthOutcomeEdgeNotFound,
			state.AuthOutcomeCredentialRotated,
			state.AuthOutcomeEdgeAuthInternalErr:
			return "rejected"
		default:
			return "disconnected"
		}
	default:
		return "disconnected"
	}
}

func projectAuthSummary(runtimeState state.RuntimeState) string {
	switch runtimeState.AuthOutcome {
	case state.AuthOutcomeAccepted, state.AuthOutcomeNeverAttempted:
		return "ok"
	case state.AuthOutcomeDisconnected:
		if runtimeState.RetryEligible {
			return "retryable_disconnect"
		}
		return "internal_error"
	case state.AuthOutcomeInvalidCredential:
		return "invalid_credential"
	case state.AuthOutcomeBlocked:
		return "blocked"
	case state.AuthOutcomeEdgeNotFound:
		return "edge_not_found"
	case state.AuthOutcomeCredentialRotated:
		return "credential_replaced"
	case state.AuthOutcomeEdgeAuthInternalErr:
		return "internal_error"
	default:
		return "internal_error"
	}
}

func normalizeSourceSummary(summary string) (string, error) {
	normalized := strings.TrimSpace(summary)
	switch normalized {
	case "healthy", "degraded", "failed":
		return normalized, nil
	default:
		return "", fmt.Errorf("status projection sourceSummary %q is not supported", summary)
	}
}

func normalizeReason(reason *string) *string {
	if reason == nil {
		return nil
	}

	normalized := strings.TrimSpace(*reason)
	if normalized == "" {
		return nil
	}

	value := normalized
	return &value
}

func cloneIntPointer(value *int) *int {
	if value == nil {
		return nil
	}

	copy := *value
	return &copy
}

func cloneTimePointer(value *time.Time) *time.Time {
	if value == nil {
		return nil
	}

	copy := value.UTC()
	return &copy
}
