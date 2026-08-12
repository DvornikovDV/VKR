# Implementation Plan: Constructor Hosted In Main Application

**Branch**: `001-constructor-spa-hosting` | **Date**: 2026-03-15 | **Spec**: `/specs/001-constructor-spa-hosting/spec.md`  
**Input**: Feature specification from `/specs/001-constructor-spa-hosting/spec.md`

## Summary

Host the existing constructor inside the React SPA as two protected editor routes, while keeping CRUD, auth, routing, warnings, and conflict handling in `/client`. The constructor remains a project-local editor runtime with its own UI and canvas logic, but it must stop behaving like a standalone page: it will be mounted through a narrow host bridge, consume host-provided layout/binding/catalog data, and delegate save-related intents back to the SPA.

The key engineering work is not a full rewrite. It is a hosting hardening effort:

- create a hosted runtime entry for `/constructor` that can mount into a supplied container;
- upgrade full-mode bindings from `deviceId` only to `deviceId + metric`;
- move machines/device-catalog ownership to `/client`;
- preserve round-trip behavior and re-auth continuity;
- package constructor assets into the SPA deployment without violating module isolation.

## Technical Context

**Language/Version**: TypeScript 5.x in `/client`; modern browser JavaScript ES modules in `/constructor`  
**Primary Dependencies**: React 19.2.x, React Router 7.x, Zustand 5.x, Vite 7.3.x, TailwindCSS 4.2.x in `/client`; Konva 8.x and Bootstrap 5.x-compatible UI assets in `/constructor`  
**Storage**: Backend persistence via `cloud_server` (`Diagram.layout`, `DiagramBindings.widgetBindings`); in-memory SPA/editor session state on the client  
**Testing**: Vitest, React Testing Library, and MSW for SPA orchestration in `HostedConstructorRoutes.test.tsx`, `HostedConstructorSaveFlow.test.tsx`, `FullConstructorBindings.test.tsx`, `ReducedConstructorPage.test.tsx`, and `HostedConstructorUnsavedChanges.test.tsx`; manual hosted-runtime smoke validation for mount/destroy/image-restore flows  
**Target Platform**: Web browsers, delivered as the main SPA frontend  
**Project Type**: Web application with a React SPA shell and a project-local hosted vanilla editor runtime  
**Performance Goals**:
- editor code loads only on editor routes;
- non-editor SPA routes do not request hosted constructor runtime assets;
- re-auth overlays keep the active hosted editor instance mounted and preserve in-memory state;
- ordinary editing of an already loaded diagram remains usable without requiring full-page reload or route restart;
- repeated mount/destroy cycles do not accumulate duplicate listeners or orphaned DOM, and late async restores are ignored after `destroy()`  
**Constraints**:
- no direct source-code imports from `/constructor` into `/client` (Constitution Principle 3);
- no `window.*` host bridge globals (Principle 4);
- CRUD remains in `/client`;
- reduced mode must never participate in bindings persistence;
- backend currently lacks a dedicated device-and-metric discovery endpoint;
- current constructor code assumes hardcoded DOM ids, page-level listeners, browser dialogs, and `deviceId`-only widget bindings  
**Scale/Scope**:
- one project-local consumer (`/client`);
- two role-based editor routes (`full` and `reduced`);
- one active hosted constructor instance per editor page;
- diagrams with images, widgets, connection points, and connections;
- zero commitment to third-party embedding or library-grade public API stability

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-design gate

- **Principle 2 - Architectural scope**: Pass. `/client` remains the SPA shell and `/constructor` remains the visual editor. This feature changes hosting style, not module roles.
- **Principle 3 - Strict module isolation**: Pass with an explicit boundary. `/client` will not import `/constructor` source files directly. Instead, the editor runtime is exposed as a hosted entry asset loaded through a narrow runtime contract.
- **Principle 4 - State and scope containment**: Pass. Host/editor communication is defined through module exports and callbacks, not through `window.*`.
- **Principle 5 - Secrets management**: Pass. Constructor runtime does not receive or store JWT credentials. API access stays in `/client`.
- **Principle 6 - Context awareness**: Pass. The plan explicitly respects `/client/GEMINI.md` and `/constructor/GEMINI.md` boundaries.

### Post-design re-check

- **Result**: Pass.
- The chosen runtime-loading boundary avoids direct cross-module imports.
- The host bridge keeps constructor free of backend, routing, and auth logic.
- No constitution violation requires justification.

## Project Structure

### Documentation (this feature)

```text
specs/001-constructor-spa-hosting/
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- contracts/
|   |-- api.md
|   `-- constructor-host.md
`-- tasks.md
```

### Source Code (repository root)

