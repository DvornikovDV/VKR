# Research & Architecture Decisions: Dashboard SPA Monitoring

## 1. SPA-native delivery in `client`

- Decision: Implement Dashboard as a native User Hub feature inside `client`, with its own route entry at `/hub/dashboard` and a dedicated feature slice for runtime state and presentation.
- Rationale: Root and `client` module rules explicitly place SPA-native user experiences in `client`. This preserves shell ownership, route guards, and page-state patterns without reviving a standalone bootstrap.
- Alternatives considered:
  - Reuse `/dashboard` as the main runtime host: rejected because `003-dashboard` explicitly forbids a standalone runtime delivery path.
  - Embed constructor runtime internals into Dashboard: rejected because module integration must stay contract-based.

## 2. Monitoring context identity and URL contract

- Decision: Treat Dashboard monitoring context as `diagramId + edgeId`, while allowing a diagram-only partial route state during the selection flow.
- Rationale: The user selects Diagram first and then an Edge Server valid for that Diagram. A partial `diagramId` query keeps SPA state shareable without claiming that monitoring is active before `edgeId` is chosen.
- Alternatives considered:
  - Keep selection only in component state: rejected because deep links and route recovery are required.
  - Require both params before any page state can render: rejected because it breaks the diagram-first flow.

## 3. Valid edge selection is derived from saved cloud contracts

- Decision: Build the diagram-first selection flow from existing read contracts only: `GET /api/diagrams`, `GET /api/edge-servers`, and `GET /api/diagrams/:id/bindings`. For one selected diagram, a valid edge option is an edge that is both trusted for the user and present in a saved binding profile for that diagram.
- Rationale: The backend already stores the authoritative relation between a diagram and an edge context in `DiagramBindings { diagramId, edgeServerId, widgetBindings }`. No new coupling to constructor internals is needed.
- Alternatives considered:
  - Query constructor runtime/editor state for active machine mappings: rejected because it violates module boundaries.
  - Introduce a new dashboard-only "diagram edges" endpoint before MVP: rejected because existing contracts already allow the client to derive the allowed set.

## 4. Runtime source of truth remains fully saved-server based

- Decision: Load the runtime surface from the last saved diagram document (`GET /api/diagrams/:id`) plus the saved binding profile selected from `GET /api/diagrams/:id/bindings` by `edgeServerId`.
- Rationale: The spec and current backend model already separate layout from bindings. Dashboard must execute only persisted cloud state and ignore unsaved constructor drafts.
- Alternatives considered:
  - Infer widget bindings from diagram layout fields: rejected because MVP forbids client-side binding inference.
  - Reconstruct runtime state from gallery cards or cached constructor host payloads: rejected because they are secondary views, not authoritative runtime contracts.

## 5. Align live transport with actual cloud runtime behavior

- Decision: Dashboard runtime transport must use the existing Socket.IO contract from `cloud_server` default namespace with JWT handshake auth (`auth.token = Bearer ...`), `subscribe { edgeId }`, `telemetry`, and `edge_status` events.
- Rationale: This matches the implemented cloud runtime. The current `client/src/shared/store/useTelemetryStore.ts` uses a raw WebSocket URL and mismatched event names (`telemetry-update`, `edge-status`), so Dashboard should not build on that behavior as-is.
- Alternatives considered:
  - Keep the current raw WebSocket client store for MVP: rejected because it does not match the server transport or event names.
  - Add a second custom telemetry protocol just for Dashboard: rejected because it invents new semantics instead of following cloud runtime.

## 6. Binding validation happens against the saved diagram snapshot

- Decision: Validate the selected binding profile client-side by checking that every `widgetId` in the saved profile exists in the saved diagram snapshot before runtime starts.
- Rationale: Existing backend save flows expose `bindingsInvalidated` when layout changes, but there is no dedicated runtime validation endpoint. Dashboard still needs an explicit recovery state for stale widget references after diagram edits.
- Alternatives considered:
  - Silently drop stale bindings and render whatever still matches: rejected because the spec requires an explicit invalid-binding recovery state.
  - Require a new backend validation API before MVP: rejected because the saved diagram plus saved binding profile already contain enough data for deterministic stale-reference detection.

## 7. Runtime widget support stays display-only

- Decision: MVP runtime value application remains display-only. The first visual telemetry increment updates `number-display` and `text-display` inside their saved visual widgets. `led` remains visually rendered from the saved layout but live `led` telemetry behavior is deferred to a follow-up until a real monitored example is available.
- Rationale: This matches the MVP monitoring boundary while keeping the first visual renderer grounded in verified telemetry examples. It also avoids partial command, condition, or unvalidated widget semantics leaking into runtime.
- Alternatives considered:
  - Hide unsupported widgets: rejected because the full diagram must remain visually intact.
  - Partially wire commands for button-like widgets: rejected because command execution is explicitly future scope.
  - Implement all display widget runtime behavior immediately: rejected because `led` lacks a verified real telemetry example in the current validation context.

## 8. Runtime projection uses binding pairs, not constructor metadata

