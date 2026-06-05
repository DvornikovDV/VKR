package runtime

import (
	"context"
	"errors"
	"testing"
	"time"

	"edge_server/go_core/internal/cloud"
	"edge_server/go_core/internal/source"
	"edge_server/go_core/internal/state"
)

type scriptedConnectResult struct {
	err              error
	blockUntilCancel bool
	release          <-chan struct{}
}

type emittedTransportEvent struct {
	event   string
	payload any
}

type recordingRuntimeStateSaver struct {
	saved chan state.RuntimeState
}

func newRecordingRuntimeStateSaver(buffer int) *recordingRuntimeStateSaver {
	return &recordingRuntimeStateSaver{saved: make(chan state.RuntimeState, buffer)}
}

func (s *recordingRuntimeStateSaver) Save(snapshot state.RuntimeState) error {
	select {
	case s.saved <- snapshot:
	default:
	}
	return nil
}

type dummyExecutor struct{}

func (d *dummyExecutor) ExecuteCommand(ctx context.Context, req CommandExecutionRequest) (CommandExecutionResult, error) {
	return CommandExecutionResult{Status: cloud.CommandStatusConfirmed}, nil
}

type fakeTransport struct {
	connectCh             chan struct{}
	disconnectCh          chan string
	connectResults        []scriptedConnectResult
	connectCancelObserved chan struct{}
	executeCommand        func(any)
	commandRegistrations  chan struct{}
	onConnectError        func(error)
	emitted               chan emittedTransportEvent
	catalogEmitStarted    chan struct{}
	releaseCatalogEmit    chan struct{}
}

func (f *fakeTransport) Connect(ctx context.Context, auth cloud.HandshakeAuth) error {
	select {
	case f.connectCh <- struct{}{}:
	default:
	}

	var result scriptedConnectResult
	if len(f.connectResults) > 0 {
		result = f.connectResults[0]
		f.connectResults = f.connectResults[1:]
	}
	if result.blockUntilCancel {
		<-ctx.Done()
		select {
		case f.connectCancelObserved <- struct{}{}:
		default:
		}
		return ctx.Err()
	}
	if result.release != nil {
		select {
		case <-result.release:
		case <-ctx.Done():
			return ctx.Err()
		}
	}
	var connectErr cloud.ConnectError
	if result.err != nil && f.onConnectError != nil && errors.As(result.err, &connectErr) {
		f.onConnectError(result.err)
	}
	if result.err != nil {
		return result.err
	}
	return nil
}

func (f *fakeTransport) Disconnect() error {
	return nil
}

func (f *fakeTransport) Emit(event string, payload any) error {
	if event == string(cloud.EdgeEventCapabilitiesCatalog) {
		select {
		case f.catalogEmitStarted <- struct{}{}:
		default:
		}
		if f.releaseCatalogEmit != nil {
			<-f.releaseCatalogEmit
		}
	}
	if f.emitted != nil {
		f.emitted <- emittedTransportEvent{event: event, payload: payload}
	}
	return nil
}

func (f *fakeTransport) OnEdgeDisconnect(handler func(any)) {}

func (f *fakeTransport) OnExecuteCommand(handler func(any)) {
	f.executeCommand = handler
	if f.commandRegistrations != nil {
		select {
		case f.commandRegistrations <- struct{}{}:
		default:
		}
	}
}

func (f *fakeTransport) OnConnect(handler func() error) {}

func (f *fakeTransport) OnConnectError(handler func(error)) {
	f.onConnectError = handler
}

func (f *fakeTransport) OnDisconnect(handler func(string)) {
	go func() {
		for reason := range f.disconnectCh {
			handler(reason)
		}
	}()
}

