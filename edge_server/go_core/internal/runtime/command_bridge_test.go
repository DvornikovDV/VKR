package runtime_test

import (
	"context"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"edge_server/go_core/internal/cloud"
	"edge_server/go_core/internal/runtime"
)

func TestCommandRequestRegistry(t *testing.T) {
	registry := runtime.NewCommandRequestRegistry(runtime.CommandRequestRegistryConfig{
		TTL:        10 * time.Millisecond,
		MaxEntries: 2,
	})

	now := time.Now().UTC()

	// 1. First TryReserve("req-1") succeeds
	if !registry.TryReserve("req-1", now) {
		t.Errorf("expected TryReserve to succeed for req-1")
	}

	// 2. Second TryReserve("req-1") fails
	if registry.TryReserve("req-1", now) {
		t.Errorf("expected TryReserve to fail for duplicate req-1")
	}

	// 3. First TryComplete("req-1") succeeds
	if !registry.TryComplete("req-1", now) {
		t.Errorf("expected TryComplete to succeed for req-1")
	}

	// 4. Second TryComplete("req-1") fails
	if registry.TryComplete("req-1", now) {
		t.Errorf("expected TryComplete to fail for duplicate complete on req-1")
	}

	// 5. TryReserve/Complete another request to check capacity
	if !registry.TryReserve("req-2", now.Add(1*time.Microsecond)) {
		t.Errorf("expected TryReserve to succeed for req-2")
	}

	// Active reservations are not allowed to evict completed request IDs,
	// because completed IDs are still the process-local at-most-once memory.
	if !registry.TryReserve("req-3", now.Add(time.Millisecond)) {
		t.Errorf("expected TryReserve to succeed for req-3")
	}

	if registry.Len(now.Add(time.Millisecond)) != 3 {
		t.Errorf("expected length to be 3, got %d", registry.Len(now.Add(time.Millisecond)))
	}

	if !registry.Seen("req-1", now.Add(time.Millisecond)) {
		t.Errorf("expected completed req-1 to remain remembered")
	}

	if registry.TryComplete("req-1", now.Add(time.Millisecond)) {
		t.Errorf("expected TryComplete to fail for already completed req-1")
	}

	// Test TTL cleanup
	// We can't easily test reserved eviction via TTL since it's hardcoded to 1 minute grace.
	// But we can test completed eviction.
	later := time.Now().UTC()
	registry.TryComplete("req-2", later)
	registry.TryComplete("req-3", later)
	time.Sleep(15 * time.Millisecond)
	later2 := time.Now().UTC()
	if registry.Len(later2) != 0 {
		t.Errorf("expected length to be 0 after TTL expired for completed entries, got %d", registry.Len(later2))
	}
}

func TestCommandRequestRegistryConcurrency(t *testing.T) {
	registry := runtime.NewCommandRequestRegistry(runtime.CommandRequestRegistryConfig{
		TTL:        1 * time.Minute,
		MaxEntries: 100,
	})

	now := time.Now().UTC()
	reqID := "concurrent-req"

	if !registry.TryReserve(reqID, now) {
		t.Fatalf("expected TryReserve to succeed")
	}

	var wg sync.WaitGroup
	var successCount int32
	routines := 50

	wg.Add(routines)
	for i := 0; i < routines; i++ {
		go func() {
			defer wg.Done()
			if registry.TryComplete(reqID, time.Now().UTC()) {
				atomic.AddInt32(&successCount, 1)
			}
		}()
	}

	wg.Wait()

	if successCount != 1 {
		t.Errorf("expected exactly 1 TryComplete to succeed, got %d", successCount)
	}
}

type dummyCommandExecutor struct {
	calls atomic.Int32
	block chan struct{}
}

func (e *dummyCommandExecutor) ExecuteCommand(ctx context.Context, request runtime.CommandExecutionRequest) (runtime.CommandExecutionResult, error) {
	e.calls.Add(1)
	<-e.block
	return runtime.CommandExecutionResult{
		Status: cloud.CommandStatusConfirmed,
	}, nil
}

type dummyCommandClient struct {
	mu       sync.Mutex
	emits    map[string]int
	statuses map[string]cloud.CommandTerminalStatus
	resultCh chan *cloud.CommandResult
}

func (c *dummyCommandClient) EmitCommandResult(payload any) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.emits == nil {
		c.emits = make(map[string]int)
	}
	if c.statuses == nil {
		c.statuses = make(map[string]cloud.CommandTerminalStatus)
	}
	res := payload.(*cloud.CommandResult)
	c.emits[res.RequestID]++
	c.statuses[res.RequestID] = res.Status
	if c.resultCh != nil {
		select {
		case c.resultCh <- res:
		default:
		}
	}
	return nil
}

