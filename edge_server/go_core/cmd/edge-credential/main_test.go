package main

import (
	"bytes"
	"context"
	"errors"
	"io"
	"strings"
	"testing"
)

func TestEdgeCredentialInstallValidatesSubcommandAndConfig(t *testing.T) {
	cases := []struct {
		name       string
		args       []string
		errSnippet string
	}{
		{
			name:       "missing subcommand",
			args:       nil,
			errSnippet: "subcommand is required",
		},
		{
			name:       "unknown subcommand",
			args:       []string{"rotate", "--config", "edge-runtime.yaml"},
			errSnippet: `unknown subcommand "rotate"`,
		},
		{
			name:       "missing config",
			args:       []string{"install"},
			errSnippet: "--config is required",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var stdout bytes.Buffer
			var stderr bytes.Buffer
			installCalled := false

			code := runEdgeCredential(context.Background(), tc.args, strings.NewReader("secret input"), &stdout, &stderr, edgeCredentialDependencies{
				install: func(context.Context, edgeCredentialOptions, commandIO) error {
					installCalled = true
					return nil
				},
			})

			if code != 2 {
				t.Fatalf("expected validation exit code 2, got %d", code)
			}
			if !strings.Contains(stderr.String(), tc.errSnippet) {
				t.Fatalf("expected stderr to contain %q, got %q", tc.errSnippet, stderr.String())
			}
			if stdout.Len() != 0 {
				t.Fatalf("validation failure must not print output, got %q", stdout.String())
			}
			if installCalled {
				t.Fatal("validation failure must not reach install wiring")
			}
		})
	}
}

func TestEdgeCredentialInstallSelectsStdinModeThroughInjectedIO(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	stdin := strings.NewReader(`{"persistentCredential":{"edgeId":"edge-1"}}`)
	var gotOptions edgeCredentialOptions
	var gotInput string

	code := runEdgeCredential(context.Background(), []string{"install", "--config", " edge-runtime.yaml ", "--from-stdin"}, stdin, &stdout, &stderr, edgeCredentialDependencies{
		install: func(ctx context.Context, options edgeCredentialOptions, streams commandIO) error {
			if ctx == nil {
				t.Fatal("install context must be passed through")
			}
			if streams.stdout == nil || streams.stderr == nil {
				t.Fatal("install writers must be passed through")
			}
			raw, err := io.ReadAll(streams.stdin)
			if err != nil {
				t.Fatalf("read injected stdin: %v", err)
			}
			gotOptions = options
			gotInput = string(raw)
			return nil
		},
	})

	if code != 0 {
		t.Fatalf("expected success exit code 0, got %d; stderr=%q", code, stderr.String())
	}
	if gotOptions.subcommand != "install" {
		t.Fatalf("expected install subcommand, got %q", gotOptions.subcommand)
	}
	if gotOptions.configPath != "edge-runtime.yaml" {
		t.Fatalf("expected trimmed config path, got %q", gotOptions.configPath)
	}
	if !gotOptions.fromStdin || gotOptions.mode != installModeStdin {
		t.Fatalf("expected stdin mode, got fromStdin=%v mode=%q", gotOptions.fromStdin, gotOptions.mode)
	}
	if !strings.Contains(gotInput, "persistentCredential") {
		t.Fatalf("expected injected stdin to reach install dependency, got %q", gotInput)
	}
	if stdout.Len() != 0 || stderr.Len() != 0 {
		t.Fatalf("successful injected install must not print scaffold output, stdout=%q stderr=%q", stdout.String(), stderr.String())
	}
}

func TestEdgeCredentialInstallSelectsInteractiveModeThroughInjectedIO(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	installCalled := false

	code := runEdgeCredential(context.Background(), []string{"install", "--config", "edge-runtime.yaml"}, strings.NewReader("operator input"), &stdout, &stderr, edgeCredentialDependencies{
		install: func(ctx context.Context, options edgeCredentialOptions, streams commandIO) error {
			installCalled = true
			if options.mode != installModeInteractive {
				t.Fatalf("expected interactive mode, got %q", options.mode)
			}
			if options.fromStdin {
				t.Fatal("interactive mode must not set fromStdin")
			}
			if streams.stdin == nil {
				t.Fatal("interactive install must receive injected stdin")
			}
			return nil
		},
	})

	if code != 0 {
		t.Fatalf("expected success exit code 0, got %d; stderr=%q", code, stderr.String())
	}
	if !installCalled {
		t.Fatal("expected injected install dependency to be called")
	}
}

func TestEdgeCredentialInstallReportsInjectedInstallError(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	wantErr := errors.New("install failed")

	code := runEdgeCredential(context.Background(), []string{"install", "--config", "edge-runtime.yaml"}, strings.NewReader(""), &stdout, &stderr, edgeCredentialDependencies{
		install: func(context.Context, edgeCredentialOptions, commandIO) error {
			return wantErr
		},
	})

	if code != 1 {
		t.Fatalf("expected install failure exit code 1, got %d", code)
	}
	if !strings.Contains(stderr.String(), "install failed") {
		t.Fatalf("expected stderr to contain injected install error, got %q", stderr.String())
	}
	if stdout.Len() != 0 {
		t.Fatalf("install failure must not print stdout, got %q", stdout.String())
	}
}
