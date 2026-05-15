package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"strings"
	"time"

	"edge_server/go_core/internal/credentialinstall"
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
		deps.install = installEdgeCredential
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

func installEdgeCredential(ctx context.Context, options edgeCredentialOptions, streams commandIO) error {
	if ctx == nil {
		return errors.New("install context is required")
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	if streams.stdin == nil {
		return errors.New("stdin is required for --from-stdin install")
	}
	if streams.stdout == nil {
		return errors.New("stdout is required")
	}

	installedAt := time.Now().UTC()
	if options.mode == installModeInteractive {
		result, confirmed, err := credentialinstall.InstallInteractively(options.configPath, streams.stdin, streams.stdout, installedAt)
		if err != nil {
			return err
		}
		if !confirmed {
			fmt.Fprintln(streams.stdout, "install canceled")
			return nil
		}
		printInstallResult(streams.stdout, result)
		return nil
	}
	if options.mode != installModeStdin {
		return fmt.Errorf("unknown install mode %q", options.mode)
	}

	if streams.stdin == nil {
		return errors.New("stdin is required for --from-stdin install")
	}
	payload, err := io.ReadAll(streams.stdin)
	if err != nil {
		return fmt.Errorf("read credential disclosure from stdin: %w", err)
	}
	if err := ctx.Err(); err != nil {
		return err
	}

	result, err := credentialinstall.InstallFromDisclosureJSON(options.configPath, payload, installedAt)
	if err != nil {
		return err
	}

	printInstallResult(streams.stdout, result)
	return nil
}

func printInstallResult(stdout io.Writer, result credentialinstall.InstallResult) {
	fmt.Fprintf(
		stdout,
		"installed credential: edgeId=%s version=%d source=%s path=%s installedAt=%s\n",
		result.EdgeID,
		result.Version,
		result.Source,
		result.CredentialPath,
		result.InstalledAt.Format(time.RFC3339),
	)
}
