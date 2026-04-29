package operator

import "edge_server/go_core/internal/cloud"

type RuntimeOutcome struct {
	Code            string
	RuntimeStatus   string
	CloudConnection string
	AuthSummary     string
}

func MapConnectError(code cloud.ConnectErrorCode) RuntimeOutcome {
	switch code {
	case cloud.ConnectErrorBlocked:
		return RuntimeOutcome{
			Code:            "blocked",
			RuntimeStatus:   "blocked",
			CloudConnection: "rejected",
			AuthSummary:     "blocked",
		}
	case cloud.ConnectErrorEdgeNotFound:
		return RuntimeOutcome{
			Code:            string(code),
			RuntimeStatus:   "waiting_for_credential",
			CloudConnection: "rejected",
			AuthSummary:     "edge_not_found",
		}
	case cloud.ConnectErrorEdgeAuthInternalError:
		return RuntimeOutcome{
			Code:            string(code),
			RuntimeStatus:   "stopped",
			CloudConnection: "rejected",
			AuthSummary:     "internal_error",
		}
	case cloud.ConnectErrorInvalidCredential:
		return RuntimeOutcome{
			Code:            string(code),
			RuntimeStatus:   "waiting_for_credential",
			CloudConnection: "rejected",
			AuthSummary:     "invalid_credential",
		}
	default:
		return RuntimeOutcome{
			Code:            string(code),
			RuntimeStatus:   "retrying",
			CloudConnection: "disconnected",
			AuthSummary:     "retryable_disconnect",
		}
	}
}

func MapDisconnectReason(reason cloud.DisconnectReason) RuntimeOutcome {
	switch reason {
	case cloud.DisconnectReasonCredentialRotated:
		return RuntimeOutcome{
			Code:            string(cloud.DisconnectReasonCredentialRotated),
			RuntimeStatus:   "waiting_for_credential",
			CloudConnection: "rejected",
			AuthSummary:     "credential_replaced",
		}
	case cloud.DisconnectReasonBlocked:
		return RuntimeOutcome{
			Code:            "blocked",
			RuntimeStatus:   "blocked",
			CloudConnection: "rejected",
			AuthSummary:     "blocked",
		}
	case cloud.DisconnectReasonForced, cloud.DisconnectReasonClientRequested:
		return RuntimeOutcome{
			Code:            string(reason),
			RuntimeStatus:   "retrying",
			CloudConnection: "disconnected",
			AuthSummary:     "retryable_disconnect",
		}
	default:
		return RuntimeOutcome{
			Code:            string(reason),
			RuntimeStatus:   "retrying",
			CloudConnection: "disconnected",
			AuthSummary:     "retryable_disconnect",
		}
	}
}

func MapTelemetryDiscardState(trusted bool, connected bool) (RuntimeOutcome, bool) {
	if trusted && connected {
		return RuntimeOutcome{}, false
	}

	if !connected {
		return RuntimeOutcome{
			Code:            "telemetry_discarded_disconnected",
			RuntimeStatus:   "retrying",
			CloudConnection: "disconnected",
			AuthSummary:     "retryable_disconnect",
		}, true
	}

	return RuntimeOutcome{
		Code:            "telemetry_discarded_untrusted",
		RuntimeStatus:   "waiting_for_credential",
		CloudConnection: "rejected",
		AuthSummary:     "credential_replaced",
	}, true
}
