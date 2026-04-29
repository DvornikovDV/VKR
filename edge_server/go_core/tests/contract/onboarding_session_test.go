package contract

import (
	"fmt"
	"testing"

	"edge_server/go_core/internal/cloud"
)

func TestT031ActiveEdgeContractRejectsUnknownEdgeAndSecondSession(t *testing.T) {
	testCases := []struct {
		name    string
		message string
		want    cloud.ConnectErrorCode
	}{
		{
			name:    "unknown edge connect rejection",
			message: "edge_not_found",
			want:    cloud.ConnectErrorEdgeNotFound,
		},
		{
			name:    "single-session rejection",
			message: "invalid_credential",
			want:    cloud.ConnectErrorInvalidCredential,
		},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			err := cloud.NewConnectError(tc.message)
			if err == nil {
				t.Fatalf("expected connect error parser to accept message %q", tc.message)
			}
			if got := cloud.NormalizeConnectError(err); got != tc.want {
				t.Fatalf("expected normalized connect_error %q, got %q", tc.want, got)
			}

			wrapped := fmt.Errorf("socket.io /edge connect_error: %s", tc.message)
			if got := cloud.NormalizeConnectError(wrapped); got != tc.want {
				t.Fatalf("expected wrapped connect_error %q, got %q", tc.want, got)
			}
		})
	}
}

func TestT031LegacyOnboardingRejectionsAreNotActiveEdgeContractCodes(t *testing.T) {
	for _, message := range []string{
		"onboarding_not_allowed",
		"onboarding_package_missing",
		"onboarding_package_expired",
		"onboarding_package_reused",
		"persistent_credential_revoked",
	} {
		err := cloud.NewConnectError(message)
		if typed, ok := err.(cloud.ConnectError); ok {
			t.Fatalf("legacy rejection %q must not normalize as active connect_error %q", message, typed.Code)
		}
		if got := cloud.NormalizeConnectError(err); got != cloud.ConnectErrorInvalidCredential {
			t.Fatalf("legacy rejection %q should collapse to invalid_credential, got %q", message, got)
		}
	}
}
