# Contract: Cloud-Facing Edge Runtime Boundary

## Purpose

Define the exact consumer-facing cloud contract for the future Go edge runtime in `001-edge-runtime`.

This document intentionally freezes only:

- `socket.handshake.auth`
- `edge_activation`
- `edge_disconnect`
- `connect_error`
- `telemetry { readings[] }`

Anything else already present in cloud, including subscriber-facing `edge_status`, is outside this runtime-facing baseline.

## Authority and cross-check rules

Authoritative references for this boundary:

- `specs/004-edge-onboarding/contracts/edge-socket-contract.md`
- `specs/004-edge-onboarding/contracts/lifecycle-state-machine.md`
- `cloud_server/src/socket/events/edge.ts`
- `cloud_server/src/socket/events/telemetry.ts`

Cross-checked development examples only:

- `edge_server/src/transport/cloudSocketClient.ts`

The TypeScript files under `edge_server/src` are development examples and migration aids only. They are not the source of truth and may be removed once Go contract parity exists.

## Ownership rules

- The Go runtime core is the only local component allowed to speak this cloud boundary.
- The Rust worker never connects to cloud directly.
- `cloud_server` remains the only authority for lifecycle meaning, onboarding acceptance, reconnect rejection, block, trust revoke, and forced disconnect semantics.

## Transport

- Namespace: `/edge`
- Protocol: Socket.IO
- Authentication source: `socket.handshake.auth` only

## Handshake payload

Use `socket.handshake.auth` exactly as defined below.

| Field | Type | Required | Notes |
|---|---|---|---|
| `edgeId` | string | yes | Stable cloud-issued edge identifier |
| `credentialMode` | `onboarding \| persistent` | yes | Determines which credential path cloud validates |
| `credentialSecret` | string | yes | One-time onboarding secret or persistent reconnect secret |

If any required field is missing or invalid, cloud rejects the connection with `connect_error = invalid_credential`.

## Server-to-runtime events

### `edge_activation`

Emitted only after successful onboarding or re-onboarding.

```json
{
  "edgeId": "507f1f77bcf86cd799439011",
  "lifecycleState": "Active",
  "persistentCredential": {
    "version": 2,
    "secret": "plain-text-secret-issued-once",
    "issuedAt": "2026-04-05T10:00:00.000Z"
  }
}
```

Runtime rules:

- Persist the new reconnect credential locally before treating future restarts as trusted reconnects.
- Replace any previous reconnect credential with the newly issued one.
- Reject the payload locally if `edgeId` does not match the expected runtime edge id.

### `edge_disconnect`

Emitted immediately before server-side forced disconnect.

```json
{
  "edgeId": "507f1f77bcf86cd799439011",
  "reason": "trust_revoked"
}
```

Current reasons emitted by cloud:

- `trust_revoked`
- `blocked`
- `edge_forced_disconnect`

Runtime rules:

- Stop trusted telemetry immediately.
- Persist the operator-visible reason.
- Invalidate any backlog collected under the now-lost trusted session.

### `connect_error`

Current rejection codes emitted by cloud:

- `edge_not_found`
- `blocked`
- `onboarding_not_allowed`
- `onboarding_package_missing`
- `onboarding_package_expired`
- `onboarding_package_reused`
- `invalid_credential`
- `persistent_credential_revoked`
- `edge_auth_internal_error`

Runtime rules:

- Treat rejected reconnects as untrusted outcomes.
- Persist the rejection code locally for operator guidance.
- Treat `edge_auth_internal_error` as a cloud-side auth failure even though the current TypeScript development example does not enumerate it.

## Runtime-to-cloud telemetry event

Event name: `telemetry`

Payload shape accepted by the current cloud runtime:

```json
{
  "readings": [
    {
      "deviceId": "pump-1",
      "metric": "pressure",
      "value": 4.2,
      "ts": 1762336800000
    }
  ]
}
```

Validation and delivery rules:

- Emit telemetry only while the runtime holds an active trusted session.
- `readings[]` is the only cloud-accepted batch envelope in scope for this baseline.
- Each reading must contain `deviceId`, `metric`, `value`, and `ts`.
- `value` may be numeric or boolean.
- Cloud identity is derived from `edgeId + deviceId`; `deviceId` is unique only within one edge runtime.
- During a connectivity-only interruption, the runtime may continue polling locally and buffer canonical readings in memory.
- After trusted session restoration, replay buffered readings in chronological order before resuming live telemetry.
- Discard buffered readings if trust is revoked, the edge is blocked, a forced disconnect occurs, or reconnect is rejected.

## MVP telemetry defaults

These defaults are runtime-local starting values for `001-edge-runtime`. They are documented here as the baseline the future Go runtime should implement first; they are not cloud-side limits.

They are inferred from the current repository state:

- `cloud_server/src/services/telemetry-aggregator.service.ts` drains cloud rollups on a `1000 ms` cadence
- `edge_telemetry_test/src/index.ts` emits a small fixed batch every `500 ms`
- `cloud_server/src/socket/events/telemetry.ts` accepts canonical `readings[]` arrays without server-negotiated batch sizing

| Setting | Default | Rationale |
|---|---|---|
| `flushIntervalMs` | `1000` | Align the first runtime baseline with the existing cloud aggregator cadence and keep first accepted telemetry well inside the 60-second success criterion |
| `maxBatchReadings` | `100` | Keep emitted batches bounded and simple for MVP while remaining comfortably above the existing smoke payload size |
| `backlogMaxReadings` | `1000` | Keep best-effort replay bounded in memory without turning backlog into durable storage |
| `backlogOverflowBehavior` | `drop_oldest` | Preserve chronological order for retained backlog and keep newest readings available after a long interruption |

Overflow rules:

- When the in-memory backlog reaches `backlogMaxReadings`, the runtime drops the oldest buffered readings first.
- The runtime must surface an operator-visible overflow outcome.
- The remaining backlog must stay chronologically ordered by sample timestamp.

## Non-goals of this boundary

- It does not define how the Go runtime talks to local hardware.
- It does not define operator UI or local control APIs.
- It does not redefine lifecycle states already owned by `004-edge-onboarding`.
