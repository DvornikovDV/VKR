package runtime

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestReconnectPolicyUnlimitedRetriesWhenMaxAttemptsZero(t *testing.T) {
	policy := mustReconnectPolicy(t, ReconnectPolicyConfig{
		BaseDelay:   10 * time.Millisecond,
		MaxDelay:    40 * time.Millisecond,
		MaxAttempts: 0,
	})

	for _, attempt := range []int{1, 2, 3, 10, 100} {
		result := policy.PlanAttempt(attempt)
		if result.Exhausted {
			t.Fatalf("attempt %d unexpectedly exhausted unlimited retry policy", attempt)
		}
		if !result.Unlimited {
			t.Fatalf("attempt %d did not report unlimited retry policy", attempt)
		}
	}
}

func TestReconnectPolicyFiniteAttemptExhaustion(t *testing.T) {
	policy := mustReconnectPolicy(t, ReconnectPolicyConfig{
		BaseDelay:   10 * time.Millisecond,
		MaxDelay:    40 * time.Millisecond,
		MaxAttempts: 3,
	})

	for _, attempt := range []int{1, 2, 3} {
		result := policy.PlanAttempt(attempt)
		if result.Exhausted {
			t.Fatalf("attempt %d exhausted before configured maxAttempts", attempt)
		}
	}

	result := policy.PlanAttempt(4)
	if !result.Exhausted {
		t.Fatal("expected fourth attempt to exhaust maxAttempts=3 policy")
	}
	if result.Delay != 0 {
		t.Fatalf("exhausted attempt must not schedule delay, got %s", result.Delay)
	}
}

func TestReconnectPolicyDelayCapping(t *testing.T) {
	policy := mustReconnectPolicy(t, ReconnectPolicyConfig{
		BaseDelay:   25 * time.Millisecond,
		MaxDelay:    60 * time.Millisecond,
		MaxAttempts: 0,
	})

	tests := []struct {
		attempt int
		want    time.Duration
	}{
		{attempt: 1, want: 25 * time.Millisecond},
		{attempt: 2, want: 50 * time.Millisecond},
		{attempt: 3, want: 60 * time.Millisecond},
		{attempt: 8, want: 60 * time.Millisecond},
	}

	for _, tt := range tests {
		result := policy.PlanAttempt(tt.attempt)
		if result.Delay != tt.want {
			t.Fatalf("attempt %d delay = %s, want %s", tt.attempt, result.Delay, tt.want)
		}
	}
}

func TestReconnectPolicyWaitHonorsContextCancellation(t *testing.T) {
	policy := mustReconnectPolicy(t, ReconnectPolicyConfig{
		BaseDelay:   time.Hour,
		MaxDelay:    time.Hour,
		MaxAttempts: 0,
	})

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() {
		done <- policy.Wait(ctx, policy.PlanAttempt(1))
	}()

	select {
	case err := <-done:
		cancel()
		t.Fatalf("wait returned before cancellation: %v", err)
	case <-time.After(20 * time.Millisecond):
	}

	cancel()

	select {
	case err := <-done:
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("expected context cancellation from pending wait, got %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("timeout waiting for pending reconnect wait to observe cancellation")
	}
}

func mustReconnectPolicy(t *testing.T, cfg ReconnectPolicyConfig) *ReconnectPolicy {
	t.Helper()

	policy, err := NewReconnectPolicy(cfg)
	if err != nil {
		t.Fatalf("create reconnect policy: %v", err)
	}
	return policy
}
