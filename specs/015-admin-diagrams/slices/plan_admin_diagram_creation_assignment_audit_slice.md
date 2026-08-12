# Admin Diagram Creation And Assignment Audit Slice

## Purpose

This slice MUST complete one usable Admin diagram workflow:

1. an Admin creates and edits a layout-only mnemonic diagram template;
2. the Admin assigns the template to an eligible User;
3. Cloud creates an independent User-owned diagram copy;
4. the Admin template remains available for later editing and assignment.

The slice MUST audit and preserve existing correct behavior before changing implementation.

## Source Of Truth

- `doc/Техническое задание.md`
- `specs/002-frontend/spec.md`
- `specs/001-cloud-server/spec.md`
- `specs/001-cloud-server/data-model.md`
- `specs/001-cloud-server/contracts/openapi.yaml`
- `specs/001-constructor-spa-hosting/spec.md`
- `specs/001-constructor-spa-hosting/data-model.md`
- `specs/001-constructor-spa-hosting/contracts/api.md`

Where older specs describe assignment as ownership transfer, this slice MUST replace that behavior with the confirmed template-copy assignment model.

## Scope

- Admin Overview and Admin Diagram Gallery MUST expose a clear diagram creation action.
- Admin diagram creation MUST use the existing diagram creation API with a trimmed non-empty name and `layout: {}`.
- Successful Admin creation MUST navigate directly to `/admin/editor/:id`.
- The reduced hosted Constructor MUST support editing, saving, leaving, and reopening the Admin template without layout loss.
- Reduced Admin mode MUST remain layout-only and MUST NOT load, expose, create, update, or delete binding profiles.
- Admin Diagram Gallery MUST allow the Admin to find and select any eligible User without silently limiting selection to the first 100 users.
- Assignment MUST create an independent User-owned diagram copy from the current persisted Admin template.
- The Admin template MUST remain owned by the Admin and visible in Admin Diagram Gallery after assignment.
- Cloud MUST enforce target eligibility, current quota, duplicate-assignment prevention, and final copy creation.
- Active API contracts and focused tests MUST be aligned with the accepted template-copy behavior.
- The complete workflow MUST receive lean automated proof and real hosted-runtime browser smoke.

## Out Of Scope

- Shared diagram ownership or multiple owners on one diagram record.
- Ownership transfer of the Admin template.
- Removing assigned Users from an Admin template.
- Synchronizing later Admin template changes into existing User copies.
- Updating or replacing an existing User copy from its source template.
- Bulk assignment.
- Assignment history, audit journal, undo, or notifications.
- Admin binding authoring.
- Constructor rewrite, visual redesign, or new visual element types.
- User Gallery redesign beyond regression proof required by this slice.
- New subscription tiers, billing, or quota-policy changes.
- Edge, Dashboard, Dispatch, telemetry, commands, alarms, or hardware changes.

## Assignment Model

- An Admin-owned diagram MUST act as an assignable layout template.
- Assignment MUST create a new diagram record with a new identifier and the target User as `ownerId`.
- The User copy MUST receive the persisted template name and layout.
- The User copy MUST NOT receive any binding profiles.
- The User copy MUST be independent after creation.
- Editing or deleting the User copy MUST NOT modify the Admin template.
- Editing or deleting the Admin template MUST NOT modify an existing User copy.
- Assignment MUST count the new User copy against the target User's current diagram quota.
- Cloud MUST reject assigning the same Admin template to the same User more than once while the existing assigned copy remains.
- A User copy created by assignment MUST store nullable `sourceTemplateId` origin metadata.
- Cloud MUST enforce uniqueness for the pair `(ownerId, sourceTemplateId)` only when `sourceTemplateId` exists.
- Ordinary User creation and Save As copies MUST store no `sourceTemplateId`.
- `sourceTemplateId` MUST be provenance metadata, not a live dependency on the Admin template.
- Deleting the Admin template MUST NOT delete or invalidate existing User copies.

## Execution Flow

