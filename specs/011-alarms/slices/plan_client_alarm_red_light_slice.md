# Tasks: Client Alarm Red Light Slice

**Input**: `doc_cursed/alarms_plan.md`, `doc_cursed/monitoring_plan.md`, `doc/slices.md`, completed Cloud alarm incident journal slice, completed Client alarm journal slice, existing Dashboard runtime socket session, existing Dashboard alarm incident realtime parser, existing Client alarm incident projection state.

**Prerequisites**: Cloud `alarm_incident_changed` realtime broadcast, Client parsing for `alarm_incident_changed`, Client runtime `alarmIncidents` state scoped to the selected `edgeId`, and the minimal Dashboard alarm journal/ACK UI from `client_alarm_journal_slice`.

**Historical blocked prerequisite**: At the time of this slice, the Cloud incident list endpoint was still missing. This plan kept red-light indication realtime-known only and did not fake initial incident state. The missing-list gap was later closed by `specs/011-alarms/slices/plan_alarm_incident_list_slice.md`, which added `GET /api/edge-servers/:edgeId/alarm-incidents` and Dashboard initial loading.

**Tests**: Lean Testing Policy applies. Add one focused Dashboard integration proof for the main realtime path: an unclosed incident appears, badge/count turns on, toast appears for the new incident, duplicate same-incident updates do not spam toasts, dismissal does not change the badge/count, and a closed projection removes the indication. Add at most one critical negative proof for the main risk: a closed-first projection MUST NOT activate red-light or toast. Do not add broad table-driven tests for every lifecycle combination or malformed payload field.

**Organization**: Tasks are grouped as setup, foundational Client derivation/UI primitives, two independently testable user stories, and polish/review. This document intentionally does not include implementation batches.

## Purpose

This slice MUST add a Dashboard-level red-light indication for known unclosed alarm incidents.

Client MUST derive the indication from Cloud-owned incident projections already received through the Dashboard runtime session. Client MUST NOT become the source of alarm diagnosis, incident lifecycle truth, or historical incident loading.

## Scope

- MUST derive unclosed alarm incidents from known Client incident projections where `isActive || !isAcknowledged`.
- MUST treat an incident as fully closed only when `!isActive && isAcknowledged`.
- MUST show a visible Dashboard-level red-light badge or count when at least one known incident is unclosed.
- MUST clear the Dashboard-level red-light indication when the known incident set contains no unclosed incidents.
- MUST show a local toast-like notification when a newly known unclosed incident appears from `alarm_incident_changed`.
- MUST keep the toast-like notification local to the Dashboard runtime UI because no shared Client notification infrastructure exists.
- MUST make the toast dismissible; dismissal MUST NOT change red-light count or incident lifecycle state.
- MAY auto-dismiss the toast after a bounded local UI interval if this does not make the focused test flaky.
- MUST keep red-light and toast tracking scoped to the selected Dashboard `edgeId`.
- MUST preserve the existing alarm journal and ACK behavior.
- MUST keep missing initial incident load explicit when the Cloud list endpoint is unavailable. During this slice it was absent; current initial load is covered by the later Alarm Incident List Slice.
- SHOULD derive reusable unclosed-count helpers in the Dashboard model layer instead of duplicating lifecycle logic in UI components.
- MAY mention widget-level red-light or blinking as a future optional enhancement only if reliable `deviceId + metric` matching remains available through saved binding profiles.

## Out Of Scope

- MUST NOT implement Edge alarm detection.
- MUST NOT implement Edge YAML parsing in Client.
- MUST NOT implement Cloud alarm rule evaluation.
- MUST NOT add or fake a Cloud incident list endpoint.
- MUST NOT fake initial red-light state while the Cloud list endpoint is unavailable.
- MUST NOT infer incidents from telemetry values, widget labels, diagram text, colors, saved visual geometry, or Edge YAML.
- MUST NOT duplicate or redesign the existing ACK table or journal UI.
- MUST NOT change Cloud incident persistence or ACK semantics.
- MUST NOT add full historical journal filtering, pagination, analytics, or reports.
- MUST NOT introduce global state through `window.*` or `global.*`.
- MUST NOT include widget-level blinking in the MVP implementation scope.

## Constraints

