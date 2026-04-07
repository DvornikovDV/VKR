package runtime

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"time"
)

type OnboardingPackage struct {
	EdgeID           string
	OnboardingSecret string
	IssuedAt         *time.Time
	ExpiresAt        *time.Time
}

type onboardingPackageJSON struct {
	EdgeID           string `json:"edgeId"`
	OnboardingSecret string `json:"onboardingSecret"`
	IssuedAt         string `json:"issuedAt"`
	ExpiresAt        string `json:"expiresAt"`
}

func LoadOnboardingPackageFromFile(path string) (OnboardingPackage, error) {
	normalizedPath := strings.TrimSpace(path)
	if normalizedPath == "" {
		return OnboardingPackage{}, fmt.Errorf("onboarding package path is required")
	}

	raw, err := os.ReadFile(normalizedPath)
	if err != nil {
		return OnboardingPackage{}, fmt.Errorf("read onboarding package: %w", err)
	}

	return ParseOnboardingPackage(raw)
}

func ParseOnboardingPackage(raw []byte) (OnboardingPackage, error) {
	expanded := os.ExpandEnv(string(raw))

	var payload onboardingPackageJSON
	if err := json.Unmarshal([]byte(expanded), &payload); err != nil {
		return OnboardingPackage{}, fmt.Errorf("parse onboarding package json: %w", err)
	}

	edgeID := strings.TrimSpace(payload.EdgeID)
	if edgeID == "" {
		return OnboardingPackage{}, fmt.Errorf("onboarding package edgeId is required")
	}

	onboardingSecret := strings.TrimSpace(payload.OnboardingSecret)
	if onboardingSecret == "" {
		return OnboardingPackage{}, fmt.Errorf("onboarding package onboardingSecret is required")
	}

	issuedAt, err := parseOptionalRFC3339(payload.IssuedAt, "issuedAt")
	if err != nil {
		return OnboardingPackage{}, fmt.Errorf("onboarding package %w", err)
	}

	expiresAt, err := parseOptionalRFC3339(payload.ExpiresAt, "expiresAt")
	if err != nil {
		return OnboardingPackage{}, fmt.Errorf("onboarding package %w", err)
	}
	if issuedAt != nil && expiresAt != nil && !expiresAt.After(*issuedAt) {
		return OnboardingPackage{}, fmt.Errorf("onboarding package expiresAt must be after issuedAt")
	}

	return OnboardingPackage{
		EdgeID:           edgeID,
		OnboardingSecret: onboardingSecret,
		IssuedAt:         issuedAt,
		ExpiresAt:        expiresAt,
	}, nil
}

func parseOptionalRFC3339(raw string, fieldName string) (*time.Time, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return nil, nil
	}

	parsed, err := time.Parse(time.RFC3339, trimmed)
	if err != nil {
		return nil, fmt.Errorf("%s must be RFC3339: %w", fieldName, err)
	}

	normalized := parsed.UTC()
	return &normalized, nil
}
