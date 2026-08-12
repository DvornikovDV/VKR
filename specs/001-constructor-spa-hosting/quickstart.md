# Quickstart: Hosted Constructor In SPA

This document describes the intended validation flow for the hosted constructor after implementation.

## Prerequisites

- `cloud_server` is running and serving `/api`.
- `client` is running and can authenticate USER and ADMIN roles.
- Hosted constructor runtime assets are available under the same frontend origin.

## 1. USER full-mode validation

1. Sign in as a USER.
2. Open the gallery and navigate to `/hub/editor/:id`.
3. Confirm the constructor opens inside the SPA shell and the machine selector is visible.
4. Confirm the page loads:
   - the persisted diagram layout;
   - the machine list from trusted edge servers;
   - the host-provided device/metric catalog;
   - the binding set for the active machine context, if one exists.

## 2. Layout save validation

1. Make a visible layout change.
2. Trigger layout save from constructor UI.
3. If the diagram has no bindings, confirm save completes normally.
4. Leave the route and reopen the same diagram.
5. Confirm the saved layout round-trips correctly.
6. Repeat the round-trip with a representative diagram that contains:
   - images;
   - widgets;
   - connection points;
   - connections;
   - editable properties.
7. Confirm each capability remains present and editable after reopen.

## 3. Save As validation

1. Modify the diagram.
2. Trigger Save As from constructor UI.
3. Confirm the SPA requests a new diagram name before creating the copy.
4. Confirm the original diagram remains unchanged.
5. Confirm the app navigates to the newly created diagram route or otherwise makes the new record available as the active session.

## 3a. Version conflict recovery validation

1. Open a diagram and keep the editor session active.
2. Simulate a stale version so the next in-place save conflicts.
3. Trigger layout save.
4. Confirm the conflict UI:
   - preserves the current in-memory edits;
   - offers reload-latest;
   - offers continue-editing without losing work;
   - offers Save As for the current state.
5. Validate each action behaves as labeled and does not overwrite newer saved data silently.

## 4. Full-mode bindings validation

1. Open a USER editor session with a valid machine context.
2. Bind one widget to a specific `deviceId + metric`.
3. Save bindings.
4. Switch away from the current machine and back again.
5. Confirm the binding set restores for the same `edgeServerId`.

## 5. Destructive save validation

1. Open a USER editor session for a diagram that already has binding sets.
2. Make a layout change.
3. Trigger layout save.
4. Confirm the SPA performs a fresh preflight for current binding sets and presents a blocking choice:
   - Save As; or
   - continue with a save that deletes existing bindings.
5. Choose the destructive path.
6. Confirm:
   - diagram save is sent with explicit destructive confirmation metadata (`confirmBindingsDeletion: true`) and succeeds first;
   - then the known binding sets for the diagram are deleted;
   - reopening the diagram shows no stale binding sets.
7. Negative check:
   - attempt in-place save without destructive confirmation metadata while binding sets exist;
   - confirm backend rejects save (`412 Precondition Failed`) and bindings remain unchanged.

## 6. ADMIN reduced-mode validation

1. Sign in as an ADMIN.
2. Open `/admin/editor/:id`.
3. Confirm layout tools are available.
4. Confirm bindings UI is absent.
5. Confirm no bindings API calls are required or triggered by the page flow.

## 7. Re-auth and exit-warning validation

1. Make unsaved changes in either editor mode.
2. Trigger a route exit attempt and confirm the SPA warns before discarding changes.
3. Trigger a temporary re-auth overlay.
4. Confirm the editor route remains mounted and in-progress state is preserved after auth recovery.

## 8. Lifecycle smoke validation

1. Open an editor route.
2. Navigate away and back repeatedly.
3. Confirm the editor can mount, destroy, and remount without duplicate toolbars, ghost context menus, or broken canvas interaction.
4. Repeat with an image-heavy diagram to verify late image loads do not revive a destroyed session.

## 9. Invalid payload recovery validation

1. Open an editor route for a diagram with an empty, missing, or intentionally invalid layout payload.
2. Confirm the route stays mounted and shows a recoverable empty or error state instead of crashing.
3. Repeat for a full-mode bindings payload that is empty or invalid.
4. Confirm corrupted payload data cannot be saved back silently as a destructive overwrite.

## 10. Editor parity validation notes (T038)

- Automated parity evidence is covered by `client/tests/integration/HostedConstructorSaveFlow.test.tsx` (`round-trips representative layout through API helpers and keeps parity sections`):
  - `images`: representative layout includes image metadata and verifies it round-trips through load/save/reopen.
  - `widgets`: representative and edited widgets round-trip and remain editable.
  - `connectionPoints`: array presence and payload shape are preserved on round-trip.
  - `connections`: array presence and payload shape are preserved on round-trip.
  - `editable properties`: widget `properties` payload (label/color/precision/showUnit) is preserved and validated through import/export helpers.
- Invalid layout payload guards are also asserted in the same test (`LayoutPayloadError` expectations for malformed payloads).

## 11. Lifecycle, recovery, and deployment notes (T039)

- Manual lifecycle smoke checklist (open -> leave -> reopen loops):
  - pass criteria: no duplicate toolbars, no ghost context menus, canvas remains interactive after repeated mount/destroy.
  - image-heavy pass criteria: delayed image load callbacks must not revive an already destroyed runtime instance.
- Automated lifecycle/re-auth evidence:
  - `client/tests/integration/HostedConstructorUnsavedChanges.test.tsx` confirms route-exit warning behavior, dirty machine-switch warning behavior, and runtime continuity under temporary re-auth overlays.
- Automated recoverable error-state evidence:
  - `client/tests/integration/ReducedConstructorPage.test.tsx` confirms recoverable fallback for invalid layout payloads and runtime bootstrap failures (`Open with empty layout` and `Retry loading` flow).
- Deployment caveats:
  - hosted runtime assets must be available from the same frontend origin under `/constructor/*`;
  - `constructor/public/` remains the only editable constructor runtime source tree;
  - production verification requires `client/dist/constructor/hosted-entry.js` and `client/dist/constructor/styles.css`;
  - `client/dist/constructor/index.html` must not be emitted for hosted delivery.

## 12. Quickcheck execution log (T040)

Execution date: 2026-03-21

1. Dependency and behavior verification command:
   - `cmd /c npm run test -- tests/integration/HostedConstructorSaveFlow.test.tsx tests/integration/HostedConstructorUnsavedChanges.test.tsx tests/integration/ReducedConstructorPage.test.tsx`
   - result: PASS (`3` test files, `9` tests)
2. Hosted pipeline/deployment smoke verification command:
   - `cmd /c npm run smoke:hosted`
   - result: PASS

Remaining gaps:

- Full visual/manual confirmation for section 8 (`duplicate toolbar/ghost menu/image-heavy remount`) still requires an interactive browser run against real runtime DOM/canvas behavior.
- Full visual/manual confirmation for section 2 parity ergonomics (not only payload round-trip) still requires operator-side UI walkthrough in a real session.
