# Tasks: Alarm Incident List Slice

**Input**: `doc_cursed/alarms_plan.md`, `doc_cursed/monitoring_plan.md`, `doc_cursed/alarm_incident_journal_api_plan.md`, `doc/slices.md`, completed Cloud alarm incident journal slice, completed Client alarm journal slice, completed Client alarm red-light slice, completed Edge connectivity alarm slice, existing Cloud `AlarmIncident` model/service/ACK route, existing Dashboard runtime session and alarm projection parser.

**Prerequisites**: Existing Cloud `AlarmIncident` persistence, existing `projectAlarmIncident()` projection helper, existing Cloud `POST /api/edge-servers/:edgeId/alarm-incidents/:incidentId/ack`, existing `alarm_incident_changed` realtime projection, existing Client `apiClient` JSend unwrap behavior, existing Dashboard runtime alarm incident state, existing red-light/toast derivation from known unclosed projections.

**Tests**: Lean Testing Policy applies. Add compact proof for the Cloud list contract and one focused Client proof for initial load/convergence/enriched operational rows. Do not add broad table-driven malformed-query tests or lifecycle matrices.

**Organization**: Tasks are grouped as setup, foundational shared primitives, two independently testable user stories, and polish/review. This document intentionally does not include implementation batches.

## Purpose

This slice MUST add the shared Cloud alarm incident list contract and use it for the Dashboard operational alarm journal initial load.

The slice MUST close the current gap where the Dashboard can display only realtime-known incidents during the active session and loses Cloud-known unclosed incidents after reload.

## Scope

- MUST add `GET /api/edge-servers/:edgeId/alarm-incidents` in Cloud.
- MUST support `state=unclosed` and `state=all`.
- MUST support bounded pagination with `page`, `limit`, `total`, and `hasNextPage`.
- MUST support `sort=latest` and `order=desc|asc`.
- MUST document the endpoint in `cloud_server/openapi.yaml`.
- MUST reuse the existing `AlarmIncidentProjection` shape for list items.
- MUST add a Client API helper for incident listing through the existing `apiClient` JSend unwrap behavior.
- MUST load unclosed incidents when the Dashboard runtime starts for the selected `edgeId`.
- MUST converge REST initial load, realtime `alarm_incident_changed`, and ACK responses through the same Client incident replacement path.
- MUST replace the blocked initial-load state when the Cloud list endpoint succeeds.
- MUST show a bounded unavailable/error state when initial load fails.
- MUST enrich operational journal row display with operator-facing incident details.
- MUST preserve existing Dashboard red-light and toast behavior.

## Out Of Scope

- MUST NOT build the historical incident table UI in this slice.
- MUST NOT add broad historical filters, analytics, reports, exports, search, or alarm history UX.
- MUST NOT create a second current-incidents endpoint unless the shared endpoint proves insufficient during implementation review.
- MUST NOT change Edge alarm detection or Edge YAML alarm parsing.
- MUST NOT move ordinary telemetry alarm evaluation into Cloud.
- MUST NOT change Cloud ACK lifecycle mutation semantics.
- MUST NOT add Client-side alarm diagnosis from telemetry, widget labels, diagram content, geometry, Edge YAML, or socket history.
- MUST NOT implement widget-level blinking or target-widget highlighting.
- MUST NOT fake initial incident loading in Client storage.

## Constraints

- MUST treat `doc_cursed/alarms_plan.md` as the source of truth for alarm ownership, lifecycle flags, ACK independence, and severity semantics.
- MUST treat `doc_cursed/alarm_incident_journal_api_plan.md` as the source of truth for the shared list endpoint direction.
- MUST keep Edge as the diagnosis owner for ordinary `high`, `low`, and `state` telemetry alarms.
- MUST keep Cloud as the owner of alarm incident persistence, lifecycle flags, ACK, list contract, and realtime projection.
- MUST keep Client as a projection cache, display layer, and ACK initiator.
- MUST keep REST logic and WebSocket logic isolated in Cloud while sharing service-layer incident projection logic.
- MUST protect the list endpoint with USER auth and trusted Edge Server access.
- MUST keep list items, ACK responses, and realtime events on one `AlarmIncidentProjection` shape.
- MUST NOT add a TTL index or retention behavior to alarm incidents.
- MUST keep UI copy in English for consistency with the existing Dashboard alarm UI.
- MUST apply Lean Testing Policy: automated proof MUST cover the main happy path and at most one critical negative scenario for the main risk; tests MUST NOT expand into broad table-driven validation matrices for every malformed query, lifecycle combination, or UI edge case.
- MUST keep implementation tasks detailed even though proof tasks stay lean.

## Contract

```http
GET /api/edge-servers/:edgeId/alarm-incidents
```

Default query:

```text
state=unclosed&page=1&limit=50&sort=latest&order=desc
```

Response after Client JSend unwrap:

```json
{
  "incidents": [],
  "page": 1,
  "limit": 50,
  "total": 0,
  "hasNextPage": false
}
```

Each item in `incidents` MUST use the existing `AlarmIncidentProjection` shape.

## Query Rules

