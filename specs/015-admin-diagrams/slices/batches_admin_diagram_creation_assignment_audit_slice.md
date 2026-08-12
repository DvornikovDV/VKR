# Implementation Batches: Admin Diagram Creation And Assignment Audit

## Batch Order

Execute batches in order. A later batch MAY start only when its required earlier production contract is stable.

### Batch 1: Atomic Quota And Provenance Foundation

```text
Execute `.agent\workflows\07b-speckit.implement.experimental.md` for the task batch in Scope.

Scope:
- TASK_IDS: T001, T002, T003
- TASKS_FILE: specs/015-admin-diagrams/slices/plan_admin_diagram_creation_assignment_audit_slice.md

Batch-specific constraints:
- `sourceTemplateId` MUST remain provenance only; it MUST NOT create shared ownership or a live template dependency.
- FREE quota and duplicate assignment conflicts MUST be distinguishable through the named partial unique indexes.

Main proof:
- Concurrent FREE diagram creation cannot claim more than quota slots `1..3`, and repeated `(ownerId, sourceTemplateId)` creation produces a stable duplicate-assignment outcome.

Do not count this as success:
- A helper-level quota check that still uses `countDocuments -> create` without database-enforced uniqueness.
```

### Batch 2: Quota Lifecycle And Migration

```text
Execute `.agent\workflows\07b-speckit.implement.experimental.md` for the task batch in Scope.

Scope:
- TASK_IDS: T004, T005, T006
- TASKS_FILE: specs/015-admin-diagrams/slices/plan_admin_diagram_creation_assignment_audit_slice.md

Batch-specific constraints:
- Ordinary create, Save As, assignment preparation, delete, migration, and PRO-to-FREE downgrade MUST use one quota-slot contract.
- Quota-excess diagrams MUST continue blocking new FREE creation until total usage drops below the limit.

Main proof:
- Persisted role/tier and reconciled quota slots govern the real diagram create/delete and tier-change service paths.

Do not count this as success:
- Assigning slots to three diagrams while allowing a newly freed slot to bypass remaining quota-excess diagrams.
```

### Batch 3: Admin Create Cloud Proof

```text
Execute `.agent\workflows\07a-speckit.implement.quickcheck.md` for the task batch in Scope.

Scope:
- TASK_IDS: T008
- TASKS_FILE: specs/015-admin-diagrams/slices/plan_admin_diagram_creation_assignment_audit_slice.md

Batch-specific constraints:
- Admin template creation MUST reuse `POST /api/diagrams` and MUST bypass only the regular USER FREE quota.
- Existing name and plain-object layout validation MUST remain active.

Main proof:
- An authenticated Admin can create an empty template through the real diagram API while USER quota behavior remains unchanged.

Do not count this as success:
- A test-only Admin bypass that is not connected to the production create service.
```

### Batch 4: Admin Create Client Flow

```text
Execute `.agent\workflows\07a-speckit.implement.quickcheck.md` for the task batch in Scope.

Scope:
- TASK_IDS: T007, T009, T010, T011
- TASKS_FILE: specs/015-admin-diagrams/slices/plan_admin_diagram_creation_assignment_audit_slice.md

Batch-specific constraints:
- Admin Overview and Diagram Gallery MUST share one creation orchestration path.
- Successful creation MUST send a trimmed name with `layout: {}` and navigate directly to `/admin/editor/:id`.

Main proof:
- The production Admin entry points create an empty template and reach the reduced editor; one create-API failure remains recoverable.

Do not count this as success:
- A new button that only navigates to the gallery or duplicates separate creation logic on each page.
```

### Batch 5: Reduced Template Save And Reopen

```text
Execute `.agent\workflows\07a-speckit.implement.quickcheck.md` for the task batch in Scope.

Scope:
- TASK_IDS: T012, T013
- TASKS_FILE: specs/015-admin-diagrams/slices/plan_admin_diagram_creation_assignment_audit_slice.md

Batch-specific constraints:
- Reduced mode MUST persist layout only and MUST NOT call bindings APIs.
- Existing OCC conflict and hosted-runtime boundaries MUST remain intact.

Main proof:
- A newly created empty Admin template can save a representative layout and restore it after reopen through the reduced hosted page path.

Do not count this as success:
- Payload-helper round-trip proof without the reduced page orchestration or hidden bindings calls.
```

### Batch 6: Cloud Independent-Copy Assignment

```text
Execute `.agent\workflows\07b-speckit.implement.experimental.md` for the task batch in Scope.

Scope:
- TASK_IDS: T014, T015, T016, T017, T018
- TASKS_FILE: specs/015-admin-diagrams/slices/plan_admin_diagram_creation_assignment_audit_slice.md

Batch-specific constraints:
- Assignment MUST create a new User-owned copy from the latest persisted Admin template and MUST NOT mutate or delete the source template.
- Cloud MUST validate current target account state, persisted tier, quota, ownership, and duplicate provenance.

Main proof:
- The real assignment endpoint creates exactly one independent copy with `sourceTemplateId` and no bindings while concurrent duplicate or stale-quota requests fail safely.

Do not count this as success:
- Preserving the old ownership-transfer implementation, cloning bindings, or validating eligibility only from Client-provided state.
```

### Batch 7: Assignment Candidate Contract

