# Implementation Plan: Production-Shaped Local Edge Runtime

**Branch**: `001-edge-runtime` | **Date**: 2026-04-05 | **Spec**: [specs/001-edge-runtime/spec.md](./spec.md)
**Input**: Feature specification from `specs/001-edge-runtime/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command.

## Summary

Build the next edge runtime in `edge_server` as a Go-first local runtime that preserves the `004-edge-onboarding` cloud contract, persists reconnect and runtime state locally, batches and buffers telemetry, and exposes a strict local adapter boundary for a later Rust hardware worker. Early delivery can reach cloud-contract parity and trusted telemetry using an in-process or mock adapter before any real hardware polling exists. The current TypeScript onboarding and socket helpers stay only as temporary contract fixtures and migration references until Go parity is proven; they are not the target production runtime.

## Technical Context

**Language/Version**: Go 1.24 for the edge runtime core, Rust stable for the future hardware worker, TypeScript 5.4 retained only for temporary contract fixtures and tests, Node.js 20+ compatibility for existing cloud contracts  
**Primary Dependencies**: Socket.IO v4-compatible Go client behind a `CloudTransport` interface, structured logging, YAML/JSON local file persistence, versioned local adapter contract, existing `cloud_server` `/edge` handshake plus `telemetry` event flow  
**Storage**: Operator-edited source/config file, local JSON files for persisted reconnect/runtime state and operator-visible status, in-memory best-effort backlog buffer, existing `cloud_server` MongoDB unchanged  
**Testing**: Go unit/integration tests, contract tests against existing `cloud_server` socket handlers, retained Vitest regression for TypeScript contract fixtures, Rust unit tests for adapter boundary and worker behavior, Windows-first smoke tests with future Linux parity checks  
**Target Platform**: Windows-hosted MVP runtime with future Linux deployment parity; local multi-process edge runtime connecting to `cloud_server` over Socket.IO `/edge`  
**Project Type**: Monorepo edge-runtime feature with explicit multi-process local components and contract-first cloud integration  
**Performance Goals**: First trusted telemetry batch reaches cloud within 60 seconds after a normal restart; trusted telemetry stops immediately once trust or session loss is known; buffered telemetry replays in chronological order before live emission; one edge runtime supports multiple devices and multiple metrics per device  
**Constraints**: Cloud lifecycle authority must remain in `004` contracts; no direct cross-module imports are introduced; backlog is best-effort and non-durable across restart; telemetry batching and in-memory backlog remain bounded and operator-configurable; runtime must stay adaptable to serial/USB and Modbus-like master/slave patterns; current development runs on Windows but paths and process boundaries must remain Linux-compatible; control stays out of MVP while preserving a future command boundary  
**Scale/Scope**: One local runtime instance per deployment target in MVP, multiple devices/metrics per edge, Go-first delivery that can progress with a mock adapter before Rust hardware access is available

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **Principle 2 (Architectural Scope)**: New execution work lives in `edge_server`, which is the correct module for local device polling, buffering, and telemetry forwarding. `cloud_server` remains the sole owner of onboarding lifecycle meaning, trust decisions, and telemetry-derived visibility. `client` remains a consumer of cloud-derived state only.
- [x] **Principle 3 (Strict Module Isolation)**: No new direct cross-module imports are required. Integration boundaries are explicit and contract-based:
  - existing Socket.IO `/edge` handshake and lifecycle events from `004-edge-onboarding`
  - existing cloud `telemetry` event payload shape in `cloud_server`
  - new local Go-to-Rust hardware adapter contract defined under `specs/001-edge-runtime/contracts/`
  - file-based local config/state schemas owned by `edge_server`
- [x] **Principle 4 (State Containment)**: No `window.*` or `global.*` state is introduced. Runtime state lives in explicit files or process-local services inside the Go core and Rust worker.
- [x] **Principle 5 (Secrets)**: Cloud secrets remain in operator-provided onboarding input or rotated reconnect files protected by ordinary OS filesystem permissions. Rust hardware workers do not receive cloud credentials.
- [x] **Principle 6 (Context Awareness)**: Decisions are grounded in root and `edge_server` AGENTS files, the constitution, `001-edge-runtime/spec.md`, `004-edge-onboarding` plan/research/contracts, `005-edge-test/spec.md`, and the current `edge_server` TypeScript stubs plus `cloud_server` runtime handlers.
- [x] **Principle 7 (Documentation)**: Planning artifacts stay inside `specs/001-edge-runtime/` in English, while repository instructions remain separate.
- [x] **Post-design re-check**: The resulting design keeps trust authority in cloud contracts, isolates hardware-facing code from cloud-facing runtime logic, and preserves future control behind a local adapter boundary without redefining MVP scope.

## Project Structure

### Documentation (this feature)

```text
specs/001-edge-runtime/
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