- `state=unclosed` MUST return only incidents where `isActive == true OR isAcknowledged == false`.
- `state=all` MUST return closed and unclosed incidents for future historical table reuse.
- The Client operational initial load MUST use `state=unclosed`.
- The default `limit` MUST be `50`.
- The maximum `limit` MUST be `100`.
- `limit > 100` SHOULD return `400 Bad Request` instead of silently clamping.
- Unsupported `state`, unsupported `sort`, unsupported `order`, `page < 1`, `limit < 1`, and non-integer `page` or `limit` SHOULD return `400 Bad Request`.
- `sort=latest` SHOULD use an operator-relevant latest row time:
  `max(updatedAt, acknowledgedAt, clearedAt, latestDetectedAt, activatedAt)`.
- `sort=latest` MAY use Cloud-side `updatedAt` sorting only if implementation proves that `updatedAt` changes on active, duplicate active/update, clear, and ACK.
- Cloud and Client MUST use consistent latest-row ordering semantics so initial load order and realtime-updated journal order do not visibly disagree.
- Cloud `sort=latest` MUST match the Client row-time helper semantics, or the Client helper MUST be updated in the same slice to match the Cloud semantics.
- Sorting MUST use a stable fallback by `_id` or `incidentId`.

## Runtime Flow

1. Dashboard opens with a selected `edgeId`.
2. Client starts the existing Dashboard runtime socket session.
3. Client calls the Cloud list endpoint with `state=unclosed`.
4. Cloud authorizes the USER against the selected Edge Server trust boundary.
5. Cloud queries `AlarmIncident` for incidents owned by `edgeId`.
6. Cloud applies the selected state filter, pagination, and latest ordering.
7. Cloud returns paginated `AlarmIncidentProjection` items.
8. Client stores returned incidents in selected-edge runtime session state through the shared replacement path.
9. Client applies a REST list response only when the runtime generation and selected `edgeId` are still current.
10. Client MUST NOT let an older in-flight REST list response replace a newer same-incident realtime or ACK projection.
11. Realtime `alarm_incident_changed` continues to upsert or replace incidents.
12. ACK responses continue to upsert or replace incidents only after Cloud confirmation.
13. Dashboard renders enriched operational journal rows and red-light state from known projections.

## Invariants

- `unclosed = isActive == true OR isAcknowledged == false`.
- `closed = isActive == false AND isAcknowledged == true`.
- ACK MUST NOT clear an active incident.
- Clear MUST NOT acknowledge an incident.
- Severity MUST remain rule importance and MUST NOT become lifecycle state.
- Fully closed incidents SHOULD NOT load into the operational journal by default.
- Fully closed incidents MAY remain visible during an active runtime session when they were already known through realtime or ACK projection updates.
- Client MUST NOT imply "no incidents" when initial load fails.
- Changing selected `edgeId` MUST clear or isolate previous-edge incident state, loading state, and errors.
- Existing red-light and toast behavior MUST remain derived from known unclosed projections.

## Assumptions

- `specs/011-alarms` remains the accepted planning bucket for alarm slices.
- `state=all` is included for Cloud contract proof and future historical table reuse only.
- The historical alarm incident table and broad filters will be planned as a separate monitoring/UI slice.
- Existing `AlarmIncidentProjection` fields are sufficient for the operational journal enrichment.
- The implementation can prefer derived latest-row sorting; `updatedAt` sorting is acceptable only with mutation proof.

## Acceptance Checks

- Cloud exposes `GET /api/edge-servers/:edgeId/alarm-incidents`.
- Endpoint requires USER auth and trusted access to the selected Edge Server.
- `state=unclosed` returns only incidents where `isActive || !isAcknowledged`.
- `state=all` returns closed and unclosed incidents.
- Endpoint returns `page`, `limit`, `total`, and `hasNextPage`.
- Endpoint returns existing `AlarmIncidentProjection` items.
- `limit` defaults to `50`, accepts up to `100`, and rejects `limit > 100` with `400 Bad Request`.
- Unsupported query values and invalid `page` or `limit` bounds return `400 Bad Request`.
- `sort=latest` ordering is consistent between the Cloud initial list and the Client realtime-updated journal order.
- OpenAPI documents the endpoint, query params, response shape, and relevant error responses.
- Dashboard loads unclosed incidents on selected-edge runtime start.
- Dashboard can load persisted incidents for an offline but trusted Edge Server.
- Dashboard reload no longer clears the operational journal when Cloud has unclosed incidents.
- REST initial load, realtime updates, and ACK responses converge through one Client incident replacement path.
- A stale in-flight REST list response does not overwrite a newer same-incident realtime or ACK projection.
- Changing selected `edgeId` clears or isolates old-edge incidents and loading/error state.
- Failed initial load shows a bounded unavailable/error state and does not claim no incidents.
- Fully closed incidents do not appear in the default operational journal load.
- Existing red-light and toast behavior remains derived from known unclosed projections.
- Journal rows show useful operator-facing details instead of only the incident label.

## Format: `[ID] [P?] [Story?] Description`

- `[P]` means the task can run in parallel because it touches different files and does not depend on incomplete tasks.
- `[US1]` maps to the Cloud alarm incident list contract story.
- `[US2]` maps to the Dashboard operational initial-load and enriched journal story.
- Every task includes the file path that owns the change or proof.
- This document intentionally does not include implementation batches.

