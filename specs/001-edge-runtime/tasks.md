# Tasks: Production-Shaped Local Edge Runtime

**Input**: Design documents from `/specs/001-edge-runtime/`  
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Tests**: Tests are required for this feature because the specification and plan explicitly call for Go contract/integration coverage, retained TypeScript fixture regression, Rust contract tests, and quickstart validation against the existing cloud lifecycle contract.

**Organization**: Tasks are grouped by user story so each increment can be implemented and validated independently while preserving cloud-owned trust semantics and telemetry-derived visibility. Adapter-bridge and real-hardware work are split into later non-story phases so trusted runtime and cloud-contract parity can land before physical polling hardware is available.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: User story label (`US1`, `US2`, `US3`, `US4`)
- Every task includes exact file paths for direct execution

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Scaffold the Go-first runtime, Rust worker workspace, and validation harnesses before trust or telemetry behavior is implemented.

- [X] T001 Scaffold the Go runtime workspace and bootstrap entrypoint in `edge_server/go_core/go.mod`, `edge_server/go_core/cmd/edge-runtime/main.go`, and `edge_server/go_core/internal/runtime/runtime.go`
- [ ] T002 [P] Scaffold the Rust worker workspace and crate manifests in `edge_server/rust_worker/Cargo.toml`, `edge_server/rust_worker/crates/edge_adapter_contract/Cargo.toml`, `edge_server/rust_worker/crates/mock_adapter/Cargo.toml`, and `edge_server/rust_worker/crates/hardware_worker/Cargo.toml`
- [X] T003 [P] Create runtime fixture and smoke-test scaffolds in `edge_server/tests/fixtures/runtime/config.yaml`, `edge_server/tests/fixtures/runtime/onboarding-package.json`, and `edge_server/go_core/tests/integration/runtime_smoke_test.go`; treat `edge_server/tests/fixtures/runtime/valid/credential.json`, `edge_server/tests/fixtures/runtime/partial-corrupt/credential.json`, `edge_server/tests/fixtures/runtime/legacy-onboarding/credential.json`, and `edge_server/tests/fixtures/runtime/wrong-edge-id/edge_activation.json` as auxiliary reference fixtures only, not as the source of truth
- [X] T004 [P] Create contract-test harnesses for cloud lifecycle parity and retained TypeScript fixtures in `edge_server/go_core/tests/contract/edge_contract_test.go`, `client/tests/unit/repro_task_T010.test.ts`, and `client/tests/unit/repro_task_T021.test.ts`; the runtime fixture files under `edge_server/tests/fixtures/runtime/` may be used as auxiliary test inputs, but the primary authority remains `specs/001-edge-runtime/contracts/*` plus the cloud lifecycle contract

**Checkpoint**: Repository scaffolding is ready for shared runtime foundations.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Build the shared config, persistence, transport, adapter, and observability foundations that every user story depends on.

**CRITICAL**: No user story should be considered complete until this phase is finished.

- [X] T005 Implement operator config parsing and validation for stable source definitions in `edge_server/go_core/internal/config/config.go` and `edge_server/go_core/internal/config/config_test.go`
- [X] T006 [P] Implement atomic local state stores for `credential.json`, `runtime-state.json`, and `status.json` in `edge_server/go_core/internal/state/credential_store.go`, `edge_server/go_core/internal/state/runtime_state_store.go`, and `edge_server/go_core/internal/state/status_store.go`
- [X] T007 [P] Implement Socket.IO cloud transport abstractions and normalized lifecycle event parsing in `edge_server/go_core/internal/cloud/transport.go`, `edge_server/go_core/internal/cloud/socketio_client.go`, and `edge_server/go_core/internal/cloud/events.go`
- [ ] T008 [P] Implement versioned source-adapter interfaces and the in-process mock adapter scaffold in `edge_server/go_core/internal/source/adapter.go`, `edge_server/go_core/internal/source/manager.go`, and `edge_server/go_core/internal/mockadapter/adapter.go`
- [X] T009 [P] Implement shared runtime observability primitives for structured logging, session epochs, and operator outcome mapping in `edge_server/go_core/internal/runtime/session_epoch.go`, `edge_server/go_core/internal/operator/logger.go`, and `edge_server/go_core/internal/operator/outcomes.go`
- [ ] T010 If the temporary TypeScript examples still remain in the repo, keep them clearly development-only and non-authoritative while Go parity grows in `edge_server/src/config/env.ts`, `edge_server/src/onboarding/activateEdge.ts`, `edge_server/src/onboarding/persistedCredentialStore.ts`, and `edge_server/src/transport/cloudSocketClient.ts`
- [X] T043 [P] Define and verify Windows-first filesystem permission expectations for `credential.json`, `runtime-state.json`, and `status.json` in `edge_server/go_core/internal/state/file_permissions.go`, `specs/001-edge-runtime/contracts/runtime-state-files.md`, and `specs/001-edge-runtime/quickstart.md`

