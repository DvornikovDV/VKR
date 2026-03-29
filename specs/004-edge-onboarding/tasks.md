# Tasks: Edge Server Onboarding Contract

**Input**: Design documents from `/specs/004-edge-onboarding/`  
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Tests**: Tests are required for this feature because the specification and plan explicitly call for backend integration/unit coverage, Socket.IO contract coverage, and client integration coverage.

**Organization**: Tasks are grouped by user story so each increment can be implemented and validated independently while preserving the shared onboarding contract across `cloud_server`, `client`, and `edge_server`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: User story label (`US1`, `US2`, `US3`)
- Every task includes exact file paths for direct execution

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Prepare feature-specific configuration and test scaffolding before lifecycle work starts.

- [X] T001 Add onboarding configuration knobs for package expiry, secret generation, and edge reconnect behavior in `cloud_server/src/config/env.ts`, `cloud_server/.env.example`, and `edge_server/src/config/env.ts`
- [X] T002 [P] Create backend onboarding test scaffolds for REST + Socket.IO flows in `cloud_server/tests/integration/edge-onboarding.test.ts` and `cloud_server/tests/unit/edge-onboarding.service.test.ts`
- [X] T003 [P] Create client and edge runtime support scaffolds for onboarding fixtures and credential persistence in `client/tests/mocks/handlers.ts`, `edge_server/src/onboarding/persistedCredentialStore.ts`, and `edge_server/src/transport/cloudSocketClient.ts`

**Checkpoint**: Feature-specific scaffolding is ready for domain implementation.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Build the lifecycle-aware backend, transport, and DTO foundations that all user stories depend on.

**CRITICAL**: No user story work should be considered complete until this phase is finished.

- [X] T004 Extend the canonical edge aggregate with lifecycle state, onboarding package metadata, persistent credential metadata, activation timestamps, and availability snapshot in `cloud_server/src/models/EdgeServer.ts`
- [X] T005 [P] Add the immutable onboarding audit model and event typing in `cloud_server/src/models/EdgeOnboardingAudit.ts`
- [X] T006 Implement credential generation, hashing, lifecycle transition helpers, and admin/user projection mappers in `cloud_server/src/services/edge-onboarding.service.ts` and `cloud_server/src/services/edge-servers.service.ts`
- [X] T007 [P] Add audit write/query helpers for registration, reset, activation, revoke, block, and re-enable events in `cloud_server/src/services/edge-onboarding-audit.service.ts`
- [X] T008 Wire lifecycle-aware REST routes and controller DTO handling for admin fleet, reset, revoke, block, and re-enable actions in `cloud_server/src/api/routes.ts`, `cloud_server/src/api/edge-servers.controller.ts`, and `cloud_server/src/api/admin.controller.ts`
- [X] T009 Rework the `/edge` namespace to authenticate with `handshake.auth`, track active edge sockets, and expose forced-disconnect hooks in `cloud_server/src/socket/events/edge.ts` and `cloud_server/src/socket/io.ts`
- [X] T010 [P] Update shared client and edge runtime transport primitives for lifecycle-aware payloads in `client/src/shared/api/edgeServers.ts`, `client/tests/mocks/handlers.ts`, `edge_server/src/onboarding/persistedCredentialStore.ts`, and `edge_server/src/transport/cloudSocketClient.ts`

**Checkpoint**: Lifecycle-aware storage, transport, and contract scaffolding are in place; story work can proceed in dependency order.

---

## Phase 3: User Story 1 - Register Edge And Issue First-Connection Package (Priority: P1) MVP

**Goal**: Allow Admins to register an edge, disclose a one-time onboarding package exactly once, and reset it safely when needed.

**Independent Test**: Register a new edge as an Admin, capture the issued package, reopen the edge record, verify lifecycle state plus package metadata remain visible while the full secret is hidden, then reset the package and confirm the previous secret is invalidated.

### Tests for User Story 1

- [X] T011 [P] [US1] Add backend integration coverage for registration, one-time disclosure, masked redisplay rules, and reset invalidation in `cloud_server/tests/integration/edge-onboarding.test.ts`
- [X] T012 [P] [US1] Add Admin Fleet client coverage for registration disclosure and onboarding reset flows in `client/tests/integration/AdminHubPages.test.tsx`

### Implementation for User Story 1

- [X] T013 [US1] Implement admin registration and onboarding reset flows with one-time secret disclosure and audit writes in `cloud_server/src/services/edge-onboarding.service.ts` and `cloud_server/src/api/edge-servers.controller.ts`
- [X] T014 [US1] Project masked onboarding package metadata for fleet reads in `cloud_server/src/services/edge-servers.service.ts` and `cloud_server/src/api/admin.controller.ts`
- [X] T015 [US1] Update lifecycle-aware edge API methods for registration and onboarding reset disclosures in `client/src/shared/api/edgeServers.ts`
- [X] T016 [US1] Update Admin Fleet registration UX to show lifecycle state, one-time disclosure, package metadata, and reset action without re-showing old secrets in `client/src/features/admin-hub/pages/EdgeFleetPage.tsx`