- MUST treat `doc_cursed/alarms_plan.md` as the source of truth for alarm ownership, lifecycle semantics, severity semantics, and red-light closure rules.
- MUST keep Edge as the alarm diagnosis owner.
- MUST keep Cloud as the incident lifecycle truth and incident journal owner.
- MUST keep Client as a projection cache, display layer, and ACK initiator.
- MUST treat `severity` as rule importance, not lifecycle state.
- MUST derive red-light state only from `isActive` and `isAcknowledged`.
- MUST clear red-light indication only when every known incident is closed.
- MUST NOT treat an empty known incident set as proof that Cloud has no unclosed incidents while initial load is blocked.
- MUST keep Dashboard as a native SPA feature under `client/src/features/dashboard` and `client/src/features/user-hub/pages/DashboardPage.tsx`.
- MUST listen to incident changes through the existing `client/src/features/dashboard/services/cloudRuntimeClient.ts` runtime boundary.
- MUST NOT import Cloud server code into Client.
- MUST NOT read Edge YAML or depend on Edge internal configuration files.
- MUST reject stale previous-edge realtime events and ACK responses from creating toasts or changing red-light indication after edge switch.
- MUST keep the red-light badge/count from overlapping visual surface controls, the diagnostics handle, or journal ACK controls.
- MUST apply Lean Testing Policy: automated proof MUST cover the main happy path and at most one critical negative scenario for the main risk; tests MUST NOT expand into broad table-driven validation matrices for every lifecycle combination or malformed payload field.
- SHOULD use a closed-first incident projection as the critical negative proof when it best protects the red-light lifecycle rule.

## Assumptions

- `specs/011-alarms` remains the accepted planning bucket for alarm slices.
- The existing Cloud realtime event remains `alarm_incident_changed`.
- The existing Client runtime state remains `alarmIncidents` inside `useDashboardRuntimeSession`.
- The red-light badge/count can be rendered in `DashboardRuntimeSurface` or a small local Dashboard component without changing the alarm journal component ownership.
- Toast-like notification state can be tracked locally by `incidentId` for the active Dashboard runtime session.
- A newly known unclosed incident means an incident id that was not previously known in the active Dashboard runtime session and whose projection satisfies `isActive || !isAcknowledged`.
- Closed-first projections MUST NOT create toast notifications.
- Updates for an already known unclosed incident SHOULD NOT create repeated toast notifications.
- Edge switch SHOULD reset local toast tracking together with runtime incident state.
- Reconnect SHOULD preserve known incident projections and therefore preserve the derived red-light indication.
- Widget-level blinking is excluded from MVP even though saved binding profiles can contain `deviceId + metric` mappings.

## Runtime Flow

1. Edge detects an alarm and sends an alarm event to Cloud.
2. Cloud persists or updates the incident journal.
3. Cloud broadcasts `alarm_incident_changed` to subscribed Dashboard clients.
4. Client parses the event in `client/src/features/dashboard/services/cloudRuntimeClient.ts`.
5. `useDashboardRuntimeSession` upserts the incident into selected-edge runtime state.
6. Client derives known unclosed incidents where `isActive || !isAcknowledged`.
7. Dashboard shows a red-light badge/count when the unclosed count is greater than zero.
8. Dashboard shows one local toast-like notification when a new unclosed incident becomes known.
9. A later closed projection for the same incident reduces the unclosed count.
10. Dashboard removes the red-light indication when the known unclosed count reaches zero.

## Format: `[ID] [P?] [Story?] Description`

- `[P]` means the task can run in parallel because it touches different files and does not depend on incomplete tasks.
- `[US1]` maps to Dashboard-level red-light badge/count for known unclosed incidents.
- `[US2]` maps to local toast-like notification for newly known unclosed incidents.
- Every task includes the file path that owns the change or proof.

## Phase 1: Setup

**Purpose**: Add stable Client-side red-light anchors without changing runtime behavior.

- [X] T001 Add Dashboard alarm red-light summary and toast notice types in `client/src/features/dashboard/model/types.ts`
- [X] T002 [P] Extend alarm incident fixture overrides with explicit closed and unclosed incident shapes for red-light proofs in `client/tests/integration/helpers/mockDashboardRuntimeSocket.ts`

**Checkpoint**: The slice has explicit Client-side type anchors and test fixture support before UI behavior is added.

---

## Phase 2: Foundational Client Derivation And UI Primitives

**Purpose**: Build reusable red-light derivation and local UI primitives shared by the badge/count and toast stories.