**Checkpoint**: Shared runtime foundations are in place; story work can proceed in dependency order.

---

## Phase 3: User Story 1 - Establish And Resume Trusted Runtime (Priority: P1) MVP

**Goal**: Let a new edge complete first onboarding once, persist reconnect material locally, and resume through trusted reconnect on later restarts.

**Independent Test**: Start with no trusted local state and a valid onboarding package, confirm onboarding succeeds and reconnect state is saved, then restart without the onboarding package and verify trusted reconnect succeeds from persisted state.

### Tests for User Story 1

- [ ] T011 [P] [US1] Add Go contract coverage for first onboarding, persisted reconnect preference, and corrupt credential fallback in `edge_server/go_core/tests/contract/onboarding_reconnect_test.go`; use the persisted credential and wrong-`edgeId` fixtures under `edge_server/tests/fixtures/runtime/` as auxiliary regression inputs only
- [ ] T012 [P] [US1] Extend the cloud lifecycle oracle for Go runtime activation and reconnect paths in `cloud_server/tests/integration/edge-onboarding.test.ts` and `cloud_server/tests/unit/edge-onboarding.service.test.ts`
- [ ] T013 [P] [US1] Add regression coverage for TypeScript bootstrap fixture parity in `client/tests/unit/repro_task_T010.test.ts` and `client/tests/unit/repro_task_T021.test.ts`
- [ ] T044 [P] [US1] Add crash-window persistence coverage for accepted onboarding before durable reconnect-state commit in `edge_server/go_core/tests/contract/onboarding_reconnect_test.go` and `edge_server/go_core/tests/integration/runtime_smoke_test.go`

### Implementation for User Story 1

- [ ] T014 [US1] Implement onboarding bootstrap and persisted reconnect selection in `edge_server/go_core/internal/runtime/bootstrap.go`, `edge_server/go_core/internal/runtime/onboarding.go`, and `edge_server/go_core/cmd/edge-runtime/main.go`
- [ ] T015 [US1] Implement activation credential persistence and trust-mode transitions in `edge_server/go_core/internal/state/credential_store.go`, `edge_server/go_core/internal/state/runtime_state_store.go`, and `edge_server/go_core/internal/runtime/runtime.go`
- [ ] T016 [US1] Implement cloud handshake payload building and activation event handling in `edge_server/go_core/internal/cloud/socketio_client.go`, `edge_server/go_core/internal/cloud/events.go`, and `edge_server/go_core/internal/cloud/auth_payload.go`
- [ ] T017 [US1] If the temporary TypeScript examples still exist, keep their bootstrap behavior close enough for regression comparison without treating them as runtime truth in `edge_server/src/onboarding/activateEdge.ts`, `edge_server/src/onboarding/persistedCredentialStore.ts`, and `edge_server/src/transport/cloudSocketClient.ts`

**Checkpoint**: A newly installed edge can become trusted once and later restart through persisted reconnect without reusing the one-time onboarding package.

---

## Phase 4: User Story 2 - Poll And Publish Trusted Telemetry (Priority: P1)

**Goal**: Poll configured sources, batch canonical telemetry, buffer during connectivity-only interruptions, and keep cloud/client visibility derived from telemetry already received by cloud.

**Independent Test**: Run a trusted edge against configured in-process or mock-backed sources, verify multi-device and multi-metric telemetry reaches cloud in regular bounded batches, simulate a connectivity-only interruption, then confirm backlog replays chronologically before live telemetry resumes.

### Tests for User Story 2

