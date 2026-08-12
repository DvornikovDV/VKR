# Data Model: Production-Shaped Local Edge Runtime

## 1. Edge Runtime Config

Stable operator-owned configuration that survives onboarding, reconnect rotation, trust revoke, and re-onboarding.

| Field | Type | Notes |
|---|---|---|
| `cloud.url` | string | Base `cloud_server` URL for Socket.IO edge connectivity |
| `cloud.namespace` | string | Defaults to `/edge` and must match the cloud contract |
| `stateDir` | string | Directory holding machine-written runtime files |
| `batch.intervalMs` | integer | Telemetry batch cadence while trusted |
| `batch.maxReadings` | integer | Upper bound per emitted batch |
| `reconnect.maxAttempts` | integer | Retry policy for connectivity-only interruptions |
| `reconnect.baseDelayMs` | integer | Initial reconnect backoff |
| `reconnect.maxDelayMs` | integer | Reconnect backoff ceiling |
| `adapter.mode` | `mock-internal \| worker-process` | Selects the local adapter implementation |
| `adapter.endpoint` | string or null | Process command or local endpoint for an external worker |
| `sources[]` | `PollingSourceDefinition[]` | Stable source definitions for one edge runtime |
| `logging.level` | `debug \| info \| warn \| error` | Operator-facing logging verbosity |

### Validation rules

- Config changes must not be required just because reconnect credentials rotate.
- `sources[]` may contain multiple devices and multiple metrics per device.
- Source definitions remain hardware-agnostic at the feature level; adapter-specific connection details stay nested inside each source entry.

## 2. Operator Bootstrap Package

First-use operator input consumed only when no valid persisted reconnect credential is available.

| Field | Type | Notes |
|---|---|---|
| `edgeId` | string | Stable edge identifier issued by cloud |
| `onboardingSecret` | string | One-time secret from `004-edge-onboarding` |
| `issuedAt` | ISO datetime | Disclosure time from cloud |
| `expiresAt` | ISO datetime | Package expiry time from cloud |

### Validation rules

- The package is never persisted as the trusted reconnect state.
- If a valid persisted reconnect credential exists, the runtime prefers it over a bootstrap package during normal restart.

## 3. Persisted Reconnect Credential

Rotatable machine-written state used for trusted reconnects.

| Field | Type | Notes |
|---|---|---|
| `edgeId` | string | Must match the edge identity accepted by cloud |
| `credentialMode` | `persistent` | Canonical reconnect mode after successful onboarding |
| `credentialSecret` | string | Rotated reconnect secret |
| `version` | integer | Increments after successful onboarding or re-onboarding |
| `issuedAt` | ISO datetime | When cloud issued the reconnect credential |
| `lifecycleState` | `Active` | Persisted to confirm the credential came from an accepted activation |

### Validation rules

- A persisted credential without `credentialMode = persistent` is invalid.
- A persisted credential without `lifecycleState = Active` is invalid.
- A newly accepted activation replaces any previous reconnect credential.

## 4. Runtime State Snapshot

Machine-written persistent state that survives normal restart and records operator-relevant trust outcomes.

| Field | Type | Notes |
|---|---|---|
| `trustMode` | `awaiting_onboarding \| trusted_reconnect_ready \| connectivity_buffering \| recovery_needed \| blocked \| re_onboarding_required` | Local runtime view derived from cloud outcomes plus local readiness |
| `lastOutcome` | string | Most recent operator-visible outcome such as `trusted_reconnect_succeeded` or `blocked` |
| `lastCloudErrorCode` | string or null | Latest normalized cloud rejection code when present |
| `lastDisconnectReason` | string or null | Latest disconnect or forced-disconnect reason |
| `lastTrustedSessionAt` | ISO datetime or null | Timestamp of latest trusted session start |
| `lastTelemetryAt` | ISO datetime or null | Timestamp of latest telemetry emission accepted by the runtime |
| `sourceConfigRevision` | string or integer | Links runtime state to the stable source definition version |
| `adapterMode` | `mock-internal \| worker-process` | Which adapter implementation was last active |

### Validation rules

- `lastOutcome` and `lastDisconnectReason` persist across restart until superseded.
- Backlog payload data is not required to survive restart, but trust/readiness state is.
- `blocked` and `recovery_needed` must prevent trusted telemetry until a valid cloud path succeeds.

## 5. Polling Source Definition

Stable configuration for one logical polling source inside the edge runtime.

