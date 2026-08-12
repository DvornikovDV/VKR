# Implementation Prompts: Button Command Preset Slice

## Prompt 1: Dashboard Projection Vocabulary

Execute `.agent\workflows\07a-speckit.implement.quickcheck.md` for the task batch in Scope.

Scope:
- TASK_IDS: T001, T002
- TASKS_FILE: `specs/010-client-control/slices/plan_button_command_preset_slice.md`

Batch-specific constraints:
- The Dashboard projection type must be able to carry a validated saved button preset value without changing Cloud, Edge, or binding profile contracts.
- Fixtures must represent the saved layout field `button.commandValue` separately from `commandBindings[]`.

Main proof:
- Dashboard unit fixtures can express boolean and numeric button presets with matching command bindings, reported bindings, and catalog capabilities.

Do not count this as success:
- Adding fixture data that lets tests pass by treating `button.commandValue` as a binding field, telemetry field, widget text value, or DOM value.




## Prompt 2: Constructor Preserves Button Preset Values

Execute `.agent\workflows\07b-speckit.implement.experimental.md` for the task batch in Scope.

Scope:
- TASK_IDS: T003, T005, T006, T010
- TASKS_FILE: `specs/010-client-control/slices/plan_button_command_preset_slice.md`

Batch-specific constraints:
- `button.commandValue: false` must survive construction, widget export/import, hosted `loadLayout(...)`, and hosted `getLayout()` exactly as `false`.
- `commandValue` belongs only to saved button widget layout, never to `widgetBindings[]` or `commandBindings[]`.

Main proof:
- The Constructor serialization proof in `constructor/tests/widget-manager.test.js` demonstrates `false` and numeric preset persistence through the real widget layout serialization path.

Do not count this as success:
- Preserving only truthy numeric values, silently dropping `false`, or proving persistence through a helper that bypasses `WidgetManager.exportWidgets()` or hosted layout load/get behavior.




## Prompt 3: Constructor Authors Catalog-Backed Button Commands

Execute `.agent\workflows\07b-speckit.implement.experimental.md` for the task batch in Scope.

Scope:
- TASK_IDS: T004, T007, T008, T009
- TASKS_FILE: `specs/010-client-control/slices/plan_button_command_preset_slice.md`

Batch-specific constraints:
- `button` may author only catalog-backed `set_bool` and `set_number` targets, while `toggle` remains `set_bool` only and `slider` remains `set_number` only.
- Numeric preset validation must use catalog `min` and `max` when present, and reported telemetry binding must remain constrained to catalog `reportedMetric`.

Main proof:
- The properties-panel proof in `constructor/tests/properties-panel-bindings.test.js` covers button command target selection, explicit preset editing, `false` preservation, and reported metric constraint.

Do not count this as success:
- Making button command controls appear without enforcing catalog compatibility, without requiring explicit preset selection, or by allowing free-text command targets or payloads.




## Prompt 4: Dashboard Projects Button Command Availability

Execute `.agent\workflows\07a-speckit.implement.quickcheck.md` for the task batch in Scope.

Scope:
- TASK_IDS: T011, T012, T013, T014, T015, T016
- TASKS_FILE: `specs/010-client-control/slices/plan_button_command_preset_slice.md`

Batch-specific constraints:
- Dashboard must mark a button executable only from saved command binding, saved `button.commandValue`, current catalog capability, and matching reported telemetry binding.
- The validated preset value in command projection is the only allowed button payload source.

Main proof:
- `client/tests/unit/dashboardRuntimeProjection.test.ts` proves executable `button -> set_bool false`, executable range-valid `button -> set_number`, and one critical invalid-preset suppression path.

Do not count this as success:
- Adding `button` to the executable widget list while deriving payload from telemetry, widget text, lifecycle state, DOM state, or a fallback value.




## Prompt 5: Dashboard Executes Button Presets Through Cloud

Execute `.agent\workflows\07b-speckit.implement.experimental.md` for the task batch in Scope.

Scope:
- TASK_IDS: T017, T018, T019, T020, T021
- TASKS_FILE: `specs/010-client-control/slices/plan_button_command_preset_slice.md`

Batch-specific constraints:
- `DashboardVisualSurface` should emit button command intent without reading a DOM-derived payload value.
- `DashboardDispatchSubtab` must build `payload.value` for button commands only from the projection-provided validated preset and continue using `executeEdgeServerCommand(...)`.

Main proof:
- `client/tests/integration/DashboardPage.test.tsx` proves pressing a compatible `button -> set_bool false` sends exactly one Cloud command with `payload.value: false` and does not optimistically mutate actual visual state.

Do not count this as success:
- Passing integration by sending a hardcoded `false`, reading value from rendered text/DOM, or updating actual visual state before telemetry changes.




## Prompt 6: Focused Verification And Review

Execute `.agent\workflows\07a-speckit.implement.quickcheck.md` for the task batch in Scope.

Scope:
- TASK_IDS: T022, T023, T024, T025, T026, T027
- TASKS_FILE: `specs/010-client-control/slices/plan_button_command_preset_slice.md`

Batch-specific constraints:
- Verification must remain lean: focused Constructor tests, focused Dashboard projection tests, one Dashboard integration dispatch proof, Client build/type check, manual browser smoke notes, and Technical Lead Review.
- Manual smoke must cover hosted Constructor save/reload, invalid or stale preset suppression, missing reported binding suppression, and Dashboard execution through the Cloud command endpoint.

Main proof:
- The slice is closed only when focused automated checks and manual smoke evidence cover persistence, projection, one-shot dispatch, suppression, and telemetry-authoritative visual state.

Do not count this as success:
- Treating passing unit tests alone as enough while skipping manual hosted Constructor/Dashboard smoke or the final Technical Lead Review checklist.
