# Tasks: Dispatch Workspace Shell Onboarding Slice

**Input**: `doc_cursed/dispatch_onboarding_slice_draft.md`, `doc_cursed/monitoring_workspace_routing_draft.md`, `doc_cursed/cloud_client_control_plan.md`, `doc_cursed/alarms_plan.md`, `doc_cursed/alarm_incident_journal_api_plan.md`, current User Hub routing, current Dashboard runtime, and relevant completed Dashboard/control/alarm slice plans.

**Prerequisites**: Existing User Hub shell and auth guard, existing Dashboard runtime page, existing Dashboard route query handling, existing Client shared API helpers for diagrams, bindings, Edge servers/catalogs, commands, and alarm incidents.

**Tests**: Lean Testing Policy applies. Add one focused Dispatch workspace integration proof for route/context/action-slot behavior and at most one critical negative proof for stale previous-edge runtime/action state. Do not add broad table-driven tests for every placeholder tab, query permutation, visual class, or copy variant.

**Organization**: This document is the detailed slice implementation plan. It intentionally does not include implementation batches.

**Planning note**: The speckit prerequisite script was attempted during planning and was blocked by local PowerShell Execution Policy. This does not block this slice plan because the user provided the target slice file and full scope.

**Current review status**: Implementation tasks and Technical Lead Review are closed. Manual browser smoke remains `PARTIAL`: post-fix browser verification of the Dashboard runtime height, Alarm Journal internal scrolling, `Details` overlay, Edge-switch cleanup, and placeholder action cleanup still needs to be repeated before claiming full manual PASS.

## Purpose

This slice MUST introduce the first Dispatch workspace shell inside User Hub.

The slice MUST move the current standalone Dashboard entry into a route-addressable Dispatch workspace while preserving current Dashboard runtime semantics.

The Dispatch shell MUST own shared operational context, route/tab structure, the context bar, and the active-subtab action slot. The Dashboard subtab MUST continue to own runtime behavior.

## Source Of Truth

- Dispatch shell and context ownership: `doc_cursed/dispatch_onboarding_slice_draft.md`.
- Dispatch route grouping and future subtab model: `doc_cursed/monitoring_workspace_routing_draft.md`.
- Dashboard command behavior: `doc_cursed/cloud_client_control_plan.md`.
- Alarm lifecycle and red-light semantics: `doc_cursed/alarms_plan.md`.
- Alarm incident list and compact journal contract: `doc_cursed/alarm_incident_journal_api_plan.md`.

## Scope

- MUST add the first Dispatch workspace shell under the existing User Hub shell.
- MUST add route support for `/hub/dispatch`, `/hub/dispatch/dashboard`, `/hub/dispatch/telemetry`, `/hub/dispatch/commands`, `/hub/dispatch/trends`, and `/hub/dispatch/alarms`.
- MUST make `/hub/dispatch` resolve to the Dashboard subtab.
- MUST keep `/hub/dashboard` as a compatibility route that safely reaches `/hub/dispatch/dashboard` while preserving `diagramId` and `edgeId` query parameters.
- MUST replace the User Hub sidebar operational entry with `Dispatch`.
- MUST update user-facing Dashboard entry points, including Gallery open actions, to navigate to `/hub/dispatch/dashboard`.
- MUST extract shared context loading and selectors from the current Dashboard page into a Dispatch-owned route boundary without changing Dashboard runtime semantics.
- MUST render one shared context bar with `Diagram` and `Edge Server` selectors, selected-context status, loading/error indication, and active-subtab action slot.
- MUST remove duplicate shared `Diagram` and `Edge Server` selectors from the Dashboard runtime surface.
- MUST let the active subtab provide the right-side action slot.
- MUST keep Dashboard action slot behavior meaningful for red-light alarm count, `Fit to view`, and `Details`.
- MUST keep Dashboard as the only fully implemented Dispatch subtab in this slice.
- MUST render explicit placeholders for Telemetry, Commands, Trends, and Alarms tabs.
- MUST preserve current Dashboard runtime behavior for visual rendering, telemetry, commands, alarm journal, red-light/toast, diagnostics, reconnect, and edge switching.

## Out Of Scope

- MUST NOT implement a live telemetry table.
- MUST NOT implement Trends chart or historical telemetry table.
- MUST NOT implement Command Audit table or API.
- MUST NOT implement expanded Alarm Journal table.
- MUST NOT add new Cloud API, Cloud storage, CommandAudit, alarm lifecycle, or telemetry history behavior.
- MUST NOT change Edge runtime, Edge YAML, alarm detection, command execution, or hardware contracts.
- MUST NOT change Constructor authoring behavior.
- MUST NOT add Presence Lock, multi-edge analytics, exports, reports, or broad filtering.
- MUST NOT change Dashboard command semantics or apply optimistic physical-state updates.
- MUST NOT introduce persisted client selection storage for Dispatch context.

## Current Code Facts