func TestRunnerStartupReconnectInitialFailuresThenSuccess(t *testing.T) {
	runner := New()

	transport := &fakeTransport{
		connectCh: make(chan struct{}, 10),
		connectResults: []scriptedConnectResult{
			{err: errors.New("dial tcp connect refused")},
			{err: cloud.ConnectError{Code: cloud.ConnectErrorEdgeAuthInternalError}},
		},
		disconnectCh: make(chan string, 10),
		emitted:      make(chan emittedTransportEvent, 10),
	}
	runner.transport = transport

	if err := runner.BindReconnectPolicy(mustReconnectPolicy(t, ReconnectPolicyConfig{
		BaseDelay:   time.Millisecond,
		MaxDelay:    time.Millisecond,
		MaxAttempts: 0,
	})); err != nil {
		t.Fatalf("bind reconnect policy: %v", err)
	}

	store := newRecordingRuntimeStateSaver(20)
	if err := runner.BindRuntimeStateStore(store); err != nil {
		t.Fatalf("bind runtime state store: %v", err)
	}

	NewBootstrapSession(runner)
	if err := runner.LoadPersistentCredential("edge-1", 2, "persistent-secret-v2"); err != nil {
		t.Fatalf("load persistent credential: %v", err)
	}
	if err := runner.BindCapabilitiesCatalog(cloud.EdgeCapabilitiesCatalog{
		EdgeServerID: "edge-1",
		Telemetry: []cloud.EdgeCatalogTelemetryMetric{
			{DeviceID: "dev-1", Metric: "temperature", ValueType: cloud.CatalogValueTypeNumber, Label: "Temperature"},
		},
	}); err != nil {
		t.Fatalf("bind capabilities catalog: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	runDone := make(chan error, 1)
	go func() {
		runDone <- runner.Run(ctx)
	}()

	waitForConnectAttempts(t, transport.connectCh, 3)

	retryable := waitForSavedRuntimeState(t, store.saved, func(snapshot state.RuntimeState) bool {
		return snapshot.SessionState == state.SessionStateRetryWait &&
			snapshot.CredentialStatus == state.CredentialStatusLoaded &&
			snapshot.RetryEligible
	})
	if retryable.CredentialVersion == nil || *retryable.CredentialVersion != 2 {
		t.Fatalf("expected retryable state to preserve credential version 2, got %+v", retryable.CredentialVersion)
	}

	select {
	case emitted := <-transport.emitted:
		if emitted.event != string(cloud.EdgeEventCapabilitiesCatalog) {
			t.Fatalf("expected capabilities_catalog emission, got %q", emitted.event)
		}
	case <-time.After(time.Second):
		t.Fatal("timeout waiting for capabilities catalog emission after reconnect")
	}

	select {
	case err := <-runDone:
		t.Fatalf("Runner.Run returned before shutdown: %v", err)
	case <-time.After(100 * time.Millisecond):
	}

	cancel()
	select {
	case err := <-runDone:
		if err != nil {
			t.Fatalf("expected clean shutdown after reconnect, got %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("timeout waiting for clean shutdown after reconnect")
	}
}

func TestRunnerStartupTerminalConnectErrorStaysAliveUntilShutdown(t *testing.T) {
	runner := New()

	transport := &fakeTransport{
		connectCh: make(chan struct{}, 10),
		connectResults: []scriptedConnectResult{
			{err: cloud.ConnectError{Code: cloud.ConnectErrorInvalidCredential}},
		},
		disconnectCh: make(chan string, 10),
		emitted:      make(chan emittedTransportEvent, 10),
	}
	runner.transport = transport

	if err := runner.BindReconnectPolicy(mustReconnectPolicy(t, ReconnectPolicyConfig{
		BaseDelay:   time.Millisecond,
		MaxDelay:    time.Millisecond,
		MaxAttempts: 0,
	})); err != nil {
		t.Fatalf("bind reconnect policy: %v", err)
	}

	store := newRecordingRuntimeStateSaver(10)
	if err := runner.BindRuntimeStateStore(store); err != nil {
		t.Fatalf("bind runtime state store: %v", err)
	}

	NewBootstrapSession(runner)
	if err := runner.LoadPersistentCredential("edge-1", 2, "persistent-secret-v2"); err != nil {
		t.Fatalf("load persistent credential: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	runDone := make(chan error, 1)
	go func() {
		runDone <- runner.Run(ctx)
	}()

	waitForConnectAttempts(t, transport.connectCh, 1)
	terminal := waitForSavedRuntimeState(t, store.saved, func(snapshot state.RuntimeState) bool {
		return snapshot.SessionState == state.SessionStateOperatorActionRequired &&
			snapshot.CredentialStatus == state.CredentialStatusRejected &&
			!snapshot.RetryEligible
	})
	if terminal.AuthOutcome != state.AuthOutcomeInvalidCredential {
		t.Fatalf("expected invalid credential outcome, got %q", terminal.AuthOutcome)
	}

	select {
	case err := <-runDone:
		t.Fatalf("Runner.Run returned fatal error for terminal Cloud rejection: %v", err)
	case <-time.After(100 * time.Millisecond):
	}

	cancel()
	select {
	case err := <-runDone:
		if err != nil {
			t.Fatalf("expected clean shutdown after terminal rejection, got %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("timeout waiting for clean shutdown after terminal rejection")
	}
}

func TestRunnerFiniteReconnectExhaustionStopsRetriesAndStaysAlive(t *testing.T) {
	runner := New()

	transport := &fakeTransport{
		connectCh: make(chan struct{}, 10),
		connectResults: []scriptedConnectResult{
			{err: errors.New("dial tcp connect refused")},
			{err: errors.New("dial tcp connect refused")},
			{err: errors.New("dial tcp connect refused")},
			{err: errors.New("dial tcp connect refused")},
		},
		disconnectCh: make(chan string, 10),
		emitted:      make(chan emittedTransportEvent, 10),
	}
	runner.transport = transport

	if err := runner.BindReconnectPolicy(mustReconnectPolicy(t, ReconnectPolicyConfig{
		BaseDelay:   time.Millisecond,
		MaxDelay:    time.Millisecond,
		MaxAttempts: 2,
	})); err != nil {
		t.Fatalf("bind reconnect policy: %v", err)
	}

	store := newRecordingRuntimeStateSaver(20)
	if err := runner.BindRuntimeStateStore(store); err != nil {
		t.Fatalf("bind runtime state store: %v", err)
	}

	NewBootstrapSession(runner)
	if err := runner.LoadPersistentCredential("edge-1", 2, "persistent-secret-v2"); err != nil {
		t.Fatalf("load persistent credential: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	runDone := make(chan error, 1)
	go func() {
		runDone <- runner.Run(ctx)
	}()

	waitForConnectAttempts(t, transport.connectCh, 3)

	exhausted := waitForSavedRuntimeState(t, store.saved, func(snapshot state.RuntimeState) bool {
		return snapshot.SessionState == state.SessionStateOperatorActionRequired &&
			snapshot.AuthOutcome == state.AuthOutcomeEdgeAuthInternalErr &&
			snapshot.CredentialStatus == state.CredentialStatusLoaded &&
			!snapshot.RetryEligible
	})
	if exhausted.CredentialVersion == nil || *exhausted.CredentialVersion != 2 {
		t.Fatalf("expected exhausted state to preserve credential version 2, got %+v", exhausted.CredentialVersion)
	}
	if exhausted.LastDisconnectReason == nil || *exhausted.LastDisconnectReason != "max_attempts_exhausted" {
		t.Fatalf("expected exhaustion reason to be persisted, got %+v", exhausted.LastDisconnectReason)
	}

	select {
	case <-transport.connectCh:
		t.Fatal("expected automatic Cloud retry attempts to stop after maxAttempts exhaustion")
	case <-time.After(100 * time.Millisecond):
	}

	select {
	case err := <-runDone:
		t.Fatalf("Runner.Run returned ordinary exhaustion error before shutdown: %v", err)
	case <-time.After(100 * time.Millisecond):
	}

	cancel()
	select {
	case err := <-runDone:
		if err != nil {
			t.Fatalf("expected clean shutdown after reconnect exhaustion, got %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("timeout waiting for clean shutdown after reconnect exhaustion")
	}
}

func TestRunnerStartupReconnectWaitCancellation(t *testing.T) {
	runner := New()

	transport := &fakeTransport{
		connectCh: make(chan struct{}, 10),
		connectResults: []scriptedConnectResult{
			{err: errors.New("dial tcp connect refused")},
		},
		disconnectCh: make(chan string, 10),
		emitted:      make(chan emittedTransportEvent, 10),
	}
	runner.transport = transport

	if err := runner.BindReconnectPolicy(mustReconnectPolicy(t, ReconnectPolicyConfig{
		BaseDelay:   time.Second,
		MaxDelay:    time.Second,
		MaxAttempts: 0,
	})); err != nil {
		t.Fatalf("bind reconnect policy: %v", err)
	}

	store := newRecordingRuntimeStateSaver(10)
	if err := runner.BindRuntimeStateStore(store); err != nil {
		t.Fatalf("bind runtime state store: %v", err)
	}

	NewBootstrapSession(runner)
	if err := runner.LoadPersistentCredential("edge-1", 2, "persistent-secret-v2"); err != nil {
		t.Fatalf("load persistent credential: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())

	runDone := make(chan error, 1)
	go func() {
		runDone <- runner.Run(ctx)
	}()

	waitForConnectAttempts(t, transport.connectCh, 1)
	waitForSavedRuntimeState(t, store.saved, func(snapshot state.RuntimeState) bool {
		return snapshot.SessionState == state.SessionStateRetryWait && snapshot.RetryEligible
	})

	startedCancel := time.Now()
	cancel()

	select {
	case err := <-runDone:
		if err != nil {
			t.Fatalf("expected cancellation to stop reconnect wait cleanly, got %v", err)
		}
	case <-time.After(200 * time.Millisecond):
		t.Fatalf("startup reconnect wait did not stop promptly after %s", time.Since(startedCancel))
	}
}

func TestRunnerStartupReconnectCatalogEmitsBeforeTelemetryResumes(t *testing.T) {
	runner := New()

	transport := &fakeTransport{
		connectCh:          make(chan struct{}, 10),
		disconnectCh:       make(chan string, 10),
		emitted:            make(chan emittedTransportEvent, 10),
		catalogEmitStarted: make(chan struct{}, 1),
		releaseCatalogEmit: make(chan struct{}),
	}
	runner.transport = transport

	if err := runner.BindReconnectPolicy(mustReconnectPolicy(t, ReconnectPolicyConfig{
		BaseDelay:   time.Millisecond,
		MaxDelay:    time.Millisecond,
		MaxAttempts: 0,
	})); err != nil {
		t.Fatalf("bind reconnect policy: %v", err)
	}

	store := newRecordingRuntimeStateSaver(20)
	if err := runner.BindRuntimeStateStore(store); err != nil {
		t.Fatalf("bind runtime state store: %v", err)
	}

	readings := make(chan source.Reading, 2)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	if err := runner.BindTelemetryReadings(ctx, readings, 50, 1); err != nil {
		t.Fatalf("bind telemetry readings: %v", err)
	}

	NewBootstrapSession(runner)
	if err := runner.LoadPersistentCredential("edge-1", 2, "persistent-secret-v2"); err != nil {
		t.Fatalf("load persistent credential: %v", err)
	}
	if err := runner.BindCapabilitiesCatalog(cloud.EdgeCapabilitiesCatalog{
		EdgeServerID: "edge-1",
		Telemetry: []cloud.EdgeCatalogTelemetryMetric{
			{DeviceID: "dev-1", Metric: "temperature", ValueType: cloud.CatalogValueTypeNumber, Label: "Temperature"},
		},
	}); err != nil {
		t.Fatalf("bind capabilities catalog: %v", err)
	}

	runDone := make(chan error, 1)
	go func() {
		runDone <- runner.Run(ctx)
	}()

	waitForConnectAttempts(t, transport.connectCh, 1)
	select {
	case <-transport.catalogEmitStarted:
	case <-time.After(time.Second):
		t.Fatal("timeout waiting for capabilities catalog emission to start")
	}

	readings <- source.Reading{SourceID: "src-1", DeviceID: "dev-1", Metric: "temperature", Value: 42.0, TS: 1}
	select {
	case emitted := <-transport.emitted:
		t.Fatalf("expected no telemetry before capabilities_catalog completes, got %q", emitted.event)
	case <-time.After(100 * time.Millisecond):
	}

	close(transport.releaseCatalogEmit)

	select {
	case emitted := <-transport.emitted:
		if emitted.event != string(cloud.EdgeEventCapabilitiesCatalog) {
			t.Fatalf("expected capabilities_catalog before telemetry, got %q", emitted.event)
		}
	case <-time.After(time.Second):
		t.Fatal("timeout waiting for capabilities_catalog emission")
	}

	waitForSavedRuntimeState(t, store.saved, func(snapshot state.RuntimeState) bool {
		return snapshot.SessionState == state.SessionStateTrusted &&
			snapshot.AuthOutcome == state.AuthOutcomeAccepted
	})

	readings <- source.Reading{SourceID: "src-1", DeviceID: "dev-1", Metric: "temperature", Value: 43.0, TS: 2}
	select {
	case emitted := <-transport.emitted:
		if emitted.event != "telemetry" {
			t.Fatalf("expected telemetry after capabilities_catalog and trusted promotion, got %q", emitted.event)
		}
	case <-time.After(time.Second):
		t.Fatal("timeout waiting for telemetry after capabilities_catalog")
	}

	cancel()
	select {
	case err := <-runDone:
		if err != nil {
			t.Fatalf("expected clean shutdown after ordering proof, got %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("timeout waiting for clean shutdown after ordering proof")
	}
}

func TestRunnerEstablishedDisconnectReconnectPersistsRetryableStateAndResumesFreshTelemetry(t *testing.T) {
	runner := New()

	transport := &fakeTransport{
		connectCh:    make(chan struct{}, 10),
		disconnectCh: make(chan string, 10),
		emitted:      make(chan emittedTransportEvent, 20),
	}
	releaseReconnect := make(chan struct{})
	transport.connectResults = []scriptedConnectResult{
		{},
		{release: releaseReconnect},
	}
	runner.transport = transport

	if err := runner.BindReconnectPolicy(mustReconnectPolicy(t, ReconnectPolicyConfig{
		BaseDelay:   200 * time.Millisecond,
		MaxDelay:    200 * time.Millisecond,
		MaxAttempts: 0,
	})); err != nil {
		t.Fatalf("bind reconnect policy: %v", err)
	}

	store := newRecordingRuntimeStateSaver(50)
	if err := runner.BindRuntimeStateStore(store); err != nil {
		t.Fatalf("bind runtime state store: %v", err)
	}

	readings := make(chan source.Reading)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	if err := runner.BindTelemetryReadings(ctx, readings, 50, 1); err != nil {
		t.Fatalf("bind telemetry readings: %v", err)
	}

	NewBootstrapSession(runner)
	if err := runner.LoadPersistentCredential("edge-1", 2, "persistent-secret-v2"); err != nil {
		t.Fatalf("load persistent credential: %v", err)
	}
	if err := runner.BindCapabilitiesCatalog(cloud.EdgeCapabilitiesCatalog{
		EdgeServerID: "edge-1",
		Telemetry: []cloud.EdgeCatalogTelemetryMetric{
			{DeviceID: "dev-1", Metric: "temperature", ValueType: cloud.CatalogValueTypeNumber, Label: "Temperature"},
		},
	}); err != nil {
		t.Fatalf("bind capabilities catalog: %v", err)
	}

	runDone := make(chan error, 1)
	go func() {
		runDone <- runner.Run(ctx)
	}()

	waitForConnectAttempts(t, transport.connectCh, 1)
	waitForEmittedEvent(t, transport.emitted, string(cloud.EdgeEventCapabilitiesCatalog))
	waitForSavedRuntimeState(t, store.saved, func(snapshot state.RuntimeState) bool {
		return snapshot.SessionState == state.SessionStateTrusted &&
			snapshot.AuthOutcome == state.AuthOutcomeAccepted
	})

	sendReading(t, readings, source.Reading{
		SourceID: "src-1", DeviceID: "dev-1", Metric: "temperature", Value: 41.0, TS: 1,
	})
	assertTelemetryWithTS(t, transport.emitted, 1)

	transport.disconnectCh <- "transport close"

	retryable := waitForSavedRuntimeState(t, store.saved, func(snapshot state.RuntimeState) bool {
		return snapshot.SessionState == state.SessionStateRetryWait &&
			snapshot.AuthOutcome == state.AuthOutcomeDisconnected &&
			snapshot.CredentialStatus == state.CredentialStatusLoaded &&
			snapshot.RetryEligible
	})
	if retryable.LastDisconnectReason == nil || *retryable.LastDisconnectReason != string(cloud.DisconnectReasonForced) {
		t.Fatalf("expected ordinary disconnect reason to be persisted, got %+v", retryable.LastDisconnectReason)
	}
	if retryable.LastTrustedSessionAt == nil {
		t.Fatal("expected previous trusted session timestamp to be preserved during retryable outage")
	}

	waitForConnectAttempts(t, transport.connectCh, 1)
	sendReading(t, readings, source.Reading{
		SourceID: "src-1", DeviceID: "dev-1", Metric: "temperature", Value: 42.0, TS: 2,
	})
	assertNoTelemetry(t, transport.emitted, 75*time.Millisecond)

	close(releaseReconnect)
	waitForEmittedEvent(t, transport.emitted, string(cloud.EdgeEventCapabilitiesCatalog))
	waitForSavedRuntimeState(t, store.saved, func(snapshot state.RuntimeState) bool {
		return snapshot.SessionState == state.SessionStateTrusted &&
			snapshot.AuthOutcome == state.AuthOutcomeAccepted &&
			snapshot.LastTrustedSessionAt != nil
	})

	sendReading(t, readings, source.Reading{
		SourceID: "src-1", DeviceID: "dev-1", Metric: "temperature", Value: 43.0, TS: 3,
	})
	assertTelemetryWithTS(t, transport.emitted, 3)

	cancel()
	select {
	case err := <-runDone:
		if err != nil {
			t.Fatalf("expected clean shutdown after established reconnect proof, got %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("timeout waiting for clean shutdown after established reconnect proof")
	}
}

func TestRunner_Reconnect_NoDuplicateTerminalResponses(t *testing.T) {
	runner := New()

	transport := &fakeTransport{
		connectCh:            make(chan struct{}, 10),
		disconnectCh:         make(chan string, 10),
		commandRegistrations: make(chan struct{}, 10),
		emitted:              make(chan emittedTransportEvent, 10),
	}
	runner.transport = transport
	if err := runner.BindReconnectPolicy(mustReconnectPolicy(t, ReconnectPolicyConfig{
		BaseDelay:   time.Millisecond,
		MaxDelay:    time.Millisecond,
		MaxAttempts: 0,
	})); err != nil {
		t.Fatalf("bind reconnect policy: %v", err)
	}

	bridge, err := NewCommandBridge(CommandBridgeConfig{
		EdgeID:   "edge-1",
		Executor: &dummyExecutor{},
	})
	if err != nil {
		t.Fatalf("create bridge: %v", err)
	}

	if err := runner.BindCommandBridge(bridge); err != nil {
		t.Fatalf("bind bridge: %v", err)
	}

	NewBootstrapSession(runner)

	if err := runner.ActivateTrustedSession("edge-1", "persistent-secret-v1"); err != nil {
		t.Fatalf("activate trusted session: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	runDone := make(chan error, 1)
	go func() {
		runDone <- runner.Run(ctx)
	}()

	waitForCommandHandlerRegistrations(t, transport.commandRegistrations, 1)
	waitForConnectAttempts(t, transport.connectCh, 1)

	// Inject first command
	payload := map[string]any{
		"requestId":   "req-1",
		"edgeId":      "edge-1",
		"deviceId":    "dev-1",
		"commandType": "set_bool",
		"payload":     map[string]any{"value": true},
	}

	if transport.executeCommand != nil {
		transport.executeCommand(payload)
	} else {
		t.Fatal("expected executeCommand handler to be registered")
	}

	// Wait for result
	select {
	case emitted := <-transport.emitted:
		if emitted.event != "command_result" {
			t.Fatalf("expected command_result event, got %q", emitted.event)
		}
		cmdRes, ok := emitted.payload.(*cloud.CommandResult)
		if !ok || cmdRes.Status != cloud.CommandStatusConfirmed {
			t.Fatalf("expected confirmed result, got %v", emitted.payload)
		}
	case <-time.After(1 * time.Second):
		t.Fatal("timeout waiting for command result")
	}

	transport.disconnectCh <- "transport close"

	waitForConnectAttempts(t, transport.connectCh, 1)
	waitForCommandHandlerRegistrations(t, transport.commandRegistrations, 1)

	// Inject SAME command after reconnect
	if transport.executeCommand != nil {
		transport.executeCommand(payload)
	} else {
		t.Fatal("expected executeCommand handler to still be registered")
	}

	// Wait to ensure NO second result is emitted (at-most-once prevents it)
	select {
	case emitted := <-transport.emitted:
		t.Fatalf("expected no duplicate terminal response, got %v", emitted.payload)
	case <-time.After(100 * time.Millisecond):
		// Success: no duplicate response
	}

	cancel()
	select {
	case err := <-runDone:
		if err != nil {
			t.Fatalf("expected clean shutdown after duplicate command proof, got %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("timeout waiting for clean shutdown after duplicate command proof")
	}
}

func waitForConnectAttempts(t *testing.T, attempts <-chan struct{}, count int) {
	t.Helper()

	for i := 0; i < count; i++ {
		select {
		case <-attempts:
		case <-time.After(time.Second):
			t.Fatalf("timeout waiting for connect attempt %d", i+1)
		}
	}
}

func waitForCommandHandlerRegistrations(t *testing.T, registrations <-chan struct{}, count int) {
	t.Helper()

	for i := 0; i < count; i++ {
		select {
		case <-registrations:
		case <-time.After(time.Second):
			t.Fatalf("timeout waiting for command handler registration %d", i+1)
		}
	}
}

func waitForSavedRuntimeState(
	t *testing.T,
	saved <-chan state.RuntimeState,
	matches func(state.RuntimeState) bool,
) state.RuntimeState {
	t.Helper()

	deadline := time.After(time.Second)
	for {
		select {
		case snapshot := <-saved:
			if matches(snapshot) {
				return snapshot
			}
		case <-deadline:
			t.Fatal("timeout waiting for expected runtime state persistence")
		}
	}
}

func waitForEmittedEvent(t *testing.T, emitted <-chan emittedTransportEvent, event string) emittedTransportEvent {
	t.Helper()

	deadline := time.After(time.Second)
	for {
		select {
		case current := <-emitted:
			if current.event == event {
				return current
			}
		case <-deadline:
			t.Fatalf("timeout waiting for emitted event %q", event)
		}
	}
}

func sendReading(t *testing.T, readings chan<- source.Reading, reading source.Reading) {
	t.Helper()

	select {
	case readings <- reading:
	case <-time.After(time.Second):
		t.Fatalf("timeout sending reading ts=%d", reading.TS)
	}
}

func assertTelemetryWithTS(t *testing.T, emitted <-chan emittedTransportEvent, expectedTS int64) {
	t.Helper()

	event := waitForEmittedEvent(t, emitted, "telemetry")
	payload, ok := event.payload.(cloud.TelemetryPayload)
	if !ok {
		t.Fatalf("expected telemetry payload, got %T", event.payload)
	}
	if len(payload.Readings) != 1 {
		t.Fatalf("expected one telemetry reading, got %d", len(payload.Readings))
	}
	if payload.Readings[0].TS != expectedTS {
		t.Fatalf("expected telemetry ts=%d, got %d", expectedTS, payload.Readings[0].TS)
	}
}

func assertNoTelemetry(t *testing.T, emitted <-chan emittedTransportEvent, wait time.Duration) {
	t.Helper()

	timer := time.NewTimer(wait)
	defer timer.Stop()

	for {
		select {
		case event := <-emitted:
			if event.event == "telemetry" {
				t.Fatalf("expected no telemetry during disconnected outage, got %+v", event.payload)
			}
		case <-timer.C:
			return
		}
	}
}

func TestRunnerReconnectRequiresBoundPolicy(t *testing.T) {
	runner := New()

	transport := &fakeTransport{
		connectCh:    make(chan struct{}, 10),
		disconnectCh: make(chan string, 10),
		emitted:      make(chan emittedTransportEvent, 10),
	}
	runner.transport = transport
	NewBootstrapSession(runner)

	if err := runner.ActivateTrustedSession("edge-1", "persistent-secret-v1"); err != nil {
		t.Fatalf("activate trusted session: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	runDone := make(chan error, 1)
	go func() {
		runDone <- runner.Run(ctx)
	}()

	select {
	case <-transport.connectCh:
	case <-time.After(time.Second):
		t.Fatal("timeout waiting for first connect")
	}

	transport.disconnectCh <- "transport close"

	select {
	case err := <-runDone:
		if !errors.Is(err, ErrReconnectPolicyUnavailable) {
			t.Fatalf("expected missing reconnect policy error, got %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("timeout waiting for reconnect policy validation")
	}
}
