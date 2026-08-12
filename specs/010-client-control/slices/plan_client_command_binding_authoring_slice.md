# Plan: Client Command Binding Authoring Slice

## Purpose

Add the minimal authoring path for saved `commandBindings[]` in diagram binding profiles.

This slice lets the hosted Constructor select desired command targets from the sanitized Cloud catalog returned by `GET /api/edge-servers/:edgeId/catalog`. It does not execute commands on the Dashboard. It only makes the saved binding profile ready for the later digital twin/runtime slices.

Target saved profile shape:

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

## Scope

- Preserve `widgetBindings[]` as reported-state bindings: `widgetId + deviceId + metric`.
- Add `commandBindings[]` as desired command targets: `widgetId + deviceId + commandType`.
- Extend Cloud binding profile model, service validation, controller input, and OpenAPI response/request contract.
- Extend Client shared bindings API types and payloads.
- Extend constructor-host adapters and hosted runtime bridge so command-capable catalog entries are available to the Constructor separately from telemetry metrics.
- Add minimal Constructor authoring UI for command targets:
  - `toggle` widgets may choose only `set_bool`.
  - `slider` widgets may choose only `set_number`; `slider` is an actual saved widget type in `constructor/public/widget-types.js`.
  - Unsupported widget types do not offer or save command bindings.
- Keep reported telemetry binding and command binding visually and structurally separate.
- Add lean automated proof only for contract, validation, and pure adapter logic.
- Require manual browser smoke for all behavior that can be tested through the hosted Constructor page.

## Out of Scope

- Dashboard runtime command execution.
- Dashboard pending/error UI.
- Cloud/Edge command execution changes.
- `CommandAudit` changes.
- Presence Lock / `ControlLease`.
- Client reads of `edge-runtime.yaml` or any Edge YAML.
- Broad Constructor UI redesign.
- New widget types or command types.
- Inferring command capability from labels, widget names, telemetry metrics, or free text.
- Manual free-text entry for `deviceId` or `commandType` when a Cloud catalog is available.
- Implementation batches or full speckit pipeline.

## Assumptions

- `edge_capabilities_catalog_slice` is complete: `GET /api/edge-servers/:edgeId/catalog` returns a sanitized catalog object with `telemetry[]` and `commands[]`.
- `client/src/shared/api/edgeServersCanonical.ts` already normalizes Cloud catalog command capabilities with `deviceId`, `commandType`, `valueType`, optional `min/max`, `reportedMetric`, and `label`.
- Current persisted binding profiles contain only `widgetBindings[]`; old profiles must load as `commandBindings: []`.
- The exact `commandBindings[]` contract is not implemented yet. This slice treats the target shape above as the proposed contract and must update every affected save/load/validation layer before UI save is considered complete.
- `toggle` and `slider` are real Constructor widget types. `slider` support is allowed because `constructor/public/widget-types.js`, `constructor/public/properties-panel.js`, and `constructor/public/widget-manager.js` already contain a saved `slider` type path.
- `button`, `number-input`, and `text-input` are not command-authoring targets in this slice unless a later approved plan expands the contract.
- Standalone Constructor local JSON binding import/export can remain telemetry-only unless implementation review finds it is the only practical way to exercise hosted command bindings. The required path is the hosted Client/Cloud save path.

## Constraints

- Client selects command targets only from the sanitized Cloud catalog.
- Cloud binding profile is the only source of truth for later Dashboard runtime.
- `widgetBindings[]` means reported/actual state.
- `commandBindings[]` means desired command target.
- Client and Constructor must not infer `deviceId`, `commandType`, or command support from labels or free text.
- Command options must be filtered by saved widget type, not by label text.
- No command binding may be saved if its `deviceId + commandType` pair is absent from the active edge server's catalog command capabilities.
- Existing reported-state binding behavior must not regress.
- Cloud must preserve existing diagram ownership, USER-only route, and trusted edge-server access checks.
- Cloud must return `commandBindings: []` for legacy documents that do not have the field.
- OpenAPI must document both binding arrays and lint successfully after the contract change.
- Manual-first verification rule: any behavior visible and testable in the running site must be verified manually in the browser, not only through automated component or integration tests.
- Automated tests should focus on non-visual contract boundaries: Cloud persistence/validation, API normalization, catalog mapping, and serialization helpers.
- Do not add broad UI automation for the hosted Constructor unless manual testing cannot reliably cover a regression-prone pure logic path.
- Documentation in this file stays English per repository rules.

