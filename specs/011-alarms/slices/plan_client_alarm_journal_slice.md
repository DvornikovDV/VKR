# Tasks: Client Alarm Journal Slice

**Input**: `doc_cursed/alarms_plan.md`, `doc_cursed/monitoring_plan.md`, `doc/slices.md`, completed Cloud alarm incident journal slice, existing Cloud ACK endpoint, existing Dashboard runtime socket session, existing Dashboard alarm incident realtime parser.

**Prerequisites**: Completed Cloud alarm incident journal slice, Cloud `POST /api/edge-servers/:edgeId/alarm-incidents/:incidentId/ack`, Cloud `alarm_incident_changed` realtime broadcast, existing Dashboard runtime socket subscription by `edgeId`, existing Client `apiClient` JSend unwrap behavior.

**Historical blocked prerequisite**: At the time of this slice, the Cloud incident list endpoint was missing. This slice therefore treated initial load as blocked and MUST NOT be read as proof of current initial-load behavior. The missing-list gap was later closed by `specs/011-alarms/slices/plan_alarm_incident_list_slice.md`, which added `GET /api/edge-servers/:edgeId/alarm-incidents` and Dashboard initial loading.

**Tests**: Lean Testing Policy applies. Add one focused Client integration proof for realtime incident render plus ACK success, and at most one critical negative proof for ACK API failure. Do not add broad table-driven tests for every malformed incident payload field.

**Organization**: Tasks are grouped as setup, foundational Client runtime state, two independently testable user stories, and polish/review. This document intentionally does not include implementation batches.

## Purpose

This slice MUST add a minimal Client-side alarm incident journal to Dashboard runtime.

Client MUST display Cloud-owned incident projections, apply realtime `alarm_incident_changed` events, and initiate ACK through the existing Cloud REST endpoint.

Client MUST NOT become the source of alarm diagnosis, incident lifecycle truth, or historical incident loading. During this slice, the Cloud list contract was absent; current initial incident loading is covered by the later Alarm Incident List Slice.

## Scope

- MUST add Client-side alarm incident journal state scoped to the selected Dashboard `edgeId`.
- MUST apply `alarm_incident_changed` realtime events to local Client incident state by upserting or replacing incidents by `incidentId`.
- MUST render a minimal alarm incident journal in Dashboard for incidents known to the active Client runtime session.
- MUST show severity, derived lifecycle status, time, label or rule/device/metric identity, and an ACK action when `isAcknowledged=false`.
- MUST derive display status only from `isActive` and `isAcknowledged`.
- MUST add a typed Client API helper for ACK through `POST /api/edge-servers/:edgeId/alarm-incidents/:incidentId/ack`.
- MUST update the incident row only after the Cloud ACK response returns an updated incident projection or a Cloud realtime event confirms the changed state.
- MUST reset or isolate incident state and ACK pending/error state when selected `edgeId` changes.
- MUST preserve existing Dashboard telemetry, command, transport reconnect, and edge availability behavior.
- MAY sort known incidents locally by the latest relevant incident time for readability.
- MUST NOT add full journal filtering, pagination, analytics, reports, or historical search behavior.

## Out Of Scope

- MUST NOT implement Edge alarm detection.
- MUST NOT implement Edge YAML alarm rule parsing.
- MUST NOT implement Cloud alarm rule evaluation.
- MUST NOT change Cloud incident persistence.
- MUST NOT change Cloud ACK authorization or lifecycle mutation logic.
- MUST NOT implement a new Cloud incident list API in this Client slice.
- MUST NOT fake initial incident loading when the Cloud list endpoint is unavailable.
- MUST NOT seed local-only incidents as a substitute for Cloud-owned journal state.
- MUST NOT derive initial incidents from telemetry, widget labels, saved bindings, socket history, or diagram contents.
- MUST NOT implement Constructor alarm rule authoring.
- MUST NOT implement alarm rule configuration UI.
- MUST NOT implement diagram-level blinking, red-light visualization, or widget alarm overlays.
- MUST NOT add full historical journal UX, heavy filtering, pagination, analytics, or reports.
- MUST NOT close incidents locally without Cloud confirmation.

## Constraints