- Current User Hub routes expose `/hub/dashboard` directly through `client/src/app/userHubRoutes.tsx`.
- Current User Hub sidebar exposes `Dashboard` in `client/src/features/user-hub/UserHubLayout.tsx`.
- Current Gallery open action navigates to `/hub/dashboard?diagramId=...&edgeId=...`.
- Current `DashboardPage` owns shared context loading, selected context, saved diagram loading, catalog loading, runtime session wiring, command lifecycle, diagnostics state, and Dashboard surface props.
- Current `DashboardRuntimeSurface` renders the shared `Diagram` and `Edge Server` selectors in its inline header together with Dashboard-only red-light, `Fit to view`, and `Details` actions.
- Current `useDashboardRouteState` already treats `diagramId` and `edgeId` as the route-prefill contract and resets `edgeId` on diagram change unless a replacement is provided.
- Current `useDashboardRuntimeSession` scopes telemetry, alarm incident state, ACK state, and socket state to the selected `edgeId`.
- Current Client API helpers already cover diagrams, bindings, assigned Edge servers, Edge catalogs, commands, and alarm incidents.

## Constraints

- MUST keep this slice Client-only.
- MUST NOT change Cloud, Edge, Constructor, auth/RBAC, or hardware contracts.
- MUST keep Dashboard as a native SPA feature under `client`.
- MUST keep Dashboard runtime source of truth as saved diagram revision plus saved binding profile for `diagramId + edgeId`.
- MUST keep route query parameters `diagramId` and `edgeId` as the only route-prefill contract for context selection.
- MUST NOT add persisted selection storage.
- MUST NOT infer bindings, commands, alarm state, or widget behavior from labels, diagram geometry, telemetry history, Edge YAML, or raw Edge config.
- MUST keep command widget visual state telemetry-driven from reported metrics.
- MUST NOT let command HTTP results mutate physical widget state.
- MUST preserve last rendered telemetry values during transport reconnect.
- MUST isolate telemetry, command lifecycle, alarm rows, red-light/toast state, and socket session when selected Edge changes.
- MUST keep `/hub/dispatch/*` under the existing `/hub` auth guard.
- MUST NOT introduce `window.*` or `global.*` application state.
- SHOULD keep shared context in route/component-local React state unless implementation proves a feature-local Zustand store is necessary.
- MUST implement the action slot through safe React composition, render props, or feature-local context without global state.
- MUST clear active-subtab action slot controls when the active tab changes, Dashboard unmounts, selected context becomes invalid, or a placeholder tab becomes active.
- MUST ensure `/hub/dashboard` compatibility handling does not mount a second Dashboard runtime session.
- MUST ensure Dispatch shared context loading ignores stale async responses after selected `diagramId` or `edgeId` changes.
- MUST ensure placeholder tabs do not start Dashboard runtime sessions.
- MUST ensure placeholder tabs do not call new telemetry, history, audit, trends, or expanded alarm APIs.
- MUST ensure placeholder tabs do not imply that their future surfaces are implemented.
- MUST ensure the placeholder `Alarms` tab does not render the expanded Alarm Journal and does not present the compact Dashboard operational journal as the implemented Alarm Journal tab.
- MUST apply Lean Testing Policy: automated proof MUST cover the main Dispatch routing/context happy path and at most one critical negative scenario for stale previous-edge runtime/alarm/command leakage. Tests MUST NOT expand into broad table-driven coverage for every tab, query parameter, placeholder copy, or visual class.

## Assumptions

- `specs/012-dispatch/slices/plan_dispatch_workspace_shell_onboarding_slice.md` is the accepted target path.
- A new `client/src/features/dispatch` feature folder MAY be introduced.
- `/hub/dashboard` SHOULD redirect or otherwise safely resolve to `/hub/dispatch/dashboard` while preserving `diagramId` and `edgeId`.
- Gallery `Open Dashboard` actions SHOULD move to `/hub/dispatch/dashboard?...`.
- Existing internal component names MAY continue to use `Dashboard` to avoid unnecessary churn.
- Dispatch placeholders MAY show both selected `Diagram` and selected `Edge Server` for MVP consistency even when future subtabs might operate from `edgeId` alone.
- Dispatch shared context can stay in route/component-local React state unless implementation proves a feature-local Zustand store is necessary.

## Runtime Flow

1. A USER opens `/hub/dispatch`, `/hub/dispatch/dashboard`, or `/hub/dashboard`.
2. The existing `/hub` auth guard protects the route.
3. `/hub/dispatch` resolves to the Dashboard subtab.
4. `/hub/dashboard` preserves query parameters and safely reaches the same Dashboard subtab experience before any duplicate Dashboard runtime session starts.
5. User Hub renders the existing top bar and sidebar.
6. Dispatch shell renders below User Hub and loads shared context for diagrams, assigned active Edge servers, binding profiles for the selected diagram, allowed Edge options, selected Edge, and selected Edge catalog/cache status when needed by Dashboard.
7. Dispatch context bar renders one `Diagram` selector, one `Edge Server` selector, selected-context status, loading/error state, and the active-subtab action slot.
8. Dashboard subtab receives the selected context and shared context data from the Dispatch route boundary.
9. Dashboard starts the runtime session only when `diagramId`, `edgeId`, selected binding profile, and saved diagram are valid.
10. Dashboard renders the saved diagram runtime surface and contributes red-light count, `Fit to view`, and `Details` to the Dispatch action slot.
11. Non-Dashboard Dispatch tabs render explicit placeholders tied to the selected context and do not start a runtime session.

