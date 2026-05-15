package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"strings"
)

type installMode string

const (
	installModeInteractive installMode = "interactive"
	installModeStdin       installMode = "stdin"
)

type edgeCredentialOptions struct {
	subcommand string
	configPath string
	fromStdin  bool
	mode       installMode
}

type commandIO struct {
	stdin  io.Reader
	stdout io.Writer
	stderr io.Writer
}

type edgeCredentialDependencies struct {
	install func(ctx context.Context, options edgeCredentialOptions, io commandIO) error
}

func main() {
	code := runEdgeCredential(context.Background(), os.Args[1:], os.Stdin, os.Stdout, os.Stderr, edgeCredentialDependencies{})
	os.Exit(code)
}

func runEdgeCredential(ctx context.Context, args []string, stdin io.Reader, stdout io.Writer, stderr io.Writer, deps edgeCredentialDependencies) int {
	options, err := parseEdgeCredentialArgs(args, stderr)
	if err != nil {
		fmt.Fprintf(stderr, "edge-credential: %v\n", err)
		return 2
	}

	if deps.install == nil {
		deps.install = func(context.Context, edgeCredentialOptions, commandIO) error {
			return errors.New("install behavior is not implemented")
		}
	}

	if err := deps.install(ctx, options, commandIO{stdin: stdin, stdout: stdout, stderr: stderr}); err != nil {
		fmt.Fprintf(stderr, "edge-credential: %v\n", err)
		return 1
	}

	return 0
}

func parseEdgeCredentialArgs(args []string, stderr io.Writer) (edgeCredentialOptions, error) {
	if len(args) == 0 {
		return edgeCredentialOptions{}, fmt.Errorf("subcommand is required")
	}

	subcommand := strings.TrimSpace(args[0])
	if subcommand != "install" {
		return edgeCredentialOptions{}, fmt.Errorf("unknown subcommand %q", subcommand)
	}

	fs := flag.NewFlagSet("edge-credential install", flag.ContinueOnError)
	fs.SetOutput(stderr)

	configPath := fs.String("config", "", "Path to operator-provided runtime config YAML")
	fromStdin := fs.Bool("from-stdin", false, "Read credential disclosure JSON from stdin")

	if err := fs.Parse(args[1:]); err != nil {
		return edgeCredentialOptions{}, err
	}

	options := edgeCredentialOptions{
		subcommand: subcommand,
		configPath: strings.TrimSpace(*configPath),
		fromStdin:  *fromStdin,
		mode:       installModeInteractive,
	}
	if options.fromStdin {
		options.mode = installModeStdin
	}
	if options.configPath == "" {
		return edgeCredentialOptions{}, fmt.Errorf("--config is required")
	}

	return options, nil
}
