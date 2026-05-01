package source

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"math"
	"net"
	"strings"
	"sync"
	"time"

	"github.com/simonvetter/modbus"
)

const ModbusRTUKind = "modbus_rtu"

const (
	modbusCommandConfirmationObservationCount = 2
	modbusCommandConfirmationTimeout          = 3 * time.Second
	modbusCommandForcedPollAttempts           = 2
	modbusObservationHistoryLimit             = 32
)

type modbusRegisterClient interface {
	Open() error
	Close() error
	ReadRegister(address uint16, registerType modbus.RegType) (uint16, error)
	WriteRegister(address uint16, value uint16) error
}

type modbusSerialClientFactory func(connection modbusSerialConnection) (modbusRegisterClient, error)

type modbusSerialConnection struct {
	port        string
	baudRate    uint
	dataBits    uint
	parity      uint
	stopBits    uint
	slaveID     uint8
	timeout     time.Duration
	settleDelay time.Duration
}

type ModbusRegisterClient = modbusRegisterClient

type ModbusSerialConnection = modbusSerialConnection

type ModbusSerialClientFactory = modbusSerialClientFactory

var defaultModbusSerialClient = struct {
	mu      sync.RWMutex
	factory modbusSerialClientFactory
	now     func() time.Time
}{
	factory: newSimonvetterModbusClient,
	now:     time.Now,
}

type modbusMetricMapping struct {
	deviceID     string
	metric       string
	valueType    string
	registerType modbus.RegType
	address      uint16
	scale        float64
}

type modbusCommandMapping struct {
	deviceID       string
	command        string
	registerType   modbus.RegType
	address        uint16
	reportedMetric string
}

type modbusObservationKey struct {
	deviceID string
	metric   string
}

type modbusObservation struct {
	sequence uint64
	value    any
}

type modbusObservationState struct {
	sequence uint64
	history  []modbusObservation
}

type ModbusSerialAdapter struct {
	mu                  sync.RWMutex
	transactionMu       sync.Mutex
	commandMu           sync.Mutex
	clientFactory       modbusSerialClientFactory
	now                 func() time.Time
	sourceID            string
	sink                Sink
	client              modbusRegisterClient
	mappings            []modbusMetricMapping
	commandMappings     []modbusCommandMapping
	commandObservations map[modbusObservationKey]modbusObservationState
	observationNotify   chan struct{}
	cancel              context.CancelFunc
	closed              bool
}

func NewModbusSerialAdapter() *ModbusSerialAdapter {
	factory, now := currentModbusSerialDefaults()
	return newModbusSerialAdapterWithFactory(factory, now)
}

func OverrideModbusSerialClientFactoryForTest(factory ModbusSerialClientFactory, now func() time.Time) func() {
	defaultModbusSerialClient.mu.Lock()
	previousFactory := defaultModbusSerialClient.factory
	previousNow := defaultModbusSerialClient.now
	defaultModbusSerialClient.factory = factory
	if now == nil {
		defaultModbusSerialClient.now = time.Now
	} else {
		defaultModbusSerialClient.now = now
	}
	defaultModbusSerialClient.mu.Unlock()

	return func() {
		defaultModbusSerialClient.mu.Lock()
		defaultModbusSerialClient.factory = previousFactory
		defaultModbusSerialClient.now = previousNow
		defaultModbusSerialClient.mu.Unlock()
	}
}

func currentModbusSerialDefaults() (modbusSerialClientFactory, func() time.Time) {
	defaultModbusSerialClient.mu.RLock()
	defer defaultModbusSerialClient.mu.RUnlock()

	return defaultModbusSerialClient.factory, defaultModbusSerialClient.now
}

func newModbusSerialAdapterWithFactory(factory modbusSerialClientFactory, now func() time.Time) *ModbusSerialAdapter {
	if now == nil {
		now = time.Now
	}

	return &ModbusSerialAdapter{
		clientFactory:       factory,
		now:                 now,
		commandObservations: make(map[modbusObservationKey]modbusObservationState),
		observationNotify:   make(chan struct{}),
		closed:              true,
	}
}

