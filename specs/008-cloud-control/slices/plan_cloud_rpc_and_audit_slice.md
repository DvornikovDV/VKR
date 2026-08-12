# Tasks: Cloud RPC and Command Audit Slice

**Input**: `doc_cursed/cloud_client_control_plan.md`, `cloud_server/AGENTS.md`, existing Cloud REST routes, `/edge` Socket.IO runtime path, `EdgeServer.trustedUsers`, current OpenAPI contract, and the slice review decisions captured before task planning.

**Prerequisites**: Existing Cloud auth, USER role checks, trusted Edge assignments, persistent Edge runtime authentication, active Edge socket registry, Dashboard room subscription by `edgeId`, and Vitest integration harness.

**Tests**: Lean Testing Policy applies. Add one happy path proof and one critical negative proof for Cloud RPC timeout plus late Edge response cleanup. Do not add large table-driven validation tests.

**Organization**: Tasks are grouped as setup, foundational Cloud command infrastructure, one independently testable user story, and polish/review.

## Purpose

This task plan implements the Cloud-only command RPC path. Cloud MUST accept a trusted USER HTTP command, create `CommandAudit`, route `execute_command` to one active trusted Edge socket, wait synchronously for a trusted `command_result` or a 5-second Cloud RPC timeout, atomically persist one terminal audit result, and return that result through the original HTTP response.

## Scope

This plan applies only to `cloud_server`.

The working route MUST be `POST /api/edge-servers/:edgeId/commands` to match the repository's current Edge HTTP route convention. The source plan's `/api/edges/:edgeId/commands` route is a code fact, not the implementation route for this slice.

## Constraints

- MUST protect the command endpoint with JWT auth, `requireRole('USER')`, trusted access to `edgeId`, and a basic in-memory rate limit.
- MUST support only `set_bool` and `set_number` command types.
- MUST validate request body before WebSocket emit.
- MUST create `CommandAudit` with `status: "accepted"` before routing to Edge.
- MUST transition `accepted -> sent_to_edge -> confirmed | timeout | failed`.
- MUST re-check the selected `/edge` socket is still trusted for `edgeId` immediately before `execute_command`.
- MUST close already-created audit records as terminal `failed` if no active trusted Edge socket is available before emit.
- MUST start the 5-second Cloud RPC timeout only after `sent_to_edge`.
- MUST distinguish `failureReason: "cloud_rpc_timeout"` from `failureReason: "edge_command_timeout"`.
- MUST accept `command_result` only from a trusted `/edge` socket with matching `edgeId` and known `requestId`.
- MUST ignore unknown, duplicate, late, or mismatched `command_result` events.
- MUST use an atomic conditional terminal audit update so a terminal status cannot be overwritten.
- MUST clean up pending listeners and timers on result-first and timeout-first paths.
- MUST bound `CommandAudit` retention with a TTL index and make `requestId` unique.
- MUST update and lint `cloud_server/openapi.yaml`.
- DO NOT implement Edge-side command execution, Modbus writes, Edge reportedMetric confirmation logic, Client UI, command journal UI, alarms, Presence Lock, `ControlLease`, Redis, queue brokers, retries, or multi-instance coordination.
- DO NOT use command status or audit events as digital twin state. Telemetry and Edge reported metrics remain the only factual state source.

## Assumptions

- The MVP pending registry is process-local and may be lost on Cloud process restart.
- A narrow helper may expose the active trusted Edge socket by `edgeId` from the existing socket registry.
- Dashboard command-status broadcast is not required for this slice. If implemented later, it must be audit/status-only and must not imply telemetry or reported-state mutation.

## Format: `[ID] [P?] [Story] Description`

- `[P]` means the task can run in parallel because it touches different files and does not depend on incomplete tasks.
- `[US1]` maps to the single Cloud command RPC and audit story.
- Every task includes the file path that owns the change or proof.
- This document intentionally does not include implementation batches.

## Phase 1: Setup

**Purpose**: Add stable command vocabulary and route-local infrastructure anchors before shared runtime code changes.

- [X] T001 Define command RPC status, failure reason, request, result, and audit projection types in `cloud_server/src/types/index.ts`
- [X] T002 [P] Add the command endpoint rate limiter using `express-rate-limit` in `cloud_server/src/api/commands.rate-limit.ts`
- [X] T003 [P] Add compact command request validation for `deviceId`, `commandType`, boolean `payload.value` for `set_bool`, and numeric `payload.value` for `set_number` in `cloud_server/src/services/commands.validation.ts`

