package credentialinstall

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"edge_server/go_core/internal/state"
)

const testEdgeID = "507f1f77bcf86cd799439011"

func TestInstallFromDisclosureJSONWritesCloudStyleCredentialThroughStateStore(t *testing.T) {
	stateDir := t.TempDir()
	configPath := writeRuntimeConfig(t, stateDir, testEdgeID)
	installedAt := time.Date(2026, 4, 15, 12, 20, 0, 0, time.UTC)

	payload := []byte(`{
  "edge": {
    "_id": "507f1f77bcf86cd799439011",
    "lifecycleState": "Active"
  },
  "persistentCredential": {
    "edgeId": "507f1f77bcf86cd799439011",
    "credentialSecret": "cloud-issued-secret",
    "version": 2,
    "issuedAt": "2026-04-15T12:10:00.000Z",
    "instructions": "presentation-only copy"
  }
}`)

	result, err := InstallFromDisclosureJSON(configPath, payload, installedAt)
	if err != nil {
		t.Fatalf("install cloud-style disclosure: %v", err)
	}
	if result.EdgeID != testEdgeID || result.Version != 2 || result.Source != InstallSourceRegister {
		t.Fatalf("unexpected install result: %+v", result)
	}

	credential, exists, err := state.NewCredentialStore(stateDir).Load()
	if err != nil {
		t.Fatalf("load installed credential through state store: %v", err)
	}
	if !exists {
		t.Fatal("expected credential.json to be written")
	}
	if credential.EdgeID != testEdgeID || credential.CredentialSecret != "cloud-issued-secret" || credential.Version != 2 {
		t.Fatalf("unexpected persisted credential: %+v", credential)
	}
	if credential.Source != string(InstallSourceRegister) {
		t.Fatalf("expected source=register, got %q", credential.Source)
	}
	if !credential.InstalledAt.Equal(installedAt) {
		t.Fatalf("expected installedAt=%s, got %s", installedAt, credential.InstalledAt)
	}

	raw, err := os.ReadFile(result.CredentialPath)
	if err != nil {
		t.Fatalf("read credential.json: %v", err)
	}
	var persisted map[string]any
	if err := json.Unmarshal(raw, &persisted); err != nil {
		t.Fatalf("parse credential.json: %v", err)
	}
	for _, legacyKey := range []string{"credentialMode", "lifecycleState"} {
		if _, exists := persisted[legacyKey]; exists {
			t.Fatalf("credential.json must not contain legacy key %q: %s", legacyKey, string(raw))
		}
	}
}

func TestInstallFromDisclosureJSONRejectsEqualFreshRequiredReplacementThroughStateStore(t *testing.T) {
	stateDir := t.TempDir()
	configPath := writeRuntimeConfig(t, stateDir, testEdgeID)
	installedAt := time.Date(2026, 4, 15, 12, 20, 0, 0, time.UTC)

	existing := state.Credential{
		EdgeID:           testEdgeID,
		CredentialSecret: "existing-secret",
		Version:          2,
		IssuedAt:         time.Date(2026, 4, 14, 10, 0, 0, 0, time.UTC),
		Source:           string(InstallSourceRegister),
		InstalledAt:      time.Date(2026, 4, 14, 10, 5, 0, 0, time.UTC),
	}
	if err := state.NewCredentialStore(stateDir).Save(existing); err != nil {
		t.Fatalf("seed existing credential through state store: %v", err)
	}
	runtimeCredentialVersion := 3
	if err := state.NewRuntimeStateStore(stateDir).Save(state.RuntimeState{
		EdgeID:               testEdgeID,
		CredentialVersion:    &runtimeCredentialVersion,
		CredentialStatus:     state.CredentialStatusSuperseded,
		SessionState:         state.SessionStateOperatorActionRequired,
		AuthOutcome:          state.AuthOutcomeCredentialRotated,
		RetryEligible:        false,
		SourceConfigRevision: "rev-credential-rotated",
		UpdatedAt:            time.Date(2026, 4, 14, 10, 10, 0, 0, time.UTC),
	}); err != nil {
		t.Fatalf("seed runtime-state through state store: %v", err)
	}

	payload := []byte(`{
  "persistentCredential": {
    "edgeId": "507f1f77bcf86cd799439011",
    "credentialSecret": "equal-version-secret",
    "version": 3,
    "issuedAt": "2026-04-15T12:10:00Z"
  }
}`)

	_, err := InstallFromDisclosureJSON(configPath, payload, installedAt)
	if err == nil || !strings.Contains(err.Error(), "does not replace superseded credential version 3") {
		t.Fatalf("expected equal fresh-required replacement rejection, got %v", err)
	}

	credential, exists, err := state.NewCredentialStore(stateDir).Load()
	if err != nil {
		t.Fatalf("reload credential after rejected install: %v", err)
	}
	if !exists {
		t.Fatal("existing credential must remain after rejected replacement")
	}
	if credential.CredentialSecret != existing.CredentialSecret || credential.Version != existing.Version || credential.Source != existing.Source {
		t.Fatalf("rejected replacement changed credential.json: %+v", credential)
	}
}

