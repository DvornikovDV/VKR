package runtime

import (
	"context"
	"errors"
	"fmt"
	"time"
)

var ErrReconnectAttemptsExhausted = errors.New("runtime reconnect attempts exhausted")

type ReconnectPolicyConfig struct {
	BaseDelay   time.Duration
	MaxDelay    time.Duration
	MaxAttempts int
}

type ReconnectAttemptResult struct {
	Attempt   int
	Delay     time.Duration
	Exhausted bool
	Unlimited bool
}

type ReconnectPolicy struct {
	baseDelay   time.Duration
	maxDelay    time.Duration
	maxAttempts int
}

func NewReconnectPolicy(cfg ReconnectPolicyConfig) (*ReconnectPolicy, error) {
	if cfg.BaseDelay <= 0 {
		return nil, fmt.Errorf("reconnect base delay must be positive")
	}
	if cfg.MaxDelay <= 0 {
		return nil, fmt.Errorf("reconnect max delay must be positive")
	}
	if cfg.MaxDelay < cfg.BaseDelay {
		return nil, fmt.Errorf("reconnect max delay must be greater than or equal to base delay")
	}
	if cfg.MaxAttempts < 0 {
		return nil, fmt.Errorf("reconnect max attempts must be zero or positive")
	}

	return &ReconnectPolicy{
		baseDelay:   cfg.BaseDelay,
		maxDelay:    cfg.MaxDelay,
		maxAttempts: cfg.MaxAttempts,
	}, nil
}

func (p *ReconnectPolicy) PlanAttempt(attempt int) ReconnectAttemptResult {
	if attempt < 1 {
		attempt = 1
	}

	result := ReconnectAttemptResult{
		Attempt:   attempt,
		Unlimited: p.maxAttempts == 0,
	}

	if p.maxAttempts > 0 && attempt > p.maxAttempts {
		result.Exhausted = true
		return result
	}

	result.Delay = p.delayForAttempt(attempt)
	return result
}

func (p *ReconnectPolicy) Wait(ctx context.Context, result ReconnectAttemptResult) error {
	if ctx == nil {
		return fmt.Errorf("reconnect wait context is required")
	}
	if result.Exhausted {
		return ErrReconnectAttemptsExhausted
	}
	if result.Delay <= 0 {
		return nil
	}

	timer := time.NewTimer(result.Delay)
	defer timer.Stop()

	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

func (p *ReconnectPolicy) delayForAttempt(attempt int) time.Duration {
	delay := p.baseDelay
	for i := 1; i < attempt; i++ {
		if delay >= p.maxDelay {
			return p.maxDelay
		}
		if delay > p.maxDelay/2 {
			return p.maxDelay
		}
		delay *= 2
	}
	if delay > p.maxDelay {
		return p.maxDelay
	}
	return delay
}