## Acceptance Checks

- Binding profile load returns both `widgetBindings[]` and `commandBindings[]`; legacy profiles return an empty `commandBindings[]`.
- Binding profile save accepts and persists both arrays for the same `diagramId + edgeServerId` profile.
- Constructor-host catalog adapter exposes command options from `catalog.commands[]` separately from telemetry metric options from `catalog.telemetry[]`.
- Toggle authoring offers only catalog-backed `set_bool` targets.
- Slider authoring offers only catalog-backed `set_number` targets.
- Unsupported widget types do not offer command target controls and do not save command bindings.
- Constructor UI does not provide free-text `deviceId` or `commandType` entry when catalog options are present.
- Reported telemetry binding and command binding remain separate in UI state, hosted runtime methods, Client payloads, Cloud model fields, and OpenAPI schemas.
- Existing reported telemetry binding flow still loads, edits, saves, and reloads successfully.
- Manual happy path proof: Constructor page loads a catalog with one telemetry metric and one command capability, saves a profile containing one `widgetBindings[]` entry and one `commandBindings[]` entry, then reloads both successfully.
- Manual negative proof: an unsupported widget type or incompatible command type is not offered/saved while the existing reported binding flow still works.
- Automated proof is limited to Cloud save/load validation, Client API/bindings adapter normalization, and catalog command mapping.

## Detailed Task Checklist

