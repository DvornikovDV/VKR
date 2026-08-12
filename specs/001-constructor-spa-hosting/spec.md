# Feature Specification: Constructor Hosted In Main Application

**Feature Branch**: `001-constructor-spa-hosting`  
**Created**: 2026-03-15  
**Last Updated**: 2026-03-25  
**Status**: Ready for Review  
**Input**: User description: "Integrate the Constructor into the existing SPA as a project-local editor page rather than a reusable embeddable library. The application owns diagram and bindings persistence, auth, routing, conflict handling, invalidation warnings, and page-level loading/error UX. The Constructor remains responsible for visual editing and conversion of current editor state. The application must support a full User-facing mode with bindings and a reduced Admin-facing mode without bindings, while preserving old lifecycle and round-trip risks."

## Clarifications

### Session 2026-03-15

- Q: Should a binding identify only a device, or a specific `deviceId + metric` pair? → A: A binding identifies a specific `deviceId + metric` pair.
- Q: Should the machine selector stay inside Constructor UI or move to SPA page-level UI? → A: The machine selector stays inside Constructor UI, while the SPA provides the available machines and devices.
- Q: Should Save As create a copy immediately, or first go through a naming flow? → A: Save As first goes through a naming flow, and only then creates the new diagram copy.
- Q: In reduced mode, should bindings-related behavior be fully disabled or only hidden? → A: Reduced mode should disable bindings-related behavior entirely when feasible; if full internal deactivation is not practical, a safe fallback is allowed where bindings remain hidden and produce no user-visible or persistence effects.
- Q: When a layout save would invalidate bindings, should save be blocked, confirmed, or allowed silently? → A: The application shows a blocking confirmation that clearly tells the user to either use Save As or continue knowing the existing bindings will be deleted.

### Session 2026-06-12

- Admin diagrams edited in reduced mode are retained layout-only templates.
- Assigning an Admin template is an application/Cloud workflow that creates an independent User-owned copy from the latest persisted layout; it is not a Constructor persistence responsibility.
- Existing assigned copies are never synchronized when the Admin later edits or deletes the source template.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Open Editor Inside The Product (Priority: P1)

As an authenticated User or Admin, I want to open the diagram editor from the main product and edit within protected application routes, so that diagram work feels like a normal part of the application rather than a separate tool.

**Why this priority**: If the editor does not behave as part of the main product experience, the integration does not solve routing, session, and workflow fragmentation.

**Independent Test**: From the diagram gallery, open an existing diagram as a User and as an Admin. Verify the correct editor experience opens inside the application, the correct role-specific mode is shown, and a temporary re-auth overlay does not discard the current editing session.

**Acceptance Scenarios**:

1. **Given** an authenticated User opening a diagram from the gallery, **When** the editor page loads, **Then** the full editor experience opens inside the protected application route with bindings-related controls available.
2. **Given** an authenticated Admin opening a diagram from the admin area, **When** the editor page loads, **Then** the reduced editor experience opens inside the protected application route without bindings-related controls.
3. **Given** an editor session with unsaved work, **When** the application triggers a temporary re-authentication overlay, **Then** the editor remains present and the in-progress state is preserved.

---

### User Story 2 - Edit And Save Diagram Layout (Priority: P1)

As a User or Admin, I want to edit diagram layout and save it through the product's normal save flows, so that saved diagrams remain part of the application's persistence, conflict handling, and navigation model.

**Why this priority**: Opening the editor without reliable save and restore behavior does not deliver usable value.

**Independent Test**: Open an existing diagram, make visible layout changes, save, leave the editor, and return. Verify the edited layout is restored. Repeat with Save As and with a simulated version conflict.

**Acceptance Scenarios**:

1. **Given** an existing diagram, **When** the editor page opens, **Then** the current saved layout is loaded into the editor.
2. **Given** a modified diagram layout, **When** the user saves successfully, **Then** leaving and reopening the same diagram restores the saved layout.
3. **Given** a modified diagram layout, **When** the user chooses Save As, **Then** the application first requests the new diagram name and only then creates a new diagram record from the current layout without overwriting the original diagram.
4. **Given** a save attempt against an outdated diagram version, **When** the application detects a conflict, **Then** the user is informed that save did not succeed, the current in-memory edits are preserved, and the UI offers explicit recovery actions to reload the latest saved version, continue editing without data loss, or use Save As to keep the current work as a new diagram.

---

### User Story 3 - Manage Bindings In Full Mode (Priority: P2)

As a User working in the full editor, I want to view and update the machine-specific telemetry bindings associated with the current diagram, so that layout editing and telemetry profile maintenance remain part of one editing flow.

**Why this priority**: Full editor value depends on not forcing Users into a separate tool or disconnected flow for bindings work.

**Independent Test**: Open the full editor for a diagram that has machine-specific bindings, change the active machine, modify bindings, save them, and reopen the same machine context. Verify the saved bindings are restored.

