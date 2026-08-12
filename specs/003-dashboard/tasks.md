# Tasks: Dashboard SPA Monitoring

**Input**: Design documents from `/specs/003-dashboard/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/, quickstart.md

**Tests**: Include automated tests because the specification and plan explicitly require integration coverage, unit validation for bindings/runtime projection, and mocked Socket.IO session behavior.

**Organization**: Tasks are grouped by user story so each story can be implemented, verified, and demonstrated independently once its dependencies are complete.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on unfinished tasks)
- **[Story]**: User story label (`[US1]`, `[US2]`, `[US3]`, `[US4]`)
- Every task includes the exact file path that should be created or updated

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Prepare the Dashboard feature workspace, dependency, and reusable test harness.

- [X] T001 Add `socket.io-client` for Dashboard runtime transport in `client/package.json` and refresh `client/package-lock.json`
- [X] T002 [P] Create the shared Dashboard domain scaffold in `client/src/features/dashboard/model/types.ts`
- [X] T003 [P] Add a reusable mocked Socket.IO session helper in `client/tests/integration/helpers/mockDashboardRuntimeSocket.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Build the shared contracts and plumbing that every Dashboard story depends on.

**CRITICAL**: Complete this phase before starting user-story delivery.

- [X] T004 Update Dashboard-facing REST helpers and typed responses in `client/src/shared/api/diagrams.ts`, `client/src/shared/api/bindings.ts`, and `client/src/shared/api/edgeServers.ts`
- [X] T005 [P] Implement Dashboard query parsing and URL synchronization helpers in `client/src/features/dashboard/hooks/useDashboardRouteState.ts`
- [X] T006 [P] Implement binding-profile validation helpers against saved widget ids in `client/src/features/dashboard/model/bindingValidation.ts`
- [X] T007 [P] Implement runtime projection selectors for bound widget values and status in `client/src/features/dashboard/model/selectors.ts`
- [X] T008 [P] Implement the cloud Socket.IO transport adapter in `client/src/features/dashboard/services/cloudRuntimeClient.ts`
- [X] T009 Implement monitoring-session lifecycle management in `client/src/features/dashboard/hooks/useDashboardRuntimeSession.ts`

**Checkpoint**: Dashboard has stable API contracts, route-state helpers, binding validation, runtime projection, and Socket.IO session plumbing.

---

## Phase 3: User Story 1 - Open Dashboard And Choose Monitoring Context (Priority: P1)

**Goal**: Let an authenticated User open `/hub/dashboard`, understand the current state, choose a valid Diagram and Edge Server pair, and keep the route query in sync.

**Independent Test**: Open `/hub/dashboard` with no params, valid params, and invalid params, then attempt the route as an Admin. Verify the page stays inside the SPA shell for authenticated Users, renders selectors, filters edge options by the selected diagram, updates the URL without a full reload, and denies Admin access before monitoring initialization.

### Tests for User Story 1

- [X] T010 [US1] Add route-prefill, invalid-selection, Admin-denial, and URL-sync integration coverage in `client/tests/integration/DashboardPage.test.tsx`

### Implementation for User Story 1

- [X] T011 [P] [US1] Build Diagram and Edge selection controls in `client/src/features/dashboard/components/DashboardToolbar.tsx`
- [X] T012 [P] [US1] Build empty, loading, generic-error, and invalid-selection messaging in `client/src/features/dashboard/components/DashboardStatePanel.tsx`
- [X] T013 [US1] Implement Dashboard page route flow and diagram-first selection behavior in `client/src/features/user-hub/pages/DashboardPage.tsx`
- [X] T014 [US1] Register the `/hub/dashboard` route in `client/src/app/userHubRoutes.tsx` with authenticated User-only access and Admin denial before Dashboard initialization

**Checkpoint**: Dashboard opens as a native User Hub page for authenticated Users, denies Admin access before monitoring init, accepts valid route prefills, rejects invalid selections without leaving the route, and keeps query params synchronized with the current selection.

---

## Phase 4: User Story 2 - Observe Live Runtime State (Priority: P1)

**Goal**: Let the user monitor a selected context with live transport status, edge availability, reconnect messaging, and in-place context switching.

**Independent Test**: Select a valid context, verify live runtime status appears, confirm disconnect messaging preserves the last rendered values, and ensure switching context abandons the previous session without a page reload.

### Tests for User Story 2

- [X] T015 [US2] Add runtime-session unit coverage for connect, subscribe, telemetry, reconnect, and cleanup in `client/tests/unit/useDashboardRuntimeSession.test.ts`
- [X] T016 [US2] Add live-runtime and transport-status integration coverage in `client/tests/integration/DashboardPage.test.tsx`

