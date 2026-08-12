# Dispatch Alarm Journal Slice Plan

## Document Scope

This document is the general implementation plan for the Dispatch Alarm Journal slice in `specs/012-dispatch`.

The primary reader is an implementation agent or reviewer replacing the `/hub/dispatch/alarms` placeholder with the expanded alarm incident journal for one selected Dispatch Edge Server.

This document intentionally does not include implementation batches.

## Purpose

This slice MUST replace the inert `/hub/dispatch/alarms` placeholder with a real expanded Alarm Journal tab for the selected Dispatch Edge Server.

The slice MUST reuse the existing Cloud alarm incident list endpoint and ACK lifecycle. It MUST keep the Dashboard compact operational journal, red-light, toast, and runtime socket ownership intact.

## Source Of Truth

- Dispatch route and subtab model: `doc_cursed/monitoring_workspace_routing_draft.md`.
- Dispatch shared context ownership: `doc_cursed/dispatch_onboarding_slice_draft.md`.
- Alarm lifecycle and ownership: `doc_cursed/alarms_plan.md`.
- Shared alarm incident list contract: `doc_cursed/alarm_incident_journal_api_plan.md`.
- Monitoring alarm journal MVP alignment: `doc_cursed/monitoring_plan.md`.
- Existing Dispatch shell baseline: `specs/012-dispatch/slices/plan_dispatch_workspace_shell_onboarding_slice.md`.
- Existing Cloud list and Dashboard initial-load proof: `specs/011-alarms/slices/plan_alarm_incident_list_slice.md`.

## Current Code Facts

- `client/src/features/dispatch/pages/DispatchWorkspacePage.tsx` routes `DISPATCH_ALARMS_TAB` to `DispatchPlaceholderTab`.
- `client/src/features/dispatch/components/DispatchActionSlot.tsx` already supports active-tab action registration scoped by selected context.
- `client/src/shared/api/alarmIncidents.ts` already exposes `listAlarmIncidents(edgeId, query?)` and `ackAlarmIncident(edgeId, incidentId)`.
- `client/src/features/dashboard/model/alarmIncidents.ts` already provides lifecycle, condition, equipment identity, timestamp, closed-time, sorting, and unclosed helpers for `AlarmIncidentProjection`.
- `client/src/features/dashboard/hooks/useDashboardRuntimeSession.ts` owns Dashboard compact journal runtime loading, realtime convergence, ACK state, red-light inputs, and stale selected-edge guards.
- `cloud_server/src/api/routes.ts` already registers `GET /api/edge-servers/:edgeId/alarm-incidents` and `POST /api/edge-servers/:edgeId/alarm-incidents/:incidentId/ack`.
- `cloud_server/src/services/alarm-incidents.service.ts` already validates USER trusted Edge access and returns `AlarmIncidentProjection` items with pagination metadata.
- `cloud_server/src/services/alarm-incidents.service.ts` currently sorts and paginates the alarm incident list after loading the filtered rows. This is a pre-existing Cloud performance risk, not a Dispatch Alarm Journal scope item.
- `cloud_server/openapi.yaml` already documents the alarm incident list and ACK endpoints.

## Scope

- MUST replace only the Dispatch Alarms placeholder with an expanded Alarm Journal tab.
- MUST use the selected Dispatch `edgeId` as the data source.
- MUST show a non-loading no-selected-Edge state and MUST NOT call Cloud when no valid `edgeId` is selected.
- MUST call `GET /api/edge-servers/:edgeId/alarm-incidents` through `listAlarmIncidents()`.
- MUST default to `state=unclosed&page=1&limit=50&sort=latest&order=desc`.
- MUST allow switching to `state=all` for historical incident reuse.
- MUST support bounded pagination using the existing Cloud list response metadata.
- MUST render rule label, equipment identity, condition summary, severity, lifecycle status, activated time, cleared time, acknowledged time, and derived closed time.
- MUST route ACK actions through `ackAlarmIncident()`.
- MUST update rows only after a Cloud ACK response confirms the changed projection.
- MUST show loading, empty, error, refresh, pagination, and no-selected-Edge states.
- MUST clear or ignore stale incident list and ACK responses after selected Edge changes.
- MUST use the Dispatch action slot for useful Alarm Journal controls or summary, including state filter, refresh, and incident count when it fits the existing shell pattern.
- MUST keep the Dashboard compact journal behavior intact.

## Out Of Scope

