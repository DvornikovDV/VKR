package contract

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func contractDocPath(parts ...string) string {
	base := []string{"..", "..", "..", ".."}
	return filepath.Join(append(base, parts...)...)
}

func TestCloudLifecycleParityHarness(t *testing.T) {
	cloudContractPath := contractDocPath(
		"specs",
		"001-edge-runtime",
		"contracts",
		"cloud-runtime-contract.md",
	)
	legacyLifecycleContractPath := contractDocPath(
		"specs",
		"004-edge-onboarding",
		"contracts",
		"edge-socket-contract.md",
	)
	cloudAuthServicePath := contractDocPath(
		"cloud_server",
		"src",
		"services",
		"edge-onboarding.service.ts",
	)
	cloudSocketEventsPath := contractDocPath(
		"cloud_server",
		"src",
		"socket",
		"events",
		"edge.ts",
	)

	cloudContract, err := os.ReadFile(cloudContractPath)
	if err != nil {
		t.Fatalf("read cloud runtime contract: %v", err)
	}
	legacyLifecycleContract, err := os.ReadFile(legacyLifecycleContractPath)
	if err != nil {
		t.Fatalf("read lifecycle contract: %v", err)
	}
	cloudAuthService, err := os.ReadFile(cloudAuthServicePath)
	if err != nil {
		t.Fatalf("read cloud auth service source: %v", err)
	}
	cloudSocketEvents, err := os.ReadFile(cloudSocketEventsPath)
	if err != nil {
		t.Fatalf("read cloud socket edge source: %v", err)
	}

	requiredAuthRejectionCodes := []string{
		"edge_not_found",
		"blocked",
		"onboarding_not_allowed",
		"onboarding_package_missing",
		"onboarding_package_expired",
		"onboarding_package_reused",
		"invalid_credential",
		"persistent_credential_revoked",
	}

	for _, code := range requiredAuthRejectionCodes {
		if !strings.Contains(string(cloudContract), code) {
			t.Fatalf("cloud runtime contract must include connect_error code %q", code)
		}
		if !strings.Contains(string(legacyLifecycleContract), code) {
			t.Fatalf("lifecycle contract must include connect_error code %q", code)
		}
		if !strings.Contains(string(cloudAuthService), code) {
			t.Fatalf("cloud auth service source must include rejection code %q", code)
		}
	}

	internalErrorCode := "edge_auth_internal_error"
	if !strings.Contains(string(cloudContract), internalErrorCode) {
		t.Fatalf("cloud runtime contract must include connect_error code %q", internalErrorCode)
	}
	if !strings.Contains(string(legacyLifecycleContract), internalErrorCode) {
		t.Fatalf("lifecycle contract must include connect_error code %q", internalErrorCode)
	}
	if !strings.Contains(string(cloudSocketEvents), internalErrorCode) {
		t.Fatalf("cloud edge socket source must include middleware error code %q", internalErrorCode)
	}

	if !strings.Contains(string(cloudSocketEvents), "next(new Error(authResult.code))") {
		t.Fatal("cloud edge socket source must forward cloud auth rejection codes to connect_error")
	}
	if !strings.Contains(string(cloudSocketEvents), "next(new Error('invalid_credential'))") {
		t.Fatal("cloud edge socket source must reject malformed payload with invalid_credential")
	}
	if !strings.Contains(string(cloudSocketEvents), "next(new Error('edge_auth_internal_error'))") {
		t.Fatal("cloud edge socket source must map unexpected middleware failures to edge_auth_internal_error")
	}
}