## Format: `[ID] [P?] [Story?] Description`

- `[P]` means the task can run in parallel because it touches different files and does not depend on incomplete tasks.
- `[US1]` maps to route onboarding, navigation, and placeholder subtabs.
- `[US2]` maps to shared Dispatch context and Dashboard runtime preservation.
- `[US3]` maps to Dashboard action slot integration and stale-state cleanup.
- Every task includes the file path that owns the change or proof.

## Phase 1: Setup

**Purpose**: Establish Dispatch feature anchors and route vocabulary before refactoring Dashboard ownership.

- [X] T001 Create Dispatch route/tab vocabulary for `dashboard`, `telemetry`, `commands`, `trends`, and `alarms` in `client/src/features/dispatch/model/routes.ts`.
- [X] T002 [P] Add Dispatch shared context and action-slot type definitions in `client/src/features/dispatch/model/types.ts`.
- [X] T003 [P] Add Dispatch workspace test harness helpers that reuse existing Dashboard REST and runtime socket fixtures in `client/tests/integration/helpers/dispatchWorkspaceHarness.tsx`.

**Checkpoint**: Dispatch has stable type and route anchors without changing User Hub or Dashboard behavior.

---

## Phase 2: Foundational Dispatch Context And Slot Primitives

**Purpose**: Build shared context, route-state, tab, and slot primitives that block every user-facing story.

- [X] T004 Create `useDispatchRouteState` that preserves current `diagramId`/`edgeId` query behavior, including edge reset on diagram change and invalid edge-only query handling, in `client/src/features/dispatch/hooks/useDispatchRouteState.ts`.
- [X] T005 Create shared context selector helpers for selected diagram, selected saved diagram, selected binding profile, allowed Edge options, selected Edge, selected catalog status, and recovery state inputs in `client/src/features/dispatch/model/context.ts`.
- [X] T006 Implement `useDispatchWorkspaceContext` with diagram loading, active assigned Edge loading, binding profile loading, Dashboard-only saved diagram/catalog loading, error states, and stale async response guards in `client/src/features/dispatch/hooks/useDispatchWorkspaceContext.ts`.
- [X] T007 Create `DispatchActionSlotProvider` or equivalent feature-local slot primitive that supports active-tab action registration and clears actions on tab/context unmount in `client/src/features/dispatch/components/DispatchActionSlot.tsx`.
- [X] T008 [P] Create route-addressable `DispatchTabs` component that maps routes to tab ids without starting subtab runtime behavior in `client/src/features/dispatch/components/DispatchTabs.tsx`.
- [X] T009 [P] Create `DispatchContextBar` with `Diagram` selector, `Edge Server` selector, selected-context status, loading/error indicator, and action-slot render area in `client/src/features/dispatch/components/DispatchContextBar.tsx`.
- [X] T010 [P] Create `DispatchPlaceholderTab` that renders selected context for Telemetry, Commands, Trends, and Alarms without runtime sessions or feature-complete claims in `client/src/features/dispatch/components/DispatchPlaceholderTab.tsx`.

**Checkpoint**: Dispatch can own route state, shared context, context bar, tabs, placeholders, and action slot before Dashboard is integrated.

---

## Phase 3: User Story 1 - Route And Shell Onboarding (Priority: P1)

**Goal**: A USER enters Dispatch through canonical routes, sees the Dispatch shell and route-addressable subtabs, and legacy Dashboard links continue to land on the Dashboard subtab with query parameters preserved.

**Independent Test**: Mount User Hub routes, open `/hub/dispatch`, `/hub/dispatch/dashboard?diagramId=...&edgeId=...`, and `/hub/dashboard?diagramId=...&edgeId=...`; verify canonical Dashboard route behavior, sidebar entry, tabs, query preservation, and no duplicate Dashboard runtime session.

### Tests For User Story 1

- [X] T011 [US1] Add focused Dispatch routing integration proof for `/hub/dispatch`, `/hub/dispatch/dashboard?...`, `/hub/dashboard?...`, sidebar `Dispatch`, route-addressable tabs, query preservation, and one Dashboard runtime session in `client/tests/integration/DispatchWorkspacePage.test.tsx`.

### Implementation For User Story 1

- [X] T012 [US1] Add `DispatchWorkspacePage` route container that resolves `/hub/dispatch` to Dashboard and renders active tabs below User Hub in `client/src/features/dispatch/pages/DispatchWorkspacePage.tsx`.
- [X] T013 [US1] Register `/hub/dispatch/*` and `/hub/dashboard` compatibility handling under the existing User Hub route tree in `client/src/app/userHubRoutes.tsx`.
- [X] T014 [US1] Replace the User Hub sidebar operational entry from `Dashboard` to `Dispatch` and point it to `/hub/dispatch` in `client/src/features/user-hub/UserHubLayout.tsx`.
- [X] T015 [US1] Update Gallery `Open Dashboard` navigation to `/hub/dispatch/dashboard?diagramId=...&edgeId=...` in `client/src/features/user-hub/pages/GalleryPage.tsx`.
- [X] T016 [US1] Wire Telemetry, Commands, Trends, and Alarms placeholder routes to `DispatchPlaceholderTab` with selected context and no runtime startup in `client/src/features/dispatch/pages/DispatchWorkspacePage.tsx`.