- MUST NOT change Edge alarm detection.
- MUST NOT change Edge YAML alarm parsing.
- MUST NOT move ordinary telemetry alarm evaluation into Cloud.
- MUST NOT change Cloud alarm incident lifecycle semantics.
- MUST NOT change Cloud ACK mutation semantics.
- MUST NOT add new Cloud alarm lifecycle fields or a second alarm incident list endpoint.
- MUST NOT add broad filters by severity, period, device, metric, text search, analytics, reports, exports, or full historical alarm analysis.
- MUST NOT implement widget-level blinking, target-widget highlighting, or Dashboard red-light changes.
- MUST NOT start Dashboard runtime socket sessions from `/hub/dispatch/alarms`.
- MUST NOT derive incidents from telemetry, widget labels, diagram geometry, saved bindings, Edge YAML, socket history, or local Client storage.
- MUST NOT change Constructor, command lifecycle, telemetry history, Trends, or Command Audit behavior.

## Assumptions

- `AlarmIncidentProjection` contains enough fields for the expanded MVP row display.
- Dispatch MAY reuse existing Dashboard alarm display helpers only for pure projection formatting.
- Dispatch MUST own its own tab request state and MUST NOT depend on Dashboard runtime session ownership, Dashboard runtime components, or Dashboard socket behavior.
- Minimal MVP pagination MAY use previous/next controls instead of arbitrary page jumps.
- `state=all` is a reuse mode for closed historical incidents, not a full historical analysis surface.
- Existing Cloud alarm incident list and ACK tests remain sufficient Cloud-side proof unless implementation review finds contract drift.
- The main Client proof can live in `client/tests/integration/DispatchWorkspacePage.test.tsx` with focused fixture support in `client/tests/integration/helpers/dispatchWorkspaceHarness.tsx`.

## Constraints

- MUST keep Cloud as the owner of incident persistence, lifecycle flags, ACK, list contract, trusted access, and projection.
- MUST keep Client as a display layer, projection cache, and ACK initiator.
- MUST keep REST helpers under `client/src/shared/api`.
- MUST keep Dispatch UI and Dispatch request state under `client/src/features/dispatch`.
- MUST keep Dashboard compact journal state under `client/src/features/dashboard`.
- MUST NOT implement the Dispatch Alarm Journal by importing Dashboard runtime hooks, Dashboard runtime socket clients, `DashboardDispatchSubtab`, or `DashboardAlarmJournalPanel`.
- MUST keep `/hub/dispatch/alarms` under the existing `/hub` USER auth guard.
- MUST NOT introduce `window.*` or `global.*` application state.
- MUST treat `unclosed` as `isActive == true OR isAcknowledged == false`.
- MUST treat `closed` as `isActive == false AND isAcknowledged == true`.
- MUST treat `severity` as rule importance, not lifecycle state.
- MUST derive `closedAt` for display as `max(clearedAt, acknowledgedAt)` only when the incident is closed.
- MUST NOT let ACK clear an active incident.
- MUST NOT let clear acknowledge an incident.
- MUST scope list loading, error state, pagination state, and ACK pending/error state to the active selected `edgeId`.
- MUST ignore stale list and ACK responses whose `edgeId`, request key, or selected context no longer matches the active tab state.
- MUST apply Lean Testing Policy: automated proof SHOULD cover the main Client Dispatch Alarm Journal path and at most one critical negative risk. Tests MUST NOT expand into broad table-driven coverage for every lifecycle combination, query permutation, visual class, timestamp format, or copy variant.

## Runtime Flow

1. USER opens `/hub/dispatch/alarms?diagramId=:diagramId&edgeId=:edgeId`.
2. The existing `/hub` auth guard protects the route.
3. Dispatch shell resolves the selected context.
4. Alarm Journal tab reads the selected `edgeId`.
5. If no valid `edgeId` is selected, the tab renders a no-selected-Edge state and does not call Cloud.
6. Client calls `listAlarmIncidents(edgeId, { state: 'unclosed', page: 1, limit: 50, sort: 'latest', order: 'desc' })`.
7. Cloud validates USER auth and trusted Edge access through the existing endpoint behavior.
8. Client renders the expanded table from returned `AlarmIncidentProjection` rows.
9. USER MAY switch `state` to `all`; Client resets to page 1 and reloads the same endpoint.
10. USER MAY use refresh; Client reloads the current query for the active selected Edge.
11. USER MAY page through the list using Cloud pagination metadata.
12. USER MAY ACK an unacknowledged incident; Client calls the existing ACK helper.
13. ACK pending/error state is scoped by active selected Edge and incident id.
14. Cloud-confirmed ACK projection updates the row.
15. Edge changes reset or isolate current tab state, and stale responses cannot repopulate old rows.

