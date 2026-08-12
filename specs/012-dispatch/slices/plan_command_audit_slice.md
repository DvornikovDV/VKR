# P2: Command Audit Slice

## Scope

This document is the general implementation plan for the Command Audit slice.

The primary readers are implementation agents and reviewers working across Cloud and Client Dispatch surfaces. The target outcome is a trusted USER-only command audit list endpoint and a Dispatch Commands tab that displays audit evidence for the selected Edge Server.

## Source Of Truth

- Cloud command routing and audit semantics: `doc_cursed/cloud_client_control_plan.md`.
- Dispatch shell and selected-context ownership: `doc_cursed/dispatch_onboarding_slice_draft.md`.
- Slice planning workflow: `doc/slices.md`.
- Similar Cloud audit foundation: `specs/008-cloud-control/slices/plan_cloud_rpc_and_audit_slice.md`.
- Similar Dispatch shell foundation: `specs/012-dispatch/slices/plan_dispatch_workspace_shell_onboarding_slice.md`.

## Planning Note

The speckit prerequisite script `.agent/skills/scripts/powershell/check-prerequisites.ps1 -Json` was attempted during task planning and was blocked by local PowerShell Execution Policy. This does not block this slice plan because the user provided the target slice file, source documents, scope, code paths, and constraints.

## Purpose

The slice MUST make command audit evidence visible to a trusted dispatcher from `/hub/dispatch/commands`.

Cloud MUST expose a read-only paginated list of `CommandAudit` projection rows for the selected Edge Server. Client MUST replace the Commands placeholder with a Command Audit table driven by the Dispatch selected context.

The slice MUST NOT change command execution, Edge behavior, telemetry state, or Dashboard runtime semantics.

## Current Code Facts

- `cloud_server/src/models/CommandAudit.ts` already defines persistent audit rows with `requestId`, `edgeId`, `deviceId`, `commandType`, `payload`, `requestedBy`, `requestedAt`, `status`, `completedAt`, and `failureReason`.
- `cloud_server/src/services/commands.service.ts` already creates audit rows for `POST /api/edge-servers/:edgeId/commands` and uses guarded terminal updates.
- `cloud_server/src/types/index.ts` already defines `CommandAuditProjection`, but it does not define command audit list query or response DTOs.
- `cloud_server/src/api/routes.ts` does not currently register `GET /api/edge-servers/:edgeId/command-audit`.
- `cloud_server/openapi.yaml` documents command POST but does not document a command audit list endpoint.
- Alarm incidents already provide the nearest Cloud list pattern for trusted USER access, pagination, projection, controller/service split, and OpenAPI coverage.
- `client/src/shared/api/client.ts` unwraps `{ status: "success", data }` responses.
- `client/src/shared/api/commands.ts` sends commands but does not read audit rows.
- `/hub/dispatch/commands` currently renders `DispatchPlaceholderTab`.
- `DispatchWorkspacePage` already avoids Dashboard runtime loading for non-Dashboard tabs except implemented Trends.
- `DispatchContextBar` already has an action slot suitable for Refresh and list summary controls.

## Constraints