func TestDeriveInstallSource(t *testing.T) {
	blockedVersion := 2
	existing := state.Credential{EdgeID: testEdgeID, Version: 2}

	cases := []struct {
		name    string
		context LocalInstallContext
		want    InstallSource
	}{
		{
			name:    "first install",
			context: LocalInstallContext{},
			want:    InstallSourceRegister,
		},
		{
			name: "blocked recovery",
			context: LocalInstallContext{
				ExistingCredential: &existing,
				ExistingRuntimeState: &state.RuntimeState{
					CredentialVersion: &blockedVersion,
					CredentialStatus:  state.CredentialStatusBlocked,
				},
			},
			want: InstallSourceUnblock,
		},
		{
			name: "rotation replacement",
			context: LocalInstallContext{
				ExistingCredential: &existing,
				ExistingRuntimeState: &state.RuntimeState{
					CredentialStatus: state.CredentialStatusLoaded,
				},
			},
			want: InstallSourceRotate,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := DeriveInstallSource(tc.context); got != tc.want {
				t.Fatalf("expected source %q, got %q", tc.want, got)
			}
		})
	}
}

func TestValidateInstallCandidateRejectsUnsafeContext(t *testing.T) {
	input := NormalizedCredentialInput{
		EdgeID:           testEdgeID,
		CredentialSecret: "secret",
		Version:          3,
		IssuedAt:         time.Date(2026, 4, 16, 9, 30, 0, 0, time.UTC),
	}
	existingVersion := 3

	cases := []struct {
		name    string
		input   NormalizedCredentialInput
		context LocalInstallContext
		wantErr string
	}{
		{
			name:  "payload edge mismatch",
			input: NormalizedCredentialInput{EdgeID: "other-edge", CredentialSecret: "secret", Version: 4, IssuedAt: input.IssuedAt},
			context: LocalInstallContext{
				EdgeID: testEdgeID,
			},
			wantErr: "does not match runtime.edgeId",
		},
		{
			name:  "runtime state edge mismatch",
			input: input,
			context: LocalInstallContext{
				EdgeID: testEdgeID,
				ExistingRuntimeState: &state.RuntimeState{
					EdgeID:           "other-edge",
					CredentialStatus: state.CredentialStatusLoaded,
				},
			},
			wantErr: "runtime-state.json edgeId",
		},
		{
			name:  "installed equal version",
			input: input,
			context: LocalInstallContext{
				EdgeID: testEdgeID,
				ExistingCredential: &state.Credential{
					EdgeID:  testEdgeID,
					Version: existingVersion,
				},
			},
			wantErr: "must be greater than installed credential version 3",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := ValidateInstallCandidate(tc.input, tc.context)
			if err == nil || !strings.Contains(err.Error(), tc.wantErr) {
				t.Fatalf("expected error containing %q, got %v", tc.wantErr, err)
			}
		})
	}
}

func TestParseDisclosureJSONAcceptsMinimalCredentialPayload(t *testing.T) {
	input, err := ParseDisclosureJSON([]byte(`{
  "edgeId": "507f1f77bcf86cd799439011",
  "credentialSecret": "minimal-secret",
  "version": 4,
  "issuedAt": "2026-04-16T09:30:00Z"
}`))
	if err != nil {
		t.Fatalf("parse minimal disclosure: %v", err)
	}
	if input.EdgeID != testEdgeID || input.CredentialSecret != "minimal-secret" || input.Version != 4 {
		t.Fatalf("unexpected normalized input: %+v", input)
	}
}