- MUST treat `doc_cursed/alarms_plan.md` as the source of truth for alarm ownership, lifecycle semantics, severity semantics, and ACK ownership.
- MUST keep Edge as the source of alarm diagnosis.
- MUST keep Cloud as the source of incident lifecycle truth and the incident journal owner.
- MUST keep Client limited to display, realtime projection, and ACK initiation.
- MUST NOT let Client compute alarm active state from telemetry.
- MUST NOT let Client mutate `isActive`.
- MUST treat `severity` as rule importance, not lifecycle status.
- MUST treat `closed` as `!isActive && isAcknowledged`.
- MUST use the same incident projection shape for REST ACK responses and `alarm_incident_changed` realtime events.
- MUST keep Dashboard as a native SPA feature under `client/src/features/dashboard` and `client/src/features/user-hub/pages/DashboardPage.tsx`.
- MUST use Cloud REST APIs through `client/src/shared/api/client.ts`.
- MUST implement ACK helper with the existing `apiClient` JSend unwrap behavior; `apiClient.post` returns the Cloud `data` object, so the ACK helper MUST expect `{ incident }`, not raw `{ status, data }`.
- MUST listen to Cloud Socket.IO runtime events through `client/src/features/dashboard/services/cloudRuntimeClient.ts`.
- MUST NOT import Cloud server code into Client.
- MUST NOT read Edge YAML or depend on Edge internal configuration files.
- MUST NOT introduce `window.*` or `global.*` application state.
- MUST apply Lean Testing Policy: automated proof MUST cover the main happy path and at most one critical negative scenario for the main risk; tests MUST NOT expand into broad table-driven validation matrices for every malformed incident payload field.
- MUST use ACK API failure as the critical negative proof: failed ACK MUST NOT locally acknowledge, close, or otherwise mutate incident lifecycle fields.
- SHOULD keep test code smaller than production code for this slice.
- SHOULD move complex edge cases to manual smoke or hardware smoke notes instead of broad automated matrices.

## Historical Initial Load Prerequisite

This section records the original 2026-05-09 prerequisite state. It is superseded by `specs/011-alarms/slices/plan_alarm_incident_list_slice.md`.

- At the time of this slice, the missing Cloud incident list endpoint was a blocking prerequisite for initial load.
- The slice MUST NOT plan fake loading, local-only seeding, or deriving initial incidents from telemetry or socket history.
- The slice MUST NOT treat a proposed `GET /api/edge-servers/:edgeId/alarm-incidents` route as existing unless Cloud routes and OpenAPI prove it.
- Realtime-only incident display was acceptable for incidents received after the Dashboard session started, as long as the plan explicitly stated that initial current-incident loading was blocked until Cloud exposed a real list contract.
- A bounded empty or unavailable state was required when no realtime incidents were known and initial load was blocked; the UI MUST NOT present that state as proof that the selected edge had no incidents.
- The future Cloud list endpoint was intentionally split into a separate Cloud contract slice, now completed by the Alarm Incident List Slice.

## Assumptions

- `specs/011-alarms` is the accepted planning bucket for alarm slices.
- The existing Cloud ACK endpoint remains `POST /api/edge-servers/:edgeId/alarm-incidents/:incidentId/ack`.
- The existing Cloud realtime event remains `alarm_incident_changed`.
- The existing Client parser in `client/src/features/dashboard/services/cloudRuntimeClient.ts` remains the runtime boundary for incident realtime payload validation.
- `useDashboardRuntimeSession` is the preferred owner for incident state because the state is scoped to the active runtime `edgeId` and already has stale-generation guards.
- ACK pending and ACK error state are scoped by `incidentId` and reset on `edgeId` change.
- ACK responses and realtime updates can arrive in either order and MUST converge through the same incident replacement path.
- The minimal journal UI can live in a dedicated Dashboard component and be wired through `DashboardRuntimeSurface` and `DashboardPage` without changing the visual canvas contract.
- The main proof can use realtime incident delivery for the initial visible row because true initial load is blocked by the missing Cloud list endpoint.

## Lifecycle Display Rules

| `isActive` | `isAcknowledged` | Display status |
| --- | --- | --- |
| `true` | `false` | Active Unacknowledged |
| `true` | `true` | Active Acknowledged |
| `false` | `false` | Cleared Unacknowledged |
| `false` | `true` | Closed |

## Format: `[ID] [P?] [Story?] Description`

- `[P]` means the task can run in parallel because it touches different files and does not depend on incomplete tasks.
- `[US1]` maps to realtime alarm journal display for the active Dashboard edge context.
- `[US2]` maps to Cloud-confirmed ACK from the Client journal.
- Every task includes the file path that owns the change or proof.

## Phase 1: Setup

**Purpose**: Add stable Client-side contract anchors before runtime state and UI wiring.

- [X] T001 Add typed alarm incident ACK DTOs and `ackAlarmIncident(edgeId, incidentId)` helper that calls `apiClient.post` and expects unwrapped `{ incident }` data in `client/src/shared/api/alarmIncidents.ts`
- [X] T002 [P] Add Dashboard alarm journal runtime/domain state types, ACK pending/error map types, and initial-load-blocked marker type in `client/src/features/dashboard/model/types.ts`
- [X] T003 [P] Add alarm incident display helpers for derived lifecycle label, row identity label, row time, local sort order, and upsert/replace by `incidentId` in `client/src/features/dashboard/model/alarmIncidents.ts`
- [X] T004 [P] Extend mock Dashboard runtime client and socket harness to support `onAlarmIncidentChanged` callbacks and emitted incident events in `client/tests/integration/helpers/mockDashboardRuntimeSocket.ts`

**Checkpoint**: Client has explicit alarm journal contracts, ACK REST helper, and test harness anchors without changing Dashboard behavior.

