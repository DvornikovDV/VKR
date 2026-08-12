# Tasks: Edge Cloud RPC Bridge Slice

**Input**: `doc_cursed/cloud_client_control_plan.md`, `doc_cursed/edge_control_plan.md`, `specs/007-edge-server/slices/plan_set_bool_slice.md`, `specs/007-edge-server/slices/plan_set_number_slice.md`, `specs/008-cloud-control/slices/plan_cloud_rpc_and_audit_slice.md`, relevant Edge cloud/runtime/runtimeapp/source code.

**Prerequisites**: Existing persistent Edge runtime authentication, working `/edge` Cloud socket connection, existing source manager command path, completed local `set_bool` and `set_number` Edge slices.

**Tests**: Lean Testing Policy applies. Add one happy path proof and one critical negative proof. Do not add broad table-driven validation matrices for every payload validation branch.

**Organization**: Tasks are grouped as setup, foundational bridge infrastructure, one independently testable runtime story, and polish/review.

## Purpose

This slice MUST connect the existing Edge runtime Cloud socket path to the existing local source manager command path.

The Edge runtime MUST listen for Cloud `execute_command` events, execute validated commands through `source.Manager.ExecuteCommand(...)`, and emit exactly one terminal `command_result` for each valid received `requestId`.

## Scope

This plan applies only to `edge_server`.

This slice MUST implement the Edge-side bridge for Cloud RPC commands:

- MUST subscribe the real Edge runtime Cloud connection path to `execute_command`.
- MUST parse `requestId`, `edgeId`, `deviceId`, `commandType`, and `payload.value`.
- MUST validate incoming `edgeId` against the configured runtime Edge ID.
- MUST execute commands only through the runtime-owned `source.Manager.ExecuteCommand(...)`.
- MUST support only `set_bool` and `set_number`.
- MUST reuse the already implemented local `set_bool` and `set_number` confirmation behavior.
- MUST emit Edge-to-Cloud `command_result` with `edgeId`, `requestId`, `status`, `completedAt`, and optional `failureReason`.
- MUST map Edge-side timeout to `status: "timeout"` and `failureReason: "edge_command_timeout"`.
- MUST map Edge-side validation or execution failure to `status: "failed"` and `failureReason: "edge_command_failed"`.

## Out of Scope

- DO NOT change YAML parsing or command mapping schema.
- DO NOT change Modbus register write or reported-metric confirmation implementation.
- DO NOT implement Cloud API, Cloud DB, `CommandAudit`, pending registry, or Cloud retry behavior.
- DO NOT implement Client Dashboard UI or command journal UI.
- DO NOT implement Presence Lock or `ControlLease`.
- DO NOT add command types beyond `set_bool` and `set_number`.
- DO NOT persist Edge command history or at-most-once state across reconnect or restart.

## Constraints

- MUST follow `doc_cursed` as the source of truth for Cloud/Edge command contracts.
- MUST keep Cloud transport independent from Modbus and device-specific logic.
- MUST keep device and protocol details below the source/adapter boundary.
- MUST NOT call protocol adapters directly from Cloud transport, runtime socket handlers, or runtime app wiring.
- MUST echo the Cloud-provided `requestId`; Edge MUST NOT generate a new request ID.
- MUST NOT execute a command when incoming `edgeId` does not match the configured Edge ID.
- MUST NOT emit `command_result` when `requestId` is missing or invalid; this is a protocol error for Edge logs.
- MUST set `completedAt` as an ISO date-time when the terminal Edge result is produced.
- MUST send no `failureReason` for `confirmed`.
- MUST use `failureReason: "edge_command_timeout"` for `timeout`.
- MUST use `failureReason: "edge_command_failed"` for `failed`.
- MUST keep detailed local failure reason text in Edge logs only.
- MUST answer at most once per `requestId` within the current Edge process.
- MUST keep at-most-once state process-local for MVP.
- MUST bound process-local at-most-once state with cleanup or eviction so stale request IDs do not accumulate indefinitely.
- MUST use an Edge-side timeout shorter than the Cloud 5-second RPC timeout; default MUST be 4 seconds unless an existing runtime timeout config provides a smaller safe value.
- MUST run command execution asynchronously from transport read dispatch so a long command does not block Socket.IO heartbeats or lifecycle events.
- MUST map any empty, unexpected, or non-terminal local source result status to `status: "failed"` and `failureReason: "edge_command_failed"`.
- MUST NOT publish desired command values as telemetry.
- MUST reuse source manager in-flight protection for `deviceId + commandType`.
- MUST keep `command_result` as an Edge-to-Cloud event, not a Dashboard event.
- MUST apply Lean Testing Policy: plan only one happy path proof and at most one critical negative proof; DO NOT add broad table-driven validation matrices.

