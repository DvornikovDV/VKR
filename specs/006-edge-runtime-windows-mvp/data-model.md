# Data Model: Windows-Only Narrow MVP Delivery Slice For `001-edge-runtime`

This data model narrows implementation scope for the MVP delivery slice, but it must remain compatible with the accepted lifecycle and telemetry semantics of `001-edge-runtime`.

## 1. Runtime Config

Stable operator-owned configuration used by the Windows runtime.

| Field | Type | Notes |
|---|---|---|
| `cloud.url` | string | Base cloud URL for Socket.IO edge connectivity |
| `cloud.namespace` | string | Must remain `/edge` |
| `batch.intervalMs` | integer | Telemetry flush interval |
| `batch.maxReadings` | integer | Upper bound per emitted batch |
| `sources[]` | `PollingSourceDefinition[]` | Stable local source definitions |
| `logging.level` | `debug \| info \| warn \| error` | Runtime log level |

### Validation rules

- `cloud.namespace` must match the cloud contract.
- `sources[]` may include multiple devices and metrics.
- The config must remain stable across revoke, block, recovery, and fresh onboarding.

## 2. Onboarding Package Input

First-use operator input consumed when the runtime has no valid in-memory persistent reconnect credential.

| Field | Type | Notes |
|---|---|---|
| `edgeId` | string | Stable cloud-issued edge identifier |
| `onboardingSecret` | string | One-time onboarding secret |
| `issuedAt` | ISO datetime | Optional operator-visible issuance timestamp |
| `expiresAt` | ISO datetime | Optional operator-visible expiry timestamp |

### Validation rules

- This package is operator-supplied input, not a machine-written runtime state file.
- A restarted process must not assume it still has trusted reconnect readiness unless a valid onboarding path succeeds again.

## 3. In-Memory Session State

Process-local state for the currently running runtime only.

| Field | Type | Notes |
|---|---|---|
| `edgeId` | string | Edge identity currently being operated |
| `credentialMode` | `onboarding \| persistent \| none` | Which credential path is currently active |
| `persistentCredentialSecret` | string or null | Cloud-issued reconnect secret held only in memory |
| `trusted` | boolean | Whether the runtime may emit telemetry now |
| `connected` | boolean | Whether the socket is currently connected |
| `lastReason` | string or null | Last stop or rejection reason for the running process |
| `sessionEpoch` | integer | Monotonic identifier for the current trusted session |

### Validation rules

- This state is not durable across process restart.
- `trusted` alone is insufficient for telemetry emission; `connected` must also be true.

## 4. Polling Source Definition

Stable configuration for one logical polling source inside the runtime.

| Field | Type | Notes |
|---|---|---|
| `sourceId` | string | Stable local source identifier |
| `adapterKind` | string | `mock` now, future hardware family later |
| `enabled` | boolean | Whether the source should run |
| `pollIntervalMs` | integer | Polling cadence |
| `connection` | object | Adapter-specific connection details |
| `devices[]` | `LocalDeviceDefinition[]` | Devices exposed by this source |

### Local Device Definition

| Field | Type | Notes |
|---|---|---|
| `deviceId` | string | Unique within one edge runtime |
| `address` | object | Adapter-specific addressing |
| `metrics[]` | `MetricDefinition[]` | Metrics to sample |

### Metric Definition

| Field | Type | Notes |
|---|---|---|
| `metric` | string | Canonical metric key |
| `valueType` | `number \| boolean` | Matches current cloud expectations |
| `mapping` | object | Adapter-specific extraction rules |

## 5. Normalized Reading

Local reading already shaped for cloud emission.

| Field | Type | Notes |
|---|---|---|
| `deviceId` | string | Runtime-local device identity |
| `metric` | string | Canonical metric key |
| `value` | `number \| boolean` | Sample value |
| `ts` | integer | Unix milliseconds timestamp |
| `sourceId` | string | Originating source |

### Validation rules

- `deviceId` uniqueness is runtime-local only.
- The runtime may drop readings when disconnected or untrusted.

## 6. Cloud Telemetry Batch

| Field | Type | Notes |
|---|---|---|
| `readings[]` | `CloudTelemetrySample[]` | Exact cloud-facing envelope |

### Cloud Telemetry Sample

| Field | Type | Notes |
|---|---|---|
| `deviceId` | string | Runtime-local identity combined with `edgeId` by cloud |
| `metric` | string | Canonical metric key |
| `value` | `number \| boolean` | Sample value |
| `ts` | integer | Unix milliseconds timestamp |

### Validation rules

- Emit only while the runtime is both trusted and connected.
- No backlog or replay exists in this MVP.

## 7. Source Fault

Optional operator-visible fault from the local source path.

| Field | Type | Notes |
|---|---|---|
| `sourceId` | string | Affected source |
| `severity` | `warning \| error` | Local importance |
| `code` | string | Source-specific fault code |
| `message` | string | Human-readable summary |
| `ts` | integer | Unix milliseconds |

### Validation rules

- Source faults do not redefine cloud lifecycle state.
- One source fault must not imply that all other sources have failed.

## 8. Deferred Models

The following models are intentionally not part of this MVP data model:

- persisted reconnect credential file
- persisted runtime-state snapshot
- persisted operator status snapshot
- backlog entry
- worker heartbeat persistence
