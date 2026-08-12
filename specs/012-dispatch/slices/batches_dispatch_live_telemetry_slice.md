# Dispatch Live Telemetry Implementation Batches

## Batch 1: Bounded Journal Model

Execute `.agent\workflows\07b-speckit.implement.experimental.md` for the task batch in Scope.

Scope:
- TASK_IDS: T001, T014
- TASKS_FILE: `specs/012-dispatch/slices/plan_dispatch_live_telemetry_slice.md`

Batch-specific constraints:
- Preserve `deviceId + metric` as the only runtime filter identity.
- Prune by `receivedAt`; `eventTimestamp` is display data only.

Main proof:
- `client/tests/unit/dispatchLiveTelemetry.test.ts` proves append-only row normalization, binding-pair filtering, received-time pruning from memory, and waiting row count.

Do not count this as success:
- Do not satisfy pruning by hiding rendered rows while retaining old rows in the in-memory buffer.




## Batch 2: Telemetry-Only Runtime Session

Execute `.agent\workflows\07b-speckit.implement.experimental.md` for the task batch in Scope.

Scope:
- TASK_IDS: T002, T003, T004, T005, T020
- TASKS_FILE: `specs/012-dispatch/slices/plan_dispatch_live_telemetry_slice.md`

Batch-specific constraints:
- Reuse the existing Socket.IO subscribe and telemetry parsing contract.
- Keep existing Dashboard `startSession` behavior unchanged.

Main proof:
- The telemetry-only session emits `subscribe` with only `{ edgeId }`, reports transport status, accepts active-Edge telemetry, and disposes on unmount or selected Edge changes through the test harness path.

Do not count this as success:
- Do not call `useDashboardRuntimeSession` or start Dashboard alarm/widget side effects to receive telemetry.




## Batch 3: Live Telemetry Route And Main Flow

Execute `.agent\workflows\07b-speckit.implement.experimental.md` for the task batch in Scope.

Scope:
- TASK_IDS: T006, T007, T008, T009, T010
- TASKS_FILE: `specs/012-dispatch/slices/plan_dispatch_live_telemetry_slice.md`

Batch-specific constraints:
- The production route `/hub/dispatch/telemetry` must consume the real Dispatch selected context.
- Default rows must come only from `selectedBindingProfile.widgetBindings`.

Main proof:
- `client/tests/integration/DispatchWorkspacePage.test.tsx` proves selected Edge subscribe, binding-profile filtering, bound row rendering, newest-first ordering, ignored other-Edge telemetry, and no Dashboard visual/alarm runtime side effects.

Do not count this as success:
- Do not prove only a standalone component or mocked local callback while the route still renders `DispatchPlaceholderTab`.




## Batch 4: Placeholder Cleanup And Boundary Hardening

Execute `.agent\workflows\07a-speckit.implement.quickcheck.md` for the task batch in Scope.

Scope:
- TASK_IDS: T011, T012, T013
- TASKS_FILE: `specs/012-dispatch/slices/plan_dispatch_live_telemetry_slice.md`

Batch-specific constraints:
- Live Telemetry must remain an append-only journal, not Dashboard latest-value projection.
- `loadDashboardRuntimeContext` must remain Dashboard-only unless a task explicitly changes that boundary.

Main proof:
- The Telemetry placeholder type/path is removed, and `DispatchWorkspacePage.tsx` wires Live Telemetry without Dashboard saved diagram, catalog, alarm list, ACK, command lifecycle, or visual runtime context.

Do not count this as success:
- Do not leave Telemetry available as both a real tab and a still-valid placeholder path.




## Batch 5: Pause, Resume, And Stale Context Isolation

Execute `.agent\workflows\07b-speckit.implement.experimental.md` for the task batch in Scope.

Scope:
- TASK_IDS: T015, T016, T017, T018, T019
- TASKS_FILE: `specs/012-dispatch/slices/plan_dispatch_live_telemetry_slice.md`

Batch-specific constraints:
- Pause freezes visible rows only; bounded buffering must continue.
- Context changes must clear rows, paused snapshot, waiting indication, errors, and late callbacks.

Main proof:
- `client/tests/integration/DispatchWorkspacePage.test.tsx` proves Pause freezing, buffered waiting indication, Resume reconciliation, selected Edge/profile switch cleanup, and stale callback rejection.

Do not count this as success:
- Do not implement Pause by unsubscribing, dropping telemetry, or stopping buffer updates.




## Batch 6: Boundary Inspection And Focused Verification

Execute `.agent\workflows\07a-speckit.implement.quickcheck.md` for the task batch in Scope.

Scope:
- TASK_IDS: T021, T022, T023, T024, T025, T026, T027
- TASKS_FILE: `specs/012-dispatch/slices/plan_dispatch_live_telemetry_slice.md`

Batch-specific constraints:
- Verification must check the real route/runtime boundary, not only helper-level behavior.
- The legacy `/telemetry` WebSocket store must remain unused by Live Telemetry.

Main proof:
- Focused model tests, Dispatch workspace tests, Dashboard runtime regression tests, and Client build pass; inspections confirm no placeholder route, no Dashboard runtime side effects, and no legacy store dependency.

Do not count this as success:
- Do not skip `useDashboardRuntimeSession` regression after editing `cloudRuntimeClient.ts`.




## Batch 7: Evidence Notes And Technical Lead Review

Execute `.agent\workflows\07a-speckit.implement.quickcheck.md` for the task batch in Scope.

Scope:
- TASK_IDS: T028, T029, T030
- TASKS_FILE: `specs/012-dispatch/slices/plan_dispatch_live_telemetry_slice.md`

Batch-specific constraints:
- Separate automated/code proof from manual/runtime smoke status.
- Manual smoke must not be marked PASS unless it was actually run in a live authenticated environment.

Main proof:
- `specs/012-dispatch/slices/plan_dispatch_live_telemetry_slice.md` records verification results, remaining manual smoke status, and Technical Lead Review conclusions tied to the completed task IDs.

Do not count this as success:
- Do not treat code inspection or mocked integration tests as live physical telemetry smoke.
