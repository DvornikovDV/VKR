# Tasks: Edge Cloud Reconnect Resilience Slice

**Input**: `doc_cursed/edge_cloud_reconnect_resilience_plan.md`, `doc_cursed/cloud_client_control_plan.md`, `doc_cursed/mvp_tradeoffs_and_future_work.md`, `specs/007-edge-server/spec.md`, `specs/007-edge-server/plan.md`, `specs/007-edge-server/data-model.md`, `specs/007-edge-server/contracts/operator-status-snapshot.md`, `specs/007-edge-server/contracts/local-source-adapter.md`, current Edge runtime code.

**Prerequisites**: Existing persistent credential runtime state files, existing local source manager and reading dispatcher, existing telemetry gating by trusted/connected state, existing `cloud.reconnect.*` config validation, existing `WebSocketTransportConfig.ConnectTimeout`, and existing runtime status projection helpers.

**Tests**: Lean Testing Policy applies. Add focused runtime proof for startup Cloud unavailable to reconnect success, established disconnect to reconnect success, reconnect policy bounds, finite retry exhaustion, terminal rejection, and shutdown cancellation. Do not add broad network failure matrices or transport protocol matrices.

**Organization**: Tasks are grouped as setup, foundational reconnect/status infrastructure, one startup resilience story, one established-session reconnect story, one terminal rejection/exhaustion story, and polish/review. This document intentionally does not include implementation batches.

## Purpose

This slice MUST make the Edge runtime survive temporary Cloud unavailability without stopping local runtime work.

The plan supports implementation of a config-driven Cloud reconnect path for startup failures, established-session disconnects, reconnect success, retry exhaustion, and shutdown cancellation.

## Scope

- MUST keep the Edge process alive when Cloud is temporarily unavailable during startup.
- MUST keep local source polling active while Cloud is unavailable.
- MUST retry Cloud connection using `cloud.reconnect.baseDelayMs`, `cloud.reconnect.maxDelayMs`, and `cloud.reconnect.maxAttempts`.
- MUST treat `cloud.reconnect.maxAttempts = 0` as unlimited retry attempts.
- MUST stop retry sleeps and reconnect attempts promptly when the shutdown context is cancelled.
- MUST persist or expose local runtime status for connecting, retrying, trusted/connected, terminal reconnect failure, and operator-action-required states.
- MUST pass configured `cloud.connectTimeoutMs` into WebSocket transport construction so each connect attempt is bounded by configuration.
- MUST emit the capabilities catalog again after successful reconnect.
- MUST keep trusted telemetry emission limited to new readings produced while the runtime is trusted and connected.
- MUST keep command response semantics unchanged across reconnect.
- MUST add focused automated proof for startup Cloud unavailable, established disconnect/reconnect, reconnect success, and cancellation/shutdown behavior.

## Out Of Scope

- MUST NOT add durable telemetry buffering, backlog files, replay, or synchronization.
- MUST NOT add command queueing, command replay, or in-flight command replay after reconnect.
- MUST NOT change Client UI behavior.
- MUST NOT change Constructor behavior.
- MUST NOT redesign the Cloud `/edge` protocol.
- MUST NOT add multi-cloud failover.
- MUST NOT change equipment, Modbus, or local source reconnect behavior.
- MUST NOT make Cloud responsible for Edge reconnect scheduling.

## Constraints

- MUST treat `doc_cursed/edge_cloud_reconnect_resilience_plan.md` and the current runtime code as the effective source for this slice.
- MUST treat `specs/006-edge-runtime-windows-mvp/contracts/runtime-state-files.md` as historical context unless it conflicts with current runtime files and the reconnect resilience direction.
- MUST preserve Cloud as the authority for credential validity, blocked state, edge identity, and trusted session acceptance.
- MUST keep low-level WebSocket transport responsible for one bounded connect attempt only; runtime or runtimeapp MUST own reconnect policy.
- MUST classify transient transport or temporary Cloud availability failures as retryable.
- MUST treat `edge_auth_internal_error` from Cloud handshake as retryable for MVP unless the response explicitly proves invalid credential, deleted/revoked credential, unknown edge, or blocked edge.
- MUST NOT clear the installed credential for retryable transport, temporary Cloud availability, or internal/server-side auth errors.
- MUST stop automatic retry for explicit credential or lifecycle rejection states such as invalid credential, blocked edge, edge not found, credential rotation, or credential replacement.
- MUST keep local source polling independent from Cloud connection availability.
- MUST keep Cloud telemetry emission gated by trusted and connected runtime state even when local source polling continues.
- MUST drop telemetry readings produced while disconnected or untrusted; the slice MUST NOT replay them after reconnect.
- MUST NOT include credential secrets in status files or logs.
- MUST apply Lean Testing Policy: automated proof MUST cover the main runtime proof path and at most one critical negative scenario for the main slice risk; broad network failure matrices MUST remain out of automated scope.
- SHOULD add one narrow reconnect policy unit test only if implementation extracts or already has a small policy helper.

