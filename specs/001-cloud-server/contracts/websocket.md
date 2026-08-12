# WebSocket Events Contract (Socket.IO)

## Purpose

Describe the target realtime contract owned by `cloud_server` for:

- Dashboard client subscriptions on the default namespace `/`
- Edge runtime authentication and telemetry on the `/edge` namespace
- Cloud-projected online/offline status propagation for subscribed clients

This document is an implementation-facing companion to:

- `specs/003-dashboard/contracts/runtime-signals.md`
- `specs/007-edge-server/spec.md`

For edge lifecycle meaning and cloud-facing edge trust semantics, `specs/007-edge-server/spec.md` is the semantic authority. This contract translates that model into the cloud-owned realtime surface.

Legacy edge documents from `004-edge-onboarding`, `005-edge-test`, `006-edge-runtime-windows-mvp`, and `001-edge-runtime` may still be consulted as reference material while implementation is migrated, but they are no longer authoritative for the cloud-facing model.

## Transport Overview

- Protocol: Socket.IO v4 over WS/WSS
- Dashboard namespace: `/`
- Edge namespace: `/edge`

## Dashboard Client

### Handshake

Dashboard sockets authenticate with JWT in the Socket.IO `auth` payload.

```js
const socket = io(CLOUD_URL, {
  auth: { token: "Bearer <JWT>" }
});
```

### Emit: `subscribe`

Subscribe to one edge room by `edgeId`.

```json
{ "edgeId": "abc123" }
```

Rules:

- `edgeId` must be a valid edge id
- the authenticated user must belong to `EdgeServer.trustedUsers`
- on success, the socket joins room `<edgeId>`
- on success, server emits `subscribed`
- on authorization or validation failure, server emits `error`

### Listen: `subscribed`

```json
{ "edgeId": "abc123" }
```

### Listen: `telemetry`

Broadcast after a trusted edge emits validated telemetry.

```json
{
  "edgeId": "abc123",
  "readings": [
    {
      "deviceId": "sensor-01",
      "metric": "temperature",
      "last": 85.0,
      "ts": 1763895000000
    }
  ],
  "serverTs": 1763895000200
}
```

Rules:

- only validated readings are forwarded
- within one `edgeId`, reading identity is defined by `deviceId + metric`
- `sourceId` is not emitted to dashboards as part of the canonical runtime event
- `metric` is the current cloud-owned wire field for per-device metric identity
- each reading carries the latest accepted value in `last`
- broadcast happens immediately and does not wait for DB persistence

### Listen: `edge_status`

```json
{
  "edgeId": "abc123",
  "online": true,
  "lastSeenAt": "2026-04-12T11:04:00.000Z"
}
```

Rules:

- `edge_status` reflects cloud-projected availability, not lifecycle state
- first accepted telemetry from a trusted edge emits `online: true`
- trusted disconnect emits `online: false`
- credential rotation or block also results in `online: false` because the active edge socket is forcibly disconnected
- lifecycle state such as `Active` or `Blocked` is a separate cloud concept and is not implied solely by `online`

### Listen: `error`

Examples:

```json
{ "message": "subscribe: edgeId is required" }
```

```json
{ "message": "subscribe: access denied" }
```

## Edge Runtime

### Namespace

Edge runtime connects to `/edge`.

### Handshake

Edge authentication uses `socket.handshake.auth` only.

```js
const socket = io(`${CLOUD_URL}/edge`, {
  auth: {
    edgeId: "abc123",
    credentialSecret: "<SECRET>"
  }
});
```

Handshake fields:

- `edgeId`: stable edge identifier
- `credentialSecret`: current persistent credential secret

Rules:

- missing or invalid fields reject the connection with `invalid_credential`
- Cloud accepts the session only when the edge exists, is in lifecycle state `Active`, and the presented secret matches the current persistent credential
- Cloud permits at most one trusted runtime session per `edgeId`; additional concurrent connect attempts for the same `edgeId` are rejected with `invalid_credential`
- onboarding-package authentication is not part of the active contract
- the edge runtime must not send trusted telemetry until authentication succeeds

### Listen: `edge_disconnect`

Emitted immediately before a forced server-side disconnect.

```json
{
  "edgeId": "abc123",
  "reason": "credential_rotated"
}
```

Known reasons:

- `edge_forced_disconnect`
- `credential_rotated`
- `blocked`

Rules:

- `credential_rotated` means the current credential is no longer valid and operator/runtime must use the newly issued credential path
- `blocked` means Cloud has moved the edge into lifecycle state `Blocked`
- after a forced disconnect, trusted telemetry stops immediately

### Listen: `connect_error`

Connection rejection reasons are normalized to these codes:

- `edge_not_found`
- `blocked`
- `invalid_credential`
- `edge_auth_internal_error`

Rules:

- `edge_not_found` means the presented `edgeId` does not resolve to a known edge record
- `blocked` means the edge exists but lifecycle currently prevents trusted connection
- `invalid_credential` means the edge is not authorized under the current persistent credential
- rejection does not itself change lifecycle state

### Emit: `telemetry`

Trusted edge sockets send telemetry batches through `telemetry`.

```json
{
  "readings": [
    {
      "deviceId": "sensor-01",
      "metric": "temperature",
      "value": 85.0,
      "ts": 1763895000000
    },
    {
      "deviceId": "sensor-02",
      "metric": "pump_running",
      "value": true,
      "ts": 1763895000100
    }
  ]
}
```

Rules:

- `readings` must be a non-empty array
- each reading must include `deviceId`, `metric`, `value`, and `ts`
- `deviceId` must match `^[A-Za-z0-9._-]+$`
- `metric` must match `^[A-Za-z0-9._:/%-]+$`
- `value` may be `number` or `boolean`
- `sourceId` is not part of the canonical payload and must not be required for validation
- within one `edgeId`, `deviceId + metric` is the canonical stream identity used by broadcast and aggregation
- Edge-local source configuration, if present in an Edge process, must be resolved before the Cloud telemetry payload and must not change the Cloud/Client identity key
- the payload contains only successfully acquired readings; per-reading quality/status is not required in the baseline contract
- invalid readings are filtered out before broadcast and aggregation
- if no readings survive validation, nothing is broadcast
- partial local-source degradation does not by itself invalidate the trusted session; unaffected readings may still be accepted

## Server-Side Realtime Behavior

- Cloud treats `Active` and `Blocked` as lifecycle state, separate from online/offline availability
- registering an edge issues the first persistent credential immediately, but an edge may remain `Active + offline` until its first successful trusted runtime session
- accepted edge connection updates trusted-session state and may refresh `lastSeenAt`
- first accepted telemetry marks the edge online for subscribers
- telemetry is broadcast first, then passed into the aggregation pipeline
- normal disconnect marks the edge offline for subscribers without changing lifecycle state
- credential rotation disconnects the active edge socket immediately and invalidates the previous credential
- block disconnects the active edge socket immediately and prevents later trusted reconnect until Cloud unblocks the edge and issues a fresh credential
- unblock returns the edge to `Active` and creates a future trusted reconnect path through the newly issued credential

## Canonical Source Notes

- For Dashboard client event semantics, prefer `specs/003-dashboard/contracts/runtime-signals.md`
- For edge lifecycle meaning and trusted runtime behavior, prefer `specs/007-edge-server/spec.md`
- This document should stay synchronized with the actual `cloud_server/src/socket/**` implementation and the active cloud-owned edge lifecycle contract
