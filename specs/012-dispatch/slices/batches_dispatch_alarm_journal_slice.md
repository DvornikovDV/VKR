# Dispatch Alarm Journal Slice Implementation Batches

## Scope

This document contains execution prompts for implementing `specs/012-dispatch/slices/plan_dispatch_alarm_journal_slice.md`.

The slice plan remains the task source of truth. These batches only add batch-specific workflow, constraints, proof focus, and fake-success warnings.




## Batch 1: Model And Fixture Anchors

Execute `.agent\workflows\07a-speckit.implement.quickcheck.md` for the task batch in Scope.

Scope:
- TASK_IDS: T001, T002, T003
- TASKS_FILE: `specs/012-dispatch/slices/plan_dispatch_alarm_journal_slice.md`

Batch-specific constraints:
- Keep production state helpers under `client/src/features/dispatch/model`.
- Fixture helpers MUST model the existing Cloud list and ACK contracts, not a new alarm incident endpoint.

Main proof:
- Later Dispatch Alarm Journal integration tests can drive list and ACK behavior through `dispatchWorkspaceHarness` without one-off request handlers.

Do not count this as success:
- Adding fixtures that are not used through the Dispatch route harness or that bypass `client/src/shared/api/alarmIncidents.ts`.




## Batch 2: Presentation Primitives

Execute `.agent\workflows\07a-speckit.implement.quickcheck.md` for the task batch in Scope.

Scope:
- TASK_IDS: T004, T005, T006, T012
- TASKS_FILE: `specs/012-dispatch/slices/plan_dispatch_alarm_journal_slice.md`

Batch-specific constraints:
- Row display MUST use `AlarmIncidentProjection` fields and pure formatting helpers only.
- Presentation components MUST NOT import Dashboard runtime hooks, Dashboard socket clients, or Dashboard runtime components.

Main proof:
- The table, toolbar, and pagination components can render the required operator-facing incident fields and controls from explicit props.

Do not count this as success:
- Rendering only rule ids or lifecycle flags while omitting equipment identity, condition summary, lifecycle timestamps, or derived closed time.




## Batch 3: REST-Backed Alarms Tab

Execute `.agent\workflows\07b-speckit.implement.experimental.md` for the task batch in Scope.

Scope:
- TASK_IDS: T007, T008, T009, T010, T011
- TASKS_FILE: `specs/012-dispatch/slices/plan_dispatch_alarm_journal_slice.md`

Batch-specific constraints:
- `/hub/dispatch/alarms` MUST use selected Dispatch `edgeId` and default to `state=unclosed&page=1&limit=50&sort=latest&order=desc`.
- The Alarms tab MUST remain REST-backed and MUST NOT start Dashboard runtime socket behavior.

Main proof:
- `client/tests/integration/DispatchWorkspacePage.test.tsx` proves selected Edge list loading, expanded row rendering, `state=all`, refresh or pagination, no-selected-Edge behavior, stale list rejection, action slot controls, and no Dashboard runtime session.

Do not count this as success:
- Replacing the placeholder with a static table, local fixture data, Dashboard compact journal reuse, or a component that does not call the existing Cloud list helper.




## Batch 4: Cloud-Confirmed ACK

Execute `.agent\workflows\07b-speckit.implement.experimental.md` for the task batch in Scope.

Scope:
- TASK_IDS: T013, T014, T015, T016, T017
- TASKS_FILE: `specs/012-dispatch/slices/plan_dispatch_alarm_journal_slice.md`

Batch-specific constraints:
- ACK MUST NOT locally mutate incident lifecycle fields before a matching Cloud projection returns.
- ACK pending/error state MUST be scoped by active selected Edge and incident id.

Main proof:
- The focused Dispatch integration flow holds ACK pending, verifies no pre-confirmation lifecycle change, applies the Cloud-confirmed projection, and rejects a stale ACK response after selected Edge changes.

Do not count this as success:
- Disabling a row and immediately marking it acknowledged locally, or accepting an ACK response for an old selected Edge.




## Batch 5: Boundary Inspection

Execute `.agent\workflows\07a-speckit.implement.quickcheck.md` for the task batch in Scope.

Scope:
- TASK_IDS: T018, T019, T020, T021
- TASKS_FILE: `specs/012-dispatch/slices/plan_dispatch_alarm_journal_slice.md`

Batch-specific constraints:
- Dispatch Alarm Journal MUST replace only the Alarms placeholder.
- Dashboard compact journal, red-light, toast, runtime socket session, and shared alarm incident REST helpers MUST remain owned by their existing modules.

Main proof:
- Direct inspection confirms Alarms route wiring, no forbidden Dashboard runtime imports, unchanged Dashboard runtime ownership, and reuse of `client/src/shared/api/alarmIncidents.ts`.

Do not count this as success:
- Passing route tests while the new Dispatch tab imports Dashboard runtime session code or duplicates alarm incident REST helpers.




## Batch 6: Automated Verification

Execute `.agent\workflows\07a-speckit.implement.quickcheck.md` for the task batch in Scope.

Scope:
- TASK_IDS: T022, T023, T024, T025
- TASKS_FILE: `specs/012-dispatch/slices/plan_dispatch_alarm_journal_slice.md`

Batch-specific constraints:
- Verification MUST cover Dispatch route behavior, shared alarm incident helper contracts, Dashboard runtime regression, and Client build.
- Non-failing pre-existing warnings SHOULD be recorded, not hidden.

Main proof:
- Run the focused Client commands listed in T022-T025 and record the actual pass/fail outcomes in the slice plan.

Do not count this as success:
- Running only the new test case while skipping `alarmIncidentsContracts`, `useDashboardRuntimeSession`, or the Client build.




## Batch 7: Evidence, Manual Smoke, And Review

Execute `.agent\workflows\07a-speckit.implement.quickcheck.md` for the task batch in Scope.

Scope:
- TASK_IDS: T026, T027, T028
- TASKS_FILE: `specs/012-dispatch/slices/plan_dispatch_alarm_journal_slice.md`

Batch-specific constraints:
- Evidence notes MUST distinguish automated/code proof from manual/runtime smoke.
- Manual smoke MUST NOT be marked PASS unless it was actually run in a live authenticated Cloud/Client environment.

Main proof:
- The slice plan records automated/code proof, manual/runtime smoke status, and Technical Lead Review results tied to the implemented files and verification commands.

Do not count this as success:
- Marking manual ACK failure, Edge switch, or no-runtime-session smoke as passed based only on code inspection or mocked tests.

