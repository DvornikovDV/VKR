# Tasks: Constructor Hosted In Main Application

**Input**: Design documents from `/specs/001-constructor-spa-hosting/`  
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`

**Tests**: Integration tests are included because the feature spec defines independent validation scenarios for each user story.

**Organization**: Tasks are grouped by user story so each increment can be implemented and validated independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Story label (`[US1]` ... `[US5]`)
- Each task includes exact file paths

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the feature scaffolding and shared host/runtime contracts.

- [X] T001 Create hosted constructor feature scaffolding and shared types in `client/src/features/constructor-host/types.ts` and `client/src/features/constructor-host/index.ts`
- [X] T002 [P] Create a reusable hosted runtime mock harness for integration tests in `client/tests/integration/helpers/mockHostedConstructor.ts`
- [X] T003 [P] Define hosted runtime path constants and public asset entry paths in `client/src/features/constructor-host/runtimePaths.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core hosted-editor infrastructure that MUST be complete before any story work starts.

**CRITICAL**: No user story work should start before this phase is complete.

**Cloud prerequisite**: complete `specs/001-cloud-server/tasks.md` Phase 10 before implementing the catalog-backed parts of this phase and before starting US3.

- [X] T004 [P] Add `getDiagramById()` and related typing for editor-route loading in `client/src/shared/api/diagrams.ts`
- [X] T005 [P] Implement the client-owned device/metric catalog adapter backed by cloud APIs in `client/src/features/constructor-host/adapters/catalogAdapter.ts` and `client/src/shared/api/edgeServers.ts`
- [X] T006 [P] Implement the same-origin hosted runtime loader in `client/src/features/constructor-host/loadHostedConstructor.ts`
- [X] T007 [P] Implement a shared unsaved-changes guard hook for hosted editor pages in `client/src/features/constructor-host/useUnsavedChangesGuard.ts`
- [X] T008 Implement hosted constructor asset packaging and static entry wiring in `client/package.json` and `client/vite.config.ts`
- [X] T008a Refactor the hosted public entry to expose a stable runtime bootstrap surface in `constructor/public/hosted-entry.js`
- [X] T008b Remove constructor-owned browser-modal save/load assumptions and constructor-owned device-registry fetch from the hosted path in `constructor/public/file-manager.js` and `constructor/public/ui-controller.js`

Implementation note: `constructor/public/` remains the only source tree for hosted constructor runtime files. Any `client/public/constructor/` content is generated staging output for same-origin hosting and must not be edited manually.

**Checkpoint**: Hosted editor foundation is ready; story work can begin.

---

## Phase 2a: Hosted Asset Pipeline Unification

**Purpose**: Remove copy-based ambiguity before broader story work continues, so hosted editor development uses one source tree and one predictable frontend delivery path.

**Development rule**: `constructor/public/` is the only editable source tree for constructor runtime files. Any `client/public/constructor/` content is generated staging output only and must never be edited manually.

**Product rule**: Hosted constructor is part of the main client application. A standalone constructor application is not a required product mode for this feature; any remaining standalone page artifacts are legacy scaffolding and must not drive task acceptance.

- [X] T008c Replace copy-based hosted constructor staging with a unified frontend dev/build pipeline that serves `/constructor/*` directly from `constructor/public` during development and emits the same files into the final frontend artifact during build in `client/vite.config.ts`, `client/package.json`, and shared frontend scripts
- [X] T008d Remove the need for a second editable constructor source directory under `client`, keep any generated hosted staging path ignored by git, and document the one-way source-of-truth rule in the relevant frontend tooling files
- [X] T008e Validate the unified pipeline by confirming:
  - `client` hosted routes load constructor assets from the shared same-origin path in development;
  - production build output still contains `/constructor/hosted-entry.js` and related runtime assets;
  - legacy standalone page artifacts do not block hosted development or hosted production delivery, but no standalone product flow is required

**Checkpoint**: Hosted asset delivery is unified; subsequent constructor/runtime tasks should build only on `constructor/public/` sources.

---

## Phase 3: User Story 1 - Open Editor Inside The Product (Priority: P1)

**Goal**: Users and Admins can open the correct hosted editor route inside the SPA and keep the editor mounted through normal page lifecycle and re-auth overlays.

