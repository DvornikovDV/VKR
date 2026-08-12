# Implementation Batches: Edge Cloud Reconnect Resilience Slice

## Batch 1: Reconnect Policy Foundation

Execute `.agent\workflows\07b-speckit.implement.experimental.md` for the task batch in Scope.

Scope:
- TASK_IDS: T001, T002, T003, T005, T006
- TASKS_FILE: `specs/007-edge-server/slices/plan_edge_cloud_reconnect_resilience_slice.md`

Batch-specific constraints:
- Reconnect policy MUST be runtime-owned and config-driven.
- `maxAttempts=0` MUST mean unlimited retries, not one retry or no retries.

Main proof:
- Focused policy tests MUST prove unlimited retry, finite exhaustion, delay capping, and context-aware wait behavior through `edge_server/go_core/internal/runtime/reconnect_policy_test.go`.

Do not count this as success:
- A helper that computes delays but is not bindable by `Runner` on the production runtime path.

## Batch 2: Connect Timeout Wiring

Execute `.agent\workflows\07a-speckit.implement.quickcheck.md` for the task batch in Scope.

Scope:
- TASK_IDS: T004, T008, T038
- TASKS_FILE: `specs/007-edge-server/slices/plan_edge_cloud_reconnect_resilience_slice.md`

Batch-specific constraints:
- `cloud.connectTimeoutMs` MUST reach `WebSocketTransportConfig.ConnectTimeout`.
- The low-level transport MUST remain responsible for one bounded connect attempt only.

Main proof:
- Entrypoint or constructor-level proof MUST show the configured timeout value is passed into transport construction.

Do not count this as success:
- Relying on the transport default timeout while config validation still accepts `cloud.connectTimeoutMs`.

## Batch 3: Retry Status And Error Classification Foundation

Execute `.agent\workflows\07b-speckit.implement.experimental.md` for the task batch in Scope.

Scope:
- TASK_IDS: T009, T010, T011
- TASKS_FILE: `specs/007-edge-server/slices/plan_edge_cloud_reconnect_resilience_slice.md`

Batch-specific constraints:
- Retryable transport and internal/server-side auth errors MUST NOT clear the installed credential.
- Explicit credential or lifecycle rejections MUST remain terminal for the current credential.

Main proof:
- Runtime-state and operator projection behavior MUST expose retryable outage and terminal operator-action-required states without unsupported status values.

Do not count this as success:
- Marking all `connect_error` outcomes as terminal, or making all outcomes retryable.

## Batch 4: Runtimeapp Policy Wiring And Polling Continuity

Execute `.agent\workflows\07b-speckit.implement.experimental.md` for the task batch in Scope.

Scope:
- TASK_IDS: T007, T014, T037
- TASKS_FILE: `specs/007-edge-server/slices/plan_edge_cloud_reconnect_resilience_slice.md`

Batch-specific constraints:
- Local source polling MUST stay independent from Cloud connection availability.
- Config-to-policy wiring belongs in `runtimeapp`, not in the low-level transport.

Main proof:
- `runtimeapp` tests MUST prove reading dispatch remains initialized while Cloud startup connection is retrying.

Do not count this as success:
- A reconnect loop that works only when source polling is not started or is paused during Cloud outage.

## Batch 5: Startup Cloud Unavailable Recovery

Execute `.agent\workflows\07b-speckit.implement.experimental.md` for the task batch in Scope.

Scope:
- TASK_IDS: T012, T013, T015, T016, T017
- TASKS_FILE: `specs/007-edge-server/slices/plan_edge_cloud_reconnect_resilience_slice.md`

Batch-specific constraints:
- Startup `client.Connect` failures MUST be classified before deciding retry or terminal status.
- `Runner.Run` MUST NOT return a fatal error for ordinary retryable Cloud unavailability.

Main proof:
- Scripted runtime transport proof MUST show failed startup connect attempts, retryable persisted status, credential preservation, later successful reconnect, capabilities catalog emission, and prompt shutdown cancellation.

Do not count this as success:
- Letting the process crash and relying on a supervisor restart to reconnect.

## Batch 6: Telemetry Gating Without Replay

Execute `.agent\workflows\07b-speckit.implement.experimental.md` for the task batch in Scope.

Scope:
- TASK_IDS: T018, T039
- TASKS_FILE: `specs/007-edge-server/slices/plan_edge_cloud_reconnect_resilience_slice.md`

Batch-specific constraints:
- Local polling may continue while Cloud is unavailable, but Cloud telemetry emission MUST remain gated by trusted and connected state.
- Disconnected readings MUST be dropped, not replayed.

Main proof:
- Inspection and existing telemetry behavior MUST show no backlog, replay, or hidden buffering was introduced.

Do not count this as success:
- Buffering disconnected readings in memory and flushing them after reconnect.

## Batch 7: Established Disconnect Reconnect Path

Execute `.agent\workflows\07b-speckit.implement.experimental.md` for the task batch in Scope.

Scope:
- TASK_IDS: T019, T021, T023, T024
- TASKS_FILE: `specs/007-edge-server/slices/plan_edge_cloud_reconnect_resilience_slice.md`