**Checkpoint**: Command request and response shapes are explicit, reusable, and independent of controller wiring.

---

## Phase 2: Foundational Cloud Command Infrastructure

**Purpose**: Build the persistence, socket, and pending-result primitives that the HTTP story depends on.

- [X] T004 Add `CommandAudit` Mongoose model with status enum, `requestId` unique index, `requestedAt` TTL index for 30-day retention, and terminal audit fields in `cloud_server/src/models/CommandAudit.ts`
- [X] T005 Export a narrow active trusted Edge socket lookup helper that reuses the existing `/edge` active socket registry in `cloud_server/src/socket/events/edge.ts`
- [X] T006 Add process-local pending command registry with register, resolve, timeout, duplicate-ignore, and cleanup operations in `cloud_server/src/services/command-pending-registry.ts`
- [X] T007 Add `/edge` `command_result` handler that validates trusted socket state, matching `edgeId`, known `requestId`, and terminal payload shape in `cloud_server/src/socket/events/command.ts`
- [X] T008 Wire the `command_result` handler into the existing trusted Edge connection path in `cloud_server/src/socket/events/edge.ts`
- [X] T009 [P] Extend integration socket helpers with command RPC helpers for capturing `execute_command` and emitting `command_result` in `cloud_server/tests/integration/edge-socket.helpers.ts`

**Checkpoint**: Cloud can identify an active trusted Edge socket and has a guarded in-memory bridge for one pending command result.

---

## Phase 3: User Story 1 - Execute Cloud Command RPC With Audit (Priority: P1) MVP

**Goal**: A trusted USER sends `POST /api/edge-servers/:edgeId/commands`; Cloud records the audit lifecycle, emits `execute_command` to the active Edge socket, waits for a trusted terminal `command_result` or Cloud timeout, and returns the terminal result through the original HTTP request.

**Independent Test**: Use the existing Cloud integration server, a trusted USER token, a bound active Edge runtime socket, and a subscribed Dashboard socket only as needed for existing room setup. The test must prove the HTTP response and `CommandAudit` terminal state without requiring Edge-side command execution.

### Tests for User Story 1

- [X] T010 [US1] Add happy path integration proof for trusted USER command POST, `execute_command` emission, trusted Edge `confirmed` response, HTTP `200`, `CommandAudit` `accepted -> sent_to_edge -> confirmed`, and cleanup of `CommandAudit`, `EdgeServer`, `User`, sockets, and pending registry in `cloud_server/tests/integration/commands.rpc.test.ts`
- [X] T011 [US1] Add one negative integration proof for Cloud RPC timeout returning `504`, `failureReason: "cloud_rpc_timeout"`, cleanup of `CommandAudit`, `EdgeServer`, `User`, sockets, and pending registry, and late Edge response not overwriting terminal audit state in `cloud_server/tests/integration/commands.rpc.test.ts`

### Implementation for User Story 1

- [X] T012 [US1] Add command target access loading that validates `edgeId`, `EdgeServer` existence, `Active` lifecycle, and `trustedUsers` membership for the requesting USER in `cloud_server/src/services/commands.service.ts`
- [X] T013 [US1] Add audit creation and non-terminal status transition helpers for `accepted` and `sent_to_edge` in `cloud_server/src/services/commands.service.ts`
- [X] T014 [US1] Add atomic terminal audit update helper that only transitions `accepted` or `sent_to_edge` to `confirmed`, `timeout`, or `failed` in `cloud_server/src/services/commands.service.ts`
- [X] T015 [US1] Implement command orchestration that generates `requestId`, creates `CommandAudit`, finds and re-checks the active trusted Edge socket, emits `execute_command`, marks `sent_to_edge`, waits on the pending registry, and cleans up timers/listeners in `cloud_server/src/services/commands.service.ts`
- [X] T016 [US1] Implement Cloud timeout handling that stores terminal `timeout` with `failureReason: "cloud_rpc_timeout"` exactly once after 5 seconds from `sent_to_edge` in `cloud_server/src/services/commands.service.ts`
- [X] T017 [US1] Implement Edge result normalization for `confirmed`, Edge `timeout` with `failureReason: "edge_command_timeout"`, and Edge `failed` with failure reason in `cloud_server/src/services/commands.service.ts`
- [X] T018 [US1] Implement command controller with request parsing, service delegation, and service outcome mapping for `200`, `400`, `404`, `409`, `502`, `503`, and `504`, while route middleware preserves existing `401`, `403`, and `429` behavior in `cloud_server/src/api/commands.controller.ts`
- [X] T019 [US1] Register `POST /api/edge-servers/:edgeId/commands` with command rate limit, `authMiddleware`, `requireRole('USER')`, and `CommandsController` in `cloud_server/src/api/routes.ts`
- [X] T020 [US1] Update OpenAPI path, request schema, response schemas, auth errors, access errors, rate-limit response, unavailable Edge response, and timeout responses in `cloud_server/openapi.yaml`