---

## Phase 2: Foundational Runtime State

**Purpose**: Store realtime incident journal state inside the selected Dashboard runtime session while preserving existing telemetry behavior.

- [X] T005 Extend `DashboardRuntimeSessionState` and `UseDashboardRuntimeSessionResult` with `alarmIncidents`, `alarmJournalInitialLoadBlocked`, `alarmAckPendingByIncidentId`, `alarmAckErrorByIncidentId`, and `acknowledgeAlarmIncident` in `client/src/features/dashboard/hooks/useDashboardRuntimeSession.ts`
- [X] T006 Wire `onAlarmIncidentChanged` from `cloudRuntimeClient.startSession` into `useDashboardRuntimeSession`, applying parsed events through the shared upsert helper only when the generation and active `edgeId` still match in `client/src/features/dashboard/hooks/useDashboardRuntimeSession.ts`
- [X] T007 Reset or isolate `alarmIncidents`, `alarmAckPendingByIncidentId`, and `alarmAckErrorByIncidentId` when runtime is disabled, `edgeId` changes, or the hook unmounts in `client/src/features/dashboard/hooks/useDashboardRuntimeSession.ts`
- [X] T008 Ensure reconnect status changes preserve known `alarmIncidents` the same way existing telemetry values are preserved, without replaying socket history or deriving initial incidents in `client/src/features/dashboard/hooks/useDashboardRuntimeSession.ts`
- [X] T009 Add focused runtime hook proof for realtime incident upsert, different-edge rejection, edge switch reset, and reconnect preservation in `client/tests/unit/useDashboardRuntimeSession.test.ts`

**Checkpoint**: Runtime session exposes a realtime-only incident journal scoped to the active `edgeId`; initial incident loading remains explicitly blocked by missing Cloud contract.

---

## Phase 3: User Story 1 - Display Realtime Alarm Journal (Priority: P1) MVP

**Goal**: A Dashboard user viewing an active `edgeId` sees incidents received through Cloud realtime events in a minimal journal without mistaking missing initial load for "no incidents".

**Independent Test**: Use the Dashboard integration harness to start a selected edge session, emit `alarm_incident_changed`, and assert the journal row appears with severity, derived status, time, identity, and ACK action while the no-realtime empty state is bounded and not a full-history success state.

### Implementation for User Story 1

- [X] T010 [US1] Create `DashboardAlarmJournalPanel` that renders bounded initial-load-blocked empty state, compact incident rows, severity, derived status, time, identity label, and conditional ACK action in `client/src/features/dashboard/components/DashboardAlarmJournalPanel.tsx`
- [X] T011 [US1] Add alarm journal props to `DashboardRuntimeSurfaceProps` and render `DashboardAlarmJournalPanel` in the Dashboard runtime surface without covering or replacing the visual canvas in `client/src/features/dashboard/components/DashboardRuntimeSurface.tsx`
- [X] T012 [US1] Pass `runtimeSession.alarmIncidents`, `runtimeSession.alarmJournalInitialLoadBlocked`, ACK pending/error maps, and ACK handler from `DashboardPage` into `DashboardRuntimeSurface` in `client/src/features/user-hub/pages/DashboardPage.tsx`
- [X] T013 [US1] Ensure journal rendering uses only `DashboardAlarmIncidentProjection` fields and does not inspect telemetry values, widget labels, saved bindings, diagram contents, or Edge YAML in `client/src/features/dashboard/components/DashboardAlarmJournalPanel.tsx`
- [X] T014 [US1] Add the realtime journal display portion of the focused Dashboard integration proof, including bounded blocked-initial-load empty state and one active unacknowledged incident row from `alarm_incident_changed`, in `client/tests/integration/DashboardPage.test.tsx`

**Checkpoint**: Dashboard can display known realtime incident projections for the selected edge while clearly showing that initial load is blocked until Cloud exposes a list endpoint.

---

## Phase 4: User Story 2 - ACK Incident After Cloud Confirmation (Priority: P1) MVP

**Goal**: A Dashboard user acknowledges an unacknowledged incident, and the row changes to acknowledged only after Cloud confirms through REST ACK response or realtime projection.

**Independent Test**: Use MSW and the Dashboard runtime harness to emit an Active Unacknowledged incident, click ACK, hold the ACK response pending, verify the row remains unacknowledged while disabled, release the Cloud response with an acknowledged projection, and verify the row updates.

### Tests for User Story 2

- [X] T015 [US2] Extend the same focused Dashboard integration proof with ACK success behavior that verifies the ACK request URL/method boundary, no required request body, pending row behavior, no local pre-confirmation ACK, and acknowledged row after Cloud response in `client/tests/integration/DashboardPage.test.tsx`
- [X] T016 [US2] Add the single critical ACK failure proof that verifies failed ACK leaves the incident unacknowledged, does not close it, clears pending state, and shows bounded error in `client/tests/integration/DashboardPage.test.tsx`