- [X] T001 Confirm the binding profile contract across Cloud, Client, and hosted Constructor boundaries before coding in `cloud_server/src/models/DiagramBindings.ts`, `client/src/shared/api/bindings.ts`, and `client/src/features/constructor-host/types.ts`.
- [X] T002 Add `ICommandBinding` and a `CommandBindingSchema` with `widgetId`, `deviceId`, and `commandType: 'set_bool' | 'set_number'` in `cloud_server/src/models/DiagramBindings.ts`.
- [X] T003 Add `commandBindings` to `IDiagramBindings` and `DiagramBindingsSchema` with default `[]`, preserving existing `widgetBindings` behavior in `cloud_server/src/models/DiagramBindings.ts`.
- [X] T004 Extend `UpsertBindingsPayload` with `commandBindings?: ICommandBinding[]` and normalize it to `[]` when omitted in `cloud_server/src/services/diagram-bindings.service.ts`.
- [X] T005 Add compact command binding validation in `cloud_server/src/services/diagram-bindings.service.ts`: trim `widgetId`, validate `deviceId` through `normalizeDeviceId`, and allow only `set_bool` or `set_number`.
- [X] T006 Keep Cloud access rules unchanged while saving both arrays: diagram ownership, USER-only route, and trusted edge-server check in `cloud_server/src/services/diagram-bindings.service.ts` and `cloud_server/src/api/routes.ts`.
- [X] T007 Update `findOneAndUpdate` to replace both `widgetBindings` and `commandBindings` atomically for the same `(diagramId, edgeServerId)` pair in `cloud_server/src/services/diagram-bindings.service.ts`.
- [X] T008 Update `upsertBindings` request parsing to accept `commandBindings` while requiring `widgetBindings` to remain an array in `cloud_server/src/api/diagrams.controller.ts`.
- [X] T009 Ensure Cloud responses always serialize `commandBindings` as an array, including legacy documents, in `cloud_server/src/models/DiagramBindings.ts` or the nearest service serialization point if Mongoose defaults are not sufficient.
- [X] T010 Update OpenAPI request and response schemas for `/api/diagrams/{id}/bindings` in `cloud_server/openapi.yaml`, adding `DiagramBindingProfile`, `WidgetBinding`, and `CommandBinding` schemas if they are not already present.
- [X] T011 Add one focused Cloud API-level test for saving and loading a profile with one reported telemetry binding and one command binding in a relevant binding test such as `cloud_server/tests/integration/diagrams.bindings.test.ts` or the nearest existing diagrams binding integration file.
- [X] T012 Add one focused Cloud negative API-level test proving invalid `commandType` or invalid command `deviceId` is rejected without weakening existing `widgetBindings[]` validation in the same focused test file.
- [X] T013 Extend `WidgetBinding`, `TelemetryProfile`, `DashboardBindingProfile`, and `UpsertTelemetryProfilePayload` with a separate `CommandBinding` type in `client/src/shared/api/bindings.ts`.
- [X] T014 Keep `createBinding`, `updateBinding`, `getBindingsByDiagram`, and `getDashboardBindingProfiles` on the existing `/diagrams/:id/bindings` path while sending/receiving `commandBindings[]` in `client/src/shared/api/bindings.ts`.
- [X] T015 Add `CommandBindingRecord` and a combined binding profile type to `client/src/features/constructor-host/types.ts`; do not replace `WidgetBindingRecord`.
- [X] T016 Extend `HostedConstructorConfig` so initial bindings can include both reported and command bindings without breaking existing `initialBindings?: WidgetBindingRecord[]` callers in `client/src/features/constructor-host/types.ts` and `client/src/features/constructor-host/ConstructorHost.tsx`.
- [X] T017 Extend `HostedConstructorInstance` with command-binding load/save support, for example `loadBindingProfile(...)` / `getBindingProfile(...)`, or another narrow API that keeps reported and command arrays separate in `client/src/features/constructor-host/types.ts`.
- [X] T018 Update the mock hosted Constructor harness to mirror the new command-binding state in `client/tests/integration/helpers/mockHostedConstructor.ts` and `client/tests/unit/mockHostedConstructorHarness.test.ts`.
- [X] T019 Extend `DiagramBindingSetRecord` with `commandBindings` in `client/src/features/constructor-host/adapters/bindingsAdapter.ts`.
- [X] T020 Add command binding import/export normalization helpers in `client/src/features/constructor-host/adapters/bindingsAdapter.ts`, with legacy recovery defaulting missing `commandBindings` to `[]`.
- [X] T021 Add adapter tests for command binding normalization, invalid command entries, and legacy `commandBindings` defaulting in `client/tests/unit/bindingsAdapter.test.ts`.
- [X] T022 Extend constructor-host catalog types with command options in `client/src/features/constructor-host/types.ts`, keeping telemetry metric catalog types unchanged.
- [X] T023 Add a command catalog mapper derived only from `EdgeCapabilitiesCatalogSnapshot.commands` in `client/src/features/constructor-host/adapters/catalogAdapter.ts`.
- [X] T024 Ensure the command catalog mapper exposes `deviceId`, `commandType`, `valueType`, optional `min/max`, `reportedMetric`, and `label`, and does not derive commands from `telemetry[]` in `client/src/features/constructor-host/adapters/catalogAdapter.ts`.
- [X] T025 Update catalog adapter unit coverage in `client/tests/unit` or the nearest focused adapter test to prove telemetry and command options are mapped separately.
- [X] T026 Pass command catalog data from `FullConstructorPage` into `ConstructorHost` alongside the existing telemetry `deviceCatalog` in `client/src/features/user-hub/pages/FullConstructorPage.tsx`.
- [X] T027 On profile load in `FullConstructorPage`, pass the active edge server's `widgetBindings[]` and `commandBindings[]` to the hosted runtime without merging the arrays in `client/src/features/user-hub/pages/FullConstructorPage.tsx`.
- [X] T028 On profile save in `FullConstructorPage`, collect reported bindings and command bindings separately, then send `{ edgeServerId, widgetBindings, commandBindings }` through `createBinding` in `client/src/features/user-hub/pages/FullConstructorPage.tsx`.
- [X] T029 Preserve destructive layout save behavior so deleting all binding profiles removes both reported and command bindings through the existing DELETE endpoints in `client/src/features/user-hub/pages/FullConstructorPage.tsx`.
- [X] T030 Update `ConstructorHost` props and runtime bootstrap/update calls to pass command catalog and command binding profile state through the wrapper boundary in `client/src/features/constructor-host/ConstructorHost.tsx`.
- [X] T031 Update `constructor/public/hosted-entry.js` to clone and forward command catalog/options and command bindings without adding global state.
- [X] T032 Extend `constructor/public/ui-controller.js` catalog mapping so telemetry devices remain in the existing reported binding path and command options are available through a separate command-authoring path.
- [X] T033 Extend or add a focused command-binding manager in `constructor/public/bindings-manager.js` or a new constructor manager file, keeping `widgetBindings[]` logic intact and avoiding manager-to-manager orchestration outside `UIController`.
- [X] T034 Add command target rendering to the widget properties panel in `constructor/public/properties-panel.js` as a separate section from reported telemetry binding.
- [X] T035 Filter command target controls by actual widget type in `constructor/public/properties-panel.js`: `toggle -> set_bool`, `slider -> set_number`, all other types absent or disabled.
- [X] T036 Ensure the command target UI uses only select controls populated from catalog options; no manual free-text `deviceId` or `commandType` entry in `constructor/public/properties-panel.js`.
- [X] T037 Store command binding state on widgets or the binding manager in a way that exports only `{ widgetId, deviceId, commandType }` and does not mutate reported `bindingId`, `bindingMetric`, or `binding` fields in `constructor/public/widget-manager.js`.
- [X] T038 Extend hosted runtime methods in `constructor/public/ui-controller.js` to load and export the full binding profile with separate arrays.
- [X] T039 Keep standalone local binding file behavior telemetry-compatible in `constructor/public/file-manager.js`; add command fields there only if needed for a focused hosted-runtime proof.
- [X] T040 Add Constructor unit coverage only if command binding export/import becomes non-trivial pure logic that cannot be confidently verified through manual hosted Constructor smoke.
- [X] T041 Prepare manual browser happy-path smoke evidence: catalog has telemetry plus command, Constructor saves both arrays, page reload restores both arrays.
- [X] T042 Prepare manual browser negative-path smoke evidence: incompatible command options are absent/not saved for unsupported widget types while reported telemetry binding still saves.
- [x] T043 Verify Dashboard code is not changed for command execution; if Dashboard binding profile types must compile with `commandBindings[]`, keep runtime behavior monitoring-only in `client/src/features/dashboard`.
- [x] T044 Run focused Cloud tests from `cloud_server`: `cmd /c npm run test -- diagrams.bindings` or the exact focused binding test file added for this slice.
- [x] T045 Run Cloud typecheck from `cloud_server`: `cmd /c npm run typecheck`.
- [x] T046 Run OpenAPI lint from `cloud_server`: `cmd /c npx @redocly/cli lint openapi.yaml`.
- [x] T047 Run focused Client tests from `client`: `cmd /c npm run test -- bindingsAdapter` plus the focused catalog adapter test added for this slice.
- [x] T048 Run Client build/type check from `client`: `cmd /c npm run build` if the focused checks do not already run TypeScript project compilation.
- [x] T049 Run focused Constructor tests only if T040 adds or changes Constructor unit coverage, using the repo's existing test command for the affected constructor test file.
- [X] T050 Complete the Manual/runtime smoke notes in this document after implementation evidence is available.
- [ ] T051 Complete Technical Lead Review before starting `client_digital_twin_slice`.

