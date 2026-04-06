package runtime

import "sync"

type SessionEpochTracker struct {
	mu         sync.RWMutex
	lastIssued uint64
	active     uint64
}

func NewSessionEpochTracker() *SessionEpochTracker {
	return &SessionEpochTracker{}
}

func (t *SessionEpochTracker) Next() uint64 {
	t.mu.Lock()
	defer t.mu.Unlock()

	t.lastIssued++
	t.active = t.lastIssued
	return t.active
}

func (t *SessionEpochTracker) Current() uint64 {
	t.mu.RLock()
	defer t.mu.RUnlock()

	return t.active
}

func (t *SessionEpochTracker) IsActive(epoch uint64) bool {
	if epoch == 0 {
		return false
	}

	return t.Current() == epoch
}

func (t *SessionEpochTracker) Invalidate() {
	t.mu.Lock()
	defer t.mu.Unlock()

	t.active = 0
}