## Assumptions

- The existing Edge local command path is correct for this slice and already owns command mapping, in-flight protection, Modbus write serialization, and reported-metric confirmation.
- Edge-side at-most-once protection MAY be an in-memory request ID set scoped to the running process.
- DTO and bridge types MAY live in `internal/cloud`, but runtime execution MUST be wired through a runtime-owned source manager reference.
- Runtime logs MAY include detailed local reasons for operator/debug visibility, but Cloud-visible response reasons remain restricted to the documented contract values.
- Missing or invalid `requestId` cannot be safely acknowledged because Edge cannot echo a valid Cloud request ID.
- Malformed command payloads SHOULD be treated as command protocol errors and SHOULD NOT automatically mark the Edge runtime untrusted unless they also violate authenticated socket or session integrity.

## Format: `[ID] [P?] [Story] Description`

- `[P]` means the task can run in parallel because it touches different files and does not depend on incomplete tasks.
- `[US1]` maps to the single Edge runtime RPC bridge story.
- Every task includes the file path that owns the change or proof.
- This document intentionally does not include implementation batches.

## Phase 1: Setup

**Purpose**: Add explicit command contract anchors before changing runtime wiring.

- [X] T001 Add Edge RPC command contract constants, DTO names, terminal statuses, and failure reason vocabulary in `edge_server/go_core/internal/cloud/commands.go`
- [X] T002 [P] Add the runtime command bridge skeleton, command executor interface, default 4-second timeout option, and process-local request registry type in `edge_server/go_core/internal/runtime/command_bridge.go`

**Checkpoint**: The slice has stable Cloud DTO and runtime bridge anchors before transport and runner integration changes.

---

## Phase 2: Foundational Bridge Infrastructure

**Purpose**: Expose incoming Cloud command events through the Cloud client and bind the runtime to a source-manager-backed executor.

- [x] T003 Extend the Cloud `Transport` interface with a narrow `OnExecuteCommand(func(any))` incoming event hook in `edge_server/go_core/internal/cloud/transport.go`
- [x] T004 Update `WebSocketTransport` to store the `execute_command` handler and dispatch only the parsed event payload from Socket.IO packets in `edge_server/go_core/internal/cloud/websocket_transport.go`
- [x] T005 Update existing fake and noop transport implementations for the new `Transport` interface, including process-test support for injecting `execute_command` events and capturing emitted `command_result` payloads, in `edge_server/go_core/internal/cloud/socketio_client_behavior_test.go` and `edge_server/go_core/internal/runtimeapp/process_test.go`
- [x] T006 Add `SocketIOClient` APIs to register an `execute_command` handler and emit `command_result` through the existing transport in `edge_server/go_core/internal/cloud/socketio_client.go`
- [x] T007 Implement Cloud-contract payload parsing and response payload construction helpers without importing `internal/source` in `edge_server/go_core/internal/cloud/commands.go`
- [x] T008 Implement the runtime command bridge request reservation, TTL cleanup or bounded eviction, and at-most-once response guard in `edge_server/go_core/internal/runtime/command_bridge.go`
- [x] T009 Add runtime command bridge binding and current bridge accessors to `Runner` in `edge_server/go_core/internal/runtime/runtime.go`
- [x] T010 Wire `Runner.Run` to register the bridge with each real `SocketIOClient` instance without duplicating handlers across reconnect attempts in `edge_server/go_core/internal/runtime/runtime.go`
- [x] T011 Wire `runtimeapp.Process` to bind the constructed `source.Manager` and configured runtime Edge ID into the runtime command bridge in `edge_server/go_core/internal/runtimeapp/process.go`

**Checkpoint**: The real runtime can receive `execute_command` events through the Cloud client path and has a production-owned executor boundary pointing at the source manager.

---

## Phase 3: User Story 1 - Execute Cloud Command Through Edge Runtime (Priority: P1) MVP

**Goal**: A Cloud `execute_command` event received by the real Edge runtime socket path reaches `source.Manager.ExecuteCommand(...)` and produces one Cloud-compatible terminal `command_result`.

