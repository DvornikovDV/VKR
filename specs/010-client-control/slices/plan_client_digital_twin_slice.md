# Tasks: Client Digital Twin Runtime Slice

**Input**: `doc_cursed/cloud_client_control_plan.md`, `doc_cursed/edge_control_plan.md`, `specs/009-edge-capabilities/slices/plan_edge_capabilities_catalog_slice.md`, `specs/009-edge-cloud-rpc/slices/plan_edge_rpc_bridge_slice.md`, `specs/010-client-control/slices/plan_client_command_binding_authoring_slice.md`, current Dashboard, Client shared API, Cloud OpenAPI, and command controller contracts.

**Prerequisites**: The capabilities catalog and Edge RPC bridge slices are complete. The command binding authoring slice has implemented the saved `commandBindings[]` contract, but its Technical Lead Review remains unchecked; treat that as a prerequisite risk during implementation.

**Tests**: Lean Testing Policy applies. Add compact behavior proof for runtime projection, command execution, command suppression, and telemetry-authoritative state. Do not add broad table-driven matrices for every invalid catalog, command, or HTTP response shape.

**Organization**: This document is the detailed slice implementation plan. It intentionally does not include implementation batches.

## Purpose

Make the Client Dashboard the runtime digital twin surface for saved diagram binding profiles.

Dashboard MUST render actual state from saved telemetry bindings, send desired commands from saved command bindings through Cloud, and keep widget visual state telemetry-authoritative.

## Scope

- Load the saved binding profile for the active `diagramId + edgeId`.
- Load the current Cloud capabilities catalog for the active Edge Server.
- Build Dashboard runtime projection from separate `widgetBindings[]` and `commandBindings[]`.
- Subscribe to telemetry and render actual widget state from `widgetBindings[]`.
- Enable command controls only when saved bindings and current catalog capability are compatible.
- Execute only `toggle -> set_bool` and `slider -> set_number`.
- Send command payloads through `POST /api/edge-servers/:edgeId/commands`.
- Show minimal command lifecycle UI for pending, confirmed-waiting-telemetry, error, unavailable, and disabled states.
- Preserve telemetry-authoritative visual state before, during, and after command execution.
- Add focused Cloud API client integration.
- Add lean automated proof for runtime projection, command execution, command suppression, and telemetry-authoritative rendering.
- Add manual browser smoke evidence for all browser-testable behavior.

## Out of Scope

- Constructor authoring redesign.
- New command types beyond `set_bool` and `set_number`.
- Button command execution.
- CommandAudit, command journal, history UI, retry, or replay policy.
- Presence Lock or ControlLease.
- Direct Edge communication from Dashboard.
- Edge YAML, register, source mapping, Modbus, or adapter changes.
- Treating command HTTP response or `command_result.confirmed` as actual physical state.
- Broad visual redesign unrelated to command/runtime closure.

## Source Of Truth

- Cloud capabilities catalog is the source of available telemetry and command options.
- Saved diagram binding profile is the source of Dashboard runtime wiring.
- Telemetry is the source of actual visual state.
- Cloud command API is the only desired write path for Dashboard commands.

## Existing Contracts

Dashboard MUST preserve the capabilities catalog contract:

```ts
{
  edgeServerId: string;
  telemetry: Array<{
    deviceId: string;
    metric: string;
    valueType?: 'boolean' | 'number' | 'string';
    label: string;
  }>;
  commands: Array<{
    deviceId: string;
    commandType: 'set_bool' | 'set_number';
    valueType: 'boolean' | 'number';
    min?: number;
    max?: number;
    reportedMetric: string;
    label: string;
  }>;
}
```

Dashboard MUST preserve the saved binding profile contract:

```ts
{
  edgeServerId: string;
  widgetBindings: Array<{
    widgetId: string;
    deviceId: string;
    metric: string;
  }>;
  commandBindings: Array<{
    widgetId: string;
    deviceId: string;
    commandType: 'set_bool' | 'set_number';
  }>;
}
```

Dashboard MUST send commands through:

```http
POST /api/edge-servers/:edgeId/commands
```

with:

```ts
{
  deviceId: string;
  commandType: 'set_bool' | 'set_number';
  payload: { value: boolean | number };
}
```

Dashboard MUST handle command responses as command lifecycle state only:

- `200` with `data.commandStatus: 'confirmed'` clears pending and enters confirmed-waiting-telemetry.
- `502` with `failureReason: 'edge_command_timeout'` clears pending and shows timeout error.
- `502` with `failureReason: 'edge_command_failed'` clears pending and shows command error.
- `503` with `failureReason: 'edge_unavailable'` clears pending and shows unavailable/error state.
- `504` with `failureReason: 'cloud_rpc_timeout'` clears pending and shows timeout error.
- Generic HTTP or network failures clear pending and show minimal command error state.

## Constraints

- Dashboard MUST use Cloud APIs only.
- Dashboard MUST NOT read or derive behavior from Edge YAML, raw config, registers, source mappings, telemetry history, labels, widget names, or free text.
- `widgetBindings[]` MUST remain reported-state bindings.
- `commandBindings[]` MUST remain desired-command bindings.
- The two binding arrays MUST remain separate in Client model, runtime projection, tests, and UI behavior.
- Legacy profiles without `commandBindings` MUST load as `commandBindings: []`.
- Dashboard MUST validate command compatibility against the current catalog before enabling execution.
- A command control MUST be executable only when both a saved `commandBinding` and a saved `widgetBinding` for the command capability `reportedMetric` exist and are compatible with the current catalog.
- A reported telemetry binding is compatible with a command capability only when it has the same `widgetId`, the same `deviceId`, and `metric === catalogCommand.reportedMetric`.
- Catalog load failure MUST NOT block telemetry-only Dashboard rendering; it MUST make command controls unavailable until a valid catalog is loaded.
- Stale `commandBindings[]` entries MUST NOT invalidate the whole Dashboard context; they MUST be ignored or rendered as non-executable diagnostics while telemetry rendering continues from valid `widgetBindings[]`.
- Executable command affordances MUST expose stable runtime-owned accessible DOM controls or equivalent interaction anchors; canvas-only decorative shapes are insufficient for command execution proof.
- `toggle` widgets MAY execute only `set_bool`.
- `slider` widgets MAY execute only `set_number`.
- Slider MUST send `set_number` only on commit or release; it MUST NOT stream commands continuously and MUST NOT use debounce as a command stream.
- Display widgets, LED, text, number display, button, and unsupported widgets MUST NOT execute commands.
- LED MUST remain telemetry-only and SHOULD display boolean reported state.
- `command_result.confirmed` or HTTP success MUST clear command pending state but MUST NOT change actual visual state.
- Dashboard SHOULD show a minimal "confirmed, waiting for telemetry" state after confirmation until telemetry updates the bound reported metric.
- Telemetry MUST always win over desired command values, including mismatch cases.
- Command errors and timeouts MUST clear pending and show minimal local error state.
- Dashboard MUST preserve last telemetry values while transport reconnects.
- Manual browser smoke MUST cover behavior visible in the running site.

## Assumptions

- Dashboard command controls use the actual saved Constructor widget types `toggle` and `slider`. Legacy local Dashboard test fixtures using `toggle-switch` MUST NOT become the command runtime contract.
- The minimal disabled state MAY use existing Dashboard diagnostics/status surfaces together with command-control affordances.
- If telemetry never changes after confirmation, Dashboard remains on the last telemetry-rendered actual value and keeps the confirmed-waiting-telemetry hint until a later telemetry event, context reload, or a new command replaces the local command lifecycle state.

## Format: `[ID] [P?] [Story] Description`

- `[P]` means the task can run in parallel because it touches different files and does not depend on incomplete tasks.
- `[US1]` maps to telemetry-authoritative runtime projection.
- `[US2]` maps to Cloud command execution for compatible controls.
- `[US3]` maps to command suppression, error, and unavailable behavior.
- Every task includes the file path that owns the change or proof.

## Phase 1: Setup

**Purpose**: Establish Client-side contracts and fixtures before changing Dashboard runtime behavior.

- [x] T001 Add Cloud command API request, success, error, and normalized outcome types in `client/src/shared/api/commands.ts`.
- [x] T002 Implement `executeEdgeServerCommand(...)` through `apiClient.post` and `ApiError.body` normalization for `confirmed`, `cloud_rpc_timeout`, `edge_command_timeout`, `edge_command_failed`, `edge_unavailable`, and generic failures in `client/src/shared/api/commands.ts`.
- [x] T003 [P] Export or directly reference the new command API from the Dashboard without changing Cloud or Edge modules in `client/src/shared/api/commands.ts`.
- [x] T004 [P] Extend Dashboard test fixtures with actual `toggle` and `slider` widget layouts, separate `widgetBindings[]`, separate `commandBindings[]`, and catalog command capabilities in `client/tests/fixtures/dashboardVisualLayout.ts`.
- [x] T005 [P] Extend MSW Dashboard fixtures and handlers to serve catalog snapshots and command API responses without seeding Edge YAML or raw config in `client/tests/mocks/handlers.ts`.

