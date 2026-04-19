package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLoadFromFileParsesAndAppliesDefaults(t *testing.T) {
	t.Setenv("CLOUD_SOCKET_URL", "wss://runtime.example.test")

	body := `
cloud:
  url: ${CLOUD_SOCKET_URL}

sources:
  - sourceId: source-1
    adapterKind: mock
    enabled: true
    pollIntervalMs: 1000
    connection:
      profile: default
    devices:
      - deviceId: device-1
        address:
          node: 1
        metrics:
          - metric: pressure
            valueType: number
            mapping:
              register: 40001
`

	cfgPath := filepath.Join(t.TempDir(), "config.yaml")
	if err := os.WriteFile(cfgPath, []byte(body), 0o600); err != nil {
		t.Fatalf("write config fixture: %v", err)
	}

	cfg, err := LoadFromFile(cfgPath)
	if err != nil {
		t.Fatalf("load config: %v", err)
	}

	if cfg.Cloud.URL != "wss://runtime.example.test" {
		t.Fatalf("expected env substitution in cloud.url, got %q", cfg.Cloud.URL)
	}
	if cfg.Cloud.Namespace != "/edge" {
		t.Fatalf("expected default cloud namespace /edge, got %q", cfg.Cloud.Namespace)
	}
	if cfg.Batch.IntervalMs != 1000 || cfg.Batch.MaxReadings != 100 {
		t.Fatalf("unexpected batch defaults: %+v", cfg.Batch)
	}
	if cfg.Logging.Level != "info" {
		t.Fatalf("expected default logging level info, got %q", cfg.Logging.Level)
	}
}

func TestLoadFromFileAccepts007FixtureShape(t *testing.T) {
	t.Setenv("RUNTIME_STATE_DIR", t.TempDir())
	t.Setenv("CLOUD_SOCKET_URL", "http://127.0.0.1:4000")

	body := `
runtime:
  edgeId: 507f1f77bcf86cd799439011
  stateDir: ${RUNTIME_STATE_DIR}
  instanceName: fixture-edge

cloud:
  url: ${CLOUD_SOCKET_URL}
  namespace: /edge
  connectTimeoutMs: 10000
  reconnect:
    baseDelayMs: 1000
    maxDelayMs: 30000
    maxAttempts: 0

batch:
  intervalMs: 1000
  maxReadings: 100

sources:
  - sourceId: source-1
    adapterKind: mock
    enabled: true
    pollIntervalMs: 1000
    connection:
      profile: default
    devices:
      - deviceId: device-1
        address:
          node: 1
        metrics:
          - metric: pressure
            valueType: number
            mapping:
              register: 40001
`

	cfgPath := filepath.Join(t.TempDir(), "config.yaml")
	if err := os.WriteFile(cfgPath, []byte(body), 0o600); err != nil {
		t.Fatalf("write config fixture: %v", err)
	}

	cfg, err := LoadFromFile(cfgPath)
	if err != nil {
		t.Fatalf("load 007-shaped config: %v", err)
	}

	if cfg.Runtime.EdgeID != "507f1f77bcf86cd799439011" {
		t.Fatalf("unexpected runtime.edgeId: %q", cfg.Runtime.EdgeID)
	}
	if cfg.Runtime.StateDir == "" {
		t.Fatal("expected runtime.stateDir to be preserved")
	}
	if cfg.Cloud.ConnectTimeoutMs != 10000 {
		t.Fatalf("unexpected connect timeout: %d", cfg.Cloud.ConnectTimeoutMs)
	}
	if cfg.Cloud.Reconnect.BaseDelayMs != 1000 || cfg.Cloud.Reconnect.MaxDelayMs != 30000 {
		t.Fatalf("unexpected reconnect settings: %+v", cfg.Cloud.Reconnect)
	}
}

func TestParseRejectsInvalidOperatorConfig(t *testing.T) {
	t.Setenv("CLOUD_SOCKET_URL", "wss://runtime.example.test")

	base := validConfigYAML()
	cases := []struct {
		name       string
		body       string
		errSnippet string
	}{
		{
			name:       "duplicate source ids",
			body:       strings.Replace(base, "source-2", "source-1", 1),
			errSnippet: "duplicate sourceId",
		},
		{
			name:       "duplicate device ids across sources",
			body:       strings.Replace(base, "device-2", "device-1", 1),
			errSnippet: "duplicate deviceId",
		},
		{
			name:       "invalid metric value type",
			body:       strings.Replace(base, "valueType: number", "valueType: string", 1),
			errSnippet: "valueType must be number or boolean",
		},
		{
			name:       "cloud namespace must match contract",
			body:       strings.Replace(base, "namespace: /edge", "namespace: /custom", 1),
			errSnippet: "cloud.namespace must be",
		},
		{
			name:       "unknown field in operator config is rejected",
			body:       strings.Replace(base, "batch:", "unknownSetting: true\n\nbatch:", 1),
			errSnippet: "field unknownSetting not found",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := Parse([]byte(tc.body))
			if err == nil {
				t.Fatalf("expected validation error containing %q", tc.errSnippet)
			}
			if !strings.Contains(err.Error(), tc.errSnippet) {
				t.Fatalf("expected error to contain %q, got %v", tc.errSnippet, err)
			}
		})
	}
}

func TestLoadFromFileBehaviorForStableSources(t *testing.T) {
	t.Setenv("CLOUD_SOCKET_URL", "wss://cloud.example.test")

	cases := []struct {
		name       string
		body       string
		wantErr    bool
		errSnippet string
	}{
		{
			name: "accepts valid operator config with stable source definitions",
			body: validConfigYAML(),
		},
		{
			name:       "rejects duplicate runtime-local device ids across sources",
			body:       strings.Replace(validConfigYAML(), "device-2", "device-1", 1),
			wantErr:    true,
			errSnippet: "duplicate deviceId",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			cfgPath := filepath.Join(t.TempDir(), "config.yaml")
			if err := os.WriteFile(cfgPath, []byte(tc.body), 0o600); err != nil {
				t.Fatalf("write config fixture: %v", err)
			}

			cfg, err := LoadFromFile(cfgPath)
			if tc.wantErr {
				if err == nil {
					t.Fatalf("expected validation error containing %q", tc.errSnippet)
				}
				if !strings.Contains(err.Error(), tc.errSnippet) {
					t.Fatalf("expected error to contain %q, got %v", tc.errSnippet, err)
				}
				return
			}

			if err != nil {
				t.Fatalf("expected config to be valid: %v", err)
			}
			if cfg.Cloud.URL != "wss://cloud.example.test" {
				t.Fatalf("expected env substitution, got %q", cfg.Cloud.URL)
			}
			if cfg.Cloud.Namespace != "/edge" {
				t.Fatalf("expected cloud namespace /edge, got %q", cfg.Cloud.Namespace)
			}
		})
	}
}

func validConfigYAML() string {
	return `
cloud:
  url: ${CLOUD_SOCKET_URL}
  namespace: /edge

batch:
  intervalMs: 1000
  maxReadings: 100

sources:
  - sourceId: source-1
    adapterKind: mock
    enabled: true
    pollIntervalMs: 1000
    connection:
      profile: primary
    devices:
      - deviceId: device-1
        address:
          node: 1
        metrics:
          - metric: pressure
            valueType: number
            mapping:
              register: 40001
  - sourceId: source-2
    adapterKind: mock
    enabled: true
    pollIntervalMs: 2000
    connection:
      profile: secondary
    devices:
      - deviceId: device-2
        address:
          node: 2
        metrics:
          - metric: is_running
            valueType: boolean
            mapping:
              coil: 1
`
}