- [X] T003 Add `isDashboardAlarmIncidentUnclosed`, `selectDashboardUnclosedAlarmIncidents`, `countDashboardUnclosedAlarmIncidents`, and `selectNewestDashboardUnclosedAlarmIncident` helpers in `client/src/features/dashboard/model/alarmIncidents.ts`
- [X] T004 Add a compact `DashboardAlarmRedLightIndicator` component with stable `data-testid` and accessible name that renders no element for count `0` and a visible red-light badge/count for count `>0` in `client/src/features/dashboard/components/DashboardAlarmRedLightIndicator.tsx`
- [X] T005 Add a compact `DashboardAlarmToastNotice` component with dismiss action, stable `data-testid`, stable alert/dialog role or accessible name, incident identity, and lifecycle-safe copy in `client/src/features/dashboard/components/DashboardAlarmToastNotice.tsx`

**Checkpoint**: Dashboard has reusable derivation and display primitives, but story behavior is not complete until runtime surface wiring and proof are done.

---

## Phase 3: User Story 1 - Show Dashboard Red-Light Badge/Count (Priority: P1) MVP

**Goal**: A Dashboard user sees a global red-light indication when the active runtime session knows at least one unclosed incident.

**Independent Test**: Use the existing Dashboard integration harness, start Dashboard for a selected `edgeId`, emit `alarm_incident_changed` for an unclosed incident, assert badge/count appears, then emit a closed projection for the same incident and assert the badge/count disappears.

### Tests for User Story 1

- [X] T006 [US1] Add the main focused Dashboard integration proof for unclosed realtime incident showing badge/count and toast, same-incident update producing no duplicate toast, toast dismissal leaving badge/count intact, and later closed projection clearing the indication in `client/tests/integration/DashboardPage.test.tsx`
- [X] T007 [US1] Add the single critical negative proof that a closed-first `alarm_incident_changed` projection activates neither badge/count nor toast in `client/tests/integration/DashboardPage.test.tsx`

### Implementation for User Story 1

- [X] T008 [US1] Compute unclosed incident count from `alarmIncidents` using model helpers inside `client/src/features/dashboard/components/DashboardRuntimeSurface.tsx`
- [X] T009 [US1] Render `DashboardAlarmRedLightIndicator` in the Dashboard runtime header or canvas area without overlapping visual controls, diagnostics handle, or journal ACK controls in `client/src/features/dashboard/components/DashboardRuntimeSurface.tsx`
- [X] T010 [US1] Ensure closed projections remain available to the existing journal by passing full `alarmIncidents` to `DashboardAlarmJournalPanel` while deriving red-light count separately in `client/src/features/dashboard/components/DashboardRuntimeSurface.tsx`
- [X] T011 [US1] Ensure the blocked initial-load empty state can coexist with no badge/count and still does not imply "no alarms" in `client/src/features/dashboard/components/DashboardRuntimeSurface.tsx`

**Checkpoint**: Dashboard shows and clears a global red-light badge/count for known unclosed incidents without changing journal or ACK behavior.

---

## Phase 4: User Story 2 - Notify On Newly Known Unclosed Incident (Priority: P1) MVP

**Goal**: A Dashboard user gets a local toast-like notification when a new unclosed incident becomes known during the active runtime session.

**Independent Test**: Use the existing Dashboard integration harness, emit a new unclosed incident, assert one toast-like notification appears, emit an update for the same incident, assert no duplicate toast spam, and dismiss the toast without changing the badge/count.

### Tests for User Story 2

The main toast behavior is covered by T006 to keep automated proof lean and avoid a second integration test for the same realtime path.

### Implementation for User Story 2

- [X] T012 [US2] Add local active-edge toast tracking by incident id in `client/src/features/dashboard/components/DashboardRuntimeSurface.tsx`
- [X] T013 [US2] Reset local toast tracking and visible toast state when `selectedEdgeId` changes, runtime context becomes inactive, or incident state is reset in `client/src/features/dashboard/components/DashboardRuntimeSurface.tsx`
- [X] T014 [US2] Show `DashboardAlarmToastNotice` only when an incident id transitions from unknown to known-unclosed for the active Dashboard session in `client/src/features/dashboard/components/DashboardRuntimeSurface.tsx`
- [X] T015 [US2] Ensure closed-first projections and stale previous-edge updates cannot create toast notifications in `client/src/features/dashboard/components/DashboardRuntimeSurface.tsx`
- [X] T016 [US2] Keep toast dismiss state local and independent from red-light count, alarm journal rows, ACK pending state, and ACK error state in `client/src/features/dashboard/components/DashboardRuntimeSurface.tsx`

**Checkpoint**: Dashboard notifies once for a newly known unclosed incident and does not spam or mutate incident lifecycle locally.