**Checkpoint**: The Cloud command RPC path is functional and independently testable without Edge execution or Client UI work.

---

## Phase 4: Polish, Verification, and Review

**Purpose**: Verify the narrow slice, contract, and race-condition guarantees without expanding proof volume.

- [X] T021 Run TypeScript typecheck using the script defined in `cloud_server/package.json`
- [X] T022 Run the focused command RPC integration test file in `cloud_server/tests/integration/commands.rpc.test.ts`
- [X] T023 Run OpenAPI lint with `npx @redocly/cli lint openapi.yaml` for `cloud_server/openapi.yaml`
- [X] T024 Perform runtime smoke against a local Cloud process using a trusted USER token, a connected test `/edge` socket, `POST /api/edge-servers/:edgeId/commands`, and a synthetic `command_result` in `specs/008-cloud-control/slices/plan_cloud_rpc_and_audit_slice.md`
- [X] T025 Complete Technical Lead Review for scope leakage, auth/trusted access, socket routing, timeout cleanup, terminal audit atomicity, TTL index, OpenAPI coverage, and Lean Testing Policy in `specs/008-cloud-control/slices/plan_cloud_rpc_and_audit_slice.md`

---

## Dependencies and Execution Order

### Phase Dependencies

- Phase 1 has no dependencies.
- Phase 2 depends on Phase 1 command types and validation anchors.
- Phase 3 depends on Phase 2 persistence, socket lookup, command result handling, and test helpers.
- Phase 4 depends on Phase 3 implementation and proofs.

### Task Dependencies

- T004 should complete before T013, T014, T015, T016, and T017.
- T005 should complete before T015.
- T006 should complete before T007, T011, T015, and T016.
- T007 must complete before T008.
- T008 and T009 should complete before T010 and T011.
- T010 and T011 should be written before T012-T020 when using test-first proof.
- T012 must complete before T015.
- T013 and T014 must complete before T015-T017.
- T015 must complete before T016 and T017.
- T018 depends on T012-T017.
- T019 depends on T002, T018, and existing route middleware.
- T020 depends on the final route and response mapping from T018-T019.
- T021-T023 depend on T020.
- T024 depends on T019 and a running local Cloud server.
- T025 depends on T021-T024 results.

### Parallel Opportunities

- T002 and T003 can run in parallel after T001 because they touch separate files.
- T004 and T005 can run in parallel after Phase 1 because persistence and socket lookup are independent.
- T006 and T009 can run in parallel because runtime pending logic and test helper additions touch separate files.
- T010 and T011 can be drafted in parallel once T008-T009 establish the socket test harness contract.
- T012, T013, and T014 can be implemented in parallel if service helper ownership is split carefully in `cloud_server/src/services/commands.service.ts`.
- T020 can begin after HTTP shapes are stable and can run alongside late service cleanup work if the response mapping is not changing.

## Parallel Example: User Story 1