## Acceptance Checks

- `/hub/dispatch/alarms` renders an expanded Alarm Journal tab instead of `DispatchPlaceholderTab`.
- `DISPATCH_ALARMS_TAB` is no longer routed to `DispatchPlaceholderTab`.
- The tab uses the selected Dispatch `edgeId` and does not require a Dashboard runtime socket session.
- With no selected Edge, the tab shows a non-loading selection state and does not call the alarm incident list endpoint.
- The default selected-Edge request uses `state=unclosed&page=1&limit=50&sort=latest&order=desc`.
- Switching to `state=all` reloads the same endpoint and can render closed incidents.
- Rows display rule label, equipment identity, condition summary, severity, lifecycle status, activated time, cleared time, acknowledged time, and derived closed time.
- ACK calls `POST /api/edge-servers/:edgeId/alarm-incidents/:incidentId/ack` through the existing Client helper.
- ACK does not mutate lifecycle display before a matching Cloud ACK projection returns.
- Loading, empty, error, refresh, pagination, and no-selected-Edge states are visible and bounded.
- Dispatch action slot exposes useful Alarm Journal controls or summary for the active selected context.
- Changing selected Edge clears or isolates previous rows, pagination, load errors, and ACK pending/error state.
- Late list or ACK responses from a previous selected Edge do not update the active tab.
- The Dispatch Alarm Journal does not import or start Dashboard runtime session behavior.
- Dashboard compact alarm journal, red-light, toast, and runtime socket behavior remain intact.
- Cloud, Edge, Constructor, Trends, Command Audit, telemetry history, and Dashboard command behavior are unchanged.

## Format: `[ID] [P?] [Story?] Description`

- `[P]` means the task can run in parallel because it touches different files and does not depend on incomplete tasks.
- `[US1]` maps to selected-Edge alarm incident list loading, state switching, pagination, refresh, and expanded row rendering.
- `[US2]` maps to Cloud-confirmed ACK behavior and selected-Edge stale response isolation.
- Setup, Foundational, Polish, and Review tasks do not use story labels.
- Every task includes the file path that owns the change or proof.
- This document intentionally does not include implementation batches.

## Planning Note

The speckit prerequisite command `.agent/skills/scripts/powershell/check-prerequisites.ps1 -Json` was attempted during task planning and was blocked by local PowerShell Execution Policy. This does not block this slice plan because the user provided the target slice file, source documents, scope, code paths, runtime path, and constraints.

## Phase 1: Setup

**Purpose**: Add Dispatch Alarm Journal anchors and fixture support before replacing the placeholder.

- [X] T001 Add Dispatch alarm journal query defaults, load-state types, request-key helpers, pagination helpers, and display wrapper types in `client/src/features/dispatch/model/alarmJournal.ts`.
- [X] T002 [P] Extend Dispatch workspace alarm incident list and ACK fixture support, including deferred list/ACK responses and request capture, in `client/tests/integration/helpers/dispatchWorkspaceHarness.tsx`.
- [X] T003 Add Dispatch Alarm Journal row fixture aliases for active unacknowledged, active acknowledged, cleared unacknowledged, and closed projections in `client/tests/integration/helpers/dispatchWorkspaceHarness.tsx`.

**Checkpoint**: Dispatch has stable alarm journal model/test anchors without changing the `/hub/dispatch/alarms` route.

---

## Phase 2: Foundational Dispatch Components

**Purpose**: Build presentation primitives that can render `AlarmIncidentProjection` rows without starting Dashboard runtime behavior.

- [X] T004 Create `DispatchAlarmJournalTable` for expanded alarm incident rows, lifecycle timestamps, derived closed time, severity, ACK controls, row-level pending/error, and empty body rendering in `client/src/features/dispatch/components/DispatchAlarmJournalTable.tsx`.
- [X] T005 [P] Create `DispatchAlarmJournalPagination` for previous/next controls, page summary, total count, and `hasNextPage` handling in `client/src/features/dispatch/components/DispatchAlarmJournalPagination.tsx`.
- [X] T006 [P] Create `DispatchAlarmJournalToolbar` for `state=unclosed/all`, refresh, loading-disabled controls, and action-slot-compatible control content in `client/src/features/dispatch/components/DispatchAlarmJournalToolbar.tsx`.

