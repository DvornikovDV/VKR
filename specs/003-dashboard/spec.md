# Feature Specification: Dashboard SPA Monitoring

**Feature Branch**: `003-dashboard`
**Created**: 2026-03-22
**Status**: Draft
**Input**: User description: "Create a separate `003-dashboard` specification that treats Dashboard as a native feature of the existing SPA in `client`, not as an extension of `002-frontend` Phase 7 and not as a standalone runtime app."

---

## 1. Problem Statement & Purpose

`002-frontend` established the SPA shell, routing, authentication, and shared client patterns for the SCADA product, but Dashboard work there was still framed around a hosted standalone runtime. That no longer matches the desired product direction.

This feature defines Dashboard as its own functional area inside the SPA. Dashboard is an execution surface for operators and users: it loads a diagram, resolves the saved telemetry binding profile for a selected Edge Server, applies live telemetry, and renders the current operational state inside the same SPA experience as the rest of the product.

Rendering the current operational state means presenting the saved mnemonic diagram as a visual monitoring surface, not as a textual runtime list. Live telemetry must appear in the corresponding visual widgets on that surface, while textual summaries remain secondary diagnostics for troubleshooting.

The purpose of this specification is to make Dashboard a first-class SPA feature while keeping a strict boundary between:

- authoring responsibilities in `constructor`
- execution responsibilities in Dashboard
- shell, routing, auth, and page-state responsibilities in `client`

---

## Clarifications

### Session 2026-03-22

- Q: What access model is canonical for Dashboard in `003-dashboard`? -> A: Only authenticated Users can open Dashboard; Admin access is out of scope.
- Q: How should Dashboard behave if a diagram contains widgets that are unsupported in MVP? -> A: Render the full diagram; command-capable widgets remain visually present but non-interactive.
- Q: What configuration source must Dashboard use at runtime? -> A: Only the explicitly saved diagram version from the database; the saved version is the only runtime source of truth.
- Q: What binding source must Dashboard use at runtime? -> A: Only the explicitly saved binding profile for the active `diagramId + edgeId` pair from backend storage.
- Q: What should happen to URL query parameters when the user manually changes `Diagram` or `Edge Server` on the Dashboard page? -> A: Update `diagramId` and `edgeId` in the URL to match the current selection without a full page reload.
- Q: Should MVP Dashboard execute diagram-defined runtime conditions? -> A: No. Conditions remain future scope until they are specified as their own feature.

### Session 2026-04-24

- Q: Is a textual widget/value list an acceptable primary Dashboard monitoring surface? -> A: No. Dashboard must render the saved mnemonic diagram visually; textual diagnostics may exist only as secondary collapsed details, not as the primary operator view.
- Q: What should the Dashboard workspace look like relative to Constructor? -> A: Dashboard remains inside User Hub, keeps the hub sidebar/top shell, and uses the remaining space as a full monitoring workspace with a Dashboard toolbar for Diagram and Monitored Object selection.
- Q: Should Dashboard support navigation around large diagrams in MVP? -> A: Yes. Dashboard must support pan, zoom in/out, fit-to-view, reset view, and a grid that moves and scales with the diagram workspace.
- Q: How should Dashboard treat the saved diagram visual style? -> A: The diagram itself must be rendered strictly from the saved layout, including light diagram backgrounds and saved widget styling; the surrounding Dashboard shell may keep the established User Hub style.
- Q: How should unsupported widgets behave? -> A: Dashboard must visually render every element supported by Constructor, but widgets without MVP runtime behavior remain visible and non-operative.

---

## 2. Product Direction & Scope Boundaries

Dashboard is no longer treated as a separate runtime application similar to hosted constructor integration. It must behave as a native page in the SPA and inherit the same navigation, selection flow, loading patterns, reconnect messaging, and visual language already established in `002-frontend`.

Scope boundaries for this feature:

- `client` owns navigation, auth, query-param handling, Diagram and Edge Server selection flow, reconnect UI, and empty/loading/error/disconnected/binding-invalid page states.
- `constructor` owns authoring of diagram layout and telemetry binding profiles. Future conditions configuration and future command configuration remain outside this feature.
- Dashboard owns execution only: diagram loading, saved binding-profile resolution, telemetry application, and visual state rendering.
- Dashboard's primary execution surface is the saved visual mnemonic diagram, including saved images, connections, connection points, widget placement, and widget styling.
- Textual runtime summaries are secondary diagnostics and must remain collapsed or visually subordinate to the monitoring surface.
- Dashboard may provide navigation controls for the monitoring workspace, including pan, zoom, fit-to-view, and reset view, without becoming an authoring surface.
- The shared contract between authoring and runtime is the saved diagram data plus the saved binding profile for a Diagram and Edge Server pair, not constructor UI internals.
- Dashboard runtime uses only the last explicitly saved diagram configuration and the last explicitly saved binding profile from backend storage. Unsaved constructor drafts and local edits are outside the runtime contract.
- Dashboard renders the diagram from saved contracts and must not depend on Constructor editor internals, selection tools, property panels, or editing behavior.
- This feature explicitly rejects a separate `/dashboard` bootstrap page, legacy host bridge, or standalone runtime lifecycle as the long-term delivery model.
- Runtime conditions and command execution are intentionally excluded from MVP Dashboard and require separate future feature specifications.

---

## 3. User Scenarios & Testing *(mandatory)*

### User Story 1 - Open Dashboard And Choose Monitoring Context (Priority: P1)

As an authenticated User, I want to open Dashboard inside the SPA, choose a Diagram and Edge Server, and understand what to do next even before live data is shown.

**Why this priority**: Without a clear in-app monitoring entry point, the user cannot reach any operational value from Dashboard.

**Independent Test**: Open `/hub/dashboard` with and without valid query params, then attempt the route as an Admin. Verify the page renders inside the SPA shell for authenticated Users, shows selector controls, pre-fills valid selections, provides clear empty/loading/error guidance without leaving the route, and denies Admin access before monitoring initialization.

**Acceptance Scenarios**:

1. **Given** an authenticated user opens `/hub/dashboard` without prefilled query params, **When** the page loads, **Then** the user sees Dashboard inside the SPA shell with Diagram and Edge Server selection controls plus an empty state that explains how to start monitoring.
2. **Given** a user selects a Diagram that has one or more available Edge Servers, **When** the Diagram selection is applied, **Then** the Edge Server selector becomes available and lists only options valid for that Diagram.
3. **Given** the route is opened with valid `?diagramId=X&edgeId=Y` query params, **When** the Dashboard page loads, **Then** the matching Diagram and Edge Server are preselected and the monitoring view starts without manual reselection.
4. **Given** the route is opened with invalid, inaccessible, or mismatched query params, **When** the page resolves the selection, **Then** the user remains on Dashboard, sees an explicit invalid-selection message, and can choose a new valid context from the same page.
5. **Given** the user manually changes the selected Diagram or Edge Server on Dashboard, **When** the new selection is applied, **Then** the page updates `diagramId` and `edgeId` in the browser URL without a full page reload.
6. **Given** an authenticated Admin attempts to open `/hub/dashboard`, **When** route access is evaluated, **Then** the Admin is denied Dashboard access before monitoring data or runtime sessions are loaded.

---

### User Story 2 - Observe Live Runtime State (Priority: P1)

As a user monitoring equipment, I want the selected diagram to reflect live telemetry for the selected Edge Server and clear connection status so I can tell whether I am seeing current information or a disconnected view.

**Why this priority**: Live operational awareness is the primary value of Dashboard.

**Independent Test**: Select a valid Diagram and Edge Server. Verify the saved mnemonic diagram appears as a visual monitoring surface with its saved layout, grid workspace, images, connections, connection points, and widgets, not as a textual widget list. Verify live values update in place, the page shows connectivity/transport status, and disconnection feedback appears if live updates stop.

**Acceptance Scenarios**:

1. **Given** a valid Diagram and Edge Server are selected, **When** the runtime data is available, **Then** the Dashboard renders the saved diagram visually in the monitoring workspace and starts applying live telemetry inside supported display widgets.
2. **Given** the Dashboard is actively monitoring an Edge Server, **When** transport connectivity is lost, **Then** the page displays a disconnected indicator, keeps the last successfully rendered state visible, and communicates that reconnection is being attempted.
3. **Given** the selected Edge Server itself becomes unavailable or offline, **When** the runtime status changes, **Then** the Dashboard distinguishes that edge-level availability problem from a transport disconnect and reflects the edge as unavailable.
4. **Given** the user changes either the Diagram or Edge Server selection, **When** the new selection is confirmed, **Then** the monitoring view updates in place without a full page reload.
5. **Given** the saved diagram is larger than the visible Dashboard workspace, **When** the user pans or zooms the workspace, **Then** the user can navigate the diagram without leaving Dashboard and can restore a fit-to-view or reset view.

---

### User Story 3 - Resolve Saved Bindings And Render Bound Widgets (Priority: P2)

As a user, I want Dashboard to resolve the saved binding profile for the selected Diagram and Edge Server so that widgets render live values without requiring Dashboard-side setup.

**Why this priority**: Monitoring only works when Dashboard uses the same saved widget-to-device mapping that was authored for the active Diagram and Edge Server pair.

**Independent Test**: Open a diagram that has a saved binding profile for a selected Edge Server. Verify that Dashboard resolves the saved widget bindings only from backend-saved contracts, applies incoming telemetry to bound widgets, ignores unsaved constructor-local state, and shows an explicit recovery state if bindings are missing or invalid.

**Acceptance Scenarios**:

1. **Given** a Diagram and Edge Server pair has a saved binding profile, **When** Dashboard loads that monitoring context, **Then** Dashboard resolves widget bindings only from that saved profile.
2. **Given** a diagram contains supported MVP display widgets with valid saved bindings, **When** telemetry is received, **Then** `number-display` and `text-display` widgets update inside their saved visual positions according to the latest values for their bound device metrics, while `led` widgets remain visually rendered from the saved layout with live `led` telemetry behavior deferred to a follow-up.
3. **Given** a user is viewing Dashboard, **When** they need to change a binding definition, **Then** Dashboard does not provide editing controls and the user must return to the authoring flow outside Dashboard.
4. **Given** a Diagram and Edge Server pair has no saved binding profile or the saved profile is no longer valid, **When** Dashboard resolves the monitoring context, **Then** the page shows an explicit binding-missing or binding-invalid state instead of silently guessing widget mappings.
5. **Given** unsaved edits exist in Constructor for the same diagram, **When** Dashboard loads or reloads that diagram, **Then** Dashboard uses only the last explicitly saved backend diagram version and the last explicitly saved backend binding profile and ignores unsaved local editor state.

---

### User Story 4 - Preserve Runtime Boundaries Without Expanding MVP (Priority: P3)

As a product team, we want Dashboard MVP to stay focused on reliable monitoring while leaving future conditions and command/control as separate follow-on features.

**Why this priority**: The initial release should not drift into partially specified runtime behavior that belongs to later feature work across Constructor, Dashboard, and backend services.

**Independent Test**: Review the Dashboard scope and verify MVP contains only monitoring behavior, while future conditions and command/control are documented as separate capabilities that do not alter Dashboard's execution-only boundary.

**Acceptance Scenarios**:

1. **Given** the MVP Dashboard scope is delivered, **When** a user accesses the page, **Then** the available functionality is limited to monitoring, binding-profile resolution, runtime rendering, and selection management.
2. **Given** a diagram contains future command-capable widgets or widgets whose runtime behavior is not implemented in MVP, **When** the diagram is rendered in Dashboard, **Then** those widgets remain visible in their saved visual form but do not accept interaction, emit commands, or execute equipment commands.
3. **Given** future runtime conditions or command interactions are needed later, **When** the product team plans them, **Then** they are specified and delivered as separate follow-on features rather than being implicitly designed inside this MVP spec.

---

### Edge Cases