**Checkpoint**: Admin registration and package recovery flow work independently and preserve the one-time disclosure rule.

---

## Phase 4: User Story 2 - Complete First Connection And Establish Trust (Priority: P1)

**Goal**: Accept only a valid first activation, promote the edge to `Active`, and issue a persistent reconnect credential for later trusted sessions.

**Independent Test**: Connect a newly registered edge with a valid onboarding package, verify activation succeeds once, confirm reused/invalid/expired packages are rejected, and verify later reconnects succeed only with the persistent credential.

### Tests for User Story 2

- [X] T017 [P] [US2] Add Socket.IO integration coverage for onboarding success, package reuse rejection, invalid or expired package rejection, and persistent reconnect acceptance in `cloud_server/tests/integration/edge-onboarding.test.ts`
- [X] T018 [P] [US2] Add unit coverage for lifecycle transition, expiry evaluation, and persistent credential rotation helpers in `cloud_server/tests/unit/edge-onboarding.service.test.ts`

### Implementation for User Story 2

- [X] T019 [US2] Implement onboarding verification, package expiry and reuse checks, activation transition, and persistent credential rotation in `cloud_server/src/services/edge-onboarding.service.ts`
- [X] T020 [US2] Implement `/edge` handshake credential modes, normalized rejection codes, and `edge_activation` payload delivery in `cloud_server/src/socket/events/edge.ts` and `cloud_server/src/socket/io.ts`
- [X] T021 [US2] Implement edge runtime first-activation and reconnect credential persistence flow in `edge_server/src/onboarding/activateEdge.ts`, `edge_server/src/onboarding/persistedCredentialStore.ts`, and `edge_server/src/transport/cloudSocketClient.ts`
- [X] T022 [US2] Record activation success, activation rejection, and persistent credential issuance events in `cloud_server/src/models/EdgeOnboardingAudit.ts` and `cloud_server/src/services/edge-onboarding-audit.service.ts`

**Checkpoint**: First activation establishes trust exactly once and reconnects use only the rotated persistent credential path.

---

## Phase 5: User Story 3 - Use Canonical Onboarding States Across Product Surfaces (Priority: P2)

**Goal**: Keep Admin, user-facing readiness, and runtime behavior aligned on one lifecycle model where only `Active` edges are telemetry-ready.

**Independent Test**: Prepare edges in `Pending First Connection`, `Active`, `Re-onboarding Required`, and `Blocked`; verify Admin Fleet distinguishes lifecycle from availability, block/revoke actions disconnect trusted sessions, and shared edge-readiness payloads expose only `Active` edges as telemetry-ready for downstream consumers.

### Tests for User Story 3

- [X] T023 [P] [US3] Add backend integration coverage for trust revoke, block, re-enable, and `Active`-only telemetry-ready filtering in `cloud_server/tests/integration/edge-onboarding.test.ts` and `cloud_server/tests/integration/edge-servers.catalog.test.ts`
- [X] T024 [P] [US3] Add client integration coverage for lifecycle badges, recovery actions, and lifecycle-aware fleet payload consumption in `client/tests/integration/AdminHubPages.test.tsx`

### Implementation for User Story 3

- [X] T025 [US3] Implement trust revoke, block, re-enable, and forced-disconnect side effects in `cloud_server/src/services/edge-onboarding.service.ts`, `cloud_server/src/api/edge-servers.controller.ts`, and `cloud_server/src/socket/events/edge.ts`
- [X] T026 [US3] Implement lifecycle-aware admin fleet projections with separated availability and `isTelemetryReady` in `cloud_server/src/services/edge-servers.service.ts` and `cloud_server/src/api/admin.controller.ts`
- [X] T027 [US3] Restrict user-facing ready-edge queries to `Active` edges in `cloud_server/src/services/edge-servers.service.ts` and `cloud_server/src/api/edge-servers.controller.ts`
- [X] T028 [US3] Update Admin Fleet rendering and actions for lifecycle badges, recovery controls, block controls, and separate availability indicators in `client/src/features/admin-hub/pages/EdgeFleetPage.tsx`
- [ ] T029 [US3] Update shared client edge contracts to expose lifecycle, masked onboarding metadata, and telemetry-ready filtering semantics for downstream `002-frontend` and `003-dashboard` consumers in `client/src/shared/api/edgeServers.ts` and `client/src/shared/hooks/useEdgeStatus.ts`

**Checkpoint**: All product surfaces consume one lifecycle model and readiness stays gated by `Active` only.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final contract cleanup, validation, and security checks across all stories.

