# Dispatch Trends Slice Plan

## Document Scope

This document plans the Dispatch Trends slice for `specs/012-dispatch`.

The primary reader is an implementation agent or reviewer preparing Cloud and Client work for `/hub/dispatch/trends`.

## Purpose

This slice MUST replace the `/hub/dispatch/trends` placeholder with a historical telemetry trends surface for one selected Edge Server.

The slice MUST add the Cloud historical telemetry aggregation endpoint and MUST render one aggregated response as both a chart and a table in the Client.

## Source Of Truth

- Dispatch route and subtab model: `doc_cursed/monitoring_workspace_routing_draft.md`.
- Monitoring storage and history API direction: `doc_cursed/monitoring_plan.md`.
- Dispatch shared context ownership: `doc_cursed/dispatch_onboarding_slice_draft.md`.
- Existing Dispatch shell baseline: `specs/012-dispatch/slices/plan_dispatch_workspace_shell_onboarding_slice.md`.
- Cloud and Client endpoint proof pattern: `specs/011-alarms/slices/plan_alarm_incident_list_slice.md`.

## Scope

- MUST add Cloud endpoint `GET /api/telemetry/historic`.
- MUST support query parameters `edgeId`, `deviceId`, `metric`, `date_start`, `date_end`, and `maxPoints`.
- MUST default `maxPoints` to `300`.
- MUST reject `maxPoints > 1000`.
- MUST validate that the requested time range is inside the 7-day telemetry retention window.
- MUST validate that `date_start < date_end`.
- MUST aggregate existing numeric telemetry rollup documents from the `Telemetry` time-series collection.
- MUST use a narrow MongoDB aggregation match by selected Edge, device, metric, numeric rollup kind, and time range before bucketing.
- MUST sort matched rollup documents by `timestamp` before bucketing when the aggregation uses `$last`.
- SHOULD use `$bucketAuto` with `buckets = maxPoints` for MVP aggregation.
- MUST compute `timeStart`, `timeEnd`, `pointTime`, `min`, `max`, `avg`, `last`, and `count` for each returned point.
- MUST compute bucket `count` as the sum of source `rollup.count` values.
- MUST compute bucket `avg` as weighted average: `sum(rollup.sum) / sum(rollup.count)`.
- MUST compute bucket `last` from the latest source rollup by `timestamp`.
- MUST sort returned points by `timeStart`.
- MUST document the endpoint in `cloud_server/openapi.yaml`.
- MUST add a Client telemetry history API helper through the existing `apiClient` JSend unwrap behavior.
- MUST replace only the Trends placeholder under `/hub/dispatch/trends`.
- MUST let the dispatcher select a numeric telemetry metric available for the selected Edge and choose a time range.
- MUST render one line chart from `avg` or `last`.
- MUST render an aggregate table with `timeStart`, `timeEnd`, `min`, `max`, `avg`, `last`, and `count`.
- MUST show loading, empty, validation, and bounded error states.

## Out Of Scope

- MUST NOT change Edge runtime behavior.
- MUST NOT change Edge YAML contracts.
- MUST NOT start Dashboard runtime socket sessions from Trends.
- MUST NOT implement Live Telemetry 60-second tables.
- MUST NOT implement Command Audit tables or APIs.
- MUST NOT expand Alarm Journal work.
- MUST NOT implement alarm lifecycle or command lifecycle changes.
- MUST NOT implement multi-edge analytics or cross-edge charts.
- MUST NOT implement complex multi-series charts.
- MUST NOT implement exports, reports, zoom, brush, permanent archive, or advanced analytics.
- MUST NOT implement a downsampling engine.
- MUST NOT return raw arbitrary telemetry history outside short operational windows.
- MUST NOT add Constructor changes.

## Assumptions

- The existing Dispatch shell and shared context remain the entry point for `/hub/dispatch/trends`.
- The Cloud history endpoint is missing and MUST be added in this slice.
- The existing `Telemetry` model stores 1-second rollups in a native MongoDB time-series collection with `timestamp` as time field, `metadata` as meta field, seconds granularity, and 7-day TTL.
- MVP Trends restricts chart and table data to numeric telemetry rollups.
- Boolean telemetry rollups are out of scope for chart and aggregate table rendering in this slice.
- Client metric choices SHOULD come from the selected Edge capabilities catalog.
- Catalog telemetry entries with `valueType: "number"` are selectable for MVP Trends.
- Catalog telemetry entries with missing or non-number `valueType` SHOULD NOT be treated as numeric automatically.
- Cloud SHOULD return `pointTime` as the midpoint between `timeStart` and `timeEnd`.
- Client MAY compute a defensive midpoint from `timeStart` and `timeEnd` only when a response point lacks `pointTime`.
- Recharts is the preferred chart implementation if adding one Client dependency is accepted.
- The MVP Recharts chart SHOULD use one single-series `LineChart` with `ResponsiveContainer`, `XAxis`, `YAxis`, `Tooltip`, and one `Line` for the active `avg` or `last` value mode.
- If Recharts installation is rejected or unavailable, Client MUST fall back to a small local SVG line chart with reduced interactions.

## Constraints

