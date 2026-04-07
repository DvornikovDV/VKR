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
	IssuedAt         time.Time
	ExpiresAt        time.Time
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

	issuedAtRaw := strings.TrimSpace(payload.IssuedAt)
	if issuedAtRaw == "" {
		return OnboardingPackage{}, fmt.Errorf("onboarding package issuedAt is required")
	}
	issuedAt, err := time.Parse(time.RFC3339, issuedAtRaw)
	if err != nil {
		return OnboardingPackage{}, fmt.Errorf("onboarding package issuedAt must be RFC3339: %w", err)
	}

	expiresAtRaw := strings.TrimSpace(payload.ExpiresAt)
	if expiresAtRaw == "" {
		return OnboardingPackage{}, fmt.Errorf("onboarding package expiresAt is required")
	}
	expiresAt, err := time.Parse(time.RFC3339, expiresAtRaw)
	if err != nil {
		return OnboardingPackage{}, fmt.Errorf("onboarding package expiresAt must be RFC3339: %w", err)
	}
	if !expiresAt.After(issuedAt) {
		return OnboardingPackage{}, fmt.Errorf("onboarding package expiresAt must be after issuedAt")
	}

	return OnboardingPackage{
		EdgeID:           edgeID,
		OnboardingSecret: onboardingSecret,
		IssuedAt:         issuedAt.UTC(),
		ExpiresAt:        expiresAt.UTC(),
	}, nil
}
