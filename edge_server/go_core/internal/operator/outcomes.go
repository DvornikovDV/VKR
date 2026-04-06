package operator

import "edge_server/go_core/internal/cloud"

type RuntimeOutcome struct {
	Code           string
	TrustMode      string
	OperatorAction string
}

func MapConnectError(code cloud.ConnectErrorCode) RuntimeOutcome {
	switch code {
	case cloud.ConnectErrorBlocked:
		return RuntimeOutcome{
			Code:           "blocked",
			TrustMode:      "blocked",
			OperatorAction: "require_operator_reenable",
		}
	case cloud.ConnectErrorPersistentCredentialRevoked:
		return RuntimeOutcome{
			Code:           "persistent_credential_revoked",
			TrustMode:      "re_onboarding_required",
			OperatorAction: "require_re_onboarding",
		}
	default:
		return RuntimeOutcome{
			Code:           string(code),
			TrustMode:      "recovery_needed",
			OperatorAction: "retry_or_recover",
		}
	}
}

func MapDisconnectReason(reason cloud.DisconnectReason) RuntimeOutcome {
	switch reason {
	case cloud.DisconnectReasonTrustRevoked:
		return RuntimeOutcome{
			Code:           "trust_revoked",
			TrustMode:      "recovery_needed",
			OperatorAction: "require_re_onboarding",
		}
	case cloud.DisconnectReasonBlocked:
		return RuntimeOutcome{
			Code:           "blocked",
			TrustMode:      "blocked",
			OperatorAction: "require_operator_reenable",
		}
	default:
		return RuntimeOutcome{
			Code:           string(reason),
			TrustMode:      "recovery_needed",
			OperatorAction: "retry_or_recover",
		}
	}
}
