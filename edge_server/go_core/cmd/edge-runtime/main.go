package main

import (
	"context"
	"flag"
	"log"
	"os"
	"strings"

	"edge_server/go_core/internal/runtime"
)

func main() {
	onboardingPathFlag := flag.String("onboarding-package", "", "Path to operator-provided onboarding package JSON")
	onboardingJSONFlag := flag.String("onboarding-package-json", "", "Inline operator-provided onboarding package JSON")
	flag.Parse()

	runner := runtime.New()
	bootstrap := runtime.NewBootstrapSession(runner)

	bootstrapInput := runtime.BootstrapInput{
		OnboardingPackagePath: firstNonEmpty(
			*onboardingPathFlag,
			os.Getenv("EDGE_ONBOARDING_PACKAGE_PATH"),
		),
		OnboardingPackageJSON: firstNonEmpty(
			*onboardingJSONFlag,
			os.Getenv("EDGE_ONBOARDING_PACKAGE_JSON"),
		),
	}

	if strings.TrimSpace(bootstrapInput.OnboardingPackagePath) != "" ||
		strings.TrimSpace(bootstrapInput.OnboardingPackageJSON) != "" {
		if err := bootstrap.Bootstrap(bootstrapInput); err != nil {
			log.Fatalf("edge runtime bootstrap failed: %v", err)
		}
	} else {
		log.Printf("edge runtime started without onboarding package input; session remains untrusted until onboarding succeeds")
	}

	if err := runner.Run(context.Background()); err != nil {
		log.Fatalf("edge runtime failed: %v", err)
	}
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed != "" {
			return trimmed
		}
	}

	return ""
}
