# Implementation Plan: Windows-Only Narrow MVP Delivery Slice For `001-edge-runtime`

**Branch**: `006-edge-runtime-windows-mvp` | **Date**: 2026-04-06 | **Spec**: [spec.md](./spec.md)  
**Input**: Narrow MVP specification from `specs/006-edge-runtime-windows-mvp/spec.md`

## Summary

Build the smallest safe Go-first edge runtime in `edge_server/go_core` that can run on Windows, complete onboarding against the existing cloud contract, keep trusted session state only in process memory, emit canonical telemetry while trusted and connected, stop immediately on trust or session loss, and expose a minimal local source contract that can later be implemented by Rust.

This plan intentionally excludes local machine-written runtime state files, telemetry backlog and replay, cross-platform delivery work, and external worker-process supervision.

This plan is a delivery slice of `001-edge-runtime`, not a competing architecture. The code produced from this plan must remain a minimal working implementation of the accepted `001` lifecycle and telemetry behavior.

## Technical Context

**Language/Version**: Go 1.24 for the runtime core, TypeScript 5.x only for existing cloud contracts and tests, Rust deferred until the runtime source seam is ready  
**Primary Dependencies**: Socket.IO `/edge` contract from `cloud_server`, structured logging, YAML config parsing, in-process mock source, canonical `telemetry { readings[] }` payload  
**Storage**: Operator-edited config plus process-local memory only; no machine-written credential or runtime-state files in this MVP  
**Testing**: Go unit and integration tests, cloud lifecycle oracle tests in `cloud_server`, Windows-first smoke validation  
**Target Platform**: Windows only  
**Project Type**: Monorepo feature spanning `edge_server` and cloud contract validation  
**Performance Goals**: First accepted telemetry within 10 minutes from onboarding; immediate telemetry stop once trust or session loss is known; support multiple devices and metrics from one runtime  
**Constraints**: No backlog or replay, no persistent reconnect across restart, no worker-process bridge in this scope, no control path  
**Scale/Scope**: One Windows runtime process, one active mock-source path, enough structure to unblock the first Rust hardware integration later

## Constitution Check

- [x] Work stays inside `edge_server` for edge execution behavior.
- [x] Cloud lifecycle authority remains in `cloud_server`.
- [x] No new cross-module state leaks are introduced.
- [x] No secrets are hardcoded into docs or code paths.
- [x] The plan keeps device communication isolated from cloud business logic.

## Project Structure

### Documentation

```text
specs/006-edge-runtime-windows-mvp/
|-- spec.md
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- contracts/
|   |-- cloud-runtime-contract.md
|   |-- local-hardware-adapter-contract.md
|   `-- runtime-state-files.md
`-- tasks.md
```

### Active Source Areas For This MVP

```text
edge_server/
|-- go_core/
|   |-- cmd/edge-runtime/
|   |-- internal/cloud/
|   |-- internal/config/
|   |-- internal/runtime/
|   |-- internal/source/
|   |-- internal/mockadapter/
|   |-- internal/operator/
|   `-- tests/
`-- tests/fixtures/runtime/

cloud_server/
|-- src/socket/events/
|-- src/services/
`-- tests/integration/
```

### Areas Explicitly Outside This MVP Hot Path

- `edge_server/go_core/internal/state/*`
- `edge_server/go_core/internal/buffer/*`
- `edge_server/rust_worker/*`
- `edge_server/src/*` TypeScript examples

These areas may remain in the repository, but they are not authoritative for the narrow MVP delivery path.

## Design Decisions Applied

### 1. Go is the only cloud-connected local authority

The Go runtime owns onboarding, reconnect attempts, telemetry gating, and trust-loss handling. Local source code never becomes a second lifecycle authority.

### 2. Trusted state is process-local only

After `edge_activation`, the runtime retains the persistent reconnect secret only in memory. This allows same-process reconnect during transient connectivity loss while avoiding file-persistence work in this MVP.

### 3. No backlog, replay, or overflow behavior

When disconnected or untrusted, new readings are dropped. This removes a large class of complexity and keeps the runtime aligned with the fastest hardware-readiness path.

### 4. Socket disconnect is treated as a stop-sending condition

The runtime must react not only to explicit cloud lifecycle events, but also to ordinary socket disconnects. Telemetry is gated by both trust and current connection state.

### 5. The local source seam is minimal

The runtime accepts normalized readings from a simple local source contract. Rust can implement that seam later without changing cloud payloads or lifecycle handling.

## Implementation Phases

### Phase A - Trusted Session Foundation

Build the runtime skeleton that:

- loads Windows MVP config
- accepts onboarding input
- performs the `/edge` handshake
- normalizes `edge_activation`, `edge_disconnect`, and `connect_error`
- tracks trusted session state in memory
- handles ordinary socket disconnect as a stop condition

### Phase B - Trusted Telemetry Path

Add the first local source pipeline that:

- applies stable source definitions
- produces normalized readings from the in-process mock source
- batches canonical telemetry
- emits only while trusted and connected
- drops readings while disconnected or untrusted

### Phase C - Trust-Loss Safety And Hardware-Ready Seam

Harden the runtime so that:

- revoke, block, forced disconnect, and rejected reconnect stop telemetry immediately
- fresh onboarding after recovery works without changing source definitions
- the local source contract is frozen enough for the first Rust integration task

## Runtime Boundary

### Cloud Boundary

The runtime consumes:

- `socket.handshake.auth`
- `edge_activation`
- `edge_disconnect`
- `connect_error`
- current socket disconnect signals

The runtime emits:

- `telemetry { readings[] }`

No new cloud-facing contract is introduced.

### Local Source Boundary

The runtime accepts:

- source definitions from config
- normalized readings
- source faults

The local source boundary does not own:

- cloud credentials
- cloud lifecycle state
- telemetry retry policy

## Test Plan

1. Keep the existing cloud onboarding oracle in `cloud_server/tests/integration/edge-onboarding.test.ts` as the lifecycle authority check.
2. Add Go contract coverage for onboarding, same-process reconnect, and fresh-process untrusted startup.
3. Add Go integration coverage for telemetry emission from multiple devices and metrics.
4. Add Go integration coverage for revoke, block, forced disconnect, rejected reconnect, and ordinary socket disconnect.
5. Keep Windows-first smoke validation as the primary runtime acceptance path.

## Non-Divergence Rule

Implementation decisions made under this plan must not drift away from the accepted functional contract of `001-edge-runtime`.

Allowed simplifications:

- remove persistence
- remove backlog and replay
- remove cross-platform delivery work
- defer worker-process mode

Not allowed:

- changing lifecycle meaning
- changing cloud payload shape
- weakening trust-loss stop behavior
- inventing a telemetry path outside the accepted cloud contract

## Deferred Work

The following work is intentionally deferred outside this MVP plan:

- persisted reconnect across restart
- `credential.json`, `runtime-state.json`, and `status.json`
- backlog and replay
- operator status commands and local recovery files
- worker-process supervision
- external Rust mock worker
- Linux parity and deployment layout

## Complexity Tracking

This plan reduces complexity on purpose. No exceptions are required because the scope change removes, rather than adds, risk-heavy subsystems from the current delivery target.