## Assumptions

- The current runtime file model includes `credential.json`, `runtime-state.json`, and `status.json` under `runtime.stateDir`; this slice SHOULD reuse those surfaces rather than adding new local persistence files.
- `Runner.Run` SHOULD return only for shutdown context cancellation or non-recoverable local startup/configuration errors.
- Ordinary Cloud retry exhaustion for finite `maxAttempts` SHOULD leave the process alive, keep local polling running, and expose the existing `operator_action_required` status unless implementation deliberately adds and validates a new explicit state across runtime-state persistence and status projection.
- Runtime status projection MAY need a narrow new reason or outcome value for finite reconnect exhaustion if the existing state model cannot express it clearly without adding a new session state.
- A retryable initial connection failure SHOULD update runtime status before waiting for the next attempt.
- Reconnect success SHOULD reuse the existing trusted-session promotion path so telemetry gating, command bridge registration, and capabilities catalog emission stay consistent.
- Similar completed slice plans under `specs/007-edge-server/slices` and `specs/011-alarms/slices` define the expected later task-plan shape, but this document intentionally does not include implementation batches.

## Runtime Flow

1. Edge runtime loads config and initializes runtime state, local source definitions, reading dispatch, telemetry, alarm, and command paths.
2. Local source polling starts independently from Cloud connection success.
3. Runtime builds persistent credential handshake auth and marks a Cloud connect attempt.
4. Runtime performs one bounded Cloud connect attempt through the configured WebSocket transport timeout.
5. On transient connect failure, runtime marks retryable Cloud outage status, keeps local polling alive, keeps Cloud telemetry emission stopped, waits according to configured backoff, and retries.
6. On successful connect, runtime promotes the trusted session, emits the capabilities catalog, and resumes trusted telemetry for new readings only.
7. On ordinary established-session disconnect, runtime marks disconnected/retryable state, stops trusted telemetry, and re-enters the same reconnect policy.
8. On explicit terminal Cloud rejection, runtime marks operator action required, stops automatic retry for the current credential, and keeps the process alive.
9. On finite retry exhaustion, runtime records terminal Cloud reconnect failure status without exiting the process.
10. On shutdown context cancellation, runtime disconnects the current Cloud client when present and exits the retry loop promptly.

## Acceptance Checks

- Starting `edge-runtime` while Cloud is unavailable MUST NOT terminate the process.
- Local source polling MUST continue while Cloud is unavailable.
- Runtime state and `status.json` MUST show retrying or disconnected state during retryable Cloud outage.
- Reconnect delay MUST use `cloud.reconnect.*` values and MUST cap at `maxDelayMs`.
- `maxAttempts = 0` MUST allow unlimited retry attempts until shutdown or a terminal Cloud rejection.
- Finite `maxAttempts` exhaustion MUST leave the process alive and expose terminal Cloud reconnect failure or operator-action-required status.
- Shutdown context cancellation MUST stop pending reconnect waits promptly.
- `cloud.connectTimeoutMs` MUST be wired into WebSocket transport construction.
- When Cloud becomes reachable after startup outage, Edge MUST connect without manual process restart.
- After reconnect, Edge MUST emit the capabilities catalog again.
- Telemetry MUST resume only for new readings produced while trusted and connected.
- Telemetry readings produced while disconnected MUST NOT be replayed.
- Established ordinary disconnect MUST persist retryable disconnected or retrying state before reconnect succeeds.
- Established ordinary disconnect MUST reconnect without duplicate command terminal responses.
- Explicit invalid credential, blocked edge, edge not found, credential rotation, or credential replacement MUST stop automatic retry for the current credential.
- Retryable transport failures and `edge_auth_internal_error` MUST NOT clear the installed credential.
- `edge_auth_internal_error` MUST remain retryable unless Cloud provides explicit terminal credential or lifecycle rejection meaning.
- Focused runtime tests MUST prove startup Cloud unavailable to reconnect success, established disconnect to reconnect success, and cancellation/shutdown behavior.

## Format: `[ID] [P?] [Story] Description`

- `[P]` means the task can run in parallel because it touches different files and does not depend on incomplete tasks.
- `[US1]` maps to startup Cloud unavailable resilience.
- `[US2]` maps to established-session disconnect and reconnect.
- `[US3]` maps to terminal retry exhaustion and explicit rejection handling.
- Every task includes the file path that owns the change or proof.

