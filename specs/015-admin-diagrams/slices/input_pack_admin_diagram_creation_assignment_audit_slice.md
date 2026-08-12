# Input Pack: Admin Diagram Creation And Assignment Audit Slice

This is a working Input Pack for a later `doc/slices.md` Stage 1 run.
It is not the slice plan and does not perform Stage 1.

## Slice Name

`admin diagram creation and assignment audit`

## Target Plan Path

`specs/015-admin-diagrams/slices/plan_admin_diagram_creation_assignment_audit_slice.md`

## Source Of Truth Docs

- `doc/slices.md`
- `specs/002-frontend/spec.md`
- `specs/002-frontend/tasks.md`
- `specs/001-cloud-server/spec.md`
- `specs/001-cloud-server/data-model.md`
- `specs/001-cloud-server/contracts/openapi.yaml`
- `specs/001-constructor-spa-hosting/spec.md`
- `specs/001-constructor-spa-hosting/data-model.md`
- `specs/001-constructor-spa-hosting/contracts/api.md`
- `specs/001-constructor-spa-hosting/quickstart.md`

No dedicated `doc_cursed` document currently defines Admin diagram creation or
assignment semantics. Stage 1 MUST treat the listed accepted specs and active
code contracts as the current authority, explicitly record any contradictions,
and avoid inventing a new broad diagram-management architecture.

## Nearby Instructions For Stage 1

- `AGENTS.md`
- `client/AGENTS.md`
- `cloud_server/AGENTS.md`
- `constructor/AGENTS.md`
- `constructor/FILE_MAP.md`

There are no known `AGENTS.md` or `FILE_MAP.md` files under `specs/` for this
slice. If they appear later, Stage 1 MUST read them before editing that subtree.

## Similar Completed Slice Plans

- `specs/001-constructor-spa-hosting/plan.md`
- `specs/001-constructor-spa-hosting/tasks.md`
- `specs/002-frontend/plan.md`
- `specs/002-frontend/tasks.md`

There is no completed narrow slice plan for Admin diagram creation and
assignment audit. Stage 1 MUST recover the final behavior from the source specs,
active code, focused tests, and manual browser evidence.

## Must-Read Files For Stage 1

Client Admin surfaces and routing:

- `client/src/app/adminHubRoutes.tsx`
- `client/src/features/admin-hub/pages/OverviewPage.tsx`
- `client/src/features/admin-hub/pages/DiagramGalleryPage.tsx`
- `client/src/features/admin-hub/pages/ReducedConstructorPage.tsx`
- `client/src/features/admin-hub/pages/UserManagementPage.tsx`
- `client/src/shared/api/diagrams.ts`
- `client/src/shared/api/users.ts`
- `client/src/shared/components/SaveAsDialog.tsx`
- `client/src/features/constructor-host/useHostedLayoutSaveFlow.ts`
- `client/src/features/constructor-host/ConstructorHost.tsx`

Client User surfaces needed to prove assignment outcome:

- `client/src/features/user-hub/pages/GalleryPage.tsx`
- `client/src/features/user-hub/components/DiagramCard.tsx`
- `client/src/shared/hooks/useDiagramLimits.ts`

Client tests and fixtures:

- `client/tests/integration/AdminHubPages.test.tsx`
- `client/tests/integration/ReducedConstructorPage.test.tsx`
- `client/tests/integration/HostedConstructorSaveFlow.test.tsx`
- `client/tests/integration/GalleryPage.test.tsx`
- `client/tests/integration/helpers/mockHostedConstructor.ts`
- `client/tests/mocks/handlers.ts`

Cloud diagram, user, and route behavior:

- `cloud_server/src/api/routes.ts`
- `cloud_server/src/api/diagrams.controller.ts`
- `cloud_server/src/services/diagrams.service.ts`
- `cloud_server/src/models/Diagram.ts`
- `cloud_server/src/models/DiagramBindings.ts`
- `cloud_server/src/models/User.ts`
- `cloud_server/src/services/users.service.ts`
- `cloud_server/src/types/index.ts`
- `cloud_server/openapi.yaml`

Cloud tests:

- `cloud_server/tests/integration/diagrams.test.ts`
- `cloud_server/tests/integration/diagrams.assign.test.ts`
- `cloud_server/tests/unit/diagrams.limits.test.ts`
- `cloud_server/tests/integration/admin.users.test.ts`

Constructor runtime files for focused audit only:

- `constructor/public/hosted-entry.js`
- `constructor/public/ui-controller.js`
- `constructor/public/file-manager.js`

Stage 1 MAY inspect adjacent route, API, service, model, test, and hosted-runtime
files discovered from these entry points. Do not read `Note.md` files.

## Goal

Audit the existing Admin diagram lifecycle and complete it into one honest,
fully usable product flow:

1. Admin creates a new empty mnemonic diagram from Admin Hub.
2. Admin opens it in the reduced hosted Constructor.
3. Admin edits, saves, leaves, and reopens the diagram without layout loss.
4. Admin assigns the completed diagram to an eligible USER.
5. The diagram disappears from the Admin-owned gallery and appears in the
   target User's gallery without stale or transferred binding profiles.

The slice MUST verify what already works before changing it. Existing correct
behavior should be preserved and covered rather than rewritten.

## Known Facts

- `POST /api/diagrams` already accepts `{ name, layout }`, authenticates the
  current owner, and permits an empty plain-object layout.
- `client/src/shared/api/diagrams.ts` already exposes `createDiagram`,
  `getDiagrams`, `getDiagramById`, `updateDiagram`, and
  `assignDiagramToUser`.
- User Gallery already has a create-diagram flow, but Admin Diagram Gallery does
  not currently expose a create action.
- Admin Overview currently links to `/admin/diagrams`, but does not provide the
  explicitly specified `Create Diagram` quick action.
- Admin Diagram Gallery currently lists Admin-owned diagrams and supports
  `Edit` and `Assign to User`.
- Admin reduced Constructor already loads an owned diagram, persists layout
  only, supports Save As, handles OCC conflicts, and avoids bindings APIs.
- Client Admin integration coverage currently proves route rendering and a
  mocked assignment slot check, but does not prove the complete
  `create -> edit/save -> assign -> User sees diagram` flow.
- Cloud assignment currently changes `Diagram.ownerId` after verifying that the
  calling Admin owns the diagram.
- The active Cloud assignment service does not visibly validate in the
  assignment method that the target exists, has role `USER`, is active, is not
  deleted or banned, or has remaining FREE diagram capacity.
- Client assignment eligibility is derived from Admin user-list data and may be
  stale; server-side validation must remain authoritative.
- Admin Diagram Gallery currently loads only the first Admin user-list page with
  `limit=100`; Stage 1 must determine whether this silently prevents assignment
  to otherwise eligible users.
- Current Cloud assignment tests assert that existing `DiagramBindings` remain
  stored under the original owner after ownership transfer.
- Product specs state that an Admin-assigned diagram reaches the User with no
  bindings attached. Stage 1 MUST reconcile this contradiction and plan a
  durable outcome without inaccessible orphan binding documents.
- Hosted Constructor specs explicitly leave real visual/manual runtime
  confirmation incomplete.

## Main Boundary

- Client Admin Hub owns creation/assignment UX, loading/error states, route
  navigation, and immediate gallery state updates.
- Client hosted Constructor boundary owns mounting the reduced editor and
  forwarding Admin layout save/Save As intents through existing diagram APIs.
- Cloud owns diagram persistence, ownership checks, target-user validation,
  subscription quota enforcement, and the atomic or failure-safe assignment
  outcome.
- Constructor owns visual authoring behavior only. It must remain behind the
  existing hosted runtime boundary and must not own Cloud CRUD or assignment.
- User Gallery is a consumer surface used to prove the assigned diagram became
  available to its new owner.
- Edge, Dashboard runtime, telemetry, commands, and alarms are not involved.

## Scope

- Audit current Admin diagram creation, reduced editing, save/reopen, gallery,
  and assignment behavior against accepted specs and active contracts.
- Add a clear Admin diagram creation action in Admin Diagram Gallery.
- Add or correct the Admin Overview `Create Diagram` quick action.
- Reuse the existing diagram creation contract with a validated name and empty
  layout rather than introducing a second Admin-only create endpoint.
- Navigate a successfully created Admin diagram directly to
  `/admin/editor/:id`.
- Preserve recoverable loading, validation, cancellation, API error, and
  duplicate-submit behavior for the creation flow.
- Verify reduced Constructor can edit, save, leave, and reopen the newly created
  empty diagram through the real hosted runtime.
- Audit and complete the assignment modal/user-selection flow so an Admin can
  select any eligible target USER without silently relying on stale or truncated
  client-only eligibility data.