**Checkpoint**: Client has a typed Cloud command wrapper and tests can model saved command bindings plus current catalog capabilities.

---

## Phase 2: Foundational Dashboard Runtime Contracts

**Purpose**: Make Dashboard models capable of representing telemetry and command runtime state separately.

- [x] T006 Add `DashboardCommandBinding`, command lifecycle, command availability, command capability, and command projection types while preserving existing telemetry types in `client/src/features/dashboard/model/types.ts`.
- [x] T007 Normalize Dashboard binding profiles so missing legacy `commandBindings` becomes `[]` without weakening `widgetBindings[]` loading in `client/src/shared/api/bindings.ts`.
- [x] T008 Add pure command compatibility helpers for `toggle -> set_bool`, `slider -> set_number`, exact `widgetId`, exact `deviceId`, `metric === reportedMetric`, and stale `commandBindings[]` suppression in `client/src/features/dashboard/model/selectors.ts`.
- [x] T009 Extend runtime projection to keep `widgetBindings[]` and `commandBindings[]` separate and to expose command availability without mutating `widgetValueById` in `client/src/features/dashboard/model/selectors.ts`.
- [x] T010 Add a focused projection proof for separated telemetry/command bindings, exact `reportedMetric` matching, catalog mismatch suppression, stale `commandBindings[]` suppression, and legacy `commandBindings: []` behavior in `client/tests/unit/dashboardRuntimeProjection.test.ts`.
- [x] T011 Add a Dashboard command lifecycle helper or hook skeleton that stores per-widget pending, confirmed-waiting-telemetry, and error state without storing actual physical widget values in `client/src/features/dashboard/hooks/useDashboardCommandLifecycle.ts`.

**Checkpoint**: Dashboard can compute command availability and lifecycle state without sending commands or changing telemetry-rendered actual values.

---

## Phase 3: User Story 1 - Telemetry-Authoritative Digital Twin Projection (Priority: P1)

**Goal**: Dashboard renders actual runtime state for telemetry-bound widgets, including command-capable `toggle` and `slider`, while command wiring remains separate.

**Independent Test**: Load a saved diagram with telemetry bindings and command bindings, emit telemetry for the reported metrics, and verify actual widget state follows telemetry while command state does not mutate `widgetValueById`.

### Tests for User Story 1

- [x] T012 [US1] Add a Dashboard projection test proving `toggle` and `slider` actual state comes from `widgetBindings[]` telemetry and not from command binding desired values in `client/tests/unit/dashboardRuntimeProjection.test.ts`.
- [x] T013 [US1] Add a Dashboard page integration proof that catalog load failure keeps telemetry-bound visual state rendering while command controls are unavailable in `client/tests/integration/DashboardPage.test.tsx`.

### Implementation for User Story 1

- [x] T014 [US1] Load the current Edge catalog for the selected active Edge profile without blocking saved diagram or telemetry session loading in `client/src/features/user-hub/pages/DashboardPage.tsx`.
- [x] T015 [US1] Track catalog loading, loaded, and error state separately from Dashboard recovery state so telemetry-only rendering can continue when catalog loading fails in `client/src/features/user-hub/pages/DashboardPage.tsx`.
- [x] T016 [US1] Pass command projection and command lifecycle state into the runtime surface without merging them into telemetry projection in `client/src/features/user-hub/pages/DashboardPage.tsx`.
- [x] T017 [US1] Render telemetry-driven visual state for `toggle`, `slider`, and `led` from runtime projection while preserving existing `number-display` and `text-display` behavior in `client/src/features/dashboard/components/DashboardVisualSurface.tsx`.
- [x] T018 [US1] Surface command availability and catalog-load diagnostics in the existing diagnostics/status path without replacing the visual surface in `client/src/features/dashboard/components/DashboardDiagnosticsPanel.tsx`.

**Checkpoint**: Dashboard is a read-correct digital twin surface even when commands are disabled or catalog is unavailable.

---

## Phase 4: User Story 2 - Execute Compatible Toggle and Slider Commands (Priority: P1)

**Goal**: Compatible `toggle` and `slider` controls send desired commands through Cloud and keep actual visual state telemetry-driven.

**Independent Test**: Use MSW to capture `POST /api/edge-servers/:edgeId/commands`, click a compatible toggle, commit a compatible slider value, and verify command payloads plus no visual state mutation until telemetry arrives.

