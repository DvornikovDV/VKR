package runtimeapp

import (
	"context"

	"edge_server/go_core/internal/cloud"
	"edge_server/go_core/internal/runtime"
	"edge_server/go_core/internal/source"
)

type sourceManagerExecutor struct {
	sources *source.Manager
}

func (e *sourceManagerExecutor) ExecuteCommand(ctx context.Context, req runtime.CommandExecutionRequest) (runtime.CommandExecutionResult, error) {
	srcReq := source.CommandRequest{
		DeviceID: req.DeviceID,
		Command:  string(req.CommandType),
		Value:    req.Value,
	}

	srcRes, err := e.sources.ExecuteCommand(ctx, srcReq)
	
	return runtime.CommandExecutionResult{
		DeviceID: srcRes.DeviceID,
		Command:  cloud.CommandType(srcRes.Command),
		Status:   cloud.CommandTerminalStatus(srcRes.Status),
		Reason:   srcRes.Reason,
	}, err
}