- A user opens Dashboard but has no accessible diagrams: the page stays usable and shows a clear empty state instead of a blank canvas.
- A selected Diagram exists but has no available Edge Servers: the page explains that no monitoring context is currently configured for that Diagram.
- Prefill query params point to a Diagram the user can access but an `edgeId` that is not linked to that Diagram: the invalid prefill is rejected and the user can reselect from valid options.
- A selected Diagram and Edge Server pair has no saved binding profile: the page explains that monitoring bindings are not configured for that context.
- A saved binding profile exists but references stale or missing widget identifiers after diagram changes: the page surfaces the binding profile as invalid and does not silently remap widgets.
- Transport connectivity drops after telemetry was already displayed: the disconnected state appears, the last rendered values remain visible, and the page attempts to recover the live session.
- Connectivity returns after a disconnect: the disconnected state clears and the current selection resumes live updates without requiring manual re-entry.
- A user changes selection while reconnect attempts are still in progress for the previous context: the previous monitoring context is abandoned and only the new selection remains active.
- A diagram includes command-oriented widgets before command execution is enabled: the full diagram still renders, widget-local visual animation may play, but no runtime command is emitted and the control remains explicitly non-operative.
- A saved diagram contains visual layout data, but Dashboard can only produce a textual widget/value summary: the page must not treat this as a completed monitoring view and must show a visual-rendering recovery state with optional diagnostic details.
- A saved visual element references missing or damaged image data: Dashboard explains that the diagram visual layout cannot be fully rendered instead of silently omitting the element.
- Saved connections reference missing connection points: Dashboard renders the recoverable parts of the diagram where possible and exposes the issue in diagnostics.
- A saved diagram is larger than the available viewport: Dashboard opens with an appropriate initial fit and allows pan/zoom navigation.
- A supported display widget has a binding but no live telemetry value yet: Dashboard keeps the visual widget visible and shows a clear pending/empty value state.

---

