# Tasks: Windows-Only Narrow MVP Delivery Slice For `001-edge-runtime`

**Input**: Design documents from `/specs/006-edge-runtime-windows-mvp/`  
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Tests**: Tests are required, but only high-signal tests that directly protect the narrow MVP. The active protection set is Go contract/integration coverage plus the existing cloud lifecycle oracle.

**Organization**: Tasks are grouped into three delivery phases that optimize for the fastest safe path to hardware-integration readiness. Earlier broad-scope work for persisted state files, backlog/replay, cross-platform deployment, and worker-process supervision is intentionally out of the active MVP task list.

**Compatibility rule**: Work executed from this task list must produce a minimal working implementation subset of `001-edge-runtime`, not a different runtime design. Lifecycle handling, telemetry shape, and trust-loss behavior must remain compatible with the accepted `001` semantics.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel
- **[Story]**: User story label (`US1`, `US2`, `US3`)
- Every task includes exact file paths for direct execution

---

## Phase 1: Foundation For A Trusted Runtime Session

**Purpose**: Keep the current scaffolding, then narrow config, transport, and runtime state handling to the Windows-only MVP.

- [X] T001 Scaffold the Go runtime workspace and bootstrap entrypoint in `edge_server/go_core/go.mod`, `edge_server/go_core/cmd/edge-runtime/main.go`, and `edge_server/go_core/internal/runtime/runtime.go`
- [X] T003 [P] Create runtime fixture and smoke-test scaffolds in `edge_server/tests/fixtures/runtime/config.yaml`, `edge_server/tests/fixtures/runtime/onboarding-package.json`, and `edge_server/go_core/tests/integration/runtime_smoke_test.go`
- [X] T004 [P] Create contract-test harnesses for cloud lifecycle parity in `edge_server/go_core/tests/contract/edge_contract_test.go`
- [X] T005 Narrow Windows MVP config parsing and validation in `edge_server/go_core/internal/config/config.go`, `edge_server/go_core/internal/config/config_test.go`, and `edge_server/tests/fixtures/runtime/config.yaml`
- [X] T007 Finalize Socket.IO transport normalization, including ordinary socket disconnect handling, in `edge_server/go_core/internal/cloud/transport.go`, `edge_server/go_core/internal/cloud/socketio_client.go`, and `edge_server/go_core/internal/cloud/events.go`
- [X] T008 [P] Implement the minimal local source interface and in-process mock source scaffold in `edge_server/go_core/internal/source/adapter.go`, `edge_server/go_core/internal/source/manager.go`, and `edge_server/go_core/internal/mockadapter/adapter.go` so `internal/source` becomes the runtime-owned boundary for applying source definitions and receiving readings or source faults from the in-process mock source, while local source components remain independent from cloud lifecycle, reconnect, and credential concerns
- [X] T008b [P] Add Go behavioral coverage that proves the runtime receives mock-source readings and source faults through `internal/source` manager orchestration and that the mock-source boundary can be exercised without cloud lifecycle/auth context in `edge_server/go_core/internal/source/manager_test.go`, `edge_server/go_core/internal/mockadapter/adapter_test.go`, and `edge_server/go_core/tests/integration/telemetry_pipeline_test.go`
- [X] T009 [P] Simplify observability to process-local structured logging and runtime outcomes in `edge_server/go_core/internal/runtime/session_epoch.go`, `edge_server/go_core/internal/operator/logger.go`, and `edge_server/go_core/internal/operator/outcomes.go`
- [X] T049 Implement process-local runtime session state for trusted, untrusted, and disconnected execution in `edge_server/go_core/internal/runtime/runtime_state.go` and `edge_server/go_core/internal/runtime/runtime.go`

**Checkpoint**: The runtime can represent trusted vs untrusted execution in memory, load narrow MVP config, and observe the cloud lifecycle plus ordinary disconnect signals.

---

## Phase 2: User Story 1 And 2 - Trusted Session Plus Trusted Telemetry

**Goal**: Establish a trusted runtime session in the current process and emit canonical telemetry only while trusted and connected.