- [ ] T018 [P] [US2] Add Go integration coverage for polling, bounded batching, backlog replay ordering, overflow signaling, and multi-device multi-metric emission in `edge_server/go_core/tests/integration/telemetry_pipeline_test.go`
- [ ] T019 [P] [US2] Extend cloud telemetry and catalog validation for edge-local `deviceId` identity in `cloud_server/tests/integration/telemetry.resilience.test.ts`, `cloud_server/tests/integration/edge-servers.catalog.test.ts`, and `cloud_server/tests/unit/telemetry-aggregator.test.ts`
- [ ] T020 [P] [US2] Add client visibility regression coverage for telemetry-derived device and metric catalogs in `client/tests/integration/TelemetryWorkflowReadiness.test.tsx` and `client/tests/unit/edgeServers.normalization.test.ts`

### Implementation for User Story 2

- [ ] T021 [US2] Implement bounded trusted telemetry batching and canonical payload emission in `edge_server/go_core/internal/runtime/telemetry_pipeline.go`, `edge_server/go_core/internal/runtime/batcher.go`, and `edge_server/go_core/internal/cloud/telemetry_client.go`
- [ ] T022 [US2] Implement bounded connectivity-only backlog buffering, overflow outcomes, and chronological replay in `edge_server/go_core/internal/buffer/backlog.go`, `edge_server/go_core/internal/runtime/replay.go`, and `edge_server/go_core/internal/runtime/session_epoch.go`
- [ ] T023 [US2] Implement stable source-definition application and normalized reading ingestion for the in-process mock adapter in `edge_server/go_core/internal/source/manager.go`, `edge_server/go_core/internal/source/readings.go`, and `edge_server/go_core/internal/mockadapter/adapter.go`
- [ ] T027 [US2] Align cloud ingestion and visibility derivation with `edgeId + deviceId` identity semantics in `cloud_server/src/socket/events/telemetry.ts`, `cloud_server/src/services/telemetry-aggregator.service.ts`, and `cloud_server/src/models/Telemetry.ts`

**Checkpoint**: Trusted runtime sessions can publish canonical telemetry from the active adapter path while cloud and client visibility remain telemetry-derived only.

---

## Phase 5: User Story 3 - Recover Safely From Trust Loss (Priority: P1)

**Goal**: Stop trusted behavior immediately on revoke, block, forced disconnect, or rejected reconnect, and resume only after a valid fresh onboarding cycle succeeds.

**Independent Test**: Run a trusted edge that is publishing telemetry, trigger revoke, block, forced disconnect, invalid reconnect, and re-enable flows from cloud, then verify trusted telemetry stops immediately and restarts only after successful re-onboarding.

### Tests for User Story 3

- [ ] T028 [P] [US3] Add Go integration coverage for revoke, block, forced disconnect, reconnect rejection, and re-onboarding recovery in `edge_server/go_core/tests/integration/trust_loss_recovery_test.go`
- [ ] T029 [P] [US3] Extend cloud lifecycle contract coverage for forced-disconnect reasons and re-enable semantics in `cloud_server/tests/integration/edge-onboarding.test.ts` and `cloud_server/tests/integration/edge-servers.test.ts`

### Implementation for User Story 3

- [ ] T030 [US3] Implement trust-loss event handling and immediate telemetry stop in `edge_server/go_core/internal/cloud/events.go`, `edge_server/go_core/internal/runtime/runtime.go`, and `edge_server/go_core/internal/runtime/telemetry_pipeline.go`
- [ ] T031 [US3] Implement backlog invalidation and recovery-needed transitions for rejected or revoked sessions in `edge_server/go_core/internal/buffer/backlog.go`, `edge_server/go_core/internal/state/runtime_state_store.go`, and `edge_server/go_core/internal/operator/outcomes.go`
- [ ] T032 [US3] Implement fresh re-onboarding flow that replaces revoked credentials but preserves stable source definitions in `edge_server/go_core/internal/runtime/onboarding.go`, `edge_server/go_core/internal/state/credential_store.go`, and `edge_server/go_core/internal/config/config.go`
- [ ] T033 [US3] Persist and surface operator-visible reject, disconnect, and overflow reasons across restart in `edge_server/go_core/internal/state/status_store.go`, `edge_server/go_core/internal/operator/status_snapshot.go`, and `edge_server/go_core/cmd/edge-runtime/main.go`

**Checkpoint**: Trust loss acts as a hard safety boundary, buffered data from invalid sessions is discarded, and fresh onboarding is required before trusted telemetry returns.

---

## Phase 6: User Story 4 - Operate With Minimal Local Support And Future Deployment Flexibility (Priority: P3)

**Goal**: Provide minimal local bootstrap and recovery support now while keeping runtime behavior portable to future non-desktop edge deployments.

