# Tasks: Frontend SPA Infrastructure

**Input**: Design documents from `/specs/002-frontend/`  
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/api.md`

> Directory note: all paths below use `client/src/`, the `/client` React SPA module.  
> `/dashboard` and `/constructor` remain vanilla JS modules and are not rewritten into React.

> Ownership sync note: `002-frontend` owns client consumer work that consumes the canonical edge contract from `004-edge-onboarding`, especially `My Equipment`, Constructor readiness UX, and Gallery -> native Dashboard handoff. `003-dashboard` remains the only owner of native Dashboard runtime/page behavior.

> Execution sync note: before starting any remaining edge-related tasks in this file, first update and close the contract-sync tail in `specs/004-edge-onboarding/tasks.md` (`T030-T035`). Only after that should the edge-related consumer work in `002` be revised or implemented.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: User Story label (`US1..US6`)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Initialize the SPA project in `client/`.

- [X] T001 Initialize React 19.2 + Vite 7.3 + TypeScript project in `client/package.json`, `client/vite.config.ts`, `client/tsconfig.json`
- [X] T001b [P] Configure Vitest + React Testing Library + MSW in `client/vite.config.ts` (test environment: `jsdom`) and `client/tests/setup.ts`; install `msw`, `@testing-library/react`, `@testing-library/user-event`
- [X] T002 [P] Configure TailwindCSS 4.2 in `client/src/index.css` using `@import "tailwindcss"` (CSS-first config, no `tailwind.config.js` needed for core setup)
- [X] T003 Configure Vite dev-server proxy (`/api -> localhost:4000`, `/socket.io -> ws`) in `client/vite.config.ts`
- [X] T004 Create React Router v7 browser router + root App layout in `client/src/app/App.tsx` and `client/src/main.tsx`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Base infrastructure that blocks all user stories.

**CRITICAL**: All story work starts only after this phase is complete.

- [X] T005 [P] Implement typed REST API client with JWT Bearer injection in `client/src/shared/api/client.ts`
- [X] T005b [P] Implement token refresh interceptor (`401 -> silent refresh -> on failure show re-auth overlay preserving current page state`) in `client/src/shared/api/tokenRefresh.ts`. **Canvas preservation constraint**: the re-auth overlay MUST render above the existing page DOM; the editor host MUST NOT be unmounted during re-auth flow so unsaved canvas state is retained.
- [X] T006 [P] Implement Auth Zustand store (`useAuthStore`: session, `setSession`, `logout`) in `client/src/shared/store/useAuthStore.ts`
- [X] T032 [P] [US5] Implement Telemetry Zustand store + WebSocket client (subscribe/unsubscribe, reconnect loop, edge-status events) in `client/src/shared/store/useTelemetryStore.ts`. Reconnect strategy: exponential backoff starting at 1 s, doubling each attempt up to max 30 s; retry indefinitely until manually unsubscribed.
- [X] T007 Implement `ProtectedRoute` component (role check: `ADMIN -> /admin` only, `USER -> /hub` only; Admin on `/hub/* -> /admin`; User on `/admin/* -> /hub`) in `client/src/shared/components/ProtectedRoute.tsx`
- [X] T008 [P] Create base `AppShell` component (nav bar, responsive sidebar placeholder) in `client/src/shared/components/AppShell.tsx`
- [X] T046 [P] Test: `useAuthStore` - `setSession`, `logout`, `isAuthenticated` transitions in `client/tests/unit/useAuthStore.test.ts`

**Checkpoint**: Foundation ready + auth store covered

---

## Phase 3: User Story 1 - Authentication & Protected Routing (Priority: P1)

**Goal**: Visitor logs in, resolves to the correct role-specific hub, and protected routes enforce access.

**Independent Test**: Unauthenticated user opens any protected route and is redirected to `/login`. Admin login opens `/admin`. User login opens `/hub`. User trying `/admin/...` is redirected to `/hub`.

- [X] T009 [P] [US1] Create public Landing Page in `client/src/features/public/pages/LandingPage.tsx` (product description, tier comparison, nav to Login)
- [X] T010 [P] [US1] Create Login Page UI in `client/src/features/auth/pages/LoginPage.tsx` (email + password form, link to register, error state)
- [X] T010b [P] [US1] Create Register Page UI in `client/src/features/auth/pages/RegisterPage.tsx` (email, password, confirm password with no-paste enforcement, link to login, error state)
- [X] T011 [US1] Implement `useLogin` hook calling `POST /auth/login` via `apiClient`, persisting session to `useAuthStore` in `client/src/features/auth/hooks/useLogin.ts`
- [X] T011b [US1] Implement `useRegister` hook calling `POST /auth/register` via `apiClient`, auto-logging in by persisting session to `useAuthStore` in `client/src/features/auth/hooks/useRegister.ts`
- [X] T012 [US1] Wire public routes `/`, `/login`, `/register` and protected hubs `/admin/*`, `/hub/*` in `client/src/app/routes.tsx`. All subsequent hub route tasks must extend the composed route modules in order: `T012 -> T019 -> T026 -> T031 -> T034 -> T039`
- [X] T049 Integration: `ProtectedRoute` - unauthenticated -> `/login`; `USER` on `/admin/* -> /hub`; `ADMIN` on `/hub/* -> /admin` in `client/tests/integration/ProtectedRoute.test.tsx`

**Checkpoint**: US1 fully functional and independently testable

---

## Phase 4: User Story 2 - User Hub: Diagram Gallery & Binding Management (Priority: P2)

**Goal**: User manages diagrams and Telemetry Profiles from a single gallery view.

**Independent Test**: Login as User with 2 diagrams. Both cards are shown. The first card expands 2 Telemetry Profile entries with correct action buttons. FREE limit blocks create at 3 diagrams before any network call.

- [X] T013 [P] [US2] Implement diagram API functions (GET list, POST create, PUT update, POST clone "Save As", POST assign-to-user, DELETE) in `client/src/shared/api/diagrams.ts`
- [X] T013b [P] [US2] Implement Telemetry Profile API functions (GET by diagram, POST create, PUT update, DELETE) in `client/src/shared/api/bindings.ts`
- [X] T014 [P] [US2] Create User Hub layout (sidebar nav: Gallery, Dashboard, Equipment, Profile) in `client/src/features/user-hub/UserHubLayout.tsx`
- [X] T015 [P] [US2] Implement `DiagramCard` with collapsible **Telemetry Profiles** section (entries: Open Dashboard, Edit Bindings, Delete Telemetry Profile) in `client/src/features/user-hub/components/DiagramCard.tsx`
- [X] T016 [US2] Implement `useDiagramLimits` hook (FREE tier: max 3 diagrams, enforced client-side before any network call) in `client/src/shared/hooks/useDiagramLimits.ts`. Hook MUST expose: `canCreate()`, `canClone()` and `canEdit(diagram)`; `canCreate()` and `canClone()` MUST return `false` when `diagrams.length >= 3` for FREE tier.
- [X] T017 [US2] Implement Gallery Page (fetch + render DiagramCards, create diagram CTA with limit check) in `client/src/features/user-hub/pages/GalleryPage.tsx`
- [X] T017b [P] [US2] Add **Edit Layout** (navigates to `/hub/editor/:id`; disabled if `canEdit(diagram)` is false) and **Delete Diagram** (confirmation dialog, then `DELETE /api/diagrams/:id`) to `client/src/features/user-hub/components/DiagramCard.tsx`
- [X] T018 [US2] Implement `useEdgeStatus` hook (real-time status from `useTelemetryStore` / WS `edge-status`, REST only for initial load or fallback) in `client/src/shared/hooks/useEdgeStatus.ts`
- [X] T019 [US2] Add `/hub`, `/hub/...` routes to `client/src/app/routes.tsx` (after T012)
- [X] T048 [P] Test: `useDiagramLimits` - FREE tier block at 3 diagrams, PRO unlimited, `canEdit()` ranking behavior in `client/tests/unit/useDiagramLimits.test.ts`
- [X] T050a Integration: `GalleryPage` (MSW: `GET /api/diagrams`) - render cards, FREE limit block, create CTA state in `client/tests/integration/GalleryPage.test.tsx`

**Checkpoint**: US1 + US2 independently functional + Gallery covered

---

## Phase 5: User Story 3 - Admin Hub: Fleet & User Management (Priority: P2)

**Goal**: Admin registers Edge Servers, manages users, assigns equipment and diagrams.

**Independent Test**: Login as Admin. Register Edge Server -> appears in fleet list. Assign to User. Change User tier. Ban User. Assign own diagram to User with free slot.

- [X] T020 [P] [US3] Implement Edge Server API functions (GET list, POST register with onboarding disclosure, POST bind, POST onboarding reset, POST trust-revoke, POST block, POST re-enable-onboarding) in `client/src/shared/api/edgeServers.ts`
- [X] T021 [P] [US3] Implement User management API functions (GET all users, PATCH tier, PATCH ban) in `client/src/shared/api/users.ts`
- [X] T022 [P] [US3] Create Admin Hub layout (sidebar nav: Overview, Edge Fleet, Users, Diagrams) in `client/src/features/admin-hub/AdminHubLayout.tsx`
- [X] T023 [US3] Implement Edge Fleet Page (list with `isOnline` from `useEdgeStatus`, register modal, assign modal, and canonical onboarding lifecycle actions per row) in `client/src/features/admin-hub/pages/EdgeFleetPage.tsx`
- [X] T024 [US3] Implement User Management Page (searchable paginated table, change tier, ban/unban) in `client/src/features/admin-hub/pages/UserManagementPage.tsx`
- [X] T025 [US3] Implement Admin Overview Page (platform stats, quick action shortcuts) in `client/src/features/admin-hub/pages/OverviewPage.tsx`
- [X] T025b [US3] Implement Admin Diagram Gallery Page (retained Admin-owned templates; per-card: Edit link -> `/admin/editor/:id`, Assign to User as an independent copy with Cloud-authoritative eligibility/quota handling) in `client/src/features/admin-hub/pages/DiagramGalleryPage.tsx`
- [X] T026 [US3] Add `/admin`, `/admin/...` routes to `client/src/app/routes.tsx` (after T019)
- [X] T050d [P] [US3] Integration: Admin Hub routes + Edge Fleet register/assign/lifecycle-action flows + Diagram assignment slot-check block (MSW) in `client/tests/integration/AdminHubPages.test.tsx`

**Checkpoint**: US1 + US2 + US3 independently functional

---

## Phase 6: User Story 4 - Diagram Creation & Layout Editing (Priority: P3)

**Goal**: Users and Admins create and edit mnemonic diagrams via hosted Constructor routes inside the SPA.

**Independent Test**: Create or open a diagram -> add widgets -> save -> navigate away -> return -> layout restored inside the SPA route without standalone Constructor page behavior.

- [X] T027 [P] [US4] Create thin hosted constructor integration in `client/src/features/constructor-host/` (`ConstructorHost.tsx` + runtime loader) that mounts the project-local `/constructor` runtime into a React container without direct source imports from `/constructor`. The host layer MUST support `mount -> destroy` lifecycle, runtime callbacks for save intents and dirty-state changes, and route-safe remount behavior.
- [X] T028 [US4] Implement Full Constructor Page (User) in `client/src/features/user-hub/pages/FullConstructorPage.tsx` using the hosted constructor runtime. The page MUST keep CRUD in `client`, load diagram data via diagram API, load binding sets via bindings API, load available machines from telemetry-ready assigned edge servers, and fetch a machine-scoped device/metric catalog from cloud APIs for the constructor. Constructor UI keeps the machine selector and editor-local toolbar, while the SPA handles Save Layout, Save As naming flow, bindings save orchestration, route-exit warnings, and machine-switch warnings for dirty bindings.
- [X] T029 [US4] Implement Reduced Constructor Page (Admin) in `client/src/features/admin-hub/pages/ReducedConstructorPage.tsx` using the same hosted runtime in `reduced` mode. The page MUST support layout load/save and Save As, MUST hide or disable bindings-related UI/behavior, and MUST NOT call bindings APIs in admin flows.
- [X] T030a [P] [US4] Implement `SaveConflictModal` (OCC version mismatch -> inform user save failed, offer reload/recovery path) in `client/src/shared/components/SaveConflictModal.tsx`
- [X] T030b [P] [US4] Rework `BindingsInvalidatedModal` into a destructive-save decision flow in `client/src/shared/components/BindingsInvalidatedModal.tsx`: when a diagram already has binding sets and a User attempts in-place layout save, the modal MUST clearly offer `Save As` as the non-destructive option and a destructive continue path that saves the layout and then deletes existing binding sets for that diagram.
- [X] T031 [US4] Add `/hub/editor/:id` and `/admin/editor/:id` routes to `client/src/app/routes.tsx` (after T026). Note: route wiring is implemented through `client/src/app/userHubRoutes.tsx` and `client/src/app/adminHubRoutes.tsx`, which are composed by `client/src/app/routes.tsx`.
- [X] T031a [P] [US4] Add `getDiagramById()` to `client/src/shared/api/diagrams.ts` and implement a client-owned catalog adapter for constructor full-mode data in `client/src/features/constructor-host/adapters/`, backed by cloud APIs rather than project-local static seed data.
- [X] T031b [P] [US4] Add deployment/build integration for hosted constructor assets so editor routes can load the runtime under the same SPA origin without relying on `constructor/public/index.html` in production.
- [X] T050b [P] Integration: cover `SaveConflictModal`, destructive-save modal flow, full-mode page orchestration, and reduced-mode no-bindings behavior in `client/tests/integration/`. Note: coverage is distributed across the existing hosted-constructor suites (`HostedConstructorSaveFlow`, `FullConstructorBindings`, `ReducedConstructorPage`, `HostedConstructorRoutes`, `HostedConstructorUnsavedChanges`) rather than a single dedicated 002-only test file.

**Cloud note**: this phase assumes cloud support for `GET /api/edge-servers/:edgeId/catalog` and `DELETE /api/diagrams/:id/bindings`, so hosted constructor flows do not rely on static catalog seeds or client-side bulk delete loops.

**Sync note**: this phase is functionally covered by the completed hosted-constructor integration work tracked in `specs/001-constructor-spa-hosting/tasks.md`; the items above are marked complete to reflect the current client/runtime/test state rather than a separate reimplementation pass.

### Chat Hotfix Notes (2026-03-22)

- [X] Hotfix (hosted runtime shell): replaced non-functional static `File` item list with a working hosted dropdown menu and added explicit `Save as` action wired to hosted callback flow (`onSaveAsIntent`) in `constructor/public/hosted-entry.js`, `constructor/public/ui-controller.js`, `constructor/public/file-manager.js`.
- [X] Hotfix (style leakage): removed hosted Bootstrap CSS dependency and introduced hosted-scoped constructor styling to prevent spillover into SPA navigation/sidebar styles in `constructor/public/hosted-entry.js` and `constructor/public/styles.css`.
- [X] Hotfix (layout containment): fixed embedded hosted header/workspace positioning so constructor UI stays inside its mount container instead of escaping to full viewport in `constructor/public/styles.css`.
- [X] Hotfix (standalone-only base styles): marked standalone constructor body with `data-constructor-standalone="true"` and scoped base CSS accordingly in `constructor/public/index.html` and `constructor/public/styles.css`.
- [X] Regression guard: extended hosted smoke coverage to assert `loadScheme()` emits `onSaveAsIntent` in hosted mode in `client/tests/smoke/hosted-constructor-runtime-hosted-mode-smoke.mjs`.
- [X] Verification runs for this hotfix set: `HostedConstructorRoutes`, `HostedConstructorUnsavedChanges`, `ConstructorHostFoundation`, and `smoke:hosted` all pass.

### Chat Hotfix Notes (2026-03-22, cloud support for hosted save flows)

- [X] Hotfix (diagram save payload): increased request body parser limit for JSON/urlencoded payloads via `REQUEST_BODY_LIMIT` (default `10mb`) to prevent `PayloadTooLargeError` during `Save`/`Save As` with embedded images in `cloud_server/src/config/env.ts`, `cloud_server/src/app.ts`, `cloud_server/.env.example`.
- [X] Hotfix (error contract): mapped body-parser oversized payload errors (`entity.too.large`) to explicit HTTP `413` responses instead of generic `500` in `cloud_server/src/api/middlewares/error.middleware.ts`.
- [X] Hotfix (config stability): pinned env loading to `cloud_server/.env` regardless of process working directory to avoid accidental DB target drift between restarts in `cloud_server/src/config/env.ts`.
- [X] Hotfix (admin bootstrap): added idempotent default-admin provisioning on cloud startup (with safe warning on invalid admin env config) in `cloud_server/src/app.ts`.
- [X] Regression guard: added unit coverage for error middleware `413` mapping in `cloud_server/tests/unit/error.middleware.test.ts`.
- [X] Verification runs for this hotfix set: `npm run typecheck` and `npm run test -- tests/unit/error.middleware.test.ts tests/unit/seed.test.ts tests/unit/auth.test.ts` passed in `cloud_server/`.

### Chat Hotfix Notes (2026-03-22, gallery/editor rename UX + card layout)

- [X] Hotfix (US2 Gallery card layout): prevented row-wide card stretching when expanding `Telemetry Profiles`; only expanded card grows while neighboring cards stay top-aligned in `client/src/features/user-hub/pages/GalleryPage.tsx`.
- [X] Hotfix (US2 inline rename): added inline diagram rename in Gallery card title area with square pencil action; edit-in-place input supports save on `Enter`/`blur` and cancel on `Esc`, wired to diagram update API in `client/src/features/user-hub/components/DiagramCard.tsx`, `client/src/features/user-hub/pages/GalleryPage.tsx`.
- [X] Hotfix (US4 editor header rename): added editable diagram title in hosted full editor header (`/hub/editor/:id`) with pencil action and save on `Enter`/`blur` (cancel on `Esc`) via lightweight name update call in `client/src/features/user-hub/pages/FullConstructorPage.tsx`.
- [X] Verification runs for this hotfix set: `vitest run tests/integration/HostedConstructorRoutes.test.tsx` passed; `npm run build` in `client/` remains blocked by pre-existing TypeScript errors in `client/src/features/constructor-host/adapters/bindingsAdapter.ts` (not part of this hotfix scope).

**Checkpoint**: US1-US4 independently functional + hosted editor flows covered

---

## Phase 7: User Story 5 - Telemetry Workflow Readiness (Priority: P3)

**Goal**: User consumes the already-canonical edge lifecycle contract in the SPA: verifies assigned equipment, prepares a saved Telemetry Profile from the hosted Constructor against a telemetry-derived edge catalog, and reaches the native SPA Dashboard through stable client entry points.

**Independent Test**: Admin assigns an edge to a User. The User opens `/hub/edge` and sees the assigned edge with online/offline state. The User then opens `/hub/editor/:id` for a diagram, sees explicit guidance when the selected edge has not produced telemetry-derived catalog data yet, saves a Telemetry Profile once catalog data exists, and returns to the native `/hub/dashboard?diagramId=X&edgeId=Y` route from Gallery without any legacy `/dashboard` wrapper dependency.

- [X] T033 [US5] Implement My Equipment Page as a pure consumer of the canonical `004-edge-onboarding` lifecycle/readiness contract (read-only assigned edge list with online/offline and last-seen status from `useEdgeStatus`) in `client/src/features/user-hub/pages/MyEquipmentPage.tsx`
- [X] T034 [US5] Add `/hub/edge` route in `client/src/app/userHubRoutes.tsx` so the existing User Hub Equipment navigation resolves to a concrete page instead of the placeholder fallback
- [X] T035 [US5] Add Constructor-side consumer guidance for the canonical onboarding/readiness contract in `client/src/features/user-hub/pages/FullConstructorPage.tsx` for cases where a trusted edge is selected but no telemetry-derived catalog entries exist yet; do not introduce Dashboard runtime behavior here
- [X] T036 [US5] Resolve friendly edge display names for Telemetry Profile cards and preserve only the Gallery -> native Dashboard handoff on `/hub/dashboard?diagramId=<id>&edgeId=<id>` in `client/src/features/user-hub/pages/GalleryPage.tsx` and `client/src/features/user-hub/components/DiagramCard.tsx`; native Dashboard page behavior itself remains owned by `003-dashboard`
- [X] T047 [P] Test: `/hub/edge` route and `MyEquipmentPage` assigned-edge status rendering in `client/tests/integration/MyEquipmentPage.test.tsx`
- [X] T050c Integration: telemetry workflow readiness from empty-catalog constructor guidance to saved-profile Dashboard handoff in `client/tests/integration/TelemetryWorkflowReadiness.test.tsx`

**Scope note**: Native Dashboard route behavior, runtime session logic, monitoring rendering, reconnect UX, and Dashboard-specific page logic are owned by `specs/003-dashboard/` and are intentionally not duplicated in this frontend task list. `002` stops at consumer entry points and readiness-oriented UX.

**Checkpoint**: US1-US5 independently functional on the client side for the full telemetry preparation flow, with native Dashboard entry points ready for end-to-end validation once edge registration credentials and a local simulator are available

---

## Phase 8: User Story 6 - Profile & Subscription Awareness (Priority: P4)

**Goal**: User views subscription tier, usage limits, and changes password.

**Independent Test**: Login as FREE User with 2/3 diagrams and one assigned edge. Open Profile and verify tier, diagram usage, edge quota usage, and password-change affordances are rendered correctly.

- [X] T037 [P] [US6] Implement profile API functions (GET `/api/users/me`, PATCH password) in `client/src/shared/api/profile.ts`
- [X] T038 [US6] Implement Profile Page (tier, diagram usage vs limit, equipment quota usage, upgrade prompt, password change form) in `client/src/features/user-hub/pages/ProfilePage.tsx`
- [X] T039 [US6] Add `/hub/profile` route in `client/src/app/userHubRoutes.tsx` so the existing User Hub Profile navigation resolves to a concrete page
- [X] T040 [P] [US6] Integration: Profile tier, diagram usage, and edge quota summary in `client/tests/integration/ProfilePage.test.tsx`

**Checkpoint**: All user stories functional

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Non-functional quality gates from Success Criteria.

- [X] T041 [P] SC-002: Audit route transition performance (target < 1s); add `React.lazy` + `Suspense` code-splitting per feature if needed in `client/src/app/routes.tsx`
- [X] T042 [P] SC-006: Validate assigned-edge status freshness and client telemetry workflow handoff timing in `client/tests/integration/MyEquipmentPage.test.tsx` and `client/tests/integration/TelemetryWorkflowReadiness.test.tsx`
- [X] T043 [P] SC-007/SC-008: Verify binding-save operations and constructor catalog-readiness timing (< 2s / < 1.5s where applicable); add loading or guidance states where missing in `client/src/features/user-hub/pages/FullConstructorPage.tsx` and `client/tests/integration/TelemetryWorkflowReadiness.test.tsx`
- [X] T044 Security hardening: confirm JWT not exposed in `window.*`, no hardcoded URLs, Vite proxy validated in `client/vite.config.ts`
- [X] T045 Code cleanup: remove unused scaffold code, normalize Tailwind theme tokens in `client/src/index.css`
- [X] T051 SC-009 Validation: run `npm test`; verify 100% pass rate for all implemented test suites

**Checkpoint**: All quality gates passed (SC-002, SC-006, SC-007, SC-008, SC-009)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies - start immediately
- **Phase 2 (Foundation)**: Depends on Phase 1 - blocks all user stories
- **Phase 3-8 (User Stories)**: All depend on Phase 2; sequential by priority
  - US2, US3, and US6 require T032 to be completed
  - US3 can start in parallel with US2 (separate hub directories)
  - US4 requires US2 Gallery to navigate to editor
  - US5 requires the `004-edge-onboarding` contract-sync tail to be updated first (`specs/004-edge-onboarding/tasks.md` T030-T035)
  - US5 then requires US3 and US4 because assigned equipment, trusted-edge selection, and saved binding profiles must exist before the client telemetry workflow can be exercised
  - US5 also assumes the native Dashboard implementation tracked in `specs/003-dashboard/`
- **Phase 9 (Polish + Validation)**: Depends on all stories; run T051 last to confirm SC-009

### Hub Route Wiring Order

Hub route wiring tasks must execute in strict order across the composed route modules:

```text
T012 (public + hub shell) -> T019 (user hub shell) -> T026 (admin hub shell) -> T031 (editors) -> T034 (/hub/edge) -> T039 (/hub/profile)
```

### Parallel Opportunities

Within each story, `[P]` tasks can run concurrently when they touch separate files.

---

## Implementation Strategy

### MVP (US1 only - Phase 1-3)

1. Phase 1: Initialize `client/`
2. Phase 2: API client, Auth store, ProtectedRoute
3. Phase 3: Landing, Login, route guards
4. Stop and validate

### Incremental Delivery

- US2 -> Gallery + Telemetry Profiles
- US3 -> Admin Hub
- US4 -> Hosted constructor routes + destructive-save flow + integration tests
- Sync `004` edge contract tasks first (`T030-T035`)
- US5 -> Equipment + constructor telemetry-readiness consumer UX + native Dashboard handoff
- US6 -> Profile
- Phase 9 -> Polish + validation gate

### Ownership-Aware Order For Remaining Edge Work

1. Update and close the remaining contract-sync tail in `004-edge-onboarding`.
2. Re-read the canonical edge contract exposed by `004` before touching `US5` tasks here.
3. Execute only `002` consumer work: `My Equipment`, Constructor readiness guidance, and Gallery -> native Dashboard handoff.
4. If a task starts changing Dashboard runtime/page behavior, move it to `003-dashboard` instead of implementing it here.

---

## Phase 10: User Story 3 Follow-up - Cloud-Owned Edge Contract Sync (Priority: P2)

**Goal**: Align shared client edge consumption and Admin Fleet flows with the canonical cloud-owned contract (`Active | Blocked`, separate availability, one-time persistent credential disclosure, `rotate-credential / block / unblock`).

**Independent Test**: Login as Admin, open `/admin/edge`, register a new edge, receive the one-time persistent credential disclosure, then rotate credential, block, and unblock the edge. The fleet list shows lifecycle (`Active` or `Blocked`) separately from availability (`Online` or `Offline`) and no onboarding-only states or actions remain in the client flow.

- [X] T052 [US3] Replace legacy onboarding edge DTOs/endpoints with canonical cloud-owned edge REST types, credential disclosures, admin/user fleet fetchers, and ping snapshot normalization in `client/src/shared/api/edgeServers.ts`
- [X] T053 [US3] Update REST fallback status loading to consume canonical availability snapshots without onboarding or telemetry-ready heuristics in `client/src/shared/hooks/useEdgeStatus.ts`
- [X] T054 [US3] Rework Admin Fleet registration and row actions to use one-time persistent credential disclosure plus `rotate-credential`, `block`, and `unblock` flows in `client/src/features/admin-hub/pages/EdgeFleetPage.tsx`
- [X] T055 [US3] Sync admin edge contract coverage and fixtures with canonical endpoints/payloads in `client/tests/unit/edgeServers.normalization.test.ts`, `client/tests/unit/useEdgeStatus.test.tsx`, `client/tests/unit/repro_task_T010.test.ts`, `client/tests/integration/AdminHubPages.test.tsx`, `client/tests/mocks/handlers.ts`

**Checkpoint**: Admin-facing edge management and shared client edge contract consumption match the canonical cloud-owned lifecycle/actions model.

---

## Phase 11: User Story 5 Follow-up - User Edge Consumer Contract Sync (Priority: P3)

**Goal**: Remove onboarding-specific client assumptions from user-facing edge consumers while preserving `002-frontend` ownership boundaries: client-only lifecycle/availability UX, constructor readiness guidance, and Gallery -> native Dashboard handoff.

**Independent Test**: Login as User, open `/hub/edge`, and verify assigned edges render canonical lifecycle plus separate online/offline status and `lastSeenAt`, including blocked assignments. Then open `/hub/editor/:id` and Gallery flows and verify blocked or catalog-empty edge cases show guidance without promising invalid monitoring, while valid Telemetry Profile cards still hand off to `/hub/dashboard?diagramId=X&edgeId=Y` without introducing `003-dashboard` runtime behavior.

- [X] T056 [P] [US5] Update assigned-edge consumer presentation to render canonical lifecycle and availability states without Active-only filtering or readiness wording in `client/src/features/user-hub/pages/MyEquipmentPage.tsx`
- [X] T057 [P] [US5] Propagate canonical edge lifecycle/availability context through hosted constructor machine options and Gallery telemetry-profile consumer UX without changing native Dashboard runtime ownership in `client/src/features/constructor-host/types.ts`, `client/src/features/constructor-host/adapters/catalogAdapter.ts`, `client/src/features/user-hub/pages/FullConstructorPage.tsx`, `client/src/features/user-hub/pages/GalleryPage.tsx`, `client/src/features/user-hub/components/DiagramCard.tsx`
- [X] T058 [US5] Sync user-facing contract regression coverage and fixtures for blocked/offline/catalog-empty edge cases in `client/tests/integration/ConstructorHostFoundation.test.tsx`, `client/tests/integration/MyEquipmentPage.test.tsx`, `client/tests/integration/GalleryPage.test.tsx`, `client/tests/integration/TelemetryWorkflowReadiness.test.tsx`, `client/tests/mocks/handlers.ts`

**Checkpoint**: User-facing edge consumer surfaces are aligned with the canonical cloud-owned lifecycle/availability semantics, with no onboarding-specific client assumptions reintroduced.