- MUST keep Cloud as the owner of historical telemetry aggregation.
- MUST keep Client as the display and request layer for Trends.
- MUST NOT let Client aggregate arbitrary raw telemetry history locally.
- MUST make the chart and table represent the same aggregated response.
- MUST enforce the 7-day retention window in API validation, not only through MongoDB TTL cleanup.
- MUST scope every history query to one selected `edgeId`.
- MUST protect the endpoint with USER auth and trusted Edge Server access.
- MUST keep REST history logic separate from Socket.IO realtime telemetry routing.
- MUST NOT modify telemetry ingestion, rollup creation, or realtime broadcast semantics.
- MUST NOT introduce `window.*` or `global.*` application state.
- MUST load or reuse selected Edge catalog for Trends through `getEdgeServerCatalog(edgeId)` or shared non-runtime catalog loading.
- MUST NOT enable Dashboard runtime context only to load Trends metric choices.
- MUST clear or ignore stale Client responses when selected Edge, device, metric, time range, or `maxPoints` changes.
- MUST keep `/hub/dispatch/trends` under the existing `/hub` auth guard.
- MUST apply Lean Testing Policy: automated proof MUST cover the main happy path and at most one critical negative scenario for the main slice risk.
- MUST NOT add broad table-driven validation matrices for every malformed query, visual variant, or catalog combination.
- MUST keep implementation tasks concrete and tied to file paths when this document is converted into a task plan.

## Runtime Flow

1. A USER opens `/hub/dispatch/trends`.
2. The existing User Hub auth guard protects the route.
3. Dispatch shell provides selected `diagramId`, selected `edgeId`, selected Edge, and shared context status.
4. Trends loads or reuses the selected Edge capabilities catalog without starting a Dashboard runtime socket session.
5. Trends derives numeric metric choices from the selected Edge catalog.
6. The dispatcher selects `deviceId`, `metric`, time range, and chart value mode `avg` or `last`.
7. Client calls `GET /api/telemetry/historic` through the telemetry history API helper.
8. Cloud validates auth, trusted Edge access, query shape, time range, retention window, and `maxPoints`.
9. Cloud aggregates numeric telemetry rollups for the selected Edge, device, metric, and time range.
10. Client renders the returned aggregate series as one line chart and one aggregate table.
11. When the active context or filters change, old in-flight responses cannot overwrite the active Trends view.

## Acceptance Checks

- `/hub/dispatch/trends` MUST render a Trends surface instead of `DispatchPlaceholderTab`.
- Trends MUST remain under the existing `/hub` USER auth guard.
- Trends MUST show selected Dispatch context and require a selected `edgeId`.
- Trends MUST NOT start a Dashboard runtime socket session.
- Trends MUST load metric choices from the selected Edge catalog.
- Trends MUST load or reuse the selected Edge catalog without enabling Dashboard runtime context.
- Trends MUST allow only numeric telemetry metrics for MVP chart/table rendering.
- Client MUST call `GET /api/telemetry/historic` through a typed API helper.
- Cloud MUST expose `GET /api/telemetry/historic`.
- Cloud MUST require USER auth and trusted access to the requested `edgeId`.
- Cloud MUST reject invalid query shape, invalid date order, out-of-window ranges, and `maxPoints > 1000`.
- Cloud MUST default omitted `maxPoints` to `300`.
- Cloud MUST aggregate numeric rollups with one selected `edgeId`, `deviceId`, `metric`, and time range.
- Cloud MUST compute aggregate `avg` as `sum(rollup.sum) / sum(rollup.count)`, not as an unweighted average of source averages.
- Cloud MUST compute aggregate `last` from the latest rollup by `timestamp`.
- Cloud response MUST include `series`, `edgeId`, `deviceId`, `metric`, `dateStart`, `dateEnd`, and `maxPoints`.
- Each series point MUST include `timeStart`, `timeEnd`, `pointTime`, `min`, `max`, `avg`, `last`, and `count`.
- The chart and table MUST render from the same aggregated response object.
- The chart MUST render a single series using `avg` or `last`.
- The chart MUST render through Recharts when the dependency is installed.
- If Recharts is unavailable, the local SVG fallback MUST still render the same single series from the same response.
- Trends MUST show loading, empty, validation, and bounded error states.
- Stale previous Edge, device, metric, range, or `maxPoints` responses MUST NOT overwrite the active view.
- OpenAPI MUST document the endpoint, query parameters, success response, and relevant error responses.
- Lean automated proof MUST remain focused on the main Cloud aggregation and Client rendering path plus at most one critical negative stale/out-of-window scenario.

## Format: `[ID] [P?] [Story?] Description`

- `[P]` means the task can run in parallel because it touches different files and does not depend on incomplete tasks.
- `[US1]` maps to the Cloud historical telemetry API story.
- `[US2]` maps to the Client Dispatch Trends surface story.
- Setup, Foundational, Polish, and Review tasks do not use story labels.
- Every task includes the file path that owns the change or proof.

## Phase 1: Setup

**Purpose**: Add stable dependency and contract anchors before endpoint and UI behavior changes.

- [X] T001 Add telemetry history DTOs, query constants, response types, `maxPoints` defaults, and 7-day retention constants in `cloud_server/src/types/index.ts`.
- [X] T002 [P] Add Client telemetry history DTOs and request parameter types in `client/src/shared/api/telemetryHistory.ts`.
- [X] T003 Add Recharts as the preferred chart dependency by running `cmd /c npm install recharts` from `client`, updating `client/package.json` and `client/package-lock.json`.

**Checkpoint**: Cloud and Client have explicit contract anchors, and the preferred chart dependency is either installed or the SVG fallback path is selected.

---

## Phase 2: Foundational

**Purpose**: Build shared parsing, aggregation, API helper, and Trends-local primitives that block both user-facing stories.

