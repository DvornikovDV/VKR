# Protocol Adapter And Mapping Boundary

## Purpose

This note makes the local Edge adapter boundary explicit for Arduino stands, Modbus controllers, and later controller families.

The key rule is:

**A new physical wiring scheme or controller register layout must not require a new Edge adapter. A new adapter is required only when the protocol or transport family changes.**

## Existing Context

The current cursed and 007 drafts already contain parts of this decision:

- `doc_cursed/edge_control_plan.md` says physical Modbus registers must not be hardcoded into server code and must live in local Edge configuration.
- `specs/007-edge-server/contracts/local-source-adapter.md` defines the local source adapter boundary and says adapters receive `connection`, `devices`, and per-metric `mapping`.
- `specs/007-edge-server/data-model.md` keeps adapter-specific connection, device address, and metric mapping fields nested inside local source configuration.

This document adds the explicit reuse rule for different Arduino sketches, Modbus devices, and future controllers.

## Boundary Rule

An adapter owns protocol mechanics:

- opening and closing the local connection;
- serializing protocol transactions;
- reading protocol addresses or paths;
- writing protocol addresses or paths when control is in scope;
- converting protocol values into normalized Edge readings;
- reporting local source faults.

Operator-managed source configuration owns equipment meaning:

- which local source exists;
- which controller or bus endpoint it uses;
- which devices are exposed;
- which metrics each device has;
- which protocol address or path backs each metric;
- which command writes map to which control address;
- register payload interpretation, including `mapping.dataType`;
- scaling, range, and type conversion rules.

Cloud-facing telemetry owns only normalized identity and value:

- `edgeId`;
- `deviceId`;
- `metric`;
- `value`;
- `ts`.

Protocol addresses, Modbus register numbers, serial ports, and controller-specific paths must not leak into the cloud payload.

## What Changes For A New Arduino Wiring Scheme

If an Arduino sketch exposes a different set of sensors or actuators but still speaks Modbus RTU over USB serial, the Edge adapter remains `modbus_rtu` or `modbus-serial`.

Only source configuration changes:

- `devices[]`;
- `metrics[]`;
- command definitions;
- `mapping.registerType`;
- `mapping.address`;
- `scale`;
- min/max limits;
- reported-state binding.

The adapter must not contain code such as `if deviceId == "pump_main"` or `if address == 0xA0` for a specific demo stand. It may validate generic Modbus concepts such as register type, address range, slave id, timeout, and supported function codes.

## What Changes For Another Modbus Controller

Another controller on Modbus RTU uses the same adapter if the transport and protocol family are still compatible.

Examples:

- Arduino Uno over USB serial, 9600 8N1, slave id 1;
- an RS-485 Modbus RTU PLC through a USB-RS485 adapter;
- a commercial Modbus RTU sensor block with a different slave id and register map.

All of these can use one adapter family if the adapter supports the required connection settings and Modbus function codes. The source config changes port, baud rate, slave id, devices, and register mappings.

## What Requires A New Adapter

A new adapter is justified when the runtime must speak a different acquisition/control family, for example:

- `modbus_rtu` or `modbus-serial`: serial Modbus RTU;
- `modbus_tcp`: Modbus TCP over Ethernet;
- `opc_ua`: OPC UA server browsing and reads;
- `mqtt`: topic subscription and payload decoding;
- `mock`: non-production test harness.

The normalized telemetry contract should remain unchanged when adding one of these adapters.

## Modbus Adapter Responsibilities

For the Arduino engineering stand and other Modbus RTU devices, the Modbus adapter should:

- load `connection` settings such as port, baud rate, data bits, parity, stop bits, slave id, and timeout;
- group or sequence reads based on configured metrics;
- read input registers for reported state and telemetry;
- write holding registers for commands when control is enabled;
- confirm command execution by observing the configured reported-state metric from the normal polling loop, not by treating the command holding-register write as physical success;
- apply scale and type conversion;
- keep all transactions on one serial connection serialized through a mutex or worker loop;
- emit normalized readings with stable `deviceId` and `metric`;
- emit source faults for timeout, CRC, port open, or mapping validation failures.

The adapter should not know the Arduino pin map, DHT11 details, RGB LED pins, or the semantic names of the engineering stand. Those belong to firmware and local Edge configuration.

## Configuration Shape

The source config is the contract that makes the adapter reusable:

```yaml
sources:
  - sourceId: arduino_stand
    adapterKind: modbus_rtu
    enabled: true
    pollIntervalMs: 1000
    connection:
      port: "COM3"
      baudRate: 9600
      dataBits: 8
      parity: none
      stopBits: 1
      slaveId: 1
      timeoutMs: 500
    devices:
      - deviceId: environment
        metrics:
          - metric: temperature
            valueType: number
            mapping:
              registerType: input
              address: 0
              dataType: int16
              scale: 0.1
          - metric: humidity
            valueType: number
            mapping:
              registerType: input
              address: 1
              scale: 0.1
      - deviceId: pump_main
        metrics:
          - metric: actual_state
            valueType: boolean
            mapping:
              registerType: input
              address: 16
        commands:
          - commandType: set_bool
            registerType: holding
            address: 160
            reportedMetric: actual_state
```

The same adapter can run another Modbus RTU controller by replacing only the source definition:

```yaml
sources:
  - sourceId: boiler_controller
    adapterKind: modbus_rtu
    enabled: true
    pollIntervalMs: 1000
    connection:
      port: "COM7"
      baudRate: 19200
      dataBits: 8
      parity: even
      stopBits: 1
      slaveId: 3
      timeoutMs: 500
    devices:
      - deviceId: boiler
        metrics:
          - metric: pressure
            valueType: number
            mapping:
              registerType: holding
              address: 400
              scale: 0.01
```

## Firmware Responsibility

Controller firmware owns the physical behavior behind its protocol surface:

- reading sensors;
- debouncing local inputs;
- driving output pins;
- applying local override behavior;
- exposing actual state through reported registers or protocol fields.

Edge does not need to know how the controller implements those behaviors. Edge only needs a stable, documented protocol surface and a source mapping that translates that surface into logical telemetry and commands.

## Design Consequence

The extension model is:

1. New Arduino wiring with Modbus RTU: update firmware register map and Edge YAML mapping.
2. New Modbus RTU controller: update Edge YAML mapping and connection settings.
3. New protocol or transport: add a new adapter family, preserve normalized telemetry.
4. New cloud/UI feature: consume `deviceId + metric` and command metadata, not raw controller addresses.

This keeps Edge independent from one Arduino demo while still allowing the Arduino stand to be the first real hardware slice.