### Implementation for User Story 2

- [X] T017 [US2] Implement `acknowledgeAlarmIncident` inside `useDashboardRuntimeSession` with per-incident pending/error state, active-edge guard, `ackAlarmIncident` call, and success projection application through the same upsert/replace helper used by realtime events in `client/src/features/dashboard/hooks/useDashboardRuntimeSession.ts`
- [X] T018 [US2] Ensure current-generation ACK responses clear pending state only for the matching `incidentId`, while stale ACK responses for a previous `edgeId` or disposed generation do not update the active journal or active pending/error maps in `client/src/features/dashboard/hooks/useDashboardRuntimeSession.ts`
- [X] T019 [US2] Wire `DashboardAlarmJournalPanel` ACK button to the runtime ACK handler, disable only the matching row while pending, hide ACK for already acknowledged incidents, and display bounded row-level or panel-level ACK error in `client/src/features/dashboard/components/DashboardAlarmJournalPanel.tsx`
- [X] T020 [US2] Ensure ACK response and `alarm_incident_changed` confirmation converge through the same incident row replacement path even when they arrive in either order in `client/src/features/dashboard/hooks/useDashboardRuntimeSession.ts`

**Checkpoint**: Client initiates ACK but does not mark success until Cloud confirms, and failed ACK cannot mutate incident lifecycle state locally.

---

## Phase 5: Contract Alignment, Verification, and Review

**Purpose**: Verify Client-only alarm journal behavior, preserve Cloud/Edge boundaries, and keep Lean Testing proof narrow.

- [X] T021 Inspect `client/src/shared/api/alarmIncidents.ts` and verify it imports only shared API infrastructure, does not import Cloud code, and does not treat raw JSend `{ status, data }` as the helper result
- [X] T022 Inspect `client/src/features/dashboard/hooks/useDashboardRuntimeSession.ts` and verify incident state is scoped to active `edgeId`, stale generation guards are applied, reconnect preserves known incidents, and no initial list loading or telemetry-derived incident logic exists
- [X] T023 Inspect `client/src/features/dashboard/components/DashboardAlarmJournalPanel.tsx` and verify display status derives only from `isActive` and `isAcknowledged`, severity is not treated as lifecycle state, and empty blocked-initial-load state does not imply "no incidents"
- [X] T024 Inspect `client/tests/integration/DashboardPage.test.tsx` and `client/tests/unit/useDashboardRuntimeSession.test.ts` and remove any broad malformed-payload or table-driven validation matrix that exceeds Lean Testing Policy
- [X] T025 Run focused Client runtime hook tests with `cmd /c npm run test -- useDashboardRuntimeSession` from `client` and record the result in `specs/011-alarms/slices/plan_client_alarm_journal_slice.md` - PASS 2026-05-09: 1 test file passed, 7 tests passed.
- [X] T026 Run focused Dashboard page integration tests with `cmd /c npm run test -- DashboardPage` from `client` and record the result in `specs/011-alarms/slices/plan_client_alarm_journal_slice.md` - PASS 2026-05-09: 1 test file passed, 24 tests passed, including realtime alarm journal render and Cloud-confirmed ACK behavior.
- [X] T027 Run Client typecheck or build with `cmd /c npm run build` from `client` and record the result in `specs/011-alarms/slices/plan_client_alarm_journal_slice.md` - PASS 2026-05-09: `tsc -b && vite build` completed successfully.
- [X] T028 Add manual runtime smoke notes for selected-edge realtime incident render, blocked initial-load empty state, ACK success, ACK failure, edge switch reset, and reconnect preservation in `specs/011-alarms/slices/plan_client_alarm_journal_slice.md` - COMPLETED 2026-05-09: Manual smoke notes recorded below; live hardware/Cloud smoke was not executed in this documentation-only batch.
- [X] T029 Add automated/code proof notes for ACK helper shape, absence of Client incident list helper/load call while Cloud endpoint is missing, realtime upsert, ACK confirmation-only mutation, stale update guards, display status derivation, and Lean Testing boundaries in `specs/011-alarms/slices/plan_client_alarm_journal_slice.md` - COMPLETED 2026-05-09: Automated/code proof notes recorded below and tied to implemented Client behavior plus current Cloud ACK/list contract evidence.
- [X] T030 Complete Technical Lead Review for Client/Cloud/Edge boundaries, missing list endpoint handling, stale state, ACK races, reconnect behavior, UI scope, acceptance checks, and Lean Testing Policy in `specs/011-alarms/slices/plan_client_alarm_journal_slice.md` - COMPLETED 2026-05-09: Technical Lead Review completed below after inspecting implemented Client files, Cloud ACK/list route evidence, realtime incident parser, focused tests, and review validation commands.

---

## Dependencies and Execution Order

### Phase Dependencies