1. Admin opens Admin Overview or Admin Diagram Gallery.
2. Admin selects `Create Diagram`.
3. Client collects and validates a diagram name.
4. Client calls the existing create-diagram endpoint with the trimmed name and `layout: {}`.
5. Cloud creates an Admin-owned template without applying a regular USER FREE-tier quota to the Admin.
6. Client navigates to `/admin/editor/:id`.
7. Reduced Constructor mounts with the empty layout and no bindings behavior.
8. Admin edits and saves the layout through the existing OCC-protected save flow.
9. Admin leaves and reopens the template; the saved layout is restored.
10. Admin opens assignment and finds an eligible target User.
11. Client submits the target User and template identifiers.
12. Cloud revalidates Admin ownership, target role and account state, current quota, and duplicate assignment state.
13. Cloud creates one independent User-owned diagram copy from the latest persisted template layout.
14. Admin Diagram Gallery keeps the source template visible.
15. Target User opens User Gallery and sees the independent copy without binding profiles.

## Responsibility Boundaries

### Client Admin Hub

- MUST own creation and assignment UX, validation, loading, cancellation, and error presentation.
- MUST use shared diagram and user API helpers.
- MUST keep the Admin template visible after successful assignment.
- MUST treat displayed User eligibility as guidance only.
- MUST present server rejection without claiming assignment succeeded.
- MUST support finding eligible Users beyond the first user-list page.

### Client Hosted Constructor Boundary

- MUST mount Constructor through the existing `ConstructorHost` boundary.
- MUST forward layout save and Save As intents through existing diagram APIs.
- MUST preserve OCC conflict behavior and route-exit protection.
- MUST NOT import Constructor internals into Client.

### Cloud

- MUST remain authoritative for assignment eligibility and quota checks.
- MUST preserve `Routes -> Controllers -> Services -> Models` layering.
- MUST distinguish Admin template creation from quota-limited USER diagram creation.
- MUST create the User copy without modifying the Admin template.
- MUST prevent duplicate and concurrent duplicate assignment.
- MUST enforce User diagram quota atomically across ordinary creation, Save As, and Admin-template assignment.
- MUST reject failed assignment before creating a partial User copy.

### Constructor

- MUST own visual authoring behavior only.
- MUST remain behind the hosted runtime boundary.
- MUST keep reduced mode free of binding controls and binding persistence effects.
- MAY change only when focused audit or real browser smoke proves a reduced-mode defect.

### User Gallery

- MUST consume the new User-owned copy through the normal owned-diagram list.
- MUST show no inherited binding profiles for a newly assigned copy.
- MUST allow later User editing and binding creation without affecting the Admin template.

## Assumptions

- Admin diagram records are templates by role and workflow; this slice does not introduce a separate broad template-management subsystem.
- Existing `POST /api/diagrams` remains the creation endpoint for Admin templates and User diagrams.
- The assignment endpoint MAY retain its current route if its contract is updated to mean copy creation instead of ownership transfer.
- The assignment response SHOULD return the created User-owned copy.
- Deleting a User copy MAY allow a later reassignment of the same Admin template to that User.
- Admin accounts are not subject to the regular USER FREE diagram quota.
- Existing Admin templates cannot normally have bindings because reduced Admin mode cannot access binding APIs.
- Client-side User eligibility and slot information may be stale; Cloud remains authoritative.
- Assignment copies only the latest persisted Admin template state; unsaved Constructor state is not assigned.
- The Admin user-list does not need to expose authoritative `diagramCount`; assignment-time Cloud validation remains the quota authority.

## Constraints

- The project is under strict MVP time constraints.
- Changes MUST remain narrowly scoped to the Admin creation and template-assignment workflow.
- Existing correct creation, hosted-editor, gallery, and assignment behavior SHOULD be preserved rather than rewritten.
- A diagram record MUST have exactly one `ownerId`.
- Shared ownership MUST NOT be introduced.
- Client MUST NOT directly import Constructor internals.
- No module MAY introduce hardcoded URLs, credentials, secrets, or global `window.*` application state.
- User quota enforcement MUST use an atomic mechanism that prevents concurrent ordinary creation, Save As, and assignment from exceeding the FREE limit.
- A non-atomic `countDocuments -> create` sequence MUST NOT be treated as sufficient quota enforcement.
- Active OpenAPI and accepted specs MUST be updated where they still describe ownership transfer.
- Lean Testing Policy MUST apply: automated proof MUST cover the main happy path and at most one critical negative scenario for the main assignment risk.
- Lean Testing MUST NOT make implementation tasks vague or remove the main proof path.
- Complex UI, concurrency, and hosted-canvas edge checks SHOULD be covered by focused manual browser smoke rather than broad validation matrices.

