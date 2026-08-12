# Phase 0: Research & Architecture Decisions

## Decision 1: Host Constructor as lazy-loaded SPA routes

- Decision: Host the editor inside protected SPA routes (`/hub/editor/:id` and `/admin/editor/:id`) and lazy-load the editor runtime only when those routes are entered.
- Rationale: This preserves the "normal SPA page" UX, keeps auth and navigation inside `/client`, and avoids paying the constructor payload cost on non-editor routes.
- Alternatives considered:
  - Separate standalone page: rejected because it reintroduces auth, navigation, and deployment fragmentation.
  - `iframe`: rejected because it complicates page-level UX, modal flows, and state continuity without solving a current product need.

## Decision 2: Keep CRUD and destructive UX orchestration in `client`

- Decision: The SPA remains the owner of diagram CRUD, bindings CRUD, Save As naming, version-conflict handling, destructive-save confirmation, and route-exit warnings.
- Rationale: Backend access, JWT handling, routing, and app-level warnings already belong to `/client`. Keeping these flows in one layer avoids leaking application policy into the canvas editor.
- Alternatives considered:
  - Constructor-owned fetch/save logic: rejected because it would couple the editor to auth, API semantics, and product-level modals.

## Decision 3: Respect module isolation through a hosted runtime entry, not direct source imports

- Decision: `/client` must not directly import source files from `/constructor`. Instead, `/constructor` will expose a hosted runtime entry module as a same-origin static asset, and `/client` will load it at runtime through a narrow public factory.
- Rationale: This satisfies Constitution Principle 3 and the local `/client/GEMINI.md` rule that vanilla modules are mounted through wrappers rather than imported as internal source code.
- Alternatives considered:
  - Direct `import` from `constructor/public/*.js`: rejected because it breaks strict module isolation.
  - Global `window.ConstructorHost`: rejected because Principle 4 forbids global mutable runtime scope.

## Decision 4: Target one frontend deployment artifact with route-level constructor assets

- Decision: The production target is a single SPA delivery, with constructor runtime assets packaged under the same frontend deployment and loaded only by editor routes.
- Rationale: This matches the selected "SPA-only" strategy, keeps deployment/versioning simpler than two separate frontend apps, and still allows a runtime boundary between `/client` and `/constructor`.
- Alternatives considered:
  - Permanent dual-artifact frontend deployment: rejected as target architecture because it makes version coordination and asset ownership harder.

## Decision 5: Constructor keeps editor-local UI, including the machine selector

- Decision: Constructor keeps its editor-local toolbar, properties panel, and machine selector in full mode. The SPA provides the available machine and device-metric data, and owns external modals such as Save As and destructive-save confirmation.
- Rationale: This keeps the implementation closer to the current editor and avoids reimplementing the constructor shell in React. It also matches the clarified spec.
- Alternatives considered:
  - React-owned replacement toolbar and page-level machine selector: rejected as unnecessary scope expansion for a project-local integration.

## Decision 6: Full-mode bindings must be upgraded to `widgetId + deviceId + metric`

- Decision: Full-mode binding state must align with backend and telemetry contracts: one binding entry identifies a widget and a specific `deviceId + metric` pair, within a binding set scoped by `edgeServerId`.
- Rationale: `cloud_server` already stores widget bindings as `{ widgetId, deviceId, metric }`, and telemetry is emitted and persisted at `deviceId + metric` granularity. Keeping constructor on `deviceId` only would guarantee a mismatch.
- Alternatives considered:
  - Keep `deviceId` only: rejected because it no longer matches the selected product model.
  - Support both simple and detailed bindings from day one: rejected because it increases UI and persistence complexity without a current need.

## Decision 7: Treat machine context as `edgeServerId` at persistence level

- Decision: The UI may continue to label the selector as "machine", but the persisted and API-level identifier is `edgeServerId`.
- Rationale: Existing binding APIs, gallery links, and backend models are already keyed by `edgeServerId`. This avoids inventing a second persisted machine identifier.
- Alternatives considered:
  - Separate persisted `machineId`: rejected because it introduces an unnecessary identity split for the current backend.