```text
client/
|-- src/
|   |-- app/
|   |   |-- routes.tsx
|   |   |-- userHubRoutes.tsx
|   |   `-- adminHubRoutes.tsx
|   |-- features/
|   |   |-- user-hub/
|   |   |   `-- pages/
|   |   |       |-- GalleryPage.tsx
|   |   |       `-- FullConstructorPage.tsx            # planned
|   |   |-- admin-hub/
|   |   |   `-- pages/
|   |   |       |-- DiagramGalleryPage.tsx
|   |   |       `-- ReducedConstructorPage.tsx         # planned
|   |   `-- constructor-host/
|   |       |-- ConstructorHost.tsx                    # planned thin runtime host
|   |       |-- loadHostedConstructor.ts               # planned runtime asset loader
|   |       `-- adapters/
|   |           |-- layoutAdapter.ts                   # planned
|   |           |-- bindingsAdapter.ts                 # planned
|   |           `-- catalogAdapter.ts                  # planned
|   |-- shared/
|   |   |-- api/
|   |   |   |-- diagrams.ts
|   |   |   |-- bindings.ts
|   |   |   `-- edgeServers.ts
|   |   `-- components/
|   |       |-- SaveConflictModal.tsx                 # planned
|   |       |-- BindingsInvalidatedModal.tsx          # planned/reworked
|   |       `-- SaveAsDialog.tsx                      # planned
|   `-- index.css
|-- public/
|   `-- constructor/                                  # planned hosted runtime assets
`-- tests/
    `-- integration/
        |-- HostedConstructorRoutes.test.tsx          # planned
        |-- HostedConstructorSaveFlow.test.tsx        # planned
        |-- FullConstructorBindings.test.tsx          # planned
        |-- ReducedConstructorPage.test.tsx           # planned
        `-- HostedConstructorUnsavedChanges.test.tsx  # planned

constructor/
|-- public/
|   |-- ui-controller.js
|   |-- canvas-manager.js
|   |-- file-manager.js
|   |-- bindings-manager.js
|   |-- properties-panel.js
|   |-- context-menu.js
|   |-- styles.css
|   `-- hosted-entry.js                               # planned hosted runtime entry
`-- server/
    `-- server.js                                     # legacy standalone/dev path
```

**Structure Decision**: Keep `/client` and `/constructor` as separate modules. Add a thin hosted-runtime boundary rather than rewriting constructor into React or importing constructor source directly into SPA code.

## Implementation Strategy

### Phase A: Hosted runtime extraction in `/constructor`

Goal: make the editor mountable into a supplied container without relying on the standalone `index.html` page contract.

Primary work:

- create `hosted-entry.js` that exports the hosted runtime factory;
- move shell rendering from standalone HTML assumptions to container-scoped bootstrapping;
- replace hardcoded page ids and page-level DOM assumptions with container-local queries;
- introduce explicit destroy/cleanup hooks;
- replace constructor-owned save/load actions with host intent callbacks;
- upgrade binding editing UI and runtime state from `deviceId` only to `deviceId + metric`.

### Phase B: Host pages and client orchestration in `/client`

Goal: make `/client` the owner of editor-route loading, CRUD, warnings, and mode-specific behavior.

Primary work:

- add typed `getDiagramById()` to diagram API utilities;
- add a thin `constructor-host` feature that loads the hosted runtime asset and mounts it into a React container;
- implement `FullConstructorPage` and `ReducedConstructorPage`;
- load diagram data from `/api/diagrams/:id`;
- load binding sets and machines only in full mode;
- resolve device-metric catalog through a client-owned adapter;
- keep re-auth overlays above the mounted page without unmounting the host.

### Phase C: Save orchestration and destructive flows

Goal: move the real product workflows around saving into the SPA layer.

Primary work:

- Save Layout -> `PUT /api/diagrams/:id`;
- Save As -> SPA naming flow -> `POST /api/diagrams`;
- Save Bindings -> `POST /api/diagrams/:id/bindings`;
- conflict handling -> show `SaveConflictModal` and preserve in-memory state;
- destructive save -> blocking choice between Save As and in-place save + post-save deletion of all binding sets;
- route-exit and machine-switch warnings driven by host-tracked dirty state.

### Phase D: Packaging, lifecycle safety, and validation

Goal: make hosted constructor behavior reliable in dev and deploy flows.

Primary work:

- package constructor runtime assets under the SPA deployment;
- ensure heavy editor assets are route-level only;
- use a mockable runtime loader for SPA integration tests;
- execute manual lifecycle smoke tests for mount/destroy/remount and async image restore;
- validate editor-parity coverage for images, widgets, connection points, connections, and editable properties.

## Key Design Notes For Task Generation

- Treat "machine" in UI as `edgeServerId` in persistence and routing.
- Full mode needs both trusted edge servers and a device-metric catalog; these are separate inputs.
- The current constructor binding model is insufficient and must be upgraded before full-mode hosting is correct.
- Admin reduced mode must not call USER-only bindings endpoints.
- Save As is in scope for this feature because the destructive-save flow depends on it.
- Build and deployment work is part of hosting implementation, but detailed chunking/copy mechanics should remain implementation tasks rather than spec scope.

## Complexity Tracking

No constitution violations.
