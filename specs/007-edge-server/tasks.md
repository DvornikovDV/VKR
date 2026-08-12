# Tasks: Windows-First Edge Runtime Under Existing Cloud Authority

**Input**: Design documents from `/specs/007-edge-server/`  
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Tests**: Tests are required for this feature because the specification and plan explicitly require Go unit, contract, integration, and Windows-first smoke validation for the production `edge_server/go_core` runtime.

**Organization**: Tasks follow the implementation phases from `plan.md` while preserving user-story labels from `spec.md`: setup and local-state foundations first, then `persistent-credential bootstrap`, `real adapter path and telemetry normalization`, `credential rotation`, `block/unblock`, and finally `verification and legacy retirement`.

## Proposed Phases

- `Setup`: retarget fixtures and harnesses from onboarding-first references to the `007` persistent-credential baseline.
- `Foundational`: split operator config, credential file, runtime-state file, operator status file, and transient memory before story work.
- `US1 / Persistent-Credential Bootstrap`: replace onboarding-package and `edge_activation` hot-path semantics with startup from `credential.json`.
- `US2 / Real Adapter Path And Telemetry Normalization`: make one real hardware-facing adapter path the production runtime path and keep mock/smoke harnesses secondary.
- `US3 / Credential Rotation`: stop trusted telemetry on `credential_rotated`, reject old credentials, and resume only with a replaced credential file.
- `US4 / Block And Unblock`: reflect cloud-owned block/unblock outcomes locally without reviving activation-driven trust or `re_onboarding_required`.
- `Verification And Legacy Retirement`: prove the new production path and quarantine or retire legacy onboarding code, tests, and fixtures.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: User story label (`US1`, `US2`, `US3`, `US4`)
- Every task includes exact file paths for direct execution

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Rebase fixtures and validation harnesses onto the `007-edge-server` production target before runtime semantics are changed.

- [X] T001 Replace persistent-runtime fixture inputs in `edge_server/tests/fixtures/runtime/config.yaml`, `edge_server/tests/fixtures/runtime/valid/credential.json`, `edge_server/tests/fixtures/runtime/partial-corrupt/credential.json`, and `edge_server/tests/fixtures/runtime/README.md`
- [X] T002 [P] Rewire `edge_server/go_core/tests/contract/edge_contract_test.go` and `edge_server/go_core/tests/integration/runtime_smoke_test.go` to use `specs/007-edge-server/*`, `specs/001-cloud-server/contracts/websocket.md`, and `cloud_server/openapi.yaml` as the authority set
- [X] T003 [P] Quarantine legacy onboarding reference fixtures from production acceptance in `edge_server/tests/fixtures/runtime/onboarding-package.json`, `edge_server/tests/fixtures/runtime/legacy-onboarding/credential.json`, and `edge_server/tests/fixtures/runtime/wrong-edge-id/edge_activation.json`

**Checkpoint**: Fixtures and harnesses point at the `007` baseline instead of the onboarding-first runtime.

---

## Phase 2: Foundational - Local State And Operator Visibility

**Purpose**: Build the blocking local-file, state, and operator-status foundation that every story depends on.

**CRITICAL**: No user story should be treated as complete until config, credential, runtime-state, status, and transient-memory semantics are separated correctly.