### Tests for User Story 2

- [x] T019 [US2] Add command API unit coverage for successful confirmation and normalized Cloud/Edge timeout, failed, unavailable, and generic network/API outcomes in `client/tests/unit/commandsApi.test.ts`.
- [x] T020 [US2] Add a Dashboard page integration proof using stable runtime-owned interaction anchors that a compatible `toggle` sends one `set_bool` payload through Cloud and does not change actual state until telemetry updates the reported metric in `client/tests/integration/DashboardPage.test.tsx`.
- [x] T021 [US2] Add a Dashboard page integration proof using stable runtime-owned interaction anchors that a compatible `slider` sends one `set_number` payload only on commit/release and does not stream commands during intermediate value changes in `client/tests/integration/DashboardPage.test.tsx`.

### Implementation for User Story 2

- [x] T022 [US2] Complete `useDashboardCommandLifecycle` so command confirmation clears pending, enters confirmed-waiting-telemetry, and clears only after telemetry updates the exact bound reported metric in `client/src/features/dashboard/hooks/useDashboardCommandLifecycle.ts`.
- [x] T023 [US2] Implement Dashboard command dispatch through `executeEdgeServerCommand(...)` using only saved command binding data and the selected `edgeId` in `client/src/features/user-hub/pages/DashboardPage.tsx`.
- [x] T024 [US2] Render an executable toggle command affordance with a stable accessible interaction anchor for compatible `toggle` widgets, deriving desired boolean as the inverse of the telemetry-projected actual boolean and never writing the desired value into actual visual state in `client/src/features/dashboard/components/DashboardVisualSurface.tsx`.
- [x] T025 [US2] Render an executable slider command affordance with a stable accessible interaction anchor for compatible `slider` widgets, using catalog `min`/`max` when present and sending `set_number` only from commit/release handlers in `client/src/features/dashboard/components/DashboardVisualSurface.tsx`.
- [x] T026 [US2] Show pending and confirmed-waiting-telemetry state for command-capable widgets without changing telemetry-rendered actual values in `client/src/features/dashboard/components/DashboardVisualSurface.tsx`.
- [x] T027 [US2] Mirror command lifecycle state in diagnostics so manual smoke can inspect pending, confirmed-waiting-telemetry, and last error by widget id in `client/src/features/dashboard/components/DashboardDiagnosticsPanel.tsx`.

**Checkpoint**: Compatible toggle and slider widgets can issue Cloud commands, but telemetry remains the only actual visual state source.

---

## Phase 5: User Story 3 - Suppress Invalid, Unsupported, and Failed Commands (Priority: P1)

**Goal**: Dashboard never sends commands for unsupported widgets or incompatible/stale bindings, and command failures leave actual visual state telemetry-authoritative.

**Independent Test**: Load profiles with unsupported widgets, missing reported telemetry binding, stale catalog capability, and mismatched `reportedMetric`; verify command controls are disabled/unavailable and no command request is sent.

### Tests for User Story 3

- [x] T028 [US3] Add a projection proof that display widgets, LED, `button`, missing command bindings, stale command-binding widget ids, missing reported telemetry bindings, mismatched `deviceId`, mismatched `widgetId`, and stale catalog capabilities are non-executable in `client/tests/unit/dashboardRuntimeProjection.test.ts`.
- [x] T029 [US3] Add a Dashboard page integration proof that unsupported/display-only widgets render no executable command action and do not call the Cloud command endpoint in `client/tests/integration/DashboardPage.test.tsx`.
- [x] T030 [US3] Add a Dashboard page integration proof that command errors, Cloud RPC timeout, Edge timeout, Edge failure, Edge unavailable, and generic network/API failure clear pending and show minimal error/unavailable state without changing actual visual state in `client/tests/integration/DashboardPage.test.tsx`.

### Implementation for User Story 3

- [x] T031 [US3] Disable or mark unavailable command controls when the saved command binding is missing, reported telemetry binding is missing, widget type is incompatible, catalog load failed, or the current catalog lacks the capability in `client/src/features/dashboard/components/DashboardVisualSurface.tsx`.
- [x] T032 [US3] Ensure non-executable widgets cannot trigger `onCommandCommit` from keyboard, pointer, or fallback rendering paths in `client/src/features/dashboard/components/DashboardVisualSurface.tsx`.
- [x] T033 [US3] Map command API failures into stable lifecycle states and operator-facing diagnostics without treating failed command results as telemetry in `client/src/features/dashboard/hooks/useDashboardCommandLifecycle.ts`.
- [x] T034 [US3] Keep existing transport reconnect behavior preserving last telemetry values while command lifecycle errors remain local to the affected widget in `client/src/features/user-hub/pages/DashboardPage.tsx`.

