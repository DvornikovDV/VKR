# Input Pack Draft: Button Command Preset Slice

This is a working Input Pack draft for a later `doc/slices.md` Stage 1 run.
It is not the slice plan and does not perform Stage 1.

## Slice Name

`button command preset`

## Proposed Plan Path

`specs/010-client-control/slices/plan_button_command_preset_slice.md`

## Source Of Truth Docs

- `doc/slices.md`
- `doc_cursed/button_command_preset_plan.md`
- `doc_cursed/cloud_client_control_plan.md`
- `doc_cursed/edge_control_plan.md`
- `specs/009-edge-capabilities/slices/plan_edge_capabilities_catalog_slice.md`
- `specs/009-edge-cloud-rpc/slices/plan_edge_rpc_bridge_slice.md`
- `specs/010-client-control/slices/plan_client_command_binding_authoring_slice.md`
- `specs/010-client-control/slices/plan_client_digital_twin_slice.md`

## Similar Completed Slice Plans

- `specs/010-client-control/slices/plan_client_command_binding_authoring_slice.md`
- `specs/010-client-control/slices/plan_client_digital_twin_slice.md`
- `specs/009-edge-capabilities/slices/plan_edge_capabilities_catalog_slice.md`
- `specs/007-edge-server/slices/plan_set_bool_slice.md`
- `specs/007-edge-server/slices/plan_set_number_slice.md`

## Relevant Code And Doc Files For Stage 1

- `AGENTS.md`
- `client/AGENTS.md`
- `client/src/features/dashboard/AGENTS.md`
- `constructor/AGENTS.md`
- `constructor/FILE_MAP.md`
- `constructor/public/widget-types.js`
- `constructor/public/widget-manager.js`
- `constructor/public/properties-panel.js`
- `constructor/public/bindings-manager.js`
- `constructor/public/ui-controller.js`
- `constructor/public/hosted-entry.js`
- `constructor/public/file-manager.js`
- `constructor/tests/properties-panel-bindings.test.js`
- `constructor/tests/bindings-manager.test.js`
- `constructor/tests/widget-manager.test.js`
- `client/src/features/constructor-host/types.ts`
- `client/src/features/constructor-host/ConstructorHost.tsx`
- `client/src/features/constructor-host/adapters/bindingsAdapter.ts`
- `client/src/features/constructor-host/adapters/catalogAdapter.ts`
- `client/src/features/user-hub/pages/FullConstructorPage.tsx`
- `client/src/features/user-hub/pages/DashboardPage.tsx`
- `client/src/features/dashboard/model/types.ts`
- `client/src/features/dashboard/model/selectors.ts`
- `client/src/features/dashboard/components/DashboardVisualSurface.tsx`
- `client/src/features/dashboard/hooks/useDashboardCommandLifecycle.ts`
- `client/src/shared/api/bindings.ts`
- `client/src/shared/api/commands.ts`
- `client/tests/unit/bindingsAdapter.test.ts`
- `client/tests/unit/catalogAdapter.test.ts`
- `client/tests/unit/dashboardRuntimeProjection.test.ts`
- `client/tests/integration/DashboardPage.test.tsx`
- `client/tests/fixtures/dashboardVisualLayout.ts`

## Goal

Make the existing `button` widget usable as a command preset button.

A command preset button sends exactly one saved command target with exactly one saved fixed value. It is intended for explicit one-shot operator actions such as:

- `Silence siren` -> `set_bool false`
- `Start` -> `set_bool true`
- `Stop` -> `set_bool false`
- `Reset fault` -> `set_bool true`
- `Valve 50%` -> `set_number 128`

The slice MUST NOT make the button a replacement for `toggle`. `toggle` remains the control for stable binary state; `button` is for named fixed command presets.

## Current Facts

- `constructor/public/widget-types.js` already contains a saved `button` widget type.
- `button` is currently not a command-authoring target in the accepted authoring slice.
- Dashboard command runtime currently supports `toggle -> set_bool` and `slider -> set_number`.
- `client/src/features/dashboard/model/selectors.ts` currently maps command-capable widget types through `COMMAND_WIDGET_TYPES_BY_COMMAND_TYPE` with only `toggle` and `slider`.
- `client/src/features/dashboard/components/DashboardVisualSurface.tsx` currently creates executable DOM interaction anchors for `toggle` and `slider`, not `button`.
- Cloud command API already accepts `set_bool` and `set_number` with `payload.value`.
- Edge execution already supports local `set_bool` and `set_number`.
- The capabilities catalog already exposes command capabilities with `deviceId`, `commandType`, `valueType`, optional `min/max`, `reportedMetric`, and `label`.
- Binding profiles already preserve separate `widgetBindings[]` and `commandBindings[]`.
- The proposed button preset value is a new saved widget config field, not a new Cloud binding field.