- [X] T004 Add telemetry history query parsing and validation helpers for `edgeId`, `deviceId`, `metric`, `date_start`, `date_end`, and `maxPoints` in `cloud_server/src/services/telemetry-history.service.ts`.
- [X] T005 Add trusted USER Edge access validation for telemetry history without requiring an active Edge runtime socket in `cloud_server/src/services/telemetry-history.service.ts`.
- [X] T006 Add numeric rollup aggregation helpers with narrow `$match`, pre-bucket `$sort`, `$bucketAuto`, weighted `avg`, summed `count`, latest-by-`timestamp` `last`, `pointTime`, and final sort in `cloud_server/src/services/telemetry-history.service.ts`.
- [X] T007 [P] Add `getTelemetryHistory(params)` Client helper that builds `GET /telemetry/historic` query strings through `apiClient.get` in `client/src/shared/api/telemetryHistory.ts`.
- [X] T008 [P] Add Trends filter, load-state, value-mode, numeric metric option, and stale-request guard types in `client/src/features/dispatch/model/trends.ts`.
- [X] T009 [P] Add Trends data helpers for catalog numeric metric filtering, default range selection, midpoint fallback, display formatting, and same-response chart/table projection in `client/src/features/dispatch/model/trends.ts`.

**Checkpoint**: Validation, trusted access, aggregation, Client API, and Trends-local state helpers exist before production endpoint and UI wiring.

---

## Phase 3: User Story 1 - Cloud Historical Telemetry API (Priority: P1)

**Goal**: A trusted USER can request bounded historical numeric telemetry aggregates for one selected Edge/device/metric/time range.

**Independent Test**: Seed numeric and non-numeric telemetry rollups for a trusted Edge, call the real HTTP route, and verify auth/trust, retention validation, `maxPoints`, weighted aggregation, latest `last`, and response shape.

### Tests For User Story 1

- [X] T010 [US1] Add focused Cloud integration proof for trusted USER access, numeric telemetry history aggregation, default `maxPoints=300`, `maxPoints > 1000` rejection, weighted `avg`, latest `last`, and response shape in `cloud_server/tests/integration/telemetry-history.test.ts`.
- [X] T011 [US1] Add the critical negative proof for out-of-window date range returning a bounded `400` response without returning telemetry rows in `cloud_server/tests/integration/telemetry-history.test.ts`.

### Implementation For User Story 1

- [X] T012 [US1] Implement `getTrustedTelemetryHistory` service behavior with query validation, trusted access, numeric rollup filtering, MongoDB aggregation, and response projection in `cloud_server/src/services/telemetry-history.service.ts`.
- [X] T013 [US1] Add `TelemetryController.getHistoricTelemetry` with request parsing, service delegation, JSend success response, and existing error middleware mapping in `cloud_server/src/api/telemetry.controller.ts`.
- [X] T014 [US1] Register `GET /api/telemetry/historic` with `authMiddleware`, `requireRole('USER')`, and `TelemetryController.getHistoricTelemetry` in `cloud_server/src/api/routes.ts`.
- [X] T015 [US1] Update `cloud_server/openapi.yaml` with the telemetry history path, query parameters, response schemas, bearer auth, and `400`, `401`, `403`, and `404` responses.

**Checkpoint**: Cloud exposes the historical telemetry endpoint without changing telemetry ingestion, Socket.IO realtime routing, Edge runtime, or storage schema.

---

## Phase 4: User Story 2 - Dispatch Trends Surface (Priority: P1)

**Goal**: A dispatcher opens `/hub/dispatch/trends`, selects one numeric metric and range for the selected Edge, and sees a single-series chart plus aggregate table from the same response.

**Independent Test**: Mount `/hub/dispatch/trends` with a selected Edge, mock catalog and telemetry history responses, verify no Dashboard runtime session starts, verify the helper call, render chart/table from the same response, and verify stale previous-context response rejection.

### Tests For User Story 2

- [X] T016 [US2] Add compact Client API contract proof that `getTelemetryHistory()` builds `/telemetry/historic` query parameters and expects unwrapped response data in `client/tests/unit/telemetryHistoryContracts.test.ts`.
- [X] T017 [US2] Add focused Trends helper proof for numeric catalog filtering, default range derivation, midpoint fallback, and chart/table same-response projection in `client/tests/unit/dispatchTrends.test.ts`.
- [X] T018 [US2] Add focused Dispatch Trends integration proof for `/hub/dispatch/trends`, selected context, catalog-driven numeric metric choice, telemetry history helper call, chart/table render from one response, no Dashboard runtime session, and stale previous Edge/metric/range response rejection in `client/tests/integration/DispatchWorkspacePage.test.tsx`.

### Implementation For User Story 2

- [X] T019 [US2] Add `DispatchTrendsTab` route-owned component with selected-context handling, catalog loading without Dashboard runtime context, filter state, request lifecycle, stale response guards, and bounded states in `client/src/features/dispatch/components/DispatchTrendsTab.tsx`.
- [X] T020 [P] [US2] Add `DispatchTrendsControls` for numeric metric selection, date range inputs, value mode `avg|last`, `maxPoints`, validation display, and refresh action in `client/src/features/dispatch/components/DispatchTrendsControls.tsx`.
- [X] T021 [P] [US2] Add `DispatchTrendsChart` using Recharts `ResponsiveContainer`, `LineChart`, `XAxis`, `YAxis`, `Tooltip`, and one `Line` for `avg` or `last` in `client/src/features/dispatch/components/DispatchTrendsChart.tsx`.
- [ ] T022 [P] [US2] Add local SVG fallback chart implementation only if Recharts installation is rejected or unavailable in `client/src/features/dispatch/components/DispatchTrendsChartFallback.tsx`.
- [X] T023 [P] [US2] Add `DispatchTrendsTable` that renders `timeStart`, `timeEnd`, `min`, `max`, `avg`, `last`, and `count` from the same response series in `client/src/features/dispatch/components/DispatchTrendsTable.tsx`.
- [X] T024 [US2] Wire `DispatchWorkspacePage` to render `DispatchTrendsTab` for `DISPATCH_TRENDS_TAB` while leaving Telemetry, Commands, and Alarms placeholders inert in `client/src/features/dispatch/pages/DispatchWorkspacePage.tsx`.
- [X] T025 [US2] Ensure Trends keeps `loadDashboardRuntimeContext=false` and loads catalog inside `DispatchTrendsTab` or a shared non-runtime helper without Dashboard saved diagram/runtime catalog loading in `client/src/features/dispatch/pages/DispatchWorkspacePage.tsx`.
- [X] T026 [US2] Extend Dispatch integration fixtures with selected Edge catalog telemetry and telemetry history response handlers in `client/tests/integration/helpers/dispatchWorkspaceHarness.tsx`.