### Implementation for User Story 2

- [X] T017 [P] [US2] Add transport and edge-availability badges plus reconnect messaging in `client/src/features/dashboard/components/DashboardStatePanel.tsx`
- [X] T018 [P] [US2] Build the runtime surface shell with last-value preservation in `client/src/features/dashboard/components/DashboardRuntimeSurface.tsx`
- [X] T019 [US2] Integrate active-session startup, disposal, and reconnect behavior in `client/src/features/user-hub/pages/DashboardPage.tsx`

**Checkpoint**: Dashboard can maintain one live session per selected edge, distinguish transport disconnect from edge offline, and keep the page active during context changes.

---

## Phase 5: User Story 3 - Resolve Saved Bindings And Render Bound Widgets (Priority: P2)

**Goal**: Resolve the saved binding profile for the active `diagramId + edgeId` pair, validate it against the saved diagram snapshot, and render supported bound widgets from live data.

**Independent Test**: Open a valid saved context and verify `number-display`, `text-display`, and `led` widgets render bound values from saved backend contracts; then verify missing or stale binding profiles produce explicit recovery states instead of inferred mappings and that unsaved constructor-local state does not affect runtime output.

### Tests for User Story 3

- [X] T020 [P] [US3] Add binding validation unit coverage in `client/tests/unit/bindingValidation.test.ts`
- [X] T021 [P] [US3] Add runtime projection unit coverage for `number-display`, `text-display`, and `led` in `client/tests/unit/dashboardRuntimeProjection.test.ts`
- [X] T022 [US3] Add integration coverage for missing-binding, invalid-binding, saved-only-runtime-source behavior, and valid bound rendering in `client/tests/integration/DashboardPage.test.tsx`

### Implementation for User Story 3

- [X] T023 [US3] Finalize saved binding-profile resolution and stale-widget detection in `client/src/features/dashboard/model/bindingValidation.ts`
- [X] T024 [P] [US3] Finalize bound-value projection rules for supported MVP widgets in `client/src/features/dashboard/model/selectors.ts`
- [X] T025 [US3] Render the saved diagram snapshot with resolved bound widget values in `client/src/features/dashboard/components/DashboardRuntimeSurface.tsx`
- [X] T026 [US3] Resolve saved diagram and binding bootstrap states in `client/src/features/user-hub/pages/DashboardPage.tsx` from backend-saved contracts only, ignoring constructor-local drafts and unsaved editor state

**Checkpoint**: Dashboard executes only the saved backend diagram plus saved binding profile, ignores constructor-local unsaved state, renders supported bound widgets, and exposes explicit recovery states for missing or stale bindings.

---

## Phase 6: User Story 4 - Preserve Runtime Boundaries Without Expanding MVP (Priority: P3)

**Goal**: Keep Dashboard strictly monitoring-only while future command widgets remain visible but non-operative and no condition or command logic leaks into MVP runtime.

**Independent Test**: Render a diagram with future command-capable widgets and verify those widgets stay visible, do not emit commands, and do not introduce any condition-processing behavior.

### Tests for User Story 4

- [X] T027 [US4] Add integration coverage that future command-capable widgets remain visible but non-operative in `client/tests/integration/DashboardPage.test.tsx`

### Implementation for User Story 4

- [X] T028 [P] [US4] Disable pointer and command behavior for unsupported runtime widgets in `client/src/features/dashboard/components/DashboardRuntimeSurface.tsx`
- [X] T029 [P] [US4] Restrict Dashboard transport behavior to subscribe-and-observe only in `client/src/features/dashboard/services/cloudRuntimeClient.ts` and `client/src/features/dashboard/hooks/useDashboardRuntimeSession.ts`

**Checkpoint**: MVP Dashboard remains an execution-only monitoring surface and does not drift into command or condition behavior.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Finalize reusable fixtures, UX polish, and end-to-end validation across all stories.

- [X] T030 [P] Add reusable Dashboard REST/runtime fixtures in `client/tests/mocks/handlers.ts` and `client/tests/integration/helpers/mockDashboardRuntimeSocket.ts`
- [X] T031 Polish recovery copy, loading transitions, dark-surface consistency, and dark monitoring-canvas treatment in `client/src/features/dashboard/components/DashboardStatePanel.tsx` and `client/src/features/user-hub/pages/DashboardPage.tsx`
- [X] T032 Validate the implementation against `specs/003-dashboard/quickstart.md` and the timing thresholds in `specs/003-dashboard/spec.md`, and extend `client/tests/integration/DashboardPage.test.tsx` for any uncovered path