- Decision: Apply telemetry to widgets only through saved `widgetId -> deviceId + metric` pairs. Dashboard builds a latest-value projection indexed by the saved binding pair and updates supported widgets from that projection.
- Rationale: The saved binding contract does not include constructor runtime objects or dashboard-side authoring metadata. `sourceId` from cloud telemetry remains auxiliary runtime metadata and is not promoted into a new binding key for MVP.
- Alternatives considered:
  - Reuse constructor-side binding caches or widget instances: rejected because that couples Dashboard to editor internals.
  - Redesign the binding contract to include `sourceId` inside this MVP: rejected because the current persisted contract is already live and must remain the source of truth.

## 9. Recovery and status are modeled as separate concerns

- Decision: Track page recovery state separately from live runtime status: page state covers empty/loading/error/invalid-selection/missing-binding/invalid-binding, while runtime status covers transport connectivity and edge availability.
- Rationale: Cloud runtime already distinguishes transport loss from `edge_status` availability. The UI needs both axes to explain whether the page failed to resolve context or a resolved context temporarily lost live updates.
- Alternatives considered:
  - Collapse everything into one generic error banner: rejected because users would not know whether to reselect context, wait for reconnect, or fix bindings in Constructor.

## 10. Test strategy stays inside `client`

- Decision: Validate the feature with `client` integration tests (React Testing Library + MSW for REST) plus mocked Socket.IO client sessions for runtime events and reconnect behavior.
- Rationale: The feature is delivered in `client`; the plan should verify SPA routing, URL sync, recovery states, and live updates without importing `/dashboard` internals.
- Alternatives considered:
  - Browser-only manual verification: rejected because route-state and reconnect behavior deserve automated coverage.
  - Deep testing of constructor host wrappers: rejected because Dashboard must not depend on them.

## 11. Visual renderer technology

- Decision: Use React Konva on top of Konva for the SPA-native visual renderer in `client`.
- Rationale: Constructor already saves a canvas-oriented diagram layout with images, connection points, connections, and widget geometry. React Konva lets the Dashboard render equivalent read-only canvas primitives through React components while Konva remains the underlying drawing engine. This keeps the implementation native to `client` without reusing Constructor editor runtime internals.
- Alternatives considered:
  - Use raw Konva directly in React: rejected because it would require more manual lifecycle management and be less consistent with React state updates.
  - Use SVG or DOM-only rendering: rejected because it increases the risk of visual and interaction drift from the saved canvas-oriented layout model.
  - Import or host Constructor runtime for Dashboard rendering: rejected because it violates module boundaries and brings editor behavior into a monitoring surface.

## 12. Saved layout as the visual runtime contract

- Decision: Treat saved layout sections (`images`, `connectionPoints`, `connections`, `widgets`) as the Dashboard visual runtime contract.
- Rationale: Constructor persists these sections as the authored mnemonic diagram. Rendering only widget ids and values does not satisfy the monitoring-surface requirement, and a static screenshot-style render would not allow telemetry to update inside widgets.
- Alternatives considered:
  - Render only `layout.widgets`: rejected because it produces the current incomplete text/list-style surface and loses images, lines, and spatial context.
  - Store and render a static diagram screenshot: rejected because live telemetry must update the corresponding widgets in place.
  - Rebuild visual relations from bindings alone: rejected because bindings describe telemetry mapping, not diagram geometry or visual structure.

## 13. Viewport and grid behavior

- Decision: Provide a Dashboard-owned Diagram Workspace Viewport with pan, zoom in/out, fit-to-view, reset view, and a grid that moves and scales with the diagram workspace.
- Rationale: Saved mnemonic diagrams can exceed the visible workspace. Operators need to navigate across the same coordinate space used by the authored diagram without leaving Dashboard or relying on page scroll.
- Alternatives considered:
  - Static fit-only rendering: rejected because large diagrams become hard to inspect.
  - Page scroll instead of viewport navigation: rejected because it separates navigation from the diagram coordinate system and feels less like an operator workspace.
  - Center-only movement: rejected because diagrams can extend in multiple directions and require free panning.

## 14. Diagnostics as secondary overlay

- Decision: Deliver runtime diagnostics as a collapsed bottom overlay inside the Dashboard workspace. The panel uses the dark-gray User Hub surface language, exposes a small centered light handle strip while collapsed, opens from either the handle or a `Details` toolbar action, and uses bounded height with internal scrolling when expanded.
- Rationale: Diagnostics are useful for telemetry, binding, and render issue investigation, but they must not replace or visually compete with the primary diagram surface. A workspace overlay keeps the user in context and avoids turning the page back into a text-first view.
- Alternatives considered:
  - Keep textual telemetry rows as the main surface: rejected because the Dashboard must render the visual mnemonic diagram.
  - Put diagnostics in a page footer below the canvas: rejected because it encourages page scrolling away from the monitoring surface.
  - Require tabbed diagnostics in the first increment: rejected because grouped sections are sufficient initially and avoid unnecessary UI complexity.
