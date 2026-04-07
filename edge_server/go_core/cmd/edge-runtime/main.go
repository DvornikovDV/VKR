package main

import (
	"context"
	"flag"
	"log"
	"os"
	"os/signal"
	"strings"
	"syscall"

	"edge_server/go_core/internal/cloud"
	"edge_server/go_core/internal/config"
	"edge_server/go_core/internal/runtime"
	"edge_server/go_core/internal/runtimeapp"
)

func main() {
	configPathFlag := flag.String("config", "", "Path to operator-provided runtime config YAML")
	onboardingPathFlag := flag.String("onboarding-package", "", "Path to operator-provided onboarding package JSON")
	onboardingJSONFlag := flag.String("onboarding-package-json", "", "Inline operator-provided onboarding package JSON")
	flag.Parse()

	configPath := firstNonEmpty(
		*configPathFlag,
		os.Getenv("EDGE_CONFIG_PATH"),
	)
	if strings.TrimSpace(configPath) == "" {
		log.Fatalf("edge runtime requires --config or EDGE_CONFIG_PATH to construct the cloud transport")
	}

	cfg, err := config.LoadFromFile(configPath)
	if err != nil {
		log.Fatalf("edge runtime config load failed: %v", err)
	}

	transport, err := cloud.NewWebSocketTransport(cloud.WebSocketTransportConfig{
		CloudURL:  cfg.Cloud.URL,
		Namespace: cfg.Cloud.Namespace,
	})
	if err != nil {
		log.Fatalf("edge runtime transport setup failed: %v", err)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	process, err := runtimeapp.New(ctx, cfg, transport)
	if err != nil {
		log.Fatalf("edge runtime app setup failed: %v", err)
	}
	runner := process.Runner
	bootstrap := process.Bootstrap

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
	}

	if err := runner.Run(ctx); err != nil {
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
