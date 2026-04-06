package runtime

import "sync"

type SessionEpochTracker struct {
	mu      sync.RWMutex
	current uint64
}

func NewSessionEpochTracker() *SessionEpochTracker {
	return &SessionEpochTracker{}
}

func (t *SessionEpochTracker) Next() uint64 {
	t.mu.Lock()
	defer t.mu.Unlock()

	t.current++
	return t.current
}

func (t *SessionEpochTracker) Current() uint64 {
	t.mu.RLock()
	defer t.mu.RUnlock()

	return t.current
}

func (t *SessionEpochTracker) IsActive(epoch uint64) bool {
	if epoch == 0 {
		return false
	}

	return t.Current() == epoch
}