## 4. Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide Dashboard as an authenticated User-only feature within the SPA in `client`, using the existing shell and route flow rather than a separate standalone application.
- **FR-002**: System MUST allow the user to choose a monitoring context using two linked selections: Diagram first, then Edge Server valid for that Diagram.
- **FR-003**: System MUST support optional `diagramId` and `edgeId` query parameters that prefill the Dashboard selection when the pair is valid and accessible to the current user.
- **FR-004**: System MUST provide explicit empty, loading, error, invalid-selection, and binding-profile recovery states inside Dashboard so the user always understands the current page state.
- **FR-005**: System MUST load and render the selected diagram as the monitoring surface for the active Diagram and Edge Server pair.
- **FR-006**: System MUST apply live telemetry from the selected Edge Server to the rendered diagram without requiring a full page reload.
- **FR-007**: System MUST show transport/connectivity status separately from selected Edge Server availability so users can distinguish connection problems from edge-state changes.
- **FR-008**: System MUST resolve and use the explicitly saved binding profile for the active `diagramId + edgeId` pair as the only runtime widget-to-device mapping source.
- **FR-009**: Dashboard MUST execute saved bindings but MUST NOT provide binding authoring or binding editing controls.
- **FR-010**: The first visual Dashboard telemetry increment MUST support live telemetry behavior for `number-display` and `text-display`; `led` widgets MUST remain visually rendered from the saved layout, with live `led` telemetry behavior deferred to a follow-up feature.
- **FR-011**: Dashboard MUST remain monitoring-only and MUST NOT provide layout authoring, telemetry binding authoring, or telemetry binding editing controls.
- **FR-012**: Dashboard MUST depend only on the shared saved diagram contract and saved binding-profile contract and MUST NOT depend on constructor UI internals or constructor runtime implementation details.
- **FR-013**: When live updates are interrupted, Dashboard MUST show a disconnected indicator, preserve the last successfully rendered state, and communicate that reconnection is being attempted.
- **FR-014**: Changing Diagram or Edge Server selection MUST update the monitoring view in place without forcing a full page reload or a route change away from Dashboard.
- **FR-015**: When the user changes Diagram or Edge Server selection in Dashboard, the SPA MUST update `diagramId` and `edgeId` in the URL to reflect the active monitoring context without triggering a full browser page reload.
- **FR-016**: When no saved binding profile exists for the active Diagram and Edge Server pair, Dashboard MUST show an explicit recovery state and MUST NOT silently infer widget mappings.
- **FR-017**: When a saved binding profile exists but is invalid for the current saved diagram revision, Dashboard MUST surface that binding profile as invalid and MUST NOT silently remap stale widget references.
- **FR-018**: Dashboard MUST execute only the last explicitly saved diagram configuration stored in the backend and the last explicitly saved binding profile stored for the active Diagram and Edge Server pair; unsaved constructor changes, drafts, and local editor state MUST NOT affect runtime behavior.
- **FR-019**: Dashboard MUST reuse the established User Hub dark visual language and SPA page patterns, including dark page surfaces, shared loading/error/status presentation, and a dark monitoring canvas background by default when diagram readability remains acceptable.
- **FR-020**: This feature MUST NOT be implemented as or depend on a separate `/dashboard` runtime bootstrap, legacy host bridge, or standalone lifecycle owned outside the SPA.
- **FR-021**: Admin users MUST NOT access Dashboard routes or monitoring execution flows in this feature scope.
- **FR-022**: When a diagram contains future command-oriented widgets, MVP Dashboard MUST still render those widgets as part of the full diagram, but MUST NOT send equipment commands or present them as operative controls.
- **FR-023**: Runtime condition processing and runtime command execution MUST remain out of MVP scope and require separate future feature specifications before becoming operative Dashboard behavior.
- **FR-024**: Dashboard MUST render the saved mnemonic diagram layout as the primary monitoring surface, not a textual list of widgets or telemetry fields.
- **FR-025**: Dashboard MUST visually render saved layout elements that are part of the authored diagram, including images, connections, connection points, and widgets when those elements exist in the saved diagram.
- **FR-026**: Dashboard MUST preserve saved element geometry and display styling sufficiently for users to recognize the same diagram they authored in Constructor.
- **FR-027**: Dashboard MUST provide workspace navigation for visual diagrams, including pan, zoom in/out, fit-to-view, reset view, and a grid that moves and scales with the diagram workspace.
- **FR-028**: Live telemetry for supported display widgets MUST appear inside the corresponding visual widgets on the monitoring surface.
- **FR-029**: Textual runtime diagnostics MAY be available as secondary collapsed details, but MUST NOT replace or be treated as the primary Dashboard monitoring surface.
- **FR-030**: Dashboard MUST visually render unsupported or future command-capable widgets in their saved form while keeping them non-operative.
- **FR-031**: Dashboard MUST surface visual-rendering failures as explicit recovery states rather than silently falling back to a textual-only monitoring view.

### Key Entities *(include if feature involves data)*

- **Dashboard Session Context**: The authenticated SPA context in which Dashboard runs, including route state, access scope, and current query-param selection state.
- **Diagram Runtime Document**: The saved diagram definition used for execution, including layout, supported widgets, and stable widget identifiers.
- **Edge Server**: The user-selectable runtime target for MVP monitoring whose telemetry feeds the Dashboard view for a chosen diagram.
- **Diagram Binding Profile**: The saved runtime binding set for one Diagram and one Edge Server, defining widget-to-device-and-metric mappings used by Dashboard.
- **Telemetry Snapshot**: The latest available operational values for the active Edge Server, used to update bound widgets in the Dashboard view.
- **Connectivity State**: The current transport/session status for live updates, separate from the selected Edge Server availability state.
- **Display Widget Instance**: A runtime-rendered widget on the diagram surface that presents values or status for the active monitoring context.
- **Visual Diagram Surface**: The primary runtime monitoring surface that visually presents the saved mnemonic diagram layout, including images, connections, connection points, and widgets.
- **Diagram Workspace Viewport**: The visible navigable area of the Dashboard where the user can pan, zoom, fit, and reset the saved diagram view.
- **Runtime Diagnostic Details**: Optional secondary textual information about telemetry, bindings, timestamps, or visual-rendering issues. It supports troubleshooting but is not the primary monitoring surface.