**Checkpoint**: Dispatch route shell exists, canonical navigation points at Dispatch, and legacy Dashboard URLs remain compatible.

---

## Phase 4: User Story 2 - Shared Context Bar And Dashboard Runtime Preservation (Priority: P1)

**Goal**: Dispatch owns shared Diagram/Edge context and the Dashboard subtab preserves the existing runtime behavior without duplicate shared selectors.

**Independent Test**: Open Dispatch Dashboard with a valid `diagramId + edgeId`; verify one Diagram selector and one Edge selector in the Dispatch context bar, no duplicate selectors in the Dashboard runtime surface, visual surface renders, and runtime session starts for the selected Edge.

### Tests For User Story 2

- [X] T017 [US2] Extend focused Dispatch integration proof to verify one shared `Diagram` selector, one shared `Edge Server` selector, no duplicate Dashboard surface selectors, valid visual surface render, and selected Edge runtime startup in `client/tests/integration/DispatchWorkspacePage.test.tsx`.

### Implementation For User Story 2

- [X] T018 [US2] Extract shared context loading, selected context, edge options, selected binding profile, Dashboard-only saved diagram/catalog loading, and recovery inputs from `DashboardPage` into `useDispatchWorkspaceContext` in `client/src/features/dispatch/hooks/useDispatchWorkspaceContext.ts`.
- [X] T019 [US2] Create Dashboard subtab component that receives Dispatch-owned context props while retaining runtime session, command lifecycle, diagnostics state, command commit handling, and runtime projection locally in `client/src/features/dashboard/components/DashboardDispatchSubtab.tsx`.
- [X] T020 [US2] Remove direct `/hub/dashboard` Dashboard runtime mounting from the route flow, keeping `DashboardPage` only as a compatibility wrapper if it remains imported, in `client/src/features/user-hub/pages/DashboardPage.tsx`.
- [X] T021 [US2] Update `DashboardRuntimeSurfaceProps` so shared selector props are no longer required and Dashboard-specific runtime props remain intact in `client/src/features/dashboard/components/DashboardRuntimeSurface.tsx`.
- [X] T022 [US2] Remove the inline `Diagram` and `Edge Server` selector rendering from `DashboardRuntimeSurface` while preserving recovery placeholder, visual surface, alarm journal, toast, diagnostics, reconnect messaging, and runtime layout behavior in `client/src/features/dashboard/components/DashboardRuntimeSurface.tsx`.
- [X] T023 [US2] Wire Dispatch context bar selector changes to `useDispatchRouteState` so diagram changes reset Edge unless a valid replacement is provided in `client/src/features/dispatch/components/DispatchContextBar.tsx`.
- [X] T024 [US2] Ensure stale binding, Dashboard-only saved diagram, Dashboard-only Edge catalog, and bootstrap responses cannot update the active Dispatch context after selected `diagramId`, `edgeId`, or active subtab changes in `client/src/features/dispatch/hooks/useDispatchWorkspaceContext.ts`.

**Checkpoint**: Shared context is Dispatch-owned, Dashboard runtime remains Dashboard-owned, and duplicate selectors are removed.

---

## Phase 5: User Story 3 - Dashboard Action Slot And State Isolation (Priority: P1)

**Goal**: Dashboard contributes red-light count, `Fit to view`, and `Details` to the Dispatch context bar action slot, and those actions never leak into placeholder tabs or stale contexts.

**Independent Test**: Open Dispatch Dashboard, emit an unclosed incident, verify red-light appears in the Dispatch action slot, use `Fit to view` and `Details`, switch to a placeholder tab and verify Dashboard actions clear, return to Dashboard and verify actions restore for the active context.

### Tests For User Story 3

- [X] T025 [US3] Add one critical stale-state Dispatch proof as a single user flow for Edge switch plus tab switch: previous-edge red-light/action state clears, old runtime session is disposed, placeholder tab shows no Dashboard actions, and returning to Dashboard restores active-context actions in `client/tests/integration/DispatchWorkspacePage.test.tsx`.

### Implementation For User Story 3

- [X] T026 [US3] Move Dashboard red-light indicator, `Fit to view`, and `Details` rendering from the Dashboard inline header into Dashboard-owned action-slot registration in `client/src/features/dashboard/components/DashboardDispatchSubtab.tsx`.
- [X] T027 [US3] Expose Dashboard `Fit to view` through runtime-owned callback registration so it stays bound to current `runtimeLayout` and `containerSize` without moving viewport state out of `client/src/features/dashboard/components/DashboardRuntimeSurface.tsx`.
- [X] T028 [US3] Expose Dashboard diagnostics toggle state to the action-slot registration without moving diagnostics state out of Dashboard subtab ownership in `client/src/features/dashboard/components/DashboardDispatchSubtab.tsx`.
- [X] T029 [US3] Ensure red-light count remains derived from active-edge known unclosed alarm projections and clears on Edge switch through existing Dashboard runtime state boundaries in `client/src/features/dashboard/components/DashboardDispatchSubtab.tsx`.
- [X] T030 [US3] Ensure `DispatchActionSlot` clears Dashboard actions on Dashboard unmount, invalid context, and placeholder tab activation in `client/src/features/dispatch/components/DispatchActionSlot.tsx`.
- [X] T031 [US3] Ensure placeholder tabs do not call Dashboard runtime hooks, alarm incident list helpers, telemetry history helpers, command audit helpers, or trends helpers in `client/src/features/dispatch/components/DispatchPlaceholderTab.tsx`.