func (a *ModbusSerialAdapter) ApplyDefinition(definition Definition, sink Sink) error {
	if a.clientFactory == nil {
		return fmt.Errorf("modbus serial client factory is required")
	}
	if sink == nil {
		return fmt.Errorf("modbus serial sink is required")
	}

	sourceID := strings.TrimSpace(definition.SourceID)
	if sourceID == "" {
		return fmt.Errorf("modbus serial sourceId is required")
	}
	if strings.TrimSpace(definition.AdapterKind) != ModbusRTUKind {
		return fmt.Errorf("modbus serial adapter requires adapterKind %q", ModbusRTUKind)
	}

	connection, err := parseModbusSerialConnection(definition.Connection)
	if err != nil {
		return err
	}
	mappings, commandMappings, err := parseModbusMappings(definition.Devices)
	if err != nil {
		return err
	}

	client, err := a.clientFactory(connection)
	if err != nil {
		return fmt.Errorf("create modbus serial client: %w", err)
	}
	if client == nil {
		return fmt.Errorf("modbus serial client factory returned nil client")
	}
	if err := client.Open(); err != nil {
		return fmt.Errorf("open modbus serial connection: %w", err)
	}
	if connection.settleDelay > 0 {
		time.Sleep(connection.settleDelay)
	}

	a.resetCommandObservations()

	a.mu.Lock()
	if a.cancel != nil {
		a.cancel()
		a.cancel = nil
	}
	oldClient := a.client
	ctx, cancel := context.WithCancel(context.Background())
	a.sourceID = sourceID
	a.sink = sink
	a.client = client
	a.mappings = mappings
	a.commandMappings = commandMappings
	a.cancel = cancel
	a.closed = false
	a.mu.Unlock()

	if oldClient != nil {
		a.transactionMu.Lock()
		_ = oldClient.Close()
		a.transactionMu.Unlock()
	}

	interval := time.Duration(definition.PollIntervalMs) * time.Millisecond
	go a.run(ctx, interval)

	return nil
}

func (a *ModbusSerialAdapter) Close() error {
	a.mu.Lock()
	if a.cancel != nil {
		a.cancel()
		a.cancel = nil
	}
	client := a.client
	a.client = nil
	a.sink = nil
	a.mappings = nil
	a.commandMappings = nil
	a.closed = true
	a.mu.Unlock()

	a.resetCommandObservations()

	if client == nil {
		return nil
	}

	a.transactionMu.Lock()
	defer a.transactionMu.Unlock()

	return client.Close()
}

func (a *ModbusSerialAdapter) run(ctx context.Context, interval time.Duration) {
	if interval <= 0 {
		interval = time.Second
	}

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	_, _ = a.pollOnce()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			_, _ = a.pollOnce()
		}
	}
}

func (a *ModbusSerialAdapter) pollOnce() (int, error) {
	sourceID, sink, client, mappings, err := a.snapshot()
	if err != nil {
		return 0, err
	}

	published := 0
	for _, mapping := range mappings {
		a.transactionMu.Lock()
		value, readErr := client.ReadRegister(mapping.address, mapping.registerType)

		ts := a.now().UnixMilli()
		if readErr != nil {
			a.transactionMu.Unlock()
			sink.PublishFault(Fault{
				SourceID: sourceID,
				Severity: SeverityError,
				Code:     modbusReadFaultCode(readErr),
				Message:  fmt.Sprintf("modbus read failed for device %q metric %q: %v", mapping.deviceID, mapping.metric, readErr),
				TS:       ts,
			})
			continue
		}

		converted := convertModbusValue(value, mapping)
		a.recordReportedMetricObservation(mapping.deviceID, mapping.metric, converted)
		a.transactionMu.Unlock()
		sink.PublishReading(RawReading{
			SourceID: sourceID,
			DeviceID: mapping.deviceID,
			Metric:   mapping.metric,
			Value:    converted,
			TS:       ts,
		})
		published++
	}

	return published, nil
}

