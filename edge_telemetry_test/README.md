# edge_telemetry_test

`edge_telemetry_test` is a tiny local smoke client for the existing cloud `/edge` Socket.IO namespace.

It is intentionally limited:

- persistent credential only
- mock telemetry fallback or serial input only
- no onboarding flow
- no inventory sync
- no device catalog sync
- no edge lifecycle management

## Required inputs

- `CLOUD_SOCKET_URL`
- `EDGE_ID`
- `EDGE_PERSISTENT_SECRET`

## Optional inputs

- `TELEMETRY_INTERVAL_MS` (default: `500`)
- `EDGE_NAME` (log label only; does not rename the cloud edge document)
- `SERIAL_PORT_PATH` (for example `COM3`; when set, runtime reads Arduino from COM instead of mock data)
- `SERIAL_BAUD_RATE` (default: `115200`)
- `SERIAL_DEVICE_ID` (default: `arduino-uno-01`)
- `SERIAL_INCLUDE_HUMIDITY` (default: `true`)

`CLOUD_SOCKET_URL` should point to the cloud base URL such as `http://localhost:4000`.
The runtime appends `/edge` automatically if it is not already present.

## Seed a dedicated test edge

From `cloud_server`:

```powershell
npm run seed:edge-telemetry-test
```

Optional trusted user binding:

```powershell
npm run seed:edge-telemetry-test -- --trusted-user-id <USER_OBJECT_ID>
```

The seed is idempotent for the dedicated test edge name. On reuse it keeps the same edge document and prints the same deterministic persistent credential for that edge:

- `status`
- `edgeId`
- `edgeName`
- plaintext `secret`

## Run the smoke client

From `edge_telemetry_test`:

```powershell
npm install
$env:CLOUD_SOCKET_URL='http://localhost:4000'
$env:EDGE_ID='<EDGE_ID_FROM_SEED>'
$env:EDGE_PERSISTENT_SECRET='<PLAINTEXT_SECRET_FROM_SEED>'
npm start
```

Optional runtime tuning:

```powershell
$env:TELEMETRY_INTERVAL_MS='1500'
$env:EDGE_NAME='Local Telemetry Smoke Edge'
```

Run from Arduino over COM:

```powershell
$env:SERIAL_PORT_PATH='COM3'
$env:SERIAL_BAUD_RATE='115200'
$env:SERIAL_DEVICE_ID='arduino-uno-01'
$env:SERIAL_INCLUDE_HUMIDITY='true'
npm start
```

Supported Arduino line formats:

- JSON per line, for example `{"temperature":24,"humidity":55}`
- existing `SimpleDHT` sample line, for example `Sample OK: 24 *C, 55 H`

When humidity forwarding is enabled, the runtime emits two metrics for the same device:

- `deviceId=arduino-uno-01`, `metric=temperature`
- `deviceId=arduino-uno-01`, `metric=humidity`

## Smoke flow

1. Start the cloud server with MongoDB available.
2. Run the dedicated seed script and copy the printed `edgeId` and plaintext `secret`.
3. Start `edge_telemetry_test`.
4. Confirm a successful `connect` log.
5. Confirm periodic telemetry logs or serial forward logs.
6. Optionally open the existing dashboard flow for a trusted user and subscribe to the same edge.

## Notes

- The runtime never logs the full secret.
- `connect_error` is surfaced directly and reconnection is disabled to avoid hiding auth failures.
- The `/edge` handshake uses only `edgeId` and `credentialSecret`.
- The telemetry payload follows the existing cloud contract: `{ readings: [{ deviceId, metric, value, ts }] }`.