---

## Visual Rendering Follow-up Note

The completed Phase 5 and Phase 7 tasks established saved-contract runtime projection, diagnostic text output, and runtime-session plumbing. They do not close the visual monitoring-surface requirements added on 2026-04-24.

For tasks T033 and later:

- Production wiring tasks are closed only through the Dashboard runtime path in `client/src/features/user-hub/pages/DashboardPage.tsx` and `client/src/features/dashboard/components/DashboardRuntimeSurface.tsx`.
- Direct component tests, fixture-only checks, file-existence checks, or helper-only tests cannot close production wiring tasks.
- Saved layout rendering must preserve saved ids, coordinates, sizes, scale, connection point references, connection segments, widget geometry, and widget styling where present.
- Dashboard must not import Constructor internals; it may only consume saved cloud contracts and client-owned rendering code.
- A completed monitoring view must not fall back to a textual widget/value list as the primary surface.
- Each implementation task that can be closed by partial wiring must be paired with a proof task that exercises the acceptance-relevant production path.

---

## Phase 8: Follow-up Setup - Visual Runtime Renderer

**Purpose**: Add the rendering dependency and client-owned layout/viewport foundations required before replacing the text-first runtime surface.

- [X] T033 Add `react-konva` and `konva` dependencies in `client/package.json` and refresh `client/package-lock.json`
- [X] T034 [P] Create constructor-shaped Dashboard visual layout fixtures with images, connection points, connections, number/text/led widgets, unsupported widgets, and damaged references in `client/tests/fixtures/dashboardVisualLayout.ts`, and expose them in a form that MSW handlers can consume without rebuilding visual layout data
- [X] T035 [P] Extend Dashboard saved-layout and render-issue types without importing Constructor internals in `client/src/features/dashboard/model/types.ts`
- [X] T036 [P] Add saved-layout normalization tests that prove ids, coordinates, scale, connection references, segments, widget geometry, and render issues are preserved rather than rebuilt in `client/tests/unit/dashboardRuntimeLayout.test.ts`
- [X] T037 [P] Add viewport tests for near-100% initial fit, large-diagram fit, pan, zoom, reset, and non-mutating saved layout behavior in `client/tests/unit/dashboardViewport.test.ts`
- [X] T038 Implement saved-layout normalization, render indexes, bounds calculation, and blocking/recoverable render issues in `client/src/features/dashboard/model/runtimeLayout.ts`
- [X] T039 Implement pure viewport fit, reset, zoom, pan, and grid-transform helpers in `client/src/features/dashboard/model/viewport.ts`

**Checkpoint**: Dashboard has a client-owned saved-layout runtime model and viewport model that preserve authored geometry without depending on Constructor internals.

---

## Phase 9: User Story 2 Follow-up - Render Saved Visual Diagram (Priority: P1)

**Goal**: Replace the text-first runtime surface with a read-only visual monitoring workspace that renders the saved diagram layout through the production Dashboard page path.

**Independent Test**: Open a valid `diagramId + edgeId` context through `DashboardPage`, load the saved visual layout through MSW REST contracts, and verify the primary monitoring surface contains the saved diagram visual elements instead of only textual widget/value rows.

### Tests for User Story 2 Visual Follow-up

- [X] T040 [US2] Add `DashboardPage` integration coverage proving the saved visual layout from MSW `GET /api/diagrams/:id` renders as the primary surface using the T034 visual layout fixture, and a text-only widget/value list does not satisfy ready state in `client/tests/integration/DashboardVisualSurface.test.tsx`

### Implementation for User Story 2 Visual Follow-up

- [X] T041 [US2] Build the React Konva Stage, read-only workspace transform, and grid layer in `client/src/features/dashboard/components/DashboardVisualSurface.tsx`
- [X] T042 [US2] Render saved images, connections, black connection points, and saved widget shells from normalized layout without inferring or rebuilding geometry; use saved connection `segments` when present, derive only from saved connection point positions when segments are absent, and emit recoverable render issues for incomplete geometry in `client/src/features/dashboard/components/DashboardVisualSurface.tsx`
- [X] T043 [US2] Build zoom in/out, fit-to-view, reset, and drag-to-pan controls that update viewport state only in `client/src/features/dashboard/components/DashboardViewportControls.tsx`
- [X] T044 [US2] Wire `DashboardVisualSurface` and viewport controls into the production runtime path, replacing the text-first primary surface in `client/src/features/dashboard/components/DashboardRuntimeSurface.tsx`