func (a *ModbusSerialAdapter) ExecuteCommand(ctx context.Context, request CommandRequest) (CommandResult, error) {
	if ctx == nil {
		ctx = context.Background()
	}

	normalized := CommandRequest{
		DeviceID: strings.TrimSpace(request.DeviceID),
		Command:  strings.TrimSpace(request.Command),
		Value:    request.Value,
	}
	result := CommandResult{
		DeviceID: normalized.DeviceID,
		Command:  normalized.Command,
		Status:   CommandStatusFailed,
	}
	if err := ctx.Err(); err != nil {
		result.Reason = err.Error()
		return result, nil
	}

	client, commandMapping, ok, err := a.commandSnapshot(normalized.DeviceID, normalized.Command)
	if err != nil {
		result.Reason = err.Error()
		return result, nil
	}
	if !ok {
		result.Reason = "command target is not configured"
		return result, nil
	}

	value, ok := normalized.Value.(bool)
	if !ok {
		result.Reason = "set_bool value must be boolean"
		return result, nil
	}

	writeValue := uint16(0)
	if value {
		writeValue = 1
	}

	observationKey := modbusObservationKey{deviceID: commandMapping.deviceID, metric: commandMapping.reportedMetric}
	a.transactionMu.Lock()
	err = client.WriteRegister(commandMapping.address, writeValue)
	observationMarker := uint64(0)
	if err == nil {
		observationMarker = a.currentObservationSequence(observationKey)
	}
	a.transactionMu.Unlock()
	if err != nil {
		result.Reason = fmt.Sprintf("write modbus command: %v", err)
		return result, nil
	}

	for i := 0; i < modbusCommandForcedPollAttempts; i++ {
		if ctxErr := ctx.Err(); ctxErr != nil {
			result.Reason = ctxErr.Error()
			return result, nil
		}
		_, _ = a.pollOnce()
	}

	return a.waitForCommandConfirmation(ctx, result, observationKey, observationMarker, value), nil
}

func (a *ModbusSerialAdapter) snapshot() (string, Sink, modbusRegisterClient, []modbusMetricMapping, error) {
	a.mu.RLock()
	defer a.mu.RUnlock()

	if a.closed || a.client == nil || a.sink == nil {
		return "", nil, nil, nil, fmt.Errorf("modbus serial adapter is not running")
	}

	mappings := append([]modbusMetricMapping(nil), a.mappings...)
	return a.sourceID, a.sink, a.client, mappings, nil
}

func (a *ModbusSerialAdapter) commandSnapshot(deviceID string, command string) (modbusRegisterClient, modbusCommandMapping, bool, error) {
	a.mu.RLock()
	defer a.mu.RUnlock()

	if a.closed || a.client == nil {
		return nil, modbusCommandMapping{}, false, fmt.Errorf("modbus serial adapter is not running")
	}

	for _, commandMapping := range a.commandMappings {
		if commandMapping.deviceID == deviceID && commandMapping.command == command {
			return a.client, commandMapping, true, nil
		}
	}

	return a.client, modbusCommandMapping{}, false, nil
}

func (a *ModbusSerialAdapter) recordReportedMetricObservation(deviceID string, metric string, value any) {
	key := modbusObservationKey{deviceID: deviceID, metric: metric}

	a.commandMu.Lock()
	defer a.commandMu.Unlock()

	state := a.commandObservations[key]
	state.sequence++
	state.history = append(state.history, modbusObservation{
		sequence: state.sequence,
		value:    value,
	})
	if len(state.history) > modbusObservationHistoryLimit {
		state.history = append([]modbusObservation(nil), state.history[len(state.history)-modbusObservationHistoryLimit:]...)
	}
	a.commandObservations[key] = state
	a.notifyCommandObservationLocked()
}

func (a *ModbusSerialAdapter) currentObservationSequence(key modbusObservationKey) uint64 {
	a.commandMu.Lock()
	defer a.commandMu.Unlock()

	return a.commandObservations[key].sequence
}