- Make Cloud authoritative for assignment target existence, `USER` role,
  active/non-deleted/non-banned account state, FREE-tier capacity, Admin
  ownership, and final ownership transfer.
- Reconcile assignment and `DiagramBindings` behavior so the target User
  receives the assigned diagram with no binding profiles and no inaccessible
  orphan bindings remain.
- Ensure successful assignment removes the diagram from Admin-owned views and
  makes it available through the target User's normal diagram list.
- Align active OpenAPI/spec contracts and focused tests with the final accepted
  assignment behavior when Stage 1 confirms drift.
- Add lean automated proof and a real browser manual smoke for the complete
  Admin workflow.

## Out Of Scope

- Full Constructor rewrite or visual redesign.
- New visual widget types, connection behavior, image tooling, or binding
  authoring features.
- User-side diagram creation redesign beyond regression proof needed by this
  slice.
- Diagram collaboration, shared ownership, multiple owners, permissions lists,
  or reversible assignment.
- Assigning one diagram to multiple users.
- Copying or cloning a diagram to a User while retaining Admin ownership unless
  Stage 1 proves the accepted contract is copy rather than transfer.
- Bulk diagram assignment.
- Assignment history, audit journal, undo, or notifications.
- New subscription tiers, billing, or quota policy changes.
- Broad Admin user-management redesign.
- Dashboard, Dispatch, telemetry, command, alarm, Edge, or hardware changes.
- Broad localization cleanup unrelated to this workflow.

## Key Invariants

- A diagram has exactly one `ownerId`.
- Admin Gallery lists only diagrams owned by the authenticated Admin.
- Admin may assign only a diagram they currently own.
- Assignment is an ownership transfer, not shared access.
- Assignment target MUST exist and MUST be an active `USER`, not an Admin,
  deleted account, or banned account.
- Cloud MUST enforce the target User's current diagram quota at assignment time;
  Client checks are guidance only.
- Concurrent assignments or quota-changing operations MUST NOT bypass ownership
  or quota rules.
- A successful assignment MUST leave the target User with the diagram and no
  inherited Admin binding profiles.
- A failed assignment MUST NOT partially transfer ownership or partially remove
  bindings.
- Creation MUST use the existing `POST /api/diagrams` contract with a non-empty
  trimmed name and plain-object layout.
- A new Admin diagram MAY start with `layout: {}` and MUST open in the reduced
  Constructor.
- Reduced Admin mode MUST not load, expose, create, update, or delete binding
  profiles as part of normal editing.
- Layout save MUST retain existing OCC conflict behavior.
- Client MUST use shared API helpers and protected Admin routes; it must not
  bypass Cloud ownership or RBAC checks.
- Client MUST not directly import Constructor internals.
- Existing User diagram creation, Save As, editing, and quota behavior MUST not
  regress.

## Expected Runtime Path

1. Admin opens `/admin` or `/admin/diagrams`.
2. Admin selects `Create Diagram`.
3. Client requests and validates a diagram name.
4. Client calls `POST /api/diagrams` with the trimmed name and `layout: {}`.
5. Cloud creates an Admin-owned diagram and returns it.
6. Client navigates to `/admin/editor/:id`.
7. Reduced Constructor mounts with the empty layout and no bindings behavior.
8. Admin authors layout content and saves it through the existing OCC-protected
   layout flow.
9. Admin leaves and reopens the diagram; the saved layout is restored.
10. Admin returns to `/admin/diagrams` and opens assignment for the diagram.
11. Client presents eligible User choices and submits `targetUserId`.
12. Cloud revalidates Admin ownership, target User state/role, current quota,
    and assignment cleanup requirements.
13. Cloud completes a failure-safe ownership transfer with no binding profiles
    attached to the target User.
14. Client removes the transferred diagram from the Admin gallery.
15. The target User opens `/hub` and sees the assigned diagram without binding
    profiles.

## Testing Constraints

- Apply Lean Testing Policy from `doc/slices.md`.
- Stage 1 MUST first map existing proof and identify missing coverage before
  adding tests.
- Prefer extending `AdminHubPages.test.tsx`,
  `ReducedConstructorPage.test.tsx`, `diagrams.test.ts`, and
  `diagrams.assign.test.ts` over creating broad new suites.
- Add one focused Client integration proof for successful Admin creation with an
  empty layout and navigation to `/admin/editor/:id`.
- Add one focused Client assignment proof that the successful transfer removes
  the diagram from Admin Gallery and handles server rejection honestly.
