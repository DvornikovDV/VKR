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

type ParseExecuteCommandOutcome struct {
	Command         *ExecuteCommand
	RequestID       string
	ValidationError error
	ProtocolError   error
}

func ParseExecuteCommand(raw any, expectedEdgeID string) ParseExecuteCommandOutcome {
	b, err := json.Marshal(raw)
	if err != nil {
		return ParseExecuteCommandOutcome{ProtocolError: fmt.Errorf("marshal raw payload: %w", err)}
	}

	var cmd ExecuteCommand
	if err := json.Unmarshal(b, &cmd); err != nil {
		return ParseExecuteCommandOutcome{ProtocolError: fmt.Errorf("unmarshal execute_command: %w", err)}
	}

	cmd.RequestID = strings.TrimSpace(cmd.RequestID)
	cmd.EdgeID = strings.TrimSpace(cmd.EdgeID)
	cmd.DeviceID = strings.TrimSpace(cmd.DeviceID)

	if cmd.RequestID == "" {
		return ParseExecuteCommandOutcome{ProtocolError: fmt.Errorf("requestId is required")}
	}
	
	outcome := ParseExecuteCommandOutcome{RequestID: cmd.RequestID}

	if cmd.EdgeID == "" {
		outcome.ValidationError = fmt.Errorf("edgeId is required")
		return outcome
	}
	if cmd.EdgeID != expectedEdgeID {
		outcome.ValidationError = fmt.Errorf("edgeId mismatch: expected %s, got %s", expectedEdgeID, cmd.EdgeID)
		return outcome
	}
	if cmd.DeviceID == "" {
		outcome.ValidationError = fmt.Errorf("deviceId is required")
		return outcome
	}
	if !IsSupportedCommandType(cmd.CommandType) {
		outcome.ValidationError = fmt.Errorf("unsupported commandType: %s", cmd.CommandType)
		return outcome
	}
	if cmd.Payload.Value == nil {
		outcome.ValidationError = fmt.Errorf("payload.value is required")
		return outcome
	}

	switch cmd.CommandType {
	case CommandTypeSetBool:
		if _, ok := cmd.Payload.Value.(bool); !ok {
			outcome.ValidationError = fmt.Errorf("payload.value must be a boolean for set_bool")
			return outcome
		}
	case CommandTypeSetNumber:
		if _, ok := cmd.Payload.Value.(float64); !ok {
			outcome.ValidationError = fmt.Errorf("payload.value must be a number for set_number")
			return outcome
		}
	}

	outcome.Command = &cmd
	return outcome
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