## Phase 1: Setup

**Purpose**: Add stable list contract anchors and test fixture support before production behavior changes.

- [X] T001 Add Cloud alarm incident list query/response DTOs, allowed query vocabularies, pagination defaults, and max limit constants in `cloud_server/src/types/index.ts`
- [X] T002 [P] Add Client alarm incident list DTOs and a `listAlarmIncidents(edgeId, query?)` helper that calls `apiClient.get` and expects unwrapped `{ incidents, page, limit, total, hasNextPage }` data in `client/src/shared/api/alarmIncidents.ts`
- [X] T003 [P] Extend alarm incident test fixtures with active unacknowledged, active acknowledged, cleared unacknowledged, and closed projection fixture helpers in `client/tests/integration/helpers/mockDashboardRuntimeSocket.ts`
- [X] T004 [P] Add compact Cloud integration helper utilities for seeding `AlarmIncident` records and reading projected list responses in `cloud_server/tests/integration/edge-socket.helpers.ts`

**Checkpoint**: Cloud and Client have explicit list contract anchors and test helpers without changing runtime behavior.

---

## Phase 2: Foundational List And Display Primitives

**Purpose**: Build shared validation, sorting, projection, load-state, and display helpers that block both user stories.

- [X] T005 Add query parsing and validation helpers for `state`, `page`, `limit`, `sort`, and `order`, including `400`-mapped errors for unsupported values and invalid bounds, in `cloud_server/src/services/alarm-incidents.service.ts`
- [X] T006 Add `getAlarmIncidentLatestRowTimeMs()` or equivalent Cloud helper for `max(updatedAt, acknowledgedAt, clearedAt, latestDetectedAt, activatedAt)` with Date/string/number normalization to comparable milliseconds and stable `_id` fallback support in `cloud_server/src/services/alarm-incidents.service.ts`
- [X] T007 Add `listTrustedAlarmIncidents` service input and access validation that checks `edgeId`, Edge Server existence, and `trustedUsers` membership without requiring an active Edge runtime connection in `cloud_server/src/services/alarm-incidents.service.ts`
- [X] T008 Add reusable list query construction for `state=unclosed` and `state=all`, preserving the existing `AlarmIncidentProjection` mapper in `cloud_server/src/services/alarm-incidents.service.ts`
- [X] T009 Add Client alarm incident initial-load status and error state types, replacing the hardcoded missing-endpoint-only marker with success/error-capable load state in `client/src/features/dashboard/model/types.ts`
- [X] T010 [P] Add Client operator display helpers for equipment identity, condition summary, activated/cleared/acknowledged/computed-closed timestamps, and Cloud-consistent latest row time ordering in `client/src/features/dashboard/model/alarmIncidents.ts`

**Checkpoint**: Query rules and Client state/display primitives are ready before endpoints, runtime loading, and UI rendering are wired.

---

## Phase 3: User Story 1 - List Cloud Alarm Incidents (Priority: P1) MVP

**Goal**: A trusted USER can request a paginated list of Cloud-owned alarm incident projections for a selected Edge Server, with default operational filtering for unclosed incidents and `state=all` available for future history reuse.

**Independent Test**: Seed active unacknowledged, active acknowledged, cleared unacknowledged, and closed incidents for a trusted Edge. Call the real HTTP route with default query, `state=all`, pagination, and `limit > 100`; assert auth/trust boundary, projection shape, `unclosed` filtering, pagination metadata, and `400` for the bound violation.

### Tests For User Story 1

- [X] T011 [US1] Add focused Cloud integration proof for USER auth, trusted Edge access, default `state=unclosed`, `state=all`, pagination metadata, projection reuse, stable latest ordering, offline Edge access, and `limit > 100` returning `400`, without adding a broad malformed-query matrix, in `cloud_server/tests/integration/alarm-incidents.test.ts`
- [X] T012 [US1] Add the critical negative proof that a fully closed seeded incident is excluded from the default `state=unclosed` response while returned by `state=all` in `cloud_server/tests/integration/alarm-incidents.test.ts`

### Implementation For User Story 1

- [X] T013 [US1] Implement paginated `listTrustedAlarmIncidents` service behavior with state filtering, total count, `hasNextPage`, latest ordering, stable fallback, and `AlarmIncidentProjection` mapping in `cloud_server/src/services/alarm-incidents.service.ts`
- [X] T014 [US1] Add `AlarmIncidentsController.listIncidents` with request parsing, service delegation, JSend success response, and existing error middleware mapping in `cloud_server/src/api/alarm-incidents.controller.ts`
- [X] T015 [US1] Register `GET /api/edge-servers/:edgeId/alarm-incidents` with `authMiddleware`, `requireRole('USER')`, and `AlarmIncidentsController.listIncidents` before the `:incidentId/ack` route in `cloud_server/src/api/routes.ts`
- [X] T016 [US1] Ensure the list route rejects untrusted users, invalid `edgeId`, missing Edge Server, unsupported query values, invalid page/limit bounds, and `limit > 100` without leaking incident data in `cloud_server/src/services/alarm-incidents.service.ts`
- [X] T017 [US1] Update `cloud_server/openapi.yaml` with the list path, query parameters, `AlarmIncidentListResponse` schema, reused `AlarmIncidentProjection`, auth requirements, and `400`, `401`, `403`, and `404` responses