**Checkpoint**: Dispatch can render alarm journal controls and rows from provided props, but the route still remains a placeholder until the tab container is wired.

---

## Phase 3: User Story 1 - Selected Edge Incident List And Expanded Rows (Priority: P1)

**Goal**: A USER opens `/hub/dispatch/alarms` with a selected Edge and sees an expanded paginated Alarm Journal loaded from the existing Cloud list endpoint, with `state=unclosed` by default and `state=all` available for closed incident reuse.

**Independent Test**: Mount User Hub Dispatch routes at `/hub/dispatch/alarms?diagramId=...&edgeId=...`, mock the alarm incident list endpoint, and verify selected Edge request defaults, expanded row fields, state switch to `all`, refresh or pagination, no-selected-Edge behavior, stale list response rejection, action slot controls, and no Dashboard runtime session.

### Tests For User Story 1

- [X] T007 [US1] Add focused Dispatch Alarm Journal integration proof for selected Edge default list query, expanded row rendering, `state=all` reload, refresh or pagination, no-selected-Edge state, stale list response rejection, action slot controls, and no Dashboard runtime session in `client/tests/integration/DispatchWorkspacePage.test.tsx`.

### Implementation For User Story 1

- [X] T008 [US1] Create `DispatchAlarmJournalTab` with selected `edgeId` validation, initial `state=unclosed&page=1&limit=50&sort=latest&order=desc` load, loading/empty/error states, refresh, pagination, state switching, and stale list response guards in `client/src/features/dispatch/components/DispatchAlarmJournalTab.tsx`.
- [X] T009 [US1] Wire `DispatchAlarmJournalTab` to `DISPATCH_ALARMS_TAB` instead of `DispatchPlaceholderTab` in `client/src/features/dispatch/pages/DispatchWorkspacePage.tsx`.
- [X] T010 [US1] Remove the Alarms placeholder path from `DispatchPlaceholderTabId` and placeholder messages while keeping Telemetry placeholders intact in `client/src/features/dispatch/components/DispatchPlaceholderTab.tsx`.
- [X] T011 [US1] Register Dispatch action slot controls for Alarm Journal state filter, refresh, and active result/page summary from `DispatchAlarmJournalTab` in `client/src/features/dispatch/components/DispatchAlarmJournalTab.tsx`.
- [X] T012 [US1] Ensure expanded row display uses `AlarmIncidentProjection` plus pure formatting helpers only and does not derive incidents from telemetry, diagram content, saved bindings, Edge YAML, socket history, or local storage in `client/src/features/dispatch/components/DispatchAlarmJournalTable.tsx`.

**Checkpoint**: `/hub/dispatch/alarms` is a real REST-backed expanded Alarm Journal for the selected Edge and does not start Dashboard runtime behavior.

---

## Phase 4: User Story 2 - Cloud-Confirmed ACK And Edge Isolation (Priority: P1)

**Goal**: A USER can ACK an unacknowledged incident from the Dispatch Alarm Journal, and the row changes only after a matching Cloud ACK projection returns for the active selected Edge.

**Independent Test**: Use the same Dispatch route harness to hold an ACK response pending, verify the row remains unacknowledged while only that incident is pending, release the Cloud-confirmed projection, verify the row updates, then switch Edge while an ACK response is in flight and verify the stale old-Edge response cannot update the active tab. ACK failure remains a manual/runtime smoke item unless implementation changes make it cheap to prove without expanding the focused flow.

### Tests For User Story 2

- [X] T013 [US2] Extend the focused Dispatch Alarm Journal integration proof with Cloud-confirmed ACK behavior, no pre-confirmation lifecycle mutation, per-incident pending state, stale ACK response rejection after selected Edge change, and no Dashboard runtime session in `client/tests/integration/DispatchWorkspacePage.test.tsx`.

### Implementation For User Story 2

- [X] T014 [US2] Add ACK pending/error state keyed by active selected Edge and incident id in `DispatchAlarmJournalTab` in `client/src/features/dispatch/components/DispatchAlarmJournalTab.tsx`.
- [X] T015 [US2] Implement ACK request handling through `ackAlarmIncident(edgeId, incidentId)` with no local lifecycle mutation before Cloud confirmation in `client/src/features/dispatch/components/DispatchAlarmJournalTab.tsx`.
- [X] T016 [US2] Apply only matching ACK response projections to the active row and ignore stale ACK responses whose Edge, incident id, or request key no longer matches active tab state in `client/src/features/dispatch/components/DispatchAlarmJournalTab.tsx`.
- [X] T017 [US2] Wire `DispatchAlarmJournalTable` ACK buttons to tab-owned ACK state so only the matching row is disabled or shows bounded error in `client/src/features/dispatch/components/DispatchAlarmJournalTable.tsx`.