**Independent Test**: Start the runtime through the real `cmd/edge-runtime` to `Runner.Run()` production path with a valid onboarding package and a real cloud transport path, verify the first connect attempt uses `credentialMode = onboarding`, receive `edge_activation`, retain the persistent credential only in memory, simulate a transient disconnect, and verify the same process reconnects with `credentialMode = persistent` while a fresh process remains untrusted and a previously consumed onboarding package is not silently reused without fresh operator input. This proof must execute through the main runtime entrypoint without `SetCloudTransport`, scripted lifecycle transports, or any other test-only transport substitution. If the process starts without any valid current auth path, it must fail fast with a clear operator-facing error instead of entering an infinite retry loop that cannot receive fresh operator input in-process.

### Tests For Phase 2

- [X] T011 [P] [US1] Add Go contract coverage for first onboarding, same-process reconnect, and fresh-process untrusted startup in `edge_server/go_core/tests/contract/onboarding_session_test.go` and `edge_server/go_core/tests/integration/runtime_smoke_test.go`
- [X] T011b [P] [US1] Add failing Go behavioral coverage that proves the real `Runner.Run()` execution path performs the first onboarding handshake, switches later reconnect attempts to the in-memory persistent credential after `edge_activation`, and rejects fallback to a consumed onboarding package without fresh operator input in `edge_server/go_core/tests/contract/onboarding_session_test.go` and `edge_server/go_core/tests/integration/runtime_smoke_test.go`
- [X] T012 [P] [US1] Extend the cloud lifecycle oracle only where needed for Go runtime onboarding and reconnect assumptions in `cloud_server/tests/integration/edge-onboarding.test.ts` and `cloud_server/tests/unit/edge-onboarding.service.test.ts`
- [X] T012b [P] [US1] Extend the cloud lifecycle oracle to assert that trust-loss and rejected reconnect do not create a valid future trust path, and that recovery requires a newly issued onboarding package rather than a stale previously used onboarding secret in `cloud_server/tests/integration/edge-onboarding.test.ts` and `cloud_server/tests/unit/edge-onboarding.service.test.ts`
- [X] T018 [P] [US2] Add Go integration coverage in `edge_server/go_core/tests/integration/telemetry_pipeline_test.go` that proves normalized readings produced through `internal/source` manager reach cloud only through the runtime-owned telemetry pipeline and batcher as canonical `telemetry { readings[] }` payloads, that one runtime session can emit batches containing more than one device and more than one metric under the same edge identity, and that readings seen while disconnected or untrusted never appear in a later trusted payload after reconnection or trust recovery

### Implementation For Phase 2

