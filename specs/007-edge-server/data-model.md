# Data Model: Edge-Owned Local Runtime For `007-edge-server`

This data model covers only edge-owned local artifacts and transient runtime state. It does not restate cloud-owned edge records or cloud-owned lifecycle contracts.

## 1. Operator Config File: `edge-runtime.yaml`

Stable operator-managed configuration that the runtime reads at process startup. The implemented runtime reload surface is limited to replacing the installed `credential.json`; it does not watch or hot-reload `edge-runtime.yaml` source definitions.

| Field | Type | Notes |
|---|---|---|
| `runtime.edgeId` | string | Stable cloud-issued edge identifier expected by the credential file and websocket handshake |
| `runtime.stateDir` | string | Directory for runtime-managed `credential.json`, `runtime-state.json`, and `status.json` files |
| `runtime.instanceName` | string | Optional operator-friendly local name for Windows service logs and diagnostics |
| `cloud.url` | string | Base `cloud_server` URL used for Socket.IO `/edge` connectivity |
| `cloud.namespace` | string | Must remain `/edge` |
| `cloud.connectTimeoutMs` | integer | Handshake timeout |
| `cloud.reconnect.baseDelayMs` | integer | Initial reconnect delay for retryable failures |
| `cloud.reconnect.maxDelayMs` | integer | Maximum reconnect backoff |
| `cloud.reconnect.maxAttempts` | integer | Optional bounded retry cap for startup loops |
| `batch.intervalMs` | integer | Telemetry flush cadence |
| `batch.maxReadings` | integer | Upper bound for a single emitted batch |
| `logging.level` | `debug \| info \| warn \| error` | Runtime log verbosity |
| `sources[]` | `SourceConfig[]` | Applied local source/controller definitions |

### Validation rules

- `runtime.edgeId` must be non-empty and must match `credential.json.edgeId`.
- `cloud.namespace` must equal `/edge`.
- `cloud.url` must be an HTTP or HTTPS base URL compatible with the Socket.IO transport.
- `sources[]` must not be empty for the telemetry baseline.
- The runtime rejects startup when no enabled source definitions remain after validation.

## 2. Source Config

One stable source/controller definition applied by the runtime to a local adapter.

| Field | Type | Notes |
|---|---|---|
| `sourceId` | string | Stable local source identifier |
| `adapterKind` | string | Production adapter family such as `modbus_rtu`, plus `mock` only for non-production harnesses |
| `enabled` | boolean | Allows retaining disabled definitions without deleting them |
| `pollIntervalMs` | integer | Requested polling cadence |
| `connection` | object | Adapter-specific connection details. The implemented `modbus_rtu` adapter reads `port`, `baudRate`, `dataBits`, `parity`, `stopBits`, `slaveId`, and `timeoutMs` from this object |
| `devices[]` | `LocalDeviceConfig[]` | Device definitions exposed through this source |

### Validation rules

- `sourceId` must be unique within the runtime config.
- `pollIntervalMs` must be positive for enabled sources.
- Adapter-specific connection fields remain nested and enabled definitions are validated by the adapter implementation.
- `adapterKind` identifies a protocol/transport family, not a specific Arduino wiring scheme or one controller register layout.

## 3. Local Device Config

| Field | Type | Notes |
|---|---|---|
| `deviceId` | string | Stable device identity unique within one edge runtime |
| `address` | object | Optional adapter-specific device metadata. The implemented `modbus_rtu` path does not read this field; it uses `connection.slaveId` and each metric `mapping.address` |
| `metrics[]` | `MetricConfig[]` | Metric mappings polled for this device |

### Validation rules

- `deviceId` must be unique across all configured sources inside one runtime.
- The runtime owns only per-edge uniqueness, not global uniqueness.

## 4. Metric Config

| Field | Type | Notes |
|---|---|---|
| `metric` | string | Stable metric identity unique within the parent device |
| `valueType` | `number \| boolean` | Matches the cloud telemetry baseline |
| `mapping` | object | Adapter-specific register/path extraction settings |

### Validation rules

