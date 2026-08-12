# Quickstart: Dashboard SPA Monitoring

## Goal

Validate Dashboard as a native SPA feature in `client` that monitors one saved `diagramId + edgeId` context by using only cloud-saved diagram/binding contracts and live cloud runtime signals. The primary validation target is the visual mnemonic diagram surface: saved images, connections, connection points, and widgets must render as a monitoring workspace, while textual diagnostics remain secondary.

## Preconditions

- `cloud_server` is running with Socket.IO enabled.
- `client` is running in development mode.
- A USER account exists and can sign in.
- At least one saved diagram exists.
- The saved diagram includes visual layout sections such as `images`, `connectionPoints`, `connections`, and `widgets`.
- The same diagram has at least one saved binding profile for a trusted edge server.
- At least one `number-display` or `text-display` widget has a saved binding.
- The selected edge can emit live telemetry to cloud.
- For viewport validation, use a diagram that is larger than the visible workspace or contains multiple spatially separated elements.

## Suggested implementation order

1. Add the concrete `/hub/dashboard` route under User Hub and keep all Dashboard ownership in `client`.
2. Create a Dashboard feature slice in `client/src/features/dashboard` for route parsing, runtime validation, and live session management.
3. Load diagrams, trusted edge servers, and saved binding profiles with existing REST APIs.
4. Derive valid edge options for the selected diagram from saved binding profiles.
5. Resolve the saved diagram snapshot and validate the chosen binding profile against saved widget ids.
6. Add React Konva on top of Konva for the Dashboard visual renderer.
7. Normalize the saved layout into images, connection points, connections, widgets, bounds, and render issues.
8. Render the full saved diagram surface as a light workspace/grid with read-only visual elements.
9. Add viewport controls for pan, zoom in/out, fit-to-view, and reset view.
10. Connect a Socket.IO client session using the in-memory JWT and subscribe by `edgeId`.
11. Apply live values inside bound `number-display` and `text-display` widgets; keep `led` live visual behavior as a follow-up.
12. Add the collapsed bottom diagnostics overlay for telemetry, bindings, and render issues.
13. Add integration tests for routing, recovery states, visual rendering, viewport behavior, diagnostics, and live runtime behavior.

## Manual validation flow

1. Sign in as a USER and open `/hub/dashboard`.
2. Verify the empty state explains the Diagram -> Edge flow when no query params are provided.
3. Select a diagram and confirm the edge selector shows only trusted edges with saved binding profiles for that diagram.
4. Confirm the URL updates to `/hub/dashboard?diagramId=<id>&edgeId=<id>` when a full monitoring context becomes active.
5. Refresh the page with the same URL and verify the context preloads without a full page reload.
6. Verify the saved diagram appears visually in the Dashboard workspace, not as a list of `widgetId` and `Value` rows.
7. Verify saved images, connections, connection points, and widgets are positioned consistently with the Constructor view.
8. Verify the light grid is visible and moves/scales with the diagram workspace while panning or zooming.
9. Use zoom in/out, fit-to-view, reset view, and drag-to-pan; confirm the diagram remains navigable without leaving Dashboard.
10. Verify live telemetry updates bound `number-display` and `text-display` widgets inside their visual widget surfaces.
11. Open a diagram containing unsupported or future command-capable widgets and verify they still render visually but remain non-operative.
12. Open diagnostics from the bottom handle and from the `Details` toolbar action; verify it expands as a bounded overlay with internal scrolling and does not replace or move the visual surface.
13. Break the binding profile or choose an invalid pair and verify the page shows explicit recovery messaging instead of guessing mappings.
14. Break visual layout data, such as an image reference or connection point, and verify Dashboard reports a visual-rendering recovery state or partial-render diagnostics instead of treating a text-only view as complete.
15. Stop runtime transport and verify the page keeps the last values visible while showing reconnect status.
16. Force the selected edge offline and verify the UI distinguishes edge unavailability from transport disconnect.

## Test focus

- Route-prefill: valid `diagramId + edgeId` starts monitoring immediately.
- Invalid route: invalid ids or mismatched pair stays on Dashboard and shows recovery UI.
- Missing binding profile: explicit state with a return-to-authoring message.
- Invalid stale binding profile: explicit state when saved `widgetId` references are no longer present in the saved diagram.
- Visual renderer: saved images, connections, connection points, and widgets render as the primary monitoring surface.
- Viewport behavior: pan, zoom in/out, fit-to-view, reset view, and grid transform work without mutating the saved layout.
- Live runtime: `telemetry` updates bound `number-display` and `text-display` widgets inside the visual surface.
- Diagnostics: collapsed by default, opens from the bottom handle or `Details`, scrolls internally when content is large, and remains secondary to the diagram.
- Text-only guard: a completed Dashboard view cannot consist only of textual widget/value rows.
- Disconnect handling: reconnect messaging appears without clearing the last rendered values.
- Context switching: previous runtime session is disposed and only the new context remains active.

## Source contracts

- REST subset: [contracts/openapi.yaml](./contracts/openapi.yaml)
- Route state: [contracts/route-state.md](./contracts/route-state.md)
- Runtime signals: [contracts/runtime-signals.md](./contracts/runtime-signals.md)