**Checkpoint**: Dashboard-specific controls live in the Dispatch action slot only while Dashboard is active, and stale action/runtime state does not leak across tabs or Edge changes.

---

## Phase 6: Verification, Manual Smoke, And Review

**Purpose**: Verify the Client-only shell refactor without expanding into Cloud, Edge, Constructor, or future Dispatch subtabs.

- [X] T032 Inspect `client/src/features/dispatch` and verify shared context, route shell, context bar, tabs, placeholders, and action slot do not use `window.*` or `global.*` state.
- [X] T033 Inspect `client/src/features/dashboard/components/DashboardDispatchSubtab.tsx` and `client/src/features/dashboard/components/DashboardRuntimeSurface.tsx` to verify Dashboard still owns runtime session, command lifecycle, viewport, diagnostics, red-light/toast, and alarm journal behavior.
- [X] T034 Inspect `client/src/features/dispatch/components/DispatchPlaceholderTab.tsx` and verify placeholders do not import Dashboard runtime hooks, telemetry history helpers, command audit helpers, trends helpers, or expanded alarm journal components.
- [X] T035 Inspect `client/src/app/userHubRoutes.tsx`, `client/src/features/user-hub/UserHubLayout.tsx`, and `client/src/features/user-hub/pages/GalleryPage.tsx` to verify route compatibility, canonical Dispatch navigation, and `/hub` auth guard preservation.
- [X] T036 Update existing Dashboard integration expectations to preserve legacy compatibility coverage and remove stale direct-runtime `/hub/dashboard` assumptions in `client/tests/integration/DashboardPage.test.tsx`.
- [X] T037 Run focused Dispatch workspace tests from `client`: `cmd /c npm run test -- DispatchWorkspacePage`.
- [X] T038 Run focused existing Dashboard page regression tests from `client`: `cmd /c npm run test -- DashboardPage`.
- [X] T039 Run focused runtime hook regression tests from `client`: `cmd /c npm run test -- useDashboardRuntimeSession`.
- [X] T040 Run Client build from `client`: `cmd /c npm run build`.
- [X] T041 Add automated proof notes for route compatibility, one runtime session, context selector ownership, no duplicate selectors, action-slot cleanup, placeholder no-runtime behavior, Edge switch isolation, and Lean Testing boundaries in `specs/012-dispatch/slices/plan_dispatch_workspace_shell_onboarding_slice.md`.
- [X] T042 Add manual browser smoke notes for navigation, route refresh, Gallery open action, context bar, Dashboard action slot, placeholder tabs, compatibility route, Edge switch isolation, and Dashboard runtime preservation in `specs/012-dispatch/slices/plan_dispatch_workspace_shell_onboarding_slice.md`.
- [X] T043 Complete Technical Lead Review for scope leakage, Client/Cloud/Edge/Constructor boundaries, action-slot stale state, async context stale responses, one runtime session, placeholder honesty, acceptance coverage, and Lean Testing Policy in `specs/012-dispatch/slices/plan_dispatch_workspace_shell_onboarding_slice.md`.

---

## Dependencies And Execution Order

### Phase Dependencies

- Phase 1 has no production dependency and establishes Dispatch planning/code anchors.
- Phase 2 depends on Phase 1 route/type vocabulary and blocks every user story.
- Phase 3 depends on Phase 2 tabs, placeholders, and route-state primitives.
- Phase 4 depends on Phase 2 shared context primitives and Phase 3 route shell.
- Phase 5 depends on Phase 4 Dashboard subtab extraction and Phase 2 action-slot primitive.
- Phase 6 depends on implementation and proof tasks from Phases 1-5.

### Task Dependencies

- T004 depends on T001 because route-state helpers should use the Dispatch route/query vocabulary.
- T005 and T006 depend on T002.
- T007 depends on T002.
- T008 and T010 depend on T001.
- T009 depends on T002 and T007.
- T011 depends on T003 and passes only after T012-T016.
- T012 depends on T004, T007, T008, T009, and T010.
- T013 depends on T012.
- T014 and T015 can follow T013 or run once the canonical route is fixed.
- T016 depends on T010 and T012.
- T017 depends on T011 and passes only after T018-T024.
- T018 depends on T005 and T006.
- T019 depends on T018 and the current Dashboard runtime code.
- T020 depends on T013 and T019.
- T021 and T022 depend on T019.
- T023 depends on T004, T009, and T018.
- T024 depends on T006 and T018.
- T025 depends on T017 and passes only after T026-T031.
- T026 depends on T007, T019, and T022.
- T027 depends on T026 and the current viewport code in `DashboardRuntimeSurface`.
- T028 depends on T026 and Dashboard diagnostics state.
- T029 depends on T019 and current alarm incident/red-light behavior.
- T030 depends on T007 and T026.
- T031 depends on T010 and T016.
- T032-T043 depend on implementation completion.