**Checkpoint**: Cloud exposes the shared alarm incident list endpoint without changing incident lifecycle, ACK, Edge alarm detection, or Client UI.

---

## Phase 4: User Story 2 - Load Dashboard Operational Incidents (Priority: P1) MVP

**Goal**: Dashboard runtime initial load fetches unclosed incidents for the selected `edgeId`, merges them with realtime and ACK projections through one replacement path, and renders operator-facing journal rows without implying "no incidents" on load failure.

**Independent Test**: Start a Dashboard runtime session for a selected Edge, mock the list endpoint to return one unclosed incident, verify the row appears without a realtime event, then deliver realtime/ACK projections and assert convergence. Also verify load failure shows bounded unavailable state and a stale list response cannot overwrite a newer projection.

### Tests For User Story 2

- [X] T018 [US2] Add focused runtime hook proof for initial `state=unclosed` load, selected-edge scoping, successful load state, failed load state, edge switch reset, and stale in-flight list response rejection in `client/tests/unit/useDashboardRuntimeSession.test.ts`
- [X] T019 [P] [US2] Add compact Client API contract proof that `listAlarmIncidents()` builds the list URL/query, uses `apiClient.get`, and expects unwrapped Cloud list data in `client/tests/unit/alarmIncidentsContracts.test.ts`
- [X] T020 [US2] Add focused Dashboard integration proof that reload initial load renders an unclosed row without waiting for realtime, realtime and ACK updates converge on the same row, and the enriched row shows equipment identity, condition summary, lifecycle, severity, and timestamps in `client/tests/integration/DashboardPage.test.tsx`
- [X] T021 [US2] Add the critical negative Client proof that a failed initial list request shows a bounded unavailable/error state and does not render or announce a "no incidents" success state in `client/tests/integration/DashboardPage.test.tsx`

### Implementation For User Story 2

- [X] T022 [US2] Wire `listAlarmIncidents(edgeId, { state: 'unclosed', page: 1, limit: 50, sort: 'latest', order: 'desc' })` into `useDashboardRuntimeSession` startup after session generation is established in `client/src/features/dashboard/hooks/useDashboardRuntimeSession.ts`
- [X] T023 [US2] Apply successful REST list results through shared merge/upsert behavior that adds or updates returned incidents while preserving existing newer same-incident realtime/ACK projections and extra active-session projections not present in the `state=unclosed` response in `client/src/features/dashboard/hooks/useDashboardRuntimeSession.ts`
- [X] T024 [US2] Add current-generation, selected-edge, and in-flight request guards so stale list responses cannot update the active journal, pending maps, load state, red-light, or toast state in `client/src/features/dashboard/hooks/useDashboardRuntimeSession.ts`
- [X] T025 [US2] Replace `alarmJournalInitialLoadBlocked` with success/error-capable operational list load state while keeping idle and disabled runtime behavior intact in `client/src/features/dashboard/hooks/useDashboardRuntimeSession.ts`
- [X] T026 [US2] Update `DashboardAlarmJournalPanel` to render loaded-empty, loading, and bounded unavailable/error states without claiming no incidents when the list request fails in `client/src/features/dashboard/components/DashboardAlarmJournalPanel.tsx`
- [X] T027 [US2] Enrich `DashboardAlarmJournalPanel` rows with rule title, `device / metric` identity, condition summary, severity, lifecycle status, activated time, cleared time, acknowledged time, computed closed time, and secondary diagnostics/details in `client/src/features/dashboard/components/DashboardAlarmJournalPanel.tsx`
- [X] T028 [US2] Ensure `DashboardRuntimeSurface` passes the new alarm list load state to the journal and keeps red-light/toast derivation based only on known unclosed projections in `client/src/features/dashboard/components/DashboardRuntimeSurface.tsx`
- [X] T029 [US2] Update `DashboardPage` wiring for the new runtime session load state props without changing telemetry, command, catalog, visual surface, or diagnostics behavior in `client/src/features/user-hub/pages/DashboardPage.tsx`
- [X] T030 [US2] Ensure Client list helper, ACK response handling, and realtime handling all import only Client/shared types and no Cloud server code in `client/src/shared/api/alarmIncidents.ts`

**Checkpoint**: Dashboard reload restores Cloud-known unclosed incidents and keeps realtime, ACK, red-light, and toast behavior projection-driven.

---

## Phase 5: Contract Alignment, Verification, And Review

**Purpose**: Verify the cross-module slice, preserve boundaries, and keep proof lean.

