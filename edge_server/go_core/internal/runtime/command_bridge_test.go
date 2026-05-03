package runtime_test

import (
	"sync"
	"sync/atomic"
	"testing"
	"time"

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

	// MaxEntries is 2. Reserving a third should evict the oldest (req-1).
	// We'll give req3 a slightly newer time.
	if !registry.TryReserve("req-3", now.Add(time.Millisecond)) {
		t.Errorf("expected TryReserve to succeed for req-3")
	}

	if registry.Len(now.Add(time.Millisecond)) != 2 {
		t.Errorf("expected length to be 2, got %d", registry.Len(now.Add(time.Millisecond)))
	}

	// req-1 was oldest, should be evicted
	if registry.Seen("req-1", now.Add(time.Millisecond)) {
		t.Errorf("expected req-1 to be evicted")
	}

	// TryComplete on an unknown/evicted request should fail
	if registry.TryComplete("req-1", now.Add(time.Millisecond)) {
		t.Errorf("expected TryComplete to fail for unknown/evicted req-1")
	}

	// Test TTL cleanup
	time.Sleep(15 * time.Millisecond)
	later := time.Now().UTC()
	if registry.Len(later) != 0 {
		t.Errorf("expected length to be 0 after TTL expired, got %d", registry.Len(later))
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