- Phase 1 has no production dependency and establishes Client contract anchors.
- Phase 2 depends on Phase 1 types, helpers, and test harness anchors.
- Phase 3 depends on Phase 2 runtime incident state.
- Phase 4 depends on Phase 1 ACK helper, Phase 2 runtime state, and Phase 3 journal UI.
- Phase 5 depends on Phases 3 and 4 implementation and proofs.

### Task Dependencies

- T001 blocks T017 because ACK runtime action needs the REST helper.
- T002 blocks T005, T010, and T011 because runtime state and UI props need shared Client types.
- T003 blocks T006, T010, T017, and T020 because all incident replacement and display semantics must use the same helpers.
- T004 blocks T009, T014, T015, and T016 because tests need runtime incident event support.
- T005 blocks T006 through T009 and T012.
- T006 blocks T009, T014, and all realtime journal UI proof.
- T007 blocks edge switch reset verification in T009 and T028.
- T008 blocks reconnect preservation verification in T009 and T028.
- T010 blocks T011 and T019.
- T011 blocks T012 and T014.
- T012 blocks T014, T015, and T016.
- T014 can be drafted before T015-T020 but passes only after UI and runtime state are wired.
- T015 and T016 can be drafted before T017-T020 but pass only after ACK implementation is complete.
- T017 depends on T001, T003, and T005.
- T018 depends on T017.
- T019 depends on T010, T012, and T017.
- T020 depends on T003, T006, and T017.
- T021-T030 depend on implementation completion.

## Parallel Opportunities

- T002, T003, and T004 can run in parallel after T001 is understood because they touch different files.
- T010 can begin after T002 and T003 while T005-T008 are being implemented, as long as props remain aligned.
- T014 can be drafted in parallel with T010-T012 using the existing runtime harness once T004 exists.
- T015 and T016 can be drafted in parallel with T017-T020 using MSW pending/failure responses.
- T021-T024 can run in parallel with verification commands after implementation is complete.
- T025-T027 can run in parallel if local tooling supports parallel Vitest/build execution without port or cache conflicts.

## Parallel Example: User Story 1

```text
Task: "Create `DashboardAlarmJournalPanel` that renders bounded initial-load-blocked empty state, compact incident rows, severity, derived status, time, identity label, and conditional ACK action in `client/src/features/dashboard/components/DashboardAlarmJournalPanel.tsx`"
Task: "Add the realtime journal display portion of the focused Dashboard integration proof, including bounded blocked-initial-load empty state and one active unacknowledged incident row from `alarm_incident_changed`, in `client/tests/integration/DashboardPage.test.tsx`"
```

## Parallel Example: User Story 2

```text
Task: "Implement `acknowledgeAlarmIncident` inside `useDashboardRuntimeSession` with per-incident pending/error state, active-edge guard, `ackAlarmIncident` call, and success projection application through the same upsert/replace helper used by realtime events in `client/src/features/dashboard/hooks/useDashboardRuntimeSession.ts`"
Task: "Add the single critical ACK failure proof that verifies failed ACK leaves the incident unacknowledged, does not close it, clears pending state, and shows bounded error in `client/tests/integration/DashboardPage.test.tsx`"
```

## Implementation Strategy

### MVP First

1. Complete Phase 1 to anchor ACK DTOs, Dashboard journal types, incident helpers, and test harness support.
2. Complete Phase 2 so runtime state can receive and preserve realtime incidents for the selected edge.
3. Complete Phase 3 so the user can see known incidents and the blocked initial-load state.
4. Complete Phase 4 so ACK is Cloud-confirmed and failure-safe.
5. Complete Phase 5 verification and Technical Lead Review.

### Boundary Bias

- Keep incident lifecycle truth in Cloud and Client state as a projection cache only.
- Keep alarm diagnosis in Edge and do not infer alarms from telemetry, widgets, bindings, labels, or diagram contents.
- Keep incident REST calls behind `client/src/shared/api/client.ts`.
- Keep realtime parsing inside `client/src/features/dashboard/services/cloudRuntimeClient.ts`.
- Keep Dashboard UI focused on the minimal operator journal and avoid historical UX expansion.
- Keep missing initial load explicit as blocked, not hidden behind local fallback behavior.

## Acceptance Checks

