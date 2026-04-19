package contract

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"gopkg.in/yaml.v3"
)

type openAPIDocument struct {
	Paths map[string]any `yaml:"paths"`
}

func contractDocPath(parts ...string) string {
	base := []string{"..", "..", "..", ".."}
	return filepath.Join(append(base, parts...)...)
}

func TestCloudLifecycleParityHarness(t *testing.T) {
	websocketContractPath := contractDocPath(
		"specs",
		"001-cloud-server",
		"contracts",
		"websocket.md",
	)
	quickstartPath := contractDocPath(
		"specs",
		"007-edge-server",
		"quickstart.md",
	)
	dataModelPath := contractDocPath(
		"specs",
		"007-edge-server",
		"data-model.md",
	)
	openAPIPath := contractDocPath(
		"cloud_server",
		"openapi.yaml",
	)

	websocketContract, err := os.ReadFile(websocketContractPath)
	if err != nil {
		t.Fatalf("read websocket contract: %v", err)
	}
	quickstart, err := os.ReadFile(quickstartPath)
	if err != nil {
		t.Fatalf("read 007 quickstart: %v", err)
	}
	dataModel, err := os.ReadFile(dataModelPath)
	if err != nil {
		t.Fatalf("read 007 data model: %v", err)
	}
	openAPIRaw, err := os.ReadFile(openAPIPath)
	if err != nil {
		t.Fatalf("read cloud openapi: %v", err)
	}

	websocketText := string(websocketContract)
	for _, code := range []string{
		"edge_not_found",
		"blocked",
		"invalid_credential",
		"edge_auth_internal_error",
	} {
		if !strings.Contains(websocketText, code) {
			t.Fatalf("websocket contract must include active connect_error code %q", code)
		}
	}
	for _, legacyCode := range []string{
		"onboarding_not_allowed",
		"onboarding_package_missing",
		"onboarding_package_expired",
		"onboarding_package_reused",
		"persistent_credential_revoked",
	} {
		if strings.Contains(websocketText, legacyCode) {
			t.Fatalf("websocket contract must not keep retired connect_error code %q", legacyCode)
		}
	}
	for _, requiredSnippet := range []string{
		"`socket.handshake.auth`",
		"`edgeId`",
		"`credentialSecret`",
		"`credential_rotated`",
		"`blocked`",
		"`telemetry`",
		"`deviceId`",
		"`metric`",
		"`value`",
		"`ts`",
		"Cloud permits at most one trusted runtime session per `edgeId`",
	} {
		if !strings.Contains(websocketText, requiredSnippet) {
			t.Fatalf("websocket contract must document %s", requiredSnippet)
		}
	}
	if strings.Contains(websocketText, "`credentialMode`") {
		t.Fatal("websocket contract must not require legacy handshake field `credentialMode`")
	}
	if !strings.Contains(websocketText, "onboarding-package authentication is not part of the active contract") {
		t.Fatal("websocket contract must explicitly retire onboarding-package authentication from the active handshake")
	}

	quickstartText := string(quickstart)
	for _, requiredSnippet := range []string{
		"does not use onboarding-package semantics",
		"`credential.json`",
		"`runtime.edgeId`",
		"stateDir:",
		"`POST /api/edge-servers/{edgeId}/rotate-credential`",
		"`POST /api/edge-servers/{edgeId}/unblock`",
	} {
		if !strings.Contains(quickstartText, requiredSnippet) {
			t.Fatalf("007 quickstart must document %s", requiredSnippet)
		}
	}

	dataModelText := string(dataModel)
	for _, requiredSnippet := range []string{
		"`runtime.edgeId`",
		"`runtime.stateDir`",
		"`credentialSecret`",
		"`version`",
		"`issuedAt`",
		"`source`",
		"`installedAt`",
		"credential_rotated",
	} {
		if !strings.Contains(dataModelText, requiredSnippet) {
			t.Fatalf("007 data model must document %s", requiredSnippet)
		}
	}

	var openAPI openAPIDocument
	if err := yaml.Unmarshal(openAPIRaw, &openAPI); err != nil {
		t.Fatalf("parse cloud openapi: %v", err)
	}
	for _, path := range []string{
		"/api/edge-servers",
		"/api/edge-servers/{edgeId}/rotate-credential",
		"/api/edge-servers/{edgeId}/block",
		"/api/edge-servers/{edgeId}/unblock",
	} {
		if _, ok := openAPI.Paths[path]; !ok {
			t.Fatalf("cloud openapi must define %s", path)
		}
	}
}