- `metric` must be non-empty.
- `valueType` must be `number` or `boolean`.
- The adapter validates `mapping` according to `adapterKind`.
- For `modbus_rtu`, `mapping.registerType` must identify the Modbus register table, `mapping.address` must be the zero-based register address.
- `mapping.dataType` is optional adapter-validated metric-read metadata that interprets the raw register (e.g. `uint16`, `int16`). It is never exposed as Cloud telemetry.
- Optional `mapping.scale` is applied before emitting numeric telemetry. If `scale` is omitted, the implemented adapter uses `1`.
- For `modbus_rtu` boolean metrics, register value `0` maps to `false` and non-zero maps to `true`.

## 5. Credential File: `credential.json`

Current persistent credential installed on the edge machine by the operator after register, rotate, or unblock.

| Field | Type | Notes |
|---|---|---|
| `edgeId` | string | Must match the runtime config and cloud edge identity |
| `credentialSecret` | string | Current cloud-issued persistent secret |
| `version` | integer | Monotonic credential version from cloud |
| `issuedAt` | ISO datetime | Credential issuance time |
| `source` | `register \| rotate \| unblock` | Local trace of why this credential was installed |
| `installedAt` | ISO datetime | When the operator or installer placed the file locally |

### Validation rules

- `credentialSecret` must be non-empty.
- `version` must be positive.
- The runtime must use only the current file contents for handshake authorization.
- The secret must never be copied into `runtime-state.json` or `status.json`.

## 6. Runtime State File: `runtime-state.json`

Durable runtime-owned snapshot used for restart diagnostics and operator interpretation.

| Field | Type | Notes |
|---|---|---|
| `edgeId` | string | Runtime identity |
| `credentialVersion` | integer or null | Version from the currently loaded credential file |
| `credentialStatus` | `loaded \| missing \| rejected \| superseded \| blocked` | Local interpretation of the installed credential |
| `sessionState` | `startup \| connecting \| trusted \| retry_wait \| operator_action_required \| stopped` | Current runtime phase |
| `authOutcome` | `never_attempted \| accepted \| invalid_credential \| blocked \| edge_not_found \| edge_auth_internal_error \| credential_rotated \| disconnected` | Last normalized cloud-facing or runtime trust outcome |
| `retryEligible` | boolean | Whether automatic reconnect may continue without operator intervention |
| `lastConnectAttemptAt` | ISO datetime or null | Latest handshake attempt |
| `lastTrustedSessionAt` | ISO datetime or null | Latest accepted trusted session start |
| `lastDisconnectAt` | ISO datetime or null | Latest disconnect observed |
| `lastDisconnectReason` | string or null | Last normalized disconnect reason |
| `lastTelemetrySentAt` | ISO datetime or null | Latest successful telemetry emit time |
| `sourceConfigRevision` | string | Hash or revision derived from the active source definitions |
| `updatedAt` | ISO datetime | File update timestamp |

### Validation rules

- `edgeId` must remain consistent with config and credential files.
- `retryEligible = false` for `blocked`, `invalid_credential`, `edge_not_found`, and credential-replacement outcomes until operator action occurs.
- Partial source failure may remain a local degradation condition without changing `credentialStatus` or forcing `sessionState = operator_action_required`.

## 7. Operator Status File: `status.json`

Fast, operator-visible snapshot intended for local inspection, service wrappers, or support tooling.

| Field | Type | Notes |
|---|---|---|
| `edgeId` | string | Runtime identity |
| `runtimeStatus` | `starting \| connecting \| trusted \| retrying \| degraded \| blocked \| waiting_for_credential \| stopped` | Local operator-facing summary |
| `cloudConnection` | `disconnected \| connecting \| trusted \| rejected` | Current websocket state |
| `authSummary` | `ok \| retryable_disconnect \| invalid_credential \| blocked \| edge_not_found \| credential_replaced \| internal_error` | Simplified auth/trust explanation |
| `retryEligible` | boolean | Whether the runtime is auto-retrying |
| `loadedCredentialVersion` | integer or null | Version currently loaded into memory |
| `sourceSummary` | `healthy \| degraded \| failed` | Aggregate local source state accepted by the status schema and operator projection helpers |
| `lastTelemetrySentAt` | ISO datetime or null | Latest successful telemetry send |
| `lastReason` | string or null | Human-readable short reason for the current state |
| `updatedAt` | ISO datetime | Snapshot timestamp |

### Validation rules