**Checkpoint**: A valid monitored context renders the saved visual diagram as the primary Dashboard surface through the production page/runtime path.

---

## Phase 10: User Story 3 Follow-up - Apply Telemetry Inside Visual Widgets (Priority: P2)

**Goal**: Apply live runtime values inside the corresponding saved visual widgets without moving telemetry into diagnostics or selector-only state.

**Independent Test**: Open a valid monitored context through `DashboardPage`, emit mocked Socket.IO telemetry for bound `number-display` and `text-display` widgets, and verify the visible values update inside those visual widgets while reconnect states preserve last-known values.

### Tests for User Story 3 Visual Follow-up

- [X] T045 [US3] Add `DashboardPage` integration coverage proving mocked Socket.IO telemetry updates bound `number-display` and `text-display` values inside visual widgets, not only selectors or diagnostics, in `client/tests/integration/DashboardVisualSurface.test.tsx`

### Implementation for User Story 3 Visual Follow-up

- [X] T046 [US3] Extend runtime projection for visual widget values, pending values, last-known values, and unit labels from saved widget config only, without inventing metric metadata contracts, in `client/src/features/dashboard/model/selectors.ts`
- [X] T047 [US3] Render live `number-display` and `text-display` values inside saved visual widget geometry while preserving widget styling in `client/src/features/dashboard/components/DashboardVisualSurface.tsx`
- [X] T048 [US3] Preserve last-known visual values during reconnect without hidden replay or clearing the monitoring surface in `client/src/features/dashboard/components/DashboardRuntimeSurface.tsx`

**Checkpoint**: Live values for supported display widgets appear inside the saved visual widget surfaces and survive reconnect transitions as last-known state.

---

## Phase 11: User Story 4 Follow-up - Keep Unsupported Widgets Visible And Non-operative (Priority: P3)

**Goal**: Keep unsupported and future command-capable widgets visually present while preventing command behavior, pointer operation, or implicit runtime semantics.

**Independent Test**: Open a visual diagram containing `led` and unsupported/future widgets through `DashboardPage`, then verify they remain visible, read-only, and non-operative.

### Tests for User Story 4 Visual Follow-up

- [X] T049 [US4] Add `DashboardPage` integration coverage proving `led` and unsupported/future widgets remain visually present but do not emit commands or attach operative pointer behavior in `client/tests/integration/DashboardVisualSurface.test.tsx`

### Implementation for User Story 4 Visual Follow-up

- [X] T050 [US4] Render unsupported saved widgets and `led` widgets as read-only visual elements from saved geometry while deferring live `led` semantics in `client/src/features/dashboard/components/DashboardVisualSurface.tsx`

**Checkpoint**: The visual renderer preserves unsupported widgets as part of the saved diagram while Dashboard remains monitoring-only.

---

## Phase 12: Follow-up Polish - Diagnostics, Recovery, And Validation

**Purpose**: Add secondary diagnostics, visual-rendering recovery states, production fixtures, and quickstart-aligned validation for the visual renderer.

- [X] T051 Add `DashboardPage` integration coverage for collapsed diagnostics opening from both the bottom handle and `Details`, with bounded internal scrolling and no replacement of the visual surface, in `client/tests/integration/DashboardPage.test.tsx`
- [X] T052 Add `DashboardPage` integration coverage for blocking and recoverable visual render issues, proving Dashboard shows `visual-rendering-error` or `partial-visual-rendering` instead of a text-only fallback in `client/tests/integration/DashboardPage.test.tsx`
- [X] T053 Build the collapsed bottom diagnostics overlay with grouped telemetry, binding, and render-issue sections in `client/src/features/dashboard/components/DashboardDiagnosticsPanel.tsx`
- [X] T054 Wire the `Details` toolbar action and bottom handle to the same diagnostics state in `client/src/features/dashboard/components/DashboardToolbar.tsx` and `client/src/features/dashboard/components/DashboardRuntimeSurface.tsx`
- [X] T055 Surface `visual-rendering-error` and `partial-visual-rendering` states from normalized render issues in `client/src/features/dashboard/components/DashboardStatePanel.tsx` and `client/src/features/user-hub/pages/DashboardPage.tsx`
- [X] T056 Update Dashboard MSW and runtime fixtures so all production integration tests consume the shared saved visual layout fixtures through REST/runtime contracts in `client/tests/mocks/handlers.ts` and `client/tests/integration/helpers/mockDashboardRuntimeSocket.ts`
- [ ] T057 Validate the visual renderer against `specs/003-dashboard/quickstart.md`, including text-only guard, viewport behavior, visual telemetry, diagnostics, and render-issue recovery, and extend `client/tests/integration/DashboardPage.test.tsx` only for uncovered acceptance paths

