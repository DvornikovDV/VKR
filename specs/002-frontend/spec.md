# Feature Specification: Frontend SPA Infrastructure

**Feature Branch**: `002-frontend`
**Created**: 2026-03-03
**Status**: Draft
**Input**: User description: "002-frontend. Согласно доку SPA_VISION приступаем к проектированию клиентской части, а именно SPA. Оставляем стек с React."

---

## 1. Problem Statement & Purpose

There is no unified client-side application for the SCADA system. The Constructor (visual editor) and cloud API exist independently with no shared shell, routing, or authentication flow. This feature establishes the SPA — a single-page application that provides a public landing zone, a role-specific Admin Hub, and a role-specific User Hub, all without full browser page reloads between screens.

---

## Ownership Sync

- `007-edge-server` owns the canonical Edge lifecycle semantics; the active cloud-owned contract is defined by `001-cloud-server` (`cloud_server/openapi.yaml` + `specs/001-cloud-server/contracts/websocket.md`).
- `002-frontend` owns SPA shell behavior plus client consumer surfaces such as `My Equipment`, Constructor readiness guidance, and Gallery -> Dashboard handoff.
- `003-dashboard` owns the native Dashboard runtime/page behavior inside `client`.

---

## Clarifications

### Session 2026-03-04
- Q: Поведение системы при понижении тарифа (Downgrade PRO → FREE) → A: Read-only like (Edit доступен только для 3 новейших схем, остальные только для чтения/дашборда; Save As полностью заблокирован при превышении лимита).
- Q: Обработка `bindingsInvalidated` при сохранении in-place → A: Confirm to Break. Бэкенд уже проверяет состав виджетов (если изменился только визуал — бинды остаются актуальными). Если бэкенд возвращает флаг инвалидации, Фронтенд показывает жесткий модальный диалог всем пользователям: "Сохранение новых изменений сделает текущие привязки к оборудованию недействительными. Вам придется настроить их заново. Продолжить сохранение? [Да, сохранить] / [Отмена]". Старые неактуальные бинды не удаляются автоматически бэкендом (согласно FR-5 Cloud Server), поэтому пользователю придется перенастроить их вручную в редакторе.
- Q: Стандартизация терминологии для UI и кода → A: Для консистентности используются следующие каноничные термины: визуал — **Mnemonic Diagram (Мнемосхема)**; привязки данных — **Telemetry Profile (Профиль телеметрии)**; оборудование в контексте дашборда — **Monitored Object (Объект мониторинга)** (инфраструктурно это по-прежнему Edge Server).

### Session 2026-03-05
- Q: Уровень тестирования для модуля `/client` → A: **Unit + Integration**. Unit-тесты (Vitest) покрывают stores и hooks; Integration-тесты (React Testing Library) — компоненты с поведением.
- Q: Минимальный порог покрытия кода тестами → A: **≥70%** для `client/src/shared/` (stores, hooks, api) и `client/src/shared/components/ProtectedRoute`. Компоненты страниц и Vanilla-врапперы не входят в порог.
- Q: Какие компоненты/страницы покрываются Integration-тестами (RTL) → A: `ProtectedRoute`, `GalleryPage`, `DashboardPage`, `SaveConflictModal`, `BindingsInvalidatedModal`.
- Q: Стратегия мокирования REST API и WebSocket в тестах → A: **MSW (Mock Service Worker)** для REST-запросов; `vi.spyOn` / mock WebSocket для socket-событий.
- Q: Расположение тестовых файлов → A: `client/tests/unit/` и `client/tests/integration/` — плоская структура по домену (без зеркалирования `src/`), по аналогии с `cloud_server/tests/`.

---

## 2. Application Structure & Routing

The SPA renders a completely different shell based on the user's role after login. Admin and User have **non-overlapping hubs** with a shared public zone.

### Public Zone

| Route | Page | Description |
|---|---|---|
| `/` | **Landing** | Product description, feature highlights, pricing tiers (static). Navigation to Login. |
| `/login` | **Login** | Email + password form. Link to Registration page. On success: redirect to `/admin` (Admin role) or `/hub` (User role). |
| `/register` | **Registration** | Email, password, and confirm password form (no paste allowed in confirm password). Link to Login page. On success: automatic login and redirect to `/hub`. |