func (a *ModbusSerialAdapter) waitForCommandConfirmation(ctx context.Context, result CommandResult, key modbusObservationKey, marker uint64, expected bool) CommandResult {
	waitCtx, cancel := context.WithTimeout(ctx, modbusCommandConfirmationTimeout)
	defer cancel()

	matchingObservations := 0
	seen := marker
	for {
		a.commandMu.Lock()
		state := a.commandObservations[key]
		for _, observation := range state.history {
			if observation.sequence <= seen {
				continue
			}
			seen = observation.sequence
			observed, ok := observation.value.(bool)
			if ok && observed == expected {
				matchingObservations++
			} else {
				matchingObservations = 0
			}
		}
		if matchingObservations >= modbusCommandConfirmationObservationCount {
			a.commandMu.Unlock()
			result.Status = CommandStatusConfirmed
			return result
		}
		notify := a.observationNotify
		a.commandMu.Unlock()

		select {
		case <-notify:
		case <-waitCtx.Done():
			result.Status = CommandStatusTimeout
			result.Reason = "timed out waiting for reported metric confirmation"
			if err := waitCtx.Err(); err != nil {
				result.Reason = fmt.Sprintf("%s: %v", result.Reason, err)
			}
			return result
		}
	}
}

func (a *ModbusSerialAdapter) resetCommandObservations() {
	a.commandMu.Lock()
	defer a.commandMu.Unlock()

	a.commandObservations = make(map[modbusObservationKey]modbusObservationState)
	a.notifyCommandObservationLocked()
}

func (a *ModbusSerialAdapter) notifyCommandObservationLocked() {
	close(a.observationNotify)
	a.observationNotify = make(chan struct{})
}

func newSimonvetterModbusClient(connection modbusSerialConnection) (modbusRegisterClient, error) {
	client, err := modbus.NewClient(&modbus.ClientConfiguration{
		URL:      "rtu://" + connection.port,
		Speed:    connection.baudRate,
		DataBits: connection.dataBits,
		Parity:   connection.parity,
		StopBits: connection.stopBits,
		Timeout:  connection.timeout,
		Logger:   log.New(io.Discard, "", 0),
	})
	if err != nil {
		return nil, err
	}
	if err := client.SetUnitId(connection.slaveID); err != nil {
		return nil, err
	}

	return &simonvetterModbusClient{client: client}, nil
}

type simonvetterModbusClient struct {
	client *modbus.ModbusClient
}

func (c *simonvetterModbusClient) Open() error {
	return c.client.Open()
}

func (c *simonvetterModbusClient) Close() error {
	return c.client.Close()
}

func (c *simonvetterModbusClient) ReadRegister(address uint16, registerType modbus.RegType) (uint16, error) {
	return c.client.ReadRegister(address, registerType)
}

func (c *simonvetterModbusClient) WriteRegister(address uint16, value uint16) error {
	return c.client.WriteRegister(address, value)
}

func parseModbusSerialConnection(raw map[string]any) (modbusSerialConnection, error) {
	port, err := requiredString(raw, "port", "connection.port")
	if err != nil {
		return modbusSerialConnection{}, err
	}
	baudRate, err := requiredPositiveUint(raw, "baudRate", "connection.baudRate")
	if err != nil {
		return modbusSerialConnection{}, err
	}
	dataBits, err := requiredUintRange(raw, "dataBits", "connection.dataBits", 5, 8)
	if err != nil {
		return modbusSerialConnection{}, err
	}
	parity, err := parseParity(raw["parity"])
	if err != nil {
		return modbusSerialConnection{}, err
	}
	stopBits, err := requiredUintRange(raw, "stopBits", "connection.stopBits", 1, 2)
	if err != nil {
		return modbusSerialConnection{}, err
	}
	slaveID, err := requiredUintRange(raw, "slaveId", "connection.slaveId", 1, 247)
	if err != nil {
		return modbusSerialConnection{}, err
	}
	timeoutMs, err := requiredPositiveUint(raw, "timeoutMs", "connection.timeoutMs")
	if err != nil {
		return modbusSerialConnection{}, err
	}
	settleDelayMs, err := optionalUintRange(raw, "settleDelayMs", "connection.settleDelayMs", 0, 60000)
	if err != nil {
		return modbusSerialConnection{}, err
	}

	return modbusSerialConnection{
		port:        port,
		baudRate:    baudRate,
		dataBits:    dataBits,
		parity:      parity,
		stopBits:    stopBits,
		slaveID:     uint8(slaveID),
		timeout:     time.Duration(timeoutMs) * time.Millisecond,
		settleDelay: time.Duration(settleDelayMs) * time.Millisecond,
	}, nil
}

