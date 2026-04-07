package cloud

import (
	"errors"
	"fmt"
	"strings"
	"time"
)

type ConnectErrorCode string

const (
	ConnectErrorEdgeNotFound                ConnectErrorCode = "edge_not_found"
	ConnectErrorBlocked                     ConnectErrorCode = "blocked"
	ConnectErrorOnboardingNotAllowed        ConnectErrorCode = "onboarding_not_allowed"
	ConnectErrorOnboardingPackageMissing    ConnectErrorCode = "onboarding_package_missing"
	ConnectErrorOnboardingPackageExpired    ConnectErrorCode = "onboarding_package_expired"
	ConnectErrorOnboardingPackageReused     ConnectErrorCode = "onboarding_package_reused"
	ConnectErrorInvalidCredential           ConnectErrorCode = "invalid_credential"
	ConnectErrorPersistentCredentialRevoked ConnectErrorCode = "persistent_credential_revoked"
	ConnectErrorEdgeAuthInternalError       ConnectErrorCode = "edge_auth_internal_error"
)

var knownConnectErrorCodes = map[ConnectErrorCode]struct{}{
	ConnectErrorEdgeNotFound:                {},
	ConnectErrorBlocked:                     {},
	ConnectErrorOnboardingNotAllowed:        {},
	ConnectErrorOnboardingPackageMissing:    {},
	ConnectErrorOnboardingPackageExpired:    {},
	ConnectErrorOnboardingPackageReused:     {},
	ConnectErrorInvalidCredential:           {},
	ConnectErrorPersistentCredentialRevoked: {},
	ConnectErrorEdgeAuthInternalError:       {},
}

var connectErrorCodePriority = []ConnectErrorCode{
	ConnectErrorOnboardingPackageMissing,
	ConnectErrorOnboardingPackageExpired,
	ConnectErrorOnboardingPackageReused,
	ConnectErrorPersistentCredentialRevoked,
	ConnectErrorOnboardingNotAllowed,
	ConnectErrorEdgeAuthInternalError,
	ConnectErrorEdgeNotFound,
	ConnectErrorInvalidCredential,
	ConnectErrorBlocked,
}

type DisconnectReason string

const (
	DisconnectReasonForced          DisconnectReason = "edge_forced_disconnect"
	DisconnectReasonTrustRevoked    DisconnectReason = "trust_revoked"
	DisconnectReasonBlocked         DisconnectReason = "blocked"
	DisconnectReasonClientRequested DisconnectReason = "client_requested"
)

var knownDisconnectReasons = map[DisconnectReason]struct{}{
	DisconnectReasonForced:          {},
	DisconnectReasonTrustRevoked:    {},
	DisconnectReasonBlocked:         {},
	DisconnectReasonClientRequested: {},
}

var ordinarySocketDisconnectReasonMap = map[string]DisconnectReason{
	"io client disconnect":        DisconnectReasonClientRequested,
	"client namespace disconnect": DisconnectReasonClientRequested,
	"client_requested":            DisconnectReasonClientRequested,
}

type EdgeActivation struct {
	EdgeID               string
	LifecycleState       string
	PersistentCredential PersistentCredential
}

type PersistentCredential struct {
	Version  int
	Secret   string
	IssuedAt time.Time
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
	return d.Reason == DisconnectReasonTrustRevoked || d.Reason == DisconnectReasonBlocked
}

func (d EdgeDisconnect) AllowsReconnectAttempt() bool {
	return d.Reason != DisconnectReasonClientRequested
}

func (a EdgeActivation) PersistentReconnectAuth() (HandshakeAuth, error) {
	if strings.TrimSpace(a.EdgeID) == "" {
		return HandshakeAuth{}, fmt.Errorf("edge activation edgeId is required")
	}
	if strings.TrimSpace(a.LifecycleState) != "Active" {
		return HandshakeAuth{}, fmt.Errorf("edge activation lifecycleState must be Active")
	}

	return BuildPersistentHandshakeAuth(a.EdgeID, a.PersistentCredential.Secret)
}

func ParseEdgeActivation(payload any, expectedEdgeID string) (EdgeActivation, error) {
	raw, ok := payload.(map[string]any)
	if !ok {
		return EdgeActivation{}, fmt.Errorf("edge_activation payload must be an object")
	}

	edgeID, err := parseRequiredString(raw, "edgeId")
	if err != nil {
		return EdgeActivation{}, err
	}
	if strings.TrimSpace(expectedEdgeID) != "" && edgeID != expectedEdgeID {
		return EdgeActivation{}, fmt.Errorf("edge_activation edgeId mismatch: expected %q got %q", expectedEdgeID, edgeID)
	}

	lifecycleState, err := parseRequiredString(raw, "lifecycleState")
	if err != nil {
		return EdgeActivation{}, err
	}
	if lifecycleState != "Active" {
		return EdgeActivation{}, fmt.Errorf("edge_activation lifecycleState must be Active")
	}

	credentialRaw, ok := raw["persistentCredential"].(map[string]any)
	if !ok {
		return EdgeActivation{}, fmt.Errorf("edge_activation persistentCredential must be an object")
	}

	version, err := parseRequiredPositiveInt(credentialRaw, "version")
	if err != nil {
		return EdgeActivation{}, fmt.Errorf("edge_activation persistentCredential.%w", err)
	}
	secret, err := parseRequiredString(credentialRaw, "secret")
	if err != nil {
		return EdgeActivation{}, fmt.Errorf("edge_activation persistentCredential.%w", err)
	}
	issuedAtRaw, err := parseRequiredString(credentialRaw, "issuedAt")
	if err != nil {
		return EdgeActivation{}, fmt.Errorf("edge_activation persistentCredential.%w", err)
	}
	issuedAt, err := time.Parse(time.RFC3339, issuedAtRaw)
	if err != nil {
		return EdgeActivation{}, fmt.Errorf("edge_activation persistentCredential.issuedAt must be RFC3339: %w", err)
	}

	return EdgeActivation{
		EdgeID:         edgeID,
		LifecycleState: lifecycleState,
		PersistentCredential: PersistentCredential{
			Version:  version,
			Secret:   secret,
			IssuedAt: issuedAt.UTC(),
		},
	}, nil
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

func parseRequiredPositiveInt(raw map[string]any, key string) (int, error) {
	value, ok := raw[key]
	if !ok {
		return 0, fmt.Errorf("%s is required", key)
	}

	switch typed := value.(type) {
	case int:
		if typed > 0 {
			return typed, nil
		}
	case int32:
		if typed > 0 {
			return int(typed), nil
		}
	case int64:
		if typed > 0 {
			return int(typed), nil
		}
	case float64:
		asInt := int(typed)
		if typed == float64(asInt) && asInt > 0 {
			return asInt, nil
		}
	}

	return 0, errors.New(key + " must be a positive integer")
}
