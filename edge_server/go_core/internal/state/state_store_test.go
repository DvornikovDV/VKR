package state

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestStoresLoadMissingAsFirstRun(t *testing.T) {
	stateDir := t.TempDir()

	cases := []struct {
		name string
		load func(t *testing.T, stateDir string)
	}{
		{
			name: "credential store",
			load: func(t *testing.T, stateDir string) {
				_, exists, err := NewCredentialStore(stateDir).Load()
				if err != nil || exists {
					t.Fatalf("expected missing credential to be first-run state, exists=%v err=%v", exists, err)
				}
			},
		},
		{
			name: "runtime state store",
			load: func(t *testing.T, stateDir string) {
				_, exists, err := NewRuntimeStateStore(stateDir).Load()
				if err != nil || exists {
					t.Fatalf("expected missing runtime-state to be first-run state, exists=%v err=%v", exists, err)
				}
			},
		},
		{
			name: "status store",
			load: func(t *testing.T, stateDir string) {
				_, exists, err := NewStatusStore(stateDir).Load()
				if err != nil || exists {
					t.Fatalf("expected missing status to be first-run state, exists=%v err=%v", exists, err)
				}
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			tc.load(t, stateDir)
		})
	}
}

func TestCredentialStoreAtomicReplaceAndCorruptRecovery(t *testing.T) {
	stateDir := t.TempDir()
	store := NewCredentialStore(stateDir)

	first := Credential{
		EdgeID:           "507f1f77bcf86cd799439011",
		CredentialSecret: "secret-v1",
		Version:          1,
		IssuedAt:         time.Date(2026, 4, 6, 10, 0, 0, 0, time.UTC),
		Source:           "register",
		InstalledAt:      time.Date(2026, 4, 6, 10, 5, 0, 0, time.UTC),
	}
	second := first
	second.CredentialSecret = "secret-v2"
	second.Version = 2
	second.Source = "rotate"
	second.InstalledAt = time.Date(2026, 4, 6, 10, 6, 0, 0, time.UTC)

	if err := store.Save(first); err != nil {
		t.Fatalf("save first credential: %v", err)
	}
	if err := store.Save(second); err != nil {
		t.Fatalf("save replacement credential: %v", err)
	}

	got, exists, err := store.Load()
	if err != nil {
		t.Fatalf("load credential: %v", err)
	}
	if !exists {
		t.Fatal("expected credential file to exist")
	}
	if got.Version != 2 || got.CredentialSecret != "secret-v2" || got.Source != "rotate" || !got.InstalledAt.Equal(second.InstalledAt) {
		t.Fatalf("expected latest credential after atomic replace, got %+v", got)
	}

	credentialPath := filepath.Join(stateDir, credentialFileName)
	payload, err := os.ReadFile(credentialPath)
	if err != nil {
		t.Fatalf("read persisted credential: %v", err)
	}
	var persisted map[string]any
	if err := json.Unmarshal(payload, &persisted); err != nil {
		t.Fatalf("parse persisted credential payload: %v", err)
	}
	for _, key := range []string{"edgeId", "credentialSecret", "version", "issuedAt", "source", "installedAt"} {
		if _, ok := persisted[key]; !ok {
			t.Fatalf("expected persisted credential key %q, got %+v", key, persisted)
		}
	}
	for _, legacyKey := range []string{"credentialMode", "lifecycleState"} {
		if _, ok := persisted[legacyKey]; ok {
			t.Fatalf("did not expect legacy credential key %q in persisted payload %+v", legacyKey, persisted)
		}
	}

	if err := os.WriteFile(credentialPath, []byte("{invalid-json"), 0o600); err != nil {
		t.Fatalf("write corrupt credential: %v", err)
	}
	if _, _, err := store.Load(); err == nil || !strings.Contains(err.Error(), "parse credential.json") {
		t.Fatalf("expected parse error for corrupt credential.json, got %v", err)
	}
}