```text
Execute `.agent\workflows\07a-speckit.implement.quickcheck.md` for the task batch in Scope.

Scope:
- TASK_IDS: T019, T020
- TASKS_FILE: specs/015-admin-diagrams/slices/plan_admin_diagram_creation_assignment_audit_slice.md

Batch-specific constraints:
- `role=USER` and `activeOnly=true` filtering MUST happen before pagination.
- Client typing MUST preserve existing Admin user-list callers while exposing paginated results and assignment-copy provenance.

Main proof:
- The real Admin users endpoint returns paginated active USER candidates, and shared Client API helpers consume that response contract.

Do not count this as success:
- Client-side filtering of mixed paginated results or fixture-only pagination typing.
```

### Batch 8: Admin Assignment Client Flow

```text
Execute `.agent\workflows\07a-speckit.implement.quickcheck.md` for the task batch in Scope.

Scope:
- TASK_IDS: T021, T022, T023
- TASKS_FILE: specs/015-admin-diagrams/slices/plan_admin_diagram_creation_assignment_audit_slice.md

Batch-specific constraints:
- Assignment search MUST use the filtered server-backed candidate contract and MUST reach Users beyond the first 100 records.
- Client MUST retain the Admin template after success and MUST treat Cloud as quota authority.

Main proof:
- Admin Diagram Gallery searches and assigns through production API helpers, keeps the source card visible, and presents one server rejection honestly.

Do not count this as success:
- Loading only page 1, removing the Admin template after success, or blocking assignment from stale client-only slot calculations.
```

### Batch 9: User Gallery Copy Regression

```text
Execute `.agent\workflows\07a-speckit.implement.quickcheck.md` for the task batch in Scope.

Scope:
- TASK_IDS: T024
- TASKS_FILE: specs/015-admin-diagrams/slices/plan_admin_diagram_creation_assignment_audit_slice.md

Batch-specific constraints:
- The assigned diagram MUST appear through normal owned-diagram loading with no inherited binding profiles.
- User-copy behavior MUST remain independent from the Admin template.

Main proof:
- User Gallery consumes the assigned copy through its existing production loading path and renders zero telemetry profiles.

Do not count this as success:
- Rendering a fixture-only card that bypasses owned-diagram and binding API loading.
```

### Batch 10: Contract And Accepted-Spec Alignment

```text
Execute `.agent\workflows\07a-speckit.implement.quickcheck.md` for the task batch in Scope.

Scope:
- TASK_IDS: T025, T026, T027, T028, T029
- TASKS_FILE: specs/015-admin-diagrams/slices/plan_admin_diagram_creation_assignment_audit_slice.md

Batch-specific constraints:
- Active contracts MUST describe independent-copy assignment, named quota/provenance behavior, and retained Admin templates.
- Hosted Constructor documentation MUST preserve reduced-mode boundaries and MUST NOT imply template synchronization.

Main proof:
- Active OpenAPI lint passes and accepted specs no longer describe ownership transfer.

Do not count this as success:
- Updating only the slice plan while active OpenAPI or accepted feature specs retain transfer semantics.
```

### Batch 11: Automated Regression Verification

```text
Execute `.agent\workflows\07a-speckit.implement.quickcheck.md` for the task batch in Scope.

Scope:
- TASK_IDS: T030, T031, T032, T033, T034
- TASKS_FILE: specs/015-admin-diagrams/slices/plan_admin_diagram_creation_assignment_audit_slice.md

Batch-specific constraints:
- Run the exact focused Cloud, Client, typecheck, build, and hosted-runtime commands from the task plan.
- Existing failures MUST be reported distinctly from slice regressions.

Main proof:
- Focused behavioral suites, Cloud typecheck, Client production build, and hosted runtime smoke complete successfully.

Do not count this as success:
- Passing only mocked Client tests while Cloud concurrency proof, production build, or hosted runtime smoke remains unverified.
```

### Batch 12: Real Browser Workflow Smoke

```text
Execute `.agent\workflows\07a-speckit.implement.quickcheck.md` for the task batch in Scope.

Scope:
- TASK_IDS: T035
- TASKS_FILE: specs/015-admin-diagrams/slices/plan_admin_diagram_creation_assignment_audit_slice.md

Batch-specific constraints:
- Use the real hosted Constructor runtime and record observable outcomes in the smoke file.
- The workflow MUST include a remount, retained Admin template, independent User copy, no reduced-mode bindings controls, and one rejected assignment.

Main proof:
- The complete Admin create -> edit/save/reopen -> assign -> User sees copy workflow succeeds in a real browser session.

Do not count this as success:
- Automated mocks, API-only calls, or payload inspection without real canvas interaction and cross-role gallery confirmation.
```

### Batch 13: Final Technical Lead Review

```text
Execute `.agent\workflows\07b-speckit.implement.experimental.md` for the task batch in Scope.

Scope:
- TASK_IDS: T036
- TASKS_FILE: specs/015-admin-diagrams/slices/plan_admin_diagram_creation_assignment_audit_slice.md

Batch-specific constraints:
- Review the implemented production behavior against the slice invariants, active contracts, and recorded proof.
- Any remaining ownership-transfer path, quota race, stale eligibility authority, or template-copy coupling MUST be treated as incomplete work.

Main proof:
- Review findings show that implementation, contracts, automated proof, and browser smoke agree on independent-copy assignment semantics.

Do not count this as success:
- A summary-only review that does not inspect production paths, concurrency behavior, and recorded runtime evidence.
```