---

## 5. Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can open Dashboard from within the SPA and reach a valid monitored view for an accessible Diagram and Edge Server without any full browser page reload.
- **SC-002**: From the default empty Dashboard state, a user can select a valid Diagram and Edge Server and see the monitoring surface within 15 seconds.
- **SC-003**: Switching Diagram or Edge Server updates the monitoring view in place within 2 seconds for normal operating conditions.
- **SC-004**: Loss of live transport connectivity becomes visible to the user within 3 seconds.
- **SC-005**: Valid deep links using `diagramId` and `edgeId` open the intended monitoring context without requiring manual reselection.
- **SC-006**: When a user changes Diagram or Edge Server on Dashboard, the browser URL reflects the new `diagramId` and `edgeId` within 1 second without a full page reload.
- **SC-007**: Unsupported, missing, or invalid monitoring contexts or binding profiles never leave the user on a silent blank screen; the page always presents an explicit recovery or next-step message.
- **SC-008**: Diagrams that use only MVP display widgets and valid saved bindings render successfully for the selected monitoring context without requiring a legacy standalone dashboard page.
- **SC-009**: Users can distinguish transport/connectivity problems from selected Edge Server availability problems on every monitored view.
- **SC-010**: Admin attempts to open `/hub/dashboard` are denied before any monitoring context is initialized or runtime subscription is started.
- **SC-011**: For a saved diagram with visual layout elements and valid bindings, users can recognize the Dashboard view as the same mnemonic diagram authored in Constructor.
- **SC-012**: Supported telemetry values appear inside their corresponding visual widgets during monitoring, without requiring users to read a separate widget/value list.
- **SC-013**: Users can pan and zoom a diagram larger than the visible workspace and restore a fit-to-view or reset view without leaving Dashboard.
- **SC-014**: A Dashboard view that only shows textual widget/value rows does not satisfy the completed monitoring-surface acceptance criteria.
- **SC-015**: Visual-rendering failures produce explicit recovery or diagnostic messaging rather than a silent blank area or a text-only replacement.

---

## 6. Assumptions & Constraints

- `002-frontend` remains the architectural and product foundation for the SPA. This specification depends on that foundation but becomes the primary planning source for future Dashboard work.
- Implementation remains in `client`; this feature does not move product ownership back to a separate dashboard application.
- Dashboard belongs to the User Hub route space. In this feature scope, only authenticated Users access `/hub/dashboard`; Admin monitoring access is out of scope.
- Dashboard uses the existing SPA shell in `client` and reuses the shared API and client-state patterns already established there rather than a hosted standalone runtime.
- Dashboard keeps the active monitoring context synchronized with the browser URL query string as SPA route state, without triggering full page reloads when the selection changes.
- The visual language, route behavior, and shared page-state conventions follow the established SPA experience so Dashboard feels native to the product.
- `constructor` remains the authoring surface for diagram layout and telemetry binding profiles. Future conditions setup and future command configuration require separate follow-on feature work.
- Dashboard only executes saved configuration. It does not become a setup environment for diagrams or bindings.
- Both Dashboard and Constructor treat the explicitly saved backend version as the only working version of a diagram; unsaved edits remain local authoring state until saved.
- The only supported cross-module contract between authoring and runtime is the saved diagram data and saved binding profile, not constructor internals.
- The saved diagram layout may contain images, connection points, connections, and widgets; Dashboard must treat these saved layout sections as the visual runtime contract.
- The monitoring workspace may use a light diagram canvas/grid when that matches the saved diagram readability, even while the surrounding User Hub shell remains dark.
- Widget runtime formatting beyond the supported MVP display behavior may be refined in later widget-specific work, but all saved widgets should remain visually present.
- Live telemetry and selected Edge Server availability are backend-provided runtime inputs for Dashboard execution.
- Future runtime conditions and future command execution will require separate feature specifications before they can become operative behavior in Dashboard.