func parseParity(raw any) (uint, error) {
	value, ok := raw.(string)
	if !ok || strings.TrimSpace(value) == "" {
		return 0, fmt.Errorf("connection.parity is required")
	}

	switch strings.ToLower(strings.TrimSpace(value)) {
	case "none":
		return modbus.PARITY_NONE, nil
	case "even":
		return modbus.PARITY_EVEN, nil
	case "odd":
		return modbus.PARITY_ODD, nil
	default:
		return 0, fmt.Errorf("connection.parity must be none, even, or odd")
	}
}

func parseModbusMappings(devices []DeviceDefinition) ([]modbusMetricMapping, []modbusCommandMapping, error) {
	if len(devices) == 0 {
		return nil, nil, fmt.Errorf("modbus serial devices must not be empty")
	}

	mappings := make([]modbusMetricMapping, 0)
	commandMappings := make([]modbusCommandMapping, 0)
	for i, device := range devices {
		deviceID := strings.TrimSpace(device.DeviceID)
		if deviceID == "" {
			return nil, nil, fmt.Errorf("devices[%d].deviceId is required", i)
		}
		if len(device.Metrics) == 0 {
			return nil, nil, fmt.Errorf("devices[%d].metrics must not be empty", i)
		}

		metricTypes := make(map[string]string, len(device.Metrics))
		for j, metric := range device.Metrics {
			metricID := strings.TrimSpace(metric.Metric)
			if metricID == "" {
				return nil, nil, fmt.Errorf("devices[%d].metrics[%d].metric is required", i, j)
			}
			if metric.ValueType != "number" && metric.ValueType != "boolean" {
				return nil, nil, fmt.Errorf("devices[%d].metrics[%d].valueType must be number or boolean", i, j)
			}
			if _, exists := metricTypes[metricID]; exists {
				return nil, nil, fmt.Errorf("duplicate metric %q for device %q", metricID, deviceID)
			}
			metricTypes[metricID] = metric.ValueType

			registerType, err := parseRegisterType(metric.Mapping["registerType"])
			if err != nil {
				return nil, nil, fmt.Errorf("devices[%d].metrics[%d].mapping.registerType: %w", i, j, err)
			}
			address, err := requiredUintRange(metric.Mapping, "address", "mapping.address", 0, 65535)
			if err != nil {
				return nil, nil, fmt.Errorf("devices[%d].metrics[%d].%w", i, j, err)
			}
			scale, err := optionalScale(metric.Mapping["scale"])
			if err != nil {
				return nil, nil, fmt.Errorf("devices[%d].metrics[%d].mapping.scale must be a number", i, j)
			}

			mappings = append(mappings, modbusMetricMapping{
				deviceID:     deviceID,
				metric:       metricID,
				valueType:    metric.ValueType,
				registerType: registerType,
				address:      uint16(address),
				scale:        scale,
			})
		}

		for j, command := range device.Commands {
			parsed, err := parseModbusCommandMapping(i, j, deviceID, command, metricTypes)
			if err != nil {
				return nil, nil, err
			}
			commandMappings = append(commandMappings, parsed)
		}
	}

	return mappings, commandMappings, nil
}

