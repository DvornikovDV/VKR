# Contract: Local Hardware Adapter Boundary

## Purpose

Define the strict local boundary between the Go edge runtime core and the future Rust hardware-facing worker. The contract is transport-neutral in the planning phase so it can later ride on gRPC over loopback TCP or a framed stdio or pipe transport after the spike closes.

## Ownership split

- Go runtime core owns:
  - cloud connectivity and trust lifecycle handling
  - reconnect credential persistence
  - batching, buffering, backlog replay, and telemetry gating
  - operator-visible runtime state
  - worker supervision
- Rust worker owns:
  - hardware discovery and transport access
  - protocol-specific polling behavior
  - normalization of raw device values into contract-level readings
  - future command execution boundary, kept disabled in MVP

## Contract rules

- The worker must never receive cloud secrets or speak to `cloud_server` directly.
- The Go core must not encode protocol-specific polling logic for real hardware.
- The boundary must support replacement of a mock adapter with a Rust worker without changing the cloud-facing contract.

## Required message families

### 1. Worker identity and health

#### `WorkerHello`

| Field | Type | Notes |
|---|---|---|
| `adapterId` | string | Stable worker identifier |
| `adapterKind` | string | `mock`, `serial-modbus`, or another future adapter family |
| `version` | string | Worker build/version marker |
| `capabilities.polling` | boolean | Must be `true` for MVP |
| `capabilities.control` | boolean | Must be `false` for MVP |

#### `WorkerHeartbeat`

| Field | Type | Notes |
|---|---|---|
| `adapterId` | string | Worker identifier |
| `state` | `starting \| running \| degraded \| stopped` | Health state |
| `ts` | integer | Unix milliseconds |
| `message` | string or null | Optional operator-facing note |

### 2. Source definition lifecycle

#### `ApplySources`

Sent from Go to the worker when the stable source config changes or when the worker starts.

| Field | Type | Notes |
|---|---|---|
| `revision` | string | Config revision or hash |
| `sources[]` | array | Polling source definitions from the stable config |

#### `SourcesApplied`

Sent from the worker after validation.

| Field | Type | Notes |
|---|---|---|
| `revision` | string | Must match the applied request |
| `accepted` | boolean | Whether the worker accepted the full set |
| `errors[]` | array | Validation or startup errors per source |

### 3. Polled telemetry delivery

#### `PolledReadings`

Sent from the worker to the Go core.

| Field | Type | Notes |
|---|---|---|
| `sourceId` | string | Originating source |
| `readings[]` | array | Normalized telemetry samples |

Each reading uses:

| Field | Type | Notes |
|---|---|---|
| `deviceId` | string | Runtime-local identity |
| `metric` | string | Canonical metric name for cloud |
| `value` | `number \| boolean` | Sample value |
| `ts` | integer | Unix milliseconds timestamp |
| `quality` | string or null | Optional local quality hint |

Runtime rules:

- The worker may continue polling while the Go core is temporarily disconnected from cloud.
- The Go core alone decides whether readings are emitted, buffered, or discarded.

### 4. Source and worker error reporting

#### `SourceFault`

| Field | Type | Notes |
|---|---|---|
| `sourceId` | string | Affected source |
| `severity` | `warning \| error` | Fault importance |
| `code` | string | Adapter-specific error code |
| `message` | string | Human-readable summary |
| `ts` | integer | Unix milliseconds |

Runtime rules:

- Source faults update operator-visible status but do not change cloud lifecycle state by themselves.

### 5. Reserved future control messages

The boundary reserves, but does not enable in MVP:

- `ControlRequest`
- `ControlResult`

Rules:

- Workers must advertise `capabilities.control = false` in MVP.
- Go may define the message schema now, but any runtime invocation must return `unsupported`.

## Transport selection gate

The transport chosen in implementation must:

- work on Windows and Linux
- support streaming telemetry batches
- support process replacement and reconnection
- preserve message ordering per worker session
- keep supervision simple from the Go core

Until that gate closes, this message contract is the stable design artifact and the Go mock adapter is the default implementation path.