**Acceptance Scenarios**:

1. **Given** the full editor opens for a diagram with existing machine-specific bindings, **When** a machine context is active, **Then** the corresponding element-to-`deviceId + metric` bindings are available for review and editing.
2. **Given** the User switches to a different machine context in the full editor, **When** the switch completes, **Then** the editor shows the bindings associated with the newly active machine context.
3. **Given** modified bindings in full mode, **When** the User saves bindings successfully, **Then** reopening the same machine context restores the saved binding state.
4. **Given** a layout save would invalidate existing bindings, **When** the User initiates that save, **Then** the application presents a blocking choice between using Save As and continuing with a save that deletes the existing bindings.
5. **Given** the full editor requires machine and device choices, **When** the editor page initializes, **Then** the available machines and devices are supplied by the application rather than discovered independently by the editor.

---

### User Story 4 - Edit Layout Without Bindings In Admin Mode (Priority: P2)

As an Admin, I want a reduced editor focused only on layout editing, so that administrative layout work stays simpler and does not expose telemetry profile controls that are irrelevant to that role.

**Why this priority**: The Admin use case is primarily structural editing. Binding controls add noise and risk without providing value for that role.

**Independent Test**: Open the same diagram in the Admin editor. Verify layout tools remain available while bindings-related controls and save flows are not shown.

**Acceptance Scenarios**:

1. **Given** an Admin editor session, **When** the page loads, **Then** layout editing tools are available and bindings-related controls are absent.
2. **Given** an Admin editor session, **When** the Admin saves layout changes, **Then** only the diagram layout is persisted and no bindings workflow is required.
3. **Given** an Admin editor session, **When** bindings-related capabilities cannot be fully removed internally, **Then** they still produce no visible controls, no required user actions, and no persistence side effects.
4. **Given** an Admin edits a retained template after it has been assigned, **When** the Admin saves the template, **Then** the reduced editor saves only that template layout and does not synchronize existing User copies.

---

### User Story 5 - Avoid Accidental Data Loss (Priority: P3)

As an editor user, I want the application to recognize unsaved changes and warn me before losing them, so that route changes, machine changes, and other interruptions do not silently discard work.

**Why this priority**: State continuity is essential for trust in a visual editor, especially when editing can be interrupted by navigation or authentication events.

**Independent Test**: Modify a diagram or bindings state, then attempt to leave the editor route or switch relevant context. Verify the application warns before discarding unsaved work.

**Acceptance Scenarios**:

1. **Given** unsaved layout or bindings changes, **When** the user attempts to leave the editor route, **Then** the application warns before discarding the unsaved work.
2. **Given** unsaved full-mode binding changes, **When** the user switches machine context or another action would replace the active binding state, **Then** the application warns before discarding the unsaved work.
3. **Given** an editor session with no unsaved changes, **When** the user leaves the editor route, **Then** no unnecessary warning is shown.

---

### Edge Cases

- What happens when a diagram record exists but its saved layout payload is empty, partially corrupt, or missing expected sections?
- How does the editor page behave when bindings are requested for a machine context that has no saved binding set yet?
- What happens when a re-authentication overlay appears during active editing and the session is successfully refreshed?
- What happens when a save attempt is triggered multiple times in quick succession?
- How does the system handle large image-heavy diagrams that take noticeably longer to restore than typical diagrams?
- What happens when a layout save would invalidate existing bindings and the user cancels the warning flow?
- What happens when a layout save would invalidate existing bindings, the user confirms destructive save, and the previous binding set is deleted?
- How does the editor recover when the currently loaded diagram or bindings payload cannot be restored exactly as expected?

## Out Of Scope