**Checkpoint**: Invalid and failed command paths are safe by default and cannot mutate actual state.

---

## Phase 6: Verification, Manual Smoke, and Review

**Purpose**: Verify the slice without expanding into Cloud, Edge, or Constructor work.

- [x] T035 Run focused Client projection tests from `client`: `cmd /c npm run test -- dashboardRuntimeProjection`.
- [x] T036 Run focused Client command API tests from `client`: `cmd /c npm run test -- commandsApi`.
- [x] T037 Run focused Dashboard page tests from `client`: `cmd /c npm run test -- DashboardPage`.
- [x] T038 Run Client build/type check from `client`: `cmd /c npm run build`.
- [ ] T039 Complete manual browser smoke notes in this document for operator-visible Dashboard behavior, Cloud command requests, telemetry-after-command behavior, disabled/unavailable controls, unsupported-widget suppression, and reload separation in `specs/010-client-control/slices/plan_client_digital_twin_slice.md`.
- [x] T040 Complete automated proof coverage notes in this document for behavior that cannot be closed reliably by manual smoke alone: projection separation, exact `reportedMetric` compatibility, stale binding suppression, command response normalization, no optimistic actual-state mutation, no slider command stream, and non-executable fallback paths in `specs/010-client-control/slices/plan_client_digital_twin_slice.md`.
- [ ] T041 Complete Technical Lead Review for source-of-truth boundaries, command response mapping, catalog failure behavior, exact `reportedMetric` matching, telemetry-authoritative visuals, command suppression, Lean Testing Policy, and scope leakage in `specs/010-client-control/slices/plan_client_digital_twin_slice.md`.

---

## Dependencies and Execution Order

### Phase Dependencies

- Phase 1 has no dependencies.
- Phase 2 depends on Phase 1 contracts and fixtures.
- Phase 3 depends on Phase 2 runtime projection types and helpers.
- Phase 4 depends on Phase 3 telemetry-authoritative rendering and command projection.
- Phase 5 depends on Phase 4 command lifecycle integration.
- Phase 6 depends on implementation and proof tasks from Phases 1-5.

### Task Dependencies

- T002 depends on T001.
- T005 depends on the fixture shape from T004.
- T006 depends on the saved profile and catalog contracts from T001-T005.
- T007 depends on the current binding profile API shape.
- T008-T009 depend on T006.
- T010 depends on T008-T009.
- T011 depends on T006 and command lifecycle vocabulary from T001-T002.
- T014-T015 depend on T005 and T007.
- T016 depends on T009, T011, T014, and T015.
- T017-T018 depend on T016.
- T019 depends on T001-T002.
- T020-T021 depend on T005, T016, T017, and T022-T025.
- T022 depends on T011.
- T023 depends on T002, T016, and T022.
- T024-T027 depend on T017, T022, and T023.
- T028 depends on T008-T010.
- T029-T030 depend on T023-T027.
- T031-T034 depend on T022-T027.
- T035-T038 depend on their corresponding implementation and test tasks.
- T039 depends on T035-T038 and a running local Cloud plus Client environment.
- T040 depends on T035-T038 and the final automated proof set.
- T041 depends on T039-T040.

## Parallel Opportunities

- T003, T004, and T005 can run in parallel after T001 because they touch separate API export, fixture, and handler files.
- T007 and T008 can run in parallel after T006 because binding normalization and selector compatibility are separate files.
- T012 and T013 can be drafted in parallel once T010 defines the expected projection behavior.
- T019 can run in parallel with Dashboard rendering work because it targets the shared command API wrapper.
- T024 and T025 can run in parallel if ownership inside `DashboardVisualSurface.tsx` is coordinated around separate widget types.
- T028 and T029 can run in parallel after command projection and command UI affordances exist.
- T035-T037 can run in parallel after all focused tests are implemented.

## Parallel Example: User Story 2

```text
Task: "Add command API unit coverage for successful confirmation and normalized Cloud/Edge timeout, failed, unavailable, and generic network/API outcomes in client/tests/unit/commandsApi.test.ts"
Task: "Render an executable toggle command affordance with a stable accessible interaction anchor for compatible toggle widgets, deriving desired boolean as the inverse of the telemetry-projected actual boolean and never writing the desired value into actual visual state in client/src/features/dashboard/components/DashboardVisualSurface.tsx"
Task: "Render an executable slider command affordance with a stable accessible interaction anchor for compatible slider widgets, using catalog min/max when present and sending set_number only from commit/release handlers in client/src/features/dashboard/components/DashboardVisualSurface.tsx"
```