**Checkpoint**: Trends is a usable Client surface for one selected numeric metric and does not start Dashboard runtime behavior.

---

## Phase 5: Verification, Documentation Notes, And Technical Lead Review

**Purpose**: Verify Cloud/Client behavior, keep proof lean, and record implementation evidence.

- [X] T027 Inspect `cloud_server/src/services/telemetry-history.service.ts` and verify history validation enforces the 7-day retention window, trusted Edge access, numeric rollup filtering, weighted `avg`, latest `last`, and no Socket.IO dependency.
- [X] T028 Inspect `cloud_server/src/api/routes.ts` and `cloud_server/openapi.yaml` to verify `GET /api/telemetry/historic` route and OpenAPI contract match.
- [X] T029 Inspect `client/src/features/dispatch/components/DispatchTrendsTab.tsx` and `client/src/features/dispatch/pages/DispatchWorkspacePage.tsx` to verify Trends replaces only the Trends placeholder and does not start Dashboard runtime sessions.
- [X] T030 Inspect `client/package.json`, `client/src/features/dispatch/components/DispatchTrendsChart.tsx`, `client/src/features/dispatch/components/DispatchTrendsChartFallback.tsx`, and `client/src/features/dispatch/components/DispatchTrendsTable.tsx` to verify chart dependency or fallback path is consistent and chart/table consume the same response projection.
- [X] T031 Run focused Cloud telemetry history tests with `cmd /c npm run test -- telemetry-history` from `cloud_server` and record the result in `specs/012-dispatch/slices/plan_dispatch_trends_slice.md`.
- [X] T032 Run Cloud typecheck with `cmd /c npm run typecheck` from `cloud_server` and record the result in `specs/012-dispatch/slices/plan_dispatch_trends_slice.md`.
- [X] T033 Run OpenAPI lint with `cmd /c npx @redocly/cli lint openapi.yaml` from `cloud_server` and record the result in `specs/012-dispatch/slices/plan_dispatch_trends_slice.md`.
- [X] T034 Run focused Client telemetry history contract tests with `cmd /c npm run test -- telemetryHistoryContracts` from `client` and record the result in `specs/012-dispatch/slices/plan_dispatch_trends_slice.md`.
- [X] T035 Run focused Client Dispatch Trends tests with `cmd /c npm run test -- dispatchTrends` from `client` and record the result in `specs/012-dispatch/slices/plan_dispatch_trends_slice.md`.
- [X] T036 Run focused Dispatch workspace integration tests with `cmd /c npm run test -- DispatchWorkspacePage` from `client` and record the result in `specs/012-dispatch/slices/plan_dispatch_trends_slice.md`.
- [X] T037 Run Client build with `cmd /c npm run build` from `client` and record the result in `specs/012-dispatch/slices/plan_dispatch_trends_slice.md`.
- [X] T038 Add manual/runtime smoke notes for selected Edge Trends loading, numeric metric selection, valid range request, chart/table same-response rendering, empty state, bounded error state, stale response rejection, and no Dashboard runtime session in `specs/012-dispatch/slices/plan_dispatch_trends_slice.md`.
- [X] T039 Add automated/code proof notes for Cloud aggregation, OpenAPI contract, Client helper, Recharts or SVG fallback chart behavior, stale response guard, and Lean Testing boundary in `specs/012-dispatch/slices/plan_dispatch_trends_slice.md`.
- [X] T040 Complete Technical Lead Review for scope leakage, Cloud/Client/Edge boundaries, retention validation, aggregation correctness, stale Client state, chart dependency fallback, acceptance coverage, and Lean Testing Policy in `specs/012-dispatch/slices/plan_dispatch_trends_slice.md`.

### Verification Notes For T027-T037

