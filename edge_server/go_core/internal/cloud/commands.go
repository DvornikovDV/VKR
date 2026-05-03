package cloud

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

type CommandEventName string

const (
	CommandEventExecuteCommand CommandEventName = "execute_command"
	CommandEventCommandResult  CommandEventName = "command_result"
)

type CommandType string

const (
	CommandTypeSetBool   CommandType = "set_bool"
	CommandTypeSetNumber CommandType = "set_number"
)

func IsSupportedCommandType(commandType CommandType) bool {
	switch commandType {
	case CommandTypeSetBool, CommandTypeSetNumber:
		return true
	default:
		return false
	}
}

type CommandTerminalStatus string

const (
	CommandStatusConfirmed CommandTerminalStatus = "confirmed"
	CommandStatusTimeout   CommandTerminalStatus = "timeout"
	CommandStatusFailed    CommandTerminalStatus = "failed"
)

func IsTerminalCommandStatus(status CommandTerminalStatus) bool {
	switch status {
	case CommandStatusConfirmed, CommandStatusTimeout, CommandStatusFailed:
		return true
	default:
		return false
	}
}

type CommandFailureReason string

const (
	CommandFailureReasonEdgeTimeout CommandFailureReason = "edge_command_timeout"
	CommandFailureReasonEdgeFailed  CommandFailureReason = "edge_command_failed"
)

func IsEdgeCommandFailureReason(reason CommandFailureReason) bool {
	switch reason {
	case CommandFailureReasonEdgeTimeout, CommandFailureReasonEdgeFailed:
		return true
	default:
		return false
	}
}

type ExecuteCommandPayload struct {
	Value any `json:"value"`
}

type ExecuteCommand struct {
	RequestID   string                `json:"requestId"`
	EdgeID      string                `json:"edgeId"`
	DeviceID    string                `json:"deviceId"`
	CommandType CommandType           `json:"commandType"`
	Payload     ExecuteCommandPayload `json:"payload"`
}

type CommandResult struct {
	EdgeID        string                `json:"edgeId"`
	RequestID     string                `json:"requestId"`
	Status        CommandTerminalStatus `json:"status"`
	CompletedAt   string                `json:"completedAt"`
	FailureReason CommandFailureReason  `json:"failureReason,omitempty"`
}

func ParseExecuteCommand(raw any, expectedEdgeID string) (*ExecuteCommand, error) {
	b, err := json.Marshal(raw)
	if err != nil {
		return nil, fmt.Errorf("marshal raw payload: %w", err)
	}

	var cmd ExecuteCommand
	if err := json.Unmarshal(b, &cmd); err != nil {
		return nil, fmt.Errorf("unmarshal execute_command: %w", err)
	}

	cmd.RequestID = strings.TrimSpace(cmd.RequestID)
	cmd.EdgeID = strings.TrimSpace(cmd.EdgeID)
	cmd.DeviceID = strings.TrimSpace(cmd.DeviceID)

	if cmd.RequestID == "" {
		return nil, fmt.Errorf("requestId is required")
	}
	if cmd.EdgeID == "" {
		return nil, fmt.Errorf("edgeId is required")
	}
	if cmd.EdgeID != expectedEdgeID {
		return nil, fmt.Errorf("edgeId mismatch: expected %s, got %s", expectedEdgeID, cmd.EdgeID)
	}
	if cmd.DeviceID == "" {
		return nil, fmt.Errorf("deviceId is required")
	}
	if !IsSupportedCommandType(cmd.CommandType) {
		return nil, fmt.Errorf("unsupported commandType: %s", cmd.CommandType)
	}
	if cmd.Payload.Value == nil {
		return nil, fmt.Errorf("payload.value is required")
	}

	switch cmd.CommandType {
	case CommandTypeSetBool:
		if _, ok := cmd.Payload.Value.(bool); !ok {
			return nil, fmt.Errorf("payload.value must be a boolean for set_bool")
		}
	case CommandTypeSetNumber:
		if _, ok := cmd.Payload.Value.(float64); !ok {
			return nil, fmt.Errorf("payload.value must be a number for set_number")
		}
	}

	return &cmd, nil
}

func NewCommandResult(edgeID string, requestID string, status CommandTerminalStatus) *CommandResult {
	res := &CommandResult{
		EdgeID:      edgeID,
		RequestID:   requestID,
		Status:      status,
		CompletedAt: time.Now().UTC().Format(time.RFC3339),
	}

	switch status {
	case CommandStatusTimeout:
		res.FailureReason = CommandFailureReasonEdgeTimeout
	case CommandStatusFailed:
		res.FailureReason = CommandFailureReasonEdgeFailed
	}

	return res
}
