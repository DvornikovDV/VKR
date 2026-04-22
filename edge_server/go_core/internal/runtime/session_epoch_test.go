package runtime

import "testing"

func TestSessionEpochMonotonicity(t *testing.T) {
	tracker := NewSessionEpochTracker()

	first := tracker.Next()
	second := tracker.Next()

	if first != 1 || second != 2 {
		t.Fatalf("expected monotonic epochs [1,2], got [%d,%d]", first, second)
	}
	if tracker.IsActive(first) {
		t.Fatalf("expected first epoch to be inactive after second starts")
	}
	if !tracker.IsActive(second) {
		t.Fatalf("expected latest epoch to be active")
	}

	tracker.Invalidate()
	if tracker.Current() != 0 {
		t.Fatalf("expected invalidated tracker to reset current epoch to 0, got %d", tracker.Current())
	}
	if tracker.IsActive(second) {
		t.Fatalf("expected previous epoch to become inactive after invalidation")
	}

	third := tracker.Next()
	if third != 3 {
		t.Fatalf("expected next epoch after invalidation to remain monotonic and become 3, got %d", third)
	}
	if !tracker.IsActive(third) {
		t.Fatalf("expected new epoch %d to be active", third)
	}
}
