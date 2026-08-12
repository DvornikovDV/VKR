# Quickstart: Windows-First Edge Runtime Under Current Cloud Model

This quickstart describes the operator flow for the production-shaped `edge_server` runtime as a consumer of the current `cloud_server` contract.

It does not use onboarding-package semantics and does not treat `edge_telemetry_test` as the target runtime.

## 1. Register or prepare the edge in cloud

An Admin uses the existing cloud API or admin UI to:

- register a new edge, or
- rotate the credential for an existing `Active` edge, or
- unblock a `Blocked` edge

The result is a one-time disclosure of the current persistent credential.

Relevant cloud-owned endpoints:

- `POST /api/edge-servers`
- `POST /api/edge-servers/{edgeId}/rotate-credential`
- `POST /api/edge-servers/{edgeId}/unblock`

## 2. Prepare the Windows machine

Choose a local runtime directory, for example:

```text
C:\ProgramData\vkr-edge\
```

Recommended layout:

```text
C:\ProgramData\vkr-edge\
|-- config\
|   `-- edge-runtime.yaml
`-- state\
    |-- credential.json
    |-- runtime-state.json
    `-- status.json
```

## 3. Create `edge-runtime.yaml`

Example:

```yaml
runtime:
  edgeId: 507f1f77bcf86cd799439011
  stateDir: C:\ProgramData\vkr-edge\state
  instanceName: line-a-edge

cloud:
  url: ${EDGE_CLOUD_URL}
  namespace: /edge
  connectTimeoutMs: 10000
  reconnect:
    baseDelayMs: 1000
    maxDelayMs: 30000
    maxAttempts: 0

batch:
  intervalMs: 1000
  maxReadings: 100

logging:
  level: info

sources:
  - sourceId: arduino_stand
    adapterKind: modbus_rtu
    enabled: true
    pollIntervalMs: 1000
    connection:
      port: "COM3"
      baudRate: 9600
      dataBits: 8
      parity: none
      stopBits: 1
      slaveId: 1
      timeoutMs: 500
    devices:
      - deviceId: environment
        address:
          node: 1
        metrics:
          - metric: temperature
            valueType: number
            mapping:
              registerType: input
              address: 0
              dataType: int16
              scale: 0.1
          - metric: humidity
            valueType: number
            mapping:
              registerType: input
              address: 1
              scale: 0.1
      - deviceId: pump_main
        address:
          node: 2
        metrics:
          - metric: actual_state
            valueType: boolean
            mapping:
              registerType: input
              address: 16
          - metric: local_button_pressed
            valueType: boolean
            mapping:
              registerType: input
              address: 2
      - deviceId: siren_alert
        address:
          node: 3
        metrics:
          - metric: actual_state
            valueType: boolean
            mapping:
              registerType: input
              address: 17
      - deviceId: valve_pwm
        address:
          node: 4
        metrics:
          - metric: actual_value
            valueType: number
            mapping:
              registerType: input
              address: 18
```

Notes:

- `runtime.edgeId` must match the credential file.
- `cloud.namespace` must stay `/edge`.
- `deviceId + metric` must remain stable for the runtime.
- `adapterKind: modbus_rtu` is a reusable Modbus RTU protocol adapter, not an Arduino-specific adapter.
- The implemented `modbus_rtu` adapter uses `connection.slaveId` and metric `mapping.address`; `device.address` is optional local metadata in the current runtime.
- The Arduino engineering stand uses USB serial Modbus RTU with 9600 8N1 and slave id `1`.
- A checked-in operator sample is available at `edge_server/samples/arduino-stand/edge-runtime.yaml`.

## 4. Install `credential.json`

Create the credential file from the cloud disclosure output:

```json
{
  "edgeId": "507f1f77bcf86cd799439011",
  "credentialSecret": "<current persistent credential secret>",
  "version": 3,
  "issuedAt": "2026-04-19T08:20:00Z",
  "source": "register",
  "installedAt": "2026-04-19T08:25:00Z"
}
```

Rules:

- keep only the current credential
- replace the file after rotate or unblock
- do not copy the secret into `edge-runtime.yaml`
- do not reinstall an older credential version after rotation or unblock; the runtime treats the previous file as `superseded` or `blocked` until a newer credential file is installed

## 5. Start the runtime

Run the Go runtime with the config path:

```powershell
edge-runtime.exe --config C:\ProgramData\vkr-edge\config\edge-runtime.yaml
```

Expected runtime behavior:

- load config
- load current credential
- connect to `cloud.url` on namespace `/edge`
- enter trusted mode only after the persistent credential is accepted
- begin sending telemetry batches for successfully acquired readings

## 6. Check local status

Inspect:

- `runtime-state.json` for detailed local runtime state
- `status.json` for operator-visible status

Healthy trusted example:

- `runtimeStatus = trusted`
- `cloudConnection = trusted`
- `authSummary = ok`

Partial source failure example:

- source-manager health for the affected source becomes `degraded` or `failed`
- trusted cloud telemetry may continue for unaffected readings
- operator projection helpers can produce `runtimeStatus = degraded` with `cloudConnection = trusted` when supplied that source summary

The current `runtimeapp` status persistence path writes runtime-state transitions with `sourceSummary = healthy`; it does not automatically rewrite `status.json` from source faults.

Credential replacement required example:

- `runtimeStatus = waiting_for_credential`
- `cloudConnection = rejected`
- `authSummary = credential_replaced`
- `runtime-state.json` keeps `credentialStatus = superseded` for credential rotation until a newer credential file is installed

## 7. Rotate, block, and unblock flow

### Rotate credential

1. Admin rotates the credential in cloud.
2. Cloud disconnects the active trusted runtime session.
3. Local status moves to `waiting_for_credential` with `authSummary = credential_replaced`; this is an operator-action-required replacement state, not re-onboarding.
4. Operator replaces `credential.json` with the newly disclosed credential.
5. Runtime restarts, or the implemented `ReloadInstalledCredential` runtime process path reads the replaced `credential.json`, and reconnects.

The old credential file must not be reused. Recovery after `credential_rotated` comes only from the newly installed `credential.json`; do not regenerate trust from activation data and do not clear all local state to make the old credential look fresh.

### Block

1. Admin blocks the edge in cloud.
2. Cloud disconnects the active session and future reconnects are rejected.
3. Local status reports `blocked`.
4. Trusted telemetry stops immediately.
5. `runtime-state.json` keeps `credentialStatus = blocked` and `retryEligible = false`; restarting with the old credential remains rejected.

### Unblock

1. Admin unblocks the edge in cloud.
2. Cloud discloses a fresh persistent credential.
3. Operator replaces `credential.json` with the disclosed unblock credential. Its `version` must be newer than the blocked credential version.
4. Runtime restart or the implemented `ReloadInstalledCredential` runtime process path reads the fresh persistent credential and reconnects if the edge is accepted.
5. Reusing the stale blocked credential does not resume trust and does not fall back to onboarding-package or activation data.

## 8. Smoke path vs production path

Minimal smoke harnesses may still exist for isolated telemetry validation, but they are not the runtime acceptance source for this feature.

Retained TypeScript reference helpers, if present, live outside `edge_server/src` and are archival only. They are not runtime entrypoints and must not provide an env-driven credential path, onboarding-package bootstrap, or `edge_activation` bootstrap.

Production acceptance for this runtime is based on:

- the current cloud admin credential flows
- the current `/edge` websocket contract
- trusted telemetry from real local sources on Windows-first deployment