**Independent Test**: Use a fake Cloud transport injected into `runtimeapp.Process`, run the real `Runner.Run(ctx)` path, inject an `execute_command` payload through the transport handler, and assert the source-manager-backed command path and emitted `command_result`.

### Tests for User Story 1

- [X] T012 [US1] Add the happy path runtime proof with a command-capable test adapter and source config command mapping, proving `execute_command` reaches the source manager and emits `command_result` with `status: "confirmed"`, echoed `requestId`, configured `edgeId`, ISO `completedAt`, and no `failureReason` in `edge_server/go_core/internal/runtimeapp/process_test.go`
- [x] T013 [US1] Add the critical negative runtime proof with a command-capable test adapter and short bridge timeout override, proving timeout or failed source result emits one terminal `command_result` without hanging and duplicate same-`requestId` events do not emit a second result in `edge_server/go_core/internal/runtimeapp/process_test.go`

### Implementation for User Story 1

- [x] T014 [US1] Implement `execute_command` validation for `requestId`, `edgeId`, `deviceId`, `commandType`, and `payload.value` with `set_bool` and `set_number` only in `edge_server/go_core/internal/cloud/commands.go`
- [x] T015 [US1] Implement `command_result` construction with ISO `completedAt`, no `failureReason` for `confirmed`, `edge_command_timeout` for `timeout`, and `edge_command_failed` for `failed` in `edge_server/go_core/internal/cloud/commands.go`
- [X] T016 [US1] Implement `SocketIOClient` command callback wiring so incoming Cloud payloads reach runtime code and outgoing terminal payloads use the existing `Emit` path in `edge_server/go_core/internal/cloud/socketio_client.go`
- [X] T017 [US1] Implement runtime bridge execution for valid commands through the bound `source.Manager.ExecuteCommand(...)` executor with the default 4-second Edge-side timeout in `edge_server/go_core/internal/runtime/command_bridge.go`
- [x] T018 [US1] Implement runtime bridge mapping for local `confirmed`, `timeout`, `failed`, context deadline, context cancellation, empty status, unexpected status, validation failure, edgeId mismatch, busy target, missing mapping, and adapter failure in `edge_server/go_core/internal/runtime/command_bridge.go`
- [x] T019 [US1] Ensure missing or invalid `requestId` is reported through an existing log or runtime error path as a protocol error and emits no `command_result` without adding a new logging framework in `edge_server/go_core/internal/runtime/command_bridge.go`
- [x] T020 [US1] Ensure runtime command execution runs asynchronously from transport read dispatch and cannot block Socket.IO heartbeat or lifecycle processing in `edge_server/go_core/internal/runtime/command_bridge.go`
- [x] T021 [US1] Ensure duplicate `requestId` events are suppressed by process-local at-most-once state and stale entries are cleaned up or evicted in `edge_server/go_core/internal/runtime/command_bridge.go`
- [x] T022 [US1] Complete runner reconnect behavior so each current `SocketIOClient` has exactly one command handler and reconnect does not create duplicate terminal responses in `edge_server/go_core/internal/runtime/runtime.go`
- [X] T023 [US1] Complete runtime app wiring so production `cmd/edge-runtime` uses the same source manager command bridge created during `runtimeapp.New(...)` in `edge_server/go_core/internal/runtimeapp/process.go`

**Checkpoint**: The Edge runtime bridge is functional through the real Cloud client path and is independently testable without Cloud DB, Client UI, or Modbus changes.

---

## Phase 4: Polish, Verification, and Review

**Purpose**: Verify the narrow slice and document runtime smoke without expanding proof volume.

- [x] T024 Run focused Cloud/runtime bridge tests with `go test ./internal/cloud ./internal/runtime ./internal/runtimeapp -count=1` from `edge_server/go_core`
- [x] T025 Run source command regression tests with `go test ./internal/source -count=1` from `edge_server/go_core`
- [x] T026 Add or update the manual runtime smoke procedure for an end-to-end local Cloud socket event to Edge `command_result` verification in `specs/009-edge-cloud-rpc/slices/plan_edge_rpc_bridge_slice.md`
- [x] T027 Complete Technical Lead Review for scope leakage, contract drift, runtime lifecycle, duplicate handlers, at-most-once cleanup, async dispatch, timeout mapping, and Lean Testing Policy in `specs/009-edge-cloud-rpc/slices/plan_edge_rpc_bridge_slice.md`

---

## Dependencies and Execution Order