**Independent Test**: From the diagram gallery, open an existing diagram as a User and as an Admin. Verify the correct route loads the correct editor mode inside the SPA, the runtime mounts successfully, and a temporary re-auth overlay does not discard the mounted session.

### Tests For User Story 1

- [X] T009 [P] [US1] Add integration coverage for user/admin editor route bootstrapping and runtime loading in `client/tests/integration/HostedConstructorRoutes.test.tsx`

### Implementation For User Story 1

- [X] T010 [P] [US1] Refactor legacy page bootstrap assumptions so constructor runtime can be created through hosted entrypoints in `constructor/public/main.js` and `constructor/public/hosted-entry.js`
- [X] T011 [US1] Refactor `UIController` to accept hosted config (`container`, `mode`, `callbacks`, `machines`, `deviceCatalog`) and expose lifecycle hooks in `constructor/public/ui-controller.js`
- [X] T012 [US1] Make canvas and context menu container-scoped and cleanup-safe in `constructor/public/canvas-manager.js` and `constructor/public/context-menu.js`
- [X] T013 [US1] Implement the React host bridge component with loading/error states in `client/src/features/constructor-host/ConstructorHost.tsx`
- [X] T014 [US1] Implement hosted user/admin page route shells with shared loading/error wrappers in `client/src/features/user-hub/pages/FullConstructorPage.tsx` and `client/src/features/admin-hub/pages/ReducedConstructorPage.tsx`
- [X] T014a [US1] Ensure hosted editor pages remain mounted beneath temporary re-auth overlays and preserve the active runtime instance across auth refresh interruptions in `client/src/features/constructor-host/ConstructorHost.tsx`, `client/src/features/user-hub/pages/FullConstructorPage.tsx`, and `client/src/features/admin-hub/pages/ReducedConstructorPage.tsx`
- [X] T015 [US1] Add hosted editor routes to `client/src/app/userHubRoutes.tsx` and `client/src/app/adminHubRoutes.tsx`

**Checkpoint**: User Story 1 is independently functional and testable.

---

## Phase 4: User Story 2 - Edit And Save Diagram Layout (Priority: P1)

**Goal**: Users and Admins can load a diagram layout, save it back through SPA-owned CRUD flows, use Save As with naming, and recover cleanly from version conflicts.

**Independent Test**: Open an existing diagram, make visible layout changes, save, leave the route, and reopen. Repeat with Save As and a simulated version conflict.

### Tests For User Story 2

- [X] T016 [P] [US2] Add integration coverage for layout round-trip, representative editor-capability parity (images, widgets, connection points, connections, editable properties), Save As naming, and version-conflict handling in `client/tests/integration/HostedConstructorSaveFlow.test.tsx`

### Implementation For User Story 2

- [X] T017 [US2] Replace constructor-owned layout save/load actions with host save intents and layout serialization helpers in `constructor/public/file-manager.js`
- [X] T018 [US2] Implement layout import/export and invalid-payload guards in `client/src/features/constructor-host/adapters/layoutAdapter.ts`
- [X] T019 [US2] Implement the Save As naming dialog in `client/src/shared/components/SaveAsDialog.tsx`
- [X] T020 [US2] Implement the save-conflict recovery modal in `client/src/shared/components/SaveConflictModal.tsx` so it preserves in-memory edits and offers explicit actions for reload-latest, continue-editing, and Save As
- [X] T021 [US2] Wire layout save, Save As, conflict recovery, and clean-baseline reset into `client/src/features/user-hub/pages/FullConstructorPage.tsx` and `client/src/features/admin-hub/pages/ReducedConstructorPage.tsx`

**Checkpoint**: User Stories 1 and 2 are independently functional and testable.

---

## Phase 5: User Story 3 - Manage Bindings In Full Mode (Priority: P2)

**Goal**: Full-mode user routes can load, edit, save, and switch machine-scoped bindings using `deviceId + metric`, with SPA-owned destructive-save decisions.

**Independent Test**: Open the full editor for a diagram with bindings, change the active machine, edit bindings, save them, and reopen the same machine context. Verify destructive in-place save offers Save As or deletes existing binding sets only after explicit confirmation.

### Tests For User Story 3

- [X] T022 [P] [US3] Add integration coverage for machine switch, bindings round-trip, and destructive-save decision flow in `client/tests/integration/FullConstructorBindings.test.tsx`

### Implementation For User Story 3

