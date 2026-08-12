# Plan: Button Command Preset Slice

## Purpose

Make the existing `button` widget usable as a command preset button.

A command preset button MUST send exactly one saved command target with exactly one saved fixed value. It is intended for explicit one-shot operator actions such as `Silence siren -> set_bool false`, `Start -> set_bool true`, `Stop -> set_bool false`, `Reset fault -> set_bool true`, and `Valve 50% -> set_number 128`.

This slice MUST NOT make `button` a replacement for `toggle`. `toggle` remains the control for stable binary state; `button` is for named fixed command presets.

## Scope

- Constructor MUST allow `button` widgets to choose catalog-backed `set_bool` and `set_number` command targets.
- Constructor MUST add a fixed preset value editor for `button.commandValue`.
- Constructor MUST validate `button.commandValue` against the selected catalog command type and catalog numeric range when available.
- Constructor MUST preserve `commandBindings[]` as the saved command destination and keep `widgetBindings[]` as reported-state bindings.
- Constructor MUST persist `button.commandValue` as part of the saved diagram layout/widget config.
- Constructor reload MUST restore both the saved command target and the saved fixed value for a button.
- Client hosted Constructor integration MUST continue to pass saved layout, `commandBindings[]`, telemetry catalog, and command catalog through explicit hosted runtime boundaries.
- Dashboard runtime projection MUST make `button` executable only when the saved command binding, saved preset value, reported telemetry binding, and current catalog capability are compatible.
- Dashboard MUST render a runtime-owned accessible DOM interaction anchor for executable `button` widgets.
- Dashboard MUST dispatch exactly one Cloud command request when an executable command preset button is pressed.
- Dashboard command lifecycle UI MUST work for button commands without changing actual telemetry-rendered state.
- Automated proof MUST stay lean and focus on command availability, command dispatch, invalid preset suppression, and no optimistic physical-state mutation.
- Manual browser smoke MUST cover hosted Constructor authoring/save/reload and Dashboard button execution.

## Out of Scope

- Cloud command API changes.
- Cloud binding profile schema changes beyond existing `commandBindings[]`.
- Edge YAML, source mapping, Modbus, or command execution changes.
- New command types beyond `set_bool` and `set_number`.
- Arbitrary command text entry.
- A button that reads another widget's current input value.
- Runtime numeric or text input widgets for command payloads.
- Multi-step command sequences.
- Command retries, queues, replay, durable command scheduling, or Presence Lock.
- Alarm acknowledgement lifecycle changes.
- Treating `Silence siren` as alarm acknowledgement or incident reset.
- Broad Constructor UI redesign.
- Dashboard visual redesign unrelated to button command execution.

## Assumptions

- `commandValue` is the stable saved widget config field because `doc_cursed/button_command_preset_plan.md` defines that name.
- Cloud diagram layout storage preserves `button.commandValue` because `Diagram.layout` is stored as a mixed/plain object and Client layout validation accepts JSON-serializable widget fields.
- Constructor currently does not persist `button.commandValue`; the slice MUST add explicit widget construction, export, and import support for that field.
- `commandBindings[]` MUST NOT store command payload data.
- Numeric preset authority comes from catalog command `min` and `max` when present, not from button widget fields.
- Button runtime can reuse the existing Dashboard command lifecycle states without a broad visual redesign.
- Dashboard command dispatch currently lives in the Dashboard/Dispatch runtime path, not in the redirect-only `client/src/features/user-hub/pages/DashboardPage.tsx`.

## Constraints