- MUST keep `doc_cursed` as the source of truth for architecture and command semantics.
- MUST keep Cloud route flow as Routes -> Controllers -> Services -> Models.
- MUST protect `GET /api/edge-servers/:edgeId/command-audit` with JWT auth and `requireRole("USER")`.
- MUST validate `edgeId`, Edge Server existence, and `EdgeServer.trustedUsers` membership before returning audit rows.
- MUST return only rows for the selected `edgeId`.
- MUST return command audit rows as evidence/log records, not telemetry state.
- MUST NOT overwrite existing terminal `CommandAudit` statuses.
- MUST sort rows newest-first by `requestedAt` and use `_id` as a stable tie-breaker when needed.
- MUST support `page`, `limit`, and optional `status` query parameters.
- MUST cap `limit` at 100 and default to 50.
- MUST apply filtering, sorting, skip, and limit in the MongoDB query.
- MUST NOT load the full Edge audit collection into memory for pagination.
- MUST return `{ audits, page, limit, total, hasNextPage }` inside the existing success envelope.
- MUST update `cloud_server/openapi.yaml` when the endpoint contract is added.
- MUST keep the Client REST helper under `client/src/shared/api`.
- MUST keep Dispatch UI under `client/src/features/dispatch`.
- MUST use the Dispatch selected `edgeId` as the audit query source.
- MUST reset or ignore stale Client audit responses after selected Edge changes.
- MUST NOT start a Dashboard runtime socket session on `/hub/dispatch/commands`.
- MUST NOT read Edge YAML, infer command capability from labels, or use audit rows as physical widget state.
- MUST render command payload as inert text or a compact JSON/value representation.
- MUST NOT execute, infer command capability from, or treat command payload as telemetry state.
- MUST NOT change Edge-side execution, Modbus, YAML, `command_result`, or reportedMetric confirmation.
- MUST NOT change Constructor.
- MUST NOT add realtime audit streaming, Presence Lock, exports, reports, analytics, or multi-instance coordination.
- MUST apply Lean Testing Policy: automated proof MUST cover the main happy path and at most one critical negative scenario for the main slice risk. Tests MUST NOT expand into broad table-driven coverage for every status, payload variant, query permutation, or visual class.

## Runtime Flow

1. USER opens `/hub/dispatch/commands?diagramId=:diagramId&edgeId=:edgeId`.
2. Dispatch shell resolves selected Diagram and Edge Server through shared Dispatch context.
3. Commands tab reads the selected `edgeId`.
4. If no valid `edgeId` is selected, Commands tab MUST show a non-loading selection state and MUST NOT call Cloud.
5. Client calls `GET /api/edge-servers/:edgeId/command-audit` through the shared API helper.
6. Cloud route applies JWT auth and `requireRole("USER")`.
7. Cloud service validates `edgeId`, Edge existence, and trusted USER membership.
8. Cloud service parses pagination and optional status filter.
9. Cloud reads `CommandAudit` rows by `edgeId`, applies fixed newest-first sorting and pagination, and projects rows to the public contract.
10. Cloud returns the paginated audit list in the success envelope.
11. Client renders loading, empty, error, refresh, and table row states.
12. Refresh repeats the same request for the current selected Edge.
13. When selected Edge changes, Client MUST clear or isolate previous audit state and MUST ignore stale responses from the old Edge.

## Scope

- MUST add `GET /api/edge-servers/:edgeId/command-audit` for trusted USER access.
- MUST return a paginated, newest-first list of command audit projection rows.
- MUST support optional `status` filtering.
- MUST add command audit list DTOs or equivalent typed contracts in Cloud.
- MUST add a Cloud projection path for `CommandAudit` rows.
- MUST update Cloud OpenAPI for the endpoint, query parameters, response schemas, and auth/access errors.
- MUST add a Client shared API helper for reading command audit rows.
- MUST replace the Dispatch Commands placeholder with a Command Audit table.
- MUST show status, failure reason, requested time, completed time, requester id, device id, command type, and payload in the table.
- SHOULD include a minimal status filter when it does not expand the slice.
- MAY include pagination summary and simple next/previous controls.

## Out Of Scope

- MUST NOT change command send semantics.
- MUST NOT change Edge execution, Modbus writes, YAML contracts, `command_result`, or reportedMetric confirmation.
- MUST NOT change command widget visual-state semantics.
- MUST NOT change telemetry history or alarm incident behavior.
- MUST NOT change Constructor.
- MUST NOT add realtime command audit updates.
- MUST NOT add Presence Lock, exports, reports, analytics, or multi-instance coordination.
- MUST NOT resolve `requestedBy` to email or display name unless an existing projection makes it effectively free.
- MUST NOT start Dashboard runtime session on the Commands tab.