### Admin Hub

Default landing after Admin login: `/admin` (Overview).

| Route | Page | Description |
|---|---|---|
| `/admin` | **Overview** *(main)* | Brief platform stats (user count, Edge count, diagram count). Quick action shortcuts: "Register Edge Server", "Create Diagram". |
| `/admin/users` | **User Management** | Searchable, paginated table of all users across the platform. Columns: email, role, tier (FREE/PRO), status (active/banned). Actions: change tier, ban/unban account. No role promotion to Admin (Admin is a service role, not a user privilege). |
| `/admin/edge` | **Edge Fleet** | Global list of all registered Edge Servers (regardless of who registered them). Columns: name, availability status (Online/Offline — updated automatically while the page is open), lifecycle state (`Active` or `Blocked`), assigned user, registered by (Admin who created the record). Actions per row: Assign to user, rotate credential, block, and unblock according to the active cloud-owned edge contract. Status is updated via WebSocket in the background (with fallback REST). |
| `/admin/diagrams` | **Diagram Gallery (Admin)** | Admin's retained layout templates. Actions per card: Edit (opens reduced constructor), Assign to User (creates an independent User-owned copy; the Admin template remains visible and editable). Assignment search supports eligible Users beyond the first page, while Cloud remains authoritative for eligibility and quota. |
| `/admin/editor/:id` | **Reduced Constructor** | Visual layout editor without the Binding panel and without machine selection. Admin can design diagram structure only. Saving persists the layout. |

### User Hub

Default landing after User login: `/hub` (Diagram Gallery).