**Checkpoint**: Dispatch initiates ACK through Cloud, waits for projection confirmation, and isolates old selected Edge ACK/list responses.

---

## Phase 5: Verification, Documentation Notes, And Technical Lead Review

**Purpose**: Verify boundaries, keep proof lean, and record implementation evidence without expanding the slice.

- [X] T018 Inspect `client/src/features/dispatch/pages/DispatchWorkspacePage.tsx` and verify `DISPATCH_ALARMS_TAB` no longer routes to `DispatchPlaceholderTab`.
- [X] T019 Inspect `client/src/features/dispatch/components/DispatchAlarmJournalTab.tsx`, `client/src/features/dispatch/components/DispatchAlarmJournalTable.tsx`, and `client/src/features/dispatch/components/DispatchAlarmJournalToolbar.tsx` to verify they do not import `useDashboardRuntimeSession`, Dashboard runtime socket clients, `DashboardDispatchSubtab`, or `DashboardAlarmJournalPanel`.
- [X] T020 Inspect `client/src/features/dashboard/hooks/useDashboardRuntimeSession.ts`, `client/src/features/dashboard/components/DashboardAlarmJournalPanel.tsx`, and `client/src/features/dashboard/components/DashboardRuntimeSurface.tsx` to verify Dashboard compact journal, red-light, toast, and runtime socket ownership were not changed for this slice.
- [X] T021 Inspect `client/src/shared/api/alarmIncidents.ts` and verify Dispatch uses the existing list and ACK helpers without adding a second endpoint helper.
- [X] T022 Run focused Dispatch workspace tests from `client` using `cmd /c npm run test -- DispatchWorkspacePage` and record the result in `specs/012-dispatch/slices/plan_dispatch_alarm_journal_slice.md`.
- [X] T023 Run focused alarm incident API/helper tests from `client` using `cmd /c npm run test -- alarmIncidentsContracts` and record the result in `specs/012-dispatch/slices/plan_dispatch_alarm_journal_slice.md`.
- [X] T024 Run focused Dashboard runtime regression tests from `client` using `cmd /c npm run test -- useDashboardRuntimeSession` and record the result in `specs/012-dispatch/slices/plan_dispatch_alarm_journal_slice.md`.
- [X] T025 Run Client build from `client` using `cmd /c npm run build` and record the result in `specs/012-dispatch/slices/plan_dispatch_alarm_journal_slice.md`.
- [X] T026 Add automated/code proof notes for selected Edge list loading, `state=unclosed/all`, pagination/refresh, row rendering, ACK confirmation, stale Edge response rejection, no Dashboard runtime session, and Lean Testing boundaries in `specs/012-dispatch/slices/plan_dispatch_alarm_journal_slice.md`.
- [X] T027 Add manual/runtime smoke notes for live selected Edge loading, `state=all`, pagination, ACK success/failure, Edge switch isolation, no-selected-Edge state, and no Dashboard runtime session in `specs/012-dispatch/slices/plan_dispatch_alarm_journal_slice.md`.
- [X] T028 Complete Technical Lead Review for scope leakage, Dispatch/Dashboard boundaries, Cloud contract reuse, stale list/ACK races, action slot cleanup, acceptance coverage, and Lean Testing Policy in `specs/012-dispatch/slices/plan_dispatch_alarm_journal_slice.md`.

---

## Dependencies And Execution Order

### Phase Dependencies

- Phase 1 establishes Dispatch alarm journal model and test fixture anchors.
- Phase 2 depends on Phase 1 model types and blocks user-facing tab wiring.
- Phase 3 depends on Phase 1 fixture support and Phase 2 components.
- Phase 4 depends on Phase 3 tab container and table wiring.
- Phase 5 depends on implementation completion from Phases 3 and 4.

### Task Dependencies

- T004 depends on T001 because the table should consume the Dispatch alarm journal display/state types.
- T005 depends on T001 pagination helpers.
- T006 depends on T001 query/state constants.
- T007 depends on T002-T003 and passes only after T008-T012.
- T008 depends on T001, T004, T005, and T006.
- T009 depends on T008.
- T010 depends on T009 because the placeholder type should only exclude Alarms after the real tab is wired.
- T011 depends on T006 and T008.
- T012 depends on T004 and the accepted pure formatting helper decision.
- T013 depends on T002-T003 and passes only after T014-T017.
- T014-T016 depend on T008.
- T017 depends on T014-T016 and T004.
- T018-T021 depend on implementation completion.
- T022-T025 depend on implementation completion and should run after T018-T021 inspection.
- T026-T028 depend on T022-T025 verification outcomes.