## Assumptions

- The target plan path is `specs/012-dispatch/slices/plan_command_audit_slice.md` because the user-visible surface is Dispatch.
- The response list key is `audits`.
- `requestedBy` MAY remain the raw user id string for MVP.
- Fixed newest-first sorting is sufficient for MVP; user-selectable sorting is out of scope.
- The optional status filter uses existing statuses: `accepted`, `sent_to_edge`, `confirmed`, `timeout`, and `failed`.
- Cloud can reuse the alarm incidents list style for query parsing, trusted access checks, response envelope, and OpenAPI shape.
- Command audit listing is a best-effort paginated read under concurrent command writes; the slice does not require a transactional snapshot.

## Acceptance Checks

- A trusted USER can call `GET /api/edge-servers/:edgeId/command-audit` for an assigned Edge and receive `200` with `audits`, `page`, `limit`, `total`, and `hasNextPage`.
- An untrusted USER cannot read another user's Edge command audit.
- Returned rows include `requestId`, `edgeId`, `deviceId`, `commandType`, `payload`, `requestedBy`, `requestedAt`, `status`, `completedAt`, and `failureReason`.
- Rows are sorted newest-first and pagination returns a stable page.
- Optional `status` filter returns only matching audit rows.
- Invalid `edgeId`, invalid pagination, and unsupported `status` produce validation/access errors through existing Cloud error handling.
- OpenAPI documents the endpoint and passes lint after implementation.
- `/hub/dispatch/commands` renders the Command Audit table for the selected Edge.
- Commands tab shows loading, empty, error, refresh, and populated row states.
- Commands tab clears or ignores stale audit data after selected Edge changes.
- Commands tab does not start Dashboard runtime session.
- Command Audit rows do not drive telemetry state or command widget physical state.
- Lean automated proof remains limited to one Cloud happy path, one Cloud critical negative access proof, and one focused Client Dispatch proof.

## Format: `[ID] [P?] [Story?] Description`

- `[P]` means the task can run in parallel because it touches different files and does not depend on incomplete tasks.
- `[US1]` maps to the Cloud command audit list endpoint.
- `[US2]` maps to the Dispatch Commands tab UI.
- Every task includes the file path that owns the change or proof.
- This document intentionally does not include implementation batches.

## Phase 1: Setup

**Purpose**: Establish shared command audit contracts before endpoint and UI work.

- [X] T001 Define command audit list query constants, response DTOs, and status filter types in `cloud_server/src/types/index.ts`.
- [X] T002 [P] Add command audit list request and response types for the Client REST helper in `client/src/shared/api/commands.ts`.

**Checkpoint**: Cloud and Client have explicit audit list contract anchors without route or UI behavior changes.

---

## Phase 2: Foundational Helpers

**Purpose**: Add narrow reusable helpers for projection, query parsing, and focused test fixtures.

- [X] T003 Add `parseCommandAuditListQuery`, `projectCommandAudit`, and MongoDB filter construction helpers in `cloud_server/src/services/commands.service.ts`.
- [X] T004 [P] Add command audit seed and response helper utilities for Cloud integration tests in `cloud_server/tests/integration/edge-socket.helpers.ts`.
- [X] T005 [P] Add command audit GET mocking support and reusable audit row fixtures for Dispatch tests in `client/tests/integration/helpers/dispatchWorkspaceHarness.tsx`.

**Checkpoint**: Endpoint implementation and focused tests can reuse typed parsing, projection, and fixtures.

---

## Phase 3: User Story 1 - Cloud Command Audit List Endpoint (Priority: P1)

**Goal**: A trusted USER can read a paginated newest-first command audit list for one trusted Edge Server through `GET /api/edge-servers/:edgeId/command-audit`.