- [X] T023 [US3] Upgrade constructor binding persistence state and serialization to `widgetId + deviceId + metric` in `constructor/public/bindings-manager.js` and `constructor/public/widget-manager.js`
- [X] T023a [US3] Update the properties-panel binding UI to select and validate `deviceId + metric` from the host-provided catalog in `constructor/public/properties-panel.js`
- [X] T024 [US3] Expose full-mode binding APIs (`loadBindings`, `getBindings`, `updateCatalog`, `setActiveMachine`) from the hosted runtime in `constructor/public/ui-controller.js`
- [X] T025 [US3] Implement binding-set import/export helpers in `client/src/features/constructor-host/adapters/bindingsAdapter.ts`
- [X] T026 [US3] Load trusted machines and fetch machine-scoped catalog data in `client/src/features/user-hub/pages/FullConstructorPage.tsx` using `client/src/shared/api/edgeServers.ts`
- [X] T027 [US3] Wire bindings save orchestration, destructive-save modal flow, and post-save bulk binding-set deletion in `client/src/features/user-hub/pages/FullConstructorPage.tsx` and `client/src/shared/components/BindingsInvalidatedModal.tsx`

**Checkpoint**: User Stories 1-3 are independently functional and testable.

---

## Phase 6: User Story 4 - Edit Layout Without Bindings In Admin Mode (Priority: P2)

**Goal**: Admin routes provide a reduced hosted editor that supports layout editing only and never participates in bindings workflows.

**Independent Test**: Open the same diagram in the Admin editor and verify layout tools remain available while bindings UI, bindings persistence, and machine/catalog loading are absent.

### Tests For User Story 4

- [X] T028 [P] [US4] Add integration coverage for reduced-mode no-bindings behavior in `client/tests/integration/ReducedConstructorPage.test.tsx`

### Implementation For User Story 4

- [X] T029 [US4] Implement reduced-mode bindings gating in `constructor/public/ui-controller.js`, `constructor/public/file-manager.js`, and `constructor/public/styles.css`
- [X] T030 [US4] Ensure admin hosted routes skip machine/catalog/bindings API calls and persist layout only in `client/src/features/admin-hub/pages/ReducedConstructorPage.tsx`
- [X] T031 [US4] Add reduced-mode recovery for empty/invalid layout payloads and hosted page bootstrap errors in `client/src/features/admin-hub/pages/ReducedConstructorPage.tsx` and `client/src/features/constructor-host/ConstructorHost.tsx`

**Checkpoint**: User Stories 1-4 are independently functional and testable.

---

## Phase 7: User Story 5 - Avoid Accidental Data Loss (Priority: P3)

**Goal**: Hosted editor routes warn before losing unsaved changes, protect dirty machine switches, and remain stable during async teardown and repeated save attempts.

**Independent Test**: Modify layout or bindings, then attempt to leave the route or switch machine context. Verify warnings appear before data loss. Confirm repeated mount/destroy cycles and large image restores do not resurrect a destroyed session.

### Tests For User Story 5

- [X] T032 [P] [US5] Add integration coverage for route-exit warnings, machine-switch warnings, and re-auth continuity in `client/tests/integration/HostedConstructorUnsavedChanges.test.tsx`

### Implementation For User Story 5

- [X] T033 [US5] Wire dirty-state propagation from hosted runtime callbacks and page-level exit warnings in `client/src/features/constructor-host/ConstructorHost.tsx` and `client/src/features/constructor-host/useUnsavedChangesGuard.ts`
- [X] T034 [US5] Implement machine-switch dirty warning orchestration and clean-baseline resets in `client/src/features/user-hub/pages/FullConstructorPage.tsx`
- [X] T035 [US5] Harden async lifecycle with generation guards, idempotent destroy, and `ResizeObserver` support in `constructor/public/ui-controller.js` and `constructor/public/canvas-manager.js`
- [X] T036 [US5] Add graceful recovery for invalid bindings payloads and repeated save-click protection in `client/src/features/user-hub/pages/FullConstructorPage.tsx`, `client/src/features/admin-hub/pages/ReducedConstructorPage.tsx`, and `client/src/features/constructor-host/adapters/bindingsAdapter.ts`

**Checkpoint**: All user stories are independently functional and testable.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Finalize route-level loading, clean up transitional assumptions, and run feature-specific validation.