- T027 inspection result: PASS. `cloud_server/src/services/telemetry-history.service.ts` validates `date_start < date_end`, enforces the 7-day retention window with `TELEMETRY_HISTORY_RETENTION_MS`, validates trusted Edge access through `EdgeServer.trustedUsers`, filters aggregation input by `rollup.kind = TELEMETRY_HISTORY_NUMERIC_ROLLUP_KIND`, sorts by `timestamp` before `$bucketAuto`, computes `avg` as `totalSum / count`, computes `last` with `$last` after the pre-bucket sort, and has no Socket.IO imports or dependencies.
- T028 inspection result: PASS. `cloud_server/src/api/routes.ts` registers `GET /telemetry/historic` behind `authMiddleware` and `requireRole('USER')`, and `cloud_server/openapi.yaml` documents `/api/telemetry/historic` with `edgeId`, `deviceId`, `metric`, `date_start`, `date_end`, `maxPoints`, bearer auth, `TelemetryHistoryResponse`, and `400`, `401`, `403`, and `404` responses.
- T029 inspection result: PASS. `client/src/features/dispatch/pages/DispatchWorkspacePage.tsx` renders `DispatchTrendsTab` only for `DISPATCH_TRENDS_TAB`, leaves Telemetry, Commands, and Alarms on `DispatchPlaceholderTab`, and sets `loadDashboardRuntimeContext` only when `activeTabId === DISPATCH_DASHBOARD_TAB`; `DispatchTrendsTab` loads catalog through `getEdgeServerCatalog(edgeId)` and does not start Dashboard runtime sessions.
- T030 inspection result: PASS. `client/package.json` includes `recharts`, so the production chart path is `DispatchTrendsChart` with Recharts; no `DispatchTrendsChartFallback.tsx` is required for this dependency state. `DispatchTrendsChart` and `DispatchTrendsTable` both consume the same `DispatchTrendsProjection` generated by `projectDispatchTrendsHistoryResponse`.
- T031 command outcome: PASS. Ran `cmd /c npm run test -- telemetry-history` from `cloud_server`; Vitest reported 2 test files passed and 5 tests passed (`tests/unit/telemetry-history.service.test.ts` and `tests/integration/telemetry-history.test.ts`).
- T032 command outcome: PASS. Ran `cmd /c npm run typecheck` from `cloud_server`; `tsc --noEmit` completed with exit code 0.
- T033 command outcome: PASS. Ran `cmd /c npx @redocly/cli lint openapi.yaml` from `cloud_server` after confirming endpoint documentation was present; Redocly reported `openapi.yaml: validated` and the API description is valid.
- T034 command outcome: PASS. Ran `cmd /c npm run test -- telemetryHistoryContracts` from `client`; Vitest reported 1 test file passed and 1 test passed (`tests/unit/telemetryHistoryContracts.test.ts`), covering the `getTelemetryHistory()` helper contract and JSend-unwrapped response expectation.
- T035 command outcome: PASS. Ran `cmd /c npm run test -- dispatchTrends` from `client`; Vitest reported 2 test files passed and 5 tests passed (`tests/unit/dispatchTrends.test.ts` and `tests/unit/DispatchTrendsTab.test.tsx`), covering model helpers, typed history loading, stale guards, and selected numeric controls. Recharts emitted jsdom layout warnings about chart width/height, but the tests passed.
- T036 command outcome: PASS. Ran `cmd /c npm run test -- DispatchWorkspacePage` from `client`; Vitest reported 1 test file passed and 3 tests passed (`tests/integration/DispatchWorkspacePage.test.tsx`), including `/hub/dispatch/trends` route integration, helper history loading, same-response chart/table rendering, stale response rejection, and no Dashboard runtime session. Recharts emitted a jsdom layout warning about chart width/height, but the test passed.
- T037 command outcome: PASS. Ran `cmd /c npm run build` from `client`; `tsc -b` and `vite build` completed with exit code 0. Vite reported a non-failing large chunk warning for `DispatchWorkspacePage`.

### Manual/Runtime Smoke Notes For T038

Status vocabulary for this slice:

- PASS: the manual runtime check was executed in a live browser/server environment and met the expected behavior.
- PARTIAL: the manual runtime check was executed but did not cover the full acceptance condition.
- NOT RUN: the manual runtime check was not executed.
- BLOCKED ENVIRONMENT: the manual runtime check needs live prerequisites that were not available in this batch.

Overall manual smoke status: NOT RUN / BLOCKED ENVIRONMENT. No live Cloud server, trusted USER credentials, selected active Edge Server, and seeded or recently emitted numeric telemetry rollups were provided for this batch. No MCP or browser automation was used for manual smoke.

- Selected Edge Trends loading: NOT RUN / BLOCKED ENVIRONMENT. Requires opening `/hub/dispatch/trends?diagramId=:diagramId&edgeId=:edgeId` in a live authenticated USER session with a trusted selected Edge.
- Numeric metric selection: NOT RUN / BLOCKED ENVIRONMENT. Requires a live selected Edge catalog containing numeric and non-numeric telemetry entries.
- Valid range request: NOT RUN / BLOCKED ENVIRONMENT. Requires live telemetry rollups inside the 7-day retention window and network observation of `GET /api/telemetry/historic`.
- Chart/table same-response rendering: NOT RUN / BLOCKED ENVIRONMENT. Requires a live historic telemetry response with at least one aggregate point.
- Empty state: NOT RUN / BLOCKED ENVIRONMENT. Requires a live valid range that returns no aggregate points.
- Bounded error state: NOT RUN / BLOCKED ENVIRONMENT. Requires a live out-of-window or otherwise invalid request and confirmation that the Client shows a bounded error instead of raw failure details.
- Stale response rejection: NOT RUN / BLOCKED ENVIRONMENT. Requires inducing an in-flight live request while changing selected Edge, device, metric, time range, or `maxPoints`.
- No Dashboard runtime session: NOT RUN / BLOCKED ENVIRONMENT. Requires live runtime/session instrumentation while visiting the Trends route.

Manual smoke conclusion: no item is recorded as PASS or PARTIAL in this batch. Runtime acceptance remains to be manually smoked when the live Cloud/USER/Edge/rollup environment is available; automated/code proof below covers only behavior that is appropriate to prove by tests or inspection.

### Automated And Code Proof Notes For T039

