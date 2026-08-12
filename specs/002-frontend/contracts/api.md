# API Contracts (Frontend View)

The SPA communicates with the `001-cloud-server` backend and consumes the cloud-owned edge contract.

> **IMPORTANT:** The complete HTTP source of truth is `/cloud_server/openapi.yaml`.
> The realtime source of truth is `/specs/001-cloud-server/contracts/websocket.md`.
> The edge lifecycle semantic source is `/specs/007-edge-server/spec.md`.
> This file only records the frontend-relevant subset that `002-frontend` consumes.

## Base URL

`/` (proxied via Nginx)

## Authentication

### `POST /api/auth/login`

Request:

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

Response:

```json
{
  "status": "success",
  "data": {
    "user": {
      "_id": "123",
      "email": "user@example.com",
      "role": "USER",
      "subscriptionTier": "FREE"
    },
    "token": "jwt..."
  }
}
```

### `POST /api/auth/register`

Request:

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

Response:

```json
{
  "status": "success",
  "data": {
    "user": {
      "_id": "123",
      "email": "user@example.com",
      "role": "USER",
      "subscriptionTier": "FREE"
    },
    "token": "jwt..."
  }
}
```

## Edge REST Flows

### `GET /api/edge-servers`

Returns the assigned edge list for the authenticated user.

Frontend-relevant fields:

```json
{
  "status": "success",
  "data": [
    {
      "_id": "edge-123",
      "name": "Boiler Room Edge",
      "lifecycleState": "Active",
      "availability": {
        "online": true,
        "lastSeenAt": "2026-04-12T11:04:00.000Z"
      }
    }
  ]
}
```

Notes:

- `lifecycleState` is limited to `Active | Blocked`
- availability is a separate cloud projection and must not be collapsed into lifecycle meaning

### `POST /api/edge-servers`

Admin registers a new edge. The response discloses the first persistent credential once.

```json
{
  "status": "success",
  "data": {
    "edge": {
      "_id": "edge-123",
      "name": "Boiler Room Edge",
      "lifecycleState": "Active",
      "availability": {
        "online": false,
        "lastSeenAt": null
      },
      "persistentCredentialVersion": 1
    },
    "persistentCredential": {
      "edgeId": "edge-123",
      "credentialSecret": "<SECRET>",
      "version": 1,
      "issuedAt": "2026-04-12T11:00:00.000Z",
      "instructions": "Use this secret as the edge runtime persistent credential for trusted connects and reconnects."
    }
  }
}
```

### `POST /api/edge-servers/{edgeId}/bind`

Admin assigns edge access to a user.

Request:

```json
{
  "userId": "user-123"
}
```

### `POST /api/edge-servers/{edgeId}/rotate-credential`

Admin rotates the current persistent credential.

Contract notes:

- lifecycle remains `Active`
- the previous credential becomes invalid immediately
- any active trusted runtime session is disconnected
- the new credential is disclosed once in the response

### `POST /api/edge-servers/{edgeId}/block`

Admin blocks an edge.

Contract notes:

- lifecycle moves to `Blocked`
- current trusted access is revoked immediately
- any active trusted runtime session is disconnected

### `POST /api/edge-servers/{edgeId}/unblock`

Admin unblocks an edge.

Contract notes:

- lifecycle returns to `Active`
- a fresh persistent credential is disclosed once in the response

### `GET /api/edge-servers/{edgeId}/ping`

Returns the cloud-projected lifecycle and availability snapshot for admin flows.

```json
{
  "status": "success",
  "data": {
    "lifecycleState": "Active",
    "availability": {
      "online": true,
      "lastSeenAt": "2026-04-12T11:04:00.000Z"
    }
  }
}
```

### `GET /api/edge-servers/{edgeId}/catalog`

Returns the telemetry-derived catalog used by the hosted Constructor.

```json
{
  "status": "success",
  "data": [
    {
      "edgeServerId": "edge-123",
      "deviceId": "sensor-01",
      "metric": "temperature",
      "label": "sensor-01.temperature"
    }
  ]
}
```

## Dashboard / Telemetry Realtime

### WebSocket Namespace

Dashboard clients connect on the default namespace `/`.

### Client Emit: `subscribe`

```json
{ "edgeId": "edge-123" }
```

Rules:

- subscription is edge-scoped; `diagramId` is not part of the Socket.IO subscribe payload
- access is still controlled by cloud authorization for the selected edge

### Server Listen: `telemetry`

```json
{
  "edgeId": "edge-123",
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

### Server Listen: `edge_status`

```json
{
  "edgeId": "edge-123",
  "online": true,
  "lastSeenAt": "2026-04-12T11:04:00.000Z"
}
```

Rules:

- `edge_status` carries availability only
- lifecycle remains a separate cloud-owned concept and must be read from REST responses rather than inferred from `online`
