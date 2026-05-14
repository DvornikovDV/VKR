package configurator

import (
	"strings"
	"testing"
)

func TestValidationServiceReportsConfigParseResults(t *testing.T) {
	service := ValidationService{}

	valid := service.Validate(ArduinoStandPresetYAML())
	if !valid.Valid {
		t.Fatalf("expected Arduino stand preset to validate, got error %q", valid.Error)
	}
	if valid.Error != "" {
		t.Fatalf("valid response must not include an error, got %q", valid.Error)
	}

	invalidYAML := strings.Replace(ArduinoStandPresetYAML(), "reportedMetric: actual_state", "reportedMetric: missing_metric", 1)
	invalid := service.Validate(invalidYAML)
	if invalid.Valid {
		t.Fatal("expected config.Parse validation to reject a missing reportedMetric")
	}
	if !strings.Contains(invalid.Error, "reportedMetric must reference a device metric") {
		t.Fatalf("expected config.Parse error text, got %q", invalid.Error)
	}
}