- [X] T014 [US1] Implement onboarding bootstrap from operator input and in-memory persistent credential retention in `edge_server/go_core/internal/runtime/bootstrap.go`, `edge_server/go_core/internal/runtime/onboarding.go`, and `edge_server/go_core/cmd/edge-runtime/main.go`
- [X] T014b [US1] Tighten onboarding bootstrap semantics in `edge_server/go_core/internal/runtime/bootstrap.go`, `edge_server/go_core/internal/runtime/onboarding.go`, and `edge_server/go_core/cmd/edge-runtime/main.go` so successful `edge_activation` immediately clears the consumed onboarding input, onboarding mode is allowed only from fresh operator-provided input, and `issuedAt` or `expiresAt` are parsed as optional fields that are validated only when present
- [X] T016 [US1] Implement handshake payload building and activation handling for the narrow MVP in `edge_server/go_core/internal/cloud/socketio_client.go`, `edge_server/go_core/internal/cloud/events.go`, and `edge_server/go_core/internal/cloud/auth_payload.go`
- [X] T016b [US1] Wire the real runtime execution flow in `edge_server/go_core/internal/runtime/runtime.go`, `edge_server/go_core/cmd/edge-runtime/main.go`, `edge_server/go_core/internal/cloud/socketio_client.go`, and `edge_server/go_core/internal/cloud/events.go` so the production `cmd/edge-runtime` entrypoint constructs and uses a real cloud transport instead of the default in-process stub, `Runner.Run()` performs `BuildHandshakeAuth -> connect -> lifecycle event handling -> reconnect attempt` on that production path, promotes the session on `edge_activation`, marks rejected connects as untrusted, and stops trusted execution immediately on ordinary socket disconnects. Task proof must come from the real main-entrypoint behavior without `SetCloudTransport`, scripted lifecycle transports, or any other test-only transport injection. If no valid current auth path exists and no fresh operator input can be supplied in-process, the runtime must fail fast with a clear error instead of entering an infinite retry loop.
- [X] T021 [US2] Implement the runtime-owned trusted telemetry path in `edge_server/go_core/internal/runtime/telemetry_pipeline.go`, `edge_server/go_core/internal/runtime/batcher.go`, and `edge_server/go_core/internal/cloud/telemetry_client.go` so normalized readings accepted from `internal/source` manager are gated by the current runtime session, accumulated only by `batch.intervalMs` and `batch.maxReadings`, and emitted to cloud only as the exact `telemetry { readings[] }` event shape whose reading entries contain `deviceId`, `metric`, `value`, and `ts` with no source-specific, adapter-local, or non-canonical fields
- [X] T023 [US2] Implement stable source-definition application and normalized reading ingestion for the in-process mock source in `edge_server/go_core/internal/source/manager.go`, `edge_server/go_core/internal/source/readings.go`, and `edge_server/go_core/internal/mockadapter/adapter.go` so unchanged source definitions are applied as stable runtime configuration and reused across reconnect, trust-loss, and fresh re-onboarding flows without redefinition, while normalized readings preserve only `sourceId`, `deviceId`, `metric`, `value`, and `ts`
- [X] T023b [P] [US2] Add Go behavioral coverage that proves unchanged applied source definitions are reused across reconnect, trust-loss, and fresh re-onboarding, and that normalized ingestion preserves the canonical local reading shape in `edge_server/go_core/internal/source/manager_test.go` and `edge_server/go_core/tests/integration/telemetry_pipeline_test.go`
- [X] T050 [US2] Implement runtime-owned drop semantics in `edge_server/go_core/internal/runtime/telemetry_pipeline.go`, `edge_server/go_core/internal/runtime/runtime.go`, and `edge_server/go_core/internal/operator/outcomes.go` so any reading that arrives after the session becomes disconnected or untrusted is discarded immediately before entering a future cloud batch, any not-yet-emitted telemetry collected for a session that has already lost eligibility is not replayed after later reconnect or trust recovery in this MVP, and a later trusted session resumes telemetry from new readings without requiring local source-definition reapplication

**Checkpoint**: A Windows runtime process can onboard, keep trusted reconnect material in memory, emit canonical telemetry while trusted and connected, and drop readings instead of buffering them when disconnected or untrusted.

---

## Phase 3: User Story 3 - Trust-Loss Safety And Hardware-Ready Seam

**Goal**: Stop telemetry safely on trust or session loss, recover through fresh onboarding, and freeze the minimal local source seam needed for the first Rust hardware integration.

**Independent Test**: Run a trusted runtime that emits telemetry, trigger revoke, block, forced disconnect, rejected reconnect, and ordinary socket disconnect, then verify telemetry stops immediately and resumes only after a newly valid future onboarding path succeeds; a previously consumed onboarding package must not count as that future trust path unless fresh operator input is supplied again.

### Tests For Phase 3

- [X] T028 [P] [US3] Add Go integration coverage for revoke, block, forced disconnect, rejected reconnect, ordinary socket disconnect, and fresh re-onboarding recovery in `edge_server/go_core/tests/integration/trust_loss_recovery_test.go`
- [X] T029 [P] [US3] Extend the cloud lifecycle oracle in `cloud_server/tests/integration/edge-onboarding.test.ts` and `cloud_server/tests/integration/edge-servers.test.ts` so a generic `edge_forced_disconnect` emits `edge_disconnect { reason: edge_forced_disconnect }`, disconnects the active socket, and leaves an otherwise valid edge `Active` with `isTelemetryReady = true` while current availability becomes offline; and so `POST /re-enable-onboarding` moves a blocked edge to `Re-onboarding Required`, discloses no onboarding secret, keeps the edge not telemetry-ready, does not create a new valid onboarding package until a later explicit `POST /onboarding/reset` issues one, and leaves previously blocked or superseded onboarding secrets unusable
- [ ] T045 [P] Validate onboarding-to-first-telemetry within 10 minutes under normal Windows conditions in `specs/006-edge-runtime-windows-mvp/quickstart.md` and `edge_server/go_core/tests/integration/runtime_smoke_test.go`

