package configurator

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestConfigFileServiceLoadsMissingTargetAsEmpty(t *testing.T) {
	targetPath := filepath.Join(t.TempDir(), "edge-runtime.yaml")
	service, err := NewConfigFileService(targetPath)
	if err != nil {
		t.Fatalf("create file service: %v", err)
	}

	loaded, err := service.Load()
	if err != nil {
		t.Fatalf("load missing target: %v", err)
	}
	if loaded.Exists {
		t.Fatal("missing target must report Exists=false")
	}
	if loaded.YAML != "" {
		t.Fatalf("missing target must load empty YAML, got %q", loaded.YAML)
	}
}

func TestConfigFileServiceSavesValidYAMLToConfiguredTarget(t *testing.T) {
	dir := t.TempDir()
	targetPath := filepath.Join(dir, "edge-runtime.yaml")
	browserChosenPath := filepath.Join(dir, "browser-selected.yaml")
	if err := os.WriteFile(targetPath, []byte("old: content\n"), 0o600); err != nil {
		t.Fatalf("write existing target: %v", err)
	}
	service, err := NewConfigFileService(targetPath)
	if err != nil {
		t.Fatalf("create file service: %v", err)
	}

	saved, err := service.Save(ArduinoStandPresetYAML())
	if err != nil {
		t.Fatalf("save valid YAML: %v", err)
	}
	if !saved.Saved || !saved.Validation.Valid {
		t.Fatalf("expected saved valid response, got %+v", saved)
	}

	raw, err := os.ReadFile(targetPath)
	if err != nil {
		t.Fatalf("read configured target: %v", err)
	}
	if string(raw) != ArduinoStandPresetYAML() {
		t.Fatal("saved YAML must match submitted content")
	}
	if _, err := os.Stat(browserChosenPath); !os.IsNotExist(err) {
		t.Fatalf("save must not create browser-chosen path, stat err=%v", err)
	}
}

func TestConfigFileServiceSaveRejectsInvalidYAMLBeforeWriting(t *testing.T) {
	targetPath := filepath.Join(t.TempDir(), "edge-runtime.yaml")
	service, err := NewConfigFileService(targetPath)
	if err != nil {
		t.Fatalf("create file service: %v", err)
	}

	saved, err := service.Save("runtime:\n  edgeId: [")
	if err != nil {
		t.Fatalf("invalid YAML should return validation response, not file error: %v", err)
	}
	if saved.Saved || saved.Validation.Valid || saved.Validation.Error == "" {
		t.Fatalf("expected failed validation response, got %+v", saved)
	}
	if _, err := os.Stat(targetPath); !os.IsNotExist(err) {
		t.Fatalf("invalid save must not write target, stat err=%v", err)
	}
}

func TestConfigFileServiceSaveContractHasNoBrowserPathParameter(t *testing.T) {
	method, ok := reflect.TypeOf(ConfigFileService{}).MethodByName("Save")
	if !ok {
		t.Fatal("ConfigFileService must expose Save")
	}
	if method.Type.NumIn() != 2 {
		t.Fatalf("Save must accept only receiver and YAML content, got %d inputs", method.Type.NumIn())
	}
	if method.Type.In(1).Kind() != reflect.String {
		t.Fatalf("Save YAML input must be a string, got %s", method.Type.In(1))
	}
}
