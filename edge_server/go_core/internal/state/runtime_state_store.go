package state

import (
	"fmt"
	"path/filepath"
	"strings"
	"time"
)

type RuntimeState struct {
	TrustMode            string     `json:"trustMode"`
	LastOutcome          string     `json:"lastOutcome"`
	LastCloudErrorCode   *string    `json:"lastCloudErrorCode"`
	LastDisconnectReason *string    `json:"lastDisconnectReason"`
	LastTrustedSessionAt *time.Time `json:"lastTrustedSessionAt"`
	LastTelemetryAt      *time.Time `json:"lastTelemetryAt"`
	BacklogSize          int        `json:"backlogSize"`
	LastBacklogOverflow  *string    `json:"lastBacklogOverflow"`
	SourceConfigRevision string     `json:"sourceConfigRevision"`
	AdapterMode          string     `json:"adapterMode"`
}

type RuntimeStateStore struct {
	path string
}

func NewRuntimeStateStore(stateDir string) *RuntimeStateStore {
	return &RuntimeStateStore{
		path: filepath.Join(stateDir, runtimeStateFileName),
	}
}

func (s *RuntimeStateStore) Save(state RuntimeState) error {
	if err := validateRuntimeState(state); err != nil {
		return err
	}

	return atomicWriteJSON(s.path, state, 0o640)
}

func (s *RuntimeStateStore) Load() (RuntimeState, bool, error) {
	var state RuntimeState
	exists, err := readJSONFile(s.path, &state)
	if err != nil {
		return RuntimeState{}, exists, err
	}
	if !exists {
		return RuntimeState{}, false, nil
	}
	if err := validateRuntimeState(state); err != nil {
		return RuntimeState{}, true, err
	}

	return state, true, nil
}

func validateRuntimeState(state RuntimeState) error {
	if strings.TrimSpace(state.TrustMode) == "" {
		return fmt.Errorf("runtimeState.trustMode is required")
	}
	if strings.TrimSpace(state.LastOutcome) == "" {
		return fmt.Errorf("runtimeState.lastOutcome is required")
	}
	if state.BacklogSize < 0 {
		return fmt.Errorf("runtimeState.backlogSize must be >= 0")
	}
	if strings.TrimSpace(state.SourceConfigRevision) == "" {
		return fmt.Errorf("runtimeState.sourceConfigRevision is required")
	}
	if state.AdapterMode != "mock-internal" && state.AdapterMode != "worker-process" {
		return fmt.Errorf("runtimeState.adapterMode must be mock-internal or worker-process")
	}

	return nil
}
