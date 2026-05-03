package cloud_test

import (
	"testing"
	"time"

	"edge_server/go_core/internal/cloud"
)

func TestParseExecuteCommand_HappyPath(t *testing.T) {
	expectedEdgeID := "edge-123"

	t.Run("set_bool true", func(t *testing.T) {
		raw := map[string]any{
			"requestId":   "req-1",
			"edgeId":      expectedEdgeID,
			"deviceId":    "dev-1",
			"commandType": "set_bool",
			"payload": map[string]any{
				"value": true,
			},
		}

		cmd, err := cloud.ParseExecuteCommand(raw, expectedEdgeID)
		if err != nil {
			t.Fatalf("expected success, got %v", err)
		}

		if val, ok := cmd.Payload.Value.(bool); !ok || !val {
			t.Fatalf("expected true boolean, got %v", cmd.Payload.Value)
		}
	})

	t.Run("set_number 128", func(t *testing.T) {
		raw := map[string]any{
			"requestId":   "req-2",
			"edgeId":      expectedEdgeID,
			"deviceId":    "dev-1",
			"commandType": "set_number",
			"payload": map[string]any{
				"value": float64(128),
			},
		}

		cmd, err := cloud.ParseExecuteCommand(raw, expectedEdgeID)
		if err != nil {
			t.Fatalf("expected success, got %v", err)
		}

		if val, ok := cmd.Payload.Value.(float64); !ok || val != 128 {
			t.Fatalf("expected 128 float64, got %v", cmd.Payload.Value)
		}
	})
}

func TestParseExecuteCommand_Negative(t *testing.T) {
	expectedEdgeID := "edge-123"

	t.Run("set_bool with numeric value", func(t *testing.T) {
		raw := map[string]any{
			"requestId":   "req-1",
			"edgeId":      expectedEdgeID,
			"deviceId":    "dev-1",
			"commandType": "set_bool",
			"payload": map[string]any{
				"value": float64(1),
			},
		}

		_, err := cloud.ParseExecuteCommand(raw, expectedEdgeID)
		if err == nil {
			t.Fatal("expected error, got nil")
		}
	})

	t.Run("set_number with string value", func(t *testing.T) {
		raw := map[string]any{
			"requestId":   "req-2",
			"edgeId":      expectedEdgeID,
			"deviceId":    "dev-1",
			"commandType": "set_number",
			"payload": map[string]any{
				"value": "128",
			},
		}

		_, err := cloud.ParseExecuteCommand(raw, expectedEdgeID)
		if err == nil {
			t.Fatal("expected error, got nil")
		}
	})
}

func TestNewCommandResult(t *testing.T) {
	t.Run("confirmed without failureReason", func(t *testing.T) {
		res := cloud.NewCommandResult("edge-1", "req-1", cloud.CommandStatusConfirmed)
		if res.FailureReason != "" {
			t.Fatalf("expected empty failure reason, got %s", res.FailureReason)
		}
	})

	t.Run("timeout with edge_command_timeout", func(t *testing.T) {
		res := cloud.NewCommandResult("edge-1", "req-1", cloud.CommandStatusTimeout)
		if res.FailureReason != cloud.CommandFailureReasonEdgeTimeout {
			t.Fatalf("expected edge_command_timeout, got %s", res.FailureReason)
		}
	})

	t.Run("failed with edge_command_failed", func(t *testing.T) {
		res := cloud.NewCommandResult("edge-1", "req-1", cloud.CommandStatusFailed)
		if res.FailureReason != cloud.CommandFailureReasonEdgeFailed {
			t.Fatalf("expected edge_command_failed, got %s", res.FailureReason)
		}
	})

	t.Run("completedAt parseable as RFC3339", func(t *testing.T) {
		res := cloud.NewCommandResult("edge-1", "req-1", cloud.CommandStatusConfirmed)
		_, err := time.Parse(time.RFC3339, res.CompletedAt)
		if err != nil {
			t.Fatalf("expected completedAt to be RFC3339, got %s: %v", res.CompletedAt, err)
		}
	})
}