- Dashboard MUST keep existing telemetry rendering, command behavior, and reconnect behavior unchanged.
- Dashboard MUST show no fake initial incidents when the Cloud list endpoint is absent.
- The plan MUST identify the missing Cloud incident list endpoint as a blocking prerequisite for initial load.
- When initial load is blocked and no realtime incidents are known, Dashboard MUST show a bounded empty or unavailable state and MUST NOT imply that Cloud has no incidents for the selected edge.
- A valid `alarm_incident_changed` event for the active `edgeId` MUST render one incident row in the journal.
- An `alarm_incident_changed` event for a different `edgeId` MUST NOT affect the active journal.
- The journal row MUST show severity, derived status, relevant time, identity label or rule/device/metric fallback, and ACK action when the incident is unacknowledged.
- Display status MUST be derived only from `isActive` and `isAcknowledged`.
- Clicking ACK MUST disable the row ACK action while the request is in flight.
- ACK MUST NOT locally change `isAcknowledged`, `acknowledgedAt`, or display status before Cloud confirmation.
- Successful ACK response MUST update the row using the returned incident projection.
- Realtime ACK confirmation MUST be accepted through the same upsert/replace path as other incident changes.
- ACK response and realtime confirmation MUST converge to the same incident row even when they arrive in either order.
- Failed ACK MUST leave the incident unacknowledged, MUST NOT close the incident, MUST NOT mutate lifecycle fields, and MUST show a bounded error state.
- Changing selected `edgeId` MUST clear or isolate incident state and ACK pending/error state from the previous edge.
- Stale ACK responses or realtime events for a previous selected `edgeId` MUST NOT update the active journal.
- Lean automated proof MUST include the main runtime path and at most one critical ACK failure proof.

## Manual and Runtime Smoke

Manual smoke SHOULD use an existing Cloud runtime that can emit `alarm_incident_changed` and respond to the ACK endpoint. If the Cloud incident list endpoint is still absent, manual smoke MUST start from a realtime event emitted after Dashboard opens.

1. Open Dashboard with a valid `diagramId + edgeId` pair.
2. Confirm existing telemetry and command UI behavior still works for the selected edge.
3. Confirm the alarm journal shows a bounded blocked-initial-load empty state before realtime incidents arrive.
4. Confirm Client does not call `GET /api/edge-servers/:edgeId/alarm-incidents` or any other incident list endpoint while the Cloud list contract is absent.
5. Emit or simulate `alarm_incident_changed` for the selected `edgeId` with `isActive=true` and `isAcknowledged=false`.
6. Confirm the incident row shows severity, Active Unacknowledged status, time, identity, and ACK action.
7. Click ACK and confirm only that row action is disabled while pending.
8. Confirm the row does not become acknowledged before Cloud ACK response or realtime confirmation.
9. Return an ACK response with `isAcknowledged=true` and confirm the row becomes Active Acknowledged or Closed according to `isActive`.
10. Repeat with ACK failure and confirm the incident remains unacknowledged and a bounded error appears.
11. Switch to another `edgeId` and confirm previous-edge incidents and ACK pending/error state do not leak.
12. Trigger reconnect and confirm known incident rows are not corrupted while existing telemetry preservation behavior remains intact.

Do not count smoke as successful if Client derives alarms from telemetry, reads Edge YAML, fakes initial incident loading, marks ACK success before Cloud confirmation, treats severity as lifecycle state, or implies that missing initial load proves there are no Cloud incidents.

### Manual Smoke Notes - 2026-05-09

Manual live runtime smoke was not executed in this batch because no live Cloud/Edge runtime or hardware emission session was part of the requested scope. The smoke record for an operator or hardware run is therefore **NOT RUN (environment not provided)**, not a pass claim.

- Selected-edge realtime incident render: use an already-open Dashboard session for a valid `diagramId + edgeId` and emit `alarm_incident_changed` after the session starts. The expected implemented behavior is a row in `DashboardAlarmJournalPanel` sourced only from the Cloud realtime incident projection.
- Historical blocked initial-load empty state: before any realtime incident arrived, the journal had to show `Initial alarm incident load is unavailable.` and explain that the Cloud incident list endpoint was missing. This state must not say or imply "no incidents".
- Historical missing initial list endpoint blocker: manual smoke for this slice had to verify there was no `GET /api/edge-servers/:edgeId/alarm-incidents` or equivalent incident list request. This is superseded by the completed Alarm Incident List Slice.
- No fake/local incident loading: manual smoke must fail if incidents appear before a Cloud realtime event or Cloud ACK/realtime projection. Client must not seed local-only incidents, replay socket history as initial state, derive incidents from telemetry, inspect widget labels/bindings/diagram contents for incidents, or read Edge YAML.
- ACK success: click the row ACK action and keep the Cloud ACK response pending; the row must remain `Active Unacknowledged` and only that row action must be disabled. After the Cloud ACK response or realtime confirmation returns an acknowledged projection, the same row may change to `Active Acknowledged` or `Closed` according to `isActive` and `isAcknowledged`.
- ACK failure: return a failing ACK response; the row must remain unacknowledged, must not close, pending state must clear, and a bounded row error must appear.
- Edge switch reset: switch to another `edgeId`; previous-edge incidents plus ACK pending/error state must not remain visible in the active session. A late previous-edge realtime event or ACK response must not mutate the new active journal.
- Reconnect preservation: trigger transport reconnect for the same selected edge; known realtime incidents must remain preserved, and existing telemetry preservation behavior must remain intact.

### Automated and Code Proof Notes - 2026-05-09

