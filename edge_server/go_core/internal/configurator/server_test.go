package configurator

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestServerLoadHelpersValidateSaveHappyPath(t *testing.T) {
	dir := t.TempDir()
	targetPath := filepath.Join(dir, "edge-runtime.yaml")
	browserPath := filepath.Join(dir, "browser-selected.yaml")
	if err := os.WriteFile(targetPath, []byte("old: content\n"), 0o600); err != nil {
		t.Fatalf("write initial config: %v", err)
	}
	service, err := NewConfigFileService(targetPath)
	if err != nil {
		t.Fatalf("create file service: %v", err)
	}
	handler := NewServer(service)

	var loaded ConfigLoadResponse
	requestJSON(t, handler, http.MethodGet, "/api/config", nil, http.StatusOK, &loaded)
	if !loaded.Exists || loaded.YAML != "old: content\n" {
		t.Fatalf("unexpected load response: %+v", loaded)
	}

	var helpers HelperDataResponse
	requestJSON(t, handler, http.MethodGet, "/api/helpers", nil, http.StatusOK, &helpers)
	if len(helpers.Helpers.Presets) == 0 || helpers.Helpers.Presets[0].YAML == "" {
		t.Fatalf("expected helper preset YAML, got %+v", helpers.Helpers.Presets)
	}

	var validated ValidationResponse
	requestJSON(t, handler, http.MethodPost, "/api/validate", ValidationRequest{
		YAML: ArduinoStandPresetYAML(),
	}, http.StatusOK, &validated)
	if !validated.Valid || validated.Error != "" {
		t.Fatalf("expected valid config response, got %+v", validated)
	}

	var saved SaveResponse
	requestRawJSON(t, handler, http.MethodPost, "/api/save", map[string]string{
		"yaml": ArduinoStandPresetYAML(),
		"path": browserPath,
	}, http.StatusOK, &saved)
	if !saved.Saved || !saved.Validation.Valid {
		t.Fatalf("expected valid save response, got %+v", saved)
	}
	raw, err := os.ReadFile(targetPath)
	if err != nil {
		t.Fatalf("read saved target: %v", err)
	}
	if string(raw) != ArduinoStandPresetYAML() {
		t.Fatal("server save must write submitted YAML to configured target")
	}
	if _, err := os.Stat(browserPath); !os.IsNotExist(err) {
		t.Fatalf("server save must ignore browser-selected path, stat err=%v", err)
	}
}

func TestServerRejectsCriticalInvalidConfigBeforeSave(t *testing.T) {
	targetPath := filepath.Join(t.TempDir(), "edge-runtime.yaml")
	original := []byte("old: content\n")
	if err := os.WriteFile(targetPath, original, 0o600); err != nil {
		t.Fatalf("write initial config: %v", err)
	}
	service, err := NewConfigFileService(targetPath)
	if err != nil {
		t.Fatalf("create file service: %v", err)
	}
	handler := NewServer(service)
	invalidYAML := strings.Replace(ArduinoStandPresetYAML(), "reportedMetric: actual_state", "reportedMetric: missing_metric", 1)

	var validated ValidationResponse
	requestJSON(t, handler, http.MethodPost, "/api/validate", ValidationRequest{
		YAML: invalidYAML,
	}, http.StatusOK, &validated)
	if validated.Valid || !strings.Contains(validated.Error, "reportedMetric must reference a device metric") {
		t.Fatalf("expected critical config validation rejection, got %+v", validated)
	}

	var saved SaveResponse
	requestJSON(t, handler, http.MethodPost, "/api/save", SaveRequest{
		YAML: invalidYAML,
	}, http.StatusOK, &saved)
	if saved.Saved || saved.Validation.Valid || !strings.Contains(saved.Validation.Error, "reportedMetric must reference a device metric") {
		t.Fatalf("expected invalid save rejection, got %+v", saved)
	}
	raw, err := os.ReadFile(targetPath)
	if err != nil {
		t.Fatalf("read target after invalid save: %v", err)
	}
	if string(raw) != string(original) {
		t.Fatalf("invalid save must not change target, got %q", string(raw))
	}
}

func TestServerServesOnlyEmbeddedAssets(t *testing.T) {
	service, err := NewConfigFileService(filepath.Join(t.TempDir(), "edge-runtime.yaml"))
	if err != nil {
		t.Fatalf("create file service: %v", err)
	}
	handler := NewServer(service)

	for _, path := range []string{"/", "/index.html", "/app.js", "/styles.css"} {
		recorder := httptest.NewRecorder()
		handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, path, nil))
		if recorder.Code != http.StatusOK {
			t.Fatalf("GET %s: expected status 200, got %d", path, recorder.Code)
		}
		if strings.TrimSpace(recorder.Body.String()) == "" {
			t.Fatalf("GET %s: expected embedded asset content", path)
		}
	}

	for _, path := range []string{"/missing.txt", "/web/", "/../go.mod"} {
		recorder := httptest.NewRecorder()
		handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, path, nil))
		if recorder.Code != http.StatusNotFound {
			t.Fatalf("GET %s: expected status 404, got %d", path, recorder.Code)
		}
	}
}

func requestJSON(t *testing.T, handler http.Handler, method string, path string, body any, wantStatus int, output any) {
	t.Helper()
	var raw []byte
	if body != nil {
		var err error
		raw, err = json.Marshal(body)
		if err != nil {
			t.Fatalf("marshal request body: %v", err)
		}
	}
	requestRawJSON(t, handler, method, path, raw, wantStatus, output)
}

func requestRawJSON(t *testing.T, handler http.Handler, method string, path string, body any, wantStatus int, output any) {
	t.Helper()
	var raw []byte
	switch value := body.(type) {
	case nil:
	case []byte:
		raw = value
	default:
		var err error
		raw, err = json.Marshal(value)
		if err != nil {
			t.Fatalf("marshal raw request body: %v", err)
		}
	}

	request := httptest.NewRequest(method, path, bytes.NewReader(raw))
	if body != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	if recorder.Code != wantStatus {
		t.Fatalf("%s %s: expected status %d, got %d body=%q", method, path, wantStatus, recorder.Code, recorder.Body.String())
	}
	if output == nil {
		return
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), output); err != nil {
		t.Fatalf("%s %s: decode response %q: %v", method, path, recorder.Body.String(), err)
	}
}