---

## Phase 13: Dashboard Visual Fix — Layout, Rendering, Navigation

**Purpose**: Fix visual defects, remove redundant UI, modernize navigation. Design reference: `specs/003-dashboard/visual-fix-plan.md`.

**Precondition**: Phases 8–12 complete (T033–T056 done). Dashboard is functionally working but has visual issues.

### Этап 1: Segment parsing fix

- [X] T058 [P] Extend `DashboardSavedConnectionSegment` with optional `start`, `end` (`DashboardCanvasPoint`), `from`, `to` (`DashboardCanvasPoint`), `points` (`DashboardCanvasPoint[]`), `direction` (`string`), and `index` (`number`) fields in `client/src/features/dashboard/model/types.ts`
- [X] T059 [P] Add `start`/`end` branch to `resolveSegmentEndpointPair` in `client/src/features/dashboard/model/runtimeLayout.ts` — insert `if (isCanvasPoint(segment.start) && isCanvasPoint(segment.end))` before the `from`/`to` branch, returning `{ from: segment.start, to: segment.end }`
- [X] T060 Update connection segments in visual layout fixture to constructor format `{ start: {x,y}, end: {x,y}, direction, index }` in `client/tests/fixtures/dashboardVisualLayout.ts` and add a unit test proving segments with `start`/`end` produce valid render segments without issues in `client/tests/unit/dashboardRuntimeLayout.test.ts`

**Checkpoint**: `npm test` passes. Connections render on the canvas. `unsupported-connection-segment` issues no longer appear for constructor-saved layouts.

### Этап 2: Image borders

- [X] T061 Wrap each `KonvaImage` in a `Group` with a preceding `Rect` (`stroke="#000000"`, `strokeWidth={2}`) sharing the same `x`, `y`, `width`, `height` in the image rendering block of `client/src/features/dashboard/components/DashboardVisualSurface.tsx`

**Checkpoint**: Images on canvas have visible black borders. Pins visually connect to image edges.

### Этап 3: Layout refactor

- [X] T062 Remove `DashboardStatePanel` render and import from `client/src/features/user-hub/pages/DashboardPage.tsx` — do not delete the component file
- [X] T063 Remove the double wrapper (`section.rounded-xl` + `div.rounded-lg`) around `DashboardRuntimeSurface` in `client/src/features/user-hub/pages/DashboardPage.tsx` and change the page root layout to `flex h-full flex-col overflow-hidden` so RuntimeSurface fills available space
- [X] T064 Move Diagram/Edge `<select>` controls, Details button, and Fit to View button inline into the header bar of `client/src/features/dashboard/components/DashboardRuntimeSurface.tsx` — accept new props (`diagrams`, `selectedDiagramId`, `edgeOptions`, `selectedEdgeId`, `disabled`, `onDiagramChange`, `onEdgeChange`), remove the `<h2>Live Runtime Surface</h2>` heading and text-based Transport/Edge status lines, remove the border from the root element, and pass toolbar-related props from `DashboardPage.tsx`
- [X] T065 Delete `client/src/features/dashboard/components/DashboardToolbar.tsx` and remove its import from `client/src/features/user-hub/pages/DashboardPage.tsx`
- [X] T066 Add recovery-state placeholders inside `DashboardRuntimeSurface` for `isActiveContext === false` states: `empty` → icon + «Select Diagram and Edge Server», `loading` → spinner + «Loading…», `error`/`invalid-selection`/`missing-binding`/`invalid-binding` → error icon + short message + «Open Details for more info» — in `client/src/features/dashboard/components/DashboardRuntimeSurface.tsx`
- [X] T067 Refactor `DashboardDiagnosticsPanel` from a single grid layout to 4 inline tabs (Status, Telemetry, Bindings, Render issues) in `client/src/features/dashboard/components/DashboardDiagnosticsPanel.tsx` — Status tab receives new props (`recoveryState`, `transportStatus`, `edgeAvailability`) and displays recovery message, hint, transport status, and edge status that were previously in `DashboardStatePanel`; other tabs keep existing content

**Checkpoint**: Dashboard shows one header bar with selects + Fit + Details. Canvas fills remaining space. No triple borders. Diagnostics opens with 4 tabs.