## Invariants

- An Admin template has exactly one Admin owner.
- A User copy has exactly one User owner.
- Assignment creates a copy and MUST NOT change the Admin template owner.
- Admin may assign only a template they currently own.
- Assignment target MUST exist and MUST be an active `USER`, not an Admin, deleted account, or banned account.
- Cloud MUST enforce the target User's current diagram quota at assignment time.
- Client eligibility checks MUST NOT bypass Cloud validation.
- Concurrent requests MUST NOT create duplicate copies for the same Admin template and target User.
- Concurrent User creation, Save As, and assignment requests MUST NOT exceed the target User's diagram quota.
- A successful assignment MUST create exactly one User-owned copy with no binding profiles.
- A failed assignment MUST NOT create a partial copy or modify the Admin template.
- A User copy created by assignment MUST retain `sourceTemplateId`; ordinary User-created and Save As diagrams MUST NOT inherit assignment provenance.
- Existing User copies MUST remain usable if the source Admin template is later changed or deleted.
- Admin creation MUST use a non-empty trimmed name and a plain-object layout.
- A new Admin template MAY start with `layout: {}` and MUST open in reduced Constructor.
- Reduced Admin mode MUST NOT participate in binding persistence.
- Layout save MUST retain existing OCC conflict behavior.
- Existing User diagram creation, Save As, editing, binding, and quota behavior MUST not regress.

## Acceptance Checks

- An authenticated Admin can start diagram creation from both Admin Overview and Admin Diagram Gallery.
- Empty, whitespace-only, cancelled, failed, and duplicate-submit creation attempts produce honest recoverable outcomes.
- Successful creation persists a named Admin-owned template with `layout: {}` and opens `/admin/editor/:id`.
- Admin can add representative visible content, save, leave, reopen, and recover the same layout through the real hosted Constructor.
- Reduced mode exposes no machine, catalog, telemetry binding, or command binding controls.
- Admin can find and select an eligible User beyond the first 100 user records.
- Successful assignment creates an independent User-owned copy and leaves the Admin template visible and editable.
- The target User sees the assigned copy in User Gallery with no binding profiles.
- Editing the User copy does not change the Admin template.
- Assignment copies the latest persisted Admin template layout and does not copy unsaved editor state.
- Deleting the Admin template does not delete or invalidate previously assigned User copies.
- Cloud rejects an Admin, deleted User, banned User, missing User, quota-full User, or duplicate target assignment without creating a copy.
- Concurrent duplicate assignment creates at most one User copy.
- Concurrent ordinary creation, Save As, and assignment do not exceed a FREE User's diagram quota.
- User Save As creates an independent diagram without `sourceTemplateId`.
- Existing User diagram creation, Save As, editing, binding, and quota flows remain operational.

## Proof Strategy

Automated proof MUST stay focused:

- Client integration proof SHOULD cover successful Admin creation with `layout: {}` and navigation to `/admin/editor/:id`.
- Client integration proof SHOULD cover successful assignment while retaining the Admin template and handling server rejection honestly.
- Cloud integration proof SHOULD cover successful template-copy assignment, target ownership, preserved Admin template, and absence of bindings.
- Cloud MUST include at most one focused critical negative proof that concurrent or stale Client requests cannot bypass current target quota or duplicate-assignment validation.
- Existing ownership, RBAC, hosted save, and User Gallery tests SHOULD be extended only where needed for regression proof.

Manual browser smoke MUST verify:

- creation paths from Admin Overview and Admin Diagram Gallery;
- direct navigation to the reduced editor;
- real hosted Constructor creation, save, leave, remount, reopen, and visible layout restoration;
- absence of binding controls in reduced mode;
- assignment to an eligible User while the Admin template remains visible;
- appearance of an independent binding-free copy in User Gallery;
- independence between subsequent User-copy edits and the Admin template;
- honest rejection for a quota-full or duplicate assignment.

## Review Trigger

Review this plan when:

- assignment semantics change from independent copy creation;
- shared ownership is proposed;
- User-copy synchronization with Admin templates is proposed;
- diagram quota policy changes;
- reduced Admin mode gains binding capabilities;
- the Cloud diagram or binding storage contract changes.

## Detailed Task Plan

**Task format**: `- [ ] T001 [P?] [US?] Description with file path`

**User stories**:

- **US1 (P1)**: Admin creates a named empty diagram template and opens it in reduced Constructor.
- **US2 (P1)**: Admin edits, saves, leaves, and reopens the template without layout loss or bindings behavior.
- **US3 (P1)**: Admin assigns the template as an independent User-owned copy while retaining the Admin template.

### Phase 1: Foundational Cloud Integrity

**Purpose**: Establish the storage and quota invariants required by all stories before changing assignment behavior.

- [X] T001 Define nullable `sourceTemplateId` and internal nullable `quotaSlot` fields plus named partial unique indexes `uniq_diagram_owner_source_template` for `(ownerId, sourceTemplateId)` and `uniq_diagram_owner_quota_slot` for `(ownerId, quotaSlot)` in `cloud_server/src/models/Diagram.ts`
- [X] T002 Implement a single-document atomic FREE-slot allocator that creates USER diagrams by trying quota slots `1..3`, blocks creation while total owned-diagram count is already at or above the FREE limit including quota-excess diagrams, maps named-index conflicts to stable duplicate or quota errors, and leaves PRO/Admin diagrams without `quotaSlot` in `cloud_server/src/services/diagram-quota.service.ts`
- [X] T003 Add focused quota and provenance proof for concurrent FREE slot exhaustion, quota-excess blocking after downgrade or deletion, ordinary Save As without provenance, and named partial unique assignment provenance in `cloud_server/tests/unit/diagrams.limits.test.ts` and `cloud_server/tests/integration/diagrams.assign.test.ts`
- [X] T004 Integrate persisted-role and persisted-tier lookup, atomic USER quota allocation, and slot release through ordinary create, Save As, and hard delete paths in `cloud_server/src/services/diagrams.service.ts`, `cloud_server/src/api/diagrams.controller.ts`, and `cloud_server/src/models/User.ts`
- [X] T005 Implement quota-slot reconciliation for existing diagrams and PRO-to-FREE tier changes by clearing stale slots, assigning slots to the three newest editable diagrams, leaving excess diagrams without slots, and preventing new creation until total usage drops below the FREE limit in `cloud_server/src/services/diagram-quota.service.ts`, `cloud_server/src/services/users.service.ts`, and `cloud_server/src/scripts/migrate-diagram-quota-slots.ts`
- [X] T006 Add the explicit quota-slot migration command and document its required pre-deployment execution in `cloud_server/package.json` and `specs/001-cloud-server/quickstart.md`

**Checkpoint**: USER creation, Save As, assignment preparation, deletion, and tier changes share one atomic quota-slot contract without requiring MongoDB transactions.

### Phase 2: User Story 1 - Admin Creates A Template

**Goal**: Admin creates a named empty template from either Admin entry point and opens it directly in reduced Constructor.

**Independent test**: From Admin Overview and Admin Diagram Gallery, create a template, verify `POST /api/diagrams` receives a trimmed name with `layout: {}`, and verify navigation reaches `/admin/editor/:id`.

- [X] T007 [P] [US1] Add focused Client integration proof for successful empty-layout Admin creation with editor navigation and one honest create-API failure in `client/tests/integration/AdminHubPages.test.tsx`
- [X] T008 [P] [US1] Add focused Cloud proof that authenticated Admin creation bypasses regular USER FREE quota while preserving name and plain-object layout validation in `cloud_server/tests/integration/diagrams.test.ts` and `cloud_server/tests/unit/diagrams.limits.test.ts`
- [X] T009 [US1] Implement shared Admin template-creation state and API orchestration using `createDiagram({ name, layout: {} })` and `/admin/editor/:id` navigation in `client/src/features/admin-hub/useAdminDiagramCreation.ts`
- [X] T010 [US1] Reuse `SaveAsDialog` with Admin creation labels and wire the creation action into Admin Diagram Gallery without duplicating dialog logic in `client/src/features/admin-hub/pages/DiagramGalleryPage.tsx` and `client/src/shared/components/SaveAsDialog.tsx`
- [X] T011 [US1] Replace the generic Admin Overview gallery shortcut with an explicit `Create Diagram` quick action using the shared creation flow in `client/src/features/admin-hub/pages/OverviewPage.tsx`

**Checkpoint**: US1 is independently usable and does not depend on assignment implementation.

### Phase 3: User Story 2 - Admin Saves And Reopens The Template

