package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"time"

	"edge_server/go_core/internal/configurator"
)

type edgeConfiguratorOptions struct {
	configPath string
}

type ioWriters struct {
	stdout io.Writer
	stderr io.Writer
}

type edgeConfiguratorDependencies struct {
	start       func(ctx context.Context, options edgeConfiguratorOptions, writers ioWriters) error
	listen      func(network string, address string) (net.Listener, error)
	serve       func(server *http.Server, listener net.Listener) error
	openBrowser func(url string) error
}

func main() {
	code := runEdgeConfigurator(context.Background(), os.Args[1:], os.Stdout, os.Stderr, edgeConfiguratorDependencies{})
	os.Exit(code)
}

func runEdgeConfigurator(ctx context.Context, args []string, stdout io.Writer, stderr io.Writer, deps edgeConfiguratorDependencies) int {
	options, err := parseEdgeConfiguratorArgs(args, stderr)
	if err != nil {
		fmt.Fprintf(stderr, "edge-configurator: %v\n", err)
		return 2
	}

	writers := ioWriters{stdout: stdout, stderr: stderr}
	if deps.start == nil {
		deps.start = func(ctx context.Context, options edgeConfiguratorOptions, writers ioWriters) error {
			return startEdgeConfigurator(ctx, options, writers, deps)
		}
	}

	if err := deps.start(ctx, options, writers); err != nil {
		fmt.Fprintf(stderr, "edge-configurator: %v\n", err)
		return 1
	}

	fmt.Fprintf(stdout, "edge-configurator: ready for %s\n", options.configPath)
	return 0
}

func parseEdgeConfiguratorArgs(args []string, stderr io.Writer) (edgeConfiguratorOptions, error) {
	fs := flag.NewFlagSet("edge-configurator", flag.ContinueOnError)
	fs.SetOutput(stderr)

	configPath := fs.String("config", "", "Path to operator-provided runtime config YAML")

	if err := fs.Parse(args); err != nil {
		return edgeConfiguratorOptions{}, err
	}

	options := edgeConfiguratorOptions{
		configPath: strings.TrimSpace(*configPath),
	}
	if options.configPath == "" {
		return edgeConfiguratorOptions{}, fmt.Errorf("--config is required")
	}

	return options, nil
}

func startEdgeConfigurator(ctx context.Context, options edgeConfiguratorOptions, writers ioWriters, deps edgeConfiguratorDependencies) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if deps.listen == nil {
		deps.listen = net.Listen
	}
	if deps.serve == nil {
		deps.serve = func(server *http.Server, listener net.Listener) error {
			return server.Serve(listener)
		}
	}
	if deps.openBrowser == nil {
		deps.openBrowser = openBrowser
	}

	files, err := configurator.NewConfigFileService(options.configPath)
	if err != nil {
		return err
	}
	listener, err := deps.listen("tcp", "127.0.0.1:0")
	if err != nil {
		return fmt.Errorf("listen on local configurator address: %w", err)
	}

	localURL := localConfiguratorURL(listener)
	fmt.Fprintf(writers.stdout, "edge-configurator: local URL %s\n", localURL)
	if err := deps.openBrowser(localURL); err != nil {
		fmt.Fprintf(writers.stderr, "edge-configurator: browser auto-open failed: %v\n", err)
	}

	server := &http.Server{
		Handler:           configurator.NewServer(files),
		ReadHeaderTimeout: 5 * time.Second,
	}
	if err := deps.serve(server, listener); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return fmt.Errorf("serve local configurator: %w", err)
	}
	return nil
}

func localConfiguratorURL(listener net.Listener) string {
	if tcpAddr, ok := listener.Addr().(*net.TCPAddr); ok {
		return fmt.Sprintf("http://127.0.0.1:%d", tcpAddr.Port)
	}
	return fmt.Sprintf("http://%s", listener.Addr().String())
}

func openBrowser(url string) error {
	var command string
	var args []string
	switch runtime.GOOS {
	case "windows":
		command = "rundll32"
		args = []string{"url.dll,FileProtocolHandler", url}
	case "darwin":
		command = "open"
		args = []string{url}
	default:
		command = "xdg-open"
		args = []string{url}
	}
	return exec.Command(command, args...).Start()
}