## Implementation Strategy

### MVP First

1. Complete Phase 1 and Phase 2 to create stable command API, profile, catalog, projection, and lifecycle anchors.
2. Complete Phase 3 so Dashboard stays a correct telemetry digital twin even when command controls are unavailable.
3. Complete Phase 4 for compatible toggle and slider command execution.
4. Complete Phase 5 to lock down suppression and failure behavior.
5. Complete focused verification, manual browser smoke, and Technical Lead Review.

### Validation Bias

- Prefer pure projection tests for compatibility and suppression rules.
- Prefer one Dashboard integration proof for toggle and one for slider rather than a broad UI matrix.
- Prefer command API unit coverage for response normalization because `apiClient` throws on non-2xx responses.
- Do not test decorative copy, layout classes, grid appearance, or visual composition unless it is a stable runtime behavior anchor.

## Acceptance Checks

- Dashboard loads profiles with separate `widgetBindings[]` and `commandBindings[]`.
- Legacy profiles without `commandBindings` behave as `commandBindings: []`.
- Runtime projection keeps reported-state wiring and desired-command wiring separate.
- Telemetry-bound number, text, LED, toggle, and slider widgets render actual state from saved `widgetBindings[]`.
- Toggle sends `set_bool` only when its saved command binding, saved reported telemetry binding, widget type, and current catalog command capability are compatible.
- Slider sends `set_number` only on commit/release and only when its saved command binding, saved reported telemetry binding, widget type, and current catalog command capability are compatible.
- Display widgets, LED, text, number display, button, and unsupported widgets do not send commands.
- Command controls are disabled or unavailable when the saved command binding is missing, the reported metric telemetry binding is missing, widget type is incompatible, or the current catalog no longer contains the capability.
- Stale `commandBindings[]` entries do not invalidate Dashboard recovery state and do not block telemetry rendering.
- Dashboard keeps telemetry-bound visual state rendering when catalog loading fails, while command controls are unavailable.
- Pending UI is visible while a command request is in flight.
- Confirmed-waiting-telemetry UI is visible after command confirmation and before a telemetry update for the bound reported metric.
- Error or timeout UI is visible after failed command execution.
- Command response handling distinguishes confirmed, Cloud RPC timeout, Edge timeout, Edge failure, Edge unavailable, and generic network/API failure.
- Command compatibility rejects a saved `widgetBinding` whose `metric` matches `reportedMetric` but whose `deviceId` or `widgetId` does not match the command binding/capability.
- Actual visual state does not change from command payload alone.
- Telemetry update after command changes the visual state.
- Telemetry mismatch after command is rendered as actual state, not overridden by desired command value.
- Reload preserves separation between `widgetBindings[]` and `commandBindings[]`.
- Dashboard command execution uses only the Cloud command API.
- No Client code reads Edge YAML, raw Edge config, registers, or source mappings.

## Manual Browser Smoke

Manual browser smoke MUST run against the Dashboard UI and Cloud APIs. Do not count smoke as successful if Cloud storage is seeded in a way that bypasses the same API path the Dashboard uses, or if Dashboard reads Edge YAML/config directly.

### Manual Setup

1. Start Cloud and Client locally with a USER-owned diagram and a trusted `Active` Edge Server.
2. Ensure `GET /api/edge-servers/:edgeId/catalog` returns at least one `set_bool` command with `reportedMetric` and one `set_number` command with `reportedMetric`.
3. Ensure the saved binding profile contains separate `widgetBindings[]` for reported metrics and `commandBindings[]` for desired command targets.
4. Ensure the diagram contains telemetry-bound `toggle`, `slider`, `led`, `number-display`, `text-display`, at least one unsupported/display-only widget, and a `button`.
5. Open Dashboard for `?diagramId=:diagramId&edgeId=:edgeId`.
6. Open browser DevTools Network or equivalent request capture before triggering commands.

### Manual Checks Covered By T039