**Goal**: The newly created empty template round-trips through the existing reduced hosted Constructor without layout loss or bindings behavior.

**Independent test**: Open the created template, load an empty layout, save a representative layout, leave, reopen, and confirm the saved layout is restored while no bindings APIs are called.

- [X] T012 [P] [US2] Extend reduced-mode integration proof only for the new empty-template save/reopen path and absence of bindings API calls in `client/tests/integration/ReducedConstructorPage.test.tsx`
- [X] T013 [US2] Audit the reduced save/reopen orchestration against the new-template path and correct only proven defects in `client/src/features/admin-hub/pages/ReducedConstructorPage.tsx`, `client/src/features/constructor-host/useHostedLayoutSaveFlow.ts`, and `client/src/features/constructor-host/ConstructorHost.tsx`

**Checkpoint**: US2 proves the existing hosted boundary works for a newly created Admin template; Constructor source remains unchanged unless a real defect is proven.

### Phase 4: User Story 3 - Admin Assigns An Independent User Copy

**Goal**: Assignment creates one independent User-owned copy from the latest persisted Admin template while the Admin template remains owned and visible.

**Independent test**: Assign an Admin template to an eligible User, verify a new User-owned diagram with `sourceTemplateId` and no bindings exists, verify the Admin template remains unchanged, and verify a stale or concurrent request cannot bypass quota or duplicate prevention.

- [X] T014 [P] [US3] Replace ownership-transfer assertions with template-copy happy-path proof covering new identifier, target ownership, copied persisted layout, `sourceTemplateId`, preserved Admin template, no bindings, and copy survival after template deletion in `cloud_server/tests/integration/diagrams.assign.test.ts`
- [X] T015 [P] [US3] Add one critical Cloud negative proof covering concurrent duplicate assignment and stale quota eligibility without expanding into a broad invalid-input matrix in `cloud_server/tests/integration/diagrams.assign.test.ts`
- [X] T016 [US3] Implement authoritative assignment target validation for existing active non-deleted non-banned `USER`, persisted tier, Admin template ownership, and duplicate provenance in `cloud_server/src/services/diagrams.service.ts` and `cloud_server/src/models/User.ts`
- [X] T017 [US3] Replace ownership mutation with atomic quota-aware User-copy creation from the latest persisted template name/layout and map `uniq_diagram_owner_source_template` and `uniq_diagram_owner_quota_slot` conflicts to distinct stable API errors in `cloud_server/src/services/diagrams.service.ts`
- [X] T018 [US3] Update assignment controller response and error handling to return the created User copy without modifying the Admin template in `cloud_server/src/api/diagrams.controller.ts` and `cloud_server/src/api/routes.ts`
- [X] T019 [US3] Extend Admin user-list filtering with `role=USER` and `activeOnly=true` before pagination so assignment search pages contain only eligible account-state candidates in `cloud_server/src/api/admin.controller.ts` and `cloud_server/src/services/users.service.ts`
- [X] T020 [P] [US3] Add paginated and filtered Admin user-list response typing, assignment-copy response typing, and nullable `sourceTemplateId` diagram typing while preserving existing callers in `client/src/shared/api/users.ts` and `client/src/shared/api/diagrams.ts`
- [X] T021 [P] [US3] Add focused Client assignment proof for filtered server-side search beyond the first 100 users, retained Admin template after success, and one honest server rejection in `client/tests/integration/AdminHubPages.test.tsx`
- [X] T022 [US3] Replace the first-page-only assignment selector with filtered server-backed search and pagination, remove client-authoritative slot blocking, and retain the Admin template after successful assignment in `client/src/features/admin-hub/pages/DiagramGalleryPage.tsx`
- [X] T023 [P] [US3] Align MSW assignment and paginated filtered-user fixtures with independent-copy semantics in `client/tests/mocks/handlers.ts`
- [X] T024 [P] [US3] Extend User Gallery regression proof so an assigned copy appears through normal owned-diagram loading with no binding profiles and remains independent from its source template in `client/tests/integration/GalleryPage.test.tsx`

**Checkpoint**: US3 is independently proven across Client, Cloud, and User Gallery without shared ownership or binding transfer.

### Phase 5: Contract And Documentation Alignment

**Purpose**: Remove active ownership-transfer drift after runtime behavior is implemented and proven.