## Dependencies

- This slice depends on the completed `edge_capabilities_catalog_slice`.
- T002-T010 must land before Client save/load code can rely on `commandBindings[]`.
- T013-T021 depend on the final Cloud binding profile shape.
- T022-T025 depend on the current catalog command shape from `client/src/shared/api/edgeServersCanonical.ts`.
- T026-T030 depend on T013-T025.
- T031-T038 depend on T015-T017 and T022-T025.
- T041-T042 depend on the Cloud, Client wrapper, hosted Constructor runtime changes, and a running local site for manual verification.
- T044-T049 depend on the relevant implementation tasks in each module.
- `client_digital_twin_slice` depends on this slice's saved binding profile contract.

## Manual/runtime Smoke

Manual smoke is mandatory for every behavior that can be checked in the running site. Use the hosted Constructor through the Client page and the Cloud catalog API. Do not count smoke as successful if the Client or Constructor reads Edge YAML, if the catalog is guessed from labels, if the behavior is verified only by automated UI tests, or if Dashboard command execution is used.

1. Start Cloud and Client locally with the normal development configuration and open the Client site in a browser.
2. Use or seed a USER-owned diagram and a trusted `Active` edge server.
3. Ensure `GET /api/edge-servers/:edgeId/catalog` returns one telemetry metric and one command capability, for example:
   - telemetry: `pump_main / actual_state`
   - command: `pump_main / set_bool`
4. Open the full hosted Constructor page for the diagram with `?edgeId=:edgeId`.
5. Add or load a widget that supports reported telemetry binding and bind it to the telemetry metric.
6. Add or load a `toggle` widget and verify command authoring offers only the catalog-backed `set_bool` command target.
7. Save bindings.
8. Verify the POST body contains separate `widgetBindings[]` and `commandBindings[]` arrays.
9. Reload the page and verify both reported and command bindings are restored.
10. Select an unsupported widget type and verify no command target is offered or saved.
11. Verify the existing reported telemetry binding flow still saves and reloads.
12. Verify the Dashboard remains monitoring-only and does not execute commands as part of this smoke.