### Phase Dependencies

- Phase 1 has no dependencies.
- Phase 2 depends on Phase 1 command DTO and runtime bridge anchors.
- Phase 3 depends on Phase 2 Cloud event hook, `SocketIOClient` API, runtime bridge binding, and runtimeapp source-manager wiring.
- Phase 4 depends on Phase 3 implementation and proofs.

### Task Dependencies

- T003 depends on T001 because the transport hook must carry the command event contract.
- T004 depends on T003.
- T005 depends on T003 and blocks package compilation after the interface change.
- T006 depends on T003 and T004.
- T007 depends on T001.
- T008 depends on T002.
- T009 depends on T002 and T008.
- T010 depends on T006 and T009.
- T011 depends on T009 and the existing `runtimeapp.Process.Sources` construction.
- T012 and T013 depend on T005 fake transport event injection and emitted event capture support.
- T012 and T013 should be written before T014-T023 when using test-first proof.
- T014 depends on T007.
- T015 depends on T007.
- T016 depends on T006, T014, and T015.
- T017 depends on T008, T009, T011, T014, and T016.
- T018 depends on T015 and T017.
- T019 depends on T014 and T018.
- T020 depends on T017.
- T021 depends on T008 and T017.
- T022 depends on T010, T020, and T021.
- T023 depends on T011 and T017.
- T024-T025 depend on T012-T023.
- T026 depends on the final runtime wiring from T023.
- T027 depends on T024-T026 results.

## Parallel Opportunities

- T002 can run in parallel with T001 because runtime bridge skeleton and Cloud DTO constants touch separate files.
- T004 and T007 can run in parallel after T003/T001 because WebSocket dispatch and DTO parsing are separate files.
- T008 can run in parallel with T004-T007 because request registry work is runtime-local.
- T012 and T013 can be drafted in parallel once the fake transport shape from T003-T006 is agreed.
- T014 and T015 can run in parallel if the Cloud command DTO owner keeps parser and response builder contracts explicit in `edge_server/go_core/internal/cloud/commands.go`.
- T020 and T021 can run in parallel after T017 if ownership inside `edge_server/go_core/internal/runtime/command_bridge.go` is coordinated carefully.
- T024 and T025 can run in parallel after implementation completes.

## Parallel Example: User Story 1

