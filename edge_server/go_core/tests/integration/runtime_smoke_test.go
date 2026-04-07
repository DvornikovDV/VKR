package integration

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"edge_server/go_core/internal/cloud"
	"edge_server/go_core/internal/runtime"
)

type onboardingPackageFixture struct {
	EdgeID           string `json:"edgeId"`
	OnboardingSecret string `json:"onboardingSecret"`
	IssuedAt         string `json:"issuedAt"`
	ExpiresAt        string `json:"expiresAt"`
}

func runtimeFixturePath(t *testing.T, name string) string {
	t.Helper()
	return filepath.Join("..", "..", "..", "tests", "fixtures", "runtime", name)
}

func TestRuntimeSmokeFixtureContracts(t *testing.T) {
	configBytes, err := os.ReadFile(runtimeFixturePath(t, "config.yaml"))
	if err != nil {
		t.Fatalf("read config fixture: %v", err)
	}

	configText := string(configBytes)
	requiredConfigSnippets := []string{
		"namespace: /edge",
		"intervalMs: 1000",
		"maxReadings: 100",
		"level: info",
	}
	for _, snippet := range requiredConfigSnippets {
		if !strings.Contains(configText, snippet) {
			t.Fatalf("config fixture must contain %q", snippet)
		}
	}

	onboardingBytes, err := os.ReadFile(runtimeFixturePath(t, "onboarding-package.json"))
	if err != nil {
		t.Fatalf("read onboarding package fixture: %v", err)
	}

	var onboarding onboardingPackageFixture
	if err := json.Unmarshal(onboardingBytes, &onboarding); err != nil {
		t.Fatalf("parse onboarding package fixture: %v", err)
	}

	if onboarding.EdgeID == "" {
		t.Fatal("onboarding fixture must include edgeId")
	}
	if onboarding.OnboardingSecret == "" {
		t.Fatal("onboarding fixture must include onboardingSecret")
	}
	if onboarding.IssuedAt == "" || onboarding.ExpiresAt == "" {
		t.Fatal("onboarding fixture must include issuedAt and expiresAt")
	}

	issuedAt, err := time.Parse(time.RFC3339, onboarding.IssuedAt)
	if err != nil {
		t.Fatalf("issuedAt must be RFC3339: %v", err)
	}
	expiresAt, err := time.Parse(time.RFC3339, onboarding.ExpiresAt)
	if err != nil {
		t.Fatalf("expiresAt must be RFC3339: %v", err)
	}
	if !expiresAt.After(issuedAt) {
		t.Fatal("expiresAt must be after issuedAt")
	}
}

func TestRuntimeSmokeOnboardingOperatorInputBootstrap(t *testing.T) {
	t.Setenv("EDGE_ONBOARDING_SECRET", "smoke-onboarding-secret")
	onboardingPath := runtimeFixturePath(t, "onboarding-package.json")

	pkg, err := runtime.LoadOnboardingPackageFromFile(onboardingPath)
	if err != nil {
		t.Fatalf("load onboarding package fixture: %v", err)
	}

	runner := runtime.New()
	bootstrap := runtime.NewBootstrapSession(runner)
	if err := bootstrap.Bootstrap(runtime.BootstrapInput{
		OnboardingPackagePath: onboardingPath,
	}); err != nil {
		t.Fatalf("bootstrap runtime from operator onboarding package: %v", err)
	}

	auth, err := bootstrap.BuildHandshakeAuth()
	if err != nil {
		t.Fatalf("build startup handshake auth: %v", err)
	}
	if auth.EdgeID != pkg.EdgeID {
		t.Fatalf("expected startup edgeId %q from onboarding package, got %q", pkg.EdgeID, auth.EdgeID)
	}
	if auth.CredentialMode != cloud.CredentialModeOnboarding {
		t.Fatalf("expected startup credential mode onboarding, got %q", auth.CredentialMode)
	}
	if auth.CredentialSecret != pkg.OnboardingSecret {
		t.Fatalf("expected startup onboarding secret from operator input, got %q", auth.CredentialSecret)
	}
}

func TestRuntimeSmokeFixtureDoesNotRequirePersistedRuntimeStateFiles(t *testing.T) {
	for _, fileName := range []string{"credential.json", "runtime-state.json", "status.json"} {
		_, err := os.Stat(runtimeFixturePath(t, fileName))
		if err == nil {
			t.Fatalf("fixture set must not require machine-written runtime state file %q", fileName)
		}
		if !errors.Is(err, os.ErrNotExist) {
			t.Fatalf("inspect fixture %q: %v", fileName, err)
		}
	}
}

