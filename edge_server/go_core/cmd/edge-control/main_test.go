package main

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"edge_server/go_core/internal/config"
	"edge_server/go_core/internal/source"
)

func TestEdgeControlValidatesRequiredArguments(t *testing.T) {
	cases := []struct {
		name       string
		args       []string
		errSnippet string
	}{
		{
			name:       "missing config",
			args:       nil,
			errSnippet: "--config is required",
		},
		{
			name:       "missing device",
			args:       []string{"--config", "edge-runtime.yaml"},
			errSnippet: "--device is required",
		},
		{
			name:       "missing command",
			args:       []string{"--config", "edge-runtime.yaml", "--device", "pump_main"},
			errSnippet: "--command is required",
		},
		{
			name:       "missing value",
			args:       []string{"--config", "edge-runtime.yaml", "--device", "pump_main", "--command", "set_bool"},
			errSnippet: "--value is required",
		},
		{
			name:       "set_number non-numeric value",
			args:       []string{"--config", "edge-runtime.yaml", "--device", "valve_pwm", "--command", "set_number", "--value", "abc"},
			errSnippet: "--value must be an integer register value for set_number",
		},
		{
			name:       "set_number fractional value",
			args:       []string{"--config", "edge-runtime.yaml", "--device", "valve_pwm", "--command", "set_number", "--value", "12.5"},
			errSnippet: "--value must be an integer register value for set_number",
		},
		{
			name:       "set_number negative value",
			args:       []string{"--config", "edge-runtime.yaml", "--device", "valve_pwm", "--command", "set_number", "--value", "-1"},
			errSnippet: "--value must be between 0 and 65535 for set_number",
		},
		{
			name:       "set_number above uint16 value",
			args:       []string{"--config", "edge-runtime.yaml", "--device", "valve_pwm", "--command", "set_number", "--value", "70000"},
			errSnippet: "--value must be between 0 and 65535 for set_number",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var stdout bytes.Buffer
			var stderr bytes.Buffer
			loadConfigCalled := false

			code := runEdgeControl(context.Background(), tc.args, &stdout, &stderr, edgeControlDependencies{
				loadConfig: func(string) (config.Config, error) {
					loadConfigCalled = true
					return config.Config{}, nil
				},
			})

			if code != 2 {
				t.Fatalf("expected validation exit code 2, got %d", code)
			}
			if !strings.Contains(stderr.String(), tc.errSnippet) {
				t.Fatalf("expected stderr to contain %q, got %q", tc.errSnippet, stderr.String())
			}
			if stdout.Len() != 0 {
				t.Fatalf("validation failure must not print a command result, got %q", stdout.String())
			}
			if loadConfigCalled {
				t.Fatal("validation failure must not load config or reach source manager setup")
			}
		})
	}
}