### Parallel Opportunities

- T002 can run in parallel with T001 because it touches test fixture helpers and does not change production behavior.
- T003 should follow T002 because both update `client/tests/integration/helpers/dispatchWorkspaceHarness.tsx`.
- T004, T005, and T006 can run in parallel after T001 because they target separate Dispatch component files.
- T007 and T013 can be drafted in the same integration test file while implementation proceeds, but one owner should coordinate the shared route setup.
- T014-T016 should be sequenced by one owner because they share tab-owned ACK state.
- T018-T021 can run in parallel with verification commands after implementation is complete because they inspect separate boundaries.
- T022-T024 can run in parallel if local Vitest resources are stable.

## Parallel Example: Components

```text
Task: "Create `DispatchAlarmJournalTable` for expanded alarm incident rows, lifecycle timestamps, derived closed time, severity, ACK controls, row-level pending/error, and empty body rendering in `client/src/features/dispatch/components/DispatchAlarmJournalTable.tsx`."
Task: "Create `DispatchAlarmJournalPagination` for previous/next controls, page summary, total count, and `hasNextPage` handling in `client/src/features/dispatch/components/DispatchAlarmJournalPagination.tsx`."
Task: "Create `DispatchAlarmJournalToolbar` for `state=unclosed/all`, refresh, loading-disabled controls, and action-slot-compatible control content in `client/src/features/dispatch/components/DispatchAlarmJournalToolbar.tsx`."
```

## Parallel Example: Verification

```text
Task: "Inspect `client/src/features/dispatch/components/DispatchAlarmJournalTab.tsx`, `client/src/features/dispatch/components/DispatchAlarmJournalTable.tsx`, and `client/src/features/dispatch/components/DispatchAlarmJournalToolbar.tsx` to verify they do not import Dashboard runtime dependencies."
Task: "Run focused Dispatch workspace tests from `client` using `cmd /c npm run test -- DispatchWorkspacePage` and record the result in `specs/012-dispatch/slices/plan_dispatch_alarm_journal_slice.md`."
```

## Implementation Strategy

### MVP First

1. Complete Phase 1 and Phase 2 to establish model, fixtures, and presentational primitives.
2. Complete Phase 3 to replace the Alarms placeholder with REST-backed list loading and expanded row display.
3. Complete Phase 4 to add Cloud-confirmed ACK and stale ACK response isolation.
4. Complete Phase 5 verification and Technical Lead Review.

### Boundary Bias

- Keep Dispatch Alarm Journal REST-backed and route-owned.
- Reuse shared `client/src/shared/api/alarmIncidents.ts` helpers instead of adding a new endpoint contract.
- Keep Dashboard runtime state, compact journal, red-light, toast, and socket behavior untouched.
- Keep pure projection formatting reusable only when it does not pull in Dashboard runtime ownership.
- Do not fix the existing Cloud list in-memory sort/pagination risk in this slice.
- Do not add broad historical filters, search, exports, analytics, or local alarm diagnosis.

## Manual And Runtime Smoke

Manual smoke SHOULD use a live Cloud server, an authenticated trusted USER, and a selected trusted Edge with seeded or emitted alarm incidents.

1. Open `/hub/dispatch/alarms?diagramId=:diagramId&edgeId=:edgeId`.
2. Confirm the Alarms tab renders the expanded journal instead of the placeholder.
3. Confirm the first list request is `GET /api/edge-servers/:edgeId/alarm-incidents` with `state=unclosed&page=1&limit=50&sort=latest&order=desc`.
4. Confirm the tab does not start a Dashboard runtime socket session.
5. Confirm unclosed rows show rule label, equipment identity, condition summary, severity, lifecycle status, activated time, cleared time, acknowledged time, and derived closed time.
6. Switch to `state=all` and confirm closed incidents can appear from the same endpoint.
7. Use pagination and refresh; confirm every request stays scoped to the selected Edge and current query.
8. ACK an unacknowledged incident and confirm the row does not change until Cloud returns the ACK projection.
9. Force an ACK failure and confirm the incident remains unacknowledged with bounded row error.
10. Switch selected Edge during a pending list or ACK request and confirm old rows, errors, pending state, and late old-Edge responses do not appear in the active tab.
11. Open the Dashboard tab and confirm compact journal, red-light, toast, and runtime behavior still work.