| Route | Page | Description |
|---|---|---|
| `/hub` | **Diagram Gallery** *(main)* | All diagrams the user owns (created by them or assigned by Admin). Each card shows: diagram name, thumbnail. **Actions on the card itself**: Edit Layout (opens Constructor) and Delete (permanently remove diagram, with confirmation dialog). The card also contains a collapsible **Telemetry Profiles section** (mini-gallery) listing profiles for that diagram (one per assigned machine). **Actions inside the profile entry**: Open Dashboard for that machine, Edit Telemetry Profile (opens Constructor pre-loaded with this profile), Delete Telemetry Profile. Create new diagram button is separate on the page (blocked with message if FREE tier limit reached). |
| `/hub/editor/:id` | **Full Constructor** | Visual layout editor with a **Telemetry Profile panel**. At the top of the Telemetry Profile panel: machine selector dropdown (choose existing Telemetry Profile or create a new one for another machine). Widget properties show current binding (`deviceId` + `metric`). Saving diagram layout and saving Telemetry Profile are separate explicit actions. Deleting the currently selected Telemetry Profile is available in the machine selector. |
| `/hub/dashboard` | **Dashboard** | Native monitoring page inside the SPA. In `002-frontend`, this route is owned only as a navigation target and handoff entry point; detailed runtime/page behavior belongs to `003-dashboard`. Entry points: nav bar or Gallery Telemetry Profile card "Open Dashboard" (adds `?diagramId=X&edgeId=Y` query params to pre-fill the native Dashboard context). |
| `/hub/edge` | **My Equipment** | List of Edge Servers assigned to this user by an Admin. Shows: name, lifecycle state (`Active` or `Blocked`), Online/Offline status (auto-updated while page is open), and canonical availability last-seen timestamp (`lastSeenAt`). No management actions — this is a read-only view. |
| `/hub/profile` | **Profile** | Current subscription tier (FREE/PRO), usage stats (e.g., "2/3 diagrams", "1/1 edge servers for FREE), remaining capacity. Password change form. Upgrade tier prompt (informational only — user cannot self-upgrade at MVP). |

---

## 3. User Scenarios & Testing *(mandatory)*

### User Story 1 — Authentication, Registration & Protected Routing (Priority: P1)

As a visitor, I want to create an account and securely log in to the application so that I can access my role-specific workspace.

**Why this priority**: Authentication is the gateway to all other functionality. Without it, no protected feature is accessible.

**Independent Test**: Navigate to any protected route unauthenticated → verify redirect to `/login`. Log in with Admin credentials → verify redirect to `/admin`. Log in with User credentials → verify redirect to `/hub`. Attempt to access `/admin` as a User → verify redirect to `/hub`.

**Acceptance Scenarios**:

1. **Given** an unauthenticated visitor, **When** they navigate to any protected route, **Then** they are redirected to `/login` and the intended URL is preserved for post-login redirect.
2. **Given** a visitor on the `/login` page, **When** they click the register link, **Then** they are taken to the `/register` page.
3. **Given** a visitor on the `/register` page, **When** they fill out email, password, and confirm password (matching), **Then** an account is created, they are automatically logged in, and redirected to `/hub`.
4. **Given** valid Admin credentials, **When** the user logs in, **Then** they are redirected to `/admin` (Admin Overview).
5. **Given** valid User credentials, **When** the user logs in, **Then** they are redirected to `/hub` (Diagram Gallery).
6. **Given** an authenticated User, **When** they navigate to any `/admin/*` route, **Then** they are denied access and redirected to `/hub`.
7. **Given** an active session, **When** the session token expires mid-session, **Then** the user is prompted to re-authenticate; after login they are returned to the page they were on.

---

### User Story 2 — User Hub: Diagram Gallery & Binding Management (Priority: P2)

As a User, I want to manage my diagrams and their machine bindings from a single gallery view, and jump directly into a specific diagram-machine combination to view live data.

**Why this priority**: The Gallery is the primary landing screen for Users and the central navigation hub for all user-facing features.

**Independent Test**: Log in as a User with 2 diagrams (one with 2 telemetry profiles, one with 0). Verify: both diagrams appear; first card shows 2 machine entries in its Telemetry Profiles section with correct action buttons; second card shows an empty state message ("No Telemetry Profiles yet. Open Constructor to create one.").

**Acceptance Scenarios**:

1. **Given** an authenticated User, **When** they open `/hub`, **Then** they see all their diagrams (owned or assigned by Admin).
2. **Given** a diagram with Telemetry Profiles for Machine A and Machine B, **When** the user expands the Telemetry Profiles section of that card, **Then** they see two entries — one per machine — each with "Open Dashboard" and "Edit Telemetry Profile" buttons.
3. **Given** a User on a FREE tier with 3 diagrams, **When** they attempt to create a new diagram or perform "Save As", **Then** the system blocks the action client-side (before any network call) and shows the limit message; Admin assignment is submitted to Cloud, which revalidates the target's current quota.
4. **Given** a diagram with no Telemetry Profiles, **When** the user opens it in the Constructor and selects a machine in the Telemetry Profile panel, **Then** a new Telemetry Profile is created for that `(diagram + machine)` pair.
5. **Given** the same diagram assigned as a template for two machines, **When** the user opens "Edit Telemetry Profile" for Machine B, **Then** the Constructor opens pre-loaded with the Machine B Telemetry Profile without affecting Machine A Telemetry Profile.
6. **Given** a User, **When** they perform "Save As" on any diagram (whether self-created or assigned by Admin), **Then** a new diagram is created (diagram count +1) with no bindings, subject to FREE-tier limits.

---

### User Story 3 — Admin Hub: Fleet & User Management (Priority: P2)

As an Admin, I want to register and manage all Edge Servers on the platform and manage all user accounts.

**Why this priority**: Admins are the operators who onboard customers and manage hardware. Without this, no user can receive equipment access.

**Independent Test**: Log in as Admin. Register a new Edge Server → it appears in the Edge Fleet list. Assign it to a User → it appears in the User's equipment list. Change that User's tier from FREE to PRO → their profile reflects the change immediately.

**Acceptance Scenarios**:

1. **Given** an authenticated Admin, **When** they register a new Edge Server, **Then** the system creates the edge record in lifecycle state `Active`, discloses the first persistent credential once, and the new server appears in the global Edge Fleet list.
2. **Given** the Edge Fleet page is open, **When** an Edge Server changes its connection state, **Then** the status in the list updates automatically without requiring a manual page refresh.
3. **Given** an authenticated Admin, **When** they rotate the credential or block an Edge Server, **Then** the current trusted session is no longer allowed to send telemetry and the fleet view reflects the resulting lifecycle/availability change.
4. **Given** an authenticated Admin, **When** they assign an Edge Server to a User, **Then** the server appears in that User's `/hub/edge` equipment list.
5. **Given** an authenticated Admin, **When** they change a User's subscription tier, **Then** the change is reflected in the User's profile immediately.
6. **Given** an authenticated Admin, **When** they ban a user account, **Then** the user can no longer log in.
7. **Given** an authenticated Admin, **When** they assign one of their own retained templates to an eligible User, **Then** Cloud creates an independent User-owned copy from the latest persisted template layout with no bindings, and the source template remains in the Admin gallery.
8. **Given** an authenticated Admin, **When** they attempt to assign a template to an ineligible, quota-full, or already-assigned User, **Then** Cloud rejects the operation and the UI shows the rejection without claiming success.

---

### User Story 4 — Diagram Creation & Layout Editing (Priority: P3)

As either a User or Admin, I want to create and visually edit mnemonic diagrams in the Constructor.

**Why this priority**: Diagrams are the core deliverable of the SCADA system. The Constructor is the primary tool for producing them.

**Independent Test**: Create a new diagram → add widgets → save → navigate away → return to the editor → verify layout is restored.

**Acceptance Scenarios**:

1. **Given** a User in the Constructor, **When** they save a diagram layout (in-place), **Then** the layout is persisted and the user is warned if any existing binding sets may be invalidated.
2. **Given** a User in the Constructor, **When** a concurrent save conflict occurs (Optimistic Concurrency Control), **Then** the user is informed that their save failed due to a version conflict and is prompted to reload.
3. **Given** a User in the full Constructor, **When** they select a machine in the Bindings panel, **Then** widget properties show device and metric selectors limited to sensors accessible through that machine.
4. **Given** an Admin in the reduced Constructor, **Then** the Bindings panel is not present and widget properties show no machine/metric selectors.

---

### User Story 5 — Dashboard Entry Points & Native Handoff (Priority: P3)

As a User, I want stable SPA entry points into the native Dashboard so that I can move from Gallery or hub navigation into monitoring without the frontend foundation re-defining Dashboard runtime behavior.

**Why this priority**: The SPA foundation must provide a consistent path into monitoring, but the monitoring page itself now has its own implementation owner in `003-dashboard`.

**Independent Test**: Open `/hub/dashboard` from the User Hub navigation and from a Gallery Telemetry Profile card. Verify the route stays inside the SPA shell, valid Gallery handoff appends `?diagramId=X&edgeId=Y`, and consumer surfaces show guidance instead of promising monitoring when lifecycle/availability state or a missing saved Telemetry Profile means no valid monitoring context exists.

**Acceptance Scenarios**:

1. **Given** a User navigates to `/hub/dashboard` from the User Hub navigation, **When** the route opens, **Then** the SPA stays within the authenticated User Hub shell and hands off page behavior to the native Dashboard feature owned by `003-dashboard`.
2. **Given** a User clicks "Open Dashboard" on a Telemetry Profile entry in Gallery, **When** the route is constructed, **Then** the frontend passes `diagramId` and `edgeId` query params to `/hub/dashboard` so the native Dashboard can resolve the intended monitoring context.
3. **Given** a User has not yet produced a valid monitoring context because the selected edge lifecycle/availability state does not permit the intended monitoring flow or no saved Telemetry Profile exists, **When** they remain in Gallery or Constructor consumer flows, **Then** those surfaces explain the missing prerequisite instead of silently handing off an invalid Dashboard context.
4. **Given** detailed Dashboard selection, runtime rendering, reconnect messaging, or monitoring-state behavior is needed, **When** the product team implements or changes that behavior, **Then** the work belongs to `003-dashboard`, not to this frontend foundation spec.

### User Story 6 — Profile & Subscription Awareness (Priority: P4)

As a User, I want to view my subscription tier, usage limits and remaining capacity, and change my password.

**Why this priority**: Transparency about limits prevents confusion when quota restrictions are enforced. Password change is a baseline account management capability.

**Independent Test**: Log in as a FREE User with 2/3 diagrams used → open Profile → verify tier, diagram count, and equipment count are correctly displayed.

**Acceptance Scenarios**:

1. **Given** an authenticated FREE User, **When** they open `/hub/profile`, **Then** they see tier="FREE", diagram usage (e.g., "2 / 3"), equipment count (e.g., "1 / 1"), and an informational upgrade prompt.
2. **Given** an authenticated PRO User, **When** they open `/hub/profile`, **Then** they see tier="PRO" and no limit indicators (unlimited).
3. **Given** a User on the Profile page, **When** they submit a new password (with current password confirmation), **Then** the password is updated and the current session remains valid.

---

### Edge Cases

- **Session expiry during editing**: Token expires while user is in the Constructor. Expected: prompt to re-authenticate without losing unsaved canvas state (preserve in local memory).
- **Network disconnect on Dashboard**: Expected: behavior is defined by `003-dashboard` runtime requirements; `002-frontend` only owns the route entry point and handoff into that page.
- **Edge Server deleted by Admin while User views its Dashboard**: Expected: Dashboard shows the device as Offline and stops receiving telemetry.
- **FREE User attempting "Save As" at diagram limit**: Expected: action blocked with tier limit message before any network call.
- **Downgrade PRO → FREE with exceeded limits**: The newest 3 diagrams by `updatedAt` (last modified timestamp) remain fully editable in the Constructor. The rest become read-only (Dashboard access only, Constructor Edit blocked). "Save As" is completely blocked until the total diagram count is strictly below 3. The `useDiagramLimits` hook MUST implement this ranking by `updatedAt` descending.
- **No assigned equipment (new User)**: Expected: `/hub/edge` shows an empty-state message explaining that equipment is assigned by an Administrator. Diagram creation is allowed (layouts can exist without bindings).
- **Admin template owner later banned or source template deleted**: Existing assigned User copies remain independent and usable; no later template change is synchronized into them.
- **Two sessions saving the same diagram concurrently (OCC conflict)**: Second save fails with version conflict; user is shown a dialog to reload the latest version.
- **Opening Dashboard route directly without a valid binding set**: Expected: the native Dashboard page handles invalid-selection or binding-missing recovery states according to `003-dashboard`; `002-frontend` only provides the route entry point and handoff parameters.

---

## 4. Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a public landing page (`/`) with navigation to authentication.
- **FR-002**: System MUST authenticate users via email and password and maintain sessions via secure tokens.
- **FR-003**: System MUST redirect users to their role-appropriate hub after login, and enforce route isolation: Users are blocked from `/admin/*` routes and redirected to `/hub`. Admins are granted access to `/admin/*` only. Admins attempting to navigate to `/hub/*` are redirected to `/admin`. (No cross-hub access for either role.)
- **FR-004**: System MUST provide a User Hub with a Diagram Gallery as the default view. Each diagram card MUST expose a collapsible Bindings section listing all binding sets (one per machine) with per-entry actions: Open Dashboard, Edit Bindings, Delete Binding Set.
- **FR-005**: System MUST provide a Full Constructor for Users, including a Bindings panel with: machine selector (from the user's assigned equipment list), per-widget property editor (device and metric), save binding set, and delete current binding set actions.
- **FR-006**: System MUST provide a Reduced Constructor for Admins — identical to the Full Constructor but without the Bindings panel and without machine/metric selectors in widget properties.
- **FR-007**: System MUST support diagram lifecycle: create new (in Gallery), edit/save (in-place, in Constructor), save as (clone, in Constructor), permanently delete (in Gallery). All operations MUST enforce FREE-tier limits (max 3 diagrams for FREE users).
- **FR-008**: System MUST provide the native Dashboard route entry point at `/hub/dashboard` and support Gallery -> Dashboard handoff with optional `?diagramId=X&edgeId=Y` query params; detailed page/runtime behavior is owned by `003-dashboard`.
- **FR-009**: System MUST display Edge Server connection statuses (Online/Offline) with automatic status updates via WebSocket `edge_status` events, with optional periodic REST revalidation as fallback; no manual ping button on: `/hub/edge` (User's equipment) and `/admin/edge` (Global fleet).
- **FR-010**: System MUST provide an Admin Hub with pages for: Overview (platform stats + quick actions), User Management, Edge Fleet, and Admin Diagram Gallery.
- **FR-011**: System MUST allow Admins to: register Edge Servers (disclosing the first persistent credential once), assign/reassign Edge Servers to users, rotate edge credentials, block edges, unblock edges, and view all users plus change tier/ban status.
- **FR-012**: System MUST allow Admins to assign their own retained layout templates to eligible Users. Assignment creates an independent User-owned copy from the latest persisted template, copies no bindings, and leaves the Admin template visible and editable. Client eligibility is guidance only; Cloud authoritatively revalidates target state, current quota, and duplicate assignment.
- **FR-013**: System MUST display a User Profile page (`/hub/profile`) showing: subscription tier, diagram usage vs. limit, assigned equipment count vs. limit, upgrade prompt (informational). MUST include a password change form.
- **FR-014**: System MUST warn the user via a blocking modal dialogue on in-place diagram save if the backend indicates that existing **Telemetry Profiles** will be invalidated (`bindingsInvalidated: true`). The modal MUST clearly state in user-friendly language that hardware bindings will need to be reconfigured. (e.g. "Сохранение новых изменений сделает текущие привязки к оборудованию недействительными...")
- **FR-015**: System MUST handle Optimistic Concurrency Control conflicts by informing the user when their save fails due to a version conflict, offering a reload option.
- **FR-016**: System MUST expose native Dashboard entry points from User Hub navigation and Gallery Telemetry Profile cards without a full page reload, preserving the SPA shell during handoff.
- **FR-017**: System MUST integrate the existing Constructor (`/constructor` — Vanilla JS + Konva) into the SPA via a wrapper-component approach (mounting into a DOM ref). Native Dashboard behavior is specified separately in `003-dashboard` and MUST NOT depend on a hosted legacy `/dashboard` wrapper owned by this feature.
- **FR-018**: When edge lifecycle/availability state or a missing saved Telemetry Profile means a consumer flow cannot produce a valid Dashboard context, Gallery and Constructor surfaces MUST show clear guidance instead of silently producing an invalid Dashboard handoff.

### Key Entities *(display-layer definitions)*

- **Session**: Authenticated user identity (id, email, role, subscription tier). Stored client-side after login. Drives route access and UI adaptation.
- **Navigation State**: Current active route and sidebar/menu configuration. Adapts structure based on role.
- **Mnemonic Diagram Card (Мнемосхема)**: Displayable representation of a Mnemonic Diagram — name, thumbnail, ownership info. Carries an expandable Telemetry Profiles section.
- **Admin Diagram Template**: An Admin-owned layout-only diagram retained after assignment. Each assignment creates an independent User-owned copy; later template edits are not synchronized.
- **Telemetry Profile Entry (Профиль телеметрии)**: Display entry within a Mnemonic Diagram Card's profiles section (formerly "binding set") — Monitored Object name, status, actions (Open Dashboard, Edit, Delete). Corresponds to one `DiagramBindings` document on the server.
- **Monitored Object Entry (Объект мониторинга)**: Display entry in equipment lists (conceptually represents the Edge Server) — name, lifecycle state, Online/Offline status, canonical availability last-seen timestamp (`lastSeenAt`), assignee, and lifecycle/availability context (Admin view adds: registered by plus cloud-owned actions `rotate credential`, `block`, `unblock`).
- **User Row**: Admin's view of a user account — email, role, tier, status, available actions (change tier, ban/unban).

---

## 5. Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Role-based routing enforces 100% isolation — Users cannot access any `/admin/*` route under any circumstances.
- **SC-002**: Transitions between any two in-app routes complete in under 1 second without a full browser page reload.
- **SC-003**: The application shell (navigation, available actions) adapts to the user's role immediately upon login — no secondary page load required.
- **SC-004**: Edge Server Online/Offline status updates reflect actual server state within 5 seconds on any page with an equipment list (accounts for heartbeat timeout + WebSocket broadcast + UI update chain).
- **SC-005**: FREE-tier limits are enforced in the UI — users at quota are blocked before any network call is made and receive a clear explanation.
- **SC-006**: User Hub navigation and Gallery Telemetry Profile cards open `/hub/dashboard` inside the SPA without a full browser page reload.
- **SC-007**: Binding set operations (create, switch machine, save, delete) complete in under 2 seconds with visible loading feedback.
- **SC-008**: Once a valid Telemetry Profile exists, Gallery -> Dashboard handoff appends the intended `diagramId` and `edgeId` query params and reaches the native Dashboard route within 1.5 seconds without a full page reload.
- **SC-009**: All specified unit and integration tests (T046–T050) pass successfully (100% pass rate). Tests are co-delivered with their phases:
  - Phase 2 → `useAuthStore` unit (T046)
  - Phase 3 → `ProtectedRoute` integration: role-redirect matrix (T049)
  - Phase 4 → `useDiagramLimits` unit + `GalleryPage` integration/MSW (T048, T050a)
  - Phase 6 → `SaveConflictModal` + `BindingsInvalidatedModal` integration (T050b)
- Phase 7 → `useTelemetryStore` unit + `MyEquipmentPage`/lifecycle-availability integration (T047, T050c)
  - Phase 9 → Final verification: `npm test` successfully executes all test suites (T051)

---

## 6. Assumptions & Constraints

- The Cloud Server backend (`001-cloud-server`) is fully implemented and provides all REST API endpoints and WebSocket connections needed by this SPA.
- The Constructor (visual editor) and Dashboard (live viewer) already exist as standalone Vanilla JS + Konva.js modules. They are embedded via wrapper components — not rewritten in React.
- One `DiagramBindings` document exists per `(diagramId + edgeServerId)` pair. A single diagram can have multiple binding sets (one per machine — enabling the "template diagram" pattern). A single machine can appear in binding sets for multiple diagrams. Both patterns are supported by the backend and must be reflected in the UI.
- Authentication uses JWT tokens issued by the Cloud Server. Token refresh and expiry handling are the SPA's responsibility.
- The SPA is built as a **`/client`** module (React 19.2 + Vite 7.3 + TailwindCSS 4.2 + Zustand 5.0) — a new directory in the monorepo root, separate from `/constructor`; native Dashboard delivery is owned inside `client` by `003-dashboard`.
- The native Dashboard feature is specified separately in `003-dashboard`; this `002-frontend` foundation only owns routing entry points and client consumer handoff into `/hub/dashboard`.
- The `/constructor` module remains a standalone Vanilla JS Visual Editor (Konva canvas). It is embedded into the SPA via `ConstructorWrapper` React component.
- The SPA static bundle is served by Nginx. All `/api/*` and `/socket.io/*` traffic is proxied by Nginx to the Cloud Server on the same VPS.
- Subscription tier changes (FREE → PRO) are performed by Admins only. No self-service billing integration at MVP — the upgrade prompt in the User Profile is informational.
- Admin is a service role: there is no UI to promote a standard User to Admin. Admin accounts are provisioned at the infrastructure level (e.g., via seed scripts).
- All Admins share access to the global Edge Fleet list and the global User Management table. Edge Servers display the Admin who registered them (for audit), but any Admin can assign, rotate credentials, block, or unblock any Edge Server under the active cloud-owned contract.
- Password recovery / email confirmation flows are out of scope for this feature and will be specified separately.
- **Testing**: The `/client` module uses Vitest + React Testing Library. Test files live in `client/tests/unit/` and `client/tests/integration/` — flat structure grouped by domain/feature (not mirroring `src/`). MSW is used for REST mocking; `vi.spyOn` for WebSocket events. E2E tests (Playwright/Cypress) are out of scope for this feature.


