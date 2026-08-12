# Contract: Minimal Local Source Boundary For `006-edge-runtime-windows-mvp`

## Purpose

Define the minimal local source contract for `006-edge-runtime-windows-mvp`.

This contract is intentionally smaller than the earlier broad worker-process design. It exists to keep:

- cloud lifecycle logic in Go
- local source logic replaceable
- future Rust integration straightforward

The contract may be implemented in-process first and by Rust later, but the cloud-facing contract must remain unchanged and must stay compatible with the accepted behavior of `001-edge-runtime`.

## Ownership Split

- Go runtime core owns:
  - cloud connectivity
  - onboarding and reconnect attempts
  - trusted/untrusted session state
  - telemetry gating and batching
  - reaction to revoke, block, forced disconnect, rejection, and socket loss
- Local source implementation owns:
  - source-specific polling logic
  - normalization of raw values into runtime readings
  - source-local faults

## Contract Rules

- Local source implementations must never receive cloud secrets.
- Local source implementations must never connect to `cloud_server` directly.
- The Go runtime must not encode real hardware protocol logic in its cloud or lifecycle packages.

## Required Contract Elements

### 1. Source Definition Apply

The runtime provides stable source definitions from config to the active source implementation.

Minimum required fields:

| Field | Type | Notes |
|---|---|---|
| `sourceId` | string | Stable local source identifier |
| `adapterKind` | string | Current source family |
| `pollIntervalMs` | integer | Polling cadence |
| `connection` | object | Source-specific connection information |
| `devices[]` | array | Device and metric mappings |

Runtime rule:

- Re-onboarding or reconnect must not require rewriting unchanged source definitions.

### 2. Normalized Readings

The local source delivers readings already normalized for the runtime telemetry path.

| Field | Type | Notes |
|---|---|---|
| `sourceId` | string | Originating source |
| `deviceId` | string | Runtime-local device identity |
| `metric` | string | Canonical metric key |
| `value` | `number \| boolean` | Current sampled value |
| `ts` | integer | Unix milliseconds |

Runtime rules:

- The runtime decides whether readings are emitted or dropped.
- The source implementation does not own retry, trust, or cloud delivery policy.

### 3. Source Fault

The local source may report source-local problems.

| Field | Type | Notes |
|---|---|---|
| `sourceId` | string | Affected source |
| `severity` | `warning \| error` | Fault importance |
| `code` | string | Source-specific code |
| `message` | string | Human-readable summary |
| `ts` | integer | Unix milliseconds |

Runtime rule:

- Source faults affect logs and local runtime decisions only; they do not redefine cloud lifecycle state.

## Explicitly Deferred From This MVP

The following areas are not part of this contract yet:

- worker identity and version handshake
- heartbeat persistence
- worker-process supervision
- backlog-aware delivery contracts
- control request and response messages
- transport selection between Go and Rust

## Future Rust Compatibility Rule

When the first Rust integration starts, Rust must implement this boundary without changing:

- the cloud-facing handshake
- lifecycle handling ownership
- the canonical telemetry payload emitted by the Go runtime