### Implementation For Phase 3

- [ ] T024 Freeze the minimal local source contract for future Rust work in `specs/006-edge-runtime-windows-mvp/contracts/local-hardware-adapter-contract.md` and `edge_server/go_core/internal/source/adapter.go`
- [X] T030 [US3] Implement trust-loss handling and immediate telemetry stop in `edge_server/go_core/internal/cloud/events.go`, `edge_server/go_core/internal/runtime/runtime.go`, and `edge_server/go_core/internal/runtime/telemetry_pipeline.go` so the runtime distinguishes credential-reset trust loss (`trust_revoked`, `blocked`) from disconnect-only loss (`edge_forced_disconnect`, ordinary socket disconnect), stops telemetry as soon as the loss is known, clears the current reconnect path only for the credential-reset cases, treats rejected reconnects as untrusted outcomes, and resumes telemetry only after a later cloud-accepted trust path succeeds again
- [X] T032 [US3] Implement fresh re-onboarding flow that preserves stable source definitions while requiring newly supplied operator onboarding input after trust loss or rejected reconnect, with no implicit reuse of a previously consumed onboarding package, in `edge_server/go_core/internal/runtime/onboarding.go`, `edge_server/go_core/internal/runtime/runtime.go`, and `edge_server/go_core/internal/config/config.go`
- [ ] T051 [US3] Freeze the first hardware-readiness seam and document the go/no-go checkpoint in `specs/006-edge-runtime-windows-mvp/plan.md`, `specs/006-edge-runtime-windows-mvp/data-model.md`, and `specs/006-edge-runtime-windows-mvp/quickstart.md`

**Checkpoint**: The runtime enforces trust-loss safety, recovery depends on a valid future onboarding path, and the local source seam is ready for the first Rust integration task without changing the cloud-facing contract.

---

## Deferred From This Task List

The following earlier ideas are intentionally not part of the active MVP backlog:

- persisted reconnect files
- `runtime-state.json` and `status.json`
- filesystem ACL work
- telemetry backlog, replay, and overflow
- TypeScript bootstrap parity work
- external Rust mock worker
- worker supervision
- Linux deployment parity
- operator status commands

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1**: Starts immediately and establishes the narrow MVP foundation.
- **Phase 2**: Depends on Phase 1 because trusted telemetry requires config, runtime session state, and cloud event handling.
- **Phase 3**: Depends on Phase 2 because trust-loss safety must stop an already functioning telemetry path.

### Within Each Phase

- Write the listed tests first and confirm the target behavior is not already covered.
- Keep cloud contract compatibility ahead of implementation shortcuts.
- Finish each phase checkpoint before starting Rust-facing work.

---

## Parallel Opportunities

- `T005`, `T007`, `T008`, `T008b`, and `T009` can run in parallel after `T001` when they do not touch the same files.
- `T011b`, `T012b`, and `T018` can run in parallel for Phase 2 after the original completed coverage is reviewed.
- `T028`, `T029`, and `T045` can run in parallel for Phase 3.

---

## Implementation Strategy

1. Finish Phase 1 and make the runtime able to represent trust and connection state in memory only.
2. Finish Phase 2 and validate first onboarding to first trusted telemetry on Windows.
3. Finish Phase 3 and stop only after the runtime is safe enough for hardware-facing work.
4. Begin Rust hardware integration only after the Phase 3 checkpoint is green.

---

## Notes

- Active stories covered: `US1`, `US2`, `US3`
- Active task count: `24`
- This task list defines a separate delivery slice for `001-edge-runtime`; it does not replace the broader parent feature.
