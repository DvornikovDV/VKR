package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"edge_server/go_core/internal/credentialinstall"
	"edge_server/go_core/internal/state"
)

func TestEdgeCredentialInstallValidatesSubcommandAndConfig(t *testing.T) {
	cases := []struct {
		name       string
		args       []string
		errSnippet string
	}{
		{
			name:       "missing subcommand",
			args:       nil,
			errSnippet: "subcommand is required",
		},
		{
			name:       "unknown subcommand",
			args:       []string{"rotate", "--config", "edge-runtime.yaml"},
			errSnippet: `unknown subcommand "rotate"`,
		},
		{
			name:       "missing config",
			args:       []string{"install"},
			errSnippet: "--config is required",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var stdout bytes.Buffer
			var stderr bytes.Buffer
			installCalled := false

			code := runEdgeCredential(context.Background(), tc.args, strings.NewReader("secret input"), &stdout, &stderr, edgeCredentialDependencies{
				install: func(context.Context, edgeCredentialOptions, commandIO) error {
					installCalled = true
					return nil
				},
			})

			if code != 2 {
				t.Fatalf("expected validation exit code 2, got %d", code)
			}
			if !strings.Contains(stderr.String(), tc.errSnippet) {
				t.Fatalf("expected stderr to contain %q, got %q", tc.errSnippet, stderr.String())
			}
			if stdout.Len() != 0 {
				t.Fatalf("validation failure must not print output, got %q", stdout.String())
			}
			if installCalled {
				t.Fatal("validation failure must not reach install wiring")
			}
		})
	}
}

func TestEdgeCredentialInstallSelectsStdinModeThroughInjectedIO(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	stdin := strings.NewReader(`{"persistentCredential":{"edgeId":"edge-1"}}`)
	var gotOptions edgeCredentialOptions
	var gotInput string

	code := runEdgeCredential(context.Background(), []string{"install", "--config", " edge-runtime.yaml ", "--from-stdin"}, stdin, &stdout, &stderr, edgeCredentialDependencies{
		install: func(ctx context.Context, options edgeCredentialOptions, streams commandIO) error {
			if ctx == nil {
				t.Fatal("install context must be passed through")
			}
			if streams.stdout == nil || streams.stderr == nil {
				t.Fatal("install writers must be passed through")
			}
			raw, err := io.ReadAll(streams.stdin)
			if err != nil {
				t.Fatalf("read injected stdin: %v", err)
			}
			gotOptions = options
			gotInput = string(raw)
			return nil
		},
	})

	if code != 0 {
		t.Fatalf("expected success exit code 0, got %d; stderr=%q", code, stderr.String())
	}
	if gotOptions.subcommand != "install" {
		t.Fatalf("expected install subcommand, got %q", gotOptions.subcommand)
	}
	if gotOptions.configPath != "edge-runtime.yaml" {
		t.Fatalf("expected trimmed config path, got %q", gotOptions.configPath)
	}
	if !gotOptions.fromStdin || gotOptions.mode != installModeStdin {
		t.Fatalf("expected stdin mode, got fromStdin=%v mode=%q", gotOptions.fromStdin, gotOptions.mode)
	}
	if !strings.Contains(gotInput, "persistentCredential") {
		t.Fatalf("expected injected stdin to reach install dependency, got %q", gotInput)
	}
	if stdout.Len() != 0 || stderr.Len() != 0 {
		t.Fatalf("successful injected install must not print scaffold output, stdout=%q stderr=%q", stdout.String(), stderr.String())
	}
}

func TestEdgeCredentialInstallSelectsInteractiveModeThroughInjectedIO(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	installCalled := false

	code := runEdgeCredential(context.Background(), []string{"install", "--config", "edge-runtime.yaml"}, strings.NewReader("operator input"), &stdout, &stderr, edgeCredentialDependencies{
		install: func(ctx context.Context, options edgeCredentialOptions, streams commandIO) error {
			installCalled = true
			if options.mode != installModeInteractive {
				t.Fatalf("expected interactive mode, got %q", options.mode)
			}
			if options.fromStdin {
				t.Fatal("interactive mode must not set fromStdin")
			}
			if streams.stdin == nil {
				t.Fatal("interactive install must receive injected stdin")
			}
			return nil
		},
	})

	if code != 0 {
		t.Fatalf("expected success exit code 0, got %d; stderr=%q", code, stderr.String())
	}
	if !installCalled {
		t.Fatal("expected injected install dependency to be called")
	}
}