- [X] T004 Replace operator config parsing and validation with `runtime.edgeId`, `runtime.stateDir`, reconnect settings, and stable source validation in `edge_server/go_core/internal/config/config.go` and `edge_server/go_core/internal/config/config_test.go`
- [X] T005 [P] Replace `credential.json` persistence semantics with the persistent-only `edgeId`, `credentialSecret`, `version`, `issuedAt`, `source`, and `installedAt` schema in `edge_server/go_core/internal/state/credential_store.go` and `edge_server/go_core/internal/state/state_store_test.go`
- [X] T006 [P] Replace `runtime-state.json` persistence semantics so the file explicitly tracks credential status, session state, auth outcome, retry eligibility, and source revision in `edge_server/go_core/internal/state/runtime_state_store.go` and `edge_server/go_core/internal/runtime/runtime_state.go`
- [X] T007 [P] Replace operator status mapping with the `runtimeStatus`, `cloudConnection`, `authSummary`, `sourceSummary`, and `loadedCredentialVersion` contract in `edge_server/go_core/internal/state/status_store.go`, `edge_server/go_core/internal/operator/outcomes.go`, and `edge_server/go_core/internal/operator/observability_behavior_test.go`
- [X] T008 [P] Create operator snapshot projection helpers for the local status contract in `edge_server/go_core/internal/operator/status_snapshot.go` and `edge_server/go_core/internal/operator/status_snapshot_test.go`
- [X] T009 Rewire startup file initialization and Windows-safe persistence boundaries for `credential.json`, `runtime-state.json`, and `status.json` in `edge_server/go_core/internal/runtimeapp/process.go`, `edge_server/go_core/internal/state/file_store.go`, `edge_server/go_core/internal/state/file_permissions.go`, and `edge_server/go_core/internal/state/file_permissions_behavior_test.go`

**Checkpoint**: The runtime has a clear local split between operator config, credential file, runtime-state file, operator status file, and transient in-memory state.

---

## Phase 3: User Story 1 - Persistent-Credential Bootstrap (Priority: P1) MVP

**Goal**: Start the production runtime from `edge-runtime.yaml` plus `credential.json`, establish trusted `/edge` connectivity with the current credential only, and remove onboarding-package and `edge_activation` from the hot path.

**Independent Test**: Start the runtime with a valid config and current `credential.json`, verify cloud accepts the session and trusted telemetry becomes possible, then prove missing or invalid credentials fail without any active dependence on onboarding-package or activation-driven trust.

### Tests for User Story 1

- [X] T010 [P] [US1] Rewrite `edge_server/go_core/tests/contract/onboarding_session_test.go` into persistent-bootstrap contract coverage that proves `credential.json` is the only auth input, covers `unknown edge` and one-accepted-session rejection semantics from the active `/edge` contract, and explicitly removes `onboarding package` and `edge_activation` expectations; RED-first rewrite is allowed, but mark `[X]` only after GREEN is demonstrated on the production runtime-owned auth path (`cmd/edge-runtime` + `runtimeapp` + `runtime/bootstrap`) after `T012`, `T013`, and `T014`
- [X] T011 [P] [US1] Rewrite `edge_server/go_core/tests/integration/runtime_smoke_test.go` for `--config` plus local credential startup, accepted trusted connect, missing credential, invalid credential, `unknown edge`, concurrent-session denial, and absence of active dependence on the old onboarding path; RED-first rewrite is allowed, but mark `[X]` only after GREEN is demonstrated on the same production startup/auth path after `T012`, `T013`, and `T014`, and do not accept helper-only, fixture-only, or smoke-only proof

### Implementation for User Story 1

- [X] T012 [US1] Replace bootstrap semantics in `edge_server/go_core/internal/runtime/bootstrap.go`, `edge_server/go_core/internal/runtime/runtime.go`, and `edge_server/go_core/internal/runtime/runtime_state.go`, explicitly removing `onboarding package`, activation-driven trust promotion, and `re_onboarding_required` from the production hot path
- [X] T013 [US1] Replace cloud handshake and lifecycle parsing with the active `/edge` contract in `edge_server/go_core/internal/cloud/auth_payload.go`, `edge_server/go_core/internal/cloud/events.go`, and `edge_server/go_core/internal/cloud/socketio_client.go`, including current rejection handling for `unknown edge` and one-accepted-session semantics, and explicitly removing `edge_activation`, `onboarding_not_allowed`, `onboarding_package_missing`, `onboarding_package_expired`, `onboarding_package_reused`, and `persistent_credential_revoked`
- [X] T014 [US1] Rewire the production entrypoint to bootstrap from `runtime.stateDir` and current `credential.json`, and drop `--onboarding-package` flags from `edge_server/go_core/cmd/edge-runtime/main.go` and `edge_server/go_core/internal/runtimeapp/process.go`

**Checkpoint**: The main runtime path starts from persistent credentials only and no longer depends on onboarding-package or activation events.

---

## Phase 4: User Story 2 - Real Adapter Path And Telemetry Normalization (Priority: P1)

