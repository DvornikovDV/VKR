package main

import (
	"context"
	"flag"
	"fmt"
	"io"
	"os"
	"strings"
)

type edgeConfiguratorOptions struct {
	configPath string
}

type edgeConfiguratorDependencies struct {
	start func(ctx context.Context, options edgeConfiguratorOptions) error
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

	if deps.start == nil {
		deps.start = startEdgeConfiguratorScaffold
	}

	if err := deps.start(ctx, options); err != nil {
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

func startEdgeConfiguratorScaffold(ctx context.Context, options edgeConfiguratorOptions) error {
	return nil
}