---

## Phase 5: Contract Alignment, Verification, And Review

**Purpose**: Verify Client-only red-light behavior, preserve Cloud/Edge boundaries, and keep Lean Testing proof narrow.

- [X] T017 Inspect `client/src/features/dashboard/model/alarmIncidents.ts` and verify unclosed helpers use only `isActive` and `isAcknowledged`, not `severity`, telemetry, labels, or diagram data
- [X] T018 Inspect `client/src/features/dashboard/components/DashboardRuntimeSurface.tsx` and verify red-light and toast state are scoped to the active selected `edgeId`, reset on edge switch, and do not overlap journal ACK behavior
- [X] T019 Inspect `client/src/features/dashboard/components/DashboardAlarmJournalPanel.tsx` and verify the existing journal and ACK UI were not redesigned for this slice
- [X] T020 Inspect `client/tests/integration/DashboardPage.test.tsx` and remove any broad lifecycle or malformed-payload table-driven matrix that exceeds Lean Testing Policy
- [X] T021 Run focused Dashboard page integration tests with `cmd /c npm run test -- DashboardPage` from `client` and record the result in `specs/011-alarms/slices/plan_client_alarm_red_light_slice.md`
- [X] T022 Run focused runtime hook tests with `cmd /c npm run test -- useDashboardRuntimeSession` from `client` if runtime hook or fixture behavior changed, and record the result in `specs/011-alarms/slices/plan_client_alarm_red_light_slice.md`
- [X] T023 Run Client build with `cmd /c npm run build` from `client` and record the result in `specs/011-alarms/slices/plan_client_alarm_red_light_slice.md`
- [X] T024 Add manual runtime smoke notes for selected-edge unclosed event, closed projection clearing, closed-first projection, toast dismiss, edge switch reset, reconnect preservation, and missing initial-load wording in `specs/011-alarms/slices/plan_client_alarm_red_light_slice.md`
- [X] T025 Add automated/code proof notes for unclosed derivation, absence of Cloud/Edge changes, no fake initial load, toast dedupe, stale edge protection, UI non-overlap, and Lean Testing boundaries in `specs/011-alarms/slices/plan_client_alarm_red_light_slice.md`
- [X] T026 Complete Technical Lead Review for Client/Cloud/Edge boundaries, `doc_cursed` alignment, stale state, toast dedupe, red-light clearing semantics, missing list endpoint handling, UI scope, acceptance checks, and Lean Testing Policy in `specs/011-alarms/slices/plan_client_alarm_red_light_slice.md`

---

## Dependencies And Execution Order

### Phase Dependencies

- Phase 1 has no production dependency and establishes type/test anchors.
- Phase 2 depends on Phase 1 type decisions and blocks both user stories.
- Phase 3 depends on Phase 2 red-light derivation and indicator primitives.
- Phase 4 depends on Phase 2 toast primitive and the same incident derivation helpers used by Phase 3.
- Phase 5 depends on Phases 3 and 4 implementation and proof.

### Task Dependencies

- T003 depends on T001 because helper return types should use the shared red-light summary shape if one is introduced.
- T004 depends on T001.
- T005 depends on T001.
- T006 and T007 depend on T002 and pass only after T008-T016 are implemented.
- T008 depends on T003.
- T009 depends on T004 and T008.
- T010 depends on T008 and the existing journal wiring.
- T011 depends on T009 and the existing blocked initial-load UI.
- T012 depends on T003 and T005.
- T013 depends on T012 and existing selected-edge props in `DashboardRuntimeSurface`.
- T014 depends on T012 and T005.
- T015 depends on T012 and T013.
- T016 depends on T014.
- T017-T026 depend on implementation completion.

## Parallel Opportunities

- T002 can run in parallel with T001 because it touches test fixtures.
- T004 and T005 can run in parallel after T001 because badge and toast components are independent files.
- T006 and T007 can be drafted in parallel in the same test file only if the implementer coordinates carefully to avoid duplicate setup.
- T008-T016 touch the same runtime surface file and SHOULD be sequenced by one implementer to avoid conflicts.
- T017-T020 can run in parallel with verification commands after implementation is complete.
- T021-T023 can run in parallel if the local test/build tooling supports it without cache conflicts.

## Parallel Example: Components

