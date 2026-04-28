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

type modbusRegisterClient interface {
	Open() error
	Close() error
	ReadRegister(address uint16, registerType modbus.RegType) (uint16, error)
}

type modbusSerialClientFactory func(connection modbusSerialConnection) (modbusRegisterClient, error)

type modbusSerialConnection struct {
	port     string
	baudRate uint
	dataBits uint
	parity   uint
	stopBits uint
	slaveID  uint8
	timeout  time.Duration
}

type modbusMetricMapping struct {
	deviceID     string
	metric       string
	valueType    string
	registerType modbus.RegType
	address      uint16
	scale        float64
}

type ModbusSerialAdapter struct {
	mu            sync.RWMutex
	transactionMu sync.Mutex
	clientFactory modbusSerialClientFactory
	now           func() time.Time
	sourceID      string
	sink          Sink
	client        modbusRegisterClient
	mappings      []modbusMetricMapping
	cancel        context.CancelFunc
	closed        bool
}

func NewModbusSerialAdapter() *ModbusSerialAdapter {
	return newModbusSerialAdapterWithFactory(newSimonvetterModbusClient, time.Now)
}

func newModbusSerialAdapterWithFactory(factory modbusSerialClientFactory, now func() time.Time) *ModbusSerialAdapter {
	if now == nil {
		now = time.Now
	}

	return &ModbusSerialAdapter{
		clientFactory: factory,
		now:           now,
		closed:        true,
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
	mappings, err := parseModbusMappings(definition.Devices)
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
	a.closed = true
	a.mu.Unlock()

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
		a.transactionMu.Unlock()

		ts := a.now().UnixMilli()
		if readErr != nil {
			sink.PublishFault(Fault{
				SourceID: sourceID,
				Severity: SeverityError,
				Code:     modbusReadFaultCode(readErr),
				Message:  fmt.Sprintf("modbus read failed for device %q metric %q: %v", mapping.deviceID, mapping.metric, readErr),
				TS:       ts,
			})
			continue
		}

		sink.PublishReading(RawReading{
			SourceID: sourceID,
			DeviceID: mapping.deviceID,
			Metric:   mapping.metric,
			Value:    convertModbusValue(value, mapping),
			TS:       ts,
		})
		published++
	}

	return published, nil
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

	return modbusSerialConnection{
		port:     port,
		baudRate: baudRate,
		dataBits: dataBits,
		parity:   parity,
		stopBits: stopBits,
		slaveID:  uint8(slaveID),
		timeout:  time.Duration(timeoutMs) * time.Millisecond,
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

func parseModbusMappings(devices []DeviceDefinition) ([]modbusMetricMapping, error) {
	if len(devices) == 0 {
		return nil, fmt.Errorf("modbus serial devices must not be empty")
	}

	mappings := make([]modbusMetricMapping, 0)
	for i, device := range devices {
		deviceID := strings.TrimSpace(device.DeviceID)
		if deviceID == "" {
			return nil, fmt.Errorf("devices[%d].deviceId is required", i)
		}
		if len(device.Metrics) == 0 {
			return nil, fmt.Errorf("devices[%d].metrics must not be empty", i)
		}

		for j, metric := range device.Metrics {
			metricID := strings.TrimSpace(metric.Metric)
			if metricID == "" {
				return nil, fmt.Errorf("devices[%d].metrics[%d].metric is required", i, j)
			}
			if metric.ValueType != "number" && metric.ValueType != "boolean" {
				return nil, fmt.Errorf("devices[%d].metrics[%d].valueType must be number or boolean", i, j)
			}

			registerType, err := parseRegisterType(metric.Mapping["registerType"])
			if err != nil {
				return nil, fmt.Errorf("devices[%d].metrics[%d].mapping.registerType: %w", i, j, err)
			}
			address, err := requiredUintRange(metric.Mapping, "address", "mapping.address", 0, 65535)
			if err != nil {
				return nil, fmt.Errorf("devices[%d].metrics[%d].%w", i, j, err)
			}
			scale, err := optionalScale(metric.Mapping["scale"])
			if err != nil {
				return nil, fmt.Errorf("devices[%d].metrics[%d].mapping.scale must be a number", i, j)
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
	}

	return mappings, nil
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