Manual smoke MUST NOT count as passed if Dispatch derives incidents from telemetry, starts Dashboard runtime behavior, mutates ACK locally before Cloud confirmation, shows previous-Edge rows after selection changes, or changes Cloud/Edge lifecycle semantics.

## Technical Lead Review Notes

The Stage 4 general-plan review found no blocking issue.

- Detailed task planning MUST include explicit placeholder replacement for the Alarms tab route.
- Detailed task planning MUST include a boundary inspection that proves the Dispatch Alarm Journal does not import Dashboard runtime hooks, Dashboard runtime socket clients, `DashboardDispatchSubtab`, or `DashboardAlarmJournalPanel`.
- Detailed task planning SHOULD include one focused stale-response proof that covers both list response and ACK response after selected Edge changes when this fits the lean integration flow.
- Detailed task planning SHOULD extend the Dispatch workspace test harness with alarm incident list and ACK fixtures instead of repeating one-off request handlers.
- The pre-existing Cloud list in-memory sort/pagination risk MUST NOT be fixed in this slice unless a separate Cloud performance task is explicitly accepted.

## Review Trigger

Review this plan when `AlarmIncidentProjection` changes, the alarm incident list or ACK endpoint changes, Dispatch selected-context ownership changes, Dashboard runtime session ownership changes, or broader historical alarm journal filters enter MVP scope.

## Quickcheck Verification Evidence

Recorded on 2026-05-17 from `client`.

- T022 `cmd /c npm run test -- DispatchWorkspacePage`: PASS. `tests/integration/DispatchWorkspacePage.test.tsx` passed with 8 tests. Non-failing warning recorded: Recharts emitted `The width(-1) and height(-1) of chart should be greater than 0` during the Dispatch Trends route test.
- T023 `cmd /c npm run test -- alarmIncidentsContracts`: PASS. `tests/unit/alarmIncidentsContracts.test.ts` passed with 5 tests. No non-failing warnings observed.
- T024 `cmd /c npm run test -- useDashboardRuntimeSession`: PASS. `tests/unit/useDashboardRuntimeSession.test.ts` passed with 11 tests. No non-failing warnings observed.
- T025 `cmd /c npm run build`: PASS. `tsc -b && vite build` completed, Vite transformed 2605 modules and built successfully. Non-failing warning recorded: Vite reported chunks larger than 500 kB after minification, including `assets/DispatchWorkspacePage-BXJY9iOA.js` at 832.05 kB.
- T026-T028 rerun `cmd /c npm run test -- DispatchWorkspacePage`: PASS. `tests/integration/DispatchWorkspacePage.test.tsx` passed with 8 tests after recording automated/code proof, manual/runtime smoke status, and Technical Lead Review results. Non-failing warning repeated: Recharts emitted `The width(-1) and height(-1) of chart should be greater than 0` during the Dispatch Trends route test.

## Automated And Code Proof Notes

Recorded on 2026-05-17 from code inspection and automated tests only. These notes are not manual/runtime smoke results.

- Selected Edge list loading, default query, `state=unclosed/all`, pagination, refresh, expanded row rendering, no-selected-Edge behavior, stale list response rejection, action slot controls, and no Dashboard runtime session are covered by `cmd /c npm run test -- DispatchWorkspacePage`, specifically `tests/integration/DispatchWorkspacePage.test.tsx` with fixtures from `tests/integration/helpers/dispatchWorkspaceHarness.tsx`.
- Cloud-confirmed ACK, no pre-confirmation lifecycle mutation, per-incident pending state, stale ACK response rejection after selected Edge change, and no Dashboard runtime session are covered by `cmd /c npm run test -- DispatchWorkspacePage`, specifically the Dispatch Alarms ACK integration flow.
- Shared API contract reuse is covered by `cmd /c npm run test -- alarmIncidentsContracts` and by inspection of `client/src/shared/api/alarmIncidents.ts`, which keeps `GET /edge-servers/:edgeId/alarm-incidents` and `POST /edge-servers/:edgeId/alarm-incidents/:incidentId/ack` as the only Client alarm incident helpers.
- Dashboard compact journal, red-light, toast, and runtime socket ownership regression coverage is provided by `cmd /c npm run test -- useDashboardRuntimeSession` and by inspection of `client/src/features/dashboard/hooks/useDashboardRuntimeSession.ts`, `client/src/features/dashboard/components/DashboardAlarmJournalPanel.tsx`, and `client/src/features/dashboard/components/DashboardRuntimeSurface.tsx`.
- Placeholder replacement and Dispatch boundary proof are tied to `client/src/features/dispatch/pages/DispatchWorkspacePage.tsx`, `client/src/features/dispatch/components/DispatchPlaceholderTab.tsx`, `client/src/features/dispatch/components/DispatchAlarmJournalTab.tsx`, `client/src/features/dispatch/components/DispatchAlarmJournalTable.tsx`, and `client/src/features/dispatch/components/DispatchAlarmJournalToolbar.tsx`.
- Lean Testing boundary: automated proof intentionally stays focused on the Dispatch route, shared alarm incident helper contract, Dashboard runtime regression, and Client build. It does not add broad matrix coverage for every lifecycle, query, timestamp, copy, or visual styling combination.

