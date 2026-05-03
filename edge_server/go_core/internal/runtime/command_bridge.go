package runtime

import (
	"context"
	"errors"
	"log"
	"strings"
	"sync"
	"time"

	"edge_server/go_core/internal/cloud"
)

const DefaultCommandBridgeTimeout = 4 * time.Second

const commandRequestInFlightGrace = time.Second

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
		registry = NewCommandRequestRegistry(CommandRequestRegistryConfig{
			InFlightTTL: timeout + commandRequestInFlightGrace,
		})
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

func (b *CommandBridge) HandleExecuteCommand(ctx context.Context, payload any, client interface{ EmitCommandResult(any) error }) {
	if b == nil {
		return
	}

	outcome := cloud.ParseExecuteCommand(payload, b.edgeID)
	if outcome.ProtocolError != nil {
		log.Printf("command bridge protocol error: %v", outcome.ProtocolError)
		return
	}

	now := time.Now().UTC()
	switch b.Reserve(outcome.RequestID, now) {
	case CommandRequestReserved:
	case CommandRequestDuplicate:
		// T021: Duplicate requestId suppressed by at-most-once state
		return
	case CommandRequestRegistryFull:
		resultPayload := cloud.NewCommandResult(b.edgeID, outcome.RequestID, cloud.CommandStatusFailed)
		_ = client.EmitCommandResult(resultPayload)
		return
	default:
		return
	}

	if outcome.ValidationError != nil {
		if !b.TryComplete(outcome.RequestID, time.Now().UTC()) {
			return
		}
		resultPayload := cloud.NewCommandResult(b.edgeID, outcome.RequestID, cloud.CommandStatusFailed)
		_ = client.EmitCommandResult(resultPayload)
		return
	}

	cmd := outcome.Command

	// T020: Async dispatch
	go func() {
		execCtx, cancel := context.WithCancel(context.Background())
		defer cancel()

		req := CommandExecutionRequest{
			RequestID:   cmd.RequestID,
			EdgeID:      cmd.EdgeID,
			DeviceID:    cmd.DeviceID,
			CommandType: cmd.CommandType,
			Value:       cmd.Payload.Value,
		}

		resultCh := make(chan commandExecutionOutcome, 1)
		go func() {
			res, err := b.executor.ExecuteCommand(execCtx, req)
			resultCh <- commandExecutionOutcome{result: res, err: err}
		}()

		timer := time.NewTimer(b.Timeout())
		defer timer.Stop()

		var status cloud.CommandTerminalStatus
		select {
		case outcome := <-resultCh:
			status = mapCommandExecutionOutcome(outcome.result, outcome.err)
		case <-timer.C:
			cancel()
			status = cloud.CommandStatusTimeout
		case <-ctx.Done():
			cancel()
			status = cloud.CommandStatusFailed
		}

		if !b.TryComplete(cmd.RequestID, time.Now().UTC()) {
			return
		}

		resultPayload := cloud.NewCommandResult(b.edgeID, cmd.RequestID, status)
		_ = client.EmitCommandResult(resultPayload)
	}()
}

type commandExecutionOutcome struct {
	result CommandExecutionResult
	err    error
}

func mapCommandExecutionOutcome(res CommandExecutionResult, err error) cloud.CommandTerminalStatus {
	if err != nil {
		if errors.Is(err, context.DeadlineExceeded) {
			return cloud.CommandStatusTimeout
		}
		return cloud.CommandStatusFailed
	}

	switch res.Status {
	case cloud.CommandStatusConfirmed:
		return cloud.CommandStatusConfirmed
	case cloud.CommandStatusTimeout:
		return cloud.CommandStatusTimeout
	case cloud.CommandStatusFailed:
		return cloud.CommandStatusFailed
	default:
		return cloud.CommandStatusFailed
	}
}

func (b *CommandBridge) Reserve(requestID string, now time.Time) CommandRequestReservationStatus {
	if b == nil || b.registry == nil {
		return CommandRequestReservationInvalid
	}
	return b.registry.Reserve(requestID, now)
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
	TTL         time.Duration
	InFlightTTL time.Duration
	MaxEntries  int
}