- [ ] T030 [P] Update shipped contract documents to match implementation details in `specs/004-edge-onboarding/contracts/openapi.yaml`, `specs/004-edge-onboarding/contracts/edge-socket-contract.md`, and `specs/004-edge-onboarding/contracts/lifecycle-state-machine.md`
- [ ] T031 [P] Run quickstart validation and OpenAPI lint from `specs/004-edge-onboarding/quickstart.md` and `specs/004-edge-onboarding/contracts/openapi.yaml`
- [ ] T032 Verify no plaintext secret persistence remains, explicitly fix lifecycle/legacy state desynchronization (`isActive`, `lastSeen`, `apiKeyHash` vs lifecycle fields), and remove legacy single-credential assumptions in `cloud_server/src/models/EdgeServer.ts`, `cloud_server/src/services/edge-servers.service.ts`, `cloud_server/src/services/users.service.ts`, `edge_server/src/onboarding/persistedCredentialStore.ts`, and `client/src/features/admin-hub/pages/EdgeFleetPage.tsx`
- [ ] T033 Add dedicated regression validation that lifecycle state and any retained legacy compatibility fields cannot diverge (including user stats readiness semantics) in `cloud_server/tests/integration/edge-onboarding.test.ts` and `cloud_server/tests/integration/users.profile.test.ts`

**Checkpoint**: Contracts, tests, and security expectations are aligned for release.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies; start immediately.
- **Phase 2 (Foundational)**: Depends on Phase 1 and blocks all user stories.
- **Phase 3 (US1)**: Depends on Phase 2; delivers the first usable MVP because the Admin package flow is independently testable.
- **Phase 4 (US2)**: Depends on Phase 3 because activation consumes the onboarding package issued by registration or reset.
- **Phase 5 (US3)**: Depends on Phases 3 and 4 because lifecycle projections and readiness filtering require both disclosure and trust-establishment paths.
- **Phase 6 (Polish)**: Depends on all targeted user stories being complete.

### User Story Dependencies

- **US1**: Starts first after Foundational and has no dependency on other user stories.
- **US2**: Requires US1 because valid onboarding packages must already exist before activation or reconnect flows can be exercised.
- **US3**: Requires US1 and US2 because lifecycle meaning across Admin and user surfaces depends on the complete registration, activation, revoke, and block contract.

### Within Each User Story

- Write the listed tests first and confirm they fail before implementing the story.
- Backend contract changes before client or edge runtime consumption.
- Projection and DTO work before UI rendering changes.
- Socket lifecycle changes before edge runtime reconnect logic.
- Finish the story checkpoint before moving to the next priority.

---

## Parallel Opportunities

- `T002` and `T003` can run together once configuration planning for `T001` is clear.
- `T005` and `T007` can run in parallel after `T004` defines the canonical aggregate shape.
- `T008` and `T010` can run in parallel once the credential-mode contract from `T006` is fixed.
- `T011` and `T012` can run in parallel for US1 because backend and client tests touch different files.
- `T017` and `T018` can run in parallel for US2 because integration and unit coverage are isolated.
- `T023` and `T024` can run in parallel for US3 because backend and client validations use separate test suites.
- `T030` and `T031` can run in parallel during polish after implementation stabilizes.

---

## Parallel Example: User Story 1

```text
T011 [US1] Add backend integration coverage in cloud_server/tests/integration/edge-onboarding.test.ts
T012 [US1] Add Admin Fleet client coverage in client/tests/integration/AdminHubPages.test.tsx
```

## Parallel Example: User Story 2

```text
T017 [US2] Add Socket.IO integration coverage in cloud_server/tests/integration/edge-onboarding.test.ts
T018 [US2] Add lifecycle helper unit coverage in cloud_server/tests/unit/edge-onboarding.service.test.ts
```

## Parallel Example: User Story 3

```text
T023 [US3] Add backend lifecycle-filtering coverage in cloud_server/tests/integration/edge-onboarding.test.ts and cloud_server/tests/integration/edge-servers.catalog.test.ts
T024 [US3] Add client lifecycle rendering coverage in client/tests/integration/AdminHubPages.test.tsx
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 and Phase 2.
2. Complete Phase 3 (`US1`).
3. Validate the one-time disclosure and reset flow independently.
4. Stop for review before moving into activation work.

### Incremental Delivery

1. Deliver `US1` to lock the Admin registration contract.
2. Deliver `US2` to complete trust establishment and reconnect behavior.
3. Deliver `US3` to align Admin, user readiness, and runtime lifecycle semantics.
4. Finish with contract sync, validation, and secret-handling hardening.

### Suggested MVP Scope

- `US1` only for the smallest independently demonstrable increment.
- Add `US2` next for the first end-to-end trusted activation.
- Add `US3` last for cross-surface lifecycle coherence.

---

## Notes

- Total stories covered: `US1`, `US2`, `US3`
- Total tasks: `33`
- Story task counts: `US1 = 6`, `US2 = 6`, `US3 = 7`
- All tasks follow the required checklist format: checkbox, task ID, optional `[P]`, required story label for story phases, and exact file paths
