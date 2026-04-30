package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
	"strings"

	"edge_server/go_core/internal/config"
	"edge_server/go_core/internal/source"
)

type edgeControlOptions struct {
	configPath string
	deviceID   string
	command    string
	value      bool
}

type edgeControlDependencies struct {
	loadConfig func(path string) (config.Config, error)
	factories  source.FactoryRegistry
}

type commandResultOutput struct {
	DeviceID string               `json:"deviceId"`
	Command  string               `json:"command"`
	Status   source.CommandStatus `json:"status"`
	Reason   string               `json:"reason,omitempty"`
}

func main() {
	code := runEdgeControl(context.Background(), os.Args[1:], os.Stdout, os.Stderr, edgeControlDependencies{})
	os.Exit(code)
}

func runEdgeControl(ctx context.Context, args []string, stdout io.Writer, stderr io.Writer, deps edgeControlDependencies) int {
	options, err := parseEdgeControlArgs(args, stderr)
	if err != nil {
		fmt.Fprintf(stderr, "edge-control: %v\n", err)
		return 2
	}

	if deps.loadConfig == nil {
		deps.loadConfig = config.LoadFromFile
	}
	if len(deps.factories) == 0 {
		deps.factories = edgeControlSourceFactories()
	}

	result, err := executeLocalCommand(ctx, options, deps)
	if err != nil {
		fmt.Fprintf(stderr, "edge-control: %v\n", err)
		return 1
	}

	output := commandResultOutput{
		DeviceID: result.DeviceID,
		Command:  result.Command,
		Status:   result.Status,
		Reason:   result.Reason,
	}
	if err := json.NewEncoder(stdout).Encode(output); err != nil {
		fmt.Fprintf(stderr, "edge-control: write command result: %v\n", err)
		return 1
	}

	if result.Status != source.CommandStatusConfirmed {
		return 1
	}

	return 0
}

func parseEdgeControlArgs(args []string, stderr io.Writer) (edgeControlOptions, error) {
	fs := flag.NewFlagSet("edge-control", flag.ContinueOnError)
	fs.SetOutput(stderr)

	configPath := fs.String("config", "", "Path to operator-provided runtime config YAML")
	deviceID := fs.String("device", "", "Device id that owns the command")
	command := fs.String("command", "", "Command type to execute")
	value := fs.String("value", "", "Command value")

	if err := fs.Parse(args); err != nil {
		return edgeControlOptions{}, err
	}

	options := edgeControlOptions{
		configPath: strings.TrimSpace(*configPath),
		deviceID:   strings.TrimSpace(*deviceID),
		command:    strings.TrimSpace(*command),
	}
	valueRaw := strings.TrimSpace(*value)

	if options.configPath == "" {
		return edgeControlOptions{}, fmt.Errorf("--config is required")
	}
	if options.deviceID == "" {
		return edgeControlOptions{}, fmt.Errorf("--device is required")
	}
	if options.command == "" {
		return edgeControlOptions{}, fmt.Errorf("--command is required")
	}
	if options.command != "set_bool" {
		return edgeControlOptions{}, fmt.Errorf("--command must be set_bool")
	}
	if valueRaw == "" {
		return edgeControlOptions{}, fmt.Errorf("--value is required")
	}
	switch strings.ToLower(valueRaw) {
	case "true":
		options.value = true
	case "false":
		options.value = false
	default:
		return edgeControlOptions{}, fmt.Errorf("--value must be true or false for set_bool")
	}

	return options, nil
}

func executeLocalCommand(ctx context.Context, options edgeControlOptions, deps edgeControlDependencies) (source.CommandResult, error) {
	cfg, err := deps.loadConfig(options.configPath)
	if err != nil {
		return source.CommandResult{}, fmt.Errorf("load config: %w", err)
	}

	manager := source.NewManager(deps.factories)
	defer manager.ApplyDefinitions(nil)

	if _, err := manager.ApplyDefinitions(source.DefinitionsFromConfig(cfg.Sources)); err != nil {
		return source.CommandResult{}, fmt.Errorf("apply source definitions: %w", err)
	}

	result, err := manager.ExecuteCommand(ctx, source.CommandRequest{
		DeviceID: options.deviceID,
		Command:  options.command,
		Value:    options.value,
	})
	if err != nil {
		return source.CommandResult{}, fmt.Errorf("execute command: %w", err)
	}

	return result, nil
}

func edgeControlSourceFactories() source.FactoryRegistry {
	return source.FactoryRegistry{
		source.ModbusRTUKind: func() (source.Adapter, error) {
			return source.NewModbusSerialAdapter(), nil
		},
	}
}