**Goal**: Make one generic `modbus_rtu` hardware-facing adapter path the main runtime path, normalize mapping-driven readings into the cloud-owned telemetry envelope, and keep mock-only harnesses secondary.

**Independent Test**: Run one trusted runtime with a production `modbus_rtu` adapter definition and an automated test RTU/fake client seam, verify canonical telemetry batches contain normalized readings only, prove mappings drive device/metric/register selection without stand-specific code, and prove partial source failure degrades only affected sources while unaffected readings continue under the same trusted session. Physical Arduino COM-port validation is reserved for `T034`.

### Tests for User Story 2

- [X] T015 [P] [US2] Rewrite `edge_server/go_core/tests/integration/telemetry_pipeline_test.go` to prove one production `modbus_rtu` adapter path through an automated RTU/fake client seam, canonical `telemetry { readings[] }` normalization, partial-source degradation, and no promotion of smoke harnesses to runtime acceptance
- [X] T016 [P] [US2] Replace source-boundary coverage in `edge_server/go_core/internal/source/manager_test.go` and `edge_server/go_core/internal/mockadapter/adapter_test.go` so mock behavior stays smoke/reference only while the production adapter contract becomes the acceptance source and adapter selection remains protocol/transport-based

### Implementation for User Story 2

- [X] T017 [US2] Create the first production `modbus_rtu` adapter path in `edge_server/go_core/internal/source/modbus_serial_adapter.go` and `edge_server/go_core/internal/source/modbus_serial_adapter_test.go` using `github.com/simonvetter/modbus` unless a blocking implementation issue is found, covering connection validation, an injectable automated test seam for Modbus reads, one serial transaction at a time, input/holding register reads for telemetry, `scale`, boolean conversion, timeout faults, and invalid mapping rejection; do not treat these tests as physical COM-port proof
- [X] T018 [US2] Replace source application, reading validation, and source-fault health semantics in `edge_server/go_core/internal/source/adapter.go`, `edge_server/go_core/internal/source/manager.go`, and `edge_server/go_core/internal/source/readings.go` so local faults degrade only affected sources, keep stable `deviceId` plus `metric` identities, and never expose Modbus register metadata in cloud-bound readings
- [X] T019 [US2] Replace telemetry batching and wire emission gating in `edge_server/go_core/internal/runtime/telemetry_pipeline.go`, `edge_server/go_core/internal/runtime/batcher.go`, and `edge_server/go_core/internal/cloud/telemetry_client.go` so `sourceId` remains local, Modbus mapping details remain local, and unaffected readings still flow while the trusted session remains accepted
- [X] T020 [US2] Rewire runtime adapter registration so `adapterKind: modbus_rtu` is the production path, add an operator-facing Arduino stand sample config outside test fixtures, and keep `edge_server/go_core/internal/mockadapter/adapter.go` plus `edge_server/tests/fixtures/runtime/config.yaml` as smoke/reference harnesses only

**Checkpoint**: The production runtime path includes one generic `modbus_rtu` hardware-facing adapter and canonical telemetry normalization without treating mock harnesses or Arduino-specific register assumptions as the main acceptance path.

---

## Phase 5: User Story 3 - Rotate Credentials Without Re-Onboarding Semantics (Priority: P1)

**Goal**: Stop trusted telemetry immediately on `credential_rotated`, reject the old credential, and resume only after `credential.json` is replaced with the newly disclosed credential.

**Independent Test**: Run a trusted runtime, trigger `credential_rotated`, verify the active session stops immediately, prove the old credential remains rejected, then replace `credential.json` and verify trusted telemetry resumes without any fallback to onboarding-package or activation-driven trust.

### Tests for User Story 3

- [X] T021 [P] [US3] Rewrite `edge_server/go_core/tests/integration/trust_loss_recovery_test.go` to prove `credential_rotated` disconnect handling, old credential rejection, replacement `credential.json`, and absence of active dependence on `onboarding package`, `edge_activation`, or activation-driven trust
- [X] T022 [P] [US3] Add credential supersession and retry-boundary coverage in `edge_server/go_core/internal/state/state_store_test.go` and `edge_server/go_core/internal/runtime/repro_task_T049_test.go` for rotation-driven stop-and-recover behavior

