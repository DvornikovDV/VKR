package runtime

import (
	"context"
	"errors"
	"strings"
	"sync"
	"time"

	"edge_server/go_core/internal/cloud"
)

const DefaultCommandBridgeTimeout = 4 * time.Second

type CommandExecutionRequest struct {
	RequestID   string
	EdgeID      string
	DeviceID    string
	CommandType cloud.CommandType
	Value       any
}

type CommandExecutionResult struct {
	DeviceID string
	Command  cloud.CommandType
	Status   cloud.CommandTerminalStatus
	Reason   string
}

type CommandExecutor interface {
	ExecuteCommand(ctx context.Context, request CommandExecutionRequest) (CommandExecutionResult, error)
}

type CommandBridgeConfig struct {
	EdgeID   string
	Executor CommandExecutor
	Registry *CommandRequestRegistry
	Timeout  time.Duration
}

type CommandBridgeOption func(*CommandBridgeConfig)

func WithCommandBridgeTimeout(timeout time.Duration) CommandBridgeOption {
	return func(cfg *CommandBridgeConfig) {
		cfg.Timeout = timeout
	}
}

type CommandBridge struct {
	edgeID   string
	executor CommandExecutor
	registry *CommandRequestRegistry
	timeout  time.Duration
}

func NewCommandBridge(cfg CommandBridgeConfig, opts ...CommandBridgeOption) (*CommandBridge, error) {
	for _, opt := range opts {
		if opt != nil {
			opt(&cfg)
		}
	}

	edgeID := strings.TrimSpace(cfg.EdgeID)
	if edgeID == "" {
		return nil, errors.New("command bridge edgeId is required")
	}
	if cfg.Executor == nil {
		return nil, errors.New("command bridge executor is required")
	}

	timeout := cfg.Timeout
	if timeout <= 0 {
		timeout = DefaultCommandBridgeTimeout
	}

	registry := cfg.Registry
	if registry == nil {
		registry = NewCommandRequestRegistry(CommandRequestRegistryConfig{})
	}

	return &CommandBridge{
		edgeID:   edgeID,
		executor: cfg.Executor,
		registry: registry,
		timeout:  timeout,
	}, nil
}

func (b *CommandBridge) EdgeID() string {
	if b == nil {
		return ""
	}
	return b.edgeID
}

func (b *CommandBridge) Timeout() time.Duration {
	if b == nil {
		return 0
	}
	return b.timeout
}

func (b *CommandBridge) TryReserve(requestID string, now time.Time) bool {
	if b == nil || b.registry == nil {
		return false
	}
	return b.registry.TryReserve(requestID, now)
}

func (b *CommandBridge) TryComplete(requestID string, now time.Time) bool {
	if b == nil || b.registry == nil {
		return false
	}
	return b.registry.TryComplete(requestID, now)
}

func (b *CommandBridge) Registry() *CommandRequestRegistry {
	if b == nil {
		return nil
	}
	return b.registry
}

type CommandRequestRegistryConfig struct {
	TTL        time.Duration
	MaxEntries int
}

type requestState struct {
	reservedAt time.Time
	completed  bool
}

type CommandRequestRegistry struct {
	mu         sync.Mutex
	ttl        time.Duration
	maxEntries int
	requests   map[string]requestState
}

const (
	defaultCommandRequestRegistryTTL        = 10 * time.Minute
	defaultCommandRequestRegistryMaxEntries = 1024
)

func NewCommandRequestRegistry(cfg CommandRequestRegistryConfig) *CommandRequestRegistry {
	ttl := cfg.TTL
	if ttl <= 0 {
		ttl = defaultCommandRequestRegistryTTL
	}

	maxEntries := cfg.MaxEntries
	if maxEntries <= 0 {
		maxEntries = defaultCommandRequestRegistryMaxEntries
	}

	return &CommandRequestRegistry{
		ttl:        ttl,
		maxEntries: maxEntries,
		requests:   make(map[string]requestState),
	}
}

func (r *CommandRequestRegistry) TryReserve(requestID string, now time.Time) bool {
	if r == nil {
		return false
	}

	requestID = strings.TrimSpace(requestID)
	if requestID == "" {
		return false
	}
	if now.IsZero() {
		now = time.Now().UTC()
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	r.cleanupExpiredLocked(now)
	if _, exists := r.requests[requestID]; exists {
		return false
	}

	for len(r.requests) >= r.maxEntries {
		r.evictOldestLocked()
	}

	r.requests[requestID] = requestState{
		reservedAt: now,
		completed:  false,
	}
	return true
}

func (r *CommandRequestRegistry) TryComplete(requestID string, now time.Time) bool {
	if r == nil {
		return false
	}

	requestID = strings.TrimSpace(requestID)
	if requestID == "" {
		return false
	}
	if now.IsZero() {
		now = time.Now().UTC()
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	r.cleanupExpiredLocked(now)
	state, exists := r.requests[requestID]
	if !exists {
		return false
	}
	
	if state.completed {
		return false
	}

	state.completed = true
	r.requests[requestID] = state
	return true
}

func (r *CommandRequestRegistry) Seen(requestID string, now time.Time) bool {
	if r == nil {
		return false
	}

	requestID = strings.TrimSpace(requestID)
	if requestID == "" {
		return false
	}
	if now.IsZero() {
		now = time.Now().UTC()
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	r.cleanupExpiredLocked(now)
	_, exists := r.requests[requestID]
	return exists
}

func (r *CommandRequestRegistry) Len(now time.Time) int {
	if r == nil {
		return 0
	}
	if now.IsZero() {
		now = time.Now().UTC()
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	r.cleanupExpiredLocked(now)
	return len(r.requests)
}

func (r *CommandRequestRegistry) cleanupExpiredLocked(now time.Time) {
	expiresBefore := now.Add(-r.ttl)
	for requestID, state := range r.requests {
		if state.reservedAt.Before(expiresBefore) {
			delete(r.requests, requestID)
		}
	}
}

func (r *CommandRequestRegistry) evictOldestLocked() {
	var (
		oldestID string
		oldestAt time.Time
	)

	for requestID, state := range r.requests {
		if oldestID == "" || state.reservedAt.Before(oldestAt) {
			oldestID = requestID
			oldestAt = state.reservedAt
		}
	}

	if oldestID != "" {
		delete(r.requests, oldestID)
	}
}