1. Verify telemetry-bound `number-display` renders the latest reported numeric telemetry value.
2. Verify telemetry-bound `text-display` renders the latest reported string telemetry value.
3. Verify telemetry-bound `led` renders the reported boolean state and exposes no command action.
4. Verify telemetry-bound `toggle` renders the reported boolean actual state before any command is sent.
5. Verify telemetry-bound `slider` renders the reported numeric actual state before any command is sent.
6. Verify command-capable `toggle` is enabled only when the saved `commandBinding`, saved reported `widgetBinding`, widget type, and catalog command capability are compatible.
7. Trigger a compatible `toggle` and verify exactly one `POST /api/edge-servers/:edgeId/commands` request with `commandType: "set_bool"` and `payload.value`.
8. Verify the `toggle` actual visual state does not change immediately from the desired payload.
9. Verify pending UI is visible while the toggle command request is in flight.
10. Verify confirmed-waiting-telemetry UI is visible after a confirmed toggle command before telemetry changes.
11. Emit or wait for telemetry on the toggle reported metric and verify the toggle visual state changes from telemetry.
12. Verify command-capable `slider` is enabled only when the saved `commandBinding`, saved reported `widgetBinding`, widget type, and catalog command capability are compatible.
13. Move a compatible `slider` without commit/release and verify no command request is sent during intermediate movement.
14. Commit/release the compatible `slider` and verify exactly one `POST /api/edge-servers/:edgeId/commands` request with `commandType: "set_number"` and `payload.value`.
15. Verify the `slider` actual visual state does not change immediately from the desired payload.
16. Verify pending UI is visible while the slider command request is in flight.
17. Verify confirmed-waiting-telemetry UI is visible after a confirmed slider command before telemetry changes.
18. Emit or wait for telemetry on the slider reported metric and verify the slider visual state changes from telemetry.
19. Force a command error, timeout, unavailable state, or network failure and verify pending clears.
20. Verify command error or unavailable UI is visible for the affected widget or diagnostics path.
21. Verify the actual widget visual state remains the last telemetry-rendered value after command error, timeout, unavailable state, or network failure.
22. Verify catalog load failure or missing catalog capability leaves telemetry-bound widgets rendered while command controls are disabled or unavailable.
23. Verify unsupported widgets, display-only widgets, LED, text display, number display, and `button` do not show an executable command action.
24. Verify trying keyboard and pointer interaction on disabled or unsupported controls does not send a command request.
25. Reload the page and verify `widgetBindings[]` telemetry rendering and `commandBindings[]` command availability are still consumed separately.
26. Verify Dashboard route selection, Edge selection, existing reconnect/status surfaces, and visual render recovery still behave as before the slice.

### Test-Required Coverage Covered By T040

These items require automated proof because manual smoke is either too brittle, too easy to miss, or cannot reliably inspect internal separation:

1. Projection keeps `widgetBindings[]` and `commandBindings[]` as separate inputs and separate runtime outputs.
2. Legacy profiles without `commandBindings` normalize to `commandBindings: []`.
3. Command compatibility requires exact `widgetId`, exact `deviceId`, and `metric === catalogCommand.reportedMetric`.
4. Stale `commandBindings[]` entries are non-executable and do not invalidate Dashboard telemetry rendering.
5. Dashboard does not infer capabilities from labels, widget names, telemetry history, or free text.
6. Toggle command execution requires compatible `toggle -> set_bool` binding, compatible reported telemetry binding, and current catalog capability.
7. Slider command execution requires compatible `slider -> set_number` binding, compatible reported telemetry binding, and current catalog capability.
8. Slider sends no command stream during intermediate value changes and sends only on commit/release.
9. Command API wrapper normalizes confirmed, Cloud RPC timeout, Edge timeout, Edge failure, Edge unavailable, generic API failure, and network failure.
10. `confirmed` clears pending and enters confirmed-waiting-telemetry without mutating actual visual state.
11. Actual visual state remains telemetry-driven after command success, failure, timeout, unavailable state, and network failure.
12. Telemetry mismatch after a command is rendered as actual state instead of being overwritten by desired command value.
13. Catalog load failure disables command controls without putting the whole Dashboard into visual recovery failure.
14. Unsupported/display-only widgets, LED, text display, number display, and `button` cannot call `onCommandCommit`.
15. Disabled and unavailable command controls cannot send commands through keyboard, pointer, or fallback rendering paths.
16. Command lifecycle errors remain local to the affected widget and do not wipe last telemetry values during reconnect.

Manual smoke notes after implementation:

- Pending.

Automated proof notes after implementation:

- `cmd /c npm run test -- dashboardRuntimeProjection` from `client` passed on 2026-05-07: 1 file, 10 tests. Coverage records that runtime projection keeps `widgetBindings[]` and `commandBindings[]` as separate inputs and outputs, legacy profiles normalize to `commandBindings: []`, command compatibility requires exact `widgetId`, exact `deviceId`, and `metric === catalogCommand.reportedMetric`, stale `commandBindings[]` entries are non-executable, catalog capability selection uses the exact reported telemetry binding instead of labels or partial matches, command bindings alone do not enable execution, and invalid command bindings do not invalidate telemetry rendering.
- `cmd /c npm run test -- commandsApi` from `client` passed on 2026-05-07: 1 file, 8 tests. Coverage records Cloud command API use through `/edge-servers/:edgeId/commands`, successful `confirmed` normalization, `cloud_rpc_timeout`, `edge_command_timeout`, `edge_command_failed`, `edge_unavailable`, generic API failure, network failure, and unexpected response normalization.
- `cmd /c npm run test -- DashboardPage` from `client` passed on 2026-05-07: 1 file, 22 tests. Coverage records compatible `toggle -> set_bool` command dispatch through the Cloud API, compatible `slider -> set_number` dispatch only on commit/release, no slider command stream during intermediate changes, pending and confirmed-waiting-telemetry UI, no optimistic actual-state mutation before telemetry, actual visual state changing only after reported telemetry, command failure/timeout/unavailable/network outcomes clearing pending while preserving last telemetry-rendered values, reconnect preserving last values with local command errors, unsupported/display-only/LED/text/number/button widgets having no executable action, and disabled/unavailable controls not sending commands through pointer, keyboard, or fallback paths.
- `cmd /c npm run build` from `client` passed on 2026-05-07. Source review for this proof confirmed Dashboard command dispatch uses `executeEdgeServerCommand(...)`, catalog compatibility uses `getEdgeServerCatalog(...)`, saved binding profiles are normalized through the Cloud bindings API, and Client code does not read Edge YAML, raw Edge config, registers, or source mappings for this runtime behavior.
- This automated proof does not close manual browser smoke or Technical Lead Review. T039 and T041 remain open until Dashboard UI plus live Cloud API smoke and final boundary review are recorded.

## Technical Lead Review

Review this plan and implementation for source-of-truth boundaries, command response mapping, catalog failure behavior, exact `reportedMetric` matching, telemetry-authoritative visuals, command suppression, Lean Testing Policy, and scope leakage.

- [ ] Verify Dashboard consumes commands only from the sanitized Cloud catalog.
- [ ] Verify Dashboard command execution uses only `POST /api/edge-servers/:edgeId/commands`.
- [ ] Verify no Client code reads Edge YAML, raw Edge config, registers, or source mappings.
- [ ] Verify `widgetBindings[]` and `commandBindings[]` remain separate in types, projection, UI behavior, tests, and payloads.
- [ ] Verify legacy binding profiles load with `commandBindings: []`.
- [ ] Verify command compatibility requires exact `widgetId`, exact `deviceId`, and `metric === reportedMetric`.
- [ ] Verify stale `commandBindings[]` entries are non-executable without invalidating telemetry rendering.
- [ ] Verify `toggle` support is tied to saved widget type `toggle` and `set_bool`.
- [ ] Verify `slider` support is tied to saved widget type `slider` and `set_number`.
- [ ] Verify slider sends only on commit/release.
- [ ] Verify unsupported/display-only widgets do not execute commands.
- [ ] Verify command execution uses accessible runtime-owned interaction anchors rather than canvas-only decorative shapes.
- [ ] Verify command response mapping distinguishes `confirmed`, `cloud_rpc_timeout`, `edge_command_timeout`, `edge_command_failed`, `edge_unavailable`, and generic network/API failure.
- [ ] Verify `confirmed` clears pending but does not mutate actual visual state.
- [ ] Verify telemetry mismatch after command is rendered as actual state.
- [ ] Verify catalog load failure disables commands without blocking telemetry rendering.
- [ ] Verify existing Dashboard route, selection, transport reconnect, edge availability, and visual render recovery behavior still pass.
- [ ] Verify proof remains lean and behavior-oriented.
- [ ] Verify no Constructor authoring, Cloud audit, Edge RPC, Presence Lock, retry/replay, or button-command work leaked into this slice.

Technical Lead Review notes after implementation:

- Pending.

## Review Trigger

Review this plan if the catalog shape changes, the binding profile shape changes, command endpoint behavior changes, Dashboard widget type names change, button commands enter scope, command types beyond `set_bool` and `set_number` enter scope, or telemetry subscription semantics change.
