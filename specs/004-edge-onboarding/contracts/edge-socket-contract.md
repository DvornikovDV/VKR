# Edge Socket Contract

## Purpose

Define the canonical runtime contract between the edge process and `cloud_server` for:

- persistent-credential authentication
- later reconnects with the current persistent credential
- immediate disconnect on credential rotation or block

This onboarding-era contract is retained for compatibility reference. The active
Cloud-facing runtime model uses only the persistent credential path described
below; one-time onboarding package fields are historical and not part of the
current trusted telemetry contract.

## Transport

- Namespace: `/edge`
- Protocol: Socket.IO
- Direction: edge process in `edge_server` connects to `cloud_server`
- Authentication source: `socket.handshake.auth` only

## Handshake payload

Use `socket.handshake.auth` as the canonical credential payload.

| Field | Type | Required | Notes |
|---|---|---|---|
| `edgeId` | string | yes | Stable edge identifier issued at registration |
| `credentialSecret` | string | yes | Current persistent credential secret |

If any required field is missing or invalid, connection is rejected with `connect_error` code `invalid_credential`.

## Acceptance rules

Accepted only when all of the following are true:

- edge exists
- lifecycle state is `Active`
- presented secret matches the stored persistent credential hash

Rejected when:

- lifecycle state is `Blocked` (`blocked`)
- secret does not match (`invalid_credential`)

## Server events

### `edge_disconnect`

Emitted immediately before server-side forced disconnect.

```json
{
  "edgeId": "edge_123",
  "reason": "credential_rotated"
}
```

`reason` values used by current implementation:

- `credential_rotated`
- `blocked`
- `edge_forced_disconnect` (default generic reason)

### `connect_error`

Connection rejection reasons are normalized to these codes:

- `edge_not_found`
- `blocked`
- `invalid_credential`
- `edge_auth_internal_error` (unexpected server exception)

### `edge_status`

Cloud broadcasts `edge_status` to subscriber rooms:

- first valid telemetry from a socket emits `edge_status { edgeId, online: true }`
- on disconnect (including trust revoke or block), Cloud emits `edge_status { edgeId, online: false }`

## Telemetry behavior after authentication

- After successful authentication, the edge may use the existing `telemetry` event flow.
- Credential rotation and block enforce telemetry stop by disconnecting the active socket.
- Telemetry readings are keyed inside one `edgeId` by `deviceId + metric`; `sourceId` is not part of the Cloud runtime payload identity.
- Edge-local source identifiers may exist in local Edge/source configuration, but must not be required by Cloud for telemetry validation, dashboard broadcast, or catalog identity.

## Lifecycle side effects

### Credential rotation

1. Replace the current persistent credential
2. Disconnect the active edge socket if present
3. Keep lifecycle state `Active`

### Block

1. Move lifecycle state to `Blocked`
2. Disconnect the active edge socket if present
3. Reject future reconnects until Cloud unblocks the edge and issues a fresh credential