Batch-specific constraints:
- Ordinary established-session disconnect MUST enter the shared reconnect policy.
- Reconnect success MUST re-emit capabilities and resume only new trusted telemetry.

Main proof:
- Runtime reconnect proof MUST assert retryable disconnected or retrying state before reconnect, then successful reconnect and capabilities re-emission.

Do not count this as success:
- Reconnecting while leaving runtime-state/status stale as trusted during the outage.

## Batch 8: Command Lifecycle Across Reconnect

Execute `.agent\workflows\07b-speckit.implement.experimental.md` for the task batch in Scope.

Scope:
- TASK_IDS: T020, T022
- TASKS_FILE: `specs/007-edge-server/slices/plan_edge_cloud_reconnect_resilience_slice.md`

Batch-specific constraints:
- Command bridge at-most-once terminal response behavior MUST survive reconnect.
- Reconnect MUST NOT introduce command replay.

Main proof:
- Runtime reconnect test MUST prove duplicate command terminal responses are not emitted after reconnect.

Do not count this as success:
- Re-registering handlers in a way that makes old command request IDs produce a second terminal result.

## Batch 9: Finite Retry Exhaustion

Execute `.agent\workflows\07b-speckit.implement.experimental.md` for the task batch in Scope.

Scope:
- TASK_IDS: T025, T029, T030
- TASKS_FILE: `specs/007-edge-server/slices/plan_edge_cloud_reconnect_resilience_slice.md`

Batch-specific constraints:
- Finite retry exhaustion MUST stop automatic Cloud retries for that outage state without stopping the Edge process.
- Exhaustion MUST use existing status schema values unless a new state is explicitly validated across persistence and projection.

Main proof:
- Scripted transport observation channels and context cancellation MUST prove `Runner.Run` remains alive, retry attempts stop after the configured cap, credential remains loaded, and terminal status is persisted.

Do not count this as success:
- Returning an ordinary Cloud retry exhaustion error to `cmd/edge-runtime`.

## Batch 10: Terminal Rejection And Internal Auth Handling

Execute `.agent\workflows\07b-speckit.implement.experimental.md` for the task batch in Scope.

Scope:
- TASK_IDS: T026, T027, T031, T032
- TASKS_FILE: `specs/007-edge-server/slices/plan_edge_cloud_reconnect_resilience_slice.md`

Batch-specific constraints:
- Invalid credential, blocked edge, edge not found, credential rotation, and credential replacement MUST stop automatic retry for the current credential.
- `edge_auth_internal_error` MUST remain retryable and MUST NOT clear the installed credential.

Main proof:
- Runtime tests MUST prove terminal rejection does not spin forever and internal auth error remains retryable with credential preserved.

Do not count this as success:
- Treating `edge_auth_internal_error` the same as `invalid_credential`.

## Batch 11: Status Store And Projection Validation

Execute `.agent\workflows\07b-speckit.implement.experimental.md` for the task batch in Scope.

Scope:
- TASK_IDS: T028, T033, T036
- TASKS_FILE: `specs/007-edge-server/slices/plan_edge_cloud_reconnect_resilience_slice.md`

Batch-specific constraints:
- Status output MUST stay within the existing `status.json` schema unless schema validation is updated deliberately.
- Runtime-state retry eligibility invariants MUST stay enforceable.

Main proof:
- Operator and state tests MUST validate retry exhaustion, retryable internal error, unsupported status values, and invalid retry eligibility.

Do not count this as success:
- Writing a status value that local status-store validation rejects.

## Batch 12: Focused Runtime Verification And Transport Boundary Review

Execute `.agent\workflows\07a-speckit.implement.quickcheck.md` for the task batch in Scope.

Scope:
- TASK_IDS: T034, T035, T040
- TASKS_FILE: `specs/007-edge-server/slices/plan_edge_cloud_reconnect_resilience_slice.md`

Batch-specific constraints:
- Reconnect scheduling MUST NOT move into `internal/cloud/websocket_transport.go`.
- Runtime and runtime-state tests MUST remain focused; do not add broad network failure matrices.

Main proof:
- Focused Go commands MUST pass for reconnect policy, runtime reconnect behavior, and runtime state behavior.

Do not count this as success:
- Passing helper-only tests while production `Runner.Run` reconnect behavior remains unverified.

## Batch 13: Manual Smoke And Technical Lead Review

Execute `.agent\workflows\07a-speckit.implement.quickcheck.md` for the task batch in Scope.

Scope:
- TASK_IDS: T041, T042
- TASKS_FILE: `specs/007-edge-server/slices/plan_edge_cloud_reconnect_resilience_slice.md`

Batch-specific constraints:
- Manual smoke notes MUST distinguish live runtime evidence from not-run hardware or Cloud evidence.
- Technical Lead Review MUST check reconnect ownership, credential clearing, status accuracy, telemetry gating, command replay exclusion, cancellation, stale state, and Lean Testing discipline.

Main proof:
- The slice plan MUST record smoke evidence or explicit not-run status, then complete Technical Lead Review with concrete file and behavior references.

Do not count this as success:
- Marking review complete without checking that no telemetry backlog, command replay, or transport-owned reconnect loop was introduced.