### Implementation for User Story 3

- [X] T023 [US3] Replace rotation handling in `edge_server/go_core/internal/cloud/events.go`, `edge_server/go_core/internal/runtime/runtime.go`, and `edge_server/go_core/internal/runtime/trust_session_flow.go`, explicitly removing legacy reject/disconnect meanings `trust_revoked`, `persistent_credential_revoked`, and activation-driven trust reset
- [X] T024 [US3] Replace credential supersession and operator-action-required semantics in `edge_server/go_core/internal/state/credential_store.go`, `edge_server/go_core/internal/state/runtime_state_store.go`, and `edge_server/go_core/internal/operator/outcomes.go` so rotated credentials become `superseded` and `credential_replaced` instead of `re_onboarding_required`
- [X] T025 [US3] Rewire runtime restart or reload bootstrap around `credential.json` replacement in `edge_server/go_core/internal/runtime/bootstrap.go`, `edge_server/go_core/cmd/edge-runtime/main.go`, and `specs/007-edge-server/quickstart.md`

**Checkpoint**: Credential rotation no longer re-enters onboarding semantics and trusted runtime recovery depends only on the newly installed credential file.

---

## Phase 6: User Story 4 - Block And Unblock Under Cloud Authority (Priority: P2)

**Goal**: Reflect cloud-owned block and unblock outcomes locally, stop trusted telemetry immediately on block, and resume only after a freshly issued persistent credential is installed.

**Independent Test**: Run a trusted runtime, block the edge, verify trusted telemetry stops and auto-retry does not silently continue as if the credential were still valid, then install the fresh unblock credential and verify trusted telemetry resumes without any onboarding-package fallback.

### Tests for User Story 4

- [X] T026 [P] [US4] Extend `edge_server/go_core/tests/integration/trust_loss_recovery_test.go` and `edge_server/go_core/tests/integration/runtime_smoke_test.go` to prove `blocked` stops trusted telemetry immediately, previous credentials remain rejected, and unblock resumes only after a freshly installed credential file

### Implementation for User Story 4

- [X] T027 [US4] Replace blocked-session handling and retry suppression in `edge_server/go_core/internal/cloud/events.go`, `edge_server/go_core/internal/runtime/runtime.go`, and `edge_server/go_core/internal/runtime/runtime_state.go`, explicitly removing `re_onboarding_required` and legacy reject/disconnect meanings from blocked flows
- [X] T028 [US4] Replace operator-visible blocked, waiting-for-credential, and retryable-disconnect mapping in `edge_server/go_core/internal/state/status_store.go`, `edge_server/go_core/internal/operator/outcomes.go`, and `edge_server/go_core/internal/operator/status_snapshot.go`; prove with existing operator/status unit coverage or one compact table case, not a new runtime or socket integration harness
- [X] T029 [US4] Rewire unblock recovery around fresh persistent credential installation in `edge_server/go_core/internal/state/credential_store.go`, `edge_server/go_core/internal/runtime/bootstrap.go`, and `specs/007-edge-server/quickstart.md`; prove stale-vs-fresh credential replacement at state/bootstrap boundary and reuse the existing T026 integration proof instead of duplicating block/unblock telemetry flow

**Checkpoint**: Block and unblock remain cloud-owned trust decisions and the runtime reflects them locally without reviving onboarding-era semantics.

---

## Phase 7: Verification And Legacy Retirement

**Purpose**: Finalize targeted validation of the implemented production path, keep `007` local contracts in sync, and quarantine or retire onboarding-first runtime remnants without adding new broad harnesses.

