package contract

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"gopkg.in/yaml.v3"
)

type openAPIDocument struct {
	Paths      map[string]any `yaml:"paths"`
	Components struct {
		Schemas map[string]any `yaml:"schemas"`
	} `yaml:"components"`
}

func contractDocPath(parts ...string) string {
	base := []string{"..", "..", "..", ".."}
	return filepath.Join(append(base, parts...)...)
}

func TestT031CloudOwnedContractsDefineCurrentEdgeRuntimeSurface(t *testing.T) {
	websocketContractPath := contractDocPath(
		"specs",
		"001-cloud-server",
		"contracts",
		"websocket.md",
	)
	openAPIPath := contractDocPath(
		"cloud_server",
		"openapi.yaml",
	)

	websocketContract, err := os.ReadFile(websocketContractPath)
	if err != nil {
		t.Fatalf("read websocket contract: %v", err)
	}
	openAPIRaw, err := os.ReadFile(openAPIPath)
	if err != nil {
		t.Fatalf("read cloud openapi: %v", err)
	}

	websocketText := string(websocketContract)
	edgeRuntimeSection := markdownSection(t, websocketText, "## Edge Runtime")
	handshakeSection := markdownSection(t, edgeRuntimeSection, "### Handshake")
	connectErrorSection := markdownSection(t, edgeRuntimeSection, "### Listen: `connect_error`")

	for _, requiredSnippet := range []string{
		"`socket.handshake.auth` only",
		"`edgeId`: stable edge identifier",
		"`credentialSecret`: current persistent credential secret",
		"Cloud accepts the session only when the edge exists, is in lifecycle state `Active`, and the presented secret matches the current persistent credential",
		"Cloud permits at most one trusted runtime session per `edgeId`; additional concurrent connect attempts for the same `edgeId` are rejected with `invalid_credential`",
		"onboarding-package authentication is not part of the active contract",
	} {
		if !strings.Contains(handshakeSection, requiredSnippet) {
			t.Fatalf("websocket edge handshake contract must document %s", requiredSnippet)
		}
	}
	if strings.Contains(handshakeSection, "`credentialMode`") {
		t.Fatal("websocket edge handshake contract must not require legacy handshake field `credentialMode`")
	}

	wantConnectErrorCodes := []string{
		"edge_not_found",
		"blocked",
		"invalid_credential",
		"edge_auth_internal_error",
	}
	if got := codeBulletListBeforeRules(connectErrorSection); !reflect.DeepEqual(got, wantConnectErrorCodes) {
		t.Fatalf("websocket connect_error codes = %v, want %v", got, wantConnectErrorCodes)
	}

	for _, requiredSnippet := range []string{
		"`edge_not_found` means the presented `edgeId` does not resolve to a known edge record",
		"`invalid_credential` means the edge is not authorized under the current persistent credential",
	} {
		if !strings.Contains(connectErrorSection, requiredSnippet) {
			t.Fatalf("websocket connect_error contract must document %s", requiredSnippet)
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
	for _, schema := range []string{
		"EdgeCredentialIssueResponse",
		"EdgePersistentCredentialDisclosure",
		"EdgeStatusSnapshot",
	} {
		if _, ok := openAPI.Components.Schemas[schema]; !ok {
			t.Fatalf("cloud openapi must define schema %s", schema)
		}
	}
}

func markdownSection(t *testing.T, text string, heading string) string {
	t.Helper()

	lines := strings.Split(text, "\n")
	start := -1
	for i, line := range lines {
		if strings.TrimSpace(line) == heading {
			start = i + 1
			break
		}
	}
	if start == -1 {
		t.Fatalf("markdown heading %q not found", heading)
	}

	headingLevel := strings.Count(strings.Split(heading, " ")[0], "#")
	var section []string
	for _, line := range lines[start:] {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "#") {
			level := strings.Count(strings.Split(trimmed, " ")[0], "#")
			if level <= headingLevel {
				break
			}
		}
		section = append(section, line)
	}

	return strings.Join(section, "\n")
}

func codeBulletListBeforeRules(section string) []string {
	beforeRules := strings.Split(section, "Rules:")[0]
	codes := []string{}
	for _, line := range strings.Split(beforeRules, "\n") {
		trimmed := strings.TrimSpace(line)
		if !strings.HasPrefix(trimmed, "- `") {
			continue
		}
		codeStart := len("- `")
		codeEnd := strings.Index(trimmed[codeStart:], "`")
		if codeEnd == -1 {
			continue
		}
		codes = append(codes, trimmed[codeStart:codeStart+codeEnd])
	}
	return codes
}