## Proposed Contract Shape

Keep the existing command destination in `commandBindings[]`:

```ts
{
  widgetId: string;
  deviceId: string;
  commandType: 'set_bool' | 'set_number';
}
```

Store the fixed preset value on the saved button widget config:

```ts
{
  id: string;
  type: 'button';
  text: 'Silence siren';
  commandValue: false;
}
```

For numeric presets:

```ts
{
  id: string;
  type: 'button';
  text: '50%';
  commandValue: 128;
}
```

This shape is proposed by `doc_cursed/button_command_preset_plan.md`. Stage 1 MUST confirm whether any existing layout serialization, widget cloning, hosted runtime bridge, or tests need a narrower or differently named field.

## Main Boundary

- Constructor owns authoring the button preset value and command target selection.
- Client/Constructor hosted boundary carries the saved widget layout plus existing `commandBindings[]`.
- Cloud remains the storage/API facade for diagrams, binding profiles, capabilities catalog, and command execution.
- Dashboard owns runtime projection, command availability, command lifecycle display, and command dispatch.
- Edge remains the executor of `set_bool` and `set_number`; it must not change in this slice.

## Scope

- Extend Constructor command authoring so `button` can choose catalog-backed `set_bool` and `set_number` command targets.
- Add Constructor UI for a fixed `commandValue` on `button`.
- Validate `button.commandValue` in Constructor against the selected catalog command type and numeric range when available.
- Preserve `commandBindings[]` as the saved command destination and keep reported `widgetBindings[]` separate.
- Persist `button.commandValue` as part of the saved diagram layout/widget config.
- Extend Dashboard runtime projection so `button` can be executable when saved binding, saved preset value, reported telemetry binding, and current catalog capability are compatible.
- Render an accessible runtime-owned interaction anchor for executable `button` widgets.
- Dispatch exactly one Cloud command request when an executable button is pressed.
- Preserve telemetry-authoritative visual state and command lifecycle behavior.
- Add lean automated proof for command availability, command dispatch, invalid preset suppression, and no optimistic physical-state mutation.
- Add manual browser smoke for hosted Constructor authoring/save/reload and Dashboard button execution.

## Out Of Scope

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
- Treating `Silence siren` as alarm ACK or incident reset.
- Broad Constructor UI redesign.
- Dashboard visual redesign unrelated to button command execution.

## Key Invariants

- Client and Constructor MUST consume command targets only from the sanitized Cloud capabilities catalog.
- Client MUST NOT read Edge YAML, raw Edge config, registers, source mappings, telemetry history, labels, or free text to infer command capability.
- `widgetBindings[]` MUST remain reported-state bindings.
- `commandBindings[]` MUST remain desired-command destination bindings.
- `button.commandValue` MUST be a fixed saved preset value; it MUST NOT be inferred from widget text.
- `set_bool` button presets require boolean `commandValue`.
- `set_number` button presets require finite numeric `commandValue`.
- Numeric button presets MUST respect catalog `min` and `max` when present.
- Button command execution MUST use `POST /api/edge-servers/:edgeId/commands`.
- Command HTTP results MUST affect command lifecycle only; they MUST NOT set actual physical visual state.
- Telemetry remains the only source for physical state display.
- A button with missing binding, missing/invalid preset value, missing catalog capability, or missing reported telemetry binding MUST be non-executable.
- Existing `toggle` and `slider` behavior MUST not regress.
- Existing reported telemetry binding behavior MUST not regress.
- Existing unsupported widgets MUST remain non-executable.

## Known Runtime Path