- ACK helper shape: `client/src/shared/api/alarmIncidents.ts` imports only `apiClient`, calls `apiClient.post<AckAlarmIncidentResponse>('/edge-servers/${edgeId}/alarm-incidents/${incidentId}/ack')`, expects unwrapped `{ incident }`, and returns `response.incident`. It does not import Cloud server code and does not parse raw JSend `{ status, data }`.
- Historical Cloud ACK/list contract evidence: at the time of this slice, Cloud exposed ACK and realtime projection contracts but not the list route. This evidence is superseded by the completed Alarm Incident List Slice, which added `GET /api/edge-servers/:edgeId/alarm-incidents`.
- Historical missing initial load handling: at the time of this slice, `useDashboardRuntimeSession` initialized `alarmJournalInitialLoadBlocked` with `reason: 'missing-cloud-incident-list-endpoint'` for active sessions, and `DashboardAlarmJournalPanel` rendered a bounded unavailable state. Current initial-load behavior is owned by the Alarm Incident List Slice.
- Realtime upsert: `cloudRuntimeClient.ts` parses `alarm_incident_changed` for the expected `edgeId`; `useDashboardRuntimeSession` rejects stale generation or mismatched edge payloads and applies valid events through `upsertDashboardAlarmIncident`.
- ACK confirmation-only mutation: `acknowledgeAlarmIncident` sets per-incident pending/error state before the REST call but does not mutate incident lifecycle fields until the Cloud ACK response returns an acknowledged projection or a realtime projection arrives. Failed ACK updates only the bounded error map and leaves incident lifecycle fields unchanged.
- Stale state and ACK races: `generationRef`, active `edgeId` checks, request keys, and `shouldApplyAckResponseIncident` prevent stale edge/session ACK responses from updating the active journal and keep a newer realtime ACK confirmation from being overwritten by an older REST response.
- Display status derivation: `getDashboardAlarmIncidentLifecycleState` derives status only from `isActive` and `isAcknowledged`; `severity` is displayed by `DashboardAlarmJournalPanel` as rule importance styling and is not used as lifecycle state.
- Lean Testing boundary: the focused Dashboard integration proof covers the main realtime render plus Cloud-confirmed ACK path, including URL/method/body and no pre-confirmation ACK mutation. The single critical negative proof covers ACK API failure and verifies the incident remains unacknowledged/open with a bounded error. The runtime hook proof covers active-edge scoping, edge switch reset, reconnect preservation, stale generation behavior, and ACK race convergence without adding broad malformed-payload validation matrices.

### Technical Lead Review Evidence - 2026-05-09

This section records evidence gathered while completing T028-T030.

- Client boundary: Client owns only display, realtime projection cache, and ACK initiation through shared API infrastructure. No Client code imports Cloud server code, Edge code, Edge YAML, or Constructor internals for alarm incidents.
- Cloud boundary: Cloud remains the lifecycle owner for ACK. The current Cloud implementation exposes the ACK controller and route, projects the updated incident, emits `alarm_incident_changed`, and returns JSend success data with `{ incident }`.
- Edge boundary: no Edge alarm detection, Edge YAML parsing, or Edge lifecycle mutation was introduced or required for this Client slice.
- Historical missing initial load: during this slice, the missing Cloud incident list endpoint was an explicit blocker for initial load. The checked implementation did not add a fake/local incident loader, local-only seed data, telemetry-derived incidents, or socket-history replay.
- Stale state: active `edgeId` and generation guards are present for realtime, telemetry, runtime errors, and ACK response handling; edge switch clears incident and ACK pending/error state.
- ACK races: REST ACK response and realtime ACK confirmation converge through `upsertDashboardAlarmIncident`; stale older REST ACK responses do not overwrite a newer acknowledged projection.
- Reconnect behavior: reconnect status changes do not clear known alarm incidents and preserve existing telemetry behavior through the same runtime session state model.
- UI scope: `DashboardAlarmJournalPanel` is a minimal journal panel with bounded empty/error states and no filtering, pagination, reports, analytics, diagram red-light visualization, or incident history claim.
- Acceptance checks and Lean Testing: automated proof stays narrow around the main runtime path and one ACK failure scenario. Manual smoke remains a required live-environment follow-up and must not be counted as passed until executed against a runtime that can emit Cloud realtime incidents and ACK responses.

### Technical Lead Review Completion - 2026-05-09

Technical Lead Review result: PASS for the completed Client alarm journal slice, with no production-code correction required.