- Cloud aggregation and validation: PASS. `cloud_server/src/services/telemetry-history.service.ts` parses the required query fields, defaults `maxPoints` to `300`, rejects `maxPoints > 1000`, enforces `date_start < date_end`, and validates the requested range against `TELEMETRY_HISTORY_RETENTION_MS` before aggregation. The aggregation pipeline matches one `edgeId`, `deviceId`, `metric`, `rollup.kind = "numeric"`, and time range; sorts by `timestamp`; uses `$bucketAuto`; sums `rollup.count`; computes weighted `avg` as `totalSum / count`; uses `$last` after sorting for latest `last`; returns `pointTime`; and sorts returned points by `timeStart`.
- Cloud route and OpenAPI contract: PASS. `cloud_server/src/api/routes.ts` registers `GET /telemetry/historic` behind `authMiddleware` and `requireRole('USER')`; the service validates trusted Edge access through `EdgeServer.trustedUsers`. `cloud_server/openapi.yaml` documents `/api/telemetry/historic`, query parameters, bearer auth, `TelemetryHistoryResponse`, and `400`, `401`, `403`, and `404` responses.
- Client API helper: PASS. `client/src/shared/api/telemetryHistory.ts` builds `/telemetry/historic` query parameters and delegates to `apiClient.get<TelemetryHistoryResponse>`, relying on the existing JSend unwrap behavior.
- Chart behavior and fallback: PASS for the current dependency state. `client/package.json` includes `recharts`, and `DispatchTrendsChart` renders one Recharts `LineChart` series from `projection.chartPoints` using the active `avg` or `last` value mode. No SVG fallback file is required while Recharts is installed; if that dependency becomes unavailable, T022 remains the required fallback implementation path.
- Chart/table same-response projection: PASS. `projectDispatchTrendsHistoryResponse()` normalizes one response object, computes defensive `pointTime` fallback when needed, and derives both `chartPoints` and `tableRows` from the same normalized series. `DispatchTrendsChart` and `DispatchTrendsTable` both consume the same `DispatchTrendsProjection`.
- Stale Client state: PASS. `DispatchTrendsTab` resets state on selected Edge changes, keys active requests by Edge/device/metric/range/`maxPoints`, and only applies responses when `isDispatchTrendsRequestCurrent()` matches the active guard.
- Lean Testing boundary: PASS. Automated proof stays focused on the main Cloud history route/aggregation behavior, the critical out-of-window negative case, Client helper contract, Trends helper projection, route integration, same-response render, stale rejection, and no Dashboard runtime session. It does not add broad malformed-query matrices, visual variants, browser automation, hardware simulation, or manual-smoke automation.

### Technical Lead Review Notes For T040

Completed on 2026-05-13 from the accepted plan, `doc_cursed` boundaries, implemented Cloud/Client/OpenAPI files, verification notes, and refreshed focused command outcomes.

- Scope leakage: PASS. Inspected implementation remains limited to Cloud telemetry history service/controller/routes/OpenAPI, Client Dispatch Trends helper/model/components/route wiring, tests, and this slice plan. No Edge runtime, Edge YAML, Constructor, Live Telemetry, Command Audit, Alarm Journal expansion, exports, reports, multi-edge analytics, multi-series charts, downsampling engine, or permanent archive behavior was introduced.
- Cloud/Client/Edge boundaries: PASS. `cloud_server/src/services/telemetry-history.service.ts` owns validation, trusted Edge access, and MongoDB aggregation. `client/src/shared/api/telemetryHistory.ts` and `client/src/features/dispatch/components/DispatchTrendsTab.tsx` only request, project, and display aggregate responses. Edge runtime behavior is unchanged and no Trends path imports Edge runtime logic.
- USER trusted Edge access: PASS. `cloud_server/src/api/routes.ts` registers `GET /telemetry/historic` behind `authMiddleware` and `requireRole('USER')`; `assertTrustedTelemetryHistoryAccess()` checks `EdgeServer.trustedUsers` and does not require an active Edge socket session.
- Retention and bounded validation: PASS. `parseTelemetryHistoryQuery()` enforces `date_start < date_end`, rejects `maxPoints > 1000`, defaults omitted `maxPoints` to `300`, and rejects ranges outside the 7-day retention window before aggregation. This matches `doc_cursed/monitoring_plan.md`, which requires validation in addition to MongoDB TTL cleanup.
- Aggregation correctness: PASS. The aggregation pipeline starts with a narrow `$match` by selected `edgeId`, `deviceId`, `metric`, `rollup.kind = "numeric"`, and timestamp range; sorts by `timestamp`; uses `$bucketAuto`; sums `rollup.count`; computes weighted `avg` as `totalSum / count`; uses `$last` after the pre-bucket sort for latest-source `last`; projects `pointTime`; and sorts returned points by `timeStart`.
- OpenAPI and Client contract: PASS. `cloud_server/openapi.yaml` documents `/api/telemetry/historic` with required query params, bearer auth, JSend success wrapper, `TelemetryHistoryPoint`, and `400`, `401`, `403`, `404` responses. The Client helper uses `apiClient.get<TelemetryHistoryResponse>()`, so the Client consumes the JSend-unwrapped data contract.
- Dispatch context and runtime boundary: PASS. `DispatchWorkspacePage` renders `DispatchTrendsTab` only for `DISPATCH_TRENDS_TAB`; Telemetry, Commands, and Alarms remain placeholders. `loadDashboardRuntimeContext` is true only for the Dashboard tab, and the Trends integration proof verifies no Dashboard runtime session starts.
- Catalog and numeric metric selection: PASS. Trends loads the selected Edge catalog through `getEdgeServerCatalog(edgeId)` inside `DispatchTrendsTab`, validates the returned `edgeServerId`, and only exposes catalog telemetry entries with `valueType: "number"`. Missing or non-number `valueType` entries are not treated as numeric.
- Chart dependency fallback: PASS for the accepted dependency state. `client/package.json` includes `recharts`, and `DispatchTrendsChart` uses Recharts `ResponsiveContainer`, `LineChart`, `XAxis`, `YAxis`, `Tooltip`, and one `Line` for the active `avg` or `last` mode. `DispatchTrendsChartFallback.tsx` is not required while Recharts is installed; T022 remains the required fallback implementation path only if Recharts becomes rejected or unavailable.
- Same-response chart/table projection: PASS. `projectDispatchTrendsHistoryResponse()` derives both `chartPoints` and `tableRows` from one normalized `TelemetryHistoryResponse`, with a defensive midpoint fallback when `pointTime` is absent. `DispatchTrendsChart` and `DispatchTrendsTable` consume the same `DispatchTrendsProjection`.
- Stale Client state: PASS. `DispatchTrendsTab` resets history state on selected Edge changes, keys active requests by Edge/device/metric/range/`maxPoints`, and applies results only when `isDispatchTrendsRequestCurrent()` still matches the active guard. Focused Client tests cover stale Edge/metric response rejection.
- Loading, empty, validation, and bounded error states: PASS for automated/code proof and PARTIAL for runtime acceptance. Code paths exist for loading, empty aggregate responses, local validation messages, catalog errors, and bounded history errors. Live manual smoke remains NOT RUN / BLOCKED ENVIRONMENT because no live Cloud/USER/Edge/rollup environment was available.
- Acceptance coverage: PARTIAL. Automated/code proof covers the main Cloud endpoint, validation/aggregation, OpenAPI contract, Client helper, route integration, numeric catalog selection, same-response rendering, stale response rejection, and no Dashboard runtime session. Full live manual/runtime smoke is still blocked by environment prerequisites and must not be counted as passed.
- Lean Testing Policy: PASS. Proof remains focused on the main historical telemetry API and Trends route behavior plus critical negative out-of-window/stale-response risks. It avoids broad malformed-query matrices, visual-variant matrices, browser automation, hardware simulation, exports, multi-series analytics, and manual-smoke automation.
- Current verification refresh: PASS. Re-ran `cmd /c npm run test -- telemetry-history`, `cmd /c npm run typecheck`, and `cmd /c npx @redocly/cli lint openapi.yaml` from `cloud_server`; all passed. Re-ran `cmd /c npm run test -- telemetryHistoryContracts`, `cmd /c npm run test -- dispatchTrends`, `cmd /c npm run test -- DispatchWorkspacePage`, and `cmd /c npm run build` from `client`; all passed. Recharts emitted non-failing jsdom chart width/height warnings in tests, and Vite emitted a non-failing large chunk warning for `DispatchWorkspacePage`.