## Parallel Opportunities

- T002 and T003 can run in parallel after T001 is understood because they touch separate type and test helper files.
- T005, T007, T008, T009, and T010 can run in parallel after T001-T002 because they target separate Dispatch model/component files.
- T014 and T015 can run in parallel after T013 because sidebar and Gallery are separate files.
- T021 and T022 should be sequenced by one owner because both modify `DashboardRuntimeSurface.tsx`.
- T026-T029 should be sequenced by one owner because they share Dashboard action-slot wiring and Dashboard-local state.
- T032-T036 can run in parallel with verification commands after implementation is complete.
- T037-T039 can run in parallel if local Vitest cache and test isolation remain stable.

## Parallel Example: Shell Primitives

```text
Task: "Create route-addressable `DispatchTabs` component that maps routes to tab ids without starting subtab runtime behavior in `client/src/features/dispatch/components/DispatchTabs.tsx`"
Task: "Create `DispatchContextBar` with `Diagram` selector, `Edge Server` selector, selected-context status, loading/error indicator, and action-slot render area in `client/src/features/dispatch/components/DispatchContextBar.tsx`"
Task: "Create `DispatchPlaceholderTab` that renders selected context for Telemetry, Commands, Trends, and Alarms without runtime sessions or feature-complete claims in `client/src/features/dispatch/components/DispatchPlaceholderTab.tsx`"
```

## Parallel Example: Verification

```text
Task: "Inspect `client/src/features/dispatch/components/DispatchPlaceholderTab.tsx` and verify placeholders do not import Dashboard runtime hooks, telemetry history helpers, command audit helpers, trends helpers, or expanded alarm journal components"
Task: "Run focused Dispatch workspace tests from `client`: `cmd /c npm run test -- DispatchWorkspacePage`"
Task: "Run focused existing Dashboard page regression tests from `client`: `cmd /c npm run test -- DashboardPage`"
```

## Implementation Strategy

### MVP First

1. Complete Phase 1 and Phase 2 to establish Dispatch route, context, tab, placeholder, and slot primitives.
2. Complete Phase 3 to land canonical routing and compatibility route behavior.
3. Complete Phase 4 to move shared context ownership while preserving Dashboard runtime behavior.
4. Complete Phase 5 to move Dashboard-specific actions into the Dispatch action slot and close stale-state risks.
5. Complete Phase 6 verification and Technical Lead Review.

### Boundary Bias

- Keep route/query semantics stable before moving Dashboard internals.
- Prefer extracting shared context out of `DashboardPage` over rewriting runtime hooks.
- Keep Dashboard runtime state local to the Dashboard subtab.
- Keep action-slot composition explicit and easy to inspect.
- Keep placeholders honest and inert.
- Do not add Cloud, Edge, Constructor, auth, or hardware work to close Client routing acceptance.

## Acceptance Checks

- User Hub navigation shows `Dispatch` as the operational workspace entry.
- `/hub/dispatch` opens the Dashboard subtab.
- `/hub/dispatch/dashboard?diagramId=...&edgeId=...` preserves selected context.
- `/hub/dashboard?diagramId=...&edgeId=...` reaches the same Dashboard subtab experience and preserves query parameters.
- Legacy `/hub/dashboard?...` and canonical `/hub/dispatch/dashboard?...` paths result in one active Dashboard runtime session for the selected `edgeId`.
- Gallery opens Dashboard through the canonical Dispatch Dashboard route.
- Dispatch tabs are route-addressable for Dashboard, Telemetry, Commands, Trends, and Alarms.
- Dispatch context bar contains exactly one `Diagram` selector and one `Edge Server` selector.
- Dashboard runtime surface no longer renders duplicate shared selectors.
- Dashboard action slot shows red-light alarm count when known unclosed incidents exist.
- Dashboard action slot exposes `Fit to view`, and it affects the current Dashboard viewport as before.
- Dashboard action slot exposes `Details`, and it toggles the current Dashboard diagnostics panel as before.
- Switching from Dashboard to any placeholder tab clears Dashboard-specific action slot controls.
- Returning from a placeholder tab to Dashboard restores Dashboard-specific action slot controls for the active Dashboard context.
- Dashboard still renders the saved visual surface for a valid `diagramId + edgeId`.
- Dashboard still starts runtime session only for the selected valid `edgeId`.
- Dashboard still preserves telemetry, command execution, command lifecycle, alarm journal, red-light/toast, diagnostics, reconnect, and visual recovery behavior.
- Changing selected diagram resets or revalidates selected Edge.
- Changing selected Edge starts a clean runtime context and does not leak previous-edge telemetry, command lifecycle, alarm rows, red-light/toast state, or socket state.
- Telemetry, Commands, Trends, and Alarms placeholder tabs render selected context and clearly remain placeholders.
- Placeholder tabs do not start runtime sessions and do not call new telemetry/history/audit/trends APIs.
- No Cloud, Edge, Constructor, auth/RBAC, or hardware contract changes are required.