- Inspected `client/src/shared/api/alarmIncidents.ts`, `client/src/features/dashboard/services/cloudRuntimeClient.ts`, `client/src/features/dashboard/hooks/useDashboardRuntimeSession.ts`, `client/src/features/dashboard/model/alarmIncidents.ts`, `client/src/features/dashboard/components/DashboardAlarmJournalPanel.tsx`, `client/src/features/dashboard/components/DashboardRuntimeSurface.tsx`, `client/src/features/user-hub/pages/DashboardPage.tsx`, `client/tests/unit/useDashboardRuntimeSession.test.ts`, and `client/tests/integration/DashboardPage.test.tsx`.
- Inspected Cloud boundary evidence in `cloud_server/src/api/routes.ts`, `cloud_server/src/api/alarm-incidents.controller.ts`, `cloud_server/src/services/alarm-incidents.service.ts`, `cloud_server/src/socket/events/alarm.ts`, and `cloud_server/openapi.yaml`.
- Verified historical missing-list blocker handling: at the time of this slice, repository search found no Cloud `GET /api/edge-servers/:edgeId/alarm-incidents` route, no OpenAPI list path, and no Client incident list helper or initial load call. This fact is superseded by `plan_alarm_incident_list_slice.md`.
- Verified there is no fake/local incident loading: Client incident rows are populated only from parsed `alarm_incident_changed` projections or Cloud ACK/realtime confirmation projections, not from telemetry, socket history, widget labels, saved bindings, diagram contents, Constructor code, or Edge YAML.
- Verified ACK confirmation-only behavior: `acknowledgeAlarmIncident` sets only per-incident pending/error state before Cloud confirmation, applies acknowledged lifecycle projection only after a matching Cloud ACK response or realtime event, and the ACK failure proof keeps the row `Active Unacknowledged` without closing or mutating lifecycle fields.
- Verified stale state, ACK races, and reconnect behavior: runtime generation checks plus active `edgeId` checks reject stale realtime and ACK results; edge switch resets incident and ACK maps; reconnect status changes preserve known incidents and existing telemetry preservation behavior.
- Verified UI scope and lifecycle semantics: the panel is a minimal operator journal, the blocked initial-load state does not claim "no incidents", display status derives from `isActive` and `isAcknowledged`, and `severity` remains rule importance styling rather than lifecycle state.
- Verified Lean Testing Policy: focused hook and Dashboard integration proofs cover the main runtime/realtime/ACK path plus one critical ACK failure scenario; no broad malformed-payload validation matrix was added.
- Validation rerun: `cmd /c npm run test -- useDashboardRuntimeSession` from `client` passed with 1 test file and 7 tests; `cmd /c npm run test -- DashboardPage` from `client` passed with 1 test file and 24 tests.

## Technical Lead Review

Review this plan and implementation for Client-only journal projection ownership, Cloud-owned lifecycle truth, Edge-only alarm diagnosis, missing list endpoint handling, stale state, ACK race behavior, reconnect behavior, UI scope control, and Lean Testing discipline.

### Review Checklist

- Verify scope did not expand into Edge alarm detection, Edge YAML parsing, Cloud rule evaluation, Cloud persistence, Cloud ACK logic, Cloud list API implementation, Constructor authoring, diagram red-light visualization, full journal filtering, pagination, analytics, or reports.
- Verify the historical missing Cloud incident list endpoint blocker was handled honestly for this slice.
- Verify no fake loading, local-only seeding, telemetry-derived incident creation, or socket-history replay exists.
- Verify ACK helper uses `apiClient` and expects unwrapped `{ incident }` data.
- Verify no Client incident list helper or initial load call existed during this slice while the Cloud list endpoint was missing.
- Verify Client imports no Cloud server code.
- Verify realtime incident parsing remains in `cloudRuntimeClient.ts`.
- Verify `useDashboardRuntimeSession` scopes incident state and ACK state to active `edgeId`.
- Verify edge switch and unmount cleanup prevent stale incident and ACK state leaks.
- Verify reconnect preserves known incidents without corrupting telemetry behavior.
- Verify stale ACK responses or realtime events for previous edge contexts cannot update the active journal.
- Verify ACK response and realtime confirmation converge through the same incident upsert/replace path.
- Verify ACK pending state is per incident and does not disable unrelated rows.
- Verify failed ACK cannot locally acknowledge, close, or mutate lifecycle fields.
- Verify display status derives only from `isActive` and `isAcknowledged`.
- Verify `severity` is displayed as rule importance and not treated as lifecycle state.
- Verify the blocked-initial-load empty state does not imply Cloud has no incidents.
- Verify automated proof remains lean: one main Dashboard runtime path and one ACK failure proof, without broad malformed-payload matrices.
- Verify verification commands and manual smoke notes are recorded after implementation.

## Source Of Truth

- Alarm ownership and lifecycle semantics: `doc_cursed/alarms_plan.md`.
- Monitoring and operational journal context: `doc_cursed/monitoring_plan.md`.
- Slice planning rules: `doc/slices.md`.
- Cloud ACK and realtime contract evidence: `specs/011-alarms/slices/plan_cloud_alarm_incident_journal_slice.md`, `cloud_server/src/api/routes.ts`, `cloud_server/openapi.yaml`, `cloud_server/src/socket/events/alarm.ts`.

## Review Trigger

Review this plan when the Cloud incident list endpoint is added, the ACK route changes, `alarm_incident_changed` projection changes, `doc_cursed/alarms_plan.md` changes, Dashboard runtime session ownership changes, or the Client alarm journal scope expands beyond minimal MVP operator work.
