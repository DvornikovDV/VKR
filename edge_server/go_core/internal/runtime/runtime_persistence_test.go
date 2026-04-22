package runtime

import (
	"fmt"
	"strings"
	"testing"
	"time"

	"edge_server/go_core/internal/state"
)

type failingRuntimeStateSaver struct {
	err error
}

func (s failingRuntimeStateSaver) Save(state.RuntimeState) error {
	return s.err
}

func TestRunnerReturnsPersistErrorsForStateTransitions(t *testing.T) {
	runner := New()
	if err := runner.ConfigureRuntimeState("edge-1", "rev-007"); err != nil {
		t.Fatalf("configure runtime state: %v", err)
	}
	if err := runner.ActivateTrustedSession("edge-1", "persist-secret-v1"); err != nil {
		t.Fatalf("activate trusted session before binding failing store: %v", err)
	}
	if err := runner.BindRuntimeStateStore(failingRuntimeStateSaver{err: fmt.Errorf("synthetic state write failure")}); err != nil {
		t.Fatalf("bind failing runtime state store: %v", err)
	}

	if err := runner.MarkDisconnected("transport_closed"); err == nil || !strings.Contains(err.Error(), "persist runtime state after disconnect") {
		t.Fatalf("expected disconnect transition to return persist error, got %v", err)
	}
	if err := runner.MarkUntrusted("trust_revoked", true); err == nil || !strings.Contains(err.Error(), "persist runtime state after trust loss") {
		t.Fatalf("expected untrusted transition to return persist error, got %v", err)
	}
	if err := runner.RecordTelemetrySent(time.Date(2026, 4, 22, 12, 0, 0, 0, time.UTC)); err == nil || !strings.Contains(err.Error(), "persist runtime state after telemetry emit") {
		t.Fatalf("expected telemetry update to return persist error, got %v", err)
	}
}