---

## Dependencies And Execution Order

### Phase Dependencies

- Phase 1 has no production dependency and establishes contract and dependency anchors.
- Phase 2 depends on Phase 1 type anchors and blocks both user stories.
- Phase 3 depends on Phase 2 Cloud validation and aggregation helpers.
- Phase 4 depends on Phase 2 Client helper and Trends primitives; it can use mocked Cloud responses while Phase 3 is still in progress.
- Phase 5 depends on implementation completion from Phases 3 and 4.

### Task Dependencies

- T004-T006 depend on T001.
- T007 depends on T002.
- T008-T009 depend on current Dispatch model and can proceed after T002.
- T010-T011 depend on T004-T006 and pass only after T012-T015.
- T012 depends on T004-T006.
- T013 depends on T012.
- T014 depends on T013.
- T015 depends on final response shape from T012-T013.
- T016 depends on T007.
- T017 depends on T008-T009.
- T018 depends on T016-T017 and passes only after T019-T026.
- T019 depends on T007-T009.
- T020 depends on T008-T009 and T019 filter contracts.
- T021 depends on T003 when Recharts is installed.
- T022 is required only if T003 is rejected or unavailable.
- T023 depends on T009.
- T024 depends on T019.
- T025 depends on the final Trends catalog-loading decision from T019.
- T026 depends on T018 expected fixtures.
- T027-T040 depend on implementation completion.

### Parallel Opportunities

- T002 can run in parallel with T001 because it touches Client-only files.
- T004, T005, and T006 SHOULD be sequenced by one owner because they all modify `cloud_server/src/services/telemetry-history.service.ts`.
- T007, T008, and T009 can run in parallel after T002 because they touch separate Client API/model concerns.
- T010-T011 can be drafted while T012-T015 are implemented, using the agreed endpoint contract.
- T016 and T017 can run in parallel because they target separate Client unit test files.
- T020, T021, T022, and T023 can run in parallel after T019 contracts are stable because they target separate components.
- T027-T030 can run in parallel with verification commands after implementation is complete.
- T031-T037 can run in parallel if local test/build tooling is stable.

## Parallel Example: Cloud Contract

```text
Task: "Add focused Cloud integration proof for trusted USER access, numeric telemetry history aggregation, default `maxPoints=300`, `maxPoints > 1000` rejection, 7-day range validation, weighted `avg`, latest `last`, and response shape in `cloud_server/tests/integration/telemetry-history.test.ts`"
Task: "Implement `getTrustedTelemetryHistory` service behavior with query validation, trusted access, numeric rollup filtering, MongoDB aggregation, and response projection in `cloud_server/src/services/telemetry-history.service.ts`"
```

## Parallel Example: Client Trends Surface