- [X] T031 Inspect `cloud_server/src/models/AlarmIncident.ts` and `cloud_server/src/services/alarm-incidents.service.ts` to verify no TTL index or retention behavior was added and ACK/clear lifecycle mutation semantics remain unchanged
- [X] T032 Inspect `cloud_server/src/socket/events/alarm.ts` and `cloud_server/src/socket/events/edge.ts` to verify realtime `alarm_incident_changed`, trusted Edge `alarm_event`, and connectivity alarm flows remain unchanged by the list endpoint
- [X] T033 Inspect `client/src/features/dashboard/hooks/useDashboardRuntimeSession.ts` and `client/src/features/dashboard/model/alarmIncidents.ts` to verify list, realtime, and ACK projections share one replacement path and latest-row ordering semantics are consistent
- [X] T034 Inspect `client/src/features/dashboard/components/DashboardAlarmJournalPanel.tsx`, `DashboardRuntimeSurface.tsx`, and `DashboardAlarmToastNotice.tsx` to verify display enrichment did not add telemetry-derived diagnosis, widget blinking, historical table UI, broad filters, or fake local loading
- [X] T035 Inspect `cloud_server/tests/integration/alarm-incidents.test.ts`, `client/tests/unit/useDashboardRuntimeSession.test.ts`, `client/tests/unit/alarmIncidentsContracts.test.ts`, and `client/tests/integration/DashboardPage.test.tsx` to remove broad malformed-query, lifecycle, or UI matrix tests that exceed Lean Testing Policy
- [X] T036 Run focused Cloud alarm incident tests with `cmd /c npm run test -- tests/integration/alarm-incidents.test.ts` from `cloud_server`
- [X] T037 Run Cloud typecheck with `cmd /c npm run typecheck` from `cloud_server`
- [X] T038 Run OpenAPI lint with `cmd /c npx @redocly/cli lint openapi.yaml` from `cloud_server`
- [X] T039 Run focused Client runtime hook tests with `cmd /c npm run test -- useDashboardRuntimeSession` from `client`
- [X] T040 Run focused Client alarm incident contract tests with `cmd /c npm run test -- alarmIncidentsContracts` from `client`
- [X] T041 Run focused Dashboard page integration tests with `cmd /c npm run test -- DashboardPage` from `client`
- [X] T042 Run Client build with `cmd /c npm run build` from `client`
- [X] T043 Add manual/runtime smoke notes for live Dashboard reload, unclosed incident restoration, failed initial load, ACK after reload, realtime convergence, closed exclusion, red-light/toast preservation, and Edge switch reset in `specs/011-alarms/slices/plan_alarm_incident_list_slice.md`
- [X] T044 Add automated/code proof notes for Cloud list contract, auth/trust boundary, pagination bounds, projection reuse, Client list helper, stale list response guard, enriched row display, and Lean Testing boundaries in `specs/011-alarms/slices/plan_alarm_incident_list_slice.md`
- [X] T045 Complete Technical Lead Review for Cloud/Edge/Client boundaries, `doc_cursed` alignment, list query validation, latest ordering, stale state, contract drift, acceptance coverage, and Lean Testing Policy in `specs/011-alarms/slices/plan_alarm_incident_list_slice.md`

---

## Dependencies And Execution Order

### Phase Dependencies

- Phase 1 establishes contract types and test helpers.
- Phase 2 depends on Phase 1 constants/types and blocks both user stories.
- Phase 3 depends on Cloud query validation and projection helpers from Phase 2.
- Phase 4 depends on the Client list helper from Phase 1 and Client state/display helpers from Phase 2; it passes only after the Cloud route contract from Phase 3 is available or mocked in Client tests.
- Phase 5 depends on Phases 3 and 4 implementation and proof.

### Task Dependencies

- T005 depends on T001.
- T006 depends on existing `AlarmIncident` timestamps and T001 query constants.
- T007 and T008 depend on T005.
- T009 depends on the existing `DashboardAlarmJournalInitialLoadBlockedMarker` and replaces its role.
- T010 depends on existing Client projection types and must align with T006.
- T011 and T012 depend on T004 and pass only after T013-T017.
- T013 depends on T005-T008.
- T014 depends on T013.
- T015 depends on T014.
- T016 depends on T005 and T007.
- T017 depends on the final response mapping from T014-T016.
- T018 depends on T002, T009, T010, and passes only after T022-T025.
- T019 depends on T002 and passes once `listAlarmIncidents()` is implemented.
- T020 and T021 depend on T003, T009, T010, and pass only after T022-T029.
- T022 depends on T002 and the existing runtime session startup path.
- T023 depends on T010, T022, and existing `upsertDashboardAlarmIncident`.
- T024 depends on T022 and T023.
- T025 depends on T009 and T024.
- T026 depends on T025.
- T027 depends on T010.
- T028 depends on T025-T027.
- T029 depends on T028.
- T030 depends on T002 and existing ACK helper behavior.
- T031-T045 depend on implementation completion.

## Parallel Opportunities

- T002, T003, and T004 can run in parallel with T001 because they touch separate Client and test helper files.
- T006 and T010 can run in parallel if the implementers coordinate on the latest-row time formula.
- T011/T012 can be drafted while T013-T017 are implemented, using the agreed contract.
- T018 can be drafted in parallel with T022-T025 against mocked list helper behavior.
- T019 can run in parallel with runtime/UI tests because it touches the API contract test file only.
- T020/T021 can be drafted in parallel with T026-T029 against stable UI test anchors.
- T031-T035 can run in parallel with verification commands after implementation is complete.