- Client and Constructor MUST consume command targets only from the sanitized Cloud capabilities catalog.
- Client MUST NOT read Edge YAML, raw Edge config, registers, source mappings, telemetry history, labels, or free text to infer command capability.
- `widgetBindings[]` MUST remain reported-state bindings.
- `commandBindings[]` MUST remain desired-command destination bindings.
- `button.commandValue` MUST be a fixed saved preset value and MUST NOT be inferred from widget text.
- `set_bool` button presets MUST require boolean `commandValue`.
- Boolean `commandValue: false` MUST be preserved exactly through widget construction, layout export, layout save, layout load, and Dashboard runtime projection.
- `set_number` button presets MUST require finite numeric `commandValue`.
- Numeric button presets MUST respect catalog `min` and `max` when present.
- A newly command-bound button MUST remain non-executable until an explicit `commandValue` is saved or selected.
- A button with missing command binding, missing or invalid preset value, missing catalog capability, or missing reported telemetry binding MUST be non-executable.
- Button command execution MUST use `POST /api/edge-servers/:edgeId/commands`.
- Dashboard MUST build `payload.value` only from saved `button.commandValue`, never from telemetry, widget text, labels, command lifecycle state, or DOM state.
- Command HTTP results MUST affect command lifecycle only; they MUST NOT set actual physical visual state.
- Telemetry MUST remain the only source for physical state display.
- Existing `toggle -> set_bool` and `slider -> set_number` behavior MUST NOT regress.
- Existing reported telemetry binding behavior MUST NOT regress.
- Existing unsupported widgets MUST remain non-executable.
- Constructor changes MUST respect `UIController` as coordinator and MUST NOT introduce direct manager-to-manager orchestration.
- Dashboard changes MUST stay inside the native Client Dashboard/Dispatch runtime and MUST use saved Cloud contracts as source of truth.
- Lean Testing Policy applies: automated proof SHOULD cover the main happy path and at most one critical negative scenario for the main slice risk. DO NOT generate broad table-driven validation matrices for every invalid preset or catalog case.

## Acceptance Checks

- Hosted Constructor can create or select a `button`, bind it to a catalog-backed `set_bool` command, set `commandValue: false`, label it `Silence siren`, save the diagram layout and binding profile, then reload both values.
- Hosted Constructor can create or select a `button`, bind it to a catalog-backed `set_number` command, set a range-valid numeric `commandValue`, save, and reload it.
- Selecting a button command target sets or constrains the reported telemetry binding to the selected catalog command `reportedMetric`.
- Saved layout contains `button.commandValue`; saved binding profile contains the command destination in `commandBindings[]` and does not store the preset value.
- Constructor does not offer free-text `deviceId`, `commandType`, or arbitrary command payload entry.
- Dashboard renders the saved button as executable only when saved command binding, saved preset value, reported telemetry binding, and current catalog capability are compatible.
- Dashboard keeps the button non-executable when the preset value is invalid, the catalog command is stale, or the required reported telemetry binding is missing.
- A stale or invalid saved `button.commandValue` that reloads from layout is surfaced or suppressed as invalid and MUST NOT execute.
- Pressing a compatible `Silence siren` button sends exactly one Cloud command with `commandType: "set_bool"` and `payload.value: false`.
- Pressing a compatible numeric preset button sends exactly one Cloud command with `commandType: "set_number"` and the saved numeric `payload.value`.
- Invalid or stale button presets do not call the command endpoint.
- Button command success, timeout, unavailable, and error states are visible through existing command lifecycle behavior.
- Actual visual state remains telemetry-driven before, during, and after button command execution.
- Existing `toggle`, `slider`, reported telemetry bindings, and unsupported widget behavior continue to pass their focused regression checks.

## Format: `[ID] [P?] [Story] Description`

- `[P]` means the task can run in parallel because it touches different files and does not depend on incomplete tasks.
- `[US1]` maps to Constructor authoring and persistence.
- `[US2]` maps to Dashboard projection and command suppression.
- `[US3]` maps to Dashboard runtime command dispatch.
- Every task MUST include a concrete file path.
- This document intentionally does not include implementation batches.

## Phase 1: Setup

**Purpose**: Establish shared runtime vocabulary before changing Constructor and Dashboard behavior.

- [X] T001 Add Dashboard command preset projection fields for validated saved preset values, button payload authority, and an invalid-preset availability reason in `client/src/features/dashboard/model/types.ts`
- [X] T002 [P] Add button command preset fixture widgets, command bindings, reported bindings, and catalog entries for boolean and numeric presets in `client/tests/fixtures/dashboardVisualLayout.ts`

**Checkpoint**: Dashboard types and test fixtures can represent a button command preset without changing Cloud or Edge contracts.

---

## Phase 2: User Story 1 - Constructor Authors And Persists Button Presets (Priority: P1) MVP

**Goal**: Hosted Constructor can author, save, and reload a `button` command preset with a fixed `commandValue` while keeping `commandBindings[]` separate.

**Independent Test**: Use Constructor pure tests to export/import a button with `commandValue: false` and a numeric preset, and verify the properties panel offers catalog-backed button command targets plus preset value controls.

### Tests for User Story 1