**Independent Test**: Use the Cloud integration server, one trusted USER, one untrusted USER, a registered Edge, and seeded `CommandAudit` rows. The proof MUST verify the response projection, newest-first sorting, pagination metadata, optional status filtering, and access denial without requiring Edge-side execution.

### Tests For User Story 1

- [X] T006 [US1] Add happy path integration proof for trusted USER audit list projection, newest-first sorting, pagination metadata, and status filtering in `cloud_server/tests/integration/commands.audit.test.ts`.
- [X] T007 [US1] Add one critical negative integration proof for untrusted USER access denial without leaking audit rows in `cloud_server/tests/integration/commands.audit.test.ts`.

### Implementation For User Story 1

- [X] T008 [US1] Implement `listTrustedCommandAudits` with `edgeId` validation, Edge existence, `trustedUsers` membership, status filter, MongoDB sort/skip/limit, count, and projection in `cloud_server/src/services/commands.service.ts`.
- [X] T009 [US1] Add `listCommandAudit` controller action that delegates to the service and returns `{ status: "success", data }` in `cloud_server/src/api/commands.controller.ts`.
- [X] T010 [US1] Register `GET /api/edge-servers/:edgeId/command-audit` with `authMiddleware`, `requireRole("USER")`, and `CommandsController.listCommandAudit` in `cloud_server/src/api/routes.ts`.
- [X] T011 [US1] Document the command audit list path, query parameters, projection schema, list response schema, and auth/access/validation responses in `cloud_server/openapi.yaml`.

**Checkpoint**: Cloud exposes the audit list contract and proves trusted access plus read-only pagination behavior.

---

## Phase 4: User Story 2 - Dispatch Command Audit Tab (Priority: P1)

**Goal**: A USER opens `/hub/dispatch/commands` and sees command audit rows for the selected Edge without starting the Dashboard runtime session.

**Independent Test**: Mount User Hub Dispatch routes at `/hub/dispatch/commands?diagramId=...&edgeId=...`, mock the command audit GET endpoint, and verify selected Edge request, rendered rows, refresh behavior, empty/error handling where practical, stale selected-Edge response rejection, and no Dashboard runtime session startup.

### Tests For User Story 2

- [X] T012 [US2] Add focused Dispatch Commands integration proof for selected Edge command audit GET, rendered rows, refresh or reload behavior, one compact empty/error branch, stale Edge response rejection, and no Dashboard runtime session in `client/tests/integration/DispatchWorkspacePage.test.tsx`.

### Implementation For User Story 2

- [X] T013 [US2] Implement `listCommandAudit` helper with query-string construction in `client/src/shared/api/commands.ts`.
- [X] T014 [P] [US2] Add command audit formatting, status options, request key, and stale-response guard helpers in `client/src/features/dispatch/model/commandAudit.ts`.
- [X] T015 [US2] Create `DispatchCommandAuditTable` for inert payload rendering and audit row display in `client/src/features/dispatch/components/DispatchCommandAuditTable.tsx`.
- [X] T016 [US2] Create `DispatchCommandAuditTab` with selected Edge validation, loading, empty, error, status filter, refresh, pagination summary, and stale-response isolation in `client/src/features/dispatch/components/DispatchCommandAuditTab.tsx`.
- [X] T017 [US2] Wire the Commands route to `DispatchCommandAuditTab` instead of `DispatchPlaceholderTab` in `client/src/features/dispatch/pages/DispatchWorkspacePage.tsx`.
- [X] T018 [US2] Remove the Commands-specific unimplemented placeholder message path while keeping Telemetry and Alarms placeholders intact in `client/src/features/dispatch/components/DispatchPlaceholderTab.tsx`.

**Checkpoint**: Dispatch Commands is a read-only audit surface tied to selected context and isolated from Dashboard runtime behavior.

---

## Phase 5: Polish, Verification, And Review

**Purpose**: Verify the narrow slice, contracts, and boundaries without expanding proof volume.