T013-T016 SHOULD be sequenced by one owner because they all modify `cloud_server/src/services/alarm-incidents.service.ts` and route behavior.
T022-T025 SHOULD be sequenced by one owner because they all modify `client/src/features/dashboard/hooks/useDashboardRuntimeSession.ts`.
T026-T028 SHOULD be sequenced or tightly coordinated because they change related Dashboard UI props and rendering.

## Parallel Example: Cloud Contract

```text
Task: "Add focused Cloud integration proof for USER auth, trusted Edge access, default `state=unclosed`, `state=all`, pagination metadata, projection reuse, stable latest ordering, offline Edge access, and `limit > 100` returning `400` in `cloud_server/tests/integration/alarm-incidents.test.ts`"
Task: "Implement paginated `listTrustedAlarmIncidents` service behavior with state filtering, total count, `hasNextPage`, latest ordering, stable fallback, and `AlarmIncidentProjection` mapping in `cloud_server/src/services/alarm-incidents.service.ts`"
```

## Parallel Example: Client Runtime

```text
Task: "Add focused runtime hook proof for initial `state=unclosed` load, selected-edge scoping, successful load state, failed load state, edge switch reset, and stale in-flight list response rejection in `client/tests/unit/useDashboardRuntimeSession.test.ts`"
Task: "Update `DashboardAlarmJournalPanel` to render loaded-empty, loading, and bounded unavailable/error states without claiming no incidents when the list request fails in `client/src/features/dashboard/components/DashboardAlarmJournalPanel.tsx`"
```

## Implementation Strategy

### MVP First

1. Complete Phase 1 to anchor Cloud/Client list contract types and fixtures.
2. Complete Phase 2 to make validation, latest ordering, trusted access, load state, and display helpers explicit.
3. Complete Phase 3 so the Cloud endpoint is real, protected, documented, and proven.
4. Complete Phase 4 so Dashboard initial load uses the endpoint and converges with realtime/ACK projections.
5. Complete Phase 5 verification and Technical Lead Review.

### Boundary Bias

- Keep Cloud query/list behavior in `alarm-incidents.service.ts`; keep controller and routes thin.
- Reuse `projectAlarmIncident()` and do not create a second incident projection for list rows.
- Keep Client list loading in `useDashboardRuntimeSession` because incident state is selected-edge runtime state.
- Keep display enrichment in Dashboard model/UI helpers, not in Cloud projection or Edge logic.
- Do not add historical UI, filters, search, reports, or local fake loading.
- Keep realtime and ACK convergence behavior more important than preserving raw REST response order when a newer projection has already arrived.

## Manual And Runtime Smoke

Manual smoke SHOULD use a live Cloud server, a trusted Edge runtime or seeded Cloud incident records, and a browser Dashboard session.

### Manual/Runtime Smoke Notes

- Status on 2026-05-11 quickcheck: live manual browser/runtime smoke was not run, so this slice does not claim manual smoke passed.
- Runtime evidence was collected from automated runtime and integration coverage instead: `client/tests/integration/DashboardPage.test.tsx` passed and covers Dashboard initial load query, row restoration without a realtime event, realtime replacement convergence, ACK after restoration through the Cloud ACK response path, bounded failed-list state, and red-light preservation for known unclosed incidents.
- The automated Dashboard runtime proof verifies the initial list request uses `state=unclosed&page=1&limit=50&sort=latest&order=desc` for the selected `edgeId`.
- The automated Dashboard UI proof verifies an unclosed incident row appears after REST initial load and displays rule title, `device / metric`, condition summary, severity, lifecycle status, latest row time, activated timestamp, latest detected/sample details, and ACK state.
- The automated runtime hook proof in `client/tests/unit/useDashboardRuntimeSession.test.ts` verifies edge switch isolation: old-edge incidents and a late old-edge list response do not replace the active selected-edge journal state.
- The automated Cloud proof in `cloud_server/tests/integration/alarm-incidents.test.ts` verifies fully closed incidents are excluded from default `state=unclosed` and included by `state=all`.
- Failed initial load evidence comes from `client/tests/integration/DashboardPage.test.tsx` and `client/tests/unit/useDashboardRuntimeSession.test.ts`: the journal shows a bounded unavailable state and does not render a loaded-empty/no-incidents success state.
- Red-light/toast preservation evidence comes from `client/tests/integration/DashboardPage.test.tsx` and `client/tests/unit/alarmIncidentsContracts.test.ts`: red-light and newest-unclosed selection remain derived from known unclosed projections (`isActive || !isAcknowledged`), not telemetry diagnosis.