### Source Code (repository root)

```text
edge_server/
|-- src/                          # Existing TypeScript contract fixtures kept during migration
|   |-- config/
|   |-- onboarding/
|   `-- transport/
|-- go_core/
|   |-- cmd/edge-runtime/
|   |-- internal/cloud/
|   |-- internal/runtime/
|   |-- internal/state/
|   |-- internal/buffer/
|   |-- internal/source/
|   |-- internal/operator/
|   `-- internal/mockadapter/
|-- rust_worker/
|   |-- crates/edge_adapter_contract/
|   |-- crates/mock_adapter/
|   `-- crates/hardware_worker/
`-- tests/
    |-- contract/
    `-- fixtures/

cloud_server/
|-- src/socket/events/
|-- src/services/
`-- tests/integration/

client/
`-- tests/unit/
```

**Structure Decision**: Keep all production runtime work inside `edge_server`, but split it into explicit local components: a Go runtime core that owns cloud-facing behavior and a Rust worker area that owns hardware I/O. Preserve the current `edge_server/src` TypeScript files as temporary contract fixtures because existing regression tests import them; do not extend them into the long-term production runtime.

## Phase 0: Research Conclusions Applied

- Keep the `004-edge-onboarding` Socket.IO lifecycle contract and `cloud_server` telemetry ingest payload authoritative. `001-edge-runtime` does not redefine cloud trust semantics.
- Make the Go runtime core the only local component that talks to cloud, owns trusted/untrusted state, coordinates batching and backlog replay, and decides when telemetry may leave the host.
- Keep Rust strictly hardware-facing: protocol drivers, polling loops, source health, and the future command surface. Rust never becomes the source of lifecycle truth.
- Split stable operator configuration from rotatable runtime state so re-onboarding does not require recreating unchanged source definitions.
- Preserve the current TypeScript files as migration references and test fixtures because `client/tests/unit/repro_task_T010.test.ts` and `client/tests/unit/repro_task_T021.test.ts` depend on them today.

## Process And Module Boundaries

### 1. Cloud-facing contract boundary

- `cloud_server` remains the lifecycle authority for onboarding acceptance, reconnect rejection, trust revoke, block, re-enable, and forced disconnect behavior.
- The Go runtime core consumes the existing `/edge` handshake payload, `edge_activation`, `edge_disconnect`, `connect_error`, `edge_status`, and `telemetry` event contracts.
- `client` continues to consume only telemetry-derived visibility already materialized in cloud; it does not learn about local hardware workers directly.

### 2. Local edge runtime boundary

- The Go core owns:
  - onboarding bootstrap and persistent reconnect handling
  - runtime state persistence
  - trust-aware telemetry gating
  - batching, buffering, backlog replay, and invalidation
  - operator-visible status, logs, and minimal local support through `status.json` plus a runtime status command
  - supervision of the active source adapter implementation
- The Rust worker owns:
  - hardware transport access
  - protocol-specific polling logic
  - normalization of raw device readings into contract-level samples
  - future control execution boundary, kept disabled in MVP
- The Go/Rust boundary is explicit and versioned. It is defined first as a message contract, then carried over the transport chosen by the spike in Phase 2.

### 3. TypeScript stub boundary

- `edge_server/src/config/env.ts`, `edge_server/src/onboarding/activateEdge.ts`, `edge_server/src/onboarding/persistedCredentialStore.ts`, and `edge_server/src/transport/cloudSocketClient.ts` are development-only examples retained temporarily inside the existing module.
- The files above are not the source of truth for runtime behavior, payload semantics, or local state design. The source of truth remains the cloud contract, the `001-edge-runtime` contracts, and the new Go implementation.
- Their contents may be incomplete, low-quality, or removed at any time once they stop helping development.
- No new production runtime work should be added to `edge_server/src`; new runtime code belongs in `edge_server/go_core` and later `edge_server/rust_worker`.
- None of the files above stay on the production hot path once Go parity lands. They may be deleted, frozen as fixtures, or moved into an explicit test-support location in a later cleanup task.

## Research Gates For The Rust-Go Boundary

1. **Transport spike**
   - Compare gRPC over loopback TCP against framed stdio or pipe-based transport.
   - Accept a transport only if it works on Windows and Linux, supports streaming batches, and keeps process supervision simple.
2. **Adapter schema spike**
   - Freeze the message set for source definitions, worker health, telemetry samples, and reserved control requests.
   - Ensure the schema can represent serial/USB addressing plus Modbus-like master/slave polling without hardcoding a single protocol family.
3. **Supervision and restart spike**
   - Decide how the Go core starts, stops, and replaces a worker while preserving operator visibility and keeping trust state local to the Go process.
4. **Packaging spike**
   - Define a host layout that works for Windows development now and Linux deployment later without changing runtime semantics or file ownership rules.

## Migration From Current TypeScript Edge Stubs

1. Treat the current TypeScript files in `edge_server/src` as disposable development examples only, not as authoritative implementations.
2. Keep them read-compatible with any still-relevant regression tests during early phases only when they remain in the repository.
3. Re-implement their useful responsibilities in Go:
   - env/config loading -> Go config package
   - onboarding bootstrap -> Go runtime bootstrap service
   - credential persistence -> Go state store
   - cloud socket auth parsing/building -> Go cloud transport package
4. Add Go contract tests against `cloud_server` before relying on the Go runtime as the only maintained path.
5. Once the examples stop helping development, remove them or relocate them into a test-support area so `edge_server` no longer appears to have a production TypeScript runtime.

## Phase 1: Design Plan

### Phase 1 - Go core foundation with no hardware dependency

1. Scaffold `edge_server/go_core` with packages for config, cloud transport, runtime orchestration, state persistence, telemetry batching, operator status, and a mock source adapter.
2. Implement first onboarding and persistent reconnect using the existing `004` socket contract and current `cloud_server` edge auth behavior.
3. Persist rotated reconnect credentials and runtime trust outcomes locally in ordinary files with OS permissions.
4. Add a mock adapter behind the final local adapter contract so the Go core can progress before Rust or real hardware exists.

### Phase 2 - Trust-aware telemetry delivery and buffering on mock or in-process sources

1. Implement the trusted telemetry pipeline in Go:
   - collect normalized samples from the adapter boundary
   - batch them into the canonical cloud payload
   - buffer during connectivity-only interruption
   - replay backlog chronologically before live telemetry
2. Keep Phase 2 independent from any real hardware requirement by allowing an in-process mock adapter or Rust mock worker to satisfy the source boundary.
3. Add invalidation rules so backlog is discarded on trust revoke, block, forced disconnect, or any reconnect rejection that ends the trusted session.
4. Persist operator-visible outcomes such as trusted reconnect ready, blocked, recovery-needed, and re-onboarding required across restart.
5. Add integration tests against current `cloud_server` handlers for onboarding, reconnect rejection, disconnect handling, and telemetry replay order.

### Phase 3 - External worker contract and Rust mock worker

1. Freeze the versioned local adapter contract from the research spike.
2. Introduce `edge_server/rust_worker/crates/edge_adapter_contract` plus a Rust mock worker implementing the same source and telemetry messages already used by the in-process Go mock adapter.
3. Prove that the Go core can swap from the in-process mock adapter to an external Rust worker without any cloud contract changes.
4. Reserve future control request/response messages in the local contract, but return `unsupported` from both sides in MVP.

### Phase 4 - First real hardware pilot

1. Implement the first Rust hardware adapter for the earliest available serial/USB and Modbus-like polling target.
2. Keep source-definition and telemetry contracts stable so cloud-facing behavior does not change when the adapter changes from mock to real hardware.
3. Add Windows smoke validation with the first device and confirm the same runtime layout remains Linux-deployable.
4. Keep control out of runtime behavior for MVP, but preserve the worker-side command boundary for the next feature.

## Test Plan

1. Keep current `cloud_server` onboarding integration tests as the contract oracle for trust lifecycle behavior.
2. Add Go contract tests that connect to the real `/edge` namespace and emit canonical telemetry batches to confirm payload compatibility.
3. Retain existing Vitest regressions that import TypeScript stubs until equivalent Go-focused regression coverage exists.
4. Add Go tests for:
   - persisted reconnect preference over onboarding input
   - runtime state recovery after restart
   - chronological backlog replay
   - backlog invalidation after trust loss
   - operator status persistence
5. Add Rust tests for adapter schema conformance, worker health reporting, and mock polling behavior before any real protocol crate lands.
6. Add Windows-first verification for filesystem permission expectations on `credential.json`, `runtime-state.json`, and `status.json`.
7. Add quickstart-backed validation for:
   - first onboarding to first accepted telemetry within 10 minutes under normal conditions
   - first trusted telemetry batch within 60 seconds after a normal restart
   - operator status discovery within 2 minutes using only `status.json` and the runtime status command

## Complexity Tracking

No constitution violations or exception justifications are required for this plan.