### Этап 4: Wheel-zoom navigation

- [X] T068 Add `onZoomAtCursor` prop (`(anchor: DashboardCanvasPoint, factor: number) => void`) to `DashboardVisualSurface` and attach `onWheel` handler to the Konva `Stage` that calls it with `stage.getPointerPosition()` and `factor = deltaY > 0 ? 0.9 : 1.1` in `client/src/features/dashboard/components/DashboardVisualSurface.tsx`
- [X] T069 Wire `onZoomAtCursor` callback in `DashboardRuntimeSurface` to `setViewport(current => zoomDashboardViewport(current, { factor, anchor }))`, remove all old zoom/pan/reset callbacks that were passed to `DashboardViewportControls`, and delete `client/src/features/dashboard/components/DashboardViewportControls.tsx`

**Checkpoint**: Scroll wheel zooms toward cursor position. Only Fit to View button remains. `viewport.ts` unchanged.

### Этап 5: Adaptive Stage size

- [X] T070 Replace the hardcoded `VISUAL_VIEWPORT_SIZE` constant (960×540) in `DashboardRuntimeSurface` with a `ResizeObserver`-based measurement of the canvas container div, pass the measured size as `viewportSize` to `DashboardVisualSurface`, and recalculate initial viewport via `createDashboardInitialViewport` on container resize in `client/src/features/dashboard/components/DashboardRuntimeSurface.tsx`

**Checkpoint**: Canvas fills the container. Resizing the browser window resizes the Stage.

### Этап 6: Test updates

- [X] T071 Update `client/tests/integration/DashboardVisualSurface.test.tsx` and `client/tests/integration/DashboardPage.test.tsx` to reflect UI changes from Этапов 3–5. **DashboardVisualSurface.test.tsx**: (1) remove all `findByRole('heading', { name: 'Dashboard Monitoring' })` assertions (heading removed in T064) at confirmed lines **73, 338** and any other occurrences; (2) remove or rewrite the «updates only viewport state» test block at lines **126–166**: remove `getByRole('button', { name: 'Zoom in' })` click (line 133), `getByRole('button', { name: 'Reset view' })` click (line 160), `getByRole('button', { name: 'Pan right' })` click (line 157), and all `getByText('Viewport: ...')` text assertions at lines **130, 134, 137, 155, 158, 161, 164** — `DashboardViewportControls` deleted in T069; keep the `getByRole('button', { name: 'Fit to view' })` click (line 163). **DashboardPage.test.tsx** — additional stale assertions from Этап 3 (StatePanel removed): (1) remove all `findByRole('heading', { name: 'Dashboard Monitoring' })` — every describe block has one at approximately lines **101, 130, 153, 173, 219, 254, 281, 307, 356, 413, 461, 487, 550, 566**; (2) `getByText('Transport: Connected')`, `getByText('Edge: Edge online')`, `getByText('Edge: Edge offline')`, `getByText('Transport: Reconnecting')` at lines **165–166, 231–232, 242–243** — Transport/Edge status moved to Diagnostics → Status tab; to preserve intent, open diagnostics first then assert inside `within(diagnosticsPanel)`; (3) `getByText('Transport reconnecting. Last rendered values are preserved.')` at lines **209, 245** — reconnect message now in Diagnostics Status tab; same fix: open Diagnostics first; (4) `getByText('Invalid dashboard selection.')` (line 110), `getByText('No saved binding profile for the selected Diagram + Edge pair.')` (line 283), `getByText('Saved binding profile references stale widget ids.')` (line 308), `getByText('Saved diagram visual layout cannot be rendered.')` (line 551), `getByText('Saved diagram rendered with recoverable visual issues.')` (line 568) — recovery text was in StatePanel; it now appears as short label in `RecoveryPlaceholder` inside canvas area **or** full message in Diagnostics Status tab; update assertions to match new wording/location; (5) `getByText('Select an edge server to start monitoring.')` (line 138) — also in StatePanel; update to match RecoveryPlaceholder text or open Diagnostics. **T070 note**: `ResizeObserver` in JSDOM reports 0×0 — mock or skip size-dependent assertions. Exit criterion: `npx vitest run tests/integration/DashboardVisualSurface.test.tsx tests/integration/DashboardPage.test.tsx` exits 0 with 0 failures
- [ ] T072 Manually verify wheel-zoom and adaptive resize in the browser — no automated tests required for these interactions (JSDOM limitation)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1: Setup** - no dependencies
- **Phase 2: Foundational** - depends on Phase 1 and blocks all user-story work
- **Phase 3: US1** - depends on Phase 2
- **Phase 4: US2** - depends on Phase 2 and the route shell from US1
- **Phase 5: US3** - depends on Phase 2 and reuses the page/runtime scaffolding from US1 and US2
- **Phase 6: US4** - depends on the runtime rendering behavior from US3
- **Phase 7: Polish** - depends on all selected user stories being complete
- **Phase 8: Visual Renderer Setup** - depends on completed Phase 7 and blocks visual follow-up work
- **Phase 9: US2 Visual Follow-up** - depends on Phase 8
- **Phase 10: US3 Visual Follow-up** - depends on Phase 9
- **Phase 11: US4 Visual Follow-up** - depends on Phase 9
- **Phase 12: Visual Polish** - depends on Phases 9, 10, and 11
- **Phase 13: Dashboard Visual Fix** - depends on Phase 12; internally sequential by stage (1→2→3→4→5→6)