func TestCommandBridge_DuplicateSuppressionSurvivesRegistryPressure(t *testing.T) {
	executor := &dummyCommandExecutor{block: make(chan struct{})}
	registry := runtime.NewCommandRequestRegistry(runtime.CommandRequestRegistryConfig{
		TTL:        10 * time.Minute,
		MaxEntries: 1,
	})

	bridge, err := runtime.NewCommandBridge(runtime.CommandBridgeConfig{
		EdgeID:   "test-edge-01",
		Executor: executor,
		Registry: registry,
		Timeout:  10 * time.Second,
	})
	if err != nil {
		t.Fatalf("failed to create bridge: %v", err)
	}

	client := &dummyCommandClient{resultCh: make(chan *cloud.CommandResult, 4)}

	payloadA := map[string]any{
		"requestId":   "req-A",
		"edgeId":      "test-edge-01",
		"deviceId":    "pump-01",
		"commandType": "set_bool",
		"payload":     map[string]any{"value": true},
	}

	payloadB := map[string]any{
		"requestId":   "req-B",
		"edgeId":      "test-edge-01",
		"deviceId":    "pump-01",
		"commandType": "set_bool",
		"payload":     map[string]any{"value": true},
	}

	bridge.HandleExecuteCommand(context.Background(), payloadA, client)
	waitForCalls(t, &executor.calls, 1)
	bridge.HandleExecuteCommand(context.Background(), payloadB, client)
	waitForResult(t, client.resultCh, "req-B", cloud.CommandStatusFailed)

	bridge.HandleExecuteCommand(context.Background(), payloadA, client)
	time.Sleep(50 * time.Millisecond)
	if got := executor.calls.Load(); got != 1 {
		t.Fatalf("expected duplicate req-A and saturated req-B to avoid executor calls, got %d calls", got)
	}

	close(executor.block)
	waitForResult(t, client.resultCh, "req-A", cloud.CommandStatusConfirmed)

	client.mu.Lock()
	defer client.mu.Unlock()

	if client.emits["req-A"] != 1 {
		t.Errorf("expected exactly 1 emit for req-A, got %d", client.emits["req-A"])
	}
	if client.emits["req-B"] != 1 {
		t.Errorf("expected exactly 1 saturation failure for req-B, got %d", client.emits["req-B"])
	}
}

func TestCommandBridge_TimeoutDoesNotWaitForExecutorReturn(t *testing.T) {
	executor := &dummyCommandExecutor{block: make(chan struct{})}
	bridge, err := runtime.NewCommandBridge(runtime.CommandBridgeConfig{
		EdgeID:   "test-edge-01",
		Executor: executor,
		Timeout:  20 * time.Millisecond,
	})
	if err != nil {
		t.Fatalf("failed to create bridge: %v", err)
	}

	client := &dummyCommandClient{resultCh: make(chan *cloud.CommandResult, 1)}
	payload := map[string]any{
		"requestId":   "req-timeout",
		"edgeId":      "test-edge-01",
		"deviceId":    "pump-01",
		"commandType": "set_bool",
		"payload":     map[string]any{"value": true},
	}

	bridge.HandleExecuteCommand(context.Background(), payload, client)
	waitForCalls(t, &executor.calls, 1)
	waitForResult(t, client.resultCh, "req-timeout", cloud.CommandStatusTimeout)
	close(executor.block)

	client.mu.Lock()
	defer client.mu.Unlock()
	if client.emits["req-timeout"] != 1 {
		t.Errorf("expected exactly 1 timeout result, got %d", client.emits["req-timeout"])
	}
}

func waitForCalls(t *testing.T, calls *atomic.Int32, want int32) {
	t.Helper()

	deadline := time.Now().Add(time.Second)
	for calls.Load() < want {
		if time.Now().After(deadline) {
			t.Fatalf("timeout waiting for %d executor calls, got %d", want, calls.Load())
		}
		time.Sleep(5 * time.Millisecond)
	}
}

func waitForResult(t *testing.T, resultCh <-chan *cloud.CommandResult, requestID string, status cloud.CommandTerminalStatus) {
	t.Helper()

	deadline := time.After(time.Second)
	for {
		select {
		case res := <-resultCh:
			if res.RequestID != requestID {
				continue
			}
			if res.Status != status {
				t.Fatalf("expected %s status %q, got %q", requestID, status, res.Status)
			}
			return
		case <-deadline:
			t.Fatalf("timeout waiting for %s result with status %q", requestID, status)
		}
	}
}
