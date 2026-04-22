package state

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type StatusSnapshot struct {
	EdgeID                  string     `json:"edgeId"`
	RuntimeStatus           string     `json:"runtimeStatus"`
	CloudConnection         string     `json:"cloudConnection"`
	AuthSummary             string     `json:"authSummary"`
	RetryEligible           bool       `json:"retryEligible"`
	LoadedCredentialVersion *int       `json:"loadedCredentialVersion"`
	SourceSummary           string     `json:"sourceSummary"`
	LastTelemetrySentAt     *time.Time `json:"lastTelemetrySentAt"`
	LastReason              *string    `json:"lastReason"`
	UpdatedAt               time.Time  `json:"updatedAt"`
}

type StatusStore struct {
	path string
}

var requiredStatusSnapshotKeys = []string{
	"edgeId",
	"runtimeStatus",
	"cloudConnection",
	"authSummary",
	"retryEligible",
	"loadedCredentialVersion",
	"sourceSummary",
	"lastTelemetrySentAt",
	"lastReason",
	"updatedAt",
}

func NewStatusStore(stateDir string) *StatusStore {
	return &StatusStore{
		path: filepath.Join(stateDir, statusFileName),
	}
}

func (s *StatusStore) Save(status StatusSnapshot) error {
	if err := validateStatusSnapshot(status); err != nil {
		return err
	}

	return atomicWriteJSON(s.path, status, 0o640)
}

func (s *StatusStore) Load() (StatusSnapshot, bool, error) {
	payload, err := os.ReadFile(s.path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return StatusSnapshot{}, false, nil
		}
		return StatusSnapshot{}, false, fmt.Errorf("read %s: %w", statusFileName, err)
	}

	var raw map[string]json.RawMessage
	if err := json.Unmarshal(payload, &raw); err != nil {
		return StatusSnapshot{}, true, fmt.Errorf("parse %s: %w", statusFileName, err)
	}
	if err := validateStatusSnapshotRequiredKeys(raw); err != nil {
		return StatusSnapshot{}, true, err
	}

	var status StatusSnapshot
	if err := json.Unmarshal(payload, &status); err != nil {
		return StatusSnapshot{}, true, fmt.Errorf("parse %s: %w", statusFileName, err)
	}
	if err := validateStatusSnapshot(status); err != nil {
		return StatusSnapshot{}, true, err
	}

	return status, true, nil
}

func validateStatusSnapshotRequiredKeys(raw map[string]json.RawMessage) error {
	for _, key := range requiredStatusSnapshotKeys {
		value, ok := raw[key]
		if !ok {
			return fmt.Errorf("status.%s is required", key)
		}
		if len(bytes.TrimSpace(value)) == 0 {
			return fmt.Errorf("status.%s is required", key)
		}
	}

	if bytes.Equal(bytes.TrimSpace(raw["retryEligible"]), []byte("null")) {
		return fmt.Errorf("status.retryEligible is required")
	}

	return nil
}

func validateStatusSnapshot(status StatusSnapshot) error {
	if strings.TrimSpace(status.EdgeID) == "" {
		return fmt.Errorf("status.edgeId is required")
	}

	switch status.RuntimeStatus {
	case "starting", "connecting", "trusted", "retrying", "degraded", "blocked", "waiting_for_credential", "stopped":
	default:
		return fmt.Errorf("status.runtimeStatus must be starting, connecting, trusted, retrying, degraded, blocked, waiting_for_credential, or stopped")
	}

	if status.CloudConnection != "disconnected" && status.CloudConnection != "connecting" && status.CloudConnection != "trusted" && status.CloudConnection != "rejected" {
		return fmt.Errorf("status.cloudConnection must be disconnected, connecting, trusted, or rejected")
	}

	switch status.AuthSummary {
	case "ok", "retryable_disconnect", "invalid_credential", "blocked", "edge_not_found", "credential_replaced", "internal_error":
	default:
		return fmt.Errorf("status.authSummary must be ok, retryable_disconnect, invalid_credential, blocked, edge_not_found, credential_replaced, or internal_error")
	}

	switch status.SourceSummary {
	case "healthy", "degraded", "failed":
	default:
		return fmt.Errorf("status.sourceSummary must be healthy, degraded, or failed")
	}

	if status.LoadedCredentialVersion != nil && *status.LoadedCredentialVersion <= 0 {
		return fmt.Errorf("status.loadedCredentialVersion must be > 0 when present")
	}

	if status.LastTelemetrySentAt != nil && status.LastTelemetrySentAt.IsZero() {
		return fmt.Errorf("status.lastTelemetrySentAt must not be zero when present")
	}
	if status.UpdatedAt.IsZero() {
		return fmt.Errorf("status.updatedAt is required")
	}

	return nil
}