```text
Task: "Add a compact `DashboardAlarmRedLightIndicator` component that renders no element for count `0` and a visible red-light badge/count for count `>0` in `client/src/features/dashboard/components/DashboardAlarmRedLightIndicator.tsx`"
Task: "Add a compact `DashboardAlarmToastNotice` component with dismiss action, stable role/name, incident identity, and lifecycle-safe copy in `client/src/features/dashboard/components/DashboardAlarmToastNotice.tsx`"
```

## Implementation Strategy

### MVP First

1. Complete Phase 1 to anchor types and fixtures.
2. Complete Phase 2 to add derivation helpers and local UI primitives.
3. Complete Phase 3 so the user-visible badge/count works and clears correctly.
4. Complete Phase 4 so the user gets one local notification for a newly known unclosed incident.
5. Complete Phase 5 verification and Technical Lead Review.

### Boundary Bias

- Keep incident lifecycle truth in Cloud and Client state as a projection cache only.
- Keep alarm diagnosis in Edge and do not infer alarms from telemetry, widgets, bindings, labels, colors, or diagram contents.
- Keep realtime parsing inside `client/src/features/dashboard/services/cloudRuntimeClient.ts`.
- Keep red-light derivation in Dashboard model helpers and rendering in Dashboard UI components.
- Keep toast state local to Dashboard runtime UI; do not introduce a global notification store for this MVP slice.
- Keep the missing Cloud incident list endpoint explicit and avoid any initial-load fallback that claims there are no incidents.

## Acceptance Checks

- A realtime `alarm_incident_changed` event for the active Dashboard `edgeId` with `isActive=true` and `isAcknowledged=false` MUST make the global red-light indication visible with count `1`.
- A realtime event with `isActive=false` and `isAcknowledged=false` MUST count as unclosed.
- A realtime event with `isActive=true` and `isAcknowledged=true` MUST count as unclosed.
- A closed projection with `isActive=false` and `isAcknowledged=true` MUST NOT count as unclosed.
- A newly known unclosed incident MUST show a toast-like notification.
- A closed-first projection MUST NOT show a toast-like notification.
- An update for an already known unclosed incident MUST NOT spam duplicate toast notifications.
- Dismissing a toast MUST NOT change badge/count, journal rows, ACK pending state, ACK error state, or incident lifecycle fields.
- When the last known unclosed incident receives a closed projection, the badge/count MUST disappear.
- Different-edge incident events MUST NOT affect the active Dashboard red-light indication.
- Stale previous-edge ACK responses or realtime projections MUST NOT create toast notifications or red-light changes after edge switch.
- The missing initial load state MUST remain explicit and MUST NOT imply that no Cloud incidents exist.
- If the known incident set is empty while initial load is blocked, the badge/count MUST be absent but the UI MUST NOT claim "no alarms" or "no incidents".
- Existing alarm journal rendering MUST continue to show known incidents.
- Existing ACK behavior MUST remain Cloud-confirmed and MUST NOT be replaced by local lifecycle mutation.

## Verification Outcomes

- 2026-05-10 T021: `cmd /c npm run test -- DashboardPage` from `client` passed. Vitest reported `tests/integration/DashboardPage.test.tsx` as 1 passed test file with 26 passed tests, including the red-light/toast realtime path; duration 20.34s.
- 2026-05-10 T022: `cmd /c npm run test -- useDashboardRuntimeSession` from `client` passed. Vitest reported `tests/unit/useDashboardRuntimeSession.test.ts` as 1 passed test file with 7 passed tests; duration 1.47s.
- 2026-05-10 T023: `cmd /c npm run build` from `client` passed. The command completed `tsc -b && vite build`; Vite transformed 1933 modules and finished the production build in 4.16s.
- Prerequisite note: the quickcheck prerequisite script was attempted for this batch. Direct script execution was blocked by local PowerShell execution policy; a bypass retry with `SPECIFY_FEATURE='specs/011-alarms'` resolved to `specs/specs/011-alarms`; a retry with `SPECIFY_FEATURE='011-alarms'` found the feature directory but stopped because `specs/011-alarms/plan.md` is absent. The batch proceeded from this slice plan because the user explicitly allowed skipping the prerequisite check and provided the full scope.
- 2026-05-10 T024: manual/runtime smoke notes were added below. Manual smoke remains `NOT RUN` because no live Cloud/Edge runtime was used in this batch; no manual hardware/runtime item is recorded as passed.
- 2026-05-10 T025: automated/code proof notes were added below. Fresh validation passed with `cmd /c npm run test -- DashboardPage` from `client` (1 test file, 26 tests passed, duration 12.70s) and `cmd /c npm run test -- useDashboardRuntimeSession` from `client` (1 test file, 7 tests passed, duration 1.70s).
- 2026-05-10 T026: Technical Lead Review completed below. Fresh reviewer validation passed with `cmd /c npm run test -- DashboardPage` from `client` (1 test file, 26 tests passed, duration 11.35s), `cmd /c npm run test -- useDashboardRuntimeSession` from `client` (1 test file, 7 tests passed, duration 1.68s), and `cmd /c npm run build` from `client` (`tsc -b && vite build`, 1933 modules transformed, built in 2.76s).