```text
Task: "Add the happy path runtime proof for `execute_command` reaching the source manager and emitting `command_result` with `status: \"confirmed\"`, echoed `requestId`, configured `edgeId`, ISO `completedAt`, and no `failureReason` in `edge_server/go_core/internal/runtimeapp/process_test.go`"
Task: "Implement `command_result` construction with ISO `completedAt`, no `failureReason` for `confirmed`, `edge_command_timeout` for `timeout`, and `edge_command_failed` for `failed` in `edge_server/go_core/internal/cloud/commands.go`"
```

## Implementation Strategy

### MVP First

1. Complete Phase 1 to establish the Cloud command vocabulary and runtime bridge anchor.
2. Complete Phase 2 to let the real Cloud client receive `execute_command` and let runtime bind a source-manager-backed executor.
3. Add the two lean runtime proofs in Phase 3.
4. Implement the runtime command bridge until both proofs pass.
5. Complete focused verification and Technical Lead Review.

### Validation Bias

- Keep validation compact and behavior-driven.
- Prefer one parser path with clear errors over table-driven validation matrices.
- Treat invalid payloads with valid `requestId` as terminal `failed`.
- Treat missing or invalid `requestId` as local protocol error only.
- Keep detailed local reason text out of the Cloud response payload.
- Do not add Modbus-specific checks to Cloud or runtime packages.

## Acceptance Checks

- A valid Cloud `execute_command` reaches `source.Manager.ExecuteCommand(...)` through the real Edge runtime Cloud client path.
- A `confirmed` source result emits `command_result` with the same `requestId`, configured `edgeId`, `status: "confirmed"`, ISO `completedAt`, and no `failureReason`.
- A local command timeout or command context deadline emits `status: "timeout"` with `failureReason: "edge_command_timeout"`.
- A validation error, missing command mapping, busy command target, adapter failure, context cancellation, empty status, unexpected status, or non-terminal local source status emits `status: "failed"` with `failureReason: "edge_command_failed"`.
- A missing or invalid `requestId` emits no `command_result`.
- A mismatched `edgeId` emits `failed` and does not call `source.Manager.ExecuteCommand(...)`.
- Duplicate events with the same `requestId` emit at most one terminal `command_result` in the running process.
- Runtime reconnect does not register duplicate command handlers and does not create duplicate responses for one `requestId`.
- Desired command values do not appear as telemetry.
- No task implements Cloud DB, Client UI, YAML schema changes, Modbus command implementation, retries, replay, or persistent Edge command history.

## Manual and Runtime Smoke

**Status:** Procedure updated; automated runtime proofs cover the production-owned Edge Cloud client path. Manual socket smoke remains a procedure unless a run log is attached separately.

Manual runtime smoke procedure exercises the real Edge Cloud client event path (not a local helper):

1. Start a local mock cloud server or Socket.IO harness on the `/edge` namespace.
2. Start the `edge-runtime` process with valid credentials and a test config pointing to a test device.
3. Emit an `execute_command` payload from the mock cloud via the active authenticated Socket.IO connection. Include valid `requestId`, matching `edgeId`, `deviceId`, `commandType` (`set_bool`), and `payload.value`.
4. Observe the `edge-runtime` console logs to confirm the real socket client received the event, checked the `edgeId`, bound a `requestId` reservation, and forwarded to `source.Manager`.
5. Observe the mock cloud server receiving exactly one `command_result` on the same socket with the correct `requestId`, `status: "confirmed"`, and no `failureReason`.
6. Inject a command with a mismatching `edgeId` and observe that `command_result` is `status: "failed"` and `failureReason: "edge_command_failed"`.
7. Inject a command that takes longer than 4 seconds and observe `status: "timeout"` with `failureReason: "edge_command_timeout"`.

*Validation Results*: Focused Go tests cover terminal status mapping (`edge_command_timeout`, `edge_command_failed`), source-manager-backed execution, duplicate suppression at the executor boundary, saturated in-flight registry rejection without executor bypass, and bridge-owned timeout emission without waiting for a misbehaving executor to return.

Do not count smoke as successful if a local helper calls `source.Manager.ExecuteCommand(...)` directly without exercising the real Edge Cloud client event path.

## Technical Lead Review

**Status:** Completed after fix-batch review.

### Review Scope
Review this task plan and implementation for Edge-only scope, Cloud WS contract alignment, runtime lifecycle wiring, module boundaries, duplicate handler risks, stale at-most-once state, async dispatch, timeout mapping, and lean proof volume.

### Review Checklist

- [x] Verify scope did not expand into Cloud API, Cloud DB, `CommandAudit`, Client UI, YAML parsing, Modbus command implementation, Presence Lock, retries, replay, or persistent command history.
- [x] Verify `internal/cloud` owns DTO parsing and transport event delivery only.
- [x] Verify `internal/cloud` does not import Modbus-specific logic or execute source commands.
- [x] Verify runtime or runtimeapp owns the bridge from Cloud event to `source.Manager.ExecuteCommand(...)`.
- [x] Verify `edgeId` is validated against configured runtime Edge ID before execution.
- [x] Verify Edge never generates `requestId`.
- [x] Verify missing or invalid `requestId` emits no `command_result`.
- [x] Verify every valid `requestId` gets at most one terminal `command_result`.
- [x] Verify at-most-once state is bounded or cleaned up without evicting active reservations into duplicate execution.
- [x] Verify command execution cannot block the transport read loop, Socket.IO heartbeats, or lifecycle event handling.
- [x] Verify `completedAt` is an ISO date-time created when the terminal result is produced.
- [x] Verify `confirmed` includes no `failureReason`.
- [x] Verify `timeout` uses only `edge_command_timeout`.
- [x] Verify `failed` uses only `edge_command_failed`.
- [x] Verify detailed local reasons are logged only and not exposed in the Cloud contract payload.
- [x] Verify `source.Manager` in-flight protection remains the command concurrency boundary for `deviceId + commandType`.
- [x] Verify reconnect does not register duplicate command handlers.
- [x] Verify the happy path proof uses the real runtime Cloud client event path.
- [x] Verify the negative proof is limited but sufficient: timeout or failed terminal result, no hang, no duplicate response, no duplicate executor call, and no executor bypass when the in-flight registry is saturated.

## Review Trigger

Review this plan when the Cloud WS command contract changes, Edge runtime socket lifecycle changes, `source.Manager.ExecuteCommand(...)` changes, Edge timeout policy changes, or command types beyond `set_bool` and `set_number` enter scope.
