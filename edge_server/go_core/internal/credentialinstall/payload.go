package credentialinstall

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

func ParseDisclosureJSON(payload []byte) (NormalizedCredentialInput, error) {
	var raw RawDisclosureInput
	if err := json.Unmarshal(payload, &raw); err != nil {
		return NormalizedCredentialInput{}, fmt.Errorf("parse credential disclosure json: %w", err)
	}

	edgeID := raw.EdgeID
	credentialSecret := raw.CredentialSecret
	version := raw.Version
	issuedAt := raw.IssuedAt
	if raw.PersistentCredential != nil {
		edgeID = raw.PersistentCredential.EdgeID
		credentialSecret = raw.PersistentCredential.CredentialSecret
		version = raw.PersistentCredential.Version
		issuedAt = raw.PersistentCredential.IssuedAt
	}
	if raw.Data != nil && raw.Data.PersistentCredential != nil {
		edgeID = raw.Data.PersistentCredential.EdgeID
		credentialSecret = raw.Data.PersistentCredential.CredentialSecret
		version = raw.Data.PersistentCredential.Version
		issuedAt = raw.Data.PersistentCredential.IssuedAt
	}

	issuedAtTime, err := parseIssuedAt(issuedAt)
	if err != nil {
		return NormalizedCredentialInput{}, err
	}

	input := NormalizedCredentialInput{
		EdgeID:           strings.TrimSpace(edgeID),
		CredentialSecret: credentialSecret,
		Version:          version,
		IssuedAt:         issuedAtTime,
	}
	if input.EdgeID == "" {
		return NormalizedCredentialInput{}, fmt.Errorf("credential disclosure edgeId is required")
	}
	if strings.TrimSpace(input.CredentialSecret) == "" {
		return NormalizedCredentialInput{}, fmt.Errorf("credential disclosure credentialSecret is required")
	}
	if input.Version <= 0 {
		return NormalizedCredentialInput{}, fmt.Errorf("credential disclosure version must be positive")
	}

	return input, nil
}

func parseIssuedAt(raw string) (time.Time, error) {
	value := strings.TrimSpace(raw)
	if value == "" {
		return time.Time{}, fmt.Errorf("credential disclosure issuedAt is required")
	}

	issuedAt, err := time.Parse(time.RFC3339Nano, value)
	if err != nil {
		return time.Time{}, fmt.Errorf("credential disclosure issuedAt must be RFC3339: %w", err)
	}

	return issuedAt, nil
}