- Turning Constructor into a reusable public library for arbitrary external hosts
- Full rewrite of Constructor into the main application component stack
- Cross-product reuse guarantees or public API stability for unknown future consumers
- Complete design-system unification of all application and editor UI as part of this feature

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide editor access for diagrams within the main authenticated product experience for both User and Admin roles.
- **FR-002**: The system MUST open the full editor experience for User flows and the reduced editor experience for Admin flows.
- **FR-003**: The system MUST load the current saved diagram layout when an editor session starts for an existing diagram.
- **FR-004**: Users MUST be able to edit and save diagram layout through the product's standard persistence flow.
- **FR-005**: Users MUST be able to create a new diagram from the current editor state without overwriting the original diagram.
- **FR-005a**: The Save As flow MUST collect the new diagram's name before creating the new diagram copy.
- **FR-006**: After a successful layout save, reopening the same diagram MUST restore the saved layout state.
- **FR-007**: In full editor mode, the system MUST support viewing and editing machine-scoped bindings that associate visual elements with specific `deviceId + metric` pairs.
- **FR-007a**: In full editor mode, the machine selector MUST remain part of the editor experience rather than moving into page-level application chrome.
- **FR-008**: In reduced editor mode, bindings-related controls and bindings-specific save flows MUST not be presented.
- **FR-008a**: In reduced editor mode, bindings-related behavior SHOULD be fully disabled; if that is not practical, any remaining hidden internal behavior MUST have no user-visible effect and MUST NOT participate in persistence flows.
- **FR-008b**: Reduced editor saves MUST affect only the currently opened Admin template and MUST NOT synchronize or replace previously assigned User copies.
- **FR-009**: The system MUST surface save conflicts to the user before any newer saved data is overwritten, preserve the current in-memory editor state, and provide explicit recovery actions to reload the latest saved version, continue editing without data loss, or use Save As for the current work.
- **FR-010**: The system MUST warn the user before finalizing a layout save that would invalidate existing bindings.
- **FR-010a**: When layout changes would invalidate bindings, the warning flow MUST clearly offer a non-destructive alternative through Save As.
- **FR-010b**: When the user explicitly confirms the destructive save, the existing bindings for that diagram context MUST be deleted rather than preserved in an invalid state.
- **FR-010c**: The destructive in-place save flow MUST be race-safe by requiring explicit confirmation metadata on the save request; if that confirmation is absent when bindings exist, the save must be rejected without deleting bindings.
- **FR-011**: The system MUST track unsaved editor changes and warn before route exits or context changes that would discard those changes.
- **FR-012**: Temporary authentication interruptions MUST NOT discard in-progress editor state.
- **FR-013**: The integrated editor MUST preserve existing core visual editing capabilities for images, widgets, connection points, connections, and editable properties.
- **FR-014**: The system MUST support machine-context switching in full mode and show the binding state associated with the active machine context.
- **FR-014a**: The application MUST provide the editor with the currently available machines and devices needed for full-mode binding workflows.
- **FR-015**: The system MUST handle empty, missing, or invalid diagram or bindings payloads without crashing the editor page by keeping the route mounted, showing a recoverable empty or error state, and blocking destructive persistence of corrupted in-memory state.
- **FR-016**: This feature MUST be scoped to hosting Constructor inside this product only; generic third-party embedding is out of scope.

### Key Entities

- **Diagram**: A saved mnemonic diagram with one owner, including metadata and a layout that can be edited and persisted. An Admin-owned diagram may be retained as a layout template; an assigned User copy is an independent diagram.
- **Layout State**: The visual state of a diagram, including images, widgets, connection points, connections, and editable properties.
- **Binding Set**: A machine-scoped mapping between visual elements in a diagram and specific `deviceId + metric` telemetry pairs used in full editor mode.
- **Editor Session**: The current in-memory editing context for one diagram, including loaded state and unsaved changes.
- **Editor Mode**: The role-specific editing experience, either full mode with bindings support or reduced mode focused on layout only.
- **Machine Context**: The currently active equipment or machine scope used to load and edit the relevant binding set in full mode.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Authenticated Users and Admins can open the correct editor experience from their respective product areas in 100% of validation flows.
- **SC-002**: In 100% of round-trip validation cases, a diagram that is opened, edited, saved, closed, and reopened restores the expected saved layout without semantic loss.
- **SC-002a**: In hosted round-trip validation, representative diagrams containing images, widgets, connection points, connections, and editable properties reopen with those capabilities intact and still editable.
- **SC-003**: In reduced mode, 0 bindings-related controls are visible during Admin layout editing.
- **SC-004**: In 100% of validation flows involving temporary re-authentication overlays, the in-progress editor session remains available after authentication recovery.
- **SC-005**: In 100% of simulated save-conflict and bindings-invalidation cases, the user receives an explicit warning or blocking decision point before a destructive outcome occurs.
- **SC-005a**: In 100% of destructive-save validation cases, users are shown a clear choice between Save As and a save that deletes existing bindings.
- **SC-005b**: In 100% of simulated version-conflict cases, the conflict UI preserves the current in-memory edits and offers explicit recovery actions for reload-latest, continue-editing, and Save As.
- **SC-005c**: In 100% of validation cases where bindings exist but destructive confirmation metadata is absent, the in-place save is rejected and no bindings are deleted.
- **SC-006**: Users can complete the primary flow "open editor, modify layout, save, leave, return" without leaving the main product navigation.
- **SC-007**: In 100% of tested route-exit scenarios following a user modification, unsaved work warnings appear before data loss would occur.
- **SC-007a**: In 100% of validation flows with empty, missing, or invalid diagram or bindings payloads, the editor route stays mounted, shows a recoverable empty or error state, and avoids crashes.

## Assumptions & Dependencies

- The main application already provides authenticated User and Admin areas, diagram persistence, and bindings persistence.
- The editor remains an internal product capability for this application only during the scope of this feature.
- Existing visual editing behavior is the baseline and should be preserved unless a change is required to support product-hosted editing.
- Application-owned save, conflict, and warning flows are preferred over editor-owned backend behavior.