- [X] T019 Inspect `cloud_server/src/services/commands.service.ts`, `cloud_server/src/api/commands.controller.ts`, and `cloud_server/src/api/routes.ts` to verify route flow stays Routes -> Controllers -> Services -> Models and command POST semantics are unchanged.
- [X] T020 Inspect `client/src/features/dispatch/components/DispatchCommandAuditTab.tsx`, `client/src/features/dispatch/components/DispatchCommandAuditTable.tsx`, and `client/src/features/dispatch/pages/DispatchWorkspacePage.tsx` to verify Commands tab does not import Dashboard runtime hooks or start a runtime session.
- [X] T021 Run Cloud typecheck from `cloud_server` using `cmd /c npm run typecheck` and record the result in `specs/012-dispatch/slices/plan_command_audit_slice.md`.
- [X] T022 Run focused Cloud command audit integration tests from `cloud_server` using `cmd /c npm run test -- commands.audit` and record the result in `specs/012-dispatch/slices/plan_command_audit_slice.md`.
- [X] T023 Run OpenAPI lint from `cloud_server` using `cmd /c npx @redocly/cli lint openapi.yaml` and record the result in `specs/012-dispatch/slices/plan_command_audit_slice.md`.
- [X] T024 Run focused Dispatch workspace tests from `client` using `cmd /c npm run test -- DispatchWorkspacePage` and record the result in `specs/012-dispatch/slices/plan_command_audit_slice.md`.
- [X] T025 Run Client build from `client` using `cmd /c npm run build` and record the result in `specs/012-dispatch/slices/plan_command_audit_slice.md`.
- [X] T026a Record code-backed smoke coverage for trusted audit list loading, status filtering, refresh, Edge switch stale-response isolation, empty state, trusted access denial, and no Dashboard runtime session in `specs/012-dispatch/slices/plan_command_audit_slice.md`.
- [X] T026b Add a step-by-step manual smoke execution plan for runtime-only verification of network scoping, live UI recovery, error state recovery, and no Dashboard runtime socket session in `specs/012-dispatch/slices/plan_command_audit_slice.md`.
- [ ] T027 Complete Technical Lead Review for scope leakage, Cloud trusted access, MongoDB pagination, contract drift, Client stale state, no-runtime boundary, inert payload rendering, and Lean Testing Policy using `specs/012-dispatch/slices/review_command_audit_slice_prompt.md`.

---

## Dependencies And Execution Order

### Phase Dependencies

- Phase 1 has no production dependency and establishes shared contract anchors.
- Phase 2 depends on Phase 1 Cloud and Client types.
- Phase 3 depends on Phase 2 Cloud query/projection helpers and test helpers.
- Phase 4 depends on Phase 1 Client types, Phase 2 Client fixtures, and the Phase 3 endpoint contract.
- Phase 5 depends on implementation and proof tasks from Phases 3 and 4.

### Task Dependencies

- T003 depends on T001.
- T004 depends on T001.
- T005 depends on T002.
- T006 and T007 depend on T003 and T004 and pass only after T008-T011.
- T008 depends on T003.
- T009 depends on T008.
- T010 depends on T009.
- T011 depends on the final route and response shape from T009-T010.
- T012 depends on T005 and passes only after T013-T018.
- T013 depends on T002 and the endpoint contract from T011.
- T014 depends on T002.
- T015 depends on T014.
- T016 depends on T013-T015.
- T017 depends on T016.
- T018 depends on T017.
- T019-T020 depend on implementation completion.
- T021-T025 depend on T011 and T018.
- T026a depends on T021-T025 because it records code-backed proof from the focused verification commands.
- T026b depends on T026a because the manual plan should only cover remaining runtime-only proof gaps.
- T027 depends on T019-T026b.

### Parallel Opportunities

