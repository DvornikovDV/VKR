package runtime

import (
	"context"
	"testing"
	"time"

	"edge_server/go_core/internal/cloud"
)



type dummyExecutor struct{}

func (d *dummyExecutor) ExecuteCommand(ctx context.Context, req CommandExecutionRequest) (CommandExecutionResult, error) {
	return CommandExecutionResult{Status: cloud.CommandStatusConfirmed}, nil
}

type fakeTransport struct {
	connectCh      chan struct{}
	disconnectCh   chan string
	executeCommand func(any)
	emitted        chan any
}

func (f *fakeTransport) Connect(ctx context.Context, auth cloud.HandshakeAuth) error {
	select {
	case f.connectCh <- struct{}{}:
	default:
	}
	return nil
}

func (f *fakeTransport) Disconnect() error {
	return nil
}

func (f *fakeTransport) Emit(event string, payload any) error {
	if event == "command_result" {
		f.emitted <- payload
	}
	return nil
}

func (f *fakeTransport) OnEdgeDisconnect(handler func(any)) {}

func (f *fakeTransport) OnExecuteCommand(handler func(any)) {
	f.executeCommand = handler
}

func (f *fakeTransport) OnConnect(handler func() error) {}

func (f *fakeTransport) OnConnectError(handler func(error)) {}

func (f *fakeTransport) OnDisconnect(handler func(string)) {
	go func() {
		for reason := range f.disconnectCh {
			handler(reason)
		}
	}()
}

func TestRunner_Reconnect_NoDuplicateTerminalResponses(t *testing.T) {
	runner := New()

	transport := &fakeTransport{
		connectCh:    make(chan struct{}, 10),
		disconnectCh: make(chan string, 10),
		emitted:      make(chan any, 10),
	}
	runner.transport = transport

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

	// Wait for first connect
	select {
	case <-transport.connectCh:
	case <-time.After(1 * time.Second):
		t.Fatal("timeout waiting for first connect")
	}

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
	case res := <-transport.emitted:
		cmdRes, ok := res.(*cloud.CommandResult)
		if !ok || cmdRes.Status != cloud.CommandStatusConfirmed {
			t.Fatalf("expected confirmed result, got %v", res)
		}
	case <-time.After(1 * time.Second):
		t.Fatal("timeout waiting for command result")
	}

	// Trigger reconnect
	transport.disconnectCh <- "transport close"

	// Wait for second connect
	select {
	case <-transport.connectCh:
	case <-time.After(1 * time.Second):
		t.Fatal("timeout waiting for second connect")
	}

	// Inject SAME command after reconnect
	if transport.executeCommand != nil {
		transport.executeCommand(payload)
	} else {
		t.Fatal("expected executeCommand handler to still be registered")
	}

	// Wait to ensure NO second result is emitted (at-most-once prevents it)
	select {
	case res := <-transport.emitted:
		t.Fatalf("expected no duplicate terminal response, got %v", res)
	case <-time.After(100 * time.Millisecond):
		// Success: no duplicate response
	}

	cancel()
	<-runDone
}
