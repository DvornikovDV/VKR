# Dashboard Alarm Visual UX Implementation Batches

## Batch 1 - Shared Contracts And Fixture Anchors

    Execute `.agent\workflows\07a-speckit.implement.quickcheck.md` for the task batch in Scope.

    Scope:
    - TASK_IDS: T001, T002, T003, T004
    - TASKS_FILE: specs/003-dashboard/slices/plan_dashboard_alarm_visual_ux.md

    Batch-specific constraints:
    - Keep visual alarm state types tied to Cloud incident projections and saved Dashboard runtime layout, not Constructor internals.
    - Do not change existing fixture identities unless the existing Dashboard visual tests are updated deliberately.

    Main proof:
    - The task file has stable type names and fixture anchors for the later model and renderer batches.

    Do not count this as success:
    - Adding placeholder types or constants that are not usable by the model projection and renderer tasks.




## Batch 2 - Binding-Based Alarm Visual Projection

    Execute `.agent\workflows\07b-speckit.implement.experimental.md` for the task batch in Scope.

    Scope:
    - TASK_IDS: T005, T006, T007, T008, T009, T010
    - TASKS_FILE: specs/003-dashboard/slices/plan_dashboard_alarm_visual_ux.md

    Batch-specific constraints:
    - Preserve `deviceId + metric` inside the selected `edgeId` as the only incident-to-widget lookup key.
    - Use `DashboardBindingProfile.widgetBindings` directly; do not derive alarm targets from `runtimeProjection`, live telemetry, labels, geometry, rendered text, socket history, or Edge YAML.

    Main proof:
    - `client/tests/unit/dashboardAlarmVisualProjection.test.ts` proves widget state, image aggregation, lifecycle priority, severity priority, closed-incident exclusion, unmatched-incident exclusion, and non-renderable image exclusion through the model helper.

    Do not count this as success:
    - A helper that passes only the happy path while silently falling back to widget labels, geometry, telemetry values, or `imageById` for missing renderable images.




## Batch 3 - Visual Overlay Rendering

    Execute `.agent\workflows\07b-speckit.implement.experimental.md` for the task batch in Scope.

    Scope:
    - TASK_IDS: T011, T012, T013, T014, T015, T016
    - TASKS_FILE: specs/003-dashboard/slices/plan_dashboard_alarm_visual_ux.md

    Batch-specific constraints:
    - `DashboardVisualSurface` should render supplied alarm visual state and should not own incident-to-widget business mapping.
    - Preserve existing command DOM anchors, widget groups, image groups, and viewport transform behavior.

    Main proof:
    - `client/tests/integration/DashboardVisualSurface.test.tsx` proves stable widget outline/badge anchors and aggregate image badge anchors with prepared alarm visual state.

    Do not count this as success:
    - Rendering a journal/red-light indicator, CSS-only decoration, or unanchored visual text while the Konva widget/image overlay anchors are missing.




## Batch 4 - Runtime Binding Profile Propagation

    Execute `.agent\workflows\07b-speckit.implement.experimental.md` for the task batch in Scope.

    Scope:
    - TASK_IDS: T017, T020, T021
    - TASKS_FILE: specs/003-dashboard/slices/plan_dashboard_alarm_visual_ux.md

    Batch-specific constraints:
    - Propagate the selected saved binding profile from the Dashboard dispatch owner to `DashboardRuntimeSurface`.
    - Do not recompute or infer bindings inside the visual surface.

    Main proof:
    - The runtime component path has the selected binding profile available from `DashboardDispatchSubtab.tsx` to `DashboardRuntimeSurface.tsx`, and fixture incident helpers can map to existing saved visual bindings.

    Do not count this as success:
    - Passing only `runtimeProjection` or a derived widget value map and calling it enough for alarm overlay lookup.




## Batch 5 - Runtime Happy Path Overlay Wiring

    Execute `.agent\workflows\07b-speckit.implement.experimental.md` for the task batch in Scope.

    Scope:
    - TASK_IDS: T018, T022, T023
    - TASKS_FILE: specs/003-dashboard/slices/plan_dashboard_alarm_visual_ux.md

    Batch-specific constraints:
    - Consume the existing converged incident state from REST/realtime session state; do not create a second incident source.
    - Preserve selected-edge filtering before visual alarm projection.

    Main proof:
    - `client/tests/integration/DashboardVisualSurface.test.tsx` proves REST-loaded selected-edge incidents produce widget and image overlay anchors through the Dashboard runtime path.

    Do not count this as success:
    - A direct `DashboardVisualSurface` component-only pass that bypasses `DashboardRuntimeSurface` runtime wiring.




## Batch 6 - Negative Runtime Boundary And ACK Separation

    Execute `.agent\workflows\07b-speckit.implement.experimental.md` for the task batch in Scope.

    Scope:
    - TASK_IDS: T019, T024
    - TASKS_FILE: specs/003-dashboard/slices/plan_dashboard_alarm_visual_ux.md

    Batch-specific constraints:
    - Closed and unmatched incidents must not produce widget or image overlay state.
    - ACK remains owned by alarm journal UI surfaces, not by the diagram overlay.

    Main proof:
    - `client/tests/integration/DashboardVisualSurface.test.tsx` proves closed and unmatched incidents do not render overlay anchors while existing journal ACK behavior remains wired separately.

    Do not count this as success:
    - Hiding all overlays globally, removing journal ACK behavior, or filtering incidents by display text instead of saved bindings.




## Batch 7 - Focused Proof And Manual Smoke

    Execute `.agent\workflows\07a-speckit.implement.quickcheck.md` for the task batch in Scope.

    Scope:
    - TASK_IDS: T025, T026, T027
    - TASKS_FILE: specs/003-dashboard/slices/plan_dashboard_alarm_visual_ux.md

    Batch-specific constraints:
    - Keep validation focused on the model projection and visual/runtime proof paths.
    - Manual smoke must verify widget/image overlay and viewport preservation, not only alarm journal or red-light behavior.

    Main proof:
    - Focused npm tests pass for `dashboardAlarmVisualProjection` and `DashboardVisualSurface`, and manual smoke observes Cloud-incident-driven overlay without auto-pan, auto-zoom, fit-to-view, reset, or focus movement.

    Do not count this as success:
    - Passing broad unrelated tests while the focused alarm overlay tests fail, or seeing only the alarm journal/red-light count during manual smoke.




## Batch 8 - Technical Lead Review

    Execute `.agent\workflows\07a-speckit.implement.quickcheck.md` for the task batch in Scope.

    Scope:
    - TASK_IDS: T028, T029, T030
    - TASKS_FILE: specs/003-dashboard/slices/plan_dashboard_alarm_visual_ux.md

    Batch-specific constraints:
    - Review the model, renderer, and runtime wiring as separate boundaries.
    - Check that no Client code diagnoses alarms from telemetry, reads Edge YAML, or infers widget identity outside saved bindings.

    Main proof:
    - Review confirms model mapping, renderer anchors, runtime selected-edge filtering, selected binding profile propagation, single incident source usage, viewport preservation, and ACK separation.

    Do not count this as success:
    - A review that only checks test pass/fail status without inspecting scope leakage, contract drift, hidden inference, or boundary bypass.