```text
Task: "Add happy path integration proof for trusted USER command POST, `execute_command` emission, trusted Edge `confirmed` response, HTTP `200`, and `CommandAudit` `accepted -> sent_to_edge -> confirmed` in `cloud_server/tests/integration/commands.rpc.test.ts`"
Task: "Add one negative integration proof for Cloud RPC timeout returning `504`, `failureReason: \"cloud_rpc_timeout\"`, cleanup of pending registry, and late Edge response not overwriting terminal audit state in `cloud_server/tests/integration/commands.rpc.test.ts`"
```

## Implementation Strategy

### MVP First

1. Complete Phase 1 to make command contracts and rate limiting explicit.
2. Complete Phase 2 to add audit persistence, active socket lookup, pending registry, and `command_result` handling.
3. Add the two lean integration proofs in Phase 3.
4. Implement the service orchestration, controller, route, and OpenAPI contract until the two proofs pass.
5. Complete focused verification and Technical Lead Review.

### Validation Bias

- Keep request validation compact and direct; do not create broad validation matrices.
- Prefer service-level helpers for audit transitions so controller code remains thin.
- Treat socket online checks as preflight only; the pending timeout remains the delivery safety net.
- Keep all command execution semantics on Edge out of this Cloud slice.
- Keep command audit separate from telemetry and reported UI state.

## Acceptance Checks

- A trusted `USER` can POST a valid `set_bool` or `set_number` command and receive the terminal Edge result through the same HTTP request.
- Happy path proof shows `execute_command` delivery to the active trusted Edge socket and `CommandAudit` lifecycle `accepted -> sent_to_edge -> confirmed`.
- Timeout proof shows HTTP `504`, `failureReason: "cloud_rpc_timeout"`, pending cleanup, and late Edge response unable to overwrite terminal audit status.
- Non-trusted users cannot command an Edge they are not assigned to.
- `CommandAudit` has a unique `requestId` index and TTL retention.
- OpenAPI documents the endpoint and lint passes.
- No task implements Edge execution, Client UI, Presence Lock, Redis, queue broker, retry, or multi-instance coordination.
- Dashboard command-status broadcast remains optional and audit/status-only; it does not drive telemetry or reported UI state.

## Manual and Runtime Smoke

Manual smoke SHOULD use a synthetic trusted `/edge` socket because Edge-side command execution is out of scope for this slice.

From `cloud_server`, after implementation:

```powershell
cmd /c npm run typecheck
cmd /c npm run test -- tests/integration/commands.rpc.test.ts
cmd /c npx @redocly/cli lint openapi.yaml
```

Runtime smoke SHOULD verify:

- A trusted USER token can call `POST /api/edge-servers/:edgeId/commands`.
- The connected test Edge socket receives `execute_command` with the generated `requestId`.
- A synthetic trusted `command_result` returns HTTP `200`.
- `CommandAudit` stores `accepted`, `sent_to_edge`, and terminal `confirmed` evidence for the request.
- A no-response smoke returns HTTP `504` and leaves late `command_result` unable to change the terminal audit row.

## Technical Lead Review

### Review Scope

Review the task plan and implementation for Cloud-only boundaries, endpoint correctness, audit persistence, socket trust, timeout/result races, cleanup, OpenAPI coverage, and lean proof volume.

### Review Checklist

- Verify scope did not expand into Edge-side execution, Modbus, Client UI, command journal UI, alarms, Presence Lock, Redis, broker, retry, or multi-instance coordination.
- Verify the implemented route is `POST /api/edge-servers/:edgeId/commands`.
- Verify JWT, `USER` role, and trusted `EdgeServer.trustedUsers` access are enforced before command routing.
- Verify `CommandAudit` includes `requestId`, `edgeId`, `deviceId`, `commandType`, `payload`, `requestedBy`, `requestedAt`, `status`, `completedAt`, and `failureReason`.
- Verify `requestId` has a unique index and audit retention has a TTL index.
- Verify the active socket helper returns only a currently trusted socket for the requested `edgeId`.
- Verify `execute_command` is emitted only after the selected socket is re-checked.
- Verify `sent_to_edge` is not treated as confirmation.
- Verify timeout starts after `sent_to_edge`.
- Verify `cloud_rpc_timeout` and `edge_command_timeout` remain distinct.
- Verify terminal audit update is atomic and conditional on a non-terminal current status.
- Verify late, duplicate, unknown, or mismatched `command_result` events cannot overwrite terminal audit state.
- Verify pending registry entries, listeners, and timers are cleaned up on success, failure, and timeout.
- Verify any optional backend command-status event is audit/status-only and does not mutate reported UI state.
- Verify Dashboard command-status broadcast did not become a required task for this Cloud RPC and audit slice.
- Verify OpenAPI documents success, auth failure, access failure, validation failure, rate limit, unavailable Edge, Edge failure, and timeout responses.
- Verify tests remain limited to the happy path and one critical timeout/late-response negative proof.

## Review Trigger

Review this plan when command routes, command status vocabulary, `/edge` socket registration, `CommandAudit` retention, OpenAPI response mapping, or Cloud deployment topology changes.