- The file must not contain credential secrets.
- `runtimeStatus = degraded` is allowed by the status schema and projection helpers while `cloudConnection = trusted`.
- `runtimeStatus = blocked` represents a local reflection of a cloud-owned outcome, not edge-owned lifecycle authority.
- The current `runtimeapp` status projector persists runtime-state transitions with `sourceSummary = healthy`; source health degradation is maintained by the source manager and can be projected when a caller supplies a degraded or failed source summary.

## 8. Transient In-Memory Session State

Not persisted as-is, but required for runtime behavior.

| Field | Type | Notes |
|---|---|---|
| `sessionEpoch` | integer | Monotonic identifier for the currently accepted trusted session |
| `socketState` | `disconnected \| connecting \| trusted` | Live websocket status |
| `connectAttempt` | integer | Current reconnect attempt counter |
| `currentCredential` | `LoadedCredential` or null | Parsed credential currently used for handshake |
| `retryTimer` | duration or null | Active retry backoff state |
| `pendingBatch` | `TelemetryReading[]` | Current batch not yet emitted |
| `sourceHealth` | map by `sourceId` | Live health and fault summary per source in the source manager |
| `adapterHandles` | map by `sourceId` | Active adapter instances |

### Validation rules

- `sessionEpoch` increments only after an accepted trusted session.
- Pending telemetry tied to a stale `sessionEpoch` must be discarded.
- Loss of one source must not invalidate `currentCredential` or the whole trusted session by itself.

## 9. Loaded Credential

Parsed in-memory representation derived from `credential.json`.

| Field | Type | Notes |
|---|---|---|
| `edgeId` | string | Edge identity |
| `credentialSecret` | string | Secret currently used for connect attempts |
| `version` | integer | Current credential version |
| `issuedAt` | time | Parsed issuance time |
| `source` | string | Local installation origin |

### Validation rules

- Only one loaded credential may exist at a time.
- A newly installed file fully replaces the previous loaded credential.

## 10. Adapter Health Snapshot

Per-source transient state exposed by the source manager and accepted by operator projection helpers.

| Field | Type | Notes |
|---|---|---|
| `sourceId` | string | Source identifier |
| `state` | `running \| degraded \| failed \| stopped` | Local adapter health exposed by the source manager |
| `lastReadingAt` | ISO datetime or null | Latest successful reading |
| `lastFaultCode` | string or null | Latest adapter fault code |
| `lastFaultAt` | ISO datetime or null | Latest adapter fault timestamp |
| `consecutiveFaults` | integer | Rolling local fault count |

### Validation rules

- `degraded` and `failed` are local source states only.
- Multiple adapter failures may lead to zero emitted readings while the trusted cloud session still remains connected.

## 11. Normalized Telemetry Reading

Runtime-local reading already validated for cloud emission.

| Field | Type | Notes |
|---|---|---|
| `deviceId` | string | Stable per-edge device identity |
| `metric` | string | Stable metric identity within the device |
| `value` | `number \| boolean` | Normalized telemetry value |
| `ts` | integer | Unix milliseconds timestamp |
| `sourceId` | string | Local source lineage only, not part of the cloud wire contract |

### Validation rules

- `deviceId` and `metric` must be non-empty.
- `value` must be number or boolean.
- `ts` must be positive.
- Cloud emission strips `sourceId` from the wire payload.

## 12. Local Source Fault

Local degradation signal emitted by a controller adapter.

| Field | Type | Notes |
|---|---|---|
| `sourceId` | string | Faulted source |
| `severity` | `warning \| error` | Local importance |
| `code` | string | Adapter-specific fault code |
| `message` | string | Human-readable explanation |
| `ts` | integer | Unix milliseconds |

### Validation rules

- Source faults update source-manager health. Operator status projection can map supplied source health into `sourceSummary`, but the current `runtimeapp` persistence path does not automatically rewrite `status.json` from source faults.
- Source faults do not directly change cloud lifecycle, credential validity, or availability semantics.

## 13. Deferred Local Artifacts

The following artifacts are intentionally not part of the baseline model:

- durable telemetry backlog files
- replay journals
- alarm state snapshots
- control queues
- worker-process IPC sessions and supervisor records

They are deferred safely because the telemetry-only baseline requires only config, current credential, operator-visible local status, and transient trusted-session behavior.