func TestEdgeCredentialInstallReportsInjectedInstallError(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	wantErr := errors.New("install failed")

	code := runEdgeCredential(context.Background(), []string{"install", "--config", "edge-runtime.yaml"}, strings.NewReader(""), &stdout, &stderr, edgeCredentialDependencies{
		install: func(context.Context, edgeCredentialOptions, commandIO) error {
			return wantErr
		},
	})

	if code != 1 {
		t.Fatalf("expected install failure exit code 1, got %d", code)
	}
	if !strings.Contains(stderr.String(), "install failed") {
		t.Fatalf("expected stderr to contain injected install error, got %q", stderr.String())
	}
	if stdout.Len() != 0 {
		t.Fatalf("install failure must not print stdout, got %q", stdout.String())
	}
}

func TestEdgeCredentialInstallFromStdinInstallsCloudStyleDisclosureThroughProductionWiring(t *testing.T) {
	stateDir := t.TempDir()
	configPath := writeEdgeCredentialRuntimeConfig(t, stateDir, "507f1f77bcf86cd799439011")
	const secret = "cloud-issued-command-secret"
	payload := `{
  "status": "success",
  "data": {
    "edge": {
      "_id": "507f1f77bcf86cd799439011",
      "name": "Line A Edge",
      "lifecycleState": "Active"
    },
    "persistentCredential": {
      "edgeId": "507f1f77bcf86cd799439011",
      "credentialSecret": "` + secret + `",
      "version": 9,
      "issuedAt": "2026-04-15T12:10:00Z",
      "instructions": "presentation-only"
    }
  }
}`

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	code := runEdgeCredential(context.Background(), []string{"install", "--config", configPath, "--from-stdin"}, strings.NewReader(payload), &stdout, &stderr, edgeCredentialDependencies{})
	if code != 0 {
		t.Fatalf("expected install success, got exit code %d; stdout=%q stderr=%q", code, stdout.String(), stderr.String())
	}
	if strings.Contains(stdout.String(), secret) || strings.Contains(stderr.String(), secret) {
		t.Fatalf("command output must not disclose credential secret, stdout=%q stderr=%q", stdout.String(), stderr.String())
	}
	for _, snippet := range []string{"installed credential", "edgeId=507f1f77bcf86cd799439011", "version=9", "source=register", "credential.json"} {
		if !strings.Contains(stdout.String(), snippet) {
			t.Fatalf("expected redacted success output to contain %q, got %q", snippet, stdout.String())
		}
	}
	if stderr.Len() != 0 {
		t.Fatalf("successful install must not write stderr, got %q", stderr.String())
	}

	credential, exists, err := state.NewCredentialStore(stateDir).Load()
	if err != nil {
		t.Fatalf("load installed credential through state store: %v", err)
	}
	if !exists {
		t.Fatal("expected credential.json to be written")
	}
	if credential.EdgeID != "507f1f77bcf86cd799439011" ||
		credential.CredentialSecret != secret ||
		credential.Version != 9 ||
		credential.Source != string(credentialinstall.InstallSourceRegister) {
		t.Fatalf("unexpected installed credential: %+v", credential)
	}

	raw, err := os.ReadFile(filepath.Join(stateDir, "credential.json"))
	if err != nil {
		t.Fatalf("read installed credential.json: %v", err)
	}
	var persisted map[string]any
	if err := json.Unmarshal(raw, &persisted); err != nil {
		t.Fatalf("parse installed credential.json: %v", err)
	}
	for _, legacyKey := range []string{"credentialMode", "lifecycleState"} {
		if _, exists := persisted[legacyKey]; exists {
			t.Fatalf("credential.json must not contain legacy key %q: %s", legacyKey, string(raw))
		}
	}
}