- [X] T003 [P] [US1] Add a widget serialization proof for `button.commandValue: false` and numeric `button.commandValue` in `constructor/tests/widget-manager.test.js`
- [X] T004 [P] [US1] Add a properties-panel proof that `button` can select catalog-backed `set_bool` and `set_number` command targets, preserves `false`, and constrains reported telemetry to `reportedMetric` in `constructor/tests/properties-panel-bindings.test.js`

### Implementation for User Story 1

- [X] T005 [US1] Add `commandValue` preservation to `ButtonWidget` construction without converting `false` to an empty value in `constructor/public/widget-types.js`
- [X] T006 [US1] Export and import `button.commandValue` in widget layout serialization without storing command payload data in telemetry binding fields in `constructor/public/widget-manager.js`
- [X] T007 [US1] Extend command target compatibility so `button` can choose catalog-backed `set_bool` and `set_number` targets while `toggle` and `slider` keep their existing restrictions in `constructor/public/properties-panel.js`
- [X] T008 [US1] Add the `button.commandValue` preset editor for boolean and numeric catalog commands, keeping newly command-bound buttons non-executable until an explicit preset is saved or selected in `constructor/public/properties-panel.js`
- [X] T009 [US1] Validate `button.commandValue` against selected catalog command `valueType`, `min`, and `max`, and keep reported telemetry binding constrained to catalog `reportedMetric` in `constructor/public/properties-panel.js`
- [X] T010 [US1] Ensure hosted layout save/load uses the existing explicit runtime boundary and needs no new Cloud binding field while preserving `button.commandValue` through `getLayout()` and `loadLayout(...)` in `constructor/public/ui-controller.js` and `constructor/public/hosted-entry.js`

**Checkpoint**: Constructor can author, save, and reload button presets through the hosted runtime path.

---

## Phase 3: User Story 2 - Dashboard Projects Executable Button Presets Safely (Priority: P1)

**Goal**: Dashboard projection marks `button` executable only when saved binding, saved preset value, reported telemetry binding, and current catalog capability are compatible.

**Independent Test**: Use pure projection tests to prove `button -> set_bool false` and `button -> set_number` availability, plus one critical suppression proof for an invalid preset. Missing reported telemetry binding and stale catalog suppression belong in manual smoke and Technical Lead Review.

### Tests for User Story 2

- [X] T011 [P] [US2] Add projection proof for executable `button -> set_bool false` and range-valid `button -> set_number` using saved `button.commandValue` in `client/tests/unit/dashboardRuntimeProjection.test.ts`
- [X] T012 [P] [US2] Add one critical projection proof that an invalid `button.commandValue` suppresses execution without mutating telemetry projection in `client/tests/unit/dashboardRuntimeProjection.test.ts`

### Implementation for User Story 2

- [X] T013 [US2] Extend command compatibility helpers so `button` accepts `set_bool` and `set_number` while `toggle` remains `set_bool` only and `slider` remains `set_number` only in `client/src/features/dashboard/model/selectors.ts`
- [X] T014 [US2] Add saved `button.commandValue` validation for boolean and numeric catalog commands, including catalog `min` and `max`, in `client/src/features/dashboard/model/selectors.ts`
- [X] T015 [US2] Include the validated preset value in Dashboard command runtime projection as the only allowed button payload source, and ensure Dashboard never derives button payload values from telemetry, text, labels, lifecycle state, or DOM state in `client/src/features/dashboard/model/selectors.ts`
- [X] T016 [US2] Keep `button` visible as a supported runtime widget without projecting the saved command preset as actual physical state in `client/src/features/dashboard/model/selectors.ts`

**Checkpoint**: Dashboard projection exposes safe button command availability while telemetry remains authoritative.

---

## Phase 4: User Story 3 - Dashboard Executes Button Presets Through Cloud (Priority: P1)

**Goal**: Pressing an executable button preset sends exactly one Cloud command and only affects command lifecycle state until telemetry changes.

**Independent Test**: Use the existing Dashboard integration path to press a compatible `Silence siren` button and assert exactly one Cloud command request with `payload.value: false` from projection and no optimistic actual-state mutation.

### Tests for User Story 3

- [X] T017 [P] [US3] Add Dashboard integration proof that pressing a compatible `button -> set_bool false` sends exactly one Cloud command from the projection-provided preset value and does not optimistically mutate actual visual state in `client/tests/integration/DashboardPage.test.tsx`

### Implementation for User Story 3

