# Implementation Plan: Dashboard SPA Monitoring

**Branch**: `003-dashboard` | **Date**: 2026-03-23 | **Spec**: [specs/003-dashboard/spec.md](./spec.md)
**Input**: Feature specification from `specs/003-dashboard/spec.md`

## Summary

Implement Dashboard as a native authenticated User Hub feature in `client`, not as a standalone runtime app and not as work owned by `/dashboard`. The route remains User-only and denies Admin access before Dashboard data or runtime sessions start. The page will own route state, monitoring-context selection, recovery states, and runtime presentation; it will load only the last saved diagram revision plus the saved binding profile for the selected `diagramId + edgeId` pair from backend contracts, ignoring constructor-local drafts or unsaved editor state; and it will consume live cloud runtime signals through the existing Socket.IO contract (`subscribe`, `telemetry`, `edge_status`). The monitoring surface must render the saved mnemonic diagram visually rather than as a textual widget list: images, connection points, connections, and widgets are reproduced from the saved layout contract, telemetry is applied inside supported display widgets, and textual diagnostics remain collapsed secondary details. The first visual telemetry increment prioritizes `number-display` and `text-display`; `led` visual telemetry behavior remains a follow-up within the broader MVP widget scope.

## Technical Context

**Language/Version**: TypeScript 5.9, React 19  
**Primary Dependencies**: React Router 7, Zustand 5, Vite 7, Tailwind CSS 4, Vitest, React Testing Library, MSW, Socket.IO client, React Konva on top of Konva  
**Storage**: N/A in `client`; consumes saved diagram and binding documents from `cloud_server` plus live Socket.IO runtime signals  
**Testing**: Vitest (`vitest`), React Testing Library, MSW, mocked Socket.IO client sessions  
**Target Platform**: Browser SPA route inside `client` User Hub  
**Project Type**: Web SPA feature in a monorepo  
**Performance Goals**: Reach a valid monitored view within 15s from empty state; switch context within 2s under normal conditions; surface transport loss within 3s; never require full page reload for context changes; keep pan/zoom viewport interactions responsive for typical saved diagrams  
**Constraints**: No standalone dashboard bootstrap; no dependency on `/dashboard` or constructor internals; no client-side binding inference; User-only route with Admin denial before data load; route query sync via `diagramId` and `edgeId`; preserve last rendered values on transport disconnect; distinguish transport disconnect from edge offline; command execution and condition processing remain out of scope; render the saved visual layout from cloud contracts only; use a light diagram workspace/grid when saved diagram readability requires it while keeping the surrounding User Hub shell consistent  
**Scale/Scope**: One Dashboard feature slice and route in `client`, one cloud-aligned runtime transport adapter, one saved-layout visual renderer, viewport controls, collapsed diagnostics, and focused unit/integration coverage for page states, live updates, and visual rendering

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **Principle 1 (Role & Persona)**: Planning artifacts stay technical, explicit, and grounded in repository context.
- [x] **Principle 2 (Architectural Scope)**: Dashboard delivery stays SPA-native in `client`; `/dashboard` remains untouched as a separate module.
- [x] **Principle 3 (Strict Module Isolation)**: Runtime consumes only saved cloud contracts and Socket.IO events; visual rendering maps the saved diagram layout contract in `client` without direct imports from constructor or dashboard internals.
- [x] **Principle 4 (State Containment)**: Dashboard state belongs in React/Zustand feature state, not `window.*` or `global.*`.
- [x] **Principle 5 (Secrets)**: Runtime URLs and transport configuration stay environment-driven; JWT comes from the in-memory auth store.
- [x] **Principle 6 (Context Awareness)**: Decisions are based on root and `client` AGENTS files, the `003-dashboard` spec, constitution, and current `cloud_server` routes/socket implementation.
- [x] **Post-design re-check**: Phase 1 outputs keep the same boundaries and introduce no constitution violations.

## Project Structure

### Documentation (this feature)

```text
specs/003-dashboard/
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- contracts/
|   |-- openapi.yaml
|   |-- route-state.md
|   `-- runtime-signals.md
`-- tasks.md
```

### Source Code (repository root)