func TestEdgeCredentialInstallFromStdinRejectsUnsafeInputBeforeWrite(t *testing.T) {
	baseCredential := state.Credential{
		EdgeID:           "507f1f77bcf86cd799439011",
		CredentialSecret: "existing-secret",
		Version:          5,
		IssuedAt:         time.Date(2026, 4, 14, 10, 0, 0, 0, time.UTC),
		Source:           string(credentialinstall.InstallSourceRegister),
		InstalledAt:      time.Date(2026, 4, 14, 10, 5, 0, 0, time.UTC),
	}
	validPayload := `{
  "persistentCredential": {
    "edgeId": "507f1f77bcf86cd799439011",
    "credentialSecret": "new-secret",
    "version": 6,
    "issuedAt": "2026-04-15T12:10:00Z"
  }
}`

	cases := []struct {
		name         string
		payload      string
		seed         func(t *testing.T, stateDir string)
		wantErr      string
		wantExisting bool
	}{
		{
			name:    "malformed input",
			payload: "{not-json",
			wantErr: "parse credential disclosure json",
		},
		{
			name: "edge mismatch",
			payload: `{
  "persistentCredential": {
    "edgeId": "other-edge",
    "credentialSecret": "new-secret",
    "version": 6,
    "issuedAt": "2026-04-15T12:10:00Z"
  }
}`,
			wantErr: "does not match runtime.edgeId",
		},
		{
			name:    "corrupt credential state",
			payload: validPayload,
			seed: func(t *testing.T, stateDir string) {
				t.Helper()
				if err := os.WriteFile(filepath.Join(stateDir, "credential.json"), []byte("{not-json"), 0o600); err != nil {
					t.Fatalf("seed corrupt credential.json: %v", err)
				}
			},
			wantErr: "load existing credential.json",
		},
		{
			name:    "corrupt runtime state",
			payload: validPayload,
			seed: func(t *testing.T, stateDir string) {
				t.Helper()
				if err := os.WriteFile(filepath.Join(stateDir, "runtime-state.json"), []byte("{not-json"), 0o600); err != nil {
					t.Fatalf("seed corrupt runtime-state.json: %v", err)
				}
			},
			wantErr: "load existing runtime-state.json",
		},
		{
			name:    "equal installed replacement",
			payload: strings.Replace(validPayload, `"version": 6`, `"version": 5`, 1),
			seed: func(t *testing.T, stateDir string) {
				t.Helper()
				if err := state.NewCredentialStore(stateDir).Save(baseCredential); err != nil {
					t.Fatalf("seed existing credential: %v", err)
				}
			},
			wantErr:      "must be greater than installed credential version 5",
			wantExisting: true,
		},
		{
			name:    "equal fresh required replacement",
			payload: validPayload,
			seed: func(t *testing.T, stateDir string) {
				t.Helper()
				if err := state.NewCredentialStore(stateDir).Save(baseCredential); err != nil {
					t.Fatalf("seed existing credential: %v", err)
				}
				version := 6
				if err := state.NewRuntimeStateStore(stateDir).Save(state.RuntimeState{
					EdgeID:               "507f1f77bcf86cd799439011",
					CredentialVersion:    &version,
					CredentialStatus:     state.CredentialStatusSuperseded,
					SessionState:         state.SessionStateOperatorActionRequired,
					AuthOutcome:          state.AuthOutcomeCredentialRotated,
					RetryEligible:        false,
					SourceConfigRevision: "rev-existing",
					UpdatedAt:            time.Date(2026, 4, 14, 10, 10, 0, 0, time.UTC),
				}); err != nil {
					t.Fatalf("seed superseded runtime-state: %v", err)
				}
			},
			wantErr:      "does not replace superseded credential version 6",
			wantExisting: true,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			stateDir := t.TempDir()
			configPath := writeEdgeCredentialRuntimeConfig(t, stateDir, "507f1f77bcf86cd799439011")
			if tc.seed != nil {
				tc.seed(t, stateDir)
			}

			var stdout bytes.Buffer
			var stderr bytes.Buffer
			code := runEdgeCredential(context.Background(), []string{"install", "--config", configPath, "--from-stdin"}, strings.NewReader(tc.payload), &stdout, &stderr, edgeCredentialDependencies{})
			if code != 1 {
				t.Fatalf("expected install failure exit code 1, got %d; stdout=%q stderr=%q", code, stdout.String(), stderr.String())
			}
			if stdout.Len() != 0 {
				t.Fatalf("failed install must not print stdout, got %q", stdout.String())
			}
			if !strings.Contains(stderr.String(), tc.wantErr) {
				t.Fatalf("expected stderr to contain %q, got %q", tc.wantErr, stderr.String())
			}

			credential, exists, err := state.NewCredentialStore(stateDir).Load()
			if tc.name == "corrupt credential state" {
				if err == nil {
					t.Fatal("expected corrupt credential.json to remain unreadable")
				}
				return
			}
			if err != nil {
				t.Fatalf("load credential after rejected install: %v", err)
			}
			if exists != tc.wantExisting {
				t.Fatalf("expected credential existence %v after rejected install, got %v", tc.wantExisting, exists)
			}
			if tc.wantExisting && (credential.CredentialSecret != baseCredential.CredentialSecret || credential.Version != baseCredential.Version) {
				t.Fatalf("rejected install changed existing credential: %+v", credential)
			}
		})
	}
}