**Independent Test**: Start, restart, inspect status, and recover the runtime using only the minimal local support surface, then confirm the same file layout and process model still fit both Windows MVP usage and later Linux-style deployment.

### Tests for User Story 4

- [ ] T034 [P] [US4] Add Go smoke coverage for minimal local support and operator-readable status snapshots in `edge_server/go_core/tests/integration/operator_status_test.go`

### Implementation for User Story 4

- [ ] T036 [US4] Implement operator-readable `status.json` snapshots and recovery guidance output in `edge_server/go_core/internal/operator/status_snapshot.go`, `edge_server/go_core/internal/operator/recovery_guidance.go`, and `edge_server/go_core/internal/state/status_store.go`
- [ ] T037 [US4] Implement runtime startup and `status` commands that work without a full UI in `edge_server/go_core/cmd/edge-runtime/main.go`, `edge_server/go_core/internal/runtime/bootstrap.go`, and `edge_server/tests/fixtures/runtime/config.yaml`
- [ ] T039 [US4] Document cross-platform host layout, file ownership, and minimal operator flow in `specs/001-edge-runtime/quickstart.md`, `specs/001-edge-runtime/contracts/runtime-state-files.md`, and `edge_server/tests/fixtures/runtime/config.yaml`; keep `edge_server/tests/fixtures/runtime/README.md` aligned as an auxiliary fixture guide rather than a normative contract

**Checkpoint**: Operators can bootstrap and recover the runtime locally without a dedicated UI, and the same runtime model remains suitable for future dedicated edge deployments.

---

## Phase 7: Adapter Boundary And Rust Mock Worker

**Purpose**: Freeze the local Go/Rust contract and prove the external worker bridge without blocking trusted telemetry work on real hardware.

### Tests for Adapter Boundary And Rust Mock Worker

- [ ] T035 [P] Add Rust contract and mock-worker health coverage in `edge_server/rust_worker/crates/edge_adapter_contract/tests/contract_schema.rs` and `edge_server/rust_worker/crates/mock_adapter/tests/worker_flow.rs`

### Implementation for Adapter Boundary And Rust Mock Worker

- [ ] T024 Freeze the versioned local adapter schema in `edge_server/rust_worker/crates/edge_adapter_contract/src/lib.rs` and `specs/001-edge-runtime/contracts/local-hardware-adapter-contract.md`
- [ ] T025 Implement the external Rust mock worker and Go worker-process bridge without changing cloud payloads in `edge_server/rust_worker/crates/mock_adapter/src/main.rs`, `edge_server/go_core/internal/source/worker_client.go`, and `edge_server/go_core/internal/source/worker_supervisor.go`
- [ ] T038 Implement worker supervision, heartbeat tracking, and adapter-state persistence for future deployment targets when external worker mode is enabled in `edge_server/go_core/internal/source/worker_supervisor.go`, `edge_server/go_core/internal/source/worker_client.go`, and `edge_server/go_core/internal/operator/status_snapshot.go`

**Checkpoint**: The Go core can swap from the in-process mock adapter to an external Rust mock worker without changing cloud-facing contracts.

---

## Phase 8: Real Hardware Pilot

**Purpose**: Add the first real polling target only when hardware access is available, while preserving all earlier contract and telemetry behavior.

### Tests for Real Hardware Pilot

- [ ] T048 [P] Add Rust polling-flow coverage for the first real hardware adapter in `edge_server/rust_worker/crates/hardware_worker/tests/polling_flow.rs`

### Implementation for Real Hardware Pilot

- [ ] T026 Implement the first real polling adapter behind the same contract in `edge_server/rust_worker/crates/hardware_worker/src/lib.rs`, `edge_server/rust_worker/crates/hardware_worker/src/modbus_worker.rs`, and `edge_server/tests/fixtures/runtime/config.yaml`

**Checkpoint**: The runtime can replace the mock worker with the first real hardware adapter without changing cloud-facing semantics.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Sync contracts, validate measurable outcomes, and cleanly freeze the old TypeScript runtime stubs as fixtures after Go parity lands.