```text
client/
|-- src/
|   |-- app/
|   |   |-- routes.tsx
|   |   `-- userHubRoutes.tsx
|   |-- features/
|   |   |-- user-hub/
|   |   |   `-- pages/
|   |   |       `-- DashboardPage.tsx
|   |   `-- dashboard/
|   |       |-- components/
|   |       |   |-- DashboardToolbar.tsx
|   |       |   |-- DashboardStatePanel.tsx
|   |       |   |-- DashboardRuntimeSurface.tsx
|   |       |   |-- DashboardVisualSurface.tsx
|   |       |   |-- DashboardViewportControls.tsx
|   |       |   `-- DashboardDiagnosticsPanel.tsx
|   |       |-- hooks/
|   |       |   |-- useDashboardRouteState.ts
|   |       |   `-- useDashboardRuntimeSession.ts
|   |       |-- model/
|   |       |   |-- types.ts
|   |       |   |-- selectors.ts
|   |       |   |-- bindingValidation.ts
|   |       |   |-- runtimeLayout.ts
|   |       |   `-- viewport.ts
|   |       `-- services/
|   |           `-- cloudRuntimeClient.ts
|   `-- shared/
|       |-- api/
|       |   |-- diagrams.ts
|       |   |-- bindings.ts
|       |   `-- edgeServers.ts
|       `-- store/
|           `-- useAuthStore.ts
`-- tests/
    |-- integration/
    |   |-- DashboardPage.test.tsx
    |   `-- DashboardVisualSurface.test.tsx
    `-- unit/
        |-- bindingValidation.test.ts
        |-- dashboardRuntimeProjection.test.ts
        |-- dashboardRuntimeLayout.test.ts
        `-- dashboardViewport.test.ts