- [X] T037 [P] Audit route-level lazy loading and hosted runtime chunk boundaries in `client/src/app/userHubRoutes.tsx`, `client/src/app/adminHubRoutes.tsx`, and `client/src/features/constructor-host/loadHostedConstructor.ts`
- [X] T038 [P] Record explicit editor-parity validation notes for images, widgets, connection points, connections, and editable properties in `specs/001-constructor-spa-hosting/quickstart.md`
- [X] T039 [P] Record manual lifecycle smoke validation notes, recoverable empty/error-state handling, and deployment caveats in `specs/001-constructor-spa-hosting/quickstart.md`
- [X] T040 Run the hosted-editor quickstart validation, including parity and invalid-payload recovery checks, and document any remaining gaps in `specs/001-constructor-spa-hosting/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies - can start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 - blocks all stories
- **Phase 2a (Hosted Asset Pipeline Unification)**: Depends on Phase 2 - should be completed before story work expands on hosted runtime delivery
- **Phase 3 (US1)**: Depends on Phase 2a
- **Phase 4 (US2)**: Depends on US1 because hosted routes must exist before save flows are useful
- **Phase 5 (US3)**: Depends on US1 and US2 because bindings sit on top of hosted routes and layout load/save flows
- **Phase 5 (US3)**: Also depends on `specs/001-cloud-server/tasks.md` Phase 10 for edge catalog loading and bulk binding deletion
- **Phase 6 (US4)**: Depends on US1 and US2 because reduced mode reuses hosted route and layout-save foundations
- **Phase 7 (US5)**: Depends on US1-US4 because dirty tracking and lifecycle hardening must cover both full and reduced flows
- **Phase 8 (Polish)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (P1)**: First usable increment for hosted editor route opening
- **US2 (P1)**: Completes the minimal usable editor by adding save flows
- **US3 (P2)**: Adds full-mode telemetry binding management
- **US4 (P2)**: Specializes the hosted editor for admin/reduced mode
- **US5 (P3)**: Adds route-safety, data-loss prevention, and lifecycle hardening

### Within Each User Story

- Integration test task first
- Constructor/runtime contract changes before page orchestration
- Page orchestration before route wiring or modal finish work
- Story checkpoint before moving to the next dependent story

### Parallel Opportunities

- Setup tasks T002-T003 can run in parallel
- Foundational tasks T004-T008 can run in parallel once the feature directories exist, with T008a-T008b following the hosted asset and loader baseline
- Hosted asset pipeline tasks T008c-T008e should run after T008/T008a/T008b and before US1 implementation broadens the hosted delivery surface
- US1: T010 and T012 can run in parallel after T009 is written
- US2: T018-T020 can run in parallel before T021
- US3: T023 and T025 can run in parallel before T023a and T026-T027
- US4: T029 and T030 can run in parallel after T028
- US5: T033 and T035 can run in parallel after T032
- Polish: T037-T039 can run in parallel

---

## Parallel Example: User Story 3

```text
Task: "Upgrade constructor binding persistence state in constructor/public/bindings-manager.js and constructor/public/widget-manager.js"
Task: "Implement binding-set import/export helpers in client/src/features/constructor-host/adapters/bindingsAdapter.ts"
```

---

## Implementation Strategy

### MVP First

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: US1
4. Complete Phase 4: US2
5. Stop and validate hosted editor route opening + layout save flows

### Incremental Delivery

1. Setup + Foundational -> hosted runtime base ready
2. US1 -> open editor inside SPA
3. US2 -> usable layout save and Save As flows
4. US3 -> full-mode bindings
5. US4 -> reduced admin mode
6. US5 -> safety and lifecycle hardening
7. Phase 8 -> polish and validation

### Suggested MVP Scope

For this feature, the practical MVP is **US1 + US2**, not US1 alone. Opening the hosted editor without working layout save and Save As does not satisfy the spec's usable-value threshold.

---

## Notes

- All tasks use the project-local hosted runtime approach, not a reusable widget/library approach.
- Hosted integration assumes cloud support for edge catalog loading and bulk binding-set deletion; those server tasks live in `specs/001-cloud-server/tasks.md` Phase 10.
- `specs/001-constructor-spa-hosting/` is currently documentation scope, so task execution should focus on `/client` and `/constructor`.
- For hosted-runtime work, edit files under `constructor/public/` and treat any mirrored files under `client/public/constructor/` as generated output only.