## Manual And Runtime Smoke Status

Recorded on 2026-05-17. Manual/runtime smoke was not run in a live authenticated Cloud/Client environment for this batch.

- Live selected Edge loading: NOT RUN. Requires live Cloud, authenticated trusted USER, selected trusted Edge, and seeded or emitted alarm incidents.
- `state=all` closed incident reuse: NOT RUN. Automated mocked proof exists, but no live Cloud/Client smoke was performed.
- Pagination and refresh against live Cloud: NOT RUN. Automated mocked proof exists, but no live runtime request trace was captured.
- ACK success against live Cloud: NOT RUN. Automated mocked proof exists for Cloud-confirmed projection behavior, but no live ACK mutation was performed.
- ACK failure handling against live Cloud: NOT RUN. This is not marked PASS from code inspection or mocked tests.
- Edge switch isolation during pending live list or ACK requests: NOT RUN. Automated stale-response proof exists, but no live Edge switch smoke was performed.
- No-selected-Edge state in live Client: NOT RUN. Automated proof exists, but no live authenticated route smoke was performed.
- No Dashboard runtime session from `/hub/dispatch/alarms` in live Client: NOT RUN. Automated harness proof exists, but this is not marked PASS as a manual smoke result.

Manual smoke remains OPEN until it is executed in a live authenticated Cloud/Client environment. Do not count manual ACK failure, Edge switch isolation, or no-runtime-session smoke as passed based only on this automated/code proof.

## Technical Lead Review Results

Recorded on 2026-05-17 from code inspection plus the verification commands listed in Quickcheck Verification Evidence.

- Scope leakage: PASS. The implemented surface stays in `client/src/features/dispatch`, `client/src/shared/api/alarmIncidents.ts`, and focused tests; no Edge, Constructor, Trends, Command Audit, telemetry history, or Cloud lifecycle behavior was changed for this slice.
- Dispatch/Dashboard boundaries: PASS. `DispatchAlarmJournalTab`, `DispatchAlarmJournalTable`, and `DispatchAlarmJournalToolbar` do not import `useDashboardRuntimeSession`, Dashboard runtime socket clients, `DashboardDispatchSubtab`, or `DashboardAlarmJournalPanel`. `DispatchWorkspacePage.tsx` still uses `DashboardDispatchSubtab` only for the Dashboard tab.
- Cloud contract reuse: PASS. Dispatch uses `listAlarmIncidents()` and `ackAlarmIncident()` from `client/src/shared/api/alarmIncidents.ts` and does not add a second alarm incident endpoint helper.
- Stale list/ACK races: PASS by automated proof. `DispatchAlarmJournalTab.tsx` scopes list guards by selected Edge and request key, scopes ACK state by selected Edge plus incident id, and the Dispatch integration test covers stale list and stale ACK responses after selected Edge changes.
- Action slot cleanup: PASS by automated proof. Alarm Journal controls are registered through `DispatchActionSlot` for the active selected context, and existing Dispatch route tests cover action slot cleanup/restoration across tabs.
- Acceptance coverage: PASS for automated/code proof. The selected Edge list, default query, `state=all`, pagination/refresh, row fields, ACK confirmation, stale-response isolation, no-selected-Edge state, existing Cloud helpers, and no Dashboard runtime session are covered by the focused commands. Manual/runtime acceptance remains NOT RUN as recorded above.
- Lean Testing Policy: PASS. The proof uses focused Dispatch workspace integration tests, alarm incident contract tests, Dashboard runtime regression tests, and Client build rather than broad table-driven lifecycle/query/visual coverage.