## Phase 1: Setup

**Purpose**: Create stable reconnect policy and test harness anchors before changing the runtime loop.

- [X] T001 Add reconnect policy config, attempt result types, and constructor skeleton in `edge_server/go_core/internal/runtime/reconnect_policy.go`
- [X] T002 [P] Add scripted runtime reconnect fake transport support for connect failures, disconnect signals, emitted events, and cancellation observations in `edge_server/go_core/internal/runtime/runtime_reconnect_test.go`
- [X] T003 [P] Add reconnect policy unit proof for `maxAttempts=0` unlimited retry, finite attempt exhaustion, and delay capping in `edge_server/go_core/internal/runtime/reconnect_policy_test.go`
- [X] T004 [P] Add a focused command-line wiring test seam or constructor helper for `cloud.connectTimeoutMs` transport config in `edge_server/go_core/cmd/edge-runtime/main_test.go`

**Checkpoint**: Reconnect policy and tests have stable anchors without changing production lifecycle behavior.

---

## Phase 2: Foundational Reconnect And Status Infrastructure

**Purpose**: Implement shared reconnect policy, config wiring, and retryable status transitions that all user stories depend on.

- [X] T005 Implement bounded exponential reconnect policy, `maxAttempts=0` unlimited behavior, finite exhaustion detection, and context-aware wait in `edge_server/go_core/internal/runtime/reconnect_policy.go`
- [X] T006 Add `Runner.BindReconnectPolicy(...)` or equivalent runtime-owned reconnect policy field with default no-policy validation paths in `edge_server/go_core/internal/runtime/runtime.go`
- [X] T007 Wire `cfg.Cloud.Reconnect` into the runtime reconnect policy during process construction in `edge_server/go_core/internal/runtimeapp/process.go`
- [X] T008 Pass `cfg.Cloud.ConnectTimeoutMs` as `WebSocketTransportConfig.ConnectTimeout` when creating the production transport in `edge_server/go_core/cmd/edge-runtime/main.go`
- [X] T009 Add runtime-state helper behavior for retryable initial connect failure and finite reconnect exhaustion without clearing the loaded credential in `edge_server/go_core/internal/runtime/runtime_state.go`
- [X] T010 Update operator status projection or outcome mapping so retryable outage and finite reconnect exhaustion expose clear non-secret status through existing status schema values in `edge_server/go_core/internal/operator/status_snapshot.go`
- [X] T011 Update connect-error classification so retryable transport failures and `edge_auth_internal_error` preserve the installed credential while explicit credential/lifecycle rejections remain terminal in `edge_server/go_core/internal/runtime/trust_session_flow.go`

**Checkpoint**: Runtime has a config-driven reconnect policy and status model before user-story runtime loop changes are completed.

---

## Phase 3: User Story 1 - Startup Cloud Unavailable Recovers (Priority: P1) MVP

**Goal**: Starting Edge while Cloud is temporarily unavailable keeps the process and local runtime work alive, records retrying status, and connects automatically when Cloud becomes reachable.

**Independent Test**: A scripted transport fails initial `Connect` attempts, then succeeds; `Runner.Run` stays alive, status becomes retryable, credential remains loaded, reconnect uses the configured policy, capabilities catalog emits after success, and shutdown cancellation stops the loop.

### Tests for User Story 1

- [X] T012 [US1] Add focused runtime proof for initial Cloud connect failures followed by success, asserting reconnect attempts, retryable state, credential preservation, capabilities catalog emission, and no `Runner.Run` fatal return in `edge_server/go_core/internal/runtime/runtime_reconnect_test.go`
- [X] T013 [US1] Add cancellation proof that a pending startup reconnect wait exits promptly on context cancellation in `edge_server/go_core/internal/runtime/runtime_reconnect_test.go`
- [X] T014 [US1] Add runtimeapp proof that local source reading dispatch remains initialized while Cloud startup connect is retrying in `edge_server/go_core/internal/runtimeapp/process_test.go`

### Implementation for User Story 1

- [X] T015 [US1] Change startup `client.Connect` returned error handling, including typed `ConnectError` classification, so retryable failures mark outage and continue through reconnect policy while terminal rejections do not return fatal errors in `edge_server/go_core/internal/runtime/runtime.go`
- [X] T016 [US1] Ensure startup retry attempts call existing runtime-state persistence before each backoff wait so `runtime-state.json` and `status.json` show connecting or retrying state in `edge_server/go_core/internal/runtime/runtime.go`
- [X] T017 [US1] Ensure successful startup reconnect reuses trusted-session promotion and emits `capabilities_catalog` before telemetry resumes in `edge_server/go_core/internal/runtime/runtime.go`
- [X] T018 [US1] Ensure disconnected startup readings remain dropped by the existing telemetry gating path without adding backlog or replay behavior in `edge_server/go_core/internal/runtime/telemetry_pipeline.go`

