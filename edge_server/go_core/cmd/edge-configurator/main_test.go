package main

import (
	"bytes"
	"context"
	"errors"
	"net"
	"net/http"
	"strings"
	"testing"
)

func TestEdgeConfiguratorRequiresConfig(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	startCalled := false

	code := runEdgeConfigurator(context.Background(), nil, &stdout, &stderr, edgeConfiguratorDependencies{
		start: func(context.Context, edgeConfiguratorOptions, ioWriters) error {
			startCalled = true
			return nil
		},
	})

	if code != 2 {
		t.Fatalf("expected validation exit code 2, got %d", code)
	}
	if !strings.Contains(stderr.String(), "--config is required") {
		t.Fatalf("expected stderr to contain missing config error, got %q", stderr.String())
	}
	if stdout.Len() != 0 {
		t.Fatalf("validation failure must not print readiness output, got %q", stdout.String())
	}
	if startCalled {
		t.Fatal("validation failure must not reach startup wiring")
	}
}

func TestEdgeConfiguratorDelegatesToInjectedStartup(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	var gotOptions edgeConfiguratorOptions
	startCalled := false

	code := runEdgeConfigurator(context.Background(), []string{"--config", " edge-runtime.yaml "}, &stdout, &stderr, edgeConfiguratorDependencies{
		start: func(ctx context.Context, options edgeConfiguratorOptions, writers ioWriters) error {
			startCalled = true
			gotOptions = options
			if ctx == nil {
				t.Fatal("startup context must be passed through")
			}
			if writers.stdout == nil || writers.stderr == nil {
				t.Fatal("startup writers must be passed through")
			}
			return nil
		},
	})

	if code != 0 {
		t.Fatalf("expected success exit code 0, got %d; stderr=%q", code, stderr.String())
	}
	if !startCalled {
		t.Fatal("expected injected startup to be called")
	}
	if gotOptions.configPath != "edge-runtime.yaml" {
		t.Fatalf("expected trimmed config path, got %q", gotOptions.configPath)
	}
	if !strings.Contains(stdout.String(), "edge-configurator: ready for edge-runtime.yaml") {
		t.Fatalf("expected readiness output, got %q", stdout.String())
	}
	if stderr.Len() != 0 {
		t.Fatalf("success must not write stderr, got %q", stderr.String())
	}
}

func TestEdgeConfiguratorReportsInjectedStartupError(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	wantErr := errors.New("startup failed")

	code := runEdgeConfigurator(context.Background(), []string{"--config", "edge-runtime.yaml"}, &stdout, &stderr, edgeConfiguratorDependencies{
		start: func(context.Context, edgeConfiguratorOptions, ioWriters) error {
			return wantErr
		},
	})

	if code != 1 {
		t.Fatalf("expected startup failure exit code 1, got %d", code)
	}
	if !strings.Contains(stderr.String(), "startup failed") {
		t.Fatalf("expected stderr to contain startup error, got %q", stderr.String())
	}
	if stdout.Len() != 0 {
		t.Fatalf("startup failure must not print readiness output, got %q", stdout.String())
	}
}

func TestEdgeConfiguratorStartupCreatesLocalURLAndIgnoresBrowserOpenFailure(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	var listenedNetwork string
	var listenedAddress string
	var servedHandler http.Handler
	browserOpened := false

	code := runEdgeConfigurator(context.Background(), []string{"--config", "edge-runtime.yaml"}, &stdout, &stderr, edgeConfiguratorDependencies{
		listen: func(network string, address string) (net.Listener, error) {
			listenedNetwork = network
			listenedAddress = address
			return net.Listen(network, address)
		},
		serve: func(server *http.Server, listener net.Listener) error {
			servedHandler = server.Handler
			return listener.Close()
		},
		openBrowser: func(url string) error {
			browserOpened = true
			if !strings.HasPrefix(url, "http://127.0.0.1:") {
				t.Fatalf("browser must receive local URL, got %q", url)
			}
			return errors.New("browser unavailable")
		},
	})

	if code != 0 {
		t.Fatalf("expected browser open failure to keep startup successful, got code %d stderr=%q", code, stderr.String())
	}
	if listenedNetwork != "tcp" || listenedAddress != "127.0.0.1:0" {
		t.Fatalf("expected local-only listener bind, got network=%q address=%q", listenedNetwork, listenedAddress)
	}
	if !browserOpened {
		t.Fatal("expected startup to attempt browser open")
	}
	if servedHandler == nil {
		t.Fatal("expected injected server dependency to receive configurator handler")
	}
	if !strings.Contains(stdout.String(), "edge-configurator: local URL http://127.0.0.1:") {
		t.Fatalf("expected local URL output, got %q", stdout.String())
	}
	if strings.Contains(stdout.String(), "0.0.0.0") {
		t.Fatalf("startup output must not expose wildcard bind address, got %q", stdout.String())
	}
	if !strings.Contains(stderr.String(), "browser auto-open failed") {
		t.Fatalf("expected non-fatal browser warning, got %q", stderr.String())
	}
}