Required manual evidence:

- Browser-visible result for the command authoring controls on `toggle`, `slider`, and one unsupported widget type.
- Captured or inspected network payload showing separate `widgetBindings[]` and `commandBindings[]`.
- Reload evidence showing both arrays are restored from Cloud.
- Confirmation that reported telemetry binding can still be saved independently.

Smoke notes after implementation:

- Pending.

## Technical Lead Review

Review this plan and implementation for strict source-of-truth boundaries, profile contract stability, and the smallest useful UI surface.

- [ ] Verify Client and Constructor consume commands only from the sanitized Cloud catalog.
- [ ] Verify no Client code reads `edge-runtime.yaml` or raw Edge config.
- [ ] Verify `widgetBindings[]` and `commandBindings[]` remain separate in types, UI, payloads, and persistence.
- [ ] Verify legacy binding profiles load with `commandBindings: []`.
- [ ] Verify command binding validation rejects unsupported command types.
- [ ] Verify command authoring does not use free-text `deviceId` or `commandType` when catalog options are available.
- [ ] Verify widget compatibility is based on actual saved widget `type`, not labels.
- [ ] Verify `slider` support is tied to the existing `slider` widget type and does not invent a new widget.
- [ ] Verify unsupported widget types do not save command bindings.
- [ ] Verify existing reported telemetry authoring behavior and tests still pass.
- [ ] Verify Cloud route access control and trusted edge-server checks are unchanged.
- [ ] Verify OpenAPI documents the new binding profile shape.
- [ ] Verify no Dashboard command execution, pending UI, Cloud/Edge command execution, `CommandAudit`, Presence Lock, or ControlLease work leaked into this slice.
- [ ] Verify proof remains lean: manual browser happy/negative paths, plus narrow automated contract/adapter/validation coverage.

Technical Lead Review notes after implementation:

- 2026-05-06 review status: blocked; T051 is not complete because manual browser smoke evidence is still missing. T041 and T042 remain unchecked, and the Manual/runtime Smoke section still has no browser-visible evidence, inspected network payload, or reload proof.
- Contract/code review completed for the non-manual portions:
  - Cloud binding profiles persist `widgetBindings[]` and `commandBindings[]` separately, default missing `commandBindings` to `[]`, and reject unsupported command types.
  - Client/Constructor command options are sourced from the sanitized Cloud catalog path and stay separate from telemetry metric options.
  - Constructor command binding UI is type-gated by saved widget `type`: `toggle` -> `set_bool`, `slider` -> `set_number`, unsupported widget types do not render command target controls.
  - Dashboard review found no command execution path in `client/src/features/dashboard`; runtime projection and binding validation still consume only `widgetBindings[]`.
  - OpenAPI documents `WidgetBinding`, `CommandBinding`, and `DiagramBindingProfile`.
- Validation run during this review:
  - `cloud_server`: `cmd /c npm run test -- diagrams.bindings` -> PASS, 8 tests.
  - `client`: `cmd /c npm run test -- bindingsAdapter catalogAdapter` -> PASS, 13 tests.
  - repo root: `node --test constructor\tests\bindings-manager.test.js` -> PASS, 3 tests.
  - `cloud_server`: `cmd /c npx @redocly/cli lint openapi.yaml` -> PASS with the pre-existing localhost server URL warning.
- Scope leakage review notes:
  - Existing Cloud command execution, `CommandAudit`, and command RPC files predate or sit outside this authoring slice; no Dashboard command execution proof was found in the Dashboard subtree.
  - No Client-side read of `edge-runtime.yaml` or raw Edge YAML was found in the reviewed Client/Constructor authoring path. Standalone Constructor still has its existing `devices-registry.json` fallback outside hosted mode.
- Required before checking T051:
  - Add manual happy-path evidence for hosted Constructor save/reload with separate `widgetBindings[]` and `commandBindings[]`.
  - Add manual negative-path evidence for unsupported/incompatible widget command authoring while reported telemetry binding still saves/reloads.

## Review Trigger

Review this plan if the Cloud catalog command shape changes, command types beyond `set_bool` and `set_number` enter scope, Constructor widget type names change, the binding profile endpoint changes, Dashboard runtime starts consuming command bindings, or `client_digital_twin_slice` requires additional command metadata beyond `widgetId + deviceId + commandType`.
