# Contract: Cloud-Facing Edge Runtime Boundary For `006-edge-runtime-windows-mvp`

## Purpose

Define the exact cloud-facing contract used by `006-edge-runtime-windows-mvp`.

This delivery slice is a minimal working implementation subset of `001-edge-runtime`, so the contract below must remain compatible with the accepted cloud-facing semantics of `001-edge-runtime`.

This document freezes only:

- `socket.handshake.auth`
- `edge_activation`
- `edge_disconnect`
- `connect_error`
- runtime-visible socket disconnect handling
- `telemetry { readings[] }`

## Authority

Authoritative references:

- `specs/004-edge-onboarding/contracts/edge-socket-contract.md`
- `specs/004-edge-onboarding/contracts/lifecycle-state-machine.md`
- `cloud_server/src/socket/events/edge.ts`
- `cloud_server/src/socket/events/telemetry.ts`

This document narrows runtime behavior for MVP delivery, but it does not redefine cloud lifecycle meaning.

## Ownership Rules

- The Go runtime core is the only local component allowed to speak this boundary.
- Local source implementations never connect to cloud directly.
- Cloud remains the only authority for onboarding acceptance, reconnect rejection, revoke, block, re-enable, and forced disconnect semantics.

## Transport

- Namespace: `/edge`
- Protocol: Socket.IO
- Authentication source: `socket.handshake.auth`

## Handshake Payload

| Field | Type | Required | Notes |
|---|---|---|---|
| `edgeId` | string | yes | Stable cloud-issued edge identifier |
| `credentialMode` | `onboarding \| persistent` | yes | Determines which cloud credential path is being used |
| `credentialSecret` | string | yes | One-time onboarding secret or in-memory persistent reconnect secret |

Runtime rules:

- `credentialMode = onboarding` is used for first onboarding and fresh re-onboarding.
- `credentialMode = persistent` is used only while the current process still holds a valid in-memory reconnect secret.
- The MVP does not persist reconnect secrets across process restart.

## Server-To-Runtime Events

### `edge_activation`

Emitted only after successful onboarding or successful fresh re-onboarding.

```json
{
  "edgeId": "507f1f77bcf86cd799439011",
  "lifecycleState": "Active",
  "persistentCredential": {
    "version": 2,
    "secret": "plain-text-secret-issued-once",
    "issuedAt": "2026-04-06T10:00:00.000Z"
  }
}
```

Runtime rules:

- Accept only when `edgeId` matches the expected runtime edge ID.
- Accept only when `lifecycleState = Active`.
- Retain the returned persistent reconnect secret in process memory only.
- Do not treat this event as permission to write local credential files in this MVP.

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
- Mark the running process untrusted.
- Require a valid future trust path before telemetry may resume.

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

- Treat every rejected connect attempt as untrusted.
- Do not emit telemetry after a rejected reconnect.
- Preserve the rejection reason in process-local runtime state for logs and runtime decisions.

### Ordinary socket disconnect

The runtime must also react to ordinary socket disconnects even when no `edge_disconnect` payload was emitted first.

Runtime rules:

- Set the current connection state to disconnected immediately.
- Stop trusted telemetry immediately.
- Allow reconnect attempts only if the running process still holds valid in-memory reconnect material and cloud later accepts it.

## Runtime-To-Cloud Telemetry Event

Event name: `telemetry`

Payload shape:

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

- Emit telemetry only while the runtime is both trusted and currently connected.
- Each reading must contain `deviceId`, `metric`, `value`, and `ts`.
- `value` may be numeric or boolean.
- Cloud identity is derived from `edgeId + deviceId`.
- When the runtime is disconnected or untrusted, it drops new readings instead of buffering them in this MVP.

## MVP Telemetry Defaults

| Setting | Default |
|---|---|
| `batch.intervalMs` | `1000` |
| `batch.maxReadings` | `100` |

## Non-Goals Of This Boundary

- It does not define local runtime files.
- It does not define backlog or replay because those are not part of this MVP.
- It does not define external Rust worker transport.
- It does not enable device control.