## Manual And Runtime Smoke

Manual browser smoke SHOULD cover:

1. Open `/hub/dispatch` and verify the Dashboard subtab is active.
2. Open `/hub/dispatch/dashboard?diagramId=:diagramId&edgeId=:edgeId` and verify the selected context is restored.
3. Open `/hub/dashboard?diagramId=:diagramId&edgeId=:edgeId` and verify compatibility behavior preserves the same context.
4. Open Dashboard from Gallery and verify the canonical Dispatch Dashboard URL is used.
5. Verify the sidebar shows `Dispatch`.
6. Verify the context bar has one `Diagram` selector and one `Edge Server` selector.
7. Verify Dashboard visual surface has no duplicate shared selectors.
8. Verify `Fit to view`, `Details`, red-light count, alarm journal, command controls, reconnect messaging, and telemetry rendering still behave as before.
9. Switch selected Edge and verify previous-edge telemetry, alarm rows, command lifecycle, toast state, and socket state do not leak.
10. Visit Telemetry, Commands, Trends, and Alarms tabs and verify each shows a selected-context placeholder without claiming feature implementation.
11. Verify placeholder tabs do not start a runtime socket session or issue new telemetry/history/audit/trends API requests.

Manual smoke MUST NOT count as passed if `/hub/dashboard` starts a duplicate Dashboard runtime session, if placeholder tabs show Dashboard-specific actions, if placeholder tabs claim implemented tables/charts, or if old-edge alarm/telemetry/command state remains visible after Edge switch.

Manual smoke notes after Technical Lead Review:

- Status: PARTIAL. An authenticated browser pass was performed against the Dispatch Dashboard route with representative `diagramId` and `edgeId` data.
- FINDING: Dashboard workspace height was content-driven by the Alarm Journal column. The visual canvas and Alarm Journal used the same intrinsic content height, leaving unused vertical space below the runtime surface. Adding alarm rows could change the Alarm Journal height instead of scrolling inside a fixed runtime area.
- FIXED: Dispatch workspace now uses a viewport-locked runtime area below the User Hub header, tabs, and context bar. The Dashboard canvas consumes the remaining runtime space, the Alarm Journal keeps fixed desktop width and fills the same runtime height, and incident rows scroll inside the journal. On narrow screens the journal may still stack below the canvas.
- FIXED: Dashboard command lifecycle state is reset on Edge/binding/runtime context changes, and late command HTTP responses from a previous context are ignored.
- Follow-up manual smoke still SHOULD verify the fixed layout in browser: Dashboard canvas fills the free vertical space, Alarm Journal height does not grow with incident count, incident rows scroll inside the journal, `Details` remains an overlay, Edge switching clears stale command/alarm state, and placeholder tabs still clear Dashboard-specific actions.

Automated proof notes after implementation:

- PASS: `cmd /c npm run test -- DispatchWorkspacePage` from `client` completed successfully with `tests/integration/DispatchWorkspacePage.test.tsx` reporting 2 passed tests. The covered user flows prove `/hub/dispatch`, canonical `/hub/dispatch/dashboard?...`, legacy `/hub/dashboard?...`, sidebar `Dispatch`, route-addressable tabs, query preservation, one Dashboard runtime session, Dispatch-owned context selectors, no duplicate Dashboard surface selectors, Dashboard action slot placement, placeholder action cleanup, Edge switch isolation, pending command lifecycle cleanup, and late previous-edge command response suppression in focused coverage.
- PASS: `cmd /c npm run test -- DashboardPage` from `client` completed successfully with `tests/integration/DashboardPage.test.tsx` reporting 28 passed tests. The covered regressions include legacy route prefill to Dispatch Dashboard, alarm incident journal behavior, red-light/toast behavior, telemetry-driven command visuals, reconnect messaging with last rendered values preserved, command failure/reconnect behavior, stale catalog retry after selected Edge changes, and catalog failure isolation.
- PASS: `cmd /c npm run test -- useDashboardRuntimeSession` from `client` completed successfully with `tests/unit/useDashboardRuntimeSession.test.ts` reporting 10 passed tests. The covered hook behavior includes selected-edge alarm incident loading, stale previous-edge response isolation, selected-edge socket subscription, reconnect value preservation, active-edge realtime alarm scoping, ACK race handling, and session disposal on Edge switch/unmount cleanup.
- PASS: `cmd /c npm run test -- useDashboardCommandLifecycle` from `client` completed successfully with `tests/unit/useDashboardCommandLifecycle.test.ts` reporting 4 passed tests. The added proof covers full lifecycle reset for runtime context changes.
- PASS: `cmd /c npm run build` from `client` completed successfully with TypeScript project build and Vite production build; `DispatchWorkspacePage` emitted as a production chunk.
- Lean Testing boundary: automated coverage remained focused on one main Dispatch route/context/action-slot proof plus one stale-state negative flow, with existing Dashboard/runtime regressions used for preservation checks. No broad table-driven expansion for every placeholder tab, query permutation, visual class, or copy variant was added in this pass.
- Additional regression check after review: `cmd /c npm run test -- ConstructorHostFoundation` and `cmd /c npm run test -- catalogAdapter` both passed after aligning the constructor-host integration expectation with the cloud-provided metric labels.
- Remaining risk: browser-level verification of the post-fix Dashboard height behavior should be repeated, but no T043 blocking issue remains after the command lifecycle and layout fixes.