func TestEdgeControlExecutesThroughLocalSourceManagerPath(t *testing.T) {
	cases := []struct {
		name          string
		args          []string
		wantDeviceID  string
		wantCommand   string
		wantValue     any
		wantOutputCmd string
	}{
		{
			name:          "set_bool regression",
			args:          []string{"--device", "pump_main", "--command", "set_bool", "--value", "true"},
			wantDeviceID:  "pump_main",
			wantCommand:   "set_bool",
			wantValue:     true,
			wantOutputCmd: "set_bool",
		},
		{
			name:          "set_number valid integer",
			args:          []string{"--device", "valve_pwm", "--command", "set_number", "--value", "128"},
			wantDeviceID:  "valve_pwm",
			wantCommand:   "set_number",
			wantValue:     128,
			wantOutputCmd: "set_number",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			adapter := &capturingCommandAdapter{
				result: source.CommandResult{Status: source.CommandStatusConfirmed},
			}
			cfgPath := writeEdgeControlConfig(t)
			args := append([]string{"--config", cfgPath}, tc.args...)

			var stdout bytes.Buffer
			var stderr bytes.Buffer
			code := runEdgeControl(
				context.Background(),
				args,
				&stdout,
				&stderr,
				edgeControlDependencies{
					factories: source.FactoryRegistry{
						source.ModbusRTUKind: func() (source.Adapter, error) {
							return adapter, nil
						},
					},
				},
			)

			if code != 0 {
				t.Fatalf("expected confirmed command exit code 0, got %d; stderr=%q", code, stderr.String())
			}
			if !adapter.applied {
				t.Fatal("CLI must apply config source definitions to the source manager")
			}
			if adapter.definition.SourceID != "arduino_stand" || adapter.definition.AdapterKind != source.ModbusRTUKind {
				t.Fatalf("unexpected applied source definition: %+v", adapter.definition)
			}

			request := adapter.lastRequest
			if request.DeviceID != tc.wantDeviceID || request.Command != tc.wantCommand || request.Value != tc.wantValue {
				t.Fatalf("CLI delegated unexpected source manager command request: %+v", request)
			}

			var output commandResultOutput
			if err := json.Unmarshal(stdout.Bytes(), &output); err != nil {
				t.Fatalf("decode CLI result JSON %q: %v", stdout.String(), err)
			}
			if output.DeviceID != tc.wantDeviceID || output.Command != tc.wantOutputCmd || output.Status != source.CommandStatusConfirmed {
				t.Fatalf("unexpected CLI result output: %+v", output)
			}
		})
	}
}

func writeEdgeControlConfig(t *testing.T) string {
	t.Helper()

	body := `
runtime:
  edgeId: 507f1f77bcf86cd799439011
  stateDir: C:\ProgramData\vkr-edge\state

cloud:
  url: http://127.0.0.1:1
  namespace: /edge
  connectTimeoutMs: 10000
  reconnect:
    baseDelayMs: 1000
    maxDelayMs: 30000
    maxAttempts: 0

sources:
  - sourceId: arduino_stand
    adapterKind: modbus_rtu
    enabled: true
    pollIntervalMs: 1000
    connection:
      port: COM7
      baudRate: 9600
      dataBits: 8
      parity: none
      stopBits: 1
      slaveId: 1
      timeoutMs: 500
    devices:
      - deviceId: pump_main
        address:
          node: 2
        metrics:
          - metric: actual_state
            valueType: boolean
            mapping:
              registerType: input
              address: 16
        commands:
          - command: set_bool
            mapping:
              registerType: holding
              address: 160
            reportedMetric: actual_state
      - deviceId: valve_pwm
        address:
          node: 2
        metrics:
          - metric: actual_value
            valueType: number
            mapping:
              registerType: input
              address: 18
        commands:
          - command: set_number
            mapping:
              registerType: holding
              address: 162
            min: 0
            max: 255
            reportedMetric: actual_value
`
	path := filepath.Join(t.TempDir(), "edge-runtime.yaml")
	if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
		t.Fatalf("write CLI config fixture: %v", err)
	}

	return path
}

type capturingCommandAdapter struct {
	mu          sync.Mutex
	applied     bool
	closed      bool
	definition  source.Definition
	lastRequest source.CommandRequest
	result      source.CommandResult
}

func (a *capturingCommandAdapter) ApplyDefinition(definition source.Definition, sink source.Sink) error {
	a.mu.Lock()
	defer a.mu.Unlock()

	a.applied = true
	a.closed = false
	a.definition = definition
	return nil
}

func (a *capturingCommandAdapter) Close() error {
	a.mu.Lock()
	defer a.mu.Unlock()

	a.closed = true
	return nil
}

func (a *capturingCommandAdapter) ExecuteCommand(ctx context.Context, request source.CommandRequest) (source.CommandResult, error) {
	a.mu.Lock()
	defer a.mu.Unlock()

	a.lastRequest = request
	result := a.result
	result.DeviceID = request.DeviceID
	result.Command = request.Command
	return result, nil
}
