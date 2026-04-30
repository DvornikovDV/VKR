package source

import "context"

type CommandStatus string

const (
	CommandStatusAccepted  CommandStatus = "accepted"
	CommandStatusConfirmed CommandStatus = "confirmed"
	CommandStatusTimeout   CommandStatus = "timeout"
	CommandStatusFailed    CommandStatus = "failed"
)

type CommandRequest struct {
	DeviceID string
	Command  string
	Value    any
}

type CommandResult struct {
	DeviceID string
	Command  string
	Status   CommandStatus
	Reason   string
}

type CommandCapable interface {
	ExecuteCommand(ctx context.Context, request CommandRequest) (CommandResult, error)
}
