package state

import (
	"fmt"
	"path/filepath"
	"strings"
	"time"
)

type StatusSnapshot struct {
	EdgeID           string    `json:"edgeId"`
	TrustMode        string    `json:"trustMode"`
	CloudConnection  string    `json:"cloudConnection"`
	AdapterState     string    `json:"adapterState"`
	BufferedReadings int       `json:"bufferedReadings"`
	LastReason       *string   `json:"lastReason"`
	UpdatedAt        time.Time `json:"updatedAt"`
}

type StatusStore struct {
	path string
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
	var status StatusSnapshot
	exists, err := readJSONFile(s.path, &status)
	if err != nil {
		return StatusSnapshot{}, exists, err
	}
	if !exists {
		return StatusSnapshot{}, false, nil
	}
	if err := validateStatusSnapshot(status); err != nil {
		return StatusSnapshot{}, true, err
	}

	return status, true, nil
}

func validateStatusSnapshot(status StatusSnapshot) error {
	if strings.TrimSpace(status.EdgeID) == "" {
		return fmt.Errorf("status.edgeId is required")
	}
	if strings.TrimSpace(status.TrustMode) == "" {
		return fmt.Errorf("status.trustMode is required")
	}
	if status.CloudConnection != "disconnected" && status.CloudConnection != "connecting" && status.CloudConnection != "trusted" && status.CloudConnection != "rejected" {
		return fmt.Errorf("status.cloudConnection must be disconnected, connecting, trusted, or rejected")
	}
	if strings.TrimSpace(status.AdapterState) == "" {
		return fmt.Errorf("status.adapterState is required")
	}
	if status.BufferedReadings < 0 {
		return fmt.Errorf("status.bufferedReadings must be >= 0")
	}
	if status.UpdatedAt.IsZero() {
		return fmt.Errorf("status.updatedAt is required")
	}

	return nil
}