type scriptedLifecycleTransport struct {
	mu              sync.Mutex
	connectAttempts []cloud.HandshakeAuth
	connectEvents   chan cloud.HandshakeAuth
	disconnectSeen  chan struct{}
	rejectSeen      chan struct{}
	disconnectOnce  sync.Once
	rejectOnce      sync.Once

	onEdgeActivation func(payload any)
	onEdgeDisconnect func(payload any)
	onConnect        func() error
	onConnectError   func(err error)
	onDisconnect     func(reason string)
}

func newScriptedLifecycleTransport() *scriptedLifecycleTransport {
	return &scriptedLifecycleTransport{
		connectEvents:  make(chan cloud.HandshakeAuth, 8),
		disconnectSeen: make(chan struct{}, 1),
		rejectSeen:     make(chan struct{}, 1),
	}
}

func (t *scriptedLifecycleTransport) Connect(_ context.Context, auth cloud.HandshakeAuth) error {
	if err := auth.Validate(); err != nil {
		return err
	}

	t.mu.Lock()
	t.connectAttempts = append(t.connectAttempts, auth)
	t.mu.Unlock()

	t.connectEvents <- auth

	if t.onConnect != nil {
		if err := t.onConnect(); err != nil {
			return err
		}
	}

	switch auth.CredentialMode {
	case cloud.CredentialModeOnboarding:
		go func(edgeID string) {
			time.Sleep(25 * time.Millisecond)
			if t.onEdgeActivation != nil {
				t.onEdgeActivation(map[string]any{
					"edgeId":         edgeID,
					"lifecycleState": "Active",
					"persistentCredential": map[string]any{
						"version":  2,
						"secret":   "persistent-from-activation",
						"issuedAt": "2026-04-07T10:00:00Z",
					},
				})
			}

			time.Sleep(25 * time.Millisecond)
			if t.onDisconnect != nil {
				t.onDisconnect("transport close")
			}
			t.disconnectOnce.Do(func() {
				t.disconnectSeen <- struct{}{}
			})
		}(auth.EdgeID)
	case cloud.CredentialModePersistent:
		go func() {
			time.Sleep(25 * time.Millisecond)
			if t.onConnectError != nil {
				t.onConnectError(errors.New("persistent_credential_revoked"))
			}
			t.rejectOnce.Do(func() {
				t.rejectSeen <- struct{}{}
			})
		}()
	}

	return nil
}

func (t *scriptedLifecycleTransport) Disconnect() error {
	if t.onDisconnect != nil {
		t.onDisconnect("client_requested")
	}

	return nil
}

func (t *scriptedLifecycleTransport) Emit(_ string, _ any) error {
	return nil
}

func (t *scriptedLifecycleTransport) OnEdgeActivation(handler func(any)) {
	t.onEdgeActivation = handler
}

func (t *scriptedLifecycleTransport) OnEdgeDisconnect(handler func(any)) {
	t.onEdgeDisconnect = handler
}

func (t *scriptedLifecycleTransport) OnConnect(handler func() error) {
	t.onConnect = handler
}

func (t *scriptedLifecycleTransport) OnConnectError(handler func(error)) {
	t.onConnectError = handler
}

func (t *scriptedLifecycleTransport) OnDisconnect(handler func(string)) {
	t.onDisconnect = handler
}

