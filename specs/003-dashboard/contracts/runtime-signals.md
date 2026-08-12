# Dashboard Runtime Signals Contract

## Transport

- Protocol: Socket.IO client to the cloud default namespace (`/`)
- Authentication: handshake `auth.token = "Bearer <jwt>"`
- Authorization: USER role only
- Subscription scope: one selected `edgeId` at a time

## Client -> cloud

### `subscribe`

```json
{
  "edgeId": "<edgeId>"
}
```

- Sent after the Socket.IO session connects.
- Dashboard does not send `diagramId`; diagram selection affects only client-side binding resolution and rendering.

## Cloud -> client

### `subscribed`

```json
{
  "edgeId": "<edgeId>"
}
```

- Optional confirmation that the socket joined the selected edge room.

### `telemetry`

```json
{
  "edgeId": "<edgeId>",
  "readings": [
    {
      "deviceId": "pump_7",
      "metric": "temperature",
      "last": 42.1,
      "ts": 1763895000000
    }
  ],
  "serverTs": 1763895000200
}
```

Rules:

- Dashboard accepts telemetry only for the active `edgeId`.
- Runtime lookup uses the saved binding pair `deviceId + metric`.
- Resolved values update the corresponding visual widgets on the saved diagram surface when the widget supports live display behavior.
- `sourceId` is not part of the runtime payload contract and is not a binding key.
- Latest values should replace older ones for the same bound pair.

## Catalog Identity

Dashboard and hosted constructor catalog consumers treat each telemetry option inside one `edgeId` as the pair `deviceId + metric`.

Rules:

- Catalog entries do not require or expose `sourceId`.
- Saved runtime bindings store `widgetId + deviceId + metric` in the selected `edgeId` context.
- If legacy Cloud data still contains `sourceId`, Dashboard ignores it for lookup and rendering.

### `edge_status`

```json
{
  "edgeId": "<edgeId>",
  "online": true
}
```

Rules:

- `online: true` marks the selected edge available.
- `online: false` marks the selected edge unavailable/offline.
- This state is separate from transport connectivity.

## Transport lifecycle expectations

- Socket disconnect or reconnect events drive Dashboard transport status.
- During reconnect attempts, Dashboard keeps the last successfully rendered widget values visible.
- On monitoring-context switch, Dashboard disposes the previous socket subscription/session and subscribes only to the new `edgeId`.