- [X] T030 [P] Replace `specs/007-edge-server/data-model.md`, `specs/007-edge-server/contracts/local-source-adapter.md`, `specs/007-edge-server/contracts/operator-status-snapshot.md`, and `specs/007-edge-server/quickstart.md` so they match the implemented local config, credential, runtime-state, status, and production adapter behavior; documentation diff is the deliverable, so do not add new tests unless a referenced command is already stale and must be corrected
- [X] T031 [P] Rewrite `edge_server/go_core/tests/contract/edge_contract_test.go` and `edge_server/go_core/tests/contract/onboarding_session_test.go` as current-contract proofs against `specs/001-cloud-server/contracts/websocket.md` and `cloud_server/openapi.yaml`, explicitly covering `unknown edge` rejection and one-accepted-session behavior without redesigning the cloud-owned contracts in `007`; keep this to contract parsing/normalization and the smallest existing harness extension, with no new end-to-end cloud simulator unless an existing contract test cannot observe the behavior
- [X] T032 Retire or quarantine onboarding-first runtime semantics from the main production path in `edge_server/go_core/internal/runtime/onboarding.go`, `edge_server/go_core/internal/runtime/bootstrap.go`, and `edge_server/go_core/internal/runtime/repro_task_T049_test.go`, explicitly removing `onboarding package`, `edge_activation`, `edge_activation`-driven trust, and legacy reject/disconnect meanings from mainline execution; proof should be existing targeted runtime tests plus a focused absence check for default runtime wiring, not a new integration scenario
- [X] T033 Retire or quarantine the legacy TypeScript reference path as non-production reference only in `edge_server/src/config/env.ts`, `edge_server/src/onboarding/activateEdge.ts`, `edge_server/src/onboarding/persistedCredentialStore.ts`, `edge_server/src/transport/cloudSocketClient.ts`, and `edge_server/tests/fixtures/runtime/README.md`; keep proof to TypeScript compile/targeted reference tests if already present and a focused default-runtime import/use check, not new production behavior tests
- [X] T035 Close the legacy TypeScript boundary systemically, not by local import cleanup only, by moving, retiring, or hard-quarantining `edge_server/src/config/env.ts`, `edge_server/src/onboarding/activateEdge.ts`, `edge_server/src/onboarding/persistedCredentialStore.ts`, and `edge_server/src/transport/cloudSocketClient.ts` so they cannot be read as production runtime code; remove env-driven credential defaults and onboarding or `edge_activation` bootstrap affordances from any retained exported reference API, keep retained credential parsing or storage helpers explicit-input-only, and update `edge_server/tests/fixtures/runtime/README.md` plus `specs/007-edge-server/quickstart.md` only where they clarify that production config is `edge-runtime.yaml` plus `runtime.stateDir/credential.json`; proof should be TypeScript reference compile if TypeScript files are retained, a focused default Go runtime import/use absence check, and no new production behavior tests for the TypeScript path
- [X] T034 [P] Run final quickstart validation after `T035` for trusted connect, Arduino stand Modbus RTU telemetry on a real COM port, partial-source degradation, credential rotation, and block/unblock using `specs/007-edge-server/quickstart.md`, `edge_server/go_core/tests/integration/runtime_smoke_test.go`, `edge_server/go_core/tests/integration/telemetry_pipeline_test.go`, and `edge_server/go_core/tests/integration/trust_loss_recovery_test.go`; this task is validation-only, so do not create new automated harnesses, and record hardware validation evidence separately when the COM device is manually supplied

**Checkpoint**: The persistent-credential production path is proven, legacy onboarding code is no longer in the main runtime path, the legacy TypeScript path cannot look production-authoritative, and `007` local contracts document the implemented behavior.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies; start immediately.
- **Phase 2 (Foundational)**: Depends on Phase 1 and blocks all user stories.
- **Phase 3 (US1 / Persistent-Credential Bootstrap)**: Depends on Phase 2 and delivers the MVP production trust path.
- **Phase 4 (US2 / Real Adapter Path And Telemetry Normalization)**: Depends on Phase 3 because trusted telemetry only matters after the persistent bootstrap path exists.
- **Phase 5 (US3 / Credential Rotation)**: Depends on Phases 3 and 4 because rotation must interrupt a functioning trusted telemetry path.
- **Phase 6 (US4 / Block And Unblock)**: Depends on Phases 3 and 4 and should finish after Phase 5 so blocked and credential-replacement operator states stay coherent.
- **Phase 7 (Verification And Legacy Retirement)**: Depends on all targeted story phases and is where legacy onboarding code is finally quarantined or retired.

### User Story Dependencies