func TestEdgeCredentialInstallInteractiveUsesSharedInstallPath(t *testing.T) {
	baseCredential := state.Credential{
		EdgeID:           "507f1f77bcf86cd799439011",
		CredentialSecret: "existing-secret",
		Version:          2,
		IssuedAt:         time.Date(2026, 4, 14, 10, 0, 0, 0, time.UTC),
		Source:           string(credentialinstall.InstallSourceRegister),
		InstalledAt:      time.Date(2026, 4, 14, 10, 5, 0, 0, time.UTC),
	}

	t.Run("confirmation denial leaves existing credential unchanged", func(t *testing.T) {
		stateDir := t.TempDir()
		configPath := writeEdgeCredentialRuntimeConfig(t, stateDir, baseCredential.EdgeID)
		if err := state.NewCredentialStore(stateDir).Save(baseCredential); err != nil {
			t.Fatalf("seed existing credential: %v", err)
		}
		before, err := os.ReadFile(filepath.Join(stateDir, "credential.json"))
		if err != nil {
			t.Fatalf("read seeded credential: %v", err)
		}

		var stdout bytes.Buffer
		var stderr bytes.Buffer
		input := strings.NewReader("interactive-secret\n3\n2026-04-15T12:10:00Z\nn\n")
		code := runEdgeCredential(context.Background(), []string{"install", "--config", configPath}, input, &stdout, &stderr, edgeCredentialDependencies{})
		if code != 0 {
			t.Fatalf("expected confirmation denial to exit successfully, got %d; stdout=%q stderr=%q", code, stdout.String(), stderr.String())
		}
		for _, snippet := range []string{"edgeId=507f1f77bcf86cd799439011", "source=rotate", "install canceled"} {
			if !strings.Contains(stdout.String(), snippet) {
				t.Fatalf("expected interactive output to contain %q, got %q", snippet, stdout.String())
			}
		}
		if strings.Contains(stdout.String(), "interactive-secret") || strings.Contains(stderr.String(), "interactive-secret") {
			t.Fatalf("interactive output must not disclose credential secret, stdout=%q stderr=%q", stdout.String(), stderr.String())
		}
		after, err := os.ReadFile(filepath.Join(stateDir, "credential.json"))
		if err != nil {
			t.Fatalf("read credential after denial: %v", err)
		}
		if !bytes.Equal(before, after) {
			t.Fatalf("confirmation denial changed existing credential.json\nbefore=%s\nafter=%s", string(before), string(after))
		}
	})

	t.Run("confirmation acceptance writes derived credential", func(t *testing.T) {
		stateDir := t.TempDir()
		configPath := writeEdgeCredentialRuntimeConfig(t, stateDir, baseCredential.EdgeID)
		if err := state.NewCredentialStore(stateDir).Save(baseCredential); err != nil {
			t.Fatalf("seed existing credential: %v", err)
		}

		var stdout bytes.Buffer
		var stderr bytes.Buffer
		input := strings.NewReader("interactive-secret\n3\n\ny\n")
		beforeInstall := time.Now().UTC()
		code := runEdgeCredential(context.Background(), []string{"install", "--config", configPath}, input, &stdout, &stderr, edgeCredentialDependencies{})
		afterInstall := time.Now().UTC()
		if code != 0 {
			t.Fatalf("expected interactive install success, got %d; stdout=%q stderr=%q", code, stdout.String(), stderr.String())
		}
		if stderr.Len() != 0 {
			t.Fatalf("successful interactive install must not write stderr, got %q", stderr.String())
		}
		if strings.Contains(stdout.String(), "interactive-secret") || strings.Contains(stderr.String(), "interactive-secret") {
			t.Fatalf("interactive output must not disclose credential secret, stdout=%q stderr=%q", stdout.String(), stderr.String())
		}
		for _, snippet := range []string{"edgeId=507f1f77bcf86cd799439011", "source=rotate", "installed credential", "version=3", "credential.json"} {
			if !strings.Contains(stdout.String(), snippet) {
				t.Fatalf("expected interactive output to contain %q, got %q", snippet, stdout.String())
			}
		}

		credential, exists, err := state.NewCredentialStore(stateDir).Load()
		if err != nil {
			t.Fatalf("load interactive credential through state store: %v", err)
		}
		if !exists {
			t.Fatal("expected interactive install to write credential.json")
		}
		if credential.EdgeID != baseCredential.EdgeID ||
			credential.CredentialSecret != "interactive-secret" ||
			credential.Version != 3 ||
			credential.Source != string(credentialinstall.InstallSourceRotate) {
			t.Fatalf("unexpected interactive credential: %+v", credential)
		}
		if credential.IssuedAt.Before(beforeInstall) || credential.IssuedAt.After(afterInstall) {
			t.Fatalf("blank issuedAt prompt must default to current install time, got %s outside [%s, %s]", credential.IssuedAt, beforeInstall, afterInstall)
		}
	})
}

func writeEdgeCredentialRuntimeConfig(t *testing.T, stateDir string, edgeID string) string {
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