1. Create or seed one active unacknowledged incident for the selected `edgeId`.
2. Open Dashboard for the selected `diagramId + edgeId`.
3. Confirm Dashboard calls `GET /api/edge-servers/:edgeId/alarm-incidents` with `state=unclosed`, `page=1`, `limit=50`, `sort=latest`, and `order=desc`.
4. Confirm the incident row appears without waiting for a new realtime event.
5. Confirm the row shows rule title, `device / metric`, condition summary, severity, lifecycle status, activated time, and available clear/ACK/closed timestamps.
6. ACK the incident and confirm the row changes only after Cloud ACK response or realtime projection.
7. Emit or persist a clear/closed projection and confirm red-light count and toast behavior remain derived from known unclosed projections.
8. Reload Dashboard and confirm Cloud-known unclosed incidents reappear.
9. Seed a fully closed incident and confirm it is not returned by the default operational load.
10. Force the list endpoint to fail and confirm the journal shows a bounded unavailable/error state that does not claim no incidents.
11. Switch selected `edgeId` and confirm old-edge incidents, load state, and errors do not leak.

Do not count smoke as successful if Client derives alarms from telemetry, reads Edge YAML, fakes initial incidents, requires Edge to be online to list persisted incidents, marks ACK success before Cloud confirmation, or builds historical table/filtering UI.

## Automated And Code Proof Notes

Recorded on 2026-05-11 quickcheck.

- `cmd /c npm run test -- tests/integration/alarm-incidents.test.ts` from `cloud_server`: PASS, 1 test file passed, 3 tests passed. Covered Cloud persisted incident lifecycle, ACK mutation behavior, USER auth/trust boundary, default `state=unclosed`, `state=all`, pagination metadata, projection reuse via `projectAlarmIncident()`, stable latest ordering, offline persisted list access, `limit=101` returning 400, and OpenAPI path/schema presence.
- `cmd /c npm run test -- useDashboardRuntimeSession` from `client`: PASS, 1 test file passed, 10 tests passed. Covered selected-edge initial list load, success/error load state, edge switch reset/isolation, stale in-flight REST list rejection, realtime/list merge behavior, and ACK stale response guards.
- `cmd /c npm run test -- alarmIncidentsContracts` from `client`: PASS, 1 test file passed, 5 tests passed. Covered `listAlarmIncidents()` URL/query construction through `apiClient.get`, ACK helper separation, display helper derivation, projection replacement ordering, red-light derivation, and avoiding telemetry/local seed diagnosis.
- `cmd /c npm run test -- DashboardPage` from `client`: PASS, 1 test file passed, 28 tests passed. Covered Dashboard reload-style REST restoration, enriched operational journal row display, realtime convergence on the same row, ACK after restored row, failed initial list unavailable state, and existing red-light/toast runtime behavior.
- `cmd /c npx @redocly/cli lint openapi.yaml` from `cloud_server`: PASS, OpenAPI description valid with the existing `servers[0].url` localhost warning from the recommended Redocly rule.
- Cloud code evidence: `cloud_server/src/api/routes.ts` registers `GET /api/edge-servers/:edgeId/alarm-incidents` with `authMiddleware` and `requireRole('USER')` before the ACK route; `cloud_server/src/api/alarm-incidents.controller.ts` returns JSend success data through `listTrustedAlarmIncidents()`.
- Cloud service evidence: `cloud_server/src/services/alarm-incidents.service.ts` validates `state`, `page`, `limit`, `sort`, and `order`, rejects `limit > 100`, filters `state=unclosed` as `{ isActive: true } OR { isAcknowledged: false }`, checks `EdgeServer.trustedUsers`, does not require an active Edge socket, sorts by `max(updatedAt, acknowledgedAt, clearedAt, latestDetectedAt, activatedAt)`, falls back by `_id`, and maps items with `projectAlarmIncident()`.
- OpenAPI evidence: `cloud_server/openapi.yaml` documents the list path, query parameters, USER bearer auth, `AlarmIncidentListResponse`, reused `AlarmIncidentProjection`, and `400`, `401`, `403`, and `404` responses.
- Client API/runtime evidence: `client/src/shared/api/alarmIncidents.ts` builds the list URL through the existing `apiClient.get` JSend unwrap behavior; `client/src/features/dashboard/hooks/useDashboardRuntimeSession.ts` starts the selected-edge unclosed list load, applies current-generation/list-request guards, rejects stale selected-edge responses, preserves newer realtime/ACK projections, and converges REST/realtime/ACK through the same replacement helpers.
- Client display evidence: `client/src/features/dashboard/model/alarmIncidents.ts` uses the same latest-row formula as Cloud and derives operator display details; `client/src/features/dashboard/components/DashboardAlarmJournalPanel.tsx` renders loading, loaded-empty, bounded error, enriched row, lifecycle timestamps, and ACK controls without adding historical filters or telemetry diagnosis.
- Lean Testing evidence: focused tests cover the main happy paths and critical negative risks (`limit > 100`, closed exclusion, failed load, stale response) without adding broad malformed-query, lifecycle, or UI matrix coverage.

## Technical Lead Review

Review this plan and implementation for Cloud/Edge/Client boundaries, `doc_cursed` alignment, shared projection reuse, list query validation, latest ordering consistency, stale REST response handling, ACK lifecycle preservation, red-light/toast preservation, OpenAPI coverage, and Lean Testing discipline.

### Technical Lead Review Notes

Completed on 2026-05-11 from implemented files and validation outcomes above.