## Manual And Runtime Smoke

### T024 Manual Runtime Smoke Notes

Status: `NOT RUN`. This batch did not use a live Cloud runtime, live Edge runtime, industrial device, or hardware event source. The notes below are a manual smoke script and expected observations only; they MUST NOT be counted as a passed runtime smoke result until executed against a live Cloud/Edge runtime.

- Selected-edge unclosed event: emit `alarm_incident_changed` for the open Dashboard `edgeId` with `isActive=true` and `isAcknowledged=false`; expect the Dashboard-level red-light count to show `1` and the journal row to remain Cloud-projection based.
- Closed projection clearing: emit a later projection for the same incident with `isActive=false` and `isAcknowledged=true`; expect the red-light indicator to disappear when no other known unclosed incident remains, while the journal row remains visible as `Closed`.
- Closed-first projection: emit a new incident first seen as `isActive=false` and `isAcknowledged=true`; expect no red-light indicator and no toast.
- Toast dismiss: after a newly known unclosed incident creates a toast, dismiss it; expect only the toast to disappear, with red-light count, journal row, ACK pending state, ACK error state, and incident lifecycle unchanged.
- Edge switch reset: switch to another `edgeId`; expect old-edge toast tracking and visible toast state to reset, and old-edge incidents not to affect the active red-light count.
- Reconnect preservation: trigger a transport reconnect without changing `edgeId`; expect known incident projections already in the active runtime session to continue deriving the red-light state after reconnect.
- Historical missing initial-load wording: before realtime incidents arrived, the journal had to say initial alarm incident load was unavailable because the Cloud incident list endpoint was missing; it must not claim there are no alarms or no incidents. Current initial-load behavior is covered by the Alarm Incident List Slice.

Manual smoke SHOULD use an existing Cloud runtime that can emit `alarm_incident_changed`. Historical realtime-only smoke for this slice started from a realtime event emitted after Dashboard opened; current full initial-load smoke is owned by the Alarm Incident List Slice.

1. Open Dashboard with a valid `diagramId + edgeId` pair.
2. Confirm the existing visual surface, journal, ACK buttons, diagnostics handle, and command controls still render.
3. Confirm the blocked initial-load journal state remains explicit before realtime incidents arrive and does not claim there are no alarms.
4. Emit `alarm_incident_changed` for the selected `edgeId` with `isActive=true` and `isAcknowledged=false`.
5. Confirm a Dashboard-level red-light badge/count appears with count `1`.
6. Confirm a local toast-like notification appears for the new unclosed incident.
7. Emit an update for the same incident that remains unclosed and confirm no duplicate toast spam occurs.
8. Dismiss the toast and confirm the badge/count remains visible.
9. Emit a closed projection for the same incident with `isActive=false` and `isAcknowledged=true`.
10. Confirm the badge/count disappears when no other known unclosed incidents remain.
11. Emit a closed-first projection for another incident and confirm no badge/count or toast appears.
12. Switch to another `edgeId` and confirm old-edge red-light and toast state do not leak.
13. Trigger reconnect for the same edge and confirm known unclosed incident indication is preserved from the local projection cache.

Do not count smoke as successful if Client derives alarms from telemetry, reads Edge YAML, fakes initial incident loading, treats severity as lifecycle state, marks ACK success before Cloud confirmation, or shows widget-level blinking as part of this MVP slice.

## Automated And Code Proof Notes

### T025 Automated/Code Proof