- [ ] T040 [P] Sync runtime contracts and data model with the implemented Go/Rust message shapes in `specs/001-edge-runtime/contracts/cloud-runtime-contract.md`, `specs/001-edge-runtime/contracts/local-hardware-adapter-contract.md`, `specs/001-edge-runtime/contracts/runtime-state-files.md`, and `specs/001-edge-runtime/data-model.md`
- [ ] T041 [P] Run quickstart validation across cloud lifecycle, Go runtime, retained TypeScript fixtures, and Rust workers using `specs/001-edge-runtime/quickstart.md`, `edge_server/go_core/tests/contract/onboarding_reconnect_test.go`, `edge_server/go_core/tests/integration/telemetry_pipeline_test.go`, and `edge_server/rust_worker/crates/mock_adapter/tests/worker_flow.rs`; the files under `edge_server/tests/fixtures/runtime/` remain auxiliary validation inputs and must not replace the documented contracts
- [ ] T042 Remove the temporary TypeScript examples or relocate any still-useful remnants into explicit fixture and test-support status after Go parity is proven in `edge_server/src/config/env.ts`, `edge_server/src/onboarding/activateEdge.ts`, `edge_server/src/onboarding/persistedCredentialStore.ts`, and `edge_server/src/transport/cloudSocketClient.ts`
- [ ] T045 [P] Validate first onboarding to first accepted telemetry within 10 minutes under normal conditions in `specs/001-edge-runtime/quickstart.md` and `edge_server/go_core/tests/integration/runtime_smoke_test.go`
- [ ] T046 [P] Validate first trusted telemetry batch within 60 seconds after a normal restart in `specs/001-edge-runtime/quickstart.md` and `edge_server/go_core/tests/integration/telemetry_pipeline_test.go`
- [ ] T047 [P] Validate operator status discovery within 2 minutes using only `status.json` and the runtime status command in `specs/001-edge-runtime/quickstart.md` and `edge_server/go_core/tests/integration/operator_status_test.go`

**Checkpoint**: Contracts, measurable validations, and migration cleanup are aligned for the full feature.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies; start immediately.
- **Phase 2 (Foundational)**: Depends on Phase 1 and blocks all user stories.
- **Phase 3 (US1)**: Depends on Phase 2; establishes the trusted runtime MVP and cloud-contract parity.
- **Phase 4 (US2)**: Depends on US1 because trusted polling and telemetry require a valid trusted session and persisted reconnect behavior. It does not depend on real hardware.
- **Phase 5 (US3)**: Depends on US1 and US2 because trust-loss handling must stop an already functioning telemetry pipeline.
- **Phase 6 (US4)**: Depends on Phase 2 and benefits from US1-US3 because local operator support should reflect the real runtime states.
- **Phase 7 (Adapter Boundary And Rust Mock Worker)**: Depends on Phase 2 and can begin after US1 if early Go-to-Rust integration is desired before real polling hardware is available.
- **Phase 8 (Real Hardware Pilot)**: Depends on Phase 7 and available hardware access.
- **Phase 9 (Polish)**: Depends on all targeted phases being complete; Phase 8 is required only if the current delivery scope includes the first real hardware pilot.

### User Story Dependencies

- **US1**: Starts first after Foundational and has no dependency on other stories.
- **US2**: Requires US1 because a trusted session and persisted reconnect contract must already exist before telemetry delivery is meaningful.
- **US3**: Requires US1 and US2 because trust-loss behavior is defined by stopping and invalidating active trusted telemetry.
- **US4**: Can begin after Foundational for basic scaffolding, but should finish after US1-US3 so status and recovery guidance reflect the real lifecycle.

### Within Each User Story

- Write the listed tests first and confirm they fail before implementing the story.
- Cloud contract compatibility before migration cleanup.
- Config and persisted state before runtime orchestration.
- Bounded telemetry gating before backlog replay and any external worker swap.
- Finish each story checkpoint before treating the next priority as complete.

---

## Parallel Opportunities

- `T002`, `T003`, and `T004` can run in parallel after the Go workspace target from `T001` is clear.
- `T006`, `T007`, `T008`, `T009`, and `T043` can run in parallel once `T005` fixes the config and state shape.
- `T011`, `T012`, `T013`, and `T044` can run in parallel for US1 because Go, cloud, TypeScript, and crash-window coverage touch separate files.
- `T018`, `T019`, and `T020` can run in parallel for US2 because Go, cloud, and client telemetry validations are isolated.
- `T024` should land before `T025` and `T038`; after that, `T025` and `T038` can proceed in parallel on separate files.
- `T040`, `T041`, `T045`, `T046`, and `T047` can run in parallel during Polish once implementation stabilizes.

---

## Parallel Example: User Story 1