- [X] T018 [US3] Render a runtime-owned accessible DOM button anchor for executable `button` widgets and emit button command intent without reading a DOM-derived payload value in `client/src/features/dashboard/components/DashboardVisualSurface.tsx`
- [X] T019 [US3] Disable button command anchors during pending lifecycle or non-executable projection states, including keyboard and pointer paths, in `client/src/features/dashboard/components/DashboardVisualSurface.tsx`
- [X] T020 [US3] Render button visuals from saved widget text while keeping physical state display telemetry-driven and command lifecycle badges generic by widget id in `client/src/features/dashboard/components/DashboardVisualSurface.tsx`
- [X] T021 [US3] Keep Dashboard/Dispatch command commit validation aligned with projection-provided `button.commandValue`, build `payload.value` for button commands only from projection, and use the existing `executeEdgeServerCommand(...)` Cloud API path in `client/src/features/dashboard/components/DashboardDispatchSubtab.tsx`

**Checkpoint**: Button presets execute through the existing Cloud command path and do not mutate actual state optimistically.

---

## Phase 5: Verification, Manual Smoke, And Review

**Purpose**: Verify the narrow slice without expanding into Cloud, Edge, or broad UI redesign work.

- [X] T022 Run focused Constructor tests for preset serialization and properties-panel command authoring in `constructor/tests/widget-manager.test.js` and `constructor/tests/properties-panel-bindings.test.js`
- [X] T023 Run focused Client projection tests for button command availability and suppression in `client/tests/unit/dashboardRuntimeProjection.test.ts`
- [X] T024 Run focused Dashboard integration tests for button command dispatch in `client/tests/integration/DashboardPage.test.tsx`
- [X] T025 Run Client build/type check after Dashboard type and projection changes in `client/src/features/dashboard/model/types.ts`
- [ ] T026 Complete manual browser smoke notes for hosted Constructor save/reload, invalid or stale preset suppression, missing reported binding suppression, and Dashboard button execution in `specs/010-client-control/slices/plan_button_command_preset_slice.md`
- [ ] T027 Complete Technical Lead Review for task completeness, source-of-truth boundaries, preset validation, suppression, command dispatch, telemetry-authoritative state, and Lean Testing Policy in `specs/010-client-control/slices/plan_button_command_preset_slice.md`

### Verification Notes

Automated quickcheck run on 2026-05-23:

- `node --test constructor\tests\widget-manager.test.js constructor\tests\properties-panel-bindings.test.js` passed: 7 tests.
- `cmd /c npm run test -- tests/unit/dashboardRuntimeProjection.test.ts` passed: 15 tests.
- `cmd /c npm run test -- tests/integration/DashboardPage.test.tsx` passed: 29 tests.
- `cmd /c npm run build` passed: `tsc -b` and Vite production build completed.

Manual browser smoke is not yet executed. It remains pending for hosted Constructor save/reload, invalid or stale preset suppression, missing reported binding suppression, and Dashboard execution through the Cloud command endpoint.

---

## Dependencies And Execution Order

### Phase Dependencies

- Phase 1 has no dependencies.
- Phase 2 depends on Phase 1 only for shared Dashboard vocabulary; Constructor implementation can proceed independently after task ownership is clear.
- Phase 3 depends on Phase 1 and should align with the final `button.commandValue` field from Phase 2.
- Phase 4 depends on Phase 3 command projection and can reuse existing command lifecycle and Cloud command API code.
- Phase 5 depends on implementation and proof tasks from Phases 2-4.

### Task Dependencies

- T003 depends on the intended serialization behavior from T005-T006, but SHOULD be written before implementation when working test-first.
- T004 depends on the intended properties panel behavior from T007-T009, but SHOULD be written before implementation when working test-first.
- T006 depends on T005 because `WidgetManager` can only export/import fields preserved by the constructed widget.
- T008 depends on T007 because preset controls depend on the selected command type.
- T009 depends on T008 because validation applies to the rendered preset controls.
- T011-T012 depend on T001 and T002.
- T013-T016 depend on T001 and the saved field contract confirmed by Phase 2.
- T017 depends on T002 and T018-T021.
- T018-T021 depend on T013-T016.
- T022-T025 depend on their corresponding implementation and test tasks.
- T026 depends on a running local Cloud and Client environment plus completed Constructor and Dashboard behavior.
- T027 depends on T022-T026.

### Parallel Opportunities