```text
Task: "Add `DispatchTrendsControls` for numeric metric selection, date range inputs, value mode `avg|last`, `maxPoints`, validation display, and refresh action in `client/src/features/dispatch/components/DispatchTrendsControls.tsx`"
Task: "Add `DispatchTrendsChart` using Recharts `ResponsiveContainer`, `LineChart`, `XAxis`, `YAxis`, `Tooltip`, and one `Line` for `avg` or `last` in `client/src/features/dispatch/components/DispatchTrendsChart.tsx`"
Task: "Add `DispatchTrendsTable` that renders `timeStart`, `timeEnd`, `min`, `max`, `avg`, `last`, and `count` from the same response series in `client/src/features/dispatch/components/DispatchTrendsTable.tsx`"
```

## Implementation Strategy

### MVP First

1. Complete Phase 1 and decide whether Recharts is available.
2. Complete Phase 2 to anchor Cloud validation/aggregation and Client helper/model primitives.
3. Complete Phase 3 so the Cloud endpoint is real, protected, documented, and proven.
4. Complete Phase 4 so Trends replaces the placeholder and renders the Cloud response.
5. Complete Phase 5 verification and Technical Lead Review.

### Recharts Fallback

- If T003 is accepted and Recharts installs cleanly, T021 is the primary chart implementation and T022 MAY be skipped.
- If T003 is rejected or unavailable, T021 MUST be replaced by wiring the local SVG chart fallback from T022 as the production chart renderer.
- Success MUST NOT be counted if the chart and table use different transformed response data.

### Boundary Bias

- Keep historical aggregation in Cloud service code, not Client helpers.
- Keep controller and route wiring thin.
- Keep Trends catalog loading non-runtime; do not use Dashboard saved diagram/catalog loading just to obtain metric options.
- Keep boolean telemetry unsupported in this slice instead of coercing boolean rollups into numeric chart points.
- Keep stale-response handling in the Trends route-owned component because it is tied to active selected context and filter state.

## Manual And Runtime Smoke

Manual smoke SHOULD use a live Cloud server, a trusted USER, a selected active Edge with numeric telemetry catalog entries, and seeded or recently emitted numeric telemetry rollups.

1. Open `/hub/dispatch/trends?diagramId=:diagramId&edgeId=:edgeId`.
2. Confirm the Trends tab renders instead of the placeholder.
3. Confirm no Dashboard runtime socket session starts for the Trends route.
4. Confirm numeric metric options are derived from the selected Edge catalog.
5. Select one numeric `deviceId + metric`, a valid time range inside the last 7 days, and `avg` mode.
6. Confirm Client calls `GET /api/telemetry/historic` with selected `edgeId`, `deviceId`, `metric`, `date_start`, `date_end`, and `maxPoints`.
7. Confirm the chart and table render the same returned series.
8. Switch to `last` mode and confirm only the plotted value mode changes; the table remains the same response.
9. Select an empty valid range and confirm the empty state does not imply a request failure.
10. Select an out-of-window range and confirm a bounded validation/error state.
11. Switch selected Edge or metric while a request is in flight and confirm the old response does not overwrite the active view.

Manual smoke MUST NOT count as passed if Trends starts a Dashboard runtime session, if Client aggregates arbitrary raw history locally, if boolean telemetry is silently graphed as numeric data, if chart and table diverge, or if a previous Edge/metric response remains visible after context changes.

## Technical Lead Review

Review this plan and implementation for Cloud-owned aggregation, Client-only display ownership, USER trusted Edge access, retention-window validation, weighted aggregation correctness, `last` ordering, OpenAPI contract drift, Recharts fallback handling, stale Client state, Dispatch context boundaries, no Dashboard runtime startup, and Lean Testing discipline.

### Review Checklist

- [X] Verify scope did not expand into Edge runtime, Edge YAML, Constructor, Live Telemetry, Command Audit, Alarm Journal expansion, exports, reports, multi-edge analytics, multi-series charts, downsampling, or permanent archive.
- [X] Verify Cloud endpoint requires USER auth and trusted access to the requested `edgeId`.
- [X] Verify retention window is enforced by validation, not only MongoDB TTL cleanup.
- [X] Verify invalid date order and `maxPoints > 1000` return bounded `400` errors.
- [X] Verify numeric rollup aggregation filters `rollup.kind = "numeric"`.
- [X] Verify aggregate `count` sums source `rollup.count` values.
- [X] Verify aggregate `avg` uses weighted `sum(rollup.sum) / sum(rollup.count)`.
- [X] Verify aggregate `last` comes from the latest source rollup by `timestamp`.
- [X] Verify `pointTime` is returned or defensively computed from `timeStart` and `timeEnd`.
- [X] Verify OpenAPI matches implemented query and response shape.
- [X] Verify Client helper uses `apiClient` and JSend unwrap behavior.
- [X] Verify Trends loads Edge catalog without enabling Dashboard runtime context.
- [X] Verify only numeric catalog telemetry entries are selectable.
- [X] Verify Trends does not start Dashboard runtime socket sessions.
- [X] Verify chart and table render from the same response projection.
- [X] Verify Recharts is used when installed and local SVG fallback remains viable if dependency installation is unavailable.
- [X] Verify stale previous Edge/device/metric/range/`maxPoints` responses cannot overwrite active state.
- [X] Verify loading, empty, validation, and bounded error states are behaviorally covered or smoke-tested.
- [X] Verify automated proof remains lean and avoids broad malformed-query or visual-variant matrices.

## Review Trigger

Review this plan when telemetry rollup schema changes, Dispatch shared context changes, Edge catalog telemetry metadata changes, MongoDB retention policy changes, chart dependency policy changes, or broader analytics/export/multi-series requirements enter scope.