- Unclosed derivation: `client/src/features/dashboard/model/alarmIncidents.ts` defines `isDashboardAlarmIncidentUnclosed` as `incident.isActive || !incident.isAcknowledged`; `countDashboardUnclosedAlarmIncidents` and the red-light summary helpers delegate to that lifecycle rule. `severity`, telemetry, widget labels, diagram content, colors, saved geometry, and Edge YAML are not part of the derivation.
- Dashboard UI wiring: `client/src/features/dashboard/components/DashboardRuntimeSurface.tsx` filters `alarmIncidents` to the active `selectedEdgeId` before computing the red-light count and toast transitions. The red-light indicator is rendered in the header action group, while the toast is positioned in the visual surface; the journal panel still receives the full `alarmIncidents` list and owns ACK controls separately.
- Historical no fake initial load: during this slice, `client/src/features/dashboard/hooks/useDashboardRuntimeSession.ts` kept `alarmJournalInitialLoadBlocked` set to `missing-cloud-incident-list-endpoint` for active sessions and initialized `alarmIncidents` as an empty projection cache, not as proof of no Cloud incidents. This is superseded by the completed Alarm Incident List Slice.
- Toast dedupe and dismissal: `DashboardRuntimeSurface` tracks known incident ids in local component state for the active toast session. An incident id is added once when first seen; same-incident updates do not create another toast, closed-first projections are marked known without showing a toast, and dismissing the toast only clears local toast state.
- Stale edge protection: `useDashboardRuntimeSession` guards realtime callbacks and ACK responses with the active generation and normalized `edgeId`; `cloudRuntimeClient.ts` also rejects parsed `alarm_incident_changed` payloads whose event or incident `edgeId` does not match the subscribed edge.
- Absence of Cloud/Edge code changes: tracked code changes for this proof batch were limited to `client/src/features/dashboard/components/DashboardRuntimeSurface.tsx` and `client/tests/integration/DashboardPage.test.tsx`; no `cloud_server` or `edge_server` files were changed for the red-light slice.
- Lean Testing boundaries: `client/tests/integration/DashboardPage.test.tsx` keeps the main realtime proof to the unclosed badge/count plus one toast, same-incident dedupe, toast dismissal, and closed projection clearing path, with one closed-first negative proof. It does not add a broad malformed-payload or lifecycle matrix.
- Automated validation: `cmd /c npm run test -- DashboardPage` passed with 26 tests, including the red-light/toast realtime path and reconnect preservation coverage. `cmd /c npm run test -- useDashboardRuntimeSession` passed with 7 runtime hook tests covering active-edge filtering, stale event rejection, session reset, and ACK race handling.
- Technical lead review evidence captured in this batch: Client remains a projection cache/display layer and ACK initiator; Cloud remains lifecycle/journal owner; Edge remains alarm diagnosis owner; the historical missing-list endpoint handling stayed explicit for this slice; stale state, toast dedupe, red-light clearing semantics, UI scope, and Lean Testing boundaries have code and automated proof above. T026 remains a separate checklist item unless explicitly included in scope.

## Technical Lead Review

Review this plan and implementation for Client-only red-light projection ownership, Cloud-owned lifecycle truth, Edge-only alarm diagnosis, missing list endpoint handling, stale state, toast dedupe, red-light clearing semantics, UI scope control, and Lean Testing discipline.

### Review Checklist

- [X] Verify scope did not expand into Edge alarm detection, Edge YAML parsing, Cloud rule evaluation, Cloud persistence, Cloud ACK logic, Cloud list API implementation, Constructor authoring, widget-level blinking, full journal filtering, pagination, analytics, or reports.
- [X] Verify `doc_cursed/alarms_plan.md` remains the source of truth for lifecycle flags, severity semantics, Cloud journal ownership, ACK ownership, and red-light closure semantics.
- [X] Verify unclosed derivation is exactly `isActive || !isAcknowledged`.
- [X] Verify closed derivation is exactly `!isActive && isAcknowledged`.
- [X] Verify `severity` is not used as lifecycle state.
- [X] Verify no Client code infers incidents from telemetry, labels, colors, diagram contents, saved geometry, or Edge YAML.
- [X] Verify historical missing initial load remains explicit and does not imply zero incidents.
- [X] Verify red-light state is scoped to active selected `edgeId`.
- [X] Verify edge switch resets toast tracking and visible toast state.
- [X] Verify reconnect preserves known incident projections and derived red-light state.
- [X] Verify stale previous-edge realtime events and ACK responses cannot create toast or red-light changes.
- [X] Verify newly known unclosed incident detection is based on incident id entering known-unclosed state in the active Dashboard session.
- [X] Verify closed-first projections do not create toast notifications.
- [X] Verify same-incident updates do not spam duplicate toast notifications.
- [X] Verify dismissing toast does not mutate incident lifecycle, journal rows, ACK pending state, ACK error state, or badge/count.
- [X] Verify red-light badge/count does not overlap visual controls, diagnostics handle, or journal ACK controls.
- [X] Verify existing alarm journal and ACK behavior remain intact.
- [X] Verify automated proof remains lean: one main Dashboard realtime path plus at most one closed-first negative proof, without broad malformed-payload or lifecycle table matrices.
- [X] Verify verification commands and manual smoke notes are recorded after implementation.