- T002 can run in parallel with T001 because fixtures and type vocabulary are separate files.
- T003 and T004 can run in parallel because widget serialization and properties panel behavior are separate test files.
- T005-T006 and T007-T009 should be coordinated, but T005-T006 can proceed separately from T007-T009 once the `commandValue` field contract is fixed.
- T011 and T012 can run in parallel after T001-T002 because they target distinct projection scenarios in the same test file and must be merged carefully.
- T017 can run after button projection and anchor contracts are stable.
- T022-T024 can run in parallel after implementation completes.

## Parallel Example: Constructor And Dashboard Projection

```text
Task: "Add a widget serialization proof for `button.commandValue: false` and numeric `button.commandValue` in `constructor/tests/widget-manager.test.js`"
Task: "Add projection proof for executable `button -> set_bool false` and range-valid `button -> set_number` using saved `button.commandValue` in `client/tests/unit/dashboardRuntimeProjection.test.ts`"
```

## Implementation Strategy

### MVP First

1. Complete Phase 1 so Dashboard projection has the required command preset vocabulary.
2. Complete Phase 2 so Constructor can save and reload `button.commandValue` and command destination separately.
3. Complete Phase 3 so Dashboard decides button executability from saved layout, saved binding profile, current catalog, and reported telemetry binding.
4. Complete Phase 4 so executable buttons send commands through the existing Cloud command API.
5. Complete focused verification, manual smoke, and Technical Lead Review.

### Validation Bias

- Prefer pure Constructor and Dashboard projection tests for compatibility, preset validation, and suppression.
- Prefer one Dashboard integration proof for `button -> set_bool false` dispatch instead of a broad UI matrix.
- Use manual smoke for the numeric button command execution path and hosted Constructor browser behavior.
- DO NOT add Cloud or Edge tests unless implementation discovers that existing layout storage or command API behavior blocks this slice.

## Technical Lead Review

Review this plan and implementation for scope leakage, source-of-truth boundaries, preset value persistence, command compatibility, stale catalog behavior, command suppression, command dispatch, telemetry-authoritative visuals, and lean proof volume.

- [ ] Verify no Cloud command API, binding profile schema, OpenAPI, Edge YAML, Modbus, retries, queues, Presence Lock, or alarm acknowledgement work leaked into this slice.
- [ ] Verify `button.commandValue` is stored only in saved widget layout and never in `commandBindings[]`.
- [ ] Verify `commandValue: false` is preserved exactly through Constructor construction, export, save, load, and Dashboard projection.
- [ ] Verify Client and Constructor consume command targets only from the sanitized Cloud catalog.
- [ ] Verify `button` can choose only catalog-backed `set_bool` and `set_number`.
- [ ] Verify `toggle` and `slider` command compatibility did not regress.
- [ ] Verify numeric preset validation uses catalog `min` and `max` when present.
- [ ] Verify a newly command-bound button is non-executable until an explicit preset is saved or selected.
- [ ] Verify missing binding, invalid preset, stale catalog capability, and missing reported telemetry binding suppress execution.
- [ ] Verify Dashboard builds button `payload.value` only from saved `button.commandValue`.
- [ ] Verify command HTTP results affect lifecycle only and do not mutate actual visual state.
- [ ] Verify automated proof remains lean and behavior-oriented.

## Manual Browser Smoke

Manual smoke MUST use a trusted active Edge with a catalog containing at least one `set_bool` command and one `set_number` command.

1. Open hosted Constructor for a USER-owned diagram and selected Edge.
2. Create or select a `button`, bind it to a `set_bool` command, set `commandValue: false`, and label it `Silence siren`.
3. Save and inspect that layout persists the fixed value while the binding profile persists the command destination separately.
4. Reload Constructor and verify both command target and fixed value are restored.
5. From the hosted runtime instance, call `loadLayout(...)` with a saved `button.commandValue: false`, then call `getLayout()` and verify the returned widget still contains `commandValue: false`.
6. Open Dashboard/Dispatch for the same `diagramId + edgeId`.
7. Verify the button is executable only when the matching reported telemetry binding exists.
8. Press the button and verify one `POST /api/edge-servers/:edgeId/commands` request with `commandType: "set_bool"` and `payload.value: false`.
9. Verify no actual visual state changes until telemetry changes.
10. Repeat with one valid `set_number` preset inside catalog range.
11. Verify an invalid value or missing reported binding disables or suppresses execution.

## Review Trigger

Review this plan when command types beyond `set_bool` and `set_number` enter scope, command payloads stop using `{ value }`, `commandBindings[]` starts storing payload data, Dashboard command execution leaves the Cloud command API path, or alarm acknowledgement and actuator silence are merged in product UX.