### User Story Dependencies

- **US1 (P1)**: Starts immediately after Foundational because it defines the page shell, selection flow, and URL contract
- **US2 (P1)**: Starts after US1 page scaffolding exists so runtime state has a stable route and selection owner
- **US3 (P2)**: Starts after US1 and US2 because binding resolution plugs into the saved page context and live runtime session
- **US4 (P3)**: Starts after US3 because non-operative widget behavior depends on the final runtime surface
- **US2 Visual Follow-up (P1)**: Starts after the visual renderer setup and replaces the text-first primary surface
- **US3 Visual Follow-up (P2)**: Starts after the visual surface is wired through the production runtime path
- **US4 Visual Follow-up (P3)**: Starts after the visual renderer can display saved widgets

### Within Each User Story

- Tests must be written first and should fail before implementation begins
- Route/state helpers must exist before page wiring
- Validation and projection utilities must exist before runtime rendering
- Runtime rendering must exist before command-suppression polish
- Visual follow-up production wiring must be proven through `DashboardPage` or `DashboardRuntimeSurface`, not through helper-only or direct component-only paths
- Saved layout normalization must preserve authored geometry and report render issues before visual rendering consumes it
- Each story should be validated independently at its checkpoint before moving on

### Phase 13 Internal Order

- **Этап 1 (T058–T060)**: No UI dependency — data/model fix only. T058 and T059 can run in parallel.
- **Этап 2 (T061)**: No dependency on Этап 1. Can run in parallel with it.
- **Этап 3 (T062–T067)**: Depends on Этапы 1+2 being complete (easier to verify canvas after rendering is fixed). Within Этап 3: T062 and T063 can run in parallel; T064 depends on T063; T065 depends on T064; T066 depends on T064; T067 can run in parallel with T066.
- **Этап 4 (T068–T069)**: Depends on Этап 3 (header bar must exist for Fit button placement). T068 before T069.
- **Этап 5 (T070)**: Depends on Этап 3 (flex layout must exist). Can run in parallel with Этап 4.
- **Этап 6 (T071–T072)**: Depends on all previous этапы. T071 and T072 can run in parallel.

### Parallel Opportunities

- **Setup**: T002 and T003 can run in parallel after T001
- **Foundational**: T005, T006, T007, and T008 can run in parallel once T004 is complete
- **US1**: T011 and T012 can run in parallel before T013
- **US2**: T017 and T018 can run in parallel before T019
- **US3**: T020 and T021 can run in parallel; T023 and T024 can run in parallel before T025 and T026
- **US4**: T028 and T029 can run in parallel after T027
- **Polish**: T030 can run in parallel with final UX refinement in T031
- **Visual Renderer Setup**: T034, T035, T036, and T037 can run in parallel after T033
- **US2 Visual Follow-up**: T041, T042, and T043 target separate files but T044 must wait for them
- **US3 Visual Follow-up**: T046 can run before T047 and T048 once T045 defines the production proof path
- **Visual Polish**: T051 and T052 should run sequentially because both extend `client/tests/integration/DashboardPage.test.tsx`; T053 and T054 can proceed after T051, while T055 should wait for T052
- **Dashboard Visual Fix**: T058 and T059 in parallel; T061 in parallel with T058–T060; T066 and T067 in parallel; T068 before T069; T070 in parallel with T068–T069; T071 and T072 in parallel

---

## Parallel Example: User Story 1

```text
Task: "T011 [US1] Build Diagram and Edge selection controls in client/src/features/dashboard/components/DashboardToolbar.tsx"
Task: "T012 [US1] Build empty, loading, generic-error, and invalid-selection messaging in client/src/features/dashboard/components/DashboardStatePanel.tsx"
```