```text
T011 [US1] Add Go contract coverage in edge_server/go_core/tests/contract/onboarding_reconnect_test.go
T012 [US1] Extend cloud lifecycle oracle coverage in cloud_server/tests/integration/edge-onboarding.test.ts and cloud_server/tests/unit/edge-onboarding.service.test.ts
T013 [US1] Add TypeScript fixture regression coverage in client/tests/unit/repro_task_T010.test.ts and client/tests/unit/repro_task_T021.test.ts
T044 [US1] Add crash-window persistence coverage in edge_server/go_core/tests/integration/runtime_smoke_test.go
```

## Parallel Example: User Story 2

```text
T018 [US2] Add Go telemetry pipeline coverage in edge_server/go_core/tests/integration/telemetry_pipeline_test.go
T019 [US2] Extend cloud telemetry/catalog validation in cloud_server/tests/integration/telemetry.resilience.test.ts and cloud_server/tests/integration/edge-servers.catalog.test.ts
T020 [US2] Add client telemetry-derived visibility regression coverage in client/tests/integration/TelemetryWorkflowReadiness.test.tsx and client/tests/unit/edgeServers.normalization.test.ts
```

## Parallel Example: User Story 3

```text
T028 [US3] Add Go trust-loss recovery coverage in edge_server/go_core/tests/integration/trust_loss_recovery_test.go
T029 [US3] Extend cloud forced-disconnect and re-enable coverage in cloud_server/tests/integration/edge-onboarding.test.ts and cloud_server/tests/integration/edge-servers.test.ts
```

## Parallel Example: Adapter Boundary And Rust Mock Worker

```text
T024 Freeze the local adapter contract in edge_server/rust_worker/crates/edge_adapter_contract/src/lib.rs
T025 Implement the Rust mock worker bridge in edge_server/rust_worker/crates/mock_adapter/src/main.rs and edge_server/go_core/internal/source/worker_client.go
T038 Implement worker supervision in edge_server/go_core/internal/source/worker_supervisor.go
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 and Phase 2.
2. Complete Phase 3 (`US1`).
3. Validate first onboarding, persisted reconnect, and corrupt-state fallback independently.
4. Stop for review before moving into telemetry delivery.

### Contract-First Path (Recommended For Current Constraints)

1. Complete Phase 1 and Phase 2.
2. Complete Phase 3 (`US1`) to reach Go-first cloud-contract parity and trusted reconnect.
3. If early Go-to-Rust integration is valuable now, complete Phase 7 with the Rust mock worker before any real hardware work.
4. Complete Phase 4 (`US2`) using the in-process mock adapter or the completed Rust mock worker bridge.
5. Complete Phase 5 (`US3`) to harden trust-loss safety before expanding deployment behavior.
6. Complete Phase 6 (`US4`) to finalize the minimal operator surface and deployment flexibility.
7. Defer Phase 8 until hardware access exists, then land the first real polling adapter.
8. Finish with Phase 9 validation, contract sync, and TypeScript fixture cleanup.

### Incremental Delivery

1. Deliver `US1` to establish trusted runtime bootstrap and restart behavior.
2. Deliver `US2` to add trusted polling, batching, buffering, and telemetry-derived visibility without depending on real hardware.
3. Deliver `US3` to harden revoke, block, disconnect, and re-onboarding safety flows.
4. Deliver `US4` to finalize minimal operator support and deployment portability.
5. Add the external mock worker bridge when Go-to-Rust integration becomes useful for the team.
6. Add the first real hardware pilot only when hardware access is available.
7. Finish with contract sync, measurable validation, and migration cleanup.

### Suggested MVP Scope

- `US1` only for the smallest independently demonstrable increment.
- Add `US2` next for the first trusted telemetry path.
- Add `US3` next to enforce the safety boundary around trust loss.
- Add `US4` next to complete operator support and deployment portability.
- Pull Phase 7 earlier than `US4` if the team wants to lock the Go-to-Rust boundary before touching real hardware.

---

## Notes

- Total stories covered: `US1`, `US2`, `US3`, `US4`
- Total tasks: `48`
- Story task counts: `US1 = 8`, `US2 = 7`, `US3 = 6`, `US4 = 4`
- Additional non-story task counts: `Setup = 4`, `Foundational = 7`, `Adapter Bridge = 4`, `Real Hardware Pilot = 2`, `Polish = 6`
- All tasks follow the required checklist format: checkbox, task ID, optional `[P]`, required story label for story phases, and exact file paths