1. User opens hosted Constructor for a diagram and selected Edge.
2. Constructor receives telemetry catalog and command catalog from Client/Cloud.
3. User selects a `button` widget.
4. Constructor shows command target controls for catalog-backed `set_bool` and `set_number` capabilities.
5. User selects a command target and enters/selects a fixed `commandValue`.
6. User saves the diagram layout and binding profile.
7. Cloud stores the layout with `button.commandValue` and the binding profile with separate `widgetBindings[]` and `commandBindings[]`.
8. User opens Dashboard for the same `diagramId + edgeId`.
9. Dashboard loads diagram layout, binding profile, and current catalog.
10. Dashboard projection marks the button executable only if binding, preset value, catalog capability, and reported telemetry binding are compatible.
11. User presses the button.
12. Dashboard sends one Cloud command with `payload.value = button.commandValue`.
13. Button enters pending or command lifecycle UI.
14. Command confirmation/error clears pending state according to existing command lifecycle rules.
15. Actual physical state display changes only after telemetry updates the reported metric.

## Testing Constraints

- Lean Testing Policy applies.
- Automated tests SHOULD extend existing focused suites where possible instead of creating broad new matrices.
- Add one projection proof for executable `button -> set_bool false` with compatible `reportedMetric`.
- Add one projection or runtime proof for executable `button -> set_number` with range-valid preset value.
- Add one critical negative proof for invalid preset value or missing reported telemetry binding suppressing execution.
- Add one Dashboard integration proof that pressing a compatible button sends exactly one Cloud command and does not optimistically mutate actual visual state.
- Add focused Constructor/adapter proof only where preset value normalization or import/export is non-trivial.
- Manual browser smoke MUST cover behavior visible in the hosted Constructor and Dashboard.

## Main Proof

The slice is proven when:

- hosted Constructor can save and reload a `button` with a catalog-backed command binding and fixed `commandValue`;
- Dashboard renders the saved button as executable only when the existing compatibility rules pass;
- pressing `Silence siren` sends one `set_bool false` command through the Cloud API;
- pressing a numeric preset button sends one `set_number` command with the saved value;
- invalid or stale button presets are non-executable and do not call the command endpoint;
- actual visual state remains telemetry-driven before, during, and after button command execution.

## Manual Smoke Notes To Require In The Slice Plan

- Use a trusted active Edge with a catalog containing at least one `set_bool` command and one `set_number` command.
- In hosted Constructor, create or select a `button`, bind it to a `set_bool` command, set `commandValue: false`, and label it `Silence siren`.
- Save and inspect that layout persists the fixed value while binding profile persists the command destination separately.
- Reload Constructor and verify both command target and fixed value are restored.
- Open Dashboard and verify the button is executable only when the matching reported telemetry binding exists.
- Press the button and verify one `POST /api/edge-servers/:edgeId/commands` with `commandType: "set_bool"` and `payload.value: false`.
- Verify no actual visual state changes until telemetry changes.
- Repeat with one valid `set_number` preset inside catalog range.
- Verify an invalid value or missing reported binding disables/suppresses execution.

## Cloud/Edge/Client Boundary Constraints

- Cloud changes should not be needed unless Stage 1 discovers layout serialization rejects unknown widget fields.
- Edge changes should not be needed.
- OpenAPI changes should not be needed unless the saved diagram layout contract is explicitly documented with widget-specific fields in Cloud OpenAPI.
- Client shared API changes should stay limited to existing layout/binding types if needed.
- Constructor changes must respect `UIController` as coordinator and avoid direct manager-to-manager orchestration.
- Dashboard changes must stay inside the native SPA Dashboard feature and use saved Cloud contracts as source of truth.

## Open Questions Or Assumptions

- Assumption: saved diagram layout already preserves unknown widget config fields such as `commandValue`; Stage 1 must verify this before planning persistence tasks.
- Assumption: `commandValue` is the preferred field name; Stage 1 may rename it if existing widget conventions suggest a better stable name.
- Assumption: button visual state can reuse existing command lifecycle badge behavior without a broad Dashboard visual redesign.
- Assumption: numeric preset authoring can use a plain numeric field constrained by catalog `min/max` rather than adding a new input widget type.
- Open question: should a `button` with `set_number` use catalog `min/max` only, or also the button widget's saved `min/max` if present? Prefer catalog `min/max` as command authority unless Stage 1 finds an established local rule.

## Why This Slice Is Separate

This slice crosses Constructor authoring and Dashboard runtime behavior, but it reuses existing Cloud catalog, binding profile, command API, and Edge execution contracts. It is too large for a manual fix batch because it changes command compatibility and execution semantics for a new widget type. It is too small for separate Cloud, Edge, and Client slices because Cloud and Edge contracts should remain unchanged.