- **US1**: Starts first after Foundational and has no dependency on other stories.
- **US2**: Requires US1 because the real adapter path must emit only through the new persistent-credential runtime path.
- **US3**: Requires US1 and US2 because rotation semantics are defined by stopping an already working trusted telemetry path.
- **US4**: Requires US1 and US2, and should finish after US3 so blocked and credential-replaced states use one consistent operator model.

### Within Each User Story

- For explicit test tasks, rewrite or replace the listed tests first and confirm they fail before implementation; for implementation, documentation, retirement, or validation tasks, prefer existing targeted proof and add at most one compact regression case only when no existing test observes the changed behavior.
- Replacement implementation before production wiring switch.
- Production wiring switch before proof.
- Proof before any legacy removal or quarantine.
- Any touched legacy test or fixture must end as `rewrite`, `replace`, `legacy reference`, `retire`, or `quarantine`, never as an implicit dual-path behavior.

---

## Parallel Opportunities

- `T002` and `T003` can run in parallel after `T001` establishes the persistent-only fixture baseline.
- `T005`, `T006`, `T007`, and `T008` can run in parallel once `T004` fixes the operator config and state split.
- `T010` and `T011` can run in parallel for US1 because contract and smoke coverage touch different files.
- `T015` and `T016` can run in parallel for US2 because integration and source-boundary coverage are isolated.
- `T021` and `T022` can run in parallel for US3 because integration and state-level tests are separate.
- `T030` and `T031` can run in parallel in the final phase after implementation stabilizes.
- `T035` must complete before `T034` final quickstart validation is treated as complete, because final validation must not rest on a TypeScript path that still looks production-authoritative.

---

## Parallel Example: User Story 1

```text
T010 [US1] Rewrite persistent-bootstrap contract coverage in edge_server/go_core/tests/contract/onboarding_session_test.go
T011 [US1] Rewrite startup smoke coverage in edge_server/go_core/tests/integration/runtime_smoke_test.go
```

## Parallel Example: User Story 2

```text
T015 [US2] Rewrite telemetry pipeline integration coverage in edge_server/go_core/tests/integration/telemetry_pipeline_test.go
T016 [US2] Replace source-boundary coverage in edge_server/go_core/internal/source/manager_test.go and edge_server/go_core/internal/mockadapter/adapter_test.go
```

## Parallel Example: User Story 3

```text
T021 [US3] Rewrite credential-rotation integration coverage in edge_server/go_core/tests/integration/trust_loss_recovery_test.go
T022 [US3] Add credential supersession coverage in edge_server/go_core/internal/state/state_store_test.go and edge_server/go_core/internal/runtime/repro_task_T049_test.go
```

---

## Implementation Strategy

### MVP First

1. Complete Phase 1 and Phase 2.
2. Complete Phase 3 (`US1`).
3. Validate startup from `edge-runtime.yaml` plus `credential.json`.
4. Stop for review before landing the real adapter path.

### Incremental Delivery

1. Deliver `US1` to establish the persistent-credential production path.
2. Deliver `US2` to make one real hardware-facing adapter path the main runtime path and prove canonical telemetry normalization.
3. Deliver `US3` to hard-stop trusted telemetry on credential rotation and recover only through a replaced credential file.
4. Deliver `US4` to align blocked and unblocked runtime behavior with cloud-owned trust decisions.
5. Finish with Phase 7 to sync `007` local contracts and quarantine or retire onboarding-first remnants.

### Suggested MVP Scope

- `US1` only for the smallest independently demonstrable increment.
- Add `US2` next for the first real production telemetry path.
- Add `US3` next to harden rotation safety.
- Add `US4` next to complete block/unblock behavior.

---

## Notes

- Total stories covered: `US1`, `US2`, `US3`, `US4`
- Total tasks: `35`
- Story task counts: `US1 = 5`, `US2 = 6`, `US3 = 5`, `US4 = 4`
- Additional non-story task counts: `Setup = 3`, `Foundational = 6`, `Verification And Legacy Retirement = 6`
- All tasks follow the required checklist format: checkbox, task ID, optional `[P]`, required story label for story phases, and exact file paths