**Checkpoint**: Edge startup survives temporary Cloud outage and reconnects without manual process restart.

---

## Phase 4: User Story 2 - Established Session Disconnect Reconnects (Priority: P1)

**Goal**: After an accepted trusted session disconnects ordinarily, Edge stops trusted telemetry, records retryable disconnected status, reconnects through the same policy, and preserves command at-most-once behavior.

**Independent Test**: A scripted transport connects, emits an ordinary disconnect, reconnects, and proves retryable state before reconnect, capabilities re-emission, telemetry gating, and no duplicate terminal command responses.

### Tests for User Story 2

- [X] T019 [US2] Extend established reconnect proof to assert ordinary disconnect persists retryable disconnected or retrying state before reconnect succeeds in `edge_server/go_core/internal/runtime/runtime_reconnect_test.go`
- [X] T020 [US2] Preserve and extend no-duplicate command terminal response proof across reconnect in `edge_server/go_core/internal/runtime/runtime_reconnect_test.go`

### Implementation for User Story 2

- [X] T021 [US2] Route ordinary established-session disconnect into the shared reconnect policy loop without returning from `Runner.Run` in `edge_server/go_core/internal/runtime/runtime.go`
- [X] T022 [US2] Preserve `SocketIOClient` lifecycle and command handler registration when a reconnect uses a recreated client or refreshed expected edge in `edge_server/go_core/internal/runtime/runtime.go`
- [X] T023 [US2] Preserve telemetry pipeline reset and session gating when `MarkDisconnected` runs before established reconnect in `edge_server/go_core/internal/runtime/runtime_state.go`
- [X] T024 [US2] Ensure reconnect success emits the capabilities catalog again and resumes only new trusted telemetry in `edge_server/go_core/internal/runtime/runtime.go`

**Checkpoint**: Established trusted sessions recover from ordinary disconnects without replaying telemetry or duplicating command terminal responses.

---

## Phase 5: User Story 3 - Retry Exhaustion And Terminal Rejections Stay Alive (Priority: P1)

**Goal**: Finite retry exhaustion and explicit Cloud credential/lifecycle rejections stop automatic retry for the current credential when required, but keep the Edge process and local polling alive.

**Independent Test**: A scripted transport exhausts finite retry attempts and leaves `Runner.Run` alive with terminal status; separate explicit rejection cases stop retry and preserve operator-action-required status, while `edge_auth_internal_error` remains retryable and does not clear the credential.

### Tests for User Story 3

- [X] T025 [US3] Add finite `maxAttempts` exhaustion proof using scripted transport observation channels and context cancellation to assert `Runner.Run` remains alive, automatic retry stops, credential is not cleared, and status becomes operator-action-required or equivalent existing-schema terminal status in `edge_server/go_core/internal/runtime/runtime_reconnect_test.go`
- [X] T026 [US3] Add explicit rejection proof for invalid credential, blocked edge, and edge not found stopping automatic retry without spinning in `edge_server/go_core/internal/runtime/runtime_reconnect_test.go`
- [X] T027 [US3] Add `edge_auth_internal_error` proof that the runtime treats the failure as retryable and keeps the loaded credential in `edge_server/go_core/internal/runtime/runtime_reconnect_test.go`
- [X] T028 [US3] Add status projection proof for retry exhaustion and retryable internal error using existing `status.json` schema values in `edge_server/go_core/internal/operator/status_snapshot_test.go`

### Implementation for User Story 3

- [X] T029 [US3] Implement finite retry exhaustion handling in `Runner.Run` so ordinary Cloud retry exhaustion records terminal status and keeps the process alive in `edge_server/go_core/internal/runtime/runtime.go`
- [X] T030 [US3] Implement runtime-state transition for reconnect exhaustion using existing credential status and retry eligibility invariants in `edge_server/go_core/internal/runtime/runtime_state.go`
- [X] T031 [US3] Keep explicit terminal rejection handling for invalid credential, blocked edge, edge not found, credential rotation, and credential replacement in `edge_server/go_core/internal/runtime/trust_session_flow.go`
- [X] T032 [US3] Update operator outcome/status mapping for `edge_auth_internal_error` retryability and reconnect exhaustion without adding unsupported status enum values in `edge_server/go_core/internal/operator/outcomes.go`
- [X] T033 [US3] Ensure runtime-state and status-store validation still reject secret leakage, unsupported status schema values, and invalid retry eligibility after new reconnect states or reasons in `edge_server/go_core/internal/state/runtime_state_store.go` and `edge_server/go_core/internal/state/status_store.go`