- T001 and T002 can run in parallel because they touch Cloud and Client type surfaces separately.
- T004 and T005 can run in parallel after setup because Cloud and Client test fixtures are independent.
- T006 and T007 can be drafted in parallel once T003-T004 define test helpers.
- T014 and T015 can run in parallel only if T015 consumes a stable row type from T002 and avoids duplicating model helper logic from T014.
- T019 and T020 can run in parallel after implementation because they inspect separate Cloud and Client boundaries.
- T021, T023, T024, and T025 can run in parallel if local test/build resources permit.

## Parallel Example: Cloud Endpoint

```text
Task: "Add happy path integration proof for trusted USER audit list projection, newest-first sorting, pagination metadata, and status filtering in `cloud_server/tests/integration/commands.audit.test.ts`"
Task: "Add one critical negative integration proof for untrusted USER access denial without leaking audit rows in `cloud_server/tests/integration/commands.audit.test.ts`"
```

## Parallel Example: Client UI

```text
Task: "Add command audit formatting, status options, request key, and stale-response guard helpers in `client/src/features/dispatch/model/commandAudit.ts`"
Task: "Create `DispatchCommandAuditTable` for inert payload rendering and audit row display in `client/src/features/dispatch/components/DispatchCommandAuditTable.tsx`"
```

## Implementation Strategy

### MVP First

1. Complete Phase 1 and Phase 2 to define contract and helper anchors.
2. Complete Phase 3 to make the Cloud list endpoint independently testable.
3. Complete Phase 4 to replace the Commands placeholder with the read-only Dispatch audit UI.
4. Complete Phase 5 verification and Technical Lead Review.

### Boundary Bias

- Keep Cloud read behavior separate from command POST orchestration.
- Prefer reusing alarm incident list patterns for trusted access and pagination shape without copying alarm lifecycle behavior.
- Keep Client REST typing in `shared/api` and Dispatch UI/state in `features/dispatch`.
- Keep stale-response protection local to the Commands tab request lifecycle.
- Keep payload rendering passive and compact.
- Do not add realtime updates, optimistic command state, Dashboard runtime wiring, or Edge/Constructor changes to close this slice.

## Manual And Runtime Smoke

### Code-Backed Smoke Coverage

The following smoke items are already covered by focused code proof and should not require manual re-check unless the relevant code changes:

1. Trusted Cloud audit list loading, projection, status filtering, newest-first sorting, pagination metadata, and selected Edge scoping are covered by `cloud_server/tests/integration/commands.audit.test.ts` with `cmd /c npm run test -- commands.audit`.
2. Untrusted USER denial without leaking audit rows is covered by `cloud_server/tests/integration/commands.audit.test.ts` with `cmd /c npm run test -- commands.audit`.
3. Dispatch selected Edge request construction, rendered rows, Refresh, Edge switch stale-response rejection, status filter empty state, and no Dashboard runtime session are covered by `client/tests/integration/DispatchWorkspacePage.test.tsx` with `cmd /c npm run test -- DispatchWorkspacePage`.
4. Command POST semantics and the no-runtime Commands boundary are covered by the T019-T020 boundary inspection notes in the Quickcheck Validation Record.

### Manual Smoke Execution Plan

Use this plan only for runtime behavior that benefits from a real browser/server session:

1. Start the Cloud and Client local runtime using the repository's normal development commands for the current environment.
2. Sign in as a trusted USER with access to at least one Edge Server that has command audit rows.
3. Open `/hub/dispatch/commands?diagramId=:diagramId&edgeId=:edgeId` with valid IDs for that USER.
4. In browser devtools Network, verify the page sends `GET /api/edge-servers/:edgeId/command-audit` for the selected Edge and does not send Dashboard runtime socket/session startup traffic from the Commands tab.
5. Verify visible rows show status, failure reason when present, requested time, completed time, requester id, device id, command type, and payload as inert text.
6. Change the status filter and click Refresh; verify each request stays scoped to the selected Edge and the table updates without changing any Dashboard widget state.
7. Switch to another trusted Edge Server; verify previous Edge rows disappear or remain ignored after late responses.
8. Exercise an empty audit response and verify the empty state is visible and non-loading.
9. Force or simulate a command audit GET failure, then restore the server/mock and click Refresh; verify the error state recovers.
10. Do not count manual smoke as passed if command audit rows mutate widget state, if the Commands tab starts a Dashboard runtime session, if the Client reads Edge YAML, or if untrusted Edge audit rows are visible.