## Decision 8: Use an application-owned machine and device-metric catalog backed by cloud APIs

- Decision: The SPA will provide constructor with:
  - a machine list derived from trusted edge servers;
  - a device-metric catalog resolved by an application-owned adapter backed by cloud endpoints.
- Rationale: Constructor must stop fetching its own `devices-registry.json`, but ownership of data fetching should still remain in `/client`. A cloud-backed adapter removes the need for static seed data without moving CRUD or product policy into the editor.
- Alternatives considered:
  - Keep constructor-owned fetch of `devices-registry.json`: rejected because CRUD/input ownership belongs to the SPA.
  - Keep a static project-local catalog seed: rejected because it creates temporary code and drift against the real machine inventory.
  - Infer and fetch directly inside constructor: rejected because it violates ownership boundaries.

## Decision 9: Reduced mode disables bindings persistence and should disable bindings behavior when feasible

- Decision: Reduced admin mode must never call bindings APIs or expose bindings UI. Internal bindings behavior should be disabled where practical; otherwise, any hidden remainder must have no visible effect and must not participate in persistence.
- Rationale: This matches the clarified spec and keeps admin flows aligned with backend permissions, where bindings endpoints are USER-only.
- Alternatives considered:
  - UI hide only: accepted only as a fallback, not as the target design.

## Decision 10: Destructive layout save deletes all binding sets after explicit confirmation

- Decision: When a diagram has existing binding sets and the user attempts an in-place layout save in full mode, the SPA must present a blocking choice:
  - use Save As; or
  - continue with a save that deletes existing binding sets for the diagram.
- Rationale: The backend currently reports `bindingsInvalidated` whenever bindings exist for the diagram after an in-place update. Because this signal can arrive after the save attempt and race with concurrent changes, destructive-save protection must be enforced pre-save with an explicit confirmation flag.
- Orchestration rule:
  - Save As path: `POST /api/diagrams` only; original diagram and its bindings remain untouched.
  - Destructive in-place save path: run a fresh preflight for existing binding sets, show blocking confirmation, then call `PUT /api/diagrams/:id` with `confirmBindingsDeletion: true`; only after a successful save does the SPA clear binding sets through `DELETE /api/diagrams/:id/bindings`.
  - Backend enforcement path: if destructive confirmation is missing while binding sets exist, `PUT` is rejected with `412 Precondition Failed`.
- Alternatives considered:
  - Block layout save entirely: rejected because the clarified spec explicitly allows destructive save after confirmation.
  - Preserve invalid bindings: rejected because the clarified spec says they must be deleted.

## Decision 11: Lifecycle hardening requires container-scoped mount, explicit destroy, and async cancellation guards

- Decision: Hosted constructor integration must include:
  - container-scoped DOM rendering;
  - idempotent `destroy()`;
  - `ResizeObserver`-based resize handling;
  - generation tokens or equivalent guards for async image restore/load operations.
- Rationale: The current constructor relies on hardcoded DOM ids, global listeners, and window resize. Those assumptions are unsafe inside SPA route lifecycles and would make mount/unmount brittle.
- Alternatives considered:
  - Best-effort cleanup around existing globals only: rejected because it does not adequately address remount and async teardown risks.

## Decision 12: Page tests mock the hosted runtime loader; real runtime validation stays in smoke coverage

- Decision: `/client` integration tests should mock the constructor runtime loader and focus on page orchestration, CRUD decisions, and modal flows. Real hosted-runtime mount/destroy behavior should be validated through targeted smoke testing.
- Rationale: The editor runtime is a heavy imperative Konva module. Page-level tests should remain deterministic and avoid coupling React integration tests to real canvas internals.
- Alternatives considered:
  - Full integration tests with the real constructor runtime in jsdom: rejected as brittle and low-signal for the SPA orchestration concerns.