Technical Lead Review completed on 2026-05-10. Result: PASS for T026.

- Files inspected for the Client red-light slice: `client/src/features/dashboard/model/types.ts`, `client/src/features/dashboard/model/alarmIncidents.ts`, `client/src/features/dashboard/services/cloudRuntimeClient.ts`, `client/src/features/dashboard/hooks/useDashboardRuntimeSession.ts`, `client/src/features/dashboard/components/DashboardRuntimeSurface.tsx`, `client/src/features/dashboard/components/DashboardAlarmRedLightIndicator.tsx`, `client/src/features/dashboard/components/DashboardAlarmToastNotice.tsx`, `client/src/features/dashboard/components/DashboardAlarmJournalPanel.tsx`, `client/src/features/user-hub/pages/DashboardPage.tsx`, `client/src/shared/api/alarmIncidents.ts`, `client/tests/integration/DashboardPage.test.tsx`, `client/tests/integration/DashboardAlarmRedLightPrimitives.test.tsx`, `client/tests/integration/helpers/mockDashboardRuntimeSocket.ts`, `client/tests/unit/alarmIncidentsContracts.test.ts`, and `client/tests/unit/useDashboardRuntimeSession.test.ts`.
- Boundary evidence inspected: `doc_cursed/alarms_plan.md`, `specs/011-alarms/slices/plan_cloud_alarm_incident_journal_slice.md`, `specs/011-alarms/slices/plan_client_alarm_journal_slice.md`, `cloud_server/src/api/routes.ts`, `cloud_server/src/api/alarm-incidents.controller.ts`, `cloud_server/src/services/alarm-incidents.service.ts`, `cloud_server/src/socket/events/alarm.ts`, `cloud_server/openapi.yaml`, and repository searches across `client`, `cloud_server`, and `edge_server`.
- Verified behavior: Client derives red-light only from known active-edge incident projections using `isActive || !isAcknowledged`; fully closed means `!isActive && isAcknowledged`; closed projections clear the badge/count when no known unclosed incidents remain; newly known unclosed incident ids create one local toast; closed-first projections and same-incident updates do not create duplicate toasts; toast dismissal is local UI state only; edge switch resets toast state; reconnect preserves known projections; stale realtime and ACK responses are guarded by active `edgeId` and generation checks.
- Verified boundaries: this red-light slice did not add a Cloud list endpoint, Cloud lifecycle mutation, Cloud ACK behavior, Edge alarm detection, Edge YAML parsing, telemetry-derived incident creation, Constructor authoring, widget-level blinking, filtering, pagination, analytics, or reports. The Cloud list endpoint was added later by the Alarm Incident List Slice. Cloud remains lifecycle/journal owner, Edge remains alarm diagnosis owner, and Client remains projection cache/display layer plus ACK initiator.
- Verification reviewed and rerun: `cmd /c npm run test -- DashboardPage` from `client` passed with 26 tests; `cmd /c npm run test -- useDashboardRuntimeSession` from `client` passed with 7 tests; `cmd /c npm run build` from `client` passed. Lean Testing boundary is preserved as one main Dashboard realtime proof plus one closed-first negative proof.
- Remaining risk: manual/runtime smoke is still `NOT RUN` and deferred to full Alarms MVP smoke because no live Cloud/Edge runtime was used. This is not a T026 blocker under the stated constraint, and no manual smoke item is counted as passed.

## Source Of Truth

- Alarm ownership, incident lifecycle, severity semantics, and red-light closure rule: `doc_cursed/alarms_plan.md`.
- Monitoring and operational journal context: `doc_cursed/monitoring_plan.md`.
- Slice planning rules: `doc/slices.md`.
- Existing Cloud incident and ACK context: `specs/011-alarms/slices/plan_cloud_alarm_incident_journal_slice.md`.
- Existing Client alarm journal context: `specs/011-alarms/slices/plan_client_alarm_journal_slice.md`.

## Review Trigger

Review this plan when the Cloud incident list endpoint is added, `alarm_incident_changed` projection changes, Dashboard runtime session ownership changes, a shared Client notification system is introduced, widget-level alarm indication enters MVP scope, or `doc_cursed/alarms_plan.md` changes.