| Field | Type | Notes |
|---|---|---|
| `sourceId` | string | Stable local identifier for one source definition |
| `adapterKind` | string | High-level adapter family such as `mock`, `serial-modbus`, or another future protocol |
| `enabled` | boolean | Runtime may keep disabled sources without deleting them |
| `pollIntervalMs` | integer | Desired polling cadence |
| `connection` | object | Adapter-specific connection data such as serial port, USB path, or slave address |
| `devices[]` | `LocalDeviceDefinition[]` | Device and metric mappings exposed by this source |

### Local Device Definition

| Field | Type | Notes |
|---|---|---|
| `deviceId` | string | Must be unique only within one edge runtime |
| `address` | object | Adapter-specific addressing metadata |
| `metrics[]` | `MetricDefinition[]` | Metrics to poll and normalize |

### Metric Definition

| Field | Type | Notes |
|---|---|---|
| `metric` | string | Canonical metric key sent to cloud |
| `valueType` | `number \| boolean` | Matches the current cloud telemetry expectations |
| `mapping` | object | Adapter-specific register/path extraction rules |

### Validation rules

- `deviceId` uniqueness is runtime-local, not global.
- Adapter-specific connection and mapping fields must stay nested so the feature does not hardcode one protocol family.
- Recovery or re-onboarding must not require recreating unchanged source definitions.

## 6. Normalized Reading And Cloud Telemetry Batch

### Adapter Reading

| Field | Type | Notes |
|---|---|---|
| `sourceId` | string | Originating source |
| `deviceId` | string | Runtime-local device identity |
| `metric` | string | Canonical metric key |
| `value` | `number \| boolean` | Current sampled value |
| `ts` | integer | Unix milliseconds timestamp for the sample |
| `quality` | string or null | Optional local quality hint, not required by cloud MVP |

### Cloud Telemetry Sample

| Field | Type | Notes |
|---|---|---|
| `deviceId` | string | Runtime-local identity combined with `edgeId` by cloud |
| `metric` | string | Canonical metric key |
| `value` | `number \| boolean` | Sample value |
| `ts` | integer | Unix milliseconds timestamp |

### Cloud Telemetry Batch

| Field | Type | Notes |
|---|---|---|
| `readings[]` | `CloudTelemetrySample[]` | Exact cloud-facing payload already accepted by `cloud_server` |

### Validation rules

- Only trusted sessions may emit cloud telemetry batches.
- Buffered backlog must replay in chronological timestamp order before live batches.
- Readings collected under an invalidated trusted session must not be replayed after trust revoke, block, forced disconnect, or reconnect rejection.

## 7. Backlog Entry

Ephemeral in-memory state used only during connectivity-only interruptions.

| Field | Type | Notes |
|---|---|---|
| `sessionEpoch` | integer | Monotonic trusted-session identifier assigned by the Go core |
| `sample` | `CloudTelemetrySample` | Canonical payload-ready sample |
| `queuedAt` | ISO datetime | When the runtime buffered the sample locally |

### Validation rules

- Backlog entries belong to exactly one trusted session epoch.
- When the epoch becomes invalid due to trust loss, all entries for that epoch are discarded.
- Backlog entries do not need durable persistence across restart.

## 8. Adapter Session Snapshot

Runtime-local status for one active adapter implementation.

| Field | Type | Notes |
|---|---|---|
| `adapterId` | string | Stable worker or mock adapter identifier |
| `state` | `starting \| running \| degraded \| stopped` | Worker health state |
| `capabilities` | object | Advertises polling support and future control placeholders |
| `lastHeartbeatAt` | ISO datetime or null | Latest worker heartbeat |
| `lastError` | string or null | Latest adapter-specific failure visible to operators |

### Validation rules

- Adapter health is separate from trust state.
- Rust worker capability advertisement must not imply that control is enabled in MVP.

## 9. Operator Status Snapshot

Optional machine-written summary for minimal local support.

| Field | Type | Notes |
|---|---|---|
| `edgeId` | string | Runtime identity |
| `trustMode` | string | Same high-level readiness state shown locally |
| `cloudConnection` | `disconnected \| connecting \| trusted \| rejected` | Current cloud session status |
| `adapterState` | string | Current adapter health |
| `bufferedReadings` | integer | Current in-memory backlog size |
| `lastReason` | string or null | Latest operator-relevant stop or recovery reason |
| `updatedAt` | ISO datetime | Snapshot timestamp |

### Validation rules

- This snapshot is informative only and never becomes a second source of lifecycle truth.
- Secrets must not be written into the status snapshot.
