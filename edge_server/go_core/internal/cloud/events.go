package cloud

import (
	"errors"
	"fmt"
	"strings"
)

type ConnectErrorCode string

const (
	ConnectErrorEdgeNotFound          ConnectErrorCode = "edge_not_found"
	ConnectErrorBlocked               ConnectErrorCode = "blocked"
	ConnectErrorInvalidCredential     ConnectErrorCode = "invalid_credential"
	ConnectErrorEdgeAuthInternalError ConnectErrorCode = "edge_auth_internal_error"

	// Deprecated: onboarding-era rejection codes are no longer active /edge contract values.
	ConnectErrorOnboardingNotAllowed        ConnectErrorCode = "onboarding_not_allowed"
	ConnectErrorOnboardingPackageMissing    ConnectErrorCode = "onboarding_package_missing"
	ConnectErrorOnboardingPackageExpired    ConnectErrorCode = "onboarding_package_expired"
	ConnectErrorOnboardingPackageReused     ConnectErrorCode = "onboarding_package_reused"
	ConnectErrorPersistentCredentialRevoked ConnectErrorCode = "persistent_credential_revoked"
)

var knownConnectErrorCodes = map[ConnectErrorCode]struct{}{
	ConnectErrorEdgeNotFound:          {},
	ConnectErrorBlocked:               {},
	ConnectErrorInvalidCredential:     {},
	ConnectErrorEdgeAuthInternalError: {},
}

var connectErrorCodePriority = []ConnectErrorCode{
	ConnectErrorEdgeNotFound,
	ConnectErrorBlocked,
	ConnectErrorInvalidCredential,
	ConnectErrorEdgeAuthInternalError,
}

type DisconnectReason string

const (
	DisconnectReasonForced            DisconnectReason = "edge_forced_disconnect"
	DisconnectReasonCredentialRotated DisconnectReason = "credential_rotated"
	DisconnectReasonBlocked           DisconnectReason = "blocked"
	DisconnectReasonClientRequested   DisconnectReason = "client_requested"

	// Deprecated: active /edge lifecycle uses credential_rotated.
	DisconnectReasonTrustRevoked DisconnectReason = "trust_revoked"
)

var knownDisconnectReasons = map[DisconnectReason]struct{}{
	DisconnectReasonForced:            {},
	DisconnectReasonCredentialRotated: {},
	DisconnectReasonBlocked:           {},
	DisconnectReasonClientRequested:   {},
}

var ordinarySocketDisconnectReasonMap = map[string]DisconnectReason{
	"io client disconnect":        DisconnectReasonClientRequested,
	"client namespace disconnect": DisconnectReasonClientRequested,
	"client_requested":            DisconnectReasonClientRequested,
}

type EdgeDisconnect struct {
	EdgeID string
	Reason DisconnectReason
}

type ConnectError struct {
	Code ConnectErrorCode
}

func (e ConnectError) Error() string {
	return string(e.Code)
}

func NewConnectError(message string) error {
	code, ok := parseConnectErrorCode(message)
	if !ok {
		return errors.New(strings.TrimSpace(message))
	}

	return ConnectError{Code: code}
}

func (d EdgeDisconnect) RequiresCredentialReset() bool {
	return d.Reason == DisconnectReasonCredentialRotated || d.Reason == DisconnectReasonBlocked
}

func (d EdgeDisconnect) AllowsReconnectAttempt() bool {
	return d.Reason != DisconnectReasonClientRequested
}

func ParseEdgeDisconnect(payload any, expectedEdgeID string) (EdgeDisconnect, error) {
	raw, ok := payload.(map[string]any)
	if !ok {
		return EdgeDisconnect{}, fmt.Errorf("edge_disconnect payload must be an object")
	}

	edgeID, err := parseRequiredString(raw, "edgeId")
	if err != nil {
		return EdgeDisconnect{}, err
	}
	if strings.TrimSpace(expectedEdgeID) != "" && edgeID != expectedEdgeID {
		return EdgeDisconnect{}, fmt.Errorf("edge_disconnect edgeId mismatch: expected %q got %q", expectedEdgeID, edgeID)
	}

	reasonRaw, err := parseRequiredString(raw, "reason")
	if err != nil {
		return EdgeDisconnect{}, err
	}
	reason := DisconnectReason(reasonRaw)
	if _, ok := knownDisconnectReasons[reason]; !ok {
		return EdgeDisconnect{}, fmt.Errorf("edge_disconnect reason %q is not recognized", reasonRaw)
	}

	return EdgeDisconnect{
		EdgeID: edgeID,
		Reason: reason,
	}, nil
}

func NormalizeSocketDisconnect(reason string, expectedEdgeID string) EdgeDisconnect {
	normalizedReason := normalizeSocketDisconnectReason(reason)

	return EdgeDisconnect{
		EdgeID: strings.TrimSpace(expectedEdgeID),
		Reason: normalizedReason,
	}
}

func NormalizeConnectError(err error) ConnectErrorCode {
	if err == nil {
		return ConnectErrorInvalidCredential
	}

	for current := err; current != nil; current = errors.Unwrap(current) {
		var typed ConnectError
		if errors.As(current, &typed) {
			return typed.Code
		}
		code, ok := parseConnectErrorCode(current.Error())
		if ok {
			return code
		}
	}

	return ConnectErrorInvalidCredential
}

func parseConnectErrorCode(message string) (ConnectErrorCode, bool) {
	normalized := strings.ToLower(strings.TrimSpace(message))
	if normalized == "" {
		return "", false
	}

	for _, code := range connectErrorCodePriority {
		token := string(code)
		if normalized == token || strings.Contains(normalized, token) {
			return code, true
		}
	}

	return "", false
}

func normalizeSocketDisconnectReason(reason string) DisconnectReason {
	normalized := strings.ToLower(strings.TrimSpace(reason))
	if mapped, ok := ordinarySocketDisconnectReasonMap[normalized]; ok {
		return mapped
	}

	typed := DisconnectReason(normalized)
	if _, ok := knownDisconnectReasons[typed]; ok {
		return typed
	}

	return DisconnectReasonForced
}

func parseRequiredString(raw map[string]any, key string) (string, error) {
	value, ok := raw[key].(string)
	if !ok || strings.TrimSpace(value) == "" {
		return "", fmt.Errorf("%s is required", key)
	}

	return strings.TrimSpace(value), nil
}