- [X] T025 [P] Replace ownership-transfer language with independent template-copy assignment semantics, `sourceTemplateId`, quota-slot behavior, and stable assignment outcomes in `cloud_server/openapi.yaml` and `specs/001-cloud-server/contracts/openapi.yaml`
- [X] T026 [P] Align accepted Cloud diagram requirements and data model with Admin templates, independent User copies, provenance, and atomic FREE quota slots in `specs/001-cloud-server/spec.md` and `specs/001-cloud-server/data-model.md`
- [X] T027 [P] Align Admin Gallery assignment behavior and remove ownership-transfer wording in `specs/002-frontend/spec.md` and `specs/002-frontend/tasks.md`
- [X] T028 [P] Align the hosted Constructor documentation only where it describes Admin template creation or assigned-copy behavior, without changing reduced-mode boundaries, in `specs/001-constructor-spa-hosting/spec.md`, `specs/001-constructor-spa-hosting/data-model.md`, and `specs/001-constructor-spa-hosting/contracts/api.md`
- [X] T029 Lint the active OpenAPI contract with `cmd /c npx @redocly/cli lint openapi.yaml` from `cloud_server/`

### Phase 6: Runtime Smoke And Final Proof

**Purpose**: Prove the complete workflow against the real hosted runtime and run the narrow automated regression set.

- [X] T030 Run focused Cloud tests for creation, quota, assignment, and Admin users with `cmd /c npm run test -- tests/integration/diagrams.test.ts tests/integration/diagrams.assign.test.ts tests/unit/diagrams.limits.test.ts tests/integration/admin.users.test.ts` from `cloud_server/`
- [X] T031 Run focused Client tests for Admin workflow, reduced Constructor, hosted layout save, and User Gallery with `cmd /c npm run test -- tests/integration/AdminHubPages.test.tsx tests/integration/ReducedConstructorPage.test.tsx tests/integration/HostedConstructorSaveFlow.test.tsx tests/integration/GalleryPage.test.tsx` from `client/`
- [X] T032 Run Cloud typecheck with `cmd /c npm run typecheck` from `cloud_server/`
- [X] T033 Run Client production build, including TypeScript checks and hosted asset output, with `cmd /c npm run build` from `client/`
- [X] T034 Run hosted runtime smoke with `cmd /c npm run smoke:hosted` from `client/`
- [ ] T035 Execute and record the real browser workflow for Admin create, representative visual edit, save, leave, remount, reopen, reduced-mode no-bindings, eligible assignment, retained Admin template, independent User copy, and quota-full or duplicate rejection in `specs/015-admin-diagrams/slices/smoke_admin_diagram_creation_assignment_audit_slice.md`
- [ ] T036 Perform Technical Lead Review of implemented scope, module boundaries, contract alignment, quota and duplicate races, stale-state handling, and proof completeness; record findings and required fixes in `specs/015-admin-diagrams/slices/plan_admin_diagram_creation_assignment_audit_slice.md`

## Dependencies

- Phase 1 blocks US1 and US3 because Admin quota bypass and User quota allocation share the diagram creation service.
- US1 and US2 may proceed after Phase 1; US2 depends on US1 only for the complete new-template workflow.
- US3 depends on Phase 1 but does not require Constructor changes.
- Contract alignment depends on the accepted runtime behavior from US1-US3.
- Runtime smoke and final proof depend on all implementation and contract tasks.

### User Story Completion Order

```text
Phase 1 -> US1 -> US2
Phase 1 -> US3
US1 + US2 + US3 -> Contract Alignment -> Runtime Smoke -> Technical Lead Review
```

## Parallel Opportunities

- T007 and T008 can run in parallel after Phase 1.
- T014 and T015 can be prepared together before T016-T018.
- T020, T021, T023, and T024 can run in parallel after T019 fixes the filtered user-list contract and the assignment response contract is agreed.
- T025-T028 can run in parallel after runtime behavior stabilizes.
- T030-T034 can run in parallel when implementation is complete.

## Implementation Strategy

### MVP First

1. Complete atomic quota and provenance foundation.
2. Deliver US1 Admin template creation.
3. Prove US2 save/reopen through the existing reduced hosted boundary.
4. Deliver US3 independent-copy assignment.
5. Align contracts and execute focused proof.

### Main Proof

The slice is complete only when an Admin creates and saves a reusable template, assigns it as one independent quota-counted User copy, retains the source template, and Cloud prevents duplicate or quota-bypassing assignment.