func parseModbusCommandMapping(deviceIndex int, commandIndex int, deviceID string, command CommandDefinition, metricTypes map[string]string) (modbusCommandMapping, error) {
	field := fmt.Sprintf("devices[%d].commands[%d]", deviceIndex, commandIndex)
	commandType := strings.TrimSpace(command.Command)
	if commandType == "" {
		return modbusCommandMapping{}, fmt.Errorf("%s.command is required", field)
	}
	if commandType != "set_bool" {
		return modbusCommandMapping{}, fmt.Errorf("%s.command must be set_bool", field)
	}

	registerType, err := parseRegisterType(command.Mapping["registerType"])
	if err != nil {
		return modbusCommandMapping{}, fmt.Errorf("%s.mapping.registerType: %w", field, err)
	}
	if registerType != modbus.HOLDING_REGISTER {
		return modbusCommandMapping{}, fmt.Errorf("%s.mapping.registerType must be holding", field)
	}
	address, err := requiredUintRange(command.Mapping, "address", "mapping.address", 0, 65535)
	if err != nil {
		return modbusCommandMapping{}, fmt.Errorf("%s.%w", field, err)
	}

	reportedMetric := strings.TrimSpace(command.ReportedMetric)
	if reportedMetric == "" {
		return modbusCommandMapping{}, fmt.Errorf("%s.reportedMetric is required", field)
	}
	valueType, exists := metricTypes[reportedMetric]
	if !exists {
		return modbusCommandMapping{}, fmt.Errorf("%s.reportedMetric must reference a device metric", field)
	}
	if valueType != "boolean" {
		return modbusCommandMapping{}, fmt.Errorf("%s.reportedMetric must reference a boolean metric", field)
	}

	return modbusCommandMapping{
		deviceID:       deviceID,
		command:        commandType,
		registerType:   registerType,
		address:        uint16(address),
		reportedMetric: reportedMetric,
	}, nil
}

func parseRegisterType(raw any) (modbus.RegType, error) {
	value, ok := raw.(string)
	if !ok || strings.TrimSpace(value) == "" {
		return 0, fmt.Errorf("registerType is required")
	}

	switch strings.ToLower(strings.TrimSpace(value)) {
	case "input":
		return modbus.INPUT_REGISTER, nil
	case "holding":
		return modbus.HOLDING_REGISTER, nil
	default:
		return 0, fmt.Errorf("registerType must be input or holding")
	}
}

func convertModbusValue(value uint16, mapping modbusMetricMapping) any {
	if mapping.valueType == "boolean" {
		return value != 0
	}

	return float64(value) * mapping.scale
}

func optionalScale(raw any) (float64, error) {
	if raw == nil {
		return 1, nil
	}

	scale, ok := numberAsFloat64(raw)
	if !ok {
		return 0, fmt.Errorf("invalid scale")
	}

	return scale, nil
}

func requiredString(raw map[string]any, key string, field string) (string, error) {
	value, ok := raw[key].(string)
	if !ok || strings.TrimSpace(value) == "" {
		return "", fmt.Errorf("%s is required", field)
	}

	return strings.TrimSpace(value), nil
}

func requiredPositiveUint(raw map[string]any, key string, field string) (uint, error) {
	value, err := requiredUintRange(raw, key, field, 1, 4294967295)
	if err != nil {
		return 0, err
	}

	return uint(value), nil
}

func optionalUintRange(raw map[string]any, key string, field string, min uint, max uint) (uint, error) {
	if _, exists := raw[key]; !exists {
		return 0, nil
	}

	return requiredUintRange(raw, key, field, min, max)
}

func requiredUintRange(raw map[string]any, key string, field string, min uint, max uint) (uint, error) {
	valueRaw, exists := raw[key]
	if !exists {
		return 0, fmt.Errorf("%s is required", field)
	}

	value, ok := numberAsFloat64(valueRaw)
	if !ok || math.Trunc(value) != value {
		return 0, fmt.Errorf("%s must be an integer", field)
	}
	if value < float64(min) || value > float64(max) {
		if min == 1 && max == math.MaxUint32 {
			return 0, fmt.Errorf("%s must be positive", field)
		}
		return 0, fmt.Errorf("%s must be between %d and %d", field, min, max)
	}

	return uint(value), nil
}

func numberAsFloat64(raw any) (float64, bool) {
	switch typed := raw.(type) {
	case int:
		return float64(typed), true
	case int8:
		return float64(typed), true
	case int16:
		return float64(typed), true
	case int32:
		return float64(typed), true
	case int64:
		return float64(typed), true
	case uint:
		return float64(typed), true
	case uint8:
		return float64(typed), true
	case uint16:
		return float64(typed), true
	case uint32:
		return float64(typed), true
	case uint64:
		return float64(typed), true
	case float32:
		return float64(typed), true
	case float64:
		return typed, true
	default:
		return 0, false
	}
}

func modbusReadFaultCode(err error) string {
	var netErr net.Error
	if errors.As(err, &netErr) && netErr.Timeout() {
		return "modbus_timeout"
	}

	return "modbus_read_failed"
}