## Quickcheck Validation Record

- 2026-05-14: T023 PASS from `cloud_server` with `cmd /c npx @redocly/cli lint openapi.yaml`; Redocly validated `openapi.yaml` successfully after documenting `GET /api/edge-servers/{edgeId}/command-audit`.
- 2026-05-14: T002/T005/T013/T014 PASS from `client` with `cmd /c npm run test -- commandsApi commandAuditModel DispatchWorkspacePage`; validated Client command audit list query construction, Dispatch command audit model helpers, and Dispatch harness command audit GET mocking.
- 2026-05-14: T012/T015/T016/T017/T018 PASS from `client` with `cmd /c npm run test -- DispatchWorkspacePage`, `cmd /c npm run test -- commandsApi commandAuditModel dispatchShellComponents`, and `cmd /c npm run build`; validated selected Edge command audit loading through User Hub Dispatch routing, refresh, empty branch, stale Edge response rejection, no Dashboard runtime session, placeholder removal, and production build typing.
- 2026-05-14: Quickcheck prerequisite attempted from repo root with `.agent/skills/scripts/powershell/check-prerequisites.ps1 -Json -RequireTasks -IncludeTasks` and failed with local PowerShell script execution disabled. Retried with `powershell -ExecutionPolicy Bypass -File .agent\skills\scripts\powershell\check-prerequisites.ps1 -Json -RequireTasks -IncludeTasks`; it failed because it resolved `specs\main`. Retried once with `SPECIFY_FEATURE=012-dispatch`; it failed because `specs\012-dispatch\plan.md` is absent. Execution continued from the user-supplied `TASKS_FILE`.
- 2026-05-14: T019 PASS by boundary inspection of `cloud_server/src/api/routes.ts`, `cloud_server/src/api/commands.controller.ts`, and `cloud_server/src/services/commands.service.ts`. `POST /api/edge-servers/:edgeId/commands` still routes through `commandRateLimit`, `authMiddleware`, `requireRole("USER")`, and `CommandsController.executeCommand`; the controller still validates the body, loads the command target, and calls `orchestrateCommand`. `GET /api/edge-servers/:edgeId/command-audit` is the only new read route and delegates Routes -> Controller -> Service -> Models through `CommandsController.listCommandAudit` and `listTrustedCommandAudits`.
- 2026-05-14: T020 PASS by boundary inspection of `client/src/features/dispatch/components/DispatchCommandAuditTab.tsx`, `client/src/features/dispatch/components/DispatchCommandAuditTable.tsx`, and `client/src/features/dispatch/pages/DispatchWorkspacePage.tsx`. Commands tab imports only command audit API/model/table dependencies and does not import Dashboard runtime hooks. `DispatchWorkspacePage` still passes `loadDashboardRuntimeContext: activeTabId === DISPATCH_DASHBOARD_TAB`; `DashboardDispatchSubtab`, which owns `useDashboardRuntimeSession`, is rendered only for `DISPATCH_DASHBOARD_TAB`, not `DISPATCH_COMMANDS_TAB`.
- 2026-05-14: T021 PASS from `cloud_server` with `cmd /c npm run typecheck`; actual output included `> cloud-server@1.0.0 typecheck`, `> tsc --noEmit`, and exit code 0.
- 2026-05-14: T022 PASS from `cloud_server` with `cmd /c npm run test -- commands.audit`; Vitest ran `tests/integration/commands.audit.test.ts`, reported `1 passed` test file and `2 passed` tests, including `T006: lists trusted audits through the route with projection, status filtering, sorting, and pagination`, with exit code 0. Stderr included `[database] MongoDB disconnected - attempting reconnect...` after graceful disconnect, but the command exited successfully.
- 2026-05-14: T024 PASS from `client` with `cmd /c npm run test -- DispatchWorkspacePage`; Vitest ran `tests/integration/DispatchWorkspacePage.test.tsx`, reported `1 passed` test file and `5 passed` tests, including `proves Dispatch Commands route uses selected Edge audit list, refresh, empty state, stale rejection, and no runtime session`, with exit code 0. Stderr included the pre-existing Recharts width/height warning in the Trends test, but the command exited successfully.
- 2026-05-14: T025 PASS from `client` with `cmd /c npm run build`; actual output included `> client@0.0.0 build`, `> tsc -b && vite build`, `2598 modules transformed`, and `built in 5.79s`, with exit code 0. Vite emitted the existing chunk-size warning for chunks larger than 500 kB.
- 2026-05-14: T026a PASS by mapping focused code proof to smoke items. `cmd /c npm run test -- commands.audit` covers trusted audit loading, status filtering, selected Edge scoping, pagination, projection, and untrusted denial. `cmd /c npm run test -- DispatchWorkspacePage` covers selected Edge command audit GET, rendered rows, Refresh, Edge switch stale-response rejection, empty state through status filtering, and no Dashboard runtime session. T019-T020 inspection covers unchanged command POST semantics and no-runtime import/routing boundaries.
- 2026-05-14: T026b PASS by adding the Manual Smoke Execution Plan above for live browser/server verification of network scoping, runtime recovery, error recovery, and no Dashboard runtime socket session.