func TestCredentialStoreLoadsPersistentCredentialSchema(t *testing.T) {
	stateDir := t.TempDir()
	store := NewCredentialStore(stateDir)

	payload := `{
  "edgeId": "507f1f77bcf86cd799439011",
  "credentialSecret": "fixture-secret",
  "version": 3,
  "issuedAt": "2026-04-19T08:20:00Z",
  "source": "register",
  "installedAt": "2026-04-19T08:25:00Z"
}`
	credentialPath := filepath.Join(stateDir, credentialFileName)
	if err := os.WriteFile(credentialPath, []byte(payload), 0o600); err != nil {
		t.Fatalf("write 007 credential fixture: %v", err)
	}

	credential, exists, err := store.Load()
	if err != nil {
		t.Fatalf("load 007 credential fixture: %v", err)
	}
	if !exists {
		t.Fatal("expected credential fixture to exist")
	}
	if credential.CredentialSecret != "fixture-secret" || credential.Version != 3 {
		t.Fatalf("unexpected loaded credential: %+v", credential)
	}
	if credential.Source != "register" {
		t.Fatalf("expected persistent source=register, got %+v", credential)
	}
	if credential.InstalledAt.IsZero() {
		t.Fatalf("unexpected loaded credential: %+v", credential)
	}
}

func TestCredentialStoreRejectsLegacyCredentialShape(t *testing.T) {
	stateDir := t.TempDir()
	store := NewCredentialStore(stateDir)

	payload := `{
  "edgeId": "507f1f77bcf86cd799439011",
  "credentialMode": "persistent",
  "credentialSecret": "legacy-secret",
  "version": 2,
  "issuedAt": "2026-04-19T08:20:00Z",
  "lifecycleState": "Active"
}`
	credentialPath := filepath.Join(stateDir, credentialFileName)
	if err := os.WriteFile(credentialPath, []byte(payload), 0o600); err != nil {
		t.Fatalf("write legacy credential payload: %v", err)
	}

	_, _, err := store.Load()
	if err == nil || !strings.Contains(err.Error(), "credential.source is required") {
		t.Fatalf("expected legacy credential shape to be rejected by persistent-only validation, got %v", err)
	}
}

func TestRuntimeAndStatusStorePersistence(t *testing.T) {
	stateDir := t.TempDir()
	now := time.Date(2026, 4, 6, 10, 10, 0, 0, time.UTC)
	lastReason := "trusted"

	runtimeStore := NewRuntimeStateStore(stateDir)
	runtimeState := RuntimeState{
		TrustMode:            "trusted_reconnect_ready",
		LastOutcome:          "trusted_reconnect_succeeded",
		LastTrustedSessionAt: &now,
		LastTelemetryAt:      &now,
		BacklogSize:          0,
		SourceConfigRevision: "rev-1",
		AdapterMode:          "mock-internal",
	}
	if err := runtimeStore.Save(runtimeState); err != nil {
		t.Fatalf("save runtime state: %v", err)
	}

	gotState, exists, err := runtimeStore.Load()
	if err != nil {
		t.Fatalf("load runtime state: %v", err)
	}
	if !exists || gotState.TrustMode != "trusted_reconnect_ready" {
		t.Fatalf("unexpected runtime-state read, exists=%v value=%+v", exists, gotState)
	}

	statusStore := NewStatusStore(stateDir)
	status := StatusSnapshot{
		EdgeID:           "507f1f77bcf86cd799439011",
		TrustMode:        "trusted_reconnect_ready",
		CloudConnection:  "trusted",
		AdapterState:     "running",
		BufferedReadings: 0,
		LastReason:       &lastReason,
		UpdatedAt:        now,
	}
	if err := statusStore.Save(status); err != nil {
		t.Fatalf("save status: %v", err)
	}

	gotStatus, exists, err := statusStore.Load()
	if err != nil {
		t.Fatalf("load status: %v", err)
	}
	if !exists || gotStatus.CloudConnection != "trusted" {
		t.Fatalf("unexpected status read, exists=%v value=%+v", exists, gotStatus)
	}
}

func TestStatusStoreRejectsMissingEdgeID(t *testing.T) {
	store := NewStatusStore(t.TempDir())
	status := StatusSnapshot{
		TrustMode:        "trusted_reconnect_ready",
		CloudConnection:  "trusted",
		AdapterState:     "running",
		BufferedReadings: 0,
		UpdatedAt:        time.Date(2026, 4, 6, 10, 20, 0, 0, time.UTC),
	}

	err := store.Save(status)
	if err == nil || !strings.Contains(err.Error(), "status.edgeId is required") {
		t.Fatalf("expected missing edgeId validation error, got %v", err)
	}
}