type requestState struct {
	reservedAt  time.Time
	completedAt time.Time
	completed   bool
}

type CommandRequestRegistry struct {
	mu          sync.Mutex
	ttl         time.Duration
	inFlightTTL time.Duration
	maxEntries  int
	requests    map[string]requestState
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

	inFlightTTL := cfg.InFlightTTL
	if inFlightTTL <= 0 {
		inFlightTTL = time.Minute
	}

	maxEntries := cfg.MaxEntries
	if maxEntries <= 0 {
		maxEntries = defaultCommandRequestRegistryMaxEntries
	}

	return &CommandRequestRegistry{
		ttl:         ttl,
		inFlightTTL: inFlightTTL,
		maxEntries:  maxEntries,
		requests:    make(map[string]requestState),
	}
}

type CommandRequestReservationStatus int

const (
	CommandRequestReservationInvalid CommandRequestReservationStatus = iota
	CommandRequestReserved
	CommandRequestDuplicate
	CommandRequestRegistryFull
)

func (r *CommandRequestRegistry) Reserve(requestID string, now time.Time) CommandRequestReservationStatus {
	if r == nil {
		return CommandRequestReservationInvalid
	}

	requestID = strings.TrimSpace(requestID)
	if requestID == "" {
		return CommandRequestReservationInvalid
	}
	if now.IsZero() {
		now = time.Now().UTC()
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	r.cleanupExpiredLocked(now)
	if _, exists := r.requests[requestID]; exists {
		return CommandRequestDuplicate
	}

	if r.activeCountLocked() >= r.maxEntries {
		r.rememberCompletedLocked(requestID, now)
		return CommandRequestRegistryFull
	}

	r.evictCompletedOverflowLocked()
	r.requests[requestID] = requestState{
		reservedAt: now,
		completed:  false,
	}
	return CommandRequestReserved
}

func (r *CommandRequestRegistry) TryReserve(requestID string, now time.Time) bool {
	return r.Reserve(requestID, now) == CommandRequestReserved
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

	r.evictCompletedOverflowLocked()
	state.completed = true
	state.completedAt = now
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
	expiresBeforeCompleted := now.Add(-r.ttl)
	expiresBeforeReserved := now.Add(-r.inFlightTTL)

	for requestID, state := range r.requests {
		if state.completed {
			completedAt := state.completedAt
			if completedAt.IsZero() {
				completedAt = state.reservedAt
			}
			if completedAt.Before(expiresBeforeCompleted) {
				delete(r.requests, requestID)
			}
		} else {
			if state.reservedAt.Before(expiresBeforeReserved) {
				delete(r.requests, requestID)
			}
		}
	}
}

func (r *CommandRequestRegistry) activeCountLocked() int {
	count := 0
	for _, state := range r.requests {
		if !state.completed {
			count++
		}
	}
	return count
}

func (r *CommandRequestRegistry) completedCountLocked() int {
	count := 0
	for _, state := range r.requests {
		if state.completed {
			count++
		}
	}
	return count
}

func (r *CommandRequestRegistry) rememberCompletedLocked(requestID string, now time.Time) {
	r.evictCompletedOverflowLocked()
	r.requests[requestID] = requestState{
		reservedAt:  now,
		completedAt: now,
		completed:   true,
	}
}

func (r *CommandRequestRegistry) evictCompletedOverflowLocked() {
	for r.completedCountLocked() >= r.maxEntries {
		if !r.evictOldestCompletedLocked() {
			return
		}
	}
}

func (r *CommandRequestRegistry) evictOldestCompletedLocked() bool {
	var (
		oldestCompletedID string
		oldestCompletedAt time.Time
	)

	for requestID, state := range r.requests {
		if state.completed {
			completedAt := state.completedAt
			if completedAt.IsZero() {
				completedAt = state.reservedAt
			}
			if oldestCompletedID == "" || completedAt.Before(oldestCompletedAt) {
				oldestCompletedID = requestID
				oldestCompletedAt = completedAt
			}
		}
	}

	if oldestCompletedID != "" {
		delete(r.requests, oldestCompletedID)
		return true
	}
	return false
}
