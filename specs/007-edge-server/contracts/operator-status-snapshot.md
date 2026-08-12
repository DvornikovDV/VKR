# Contract: Operator Status Snapshot

## Purpose

Define the stable local JSON shape that the runtime exposes for operators, Windows service wrappers, and local support tooling.

This is an edge-owned local contract. It does not redefine cloud lifecycle and must never leak credential secrets.

## File location

Default file name:

- `status.json`

Stored inside the runtime `stateDir`.

## Snapshot schema

| Field | Type | Required | Notes |
|---|---|---|---|
| `edgeId` | string | yes | Runtime identity |
| `runtimeStatus` | string | yes | `starting`, `connecting`, `trusted`, `retrying`, `degraded`, `blocked`, `waiting_for_credential`, or `stopped` |
| `cloudConnection` | string | yes | `disconnected`, `connecting`, `trusted`, or `rejected` |
| `authSummary` | string | yes | `ok`, `retryable_disconnect`, `invalid_credential`, `blocked`, `edge_not_found`, `credential_replaced`, or `internal_error` |
| `retryEligible` | boolean | yes | Whether automatic retry is currently allowed |
| `loadedCredentialVersion` | integer or null | yes | Version currently loaded into runtime memory |
| `sourceSummary` | string | yes | `healthy`, `degraded`, or `failed`; accepted by the schema and operator projection helpers |
| `lastTelemetrySentAt` | string or null | yes | ISO datetime |
| `lastReason` | string or null | yes | Human-readable short explanation |
| `updatedAt` | string | yes | ISO datetime |

## Contract rules

- The snapshot must be rewritten atomically so local tools never observe partial JSON.
- The snapshot must never contain `credentialSecret` or any equivalent secret material.
- `runtimeStatus = degraded` is valid while `cloudConnection = trusted` when the status projection receives a degraded or failed source summary.
- `runtimeStatus = blocked` or `authSummary = blocked` is only a local reflection of a cloud-owned outcome.
- The current `runtimeapp` status persistence path writes runtime-state transitions with `sourceSummary = healthy`. Source-manager faults update source health, and projection helpers can map supplied source health into this contract.

## Interpretation rules

### Automatic retry allowed

When:

- `retryEligible = true`
- `cloudConnection = disconnected` or `connecting`
- `authSummary = retryable_disconnect`

The runtime may continue reconnect attempts without operator action.

### Operator action required

When:

- `runtimeStatus = waiting_for_credential`
- or `authSummary = invalid_credential`
- or `authSummary = credential_replaced`
- or `authSummary = blocked`

The runtime should not silently loop forever as if the current credential were still valid.

### Partial local degradation

When:

- `runtimeStatus = degraded`
- `cloudConnection = trusted`
- `sourceSummary = degraded`

The runtime is still in a trusted cloud session and may continue delivering unaffected telemetry. In the current implementation, this degraded projection is available through the operator projection helper when a caller supplies degraded source health; the default `runtimeapp` persistence path does not automatically rewrite `status.json` from source faults.

## Example

```json
{
  "edgeId": "507f1f77bcf86cd799439011",
  "runtimeStatus": "degraded",
  "cloudConnection": "trusted",
  "authSummary": "ok",
  "retryEligible": true,
  "loadedCredentialVersion": 3,
  "sourceSummary": "degraded",
  "lastTelemetrySentAt": "2026-04-19T08:42:10Z",
  "lastReason": "source plc-line-2 timeout; other sources continue",
  "updatedAt": "2026-04-19T08:42:11Z"
}
```