func TestInstallFromDisclosureJSONAcceptsCloudAPIResponseEnvelope(t *testing.T) {
	stateDir := t.TempDir()
	configPath := writeRuntimeConfig(t, stateDir, testEdgeID)

	payload := []byte(`{
  "status": "success",
  "data": {
    "edge": {
      "_id": "507f1f77bcf86cd799439011",
      "lifecycleState": "Active"
    },
    "persistentCredential": {
      "edgeId": "507f1f77bcf86cd799439011",
      "credentialSecret": "api-envelope-secret",
      "version": 6,
      "issuedAt": "2026-04-16T10:30:00Z",
      "instructions": "presentation-only copy"
    }
  }
}`)

	if _, err := InstallFromDisclosureJSON(configPath, payload, time.Date(2026, 4, 16, 10, 35, 0, 0, time.UTC)); err != nil {
		t.Fatalf("install cloud api response envelope: %v", err)
	}

	credential, exists, err := state.NewCredentialStore(stateDir).Load()
	if err != nil {
		t.Fatalf("load installed credential: %v", err)
	}
	if !exists {
		t.Fatal("expected credential.json to be written")
	}
	if credential.CredentialSecret != "api-envelope-secret" || credential.Version != 6 {
		t.Fatalf("unexpected credential from api envelope: %+v", credential)
	}
}

func TestInstallFromDisclosureJSONPreservesCredentialSecretBytes(t *testing.T) {
	stateDir := t.TempDir()
	configPath := writeRuntimeConfig(t, stateDir, testEdgeID)
	wantSecret := "  secret-with-significant-space  "

	payload := []byte(`{
  "edgeId": "507f1f77bcf86cd799439011",
  "credentialSecret": "  secret-with-significant-space  ",
  "version": 7,
  "issuedAt": "2026-04-16T10:45:00Z"
}`)

	if _, err := InstallFromDisclosureJSON(configPath, payload, time.Date(2026, 4, 16, 10, 50, 0, 0, time.UTC)); err != nil {
		t.Fatalf("install credential with significant secret whitespace: %v", err)
	}

	credential, exists, err := state.NewCredentialStore(stateDir).Load()
	if err != nil {
		t.Fatalf("load installed credential: %v", err)
	}
	if !exists {
		t.Fatal("expected credential.json to be written")
	}
	if credential.CredentialSecret != wantSecret {
		t.Fatalf("expected exact credential secret %q, got %q", wantSecret, credential.CredentialSecret)
	}
}

func TestInstallFromDisclosureJSONRejectsCorruptManagedState(t *testing.T) {
	cases := []struct {
		name     string
		fileName string
		wantErr  string
	}{
		{
			name:     "credential",
			fileName: "credential.json",
			wantErr:  "load existing credential.json",
		},
		{
			name:     "runtime state",
			fileName: "runtime-state.json",
			wantErr:  "load existing runtime-state.json",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			stateDir := t.TempDir()
			configPath := writeRuntimeConfig(t, stateDir, testEdgeID)
			path := filepath.Join(stateDir, tc.fileName)
			if err := os.WriteFile(path, []byte("{invalid-json"), 0o600); err != nil {
				t.Fatalf("write corrupt managed state file: %v", err)
			}

			_, err := InstallFromDisclosureJSON(configPath, []byte(`{
  "edgeId": "507f1f77bcf86cd799439011",
  "credentialSecret": "new-secret",
  "version": 5,
  "issuedAt": "2026-04-16T09:30:00Z"
}`), time.Date(2026, 4, 16, 9, 35, 0, 0, time.UTC))
			if err == nil || !strings.Contains(err.Error(), tc.wantErr) {
				t.Fatalf("expected corrupt %s to block install with %q, got %v", tc.fileName, tc.wantErr, err)
			}
		})
	}
}

func writeRuntimeConfig(t *testing.T, stateDir string, edgeID string) string {
	t.Helper()

	configPath := filepath.Join(t.TempDir(), "edge-runtime.yaml")
	payload := `runtime:
  edgeId: "` + edgeID + `"
  stateDir: "` + filepath.ToSlash(stateDir) + `"
cloud:
  url: "http://127.0.0.1:8080"
  connectTimeoutMs: 1000
  reconnect:
    baseDelayMs: 100
    maxDelayMs: 1000
    maxAttempts: 1
sources:
  - sourceId: "source-1"
    adapterKind: "noop"
    enabled: true
    pollIntervalMs: 1000
    connection:
      port: "COM1"
    devices:
      - deviceId: "device-1"
        address:
          unitId: 1
        metrics:
          - metric: "temperature"
            valueType: "number"
            mapping:
              address: 1
              registerType: "holding"
`
	if err := os.WriteFile(configPath, []byte(payload), 0o600); err != nil {
		t.Fatalf("write runtime config: %v", err)
	}
	return configPath
}