## Technical Lead Review

Review this plan and implementation for Dispatch shell ownership, Dashboard runtime ownership, action-slot stale state, stale shared-context async responses, route compatibility, placeholder honesty, Client-only scope, and Lean Testing discipline.

### Review Checklist

- [X] Verify scope did not expand into Cloud APIs, Edge runtime/YAML, Constructor authoring, auth/RBAC changes, telemetry history, command audit, trends implementation, expanded Alarm Journal, exports, reports, analytics, or Presence Lock.
- [X] Verify `/hub/dispatch/*` remains under the existing `/hub` auth guard.
- [X] Verify `/hub/dashboard` compatibility behavior preserves query parameters and does not mount a second Dashboard runtime session.
- [X] Verify `diagramId` and `edgeId` query parameters remain the only route-prefill contract.
- [X] Verify shared Dispatch context loading ignores stale responses after selected `diagramId` or `edgeId` changes.
- [X] Verify Dispatch owns shared selectors and Dashboard surface no longer renders duplicate shared selectors.
- [X] Verify Dashboard still owns runtime socket session, telemetry projection, command lifecycle, viewport, diagnostics, alarm journal, red-light/toast, and Dashboard-specific UI state.
- [X] Verify Dashboard command visuals remain telemetry-driven.
- [X] Verify transport reconnect preserves last rendered telemetry values.
- [X] Verify Edge switch isolates telemetry, command lifecycle, alarm rows, red-light/toast, and socket state.
- [X] Verify active-subtab action slot clears on tab change, Dashboard unmount, invalid context, and placeholder activation.
- [X] Verify `Fit to view` and `Details` still operate on Dashboard-local state.
- [X] Verify red-light count remains derived from active-edge known unclosed alarm projections.
- [X] Verify placeholder tabs do not start runtime sessions or call future telemetry/history/audit/trends APIs.
- [X] Verify placeholder `Alarms` tab does not present the compact Dashboard operational journal as the implemented Alarm Journal tab.
- [X] Verify automated proof remains lean: one main Dispatch route/context/action-slot proof plus one stale-state negative proof.
- [X] Verify manual smoke and verification command results are recorded after implementation.

Technical Lead Review notes after implementation:

- CLOSED after review fixes.
- Scope boundary: reviewed changes remained Client-only in `client/src/features/dispatch`, `client/src/features/dashboard`, User Hub routing/navigation, and focused Client tests. No Cloud, Edge, Constructor authoring, auth/RBAC, telemetry history, command audit, trends, expanded Alarm Journal, exports, reports, analytics, or Presence Lock behavior was added.
- Route boundary: `/hub/dispatch/*` remains under the existing `/hub` `ProtectedRoute requiredRole="USER"` tree. `/hub/dashboard` compatibility preserves `diagramId` and `edgeId` query parameters through a redirect to `/hub/dispatch/dashboard` and does not mount a second Dashboard runtime session.
- Query contract: `diagramId` and `edgeId` remain the only route-prefill contract. Diagram changes reset Edge selection unless an explicit replacement is provided.
- Async context guards: Dispatch bootstrap, binding-profile, saved-diagram, and Edge catalog loads use request ids plus effect cleanup guards so stale responses cannot update the active context after route/context changes.
- Ownership: Dispatch owns shared route context, Diagram/Edge selectors, context bar, tabs, placeholders, and action slot. Dashboard owns runtime socket session, telemetry projection, command lifecycle, viewport, diagnostics, compact alarm journal, red-light/toast, and Dashboard-specific visual state.
- Fixed during review: command lifecycle state now clears on Edge/binding/runtime context changes, and late command HTTP responses from the previous context are ignored. The stale-state proof now covers pending command lifecycle cleanup and late previous-edge command response suppression.
- Fixed during review: Dashboard runtime layout now fills the available Dispatch workspace height; desktop Alarm Journal has fixed width and fills the runtime height with internal scrolling for incident rows.
- Placeholder honesty: Telemetry, Commands, Trends, and Alarms tabs remain inert placeholders. The Alarms placeholder does not present the compact Dashboard operational journal as the implemented Alarm Journal tab.
- Proof status: focused automated tests and build passed as recorded above. Manual browser smoke was partially run and found the fixed Dashboard height defect; post-fix browser verification of that visual behavior should still be repeated, but no T043 blocking issue remains.

## Review Trigger

Review this plan when Dispatch route shape changes, Dashboard context ownership changes, Dashboard action slot composition changes, route query selection semantics change, Cloud/Edge runtime contracts change, or any placeholder subtab moves from placeholder to implemented behavior.
