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
	"edge_server/go_core/internal/runtimeapp"
)

func main() {
	configPathFlag := flag.String("config", "", "Path to operator-provided runtime config YAML")
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
	if err := process.Runner.Run(ctx); err != nil {
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