## Technical Lead Review

Review this plan and implementation for Cloud trusted access, read-only audit semantics, MongoDB pagination, OpenAPI contract shape, Client selected-context ownership, stale-response handling, no Dashboard runtime startup, inert payload rendering, and Lean Testing discipline.

Reviewer prompt: `specs/012-dispatch/slices/review_command_audit_slice_prompt.md`.

### Review Checklist

- [ ] Verify scope did not expand into command send semantics, Edge execution, Modbus, YAML, `command_result`, reportedMetric confirmation, Constructor, realtime stream, Presence Lock, exports, reports, analytics, or multi-instance coordination.
- [ ] Verify `GET /api/edge-servers/:edgeId/command-audit` is protected by JWT auth and `requireRole("USER")`.
- [ ] Verify trusted Edge access checks use `EdgeServer.trustedUsers` and do not leak rows to untrusted users.
- [ ] Verify Cloud list reads do not overwrite terminal `CommandAudit` statuses.
- [ ] Verify Cloud applies filter, sort, skip, and limit in MongoDB instead of loading all Edge audit rows into memory.
- [ ] Verify returned projection contains only the public command audit contract.
- [ ] Verify OpenAPI documents query parameters, response schemas, and auth/access/validation responses.
- [ ] Verify Dispatch Commands reads only through Cloud REST.
- [ ] Verify Dispatch Commands uses selected `edgeId` and handles no-selected-Edge state without calling Cloud.
- [ ] Verify selected Edge changes clear or isolate previous audit state and stale responses cannot repopulate old rows.
- [ ] Verify Commands tab does not start Dashboard runtime session.
- [ ] Verify payload rendering is inert and is not used as telemetry state or command capability evidence.
- [ ] Verify automated proof remains lean: one Cloud happy path, one Cloud critical access negative, and one focused Client Dispatch proof.

## Review Trigger

Review this plan when command audit status vocabulary, `CommandAudit` schema, Dispatch selected-context ownership, Cloud trusted Edge access rules, OpenAPI envelope conventions, or `/hub/dispatch/commands` route behavior changes.