```

**Structure Decision**: Keep the route entry under `user-hub` for SPA ownership, but isolate Dashboard-specific state, parsing, validation, and runtime transport into a dedicated `client/src/features/dashboard` slice. Reuse existing `shared/api` modules for cloud contracts. Do not add new feature code under `/dashboard` or `/constructor`.

## Phase 0: Research Conclusions Applied

- Use the saved binding profiles already returned by `GET /api/diagrams/:id/bindings` to derive which edge servers are valid for a selected diagram.
- Treat `GET /api/diagrams/:id` and the selected binding profile as the only runtime configuration inputs.
- Replace raw WebSocket assumptions in the Dashboard path with the actual cloud Socket.IO contract and JWT handshake.
- Validate binding-profile `widgetId` references against the saved diagram snapshot before starting live runtime.
- Keep transport status and edge availability as separate UI signals.
- Use React Konva on top of Konva for the SPA-native visual renderer so Dashboard can map the saved layout contract to read-only canvas primitives without importing Constructor editor internals.
- Treat the saved layout sections (`images`, `connectionPoints`, `connections`, `widgets`) as the visual runtime contract for Dashboard rendering.
- Keep the workspace navigation model Dashboard-owned: pan, zoom in/out, fit-to-view, reset view, and a grid that moves and scales with the diagram workspace.
- Keep diagnostics secondary: a collapsed bottom overlay inside the Dashboard workspace exposes telemetry, bindings, and render issues without replacing the visual monitoring surface.

## Phase 1: Design Plan

### Route, selection, and page-state flow

1. Add `/hub/dashboard` as a concrete User Hub route in `client`.
2. Reuse the existing authenticated User Hub route protection and deny Admin access before Dashboard REST or runtime initialization begins.
3. Parse query params with diagram-first semantics:
   - no params -> empty Dashboard state
   - `diagramId` only -> diagram selected, edge selection pending
   - `diagramId + edgeId` -> full monitoring context if valid
   - `edgeId` without `diagramId`, inaccessible ids, or mismatched pair -> invalid-selection state
4. Load diagrams, trusted edge servers, and diagram binding profiles with existing REST contracts.
5. Filter edge options to the trusted edges that also have a saved binding profile for the selected diagram.
6. Sync user selection back into the browser URL without full page reload.

### Runtime resolution flow

1. When a valid full context exists, load the saved diagram document by `diagramId` from backend storage only.
2. Pick the saved binding profile for the same `diagramId + edgeId` pair from backend storage only.
3. Ignore constructor-local drafts, unsaved editor state, and any client-side inferred binding candidates.
4. Validate that every binding `widgetId` still exists in the saved diagram snapshot.
5. Build a runtime widget index from the saved diagram layout.
6. Start the cloud runtime session for the chosen edge only after saved-contract validation succeeds.

### Runtime presentation flow

1. Render the full saved diagram surface from the saved layout snapshot, not a textual widget list.
2. For supported widgets:
   - `number-display` uses the latest bound numeric/stringifiable value
   - `text-display` uses the latest bound value formatted as text
   - `led` remains visually rendered from the saved layout and is planned as a follow-up for live visual telemetry behavior
3. For future command-capable widgets:
   - keep the saved visual representation
   - disable pointer/command actions in MVP
   - do not design command transport or condition execution here
4. Reuse the established User Hub page chrome, status treatments, and recovery panels around the workspace, while allowing the diagram workspace itself to use the saved diagram's light canvas/grid visual treatment.
5. Keep the monitoring workspace grid aligned with the viewport transform so it pans and zooms with the diagram.
6. Keep the last successful values on screen during transport reconnect attempts.

### Visual runtime rendering flow

1. Normalize the saved layout into renderable sections: images, connection points, connections, and widgets.
2. Compute the diagram bounds from saved images, connection geometry, and widget geometry.
3. Initialize the Diagram Workspace Viewport with an intelligent fit: use near-100% scale when the diagram fits, otherwise fit the diagram into the available workspace.
4. Render the grid, images, connections, connection points, and widgets as read-only layers.
5. Render connection points in the same dark visual family as connections so they do not look like editable handles.
6. Apply telemetry patches only through saved `widgetId -> deviceId + metric` bindings.
7. Update `number-display` and `text-display` values inside their visual widgets in the first visual telemetry increment.
8. Keep unsupported widgets and future command widgets visible in their saved visual form but non-operative.

### Workspace and diagnostics flow

1. The Dashboard page keeps the User Hub sidebar/top shell; the Dashboard workspace consumes the remaining content area.
2. The Dashboard toolbar sits above the visual workspace and owns Diagram and Monitored Object selection plus viewport actions and `Details`.
3. Viewport controls support zoom in/out, fit-to-view, reset view, and drag-to-pan across the diagram workspace.
4. Diagnostics are delivered as a collapsed bottom overlay within the Dashboard workspace.
5. The diagnostics panel uses the dark-gray User Hub surface language and exposes a small centered light handle strip while collapsed.
6. The panel opens from either the handle strip or the `Details` toolbar action.
7. Expanded diagnostics have bounded height with internal scrolling and group content by telemetry values, bindings, and visual-rendering issues without requiring tabbed navigation in the first increment.

### Runtime signal handling

1. Connect with Socket.IO client to the cloud default namespace using the in-memory JWT from `useAuthStore`.
2. Emit `subscribe { edgeId }` after connect.
3. Listen for:
   - `telemetry`: update latest values for bound `deviceId + metric` pairs
   - `edge_status`: update edge availability separately from transport state
   - socket disconnect/reconnect events: drive reconnect messaging and stale/live badges
4. On context switch, dispose the previous runtime session and attach only the new one.

### Recovery-state design

- `empty`: no usable context selected yet; explain the Diagram -> Edge flow.
- `loading`: REST contracts or runtime initialization in progress.
- `generic-error`: non-recoverable fetch/init failure with retry action.
- `invalid-selection`: ids missing, inaccessible, or incompatible with saved bindings.
- `missing-binding-profile`: selected diagram has no saved binding profile for the chosen edge.
- `invalid-binding-profile`: saved profile references stale widget ids after diagram changes.
- `transport-disconnect`: Socket.IO session lost; last rendered values stay visible while reconnecting.
- `edge-offline`: cloud runtime marks the selected edge unavailable/offline.
- `visual-rendering-error`: saved layout cannot be rendered as a visual monitoring surface.
- `partial-visual-rendering`: recoverable layout elements render while diagnostics explain omitted or damaged elements.

### Testing plan

- Integration tests for route-prefill, invalid query recovery, Admin access denial, diagram-first selection flow, URL sync, missing-binding-profile state, invalid-binding-profile state, saved-only runtime-source behavior, visual monitoring surface rendering, and full monitoring happy path.
- Unit tests for binding-profile validation, telemetry-to-widget projection, saved layout normalization, and viewport bounds/transform behavior.
- Runtime-session tests with mocked Socket.IO client behavior for `telemetry`, `edge_status`, reconnect, context switch cleanup, and last-value preservation.
- Visual renderer tests for images, connections, connection points, widget geometry, number/text telemetry updates, unsupported widget visibility, pan/zoom/fit/reset controls, and the rule that textual diagnostics cannot replace the primary monitoring surface.
- Diagnostics tests for collapsed-by-default behavior, handle/Details open paths, bounded internal scrolling, and grouped telemetry/binding/render-issue content.
- Quickstart-aligned acceptance validation for timing goals: monitored view within 15s from empty state, context switch within 2s, disconnect visibility within 3s, and URL query sync within 1s.

## Complexity Tracking

No constitution violations or exception justifications are required for this plan.