**Checkpoint**: Terminal Cloud outcomes do not kill the process, and retryable internal failures do not destroy the installed credential.

---

## Phase 6: Verification, Manual Smoke, And Review

**Purpose**: Verify focused behavior and record runtime smoke without expanding automated proof volume.

- [X] T034 Run focused runtime reconnect tests with `go test ./internal/runtime -run Reconnect -count=1` from `edge_server/go_core`, covering `edge_server/go_core/internal/runtime/runtime_reconnect_test.go` and `edge_server/go_core/internal/runtime/reconnect_policy_test.go`
- [X] T035 Run focused runtime state tests with `go test ./internal/runtime -run State -count=1` from `edge_server/go_core`, covering `edge_server/go_core/internal/runtime/runtime_state_test.go`
- [X] T036 Run operator and state status tests with `go test ./internal/operator ./internal/state -count=1` from `edge_server/go_core`, covering `edge_server/go_core/internal/operator/status_snapshot_test.go` and `edge_server/go_core/internal/state/runtime_state_store.go`
- [X] T037 Run runtimeapp regression tests with `go test ./internal/runtimeapp -count=1` from `edge_server/go_core`, covering `edge_server/go_core/internal/runtimeapp/process_test.go`
- [X] T038 Run entrypoint and Cloud transport regression tests with `go test ./cmd/edge-runtime ./internal/cloud -count=1` from `edge_server/go_core`, covering `edge_server/go_core/cmd/edge-runtime/main.go` and `edge_server/go_core/internal/cloud/websocket_transport.go`
- [X] T039 Inspect `edge_server/go_core/internal/runtime/telemetry_pipeline.go` and `edge_server/go_core/internal/runtime/command_bridge.go` to verify no telemetry backlog, telemetry replay, command queue, or command replay was introduced
- [X] T040 Inspect `edge_server/go_core/internal/cloud/websocket_transport.go` to verify reconnect scheduling did not move into the low-level transport
- [X] T041 Add manual runtime smoke notes for startup Cloud unavailable, Cloud restore reconnect, ordinary disconnect reconnect, finite retry exhaustion, and shutdown cancellation in `specs/007-edge-server/slices/plan_edge_cloud_reconnect_resilience_slice.md`
- [X] T042 Complete Technical Lead Review for reconnect policy ownership, Cloud/Edge boundary, credential clearing, status accuracy, telemetry gating, command replay exclusion, cancellation, stale state, and Lean Testing discipline in `specs/007-edge-server/slices/plan_edge_cloud_reconnect_resilience_slice.md`

---

## Dependencies And Execution Order

### Phase Dependencies

- Phase 1 establishes reconnect policy and test harness anchors.
- Phase 2 depends on Phase 1 and blocks all user stories.
- Phase 3 depends on Phase 2 policy/status wiring.
- Phase 4 depends on Phase 2 and can proceed after the shared reconnect loop exists; it should be sequenced after Phase 3 if one owner edits `runtime.go`.
- Phase 5 depends on Phase 2 classification/status foundations and should be implemented after the basic retry loop is stable.
- Phase 6 depends on implementation completion.

### Task Dependencies

- T005 depends on T001 and T003.
- T006 depends on T005.
- T007 depends on T006.
- T008 depends on T004.
- T009 depends on T006 and existing runtime-state persistence.
- T010 depends on T009 and the existing status schema.
- T011 depends on T009 and existing connect-error classification.
- T012 and T013 pass only after T015 through T017 are implemented.
- T014 depends on T007 and existing runtimeapp source wiring.
- T015 depends on T005, T006, T009, and T011.
- T016 depends on T009 and T015.
- T017 depends on T015 and existing capabilities catalog binding.
- T018 depends on existing telemetry gating and the final disconnected startup behavior.
- T019 and T020 pass only after T021 through T024 are implemented.
- T021 depends on T005, T006, and T009.
- T022 depends on T021 and existing `SocketIOClient` construction.
- T023 depends on T021 and existing `MarkDisconnected` behavior.
- T024 depends on T021 and existing capabilities emission behavior.
- T025 through T028 pass only after T029 through T033 are implemented.
- T029 depends on T005, T006, and T030.
- T030 depends on T009 and state validation invariants.
- T031 depends on T011.
- T032 depends on T010 and T031.
- T033 depends on T030 and T032.
- T034 through T042 depend on implementation completion.