- Add one focused Cloud happy-path proof for an eligible target User, including
  the accepted no-bindings result.
- Add at most one critical Cloud negative proof for the main assignment risk:
  stale client eligibility must not bypass current server-side target/quota
  validation.
- Preserve existing ownership/RBAC negative proof without expanding into a broad
  malformed-input matrix.
- Automated tests may mock the hosted Constructor for page orchestration, but
  they do not replace the required real browser/runtime smoke.
- No Edge runtime, hardware, telemetry, command, alarm, or Dashboard setup is
  required.

## Main Proof

The slice is proven when:

- an authenticated Admin can create a named empty diagram from Admin Hub;
- the application opens that new diagram in the reduced hosted Constructor;
- the Admin can add visible content, save, leave, reopen, and recover the same
  saved layout;
- the Admin can assign the owned diagram to an eligible User;
- Cloud rejects an ineligible or quota-full target even when Client state is
  stale;
- successful assignment removes the diagram from Admin Gallery;
- the target User sees the diagram in User Gallery with no inherited binding
  profiles;
- no inaccessible orphan `DiagramBindings` remain after successful assignment;
- existing User diagram and hosted Constructor flows remain operational.

## Manual Browser Smoke Required In The Slice Plan

- Sign in as Admin and verify both Admin Overview and Admin Diagram Gallery
  expose an understandable creation path.
- Create a diagram with a unique name and confirm direct navigation to the
  reduced editor.
- Add representative content in the real hosted Constructor: at minimum one
  image or visual element, one widget, and one editable property.
- Save, leave the editor, reopen the same diagram, and confirm the visible
  layout is restored.
- Confirm reduced mode exposes no machine, catalog, telemetry binding, or
  command binding controls.
- Return to Admin Gallery and confirm the created diagram is present.
- Assign it to an eligible User and confirm it disappears from Admin Gallery.
- Sign in as the target User and confirm the assigned diagram appears with no
  binding profiles.
- Attempt assignment to a quota-full or otherwise ineligible User and confirm
  the server rejects it without transferring ownership or removing the diagram
  from Admin Gallery.
- Repeat open/save/reopen at least once after a hosted runtime remount to catch
  real canvas lifecycle issues not covered by mocked integration tests.

## Cloud, Client, Constructor Boundary Constraints

- Reuse the existing shared diagram CRUD and assignment endpoints unless Stage 1
  proves the active contract cannot satisfy the accepted behavior.
- Cloud route/controller/service layering MUST remain
  `Routes -> Controllers -> Services -> Models`.
- Target eligibility and quota checks MUST be server-authoritative.
- If assignment requires multi-document cleanup, Stage 1 MUST plan an atomic or
  failure-safe strategy appropriate for the active MongoDB deployment model.
- Client may optimistically remove a diagram only after Cloud confirms
  assignment success.
- Constructor MUST remain behind `ConstructorHost`; Client must not import
  Constructor managers directly.
- Constructor changes are allowed only when Stage 1 or real smoke proves an
  actual reduced-mode creation/edit/save defect.
- No module may introduce hardcoded URLs, credentials, or global `window.*`
  application state.

## Open Questions And Required Stage 1 Decisions

- Required decision: should assignment delete all existing binding documents or
  reject assignment when bindings exist? The accepted product outcome is that
  the target User receives no bindings and no inaccessible orphan bindings
  remain.
- Required decision: what failure-safe mechanism should protect ownership
  transfer plus binding cleanup under the active MongoDB deployment model?
- Required audit: does the current target-user list expose accurate
  `diagramCount`, and can Admin select eligible users beyond the first 100
  records?
- Required audit: does Cloud currently enforce target role/account state and
  current target quota during assignment?
- Assumption: Admin accounts are effectively unrestricted by the FREE diagram
  quota unless active auth/session data proves otherwise.
- Assumption: the simplest accepted creation UX reuses an existing shared naming
  dialog or a small Admin-owned equivalent and creates `layout: {}`.
- Assumption: successful Admin creation should navigate directly to the reduced
  editor rather than remain in the gallery.

## Why This Slice Is Separate

This slice is narrower than a general Constructor or Admin Hub redesign. It
audits and completes one business workflow across existing Client, Cloud, and
hosted Constructor boundaries. Keeping it separate prevents the work from
expanding into unrelated authoring features, User Gallery redesign, or broad
diagram collaboration while still requiring an honest end-to-end proof.