## Parallel Example: User Story 2

```text
Task: "T017 [US2] Add transport and edge-availability badges plus reconnect messaging in client/src/features/dashboard/components/DashboardStatePanel.tsx"
Task: "T018 [US2] Build the runtime surface shell with last-value preservation in client/src/features/dashboard/components/DashboardRuntimeSurface.tsx"
```

## Parallel Example: User Story 3

```text
Task: "T020 [US3] Add binding validation unit coverage in client/tests/unit/bindingValidation.test.ts"
Task: "T021 [US3] Add runtime projection unit coverage for number-display, text-display, and led in client/tests/unit/dashboardRuntimeProjection.test.ts"
```

## Parallel Example: User Story 4

```text
Task: "T028 [US4] Disable pointer and command behavior for unsupported runtime widgets in client/src/features/dashboard/components/DashboardRuntimeSurface.tsx"
Task: "T029 [US4] Restrict Dashboard transport behavior to subscribe-and-observe only in client/src/features/dashboard/services/cloudRuntimeClient.ts and client/src/features/dashboard/hooks/useDashboardRuntimeSession.ts"
```

## Parallel Example: Visual Renderer Setup

```text
Task: "T034 [P] Create constructor-shaped Dashboard visual layout fixtures with images, connection points, connections, number/text/led widgets, unsupported widgets, and damaged references in client/tests/fixtures/dashboardVisualLayout.ts"
Task: "T036 [P] Add saved-layout normalization tests that prove ids, coordinates, scale, connection references, segments, widget geometry, and render issues are preserved rather than rebuilt in client/tests/unit/dashboardRuntimeLayout.test.ts"
Task: "T037 [P] Add viewport tests for near-100% initial fit, large-diagram fit, pan, zoom, reset, and non-mutating saved layout behavior in client/tests/unit/dashboardViewport.test.ts"
```

## Parallel Example: Dashboard Visual Fix

```text
Task: "T058 [P] Extend DashboardSavedConnectionSegment with start/end fields in client/src/features/dashboard/model/types.ts"
Task: "T059 [P] Add start/end branch to resolveSegmentEndpointPair in client/src/features/dashboard/model/runtimeLayout.ts"
Task: "T061 Wrap KonvaImage in Group with Rect border in client/src/features/dashboard/components/DashboardVisualSurface.tsx"
```

---

## Implementation Strategy

### Suggested MVP Scope

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1
4. Validate the route shell, query sync, and diagram-first selection flow before expanding runtime behavior

### Incremental Delivery

1. Deliver US1 to establish a stable Dashboard entry point inside the SPA
2. Add US2 to make the selected context observably live and resilient to disconnects
3. Add US3 to make saved binding resolution and supported widget rendering production-ready
4. Add US4 to lock monitoring-only boundaries before release
5. Add the visual follow-up phases to replace text-first runtime output with the saved mnemonic diagram surface
6. Validate visual telemetry, viewport behavior, diagnostics, and render-issue recovery through production Dashboard integration tests
7. Apply Phase 13 visual fixes to bring the Dashboard layout, rendering, and navigation to production quality

### Parallel Team Strategy

1. One developer completes shared API and route-state plumbing while another prepares the mocked Socket.IO test harness
2. After Foundational is complete, UI work for toolbar/state panel/runtime surface can proceed in parallel
3. Binding validation and runtime projection can be split across separate owners before final Dashboard page integration
4. In the visual follow-up, one developer can own layout/viewport model tasks while another owns production integration proof tasks and renderer wiring

---

## Notes

- Total tasks: 72
- Original completed tasks: 32
- Visual follow-up tasks (Phase 8–12): 25
- Dashboard visual fix tasks (Phase 13): 15
- User story task counts before visual follow-up: US1 = 5, US2 = 5, US3 = 7, US4 = 3
- Visual follow-up user story task counts: US2 = 5, US3 = 4, US4 = 2
- Phase 13 tasks are cross-cutting visual fixes, not user-story scoped
- Parallelizable tasks before visual follow-up: 16
- Parallelizable visual follow-up tasks: 4
- Parallelizable Phase 13 tasks: 5 (T058, T059, T061, T066∥T067, T071∥T072)
- Deleted files in Phase 13: `DashboardToolbar.tsx` (T065), `DashboardViewportControls.tsx` (T069)
- Manual verification required: T072 (wheel-zoom and adaptive resize)
- All tasks follow the required checklist format with Task ID, optional `[P]`, and explicit file paths