- Boundaries: Edge socket event handling remains the source of ordinary alarm diagnosis; Cloud owns persistence, list, ACK lifecycle, and realtime projection; Client owns projection caching, display, and ACK initiation. No imports cross Client into Cloud server code.
- `doc_cursed` alignment: `doc_cursed/alarms_plan.md` keeps Edge diagnosis, Cloud journal/ACK ownership, separate `isActive` and `isAcknowledged`, ACK-only acknowledgement mutation, and severity-as-rule-importance semantics. `doc_cursed/alarm_incident_journal_api_plan.md` calls for one Cloud-owned paginated endpoint with `state=unclosed|all`, default operational load, shared projection convergence, and no historical table in this slice.
- Query validation: `parseAlarmIncidentListQuery()` rejects unsupported `state`, `sort`, and `order`; rejects non-integer or less-than-1 `page`/`limit`; defaults to `state=unclosed&page=1&limit=50&sort=latest&order=desc`; and rejects `limit > 100`.
- Latest ordering: Cloud `getAlarmIncidentLatestRowTimeMs()` and Client `getDashboardAlarmIncidentRowTimeMs()` both use `max(updatedAt, acknowledgedAt, clearedAt, latestDetectedAt, activatedAt)`. Cloud falls back by `_id`; Client falls back by `incidentId`, which is the projected `_id`.
- Stale state: `useDashboardRuntimeSession()` checks runtime generation, list request id, and selected `activeEdgeId`; list merge applies only projections whose latest row time is not older than the known same-incident projection.
- Contract drift: OpenAPI lint passed; the Cloud integration test reads `openapi.yaml` and asserts the list operation, parameters, response schema, and error responses.
- Acceptance coverage: the code and tests cover USER auth, trusted access, offline persisted list access, default unclosed filtering, `state=all`, pagination metadata, projection reuse, bounded errors, stale response rejection, row enrichment, ACK confirmation after REST restoration, red-light/toast derivation, and no default fully closed load.
- Lean Testing: proof remains intentionally narrow and risk-focused; no broad malformed-query matrix, lifecycle matrix, historical table UI, filters, analytics, reports, exports, search, widget blinking, or Client-side telemetry diagnosis were added.

### Review Checklist

- [X] Verify scope did not expand into Edge alarm detection, Edge YAML parsing, Cloud ordinary alarm evaluation, Client diagnosis, widget blinking, historical table UI, broad filters, analytics, reports, exports, or search.
- [X] Verify `doc_cursed/alarms_plan.md` and `doc_cursed/alarm_incident_journal_api_plan.md` remain the source of truth for ownership, lifecycle, and list contract direction.
- [X] Verify the Cloud list endpoint requires USER auth and trusted Edge Server membership.
- [X] Verify the Cloud list endpoint does not require an active Edge runtime connection.
- [X] Verify `state=unclosed` maps exactly to `isActive || !isAcknowledged`.
- [X] Verify `state=all` returns closed and unclosed incidents without adding historical UI.
- [X] Verify `page`, `limit`, `total`, and `hasNextPage` are returned correctly.
- [X] Verify `limit` defaults to `50`, maxes at `100`, and rejects `limit > 100`.
- [X] Verify unsupported query values and invalid numeric bounds return `400`.
- [X] Verify list items use the same `AlarmIncidentProjection` as ACK and realtime.
- [X] Verify `sort=latest` ordering is consistent between Cloud initial load and Client row ordering.
- [X] Verify stale in-flight REST list responses cannot overwrite newer same-incident realtime or ACK projections.
- [X] Verify Client initial load uses `state=unclosed` and does not fake incidents from local storage, telemetry, widget labels, diagram content, Edge YAML, or socket history.
- [X] Verify failed initial load does not imply zero Cloud incidents.
- [X] Verify fully closed incidents are not fetched by default but may remain visible when already known through realtime/ACK during the active session.
- [X] Verify ACK still mutates only acknowledgement fields and does not clear active incidents.
- [X] Verify red-light and toast behavior remain derived from known unclosed projections.
- [X] Verify automated proof remains lean and does not add broad query/lifecycle/UI matrices.
- [X] Verify verification commands and manual smoke notes are recorded after implementation.

## Source Of Truth

- Alarm ownership and lifecycle semantics: `doc_cursed/alarms_plan.md`.
- Monitoring and operational journal context: `doc_cursed/monitoring_plan.md`.
- Shared incident list decision: `doc_cursed/alarm_incident_journal_api_plan.md`.
- Existing Cloud incident context: `specs/011-alarms/slices/plan_cloud_alarm_incident_journal_slice.md`.
- Existing Client alarm journal context: `specs/011-alarms/slices/plan_client_alarm_journal_slice.md`.
- Existing Client red-light context: `specs/011-alarms/slices/plan_client_alarm_red_light_slice.md`.
- Existing connectivity incident context: `specs/011-alarms/slices/plan_edge_connectivity_alarm_slice.md`.

## Review Trigger

Review this plan when the alarm incident projection changes, the ACK route changes, Dashboard runtime session ownership changes, historical alarm incident table work enters scope, the list endpoint query shape changes, latest-row ordering semantics change, or `doc_cursed/alarms_plan.md` / `doc_cursed/alarm_incident_journal_api_plan.md` changes.
