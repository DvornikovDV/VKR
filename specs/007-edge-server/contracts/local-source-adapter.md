# Contract: Local Source Adapter Boundary

## Purpose

Define the edge-owned local contract between the production `edge_server` runtime core and source/controller adapters. This contract exists so the runtime can support the first real Windows hardware path without moving protocol logic into cloud-facing packages.

This contract does not redefine any cloud-facing lifecycle, credential, or telemetry semantics. It only defines how local adapters integrate with the runtime.

## Ownership split

- Runtime core owns:
  - loading source config at process startup
  - current credential usage
  - trusted websocket session management
  - telemetry batching and cloud emission
  - exposing local source health for operator projection helpers
- Local adapters own:
  - controller/protocol connection management
  - polling or subscription to local devices
  - translating protocol data into normalized readings
  - reporting local faults without redefining trust

## Contract rules

- Adapters must never receive cloud credentials or cloud lifecycle authority.
- Adapters must never connect directly to `cloud_server`.
- The runtime must be able to replace one adapter implementation with another without changing the cloud-facing payload.
- Partial adapter failure must degrade only the affected source unless the runtime chooses to stop for a separate local fatal error.
- Adapter implementations are protocol/transport families. They must not be created for one Arduino wiring scheme, one register layout, or one logical device set.
- A changed controller layout that still speaks the same protocol must be represented by changed source configuration, not by a new adapter implementation.

## Runtime -> Adapter: `ApplyDefinition`

Applied when the runtime owner applies a source definition set. The current `runtimeapp` process applies `edge-runtime.yaml` once at startup; installed credential reload does not reapply source definitions.

| Field | Type | Notes |
|---|---|---|
| `sourceId` | string | Stable source identifier |
| `adapterKind` | string | Production adapter family such as `modbus_rtu` |
| `pollIntervalMs` | integer | Desired poll cadence |
| `connection` | object | Adapter-specific transport settings |
| `devices[]` | array | Device and metric mappings to expose |

### Device payload

| Field | Type | Notes |
|---|---|---|
| `deviceId` | string | Runtime-local device identity |
| `address` | object | Optional adapter-specific device metadata. The implemented `modbus_rtu` adapter does not read this field |
| `metrics[]` | array | Metric extraction rules |

### Metric payload

| Field | Type | Notes |
|---|---|---|
| `metric` | string | Stable cloud-facing metric name |
| `valueType` | `number \| boolean` | Expected normalized type |
| `mapping` | object | Register/path extraction details |

### Runtime rules

- Reconnect, rotate, block, and unblock do not reauthor unchanged source definitions in the implemented runtime.
- The runtime may skip disabled or invalid source definitions before adapter application.

## Adapter -> Runtime: `NormalizedReading`

Primary telemetry unit emitted by the adapter into the runtime.

| Field | Type | Notes |
|---|---|---|
| `sourceId` | string | Originating source |
| `deviceId` | string | Stable local device identity |
| `metric` | string | Stable local metric identity |
| `value` | `number \| boolean` | Current sampled value |
| `ts` | integer | Unix milliseconds timestamp |

### Runtime rules

- The runtime validates and batches readings before cloud emission.
- The runtime removes `sourceId` from the cloud wire payload.
- If the trusted session is not currently accepted and connected, the runtime must not emit cloud telemetry from these readings.

## Adapter -> Runtime: `SourceFault`

Local degradation signal emitted by the adapter.

| Field | Type | Notes |
|---|---|---|
| `sourceId` | string | Affected source |
| `severity` | `warning \| error` | Local fault importance |
| `code` | string | Adapter-specific code |
| `message` | string | Human-readable explanation |
| `ts` | integer | Unix milliseconds |

### Runtime rules

- `SourceFault` updates source-manager health. Operator status projection helpers can map supplied source health into operator-visible status, but the current `runtimeapp` persistence path does not automatically rewrite `status.json` from source faults.
- `SourceFault` must not directly convert a trusted session into an untrusted session.
- If other sources remain healthy, the runtime continues sending unaffected readings.

## Adapter lifecycle surface

Every adapter implementation must provide the following runtime-facing behavior:

### `ApplyDefinition(definition, sink)`

- Validates the source definition for its `adapterKind`
- Starts or reconfigures local polling/subscription
- Uses `sink` to publish `NormalizedReading` and `SourceFault`

### `Close()`

- Stops local activity for the source
- Releases controller handles and Windows device resources

The implemented adapter interface has no `Health()` method. The source manager infers health from accepted readings and faults.

## First production adapter expectation

The first production adapter family is `modbus_rtu`, representing a Windows-attached Modbus RTU controller path with:

- adapter-level connection settings in `connection`
- optional per-device metadata in `address`; the implemented baseline does not use it for Modbus addressing
- per-metric extraction details in `mapping`
- poll-driven sampling suitable for telemetry-only runtime operation

The adapter must be generic across compatible Modbus RTU controllers. It may validate Modbus concepts such as port settings, slave id, register type, address, quantity, timeout, and supported function codes. It must not hardcode Arduino pin names, DHT11 details, demo device names, or stand-specific register addresses.

The baseline polling implementation may issue one Modbus read per metric mapping. Read-range grouping is a later internal optimization: it may combine adjacent register reads only if it preserves the same normalized readings, source-fault behavior, timeout handling, and cloud payload shape.

### `modbus_rtu` source shape

The baseline `modbus_rtu` adapter expects these connection fields:

| Field | Type | Notes |
|---|---|---|
| `port` | string | Windows serial port such as `COM3` |
| `baudRate` | integer | Serial baud rate, for example `9600` |
| `dataBits` | integer | Usually `8` for the baseline |
| `parity` | `none \| even \| odd` | Serial parity |
| `stopBits` | integer | Usually `1` for the baseline |
| `slaveId` | integer | Modbus RTU slave id |
| `timeoutMs` | integer | Per-transaction timeout |

The baseline `modbus_rtu` adapter expects these metric mapping fields:

| Field | Type | Notes |
|---|---|---|
| `registerType` | `input \| holding` | `input` reads use function 04; `holding` reads use function 03 |
| `address` | integer | Zero-based Modbus register address used by the adapter |
| `dataType` | `uint16 \| int16` | Optional. Interprets the register as unsigned (`uint16`, default) or two's complement (`int16`) |
| `scale` | number, optional | Multiplier applied before emitting numeric telemetry |

For `valueType: boolean`, register value `0` maps to `false` and non-zero maps to `true`.

This keeps the first real hardware path meaningful while still allowing other adapter families later.

## Explicitly out of scope

This contract intentionally excludes:

- cloud handshake or reconnect semantics
- credential rotation distribution
- command/control execution
- durable buffering or replay contracts
- worker-process orchestration details

Those areas belong either to cloud-owned semantics or to later edge follow-up work.
