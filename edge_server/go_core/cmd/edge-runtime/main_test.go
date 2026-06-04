package main

import (
	"testing"
	"time"

	"edge_server/go_core/internal/config"
)

func TestBuildWebSocketTransportConfigUsesCloudConnectTimeout(t *testing.T) {
	cfg := config.Config{
		Cloud: config.CloudConfig{
			URL:              "https://cloud.example.test",
			Namespace:        "/edge",
			ConnectTimeoutMs: 1234,
		},
	}

	transportConfig := buildWebSocketTransportConfig(cfg)

	if transportConfig.CloudURL != cfg.Cloud.URL {
		t.Fatalf("unexpected cloud url: %q", transportConfig.CloudURL)
	}
	if transportConfig.Namespace != cfg.Cloud.Namespace {
		t.Fatalf("unexpected namespace: %q", transportConfig.Namespace)
	}
	if transportConfig.ConnectTimeout != 1234*time.Millisecond {
		t.Fatalf("unexpected connect timeout: %s", transportConfig.ConnectTimeout)
	}
}