### Manual And Runtime Smoke

- Automated hosted mocks MUST NOT count as proof of real canvas lifecycle behavior.
- Real browser smoke MUST include at least one image or visual element, one widget, one editable property, and one remount cycle.
- Constructor source changes MUST NOT be counted as required work unless smoke or focused tests prove a reduced-mode defect.

## Technical Lead Review

The final review MUST check:

- no ownership-transfer behavior remains active;
- no shared ownership or User-specific bindings are added to Admin templates;
- `sourceTemplateId` is provenance only;
- quota slots cannot be bypassed by concurrent create, Save As, or assignment;
- duplicate assignment cannot create two User copies;
- deleting a template does not cascade to assigned copies;
- Client does not treat stale eligibility as authoritative;
- acceptance checks and focused proof cover the real workflow.

### Technical Lead Review Record - 2026-06-12

**Status**: BLOCKED

The production, contract, and automated-proof review found no remaining active ownership-transfer path or live template-copy coupling:

- `DiagramsService.assignDiagram` reads the persisted Admin-owned template and creates a new target-owned diagram through the shared quota allocator without mutating the template.
- `sourceTemplateId` is used only for provenance and duplicate prevention. No production read path loads, synchronizes, deletes, or invalidates a User copy through its source template.
- Hard deletion is owner-scoped and cascades only that diagram's bindings. Existing assigned copies are not selected or deleted.
- Client assignment uses filtered server-backed candidate search and does not treat displayed eligibility or quota as authoritative.
- Active Cloud OpenAPI and accepted specs describe independent binding-free copy creation and retained Admin templates.

The review found and fixed two incomplete Cloud integrity paths:

1. Quota mutation locks were not released after most protected-operation or reconciliation failures. `runWithOwnerQuotaMutation`, tier updates, and migration-wide reconciliation now release mutation flags through guaranteed cleanup paths, preventing permanent create, Save As, or assignment lockout.
2. Ban and self-delete eligibility changes were outside the diagram-create mutation barrier. They now share the barrier with create, Save As, assignment, delete reconciliation, and tier changes, so eligibility changes cannot commit through a stale concurrent assignment/create window.

Focused proof after the fixes:

- `cmd /c npm run test -- tests/integration/diagrams.test.ts tests/integration/diagrams.assign.test.ts tests/unit/diagrams.limits.test.ts tests/integration/admin.users.test.ts` from `cloud_server/`: PASS, 52 tests.
- `cmd /c npm run test -- tests/integration/users.softdelete.test.ts` from `cloud_server/`: PASS, 4 tests.
- `cmd /c npm run typecheck` from `cloud_server/`: PASS.
- `cmd /c npm run test -- tests/integration/AdminHubPages.test.tsx tests/integration/ReducedConstructorPage.test.tsx tests/integration/HostedConstructorSaveFlow.test.tsx tests/integration/GalleryPage.test.tsx` from `client/`: PASS, 21 tests.
- `cmd /c npm run build` from `client/`: PASS.
- `cmd /c npm run smoke:hosted` from `client/`: PASS, but this automated hosted smoke is not a substitute for T035 real browser evidence.
- `cmd /c npx @redocly/cli lint openapi.yaml` from `cloud_server/`: the contract validated successfully, then the Windows process exited with a libuv assertion. A PowerShell retry was blocked by the local script execution policy.

Blocking proof gap:

- T035 remains open and `specs/015-admin-diagrams/slices/smoke_admin_diagram_creation_assignment_audit_slice.md` does not exist.
- Without the recorded real browser workflow, the review cannot verify that production behavior, contracts, automated proof, and browser smoke agree on independent-copy assignment semantics.
- T036 MUST remain open until T035 records Admin create, real hosted visual edit/save/remount/reopen, reduced-mode no-bindings, retained-template assignment, independent User copy, and honest duplicate or quota-full rejection. After that evidence exists, rerun this review and close T036 only if it agrees with the reviewed production paths.

## Review Trigger

Re-run task-plan review before implementation if:

- the atomic quota mechanism changes from diagram-owned quota slots;
- MongoDB transaction support becomes a required assumption;
- assignment changes from independent copy creation;
- template synchronization, unassignment, or shared ownership enters scope;
- reduced Admin mode gains binding capabilities.