## Parallel Opportunities

- T002, T003, and T004 can run in parallel because they touch different test or helper files.
- T007 and T008 can run in parallel after the policy binding shape is known because they touch `runtimeapp` and `cmd/edge-runtime`.
- T010 and T011 can be drafted in parallel after T009 because status projection and connect-error classification are separate files.
- T014 can be developed in parallel with runtime-loop tests once the runtimeapp policy wiring exists.
- T028 can be developed in parallel with T025 through T027 because it targets operator projection behavior.
- T039 and T040 can run in parallel with focused verification commands after implementation is complete.

T015, T021, T022, T024, and T029 SHOULD be sequenced by one owner because they all modify `edge_server/go_core/internal/runtime/runtime.go`.
T009, T023, and T030 SHOULD be reviewed together because they define runtime-state transitions and persistence invariants.
T010, T028, and T032 SHOULD be reviewed together because they define operator-visible status semantics.

## Parallel Example: Foundational Work

```text
Task: "Add scripted runtime reconnect fake transport support for connect failures, disconnect signals, emitted events, and cancellation observations in `edge_server/go_core/internal/runtime/runtime_reconnect_test.go`"
Task: "Add a focused command-line wiring test seam or constructor helper for `cloud.connectTimeoutMs` transport config in `edge_server/go_core/cmd/edge-runtime/main_test.go`"
```

## Parallel Example: User Story 3

```text
Task: "Add `edge_auth_internal_error` proof that the runtime treats the failure as retryable and keeps the loaded credential in `edge_server/go_core/internal/runtime/runtime_reconnect_test.go`"
Task: "Add status projection proof for retry exhaustion and retryable internal error using existing `status.json` schema values in `edge_server/go_core/internal/operator/status_snapshot_test.go`"
```

## Implementation Strategy

### MVP First

1. Complete Phase 1 and Phase 2 to establish a shared reconnect policy and status transition model.
2. Complete Phase 3 so startup Cloud unavailable no longer kills the Edge process.
3. Complete Phase 4 so established-session disconnect uses the same reconnect policy and preserves command/telemetry semantics.
4. Complete Phase 5 to handle finite retry exhaustion and terminal rejection without spinning or killing local runtime work.
5. Complete Phase 6 verification and Technical Lead Review.

### Boundary Bias

- Prefer reconnect policy ownership in `internal/runtime` with config wiring in `internal/runtimeapp`.
- Keep `internal/cloud/websocket_transport.go` limited to one bounded connect attempt.
- Keep `cmd/edge-runtime/main.go` thin: load config, construct transport with config, construct process, run until shutdown.
- Preserve the existing local source manager and reading dispatcher; do not pause polling because Cloud is unavailable.
- Preserve telemetry gating in `TelemetryPipeline`; do not add disconnected buffering.
- Preserve command bridge at-most-once terminal response behavior; do not add command replay.
- Use existing status schema values unless a new state is explicitly added and validated across state store and operator projection.

## Manual And Runtime Smoke

Manual smoke SHOULD use the checked-in Arduino stand config or a test config with a local source harness and a controllable Cloud endpoint.

1. Start `edge-runtime` with Cloud stopped or unreachable.
2. Confirm the process remains alive and local source polling starts.
3. Inspect `status.json` and confirm retrying or disconnected status with `retryEligible=true`.
4. Start Cloud and confirm the runtime connects without process restart.
5. Confirm `capabilities_catalog` is emitted after reconnect.
6. Confirm telemetry starts only after trusted reconnect and contains only new readings.
7. Stop the Cloud socket after an established trusted session and confirm retrying/disconnected status appears before reconnect.
8. Restart Cloud and confirm reconnect without duplicate command terminal responses.
9. Configure a finite `cloud.reconnect.maxAttempts`, keep Cloud unavailable, and confirm the process remains alive with terminal operator-action-required or equivalent existing-schema status.
10. Trigger shutdown and confirm pending reconnect wait exits promptly.

Smoke success MUST NOT count telemetry replay, command replay, transport-owned reconnect loops, credential clearing on retryable failures, or a process crash followed by supervisor restart as passing evidence.

### T041 Quickcheck Smoke Notes (2026-06-05)

Live runtime evidence already present in the repository is automated runtime execution with scripted transports, not physical hardware and not a real Cloud endpoint:

- Startup Cloud unavailable to reconnect success is covered by `edge_server/go_core/internal/runtime/runtime_reconnect_test.go` (`TestRunnerStartupReconnectInitialFailuresThenSuccess`): scripted `Connect` failures are followed by success, `Runner.Run` stays alive until cancellation, the loaded credential version remains present, and `capabilities_catalog` is emitted after reconnect.
- Startup reconnect wait cancellation is covered by `edge_server/go_core/internal/runtime/runtime_reconnect_test.go` (`TestRunnerStartupReconnectWaitCancellation`) and `edge_server/go_core/internal/runtime/reconnect_policy_test.go` (`TestReconnectPolicyWaitHonorsContextCancellation`): a pending reconnect delay exits through context cancellation.
- Local runtime work during startup Cloud retry is covered by `edge_server/go_core/internal/runtimeapp/process_test.go` (`TestProcessKeepsReadingDispatchActiveDuringStartupCloudRetry`): the process initializes reading dispatch while Cloud connect is retrying.
- Ordinary established disconnect to reconnect is covered by `edge_server/go_core/internal/runtime/runtime_reconnect_test.go` (`TestRunnerEstablishedDisconnectReconnectPersistsRetryableStateAndResumesFreshTelemetry`): retryable state is persisted before reconnect, `capabilities_catalog` is emitted again, disconnected readings are not emitted, and only fresh trusted telemetry resumes.
- Command replay exclusion across reconnect is covered by `edge_server/go_core/internal/runtime/runtime_reconnect_test.go` (`TestRunner_Reconnect_NoDuplicateTerminalResponses`): replaying the same command request after reconnect does not produce a duplicate terminal response.
- Finite retry exhaustion is covered by `edge_server/go_core/internal/runtime/runtime_reconnect_test.go` (`TestRunnerFiniteReconnectExhaustionStopsRetriesAndStaysAlive`): automatic attempts stop after `maxAttempts`, `Runner.Run` stays alive until shutdown, `retryEligible=false`, and credential version is preserved.
- Status projection for retryable outage and finite exhaustion is covered by `edge_server/go_core/internal/operator/status_snapshot_test.go` (`TestProjectStatusSnapshotReconnectOutageAndExhaustionUseSupportedValues`): existing status schema values are used for `retrying`, `waiting_for_credential`, `disconnected`, and `retryable_disconnect`/`internal_error`.

Manual hardware smoke status: PASS, user-executed on 2026-06-07. The user confirmed that local source polling remained operational through the tested Cloud outage/reconnect flow and that commands did not replay after reconnect.

Manual real Cloud smoke status: PASS, user-executed on 2026-06-07. The user confirmed startup Cloud unavailable recovery, Cloud restore reconnect, ordinary established-session disconnect/reconnect, finite retry exhaustion, and prompt shutdown cancellation while waiting for reconnect. The user also confirmed the expected `status.json`/`runtime-state.json` transitions, credential preservation through retry exhaustion, no old-command replay after reconnect, and no automatic reconnect after finite exhaustion.

Smoke evidence boundary: automated repository evidence exercises live Edge runtime code with scripted transports; the manual PASS evidence above was reported by the user after hands-on hardware and real Cloud checks. The agent did not independently operate or observe the hardware or deployed Cloud environment.

## Technical Lead Review

Review this implementation for:

- reconnect policy ownership in runtime or runtimeapp rather than low-level transport;
- no Cloud/Client/Constructor scope leakage;
- no credential clearing for retryable transport or internal Cloud auth errors;
- explicit terminal handling for invalid credential, blocked edge, edge not found, and credential replacement;
- finite retry exhaustion keeping the process alive;
- shutdown cancellation interrupting retry waits;
- status accuracy in `runtime-state.json` and `status.json`;
- local polling independence from Cloud availability;
- telemetry gating without backlog or replay;
- command bridge at-most-once behavior without command replay;
- capabilities catalog re-emission after reconnect;
- Lean Testing Policy discipline.

### T042 Technical Lead Review Result (2026-06-05)

Outcome: review completed by source inspection, existing focused proof references, and passing quickcheck validation.

Validation commands run from `edge_server/go_core` on 2026-06-05:

- `go test ./internal/runtime -count=1` PASS
- `go test ./internal/runtimeapp -count=1` PASS after aligning `TestRuntimeStartup_EmitsCapabilitiesCatalogAfterConnect` with the current catalog-before-trusted-telemetry contract.
- `go test ./internal/state -count=1` PASS
- `go test ./internal/operator -count=1` PASS
- `go test ./internal/cloud -count=1` PASS
- `go test ./cmd/edge-runtime -count=1` PASS