func TestReproTaskT016bRunnerRunExecutesHandshakeLifecycleAndReconnectPath(t *testing.T) {
	t.Setenv("EDGE_ONBOARDING_SECRET", "smoke-run-secret")
	onboardingPath := runtimeFixturePath(t, "onboarding-package.json")

	runner := runtime.New()
	transport := newScriptedLifecycleTransport()
	runner.SetCloudTransport(transport)

	bootstrap := runtime.NewBootstrapSession(runner)
	if err := bootstrap.Bootstrap(runtime.BootstrapInput{
		OnboardingPackagePath: onboardingPath,
	}); err != nil {
		t.Fatalf("bootstrap runtime from operator onboarding package: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	runDone := make(chan error, 1)
	go func() {
		runDone <- runner.Run(ctx)
	}()

	firstAttempt := <-transport.connectEvents
	if firstAttempt.CredentialMode != cloud.CredentialModeOnboarding {
		t.Fatalf("expected first runtime connect to use onboarding mode, got %q", firstAttempt.CredentialMode)
	}

	select {
	case <-transport.disconnectSeen:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for ordinary socket disconnect in runtime loop")
	}

	snapshotAfterDisconnect := runner.StateSnapshot()
	if snapshotAfterDisconnect.Trusted {
		t.Fatalf("expected ordinary socket disconnect to stop trusted execution immediately, got %+v", snapshotAfterDisconnect)
	}
	if snapshotAfterDisconnect.Connected {
		t.Fatalf("expected ordinary socket disconnect to clear connected state, got %+v", snapshotAfterDisconnect)
	}

	secondAttempt := <-transport.connectEvents
	if secondAttempt.CredentialMode != cloud.CredentialModePersistent {
		t.Fatalf("expected reconnect attempt to use persistent credential mode, got %q", secondAttempt.CredentialMode)
	}
	if secondAttempt.CredentialSecret != "persistent-from-activation" {
		t.Fatalf(
			"expected reconnect attempt to reuse persistent credential from activation, got %q",
			secondAttempt.CredentialSecret,
		)
	}

	select {
	case <-transport.rejectSeen:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for rejected reconnect signal in runtime loop")
	}

	snapshotAfterRejectedReconnect := runner.StateSnapshot()
	if snapshotAfterRejectedReconnect.Trusted {
		t.Fatalf(
			"expected rejected reconnect to keep runtime untrusted, got %+v",
			snapshotAfterRejectedReconnect,
		)
	}
	if snapshotAfterRejectedReconnect.CredentialMode != runtime.CredentialModeNone {
		t.Fatalf(
			"expected rejected reconnect to clear credential mode to none, got %q",
			snapshotAfterRejectedReconnect.CredentialMode,
		)
	}
	if snapshotAfterRejectedReconnect.PersistentCredentialSecret != nil {
		t.Fatalf(
			"expected rejected reconnect to clear persistent credential secret, got %v",
			snapshotAfterRejectedReconnect.PersistentCredentialSecret,
		)
	}

	cancel()

	select {
	case err := <-runDone:
		if err != nil {
			t.Fatalf("runner run returned unexpected error: %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for runner shutdown after context cancellation")
	}
}

func TestReproTaskT011bRealRuntimeEntryPointDoesNotExitImmediatelyAfterBootstrap(t *testing.T) {
	goCoreRoot, err := filepath.Abs(filepath.Join("..", ".."))
	if err != nil {
		t.Fatalf("resolve go_core root: %v", err)
	}

	onboardingPath, err := filepath.Abs(runtimeFixturePath(t, "onboarding-package.json"))
	if err != nil {
		t.Fatalf("resolve onboarding fixture path: %v", err)
	}

	binaryPath := filepath.Join(t.TempDir(), "edge-runtime-test.exe")
	buildCmd := exec.Command("go", "build", "-o", binaryPath, "./cmd/edge-runtime")
	buildCmd.Dir = goCoreRoot
	buildOutput, err := buildCmd.CombinedOutput()
	if err != nil {
		t.Fatalf("build edge runtime binary: %v\n%s", err, string(buildOutput))
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	runCmd := exec.CommandContext(ctx, binaryPath)
	runCmd.Dir = goCoreRoot
	runCmd.Env = append(
		os.Environ(),
		"EDGE_ONBOARDING_SECRET=smoke-run-secret",
		"EDGE_ONBOARDING_PACKAGE_PATH="+onboardingPath,
	)

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	runCmd.Stdout = &stdout
	runCmd.Stderr = &stderr

	if err := runCmd.Start(); err != nil {
		t.Fatalf("start edge runtime binary: %v", err)
	}

	done := make(chan error, 1)
	go func() {
		done <- runCmd.Wait()
	}()

	select {
	case err := <-done:
		t.Fatalf(
			"expected real runtime entrypoint to stay alive past bootstrap, but it exited early: %v\nstdout:\n%s\nstderr:\n%s",
			err,
			stdout.String(),
			stderr.String(),
		)
	case <-time.After(300 * time.Millisecond):
	}

	cancel()

	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for edge runtime process shutdown after cancellation")
	}
}