- Reconnect ownership: PASS. `edge_server/go_core/internal/runtime/reconnect_policy.go` owns retry planning and context-aware waits; `edge_server/go_core/internal/runtime/runtime.go` owns retry loop execution through `waitForReconnectAttempt`; `edge_server/go_core/internal/runtimeapp/process.go` wires `cfg.Cloud.Reconnect`; `edge_server/go_core/internal/cloud/websocket_transport.go` performs one bounded `Connect` attempt and contains no reconnect loop or backoff scheduler.
- Cloud/Edge boundary: PASS. `cloud_server/src/socket/events/edge.ts` and `cloud_server/src/socket/events/edge-runtime-auth.ts` remain Cloud-side auth/session authority for `invalid_credential`, `blocked`, `edge_not_found`, and unexpected `edge_auth_internal_error`; Edge only classifies the returned code in `edge_server/go_core/internal/runtime/trust_session_flow.go`.
- Credential clearing: PASS. `edge_server/go_core/internal/runtime/trust_session_flow.go` sends terminal connect errors to `MarkUntrusted(..., true)` but retryable codes to `MarkRetryableConnectFailure`; `edge_server/go_core/internal/runtime/runtime_state.go` keeps `CredentialStatusLoaded` and the loaded credential version for retryable transport/internal errors and finite exhaustion, while terminal rejection clears the runtime secret.
- Status accuracy: PASS. `edge_server/go_core/internal/runtime/runtime_state.go` persists `connecting`, `retry_wait`, `operator_action_required`, `retryEligible`, `LastDisconnectReason`, and trusted/connected flags; `edge_server/go_core/internal/operator/status_snapshot.go` maps them to existing `status.json` values without unsupported enums; `edge_server/go_core/internal/state/runtime_state_store.go` and `edge_server/go_core/internal/state/status_store.go` validate allowed schema keys and values.
- Telemetry gating and stale state: PASS. `edge_server/go_core/internal/runtime/telemetry_pipeline.go` admits readings only when `Trusted && Connected` and `SessionEpoch != 0`, resets the batcher when ineligible, and drops disconnected readings. `MarkDisconnected`, `MarkRetryableConnectFailure`, and `MarkReconnectExhausted` invalidate the epoch and reset telemetry state, preventing stale batches after reconnect.
- No telemetry backlog or replay: PASS. Review found no durable telemetry buffer, backlog file, replay queue, or synchronization path in `edge_server/go_core/internal/runtime/telemetry_pipeline.go`; disconnected readings are skipped rather than stored.
- Command replay exclusion: PASS. `edge_server/go_core/internal/runtime/command_bridge.go` keeps at-most-once request state in `CommandRequestRegistry`, suppresses duplicate request IDs, and does not queue or replay commands across reconnect. `cloud_server/src/services/commands.service.ts` emits `execute_command` only to the currently active trusted Edge socket and closes the audit if no trusted socket exists.
- Cancellation: PASS. `edge_server/go_core/internal/runtime/reconnect_policy.go` waits with a timer selected against `ctx.Done()`, and `edge_server/go_core/internal/runtime/runtime.go` returns cleanly on cancellation while disconnecting the current client when present.
- Finite exhaustion and terminal outcomes: PASS. `edge_server/go_core/internal/runtime/runtime.go` records `max_attempts_exhausted` and waits for shutdown rather than returning a fatal runtime error; terminal credential/lifecycle rejections stop automatic retry for the current credential.
- Capabilities catalog: PASS. `edge_server/go_core/internal/runtime/runtime.go` calls `emitCapabilitiesCatalog` after every successful `Connect` before `HandleSuccessfulConnect` promotes trusted state, keeping catalog re-emission ahead of trusted telemetry resume.
- Lean Testing discipline: PASS. Automated proof is focused on reconnect policy, startup failure recovery, established disconnect recovery, finite exhaustion, cancellation, status projection, command duplicate suppression, and runtimeapp dispatch initialization. It does not add broad network or transport protocol matrices.

Review non-success guard: this review explicitly checked that no telemetry backlog, command replay, or transport-owned reconnect loop was introduced.

## Source Of Truth

- `doc_cursed/edge_cloud_reconnect_resilience_plan.md`
- `doc_cursed/cloud_client_control_plan.md`
- `doc_cursed/mvp_tradeoffs_and_future_work.md`
- `specs/007-edge-server/spec.md`
- `specs/006-edge-runtime-windows-mvp/spec.md`
- `specs/006-edge-runtime-windows-mvp/contracts/cloud-runtime-contract.md`
- `specs/006-edge-runtime-windows-mvp/contracts/runtime-state-files.md`
- `doc/slices.md`

## Review Trigger

Review this plan when Cloud `/edge` authentication rejection codes change, when runtime state/status files change, when command replay or telemetry backlog enters scope, when WebSocket transport ownership changes, or when `doc_cursed/edge_cloud_reconnect_resilience_plan.md` changes.
