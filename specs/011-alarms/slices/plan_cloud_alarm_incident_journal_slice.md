# Tasks: Cloud Alarm Incident Journal Slice

**Input**: `doc_cursed/alarms_plan.md`, `doc_cursed/monitoring_plan.md`, completed Edge alarm detection slice, existing Cloud `/edge` Socket.IO runtime path, existing Dashboard subscribe rooms, existing Cloud command RPC/audit route patterns, Cloud OpenAPI, Dashboard runtime socket types.

**Prerequisites**: Existing persistent Edge runtime authentication, trusted `/edge` Socket.IO sessions, Dashboard subscription by `edgeId`, `EdgeServer.trustedUsers`, Cloud Express auth/RBAC middleware, MongoDB/Mongoose integration tests, and completed Edge alarm detection event emission plan.

**Tests**: Lean Testing Policy applies. Add one compact integration proof for `active -> duplicate active -> clear` through the trusted `/edge` socket path and one compact ACK proof through the real HTTP route. Do not add broad table-driven validation tests for every malformed alarm field.

**Organization**: Tasks are grouped as setup, foundational Cloud incident infrastructure, two independently testable user stories, and polish/review. This document intentionally does not include implementation batches.

## Purpose

This slice MUST establish the Cloud-owned alarm incident journal for MVP alarm handling.

Cloud MUST accept trusted Edge alarm transition events, persist incident lifecycle state, expose ACK behavior through REST, and broadcast incident changes to subscribed Dashboard clients.

This slice MUST NOT move alarm diagnosis into Cloud. Edge remains the MVP owner of alarm rule evaluation and transition detection.

## Scope

- MUST add Cloud-side handling for trusted Edge `alarm_event` payloads.
- MUST validate incoming `alarm_event` payloads before persistence.
- MUST persist alarm incidents in a Cloud-owned journal.
- MUST store the rule snapshot received from Edge, including `ruleId`, `ruleRevision`, `conditionType`, `triggerThreshold`, `clearThreshold`, `expectedValue`, `severity`, and `label`.
- MUST define reusable incident identity as the latest incident for `edgeId + ruleId + deviceId + metric` that is not fully closed: `isActive=true OR isAcknowledged=false`.
- MUST create a new incident for `eventType: "active"` when no reusable incident exists.
- MUST update or reopen the reusable incident for repeated `eventType: "active"` events instead of creating duplicates.
- MUST update the matching reusable incident for `eventType: "clear"` with `isActive=false` and `clearedAt`.
- MUST safely ignore and log `eventType: "clear"` when no matching reusable incident exists.
- MUST add a Cloud ACK REST endpoint for authorized trusted users.
- MUST broadcast incident changes to subscribed clients through the existing `edgeId` room.
- MUST update Cloud API documentation, including `cloud_server/openapi.yaml` for the ACK REST endpoint.
- SHOULD add Client-side Dashboard runtime types for the incident realtime payload shape.
- SHOULD preserve model fields and non-TTL indexes needed for future incident journal filtering by `edgeId`, period, `severity`, and closure state.
- MUST add lean automated proof for the main incident lifecycle.

## Out Of Scope

- MUST NOT implement Edge-side alarm detection.
- MUST NOT implement Edge YAML alarm rule parsing.
- MUST NOT implement Client incident journal UI.
- MUST NOT implement Client ACK button UI.
- MUST NOT implement Constructor alarm authoring.
- MUST NOT implement alarm rule authoring in Cloud.
- MUST NOT make Client evaluate alarm rules.
- MUST NOT change telemetry payload semantics.
- MUST NOT add broad historical reporting, pagination-heavy journal UI, analytics, alarm filtering UX, or a full incident list API in this slice.
- MUST NOT add multi-instance queue or broker coordination unless the existing Cloud architecture already requires it.

## Constraints

- MUST treat `doc_cursed/alarms_plan.md` as the source of truth for alarm ownership, lifecycle semantics, and journal retention.
- MUST keep the alarm journal without TTL.
- MUST NOT copy the 30-day `CommandAudit` TTL policy to alarm incidents.
- MUST add no TTL index to the alarm incident collection.
- SHOULD add non-TTL indexes that support reusable incident lookup and future incident journal queries.
- MUST trust alarm events only from authenticated trusted Edge runtime sockets.
- MUST keep REST logic and WebSocket logic isolated, while allowing them to share service-layer incident persistence and broadcast helpers.
- MUST keep Cloud as the incident journal and ACK owner.
- MUST keep Edge as the alarm diagnosis owner.
- MUST keep Client as display and ACK initiation only.
- MUST NOT let Client read Edge YAML or infer alarm state from telemetry labels.
- MUST NOT introduce `window.*` or `global.*` state.
- MUST preserve existing telemetry, command RPC, capabilities catalog, and subscribe behavior.
- MUST apply Lean Testing Policy: automated proof MUST cover the main happy path and at most one critical negative scenario for the main risk; tests MUST NOT expand into broad table-driven validation matrices for every malformed payload field.
- SHOULD use duplicate `active` suppression as the critical negative automated proof because duplicate incident creation is the main lifecycle risk.

## Assumptions

- `specs/011-alarms` is the accepted planning bucket for alarm slices.
- `alarm_event` remains the incoming Edge event name from the completed Edge alarm detection slice.
- `sourceId` is persisted as incident context, but reusable incident identity is `edgeId + ruleId + deviceId + metric` to match `doc_cursed/alarms_plan.md`.
- The ACK endpoint is implemented in this Cloud slice before Client journal UI work.
- `clear` without a reusable incident is not an error that should create data. It is ignored and logged.
- A `clear` event with a different `ruleRevision` SHOULD still clear by identity for MVP, with optional diagnostic logging.
- Realtime incident broadcast does not require Client UI changes in this slice.
- The MVP Cloud deployment is process-local for Socket.IO routing; multi-instance broadcast coordination is out of scope.
- Future full journal querying is expected to need server-side pagination and filters by `edgeId`, time period, `severity`, and closure state, but that list API and Client UI are out of scope for this slice.

## Incident Lifecycle Rules

- MUST keep `isActive` and `isAcknowledged` as independent lifecycle flags.
- MUST treat an incident as fully closed only when `!isActive && isAcknowledged`.
- MUST keep a fully closed incident historical. A later `active` event for the same `edgeId + ruleId + deviceId + metric` SHOULD create a new incident.
- MUST treat `severity` as rule importance, not incident lifecycle state.
- MUST let repeated `active` set `isActive=true` on the reusable incident without changing ACK state.
- MUST let repeated `active` reopen a reusable incident that is `isActive=false && isAcknowledged=false` instead of creating a duplicate.
- MUST let automatic clear change only `isActive`, `clearedAt`, and latest observation fields.
- MUST NOT let automatic clear acknowledge an incident.
- MUST let ACK change only `isAcknowledged`, `acknowledgedAt`, and `acknowledgedBy`.
- MUST NOT let ACK clear an active incident.
- MAY make ACK idempotent when the incident is already acknowledged.
- MUST NOT let repeated ACK rewrite unrelated lifecycle, rule snapshot, severity, or observation fields.
- MUST match `clear` by `edgeId + ruleId + deviceId + metric`.
- MUST persist `ruleRevision` in the rule snapshot.
- MUST NOT require `ruleRevision` equality to clear an MVP incident.
- MAY log a diagnostic when a `clear` event has a different `ruleRevision` from the currently stored snapshot.
- MUST store Edge-provided `ts` and `detectedAt` as event context.
- MUST use Cloud server time for Cloud persistence timestamps such as `createdAt`, `updatedAt`, `activatedAt` fallback, `clearedAt` fallback, and `acknowledgedAt`.

## Proposed Contracts

### Incoming Edge Event

The incoming Edge-to-Cloud event name MUST be `alarm_event`.

The payload MUST contain:

| Field | Rule |
| --- | --- |
| `edgeId` | MUST match the authenticated trusted Edge socket identity. |
| `eventType` | MUST be `active` or `clear`. |
| `sourceId` | MUST identify the Edge-local normalized source used for diagnosis. |
| `deviceId` | MUST identify the normalized device. |
| `metric` | MUST identify the normalized metric. |
| `value` | MUST contain the observed value that caused the transition. |
| `ts` | MUST contain the reading timestamp from Edge. |
| `detectedAt` | MUST contain the Edge detection timestamp. |
| `rule` | MUST contain the persisted rule snapshot. |

The nested `rule` object MUST include `ruleId`, `ruleRevision`, `conditionType`, `triggerThreshold`, `clearThreshold`, `expectedValue`, `severity`, and `label`.

### Realtime Broadcast

Cloud SHOULD broadcast incident changes with the event name `alarm_incident_changed`.

The broadcast payload MUST include `edgeId`, the changed incident projection, and enough lifecycle fields for Dashboard clients to render current incident state without evaluating alarm rules.

### ACK REST Endpoint

The ACK route MUST be:

```http
POST /api/edge-servers/:edgeId/alarm-incidents/:incidentId/ack
```

The endpoint MUST require JWT auth, `requireRole('USER')`, trusted access to the selected `edgeId`, and incident ownership by that `edgeId`.

## Format: `[ID] [P?] [Story] Description`

- `[P]` means the task can run in parallel because it touches different files and does not depend on incomplete tasks.
- `[US1]` maps to the trusted Edge alarm event incident lifecycle story.
- `[US2]` maps to the authorized Cloud ACK story.
- Every task includes the file path that owns the change or proof.

## Phase 1: Setup

**Purpose**: Add stable Cloud alarm contract anchors before persistence and route wiring.

- [X] T001 Add alarm event names, incident lifecycle constants, condition/severity vocabularies, incoming payload DTOs, incident projection DTOs, and ACK response DTOs in `cloud_server/src/types/index.ts`
- [X] T002 [P] Add Dashboard runtime incident event types for `alarm_incident_changed` without UI behavior in `client/src/features/dashboard/model/types.ts`
- [X] T003 [P] Add Edge socket test helper functions for emitting `alarm_event` and waiting for `alarm_incident_changed` broadcasts in `cloud_server/tests/integration/edge-socket.helpers.ts`

**Checkpoint**: The slice has explicit contract names and test harness anchors without changing production behavior.

---

## Phase 2: Foundational Cloud Incident Infrastructure

**Purpose**: Build validation, model, and service primitives shared by socket and REST paths.

- [X] T004 Add `AlarmIncident` Mongoose model with lifecycle fields, identity fields, source context, observed value/timestamps, rule snapshot, ACK fields, timestamps, and no TTL index in `cloud_server/src/models/AlarmIncident.ts`
- [X] T005 Add non-TTL indexes for reusable incident lookup by `edgeId + ruleId + deviceId + metric + isActive/isAcknowledged + activatedAt`, duplicate-active race protection where safely supported by the model, and future journal filters by `edgeId`, `activatedAt`, `severity`, `isActive`, and `isAcknowledged` in `cloud_server/src/models/AlarmIncident.ts`
- [X] T006 Add compact `alarm_event` payload validation for identity fields, `active|clear`, value shape, timestamps, condition type, severity, and rule snapshot fields in `cloud_server/src/services/alarm-events.validation.ts`
- [X] T007 Add incident projection mapping that exposes lifecycle flags, timestamps, identity, source context, latest observation, and rule snapshot without leaking Mongoose internals in `cloud_server/src/services/alarm-incidents.service.ts`
- [X] T008 Add reusable incident lookup helper that finds the latest not-fully-closed incident for `edgeId + ruleId + deviceId + metric` in `cloud_server/src/services/alarm-incidents.service.ts`
- [X] T009 Add active event persistence helper that creates a new incident when no reusable incident exists, updates or reopens the reusable incident, preserves ACK state, uses Cloud server time for persistence timestamps, and uses an atomic lookup/update/create strategy or model-level guard so duplicate active events cannot create duplicate reusable incidents in `cloud_server/src/services/alarm-incidents.service.ts`
- [X] T010 Add clear event persistence helper that updates only `isActive`, `clearedAt`, latest observation fields, and optional diagnostic metadata while preserving ACK state and ignoring/logging missing reusable incidents in `cloud_server/src/services/alarm-incidents.service.ts`
- [X] T011 Add ACK persistence helper that validates incident ownership by `edgeId`, updates only `isAcknowledged`, `acknowledgedAt`, and `acknowledgedBy`, and treats repeated ACK as idempotent in `cloud_server/src/services/alarm-incidents.service.ts`
- [X] T012 [P] Add a narrow incident broadcast helper for `alarm_incident_changed` using the existing `io.to(edgeId)` room payload shape in `cloud_server/src/socket/events/alarm.ts`

**Checkpoint**: Cloud has a reusable incident journal service that can be called from both trusted socket events and REST ACK without mixing transport concerns into persistence.

---

## Phase 3: User Story 1 - Persist Trusted Edge Alarm Events (Priority: P1) MVP

**Goal**: A trusted Edge socket emits `alarm_event`; Cloud validates the payload, persists active/clear lifecycle changes, suppresses duplicate reusable incidents, and broadcasts incident updates to subscribed Dashboard clients.

**Independent Test**: Use the real integration server, a trusted Edge runtime socket, and a subscribed Dashboard socket. Emit `active`, duplicate `active`, and matching `clear`; assert one reusable incident, correct lifecycle transitions, unchanged ACK state, and realtime broadcasts on the `edgeId` room.

### Tests for User Story 1

- [X] T013 [US1] Add compact integration proof for trusted Edge `active -> duplicate active -> clear` plus `alarm_incident_changed` broadcasts and duplicate active suppression in `cloud_server/tests/integration/alarm-incidents.test.ts`

### Implementation for User Story 1

- [X] T014 [US1] Implement `registerAlarmEventHandler` to accept only trusted `/edge` sockets, validate `alarm_event`, call incident active/clear service helpers, and broadcast changed incident projections in `cloud_server/src/socket/events/alarm.ts`
- [X] T015 [US1] Register `registerAlarmEventHandler(socket, io, edgeId)` in the trusted Edge namespace connection path alongside telemetry, commands, and capabilities in `cloud_server/src/socket/events/edge.ts`
- [X] T016 [US1] Ensure invalid or untrusted `alarm_event` payloads are ignored with bounded logging and cannot persist incidents or broadcast changes in `cloud_server/src/socket/events/alarm.ts`
- [X] T017 [US1] Ensure `clear` with no reusable incident logs/ignores the event without creating an `AlarmIncident` record in `cloud_server/src/services/alarm-incidents.service.ts`
- [X] T018 [US1] Ensure `clear` matches by `edgeId + ruleId + deviceId + metric` and does not require `ruleRevision` equality, while optionally logging mismatch diagnostics in `cloud_server/src/services/alarm-incidents.service.ts`

**Checkpoint**: Cloud persists trusted Edge alarm lifecycle changes and broadcasts incident changes without requiring Client UI or Edge code changes.

---

## Phase 4: User Story 2 - ACK Alarm Incident Through Cloud REST (Priority: P1) MVP

**Goal**: A trusted USER can acknowledge an incident through Cloud REST, and Cloud updates only ACK fields, preserves active/clear lifecycle state, and broadcasts the updated incident state.

**Independent Test**: Seed an incident through the trusted `alarm_event` production path, call `POST /api/edge-servers/:edgeId/alarm-incidents/:incidentId/ack` as the trusted USER, and assert ACK-only mutation plus realtime broadcast.

### Tests for User Story 2

- [X] T019 [US2] Add compact integration proof for authorized USER ACK through the real HTTP route, asserting only ACK fields change and `alarm_incident_changed` broadcasts the updated projection in `cloud_server/tests/integration/alarm-incidents.test.ts`

### Implementation for User Story 2

- [X] T020 [US2] Add `AlarmIncidentsController.ackIncident` with request parsing, service delegation, and success/error response mapping in `cloud_server/src/api/alarm-incidents.controller.ts`
- [X] T021 [US2] Register `POST /api/edge-servers/:edgeId/alarm-incidents/:incidentId/ack` with `authMiddleware`, `requireRole('USER')`, and `AlarmIncidentsController.ackIncident` in `cloud_server/src/api/routes.ts`
- [X] T022 [US2] Add trusted USER access loading for ACK that validates `edgeId`, `incidentId`, `EdgeServer` existence, and `trustedUsers` membership before updating ACK fields, without requiring Active Edge lifecycle in `cloud_server/src/services/alarm-incidents.service.ts`
- [X] T023 [US2] Ensure ACK response returns the incident projection and maps missing incident, wrong edge, untrusted user, and invalid ids to existing HTTP error conventions in `cloud_server/src/api/alarm-incidents.controller.ts`
- [X] T024 [US2] Broadcast the ACK-updated incident projection through `alarm_incident_changed` after successful ACK without adding Client UI requirements in `cloud_server/src/api/alarm-incidents.controller.ts`
- [X] T025 [US2] Update `cloud_server/openapi.yaml` with the ACK endpoint, path parameters, auth requirements, success schema, incident projection schema, and expected `400`, `401`, `403`, `404`, and `409` responses

**Checkpoint**: Cloud-owned ACK works through the REST boundary and does not mutate active/clear lifecycle fields.

---

## Phase 5: Contract Alignment, Verification, and Review

**Purpose**: Verify the narrow Cloud incident slice, OpenAPI contract, Client type alignment, and Lean Testing boundaries without expanding into journal UI or list APIs.

- [X] T026 Add optional `onAlarmIncidentChanged` callback parsing for `alarm_incident_changed` in `client/src/features/dashboard/services/cloudRuntimeClient.ts`, wired only to the typed runtime client contract and without rendering incident UI
- [X] T027 [P] Inspect `cloud_server/src/models/AlarmIncident.ts` and verify it has no TTL index and does have non-TTL reusable lookup/query-support indexes
- [X] T028 [P] Inspect `cloud_server/tests/integration/alarm-incidents.test.ts` and remove any broad malformed-payload table-driven validation matrix that exceeds Lean Testing Policy
- [X] T029 Run Cloud typecheck with `cmd /c npm run typecheck` from `cloud_server`
- [X] T030 Run focused Cloud alarm incident integration tests with `cmd /c npm run test -- tests/integration/alarm-incidents.test.ts` from `cloud_server`
- [X] T031 Run focused Edge socket regression tests with `cmd /c npm run test -- tests/integration/edge-socket-auth.test.ts` from `cloud_server`
- [X] T032 Run OpenAPI lint with `cmd /c npx @redocly/cli lint openapi.yaml` from `cloud_server`
- [X] T033 Run Client typecheck or build with `cmd /c npm run build` from `client` if Dashboard runtime types or client socket parsing changed
- [X] T034 Add manual runtime smoke notes for operator-observable behavior that can be checked by hand: trusted Edge `active`, duplicate `active`, `clear`, authorized ACK, realtime `alarm_incident_changed` broadcasts to a subscribed Dashboard socket, and absence of Client incident UI requirements in `specs/011-alarms/slices/plan_cloud_alarm_incident_journal_slice.md`
- [X] T035 Add automated/code proof notes for behavior that should be verified by code or inspection: no TTL index, non-TTL reusable lookup/query indexes, duplicate active suppression, ACK-only mutation, clear without `ruleRevision` equality, OpenAPI ACK contract, and Lean Testing proof boundaries in `specs/011-alarms/slices/plan_cloud_alarm_incident_journal_slice.md`
- [X] T036 Complete Technical Lead Review for Cloud/Edge/Client boundaries, contract drift, reusable incident races, ACK-only mutation, no TTL, index support, realtime routing, OpenAPI coverage, and Lean Testing Policy in `specs/011-alarms/slices/plan_cloud_alarm_incident_journal_slice.md`

---

## Dependencies and Execution Order

### Phase Dependencies

- Phase 1 has no production dependency and establishes shared contract names.
- Phase 2 depends on Phase 1 Cloud types and blocks both user stories.
- Phase 3 depends on Phase 2 validation, model, service, and broadcast helpers.
- Phase 4 depends on Phase 2 service helpers and should be verified after an incident can exist through Phase 3.
- Phase 5 depends on Phases 3 and 4 implementation and proofs.

### Task Dependencies

- T004 depends on T001 because the model should use the shared incident vocabulary.
- T005 depends on T004.
- T006 depends on T001.
- T007 through T011 depend on T004 and T001.
- T012 depends on T001 and T007.
- T013 depends on T003, T004-T012, and enough socket registration to observe broadcasts.
- T014 depends on T006, T009, T010, and T012.
- T015 depends on T014.
- T016 depends on T014.
- T017 and T018 depend on T010.
- T019 depends on T013 and the agreed ACK route shape; it MAY be drafted before T020-T024 but passes only after route/service/broadcast wiring is complete.
- T020 depends on T011 and T012.
- T021 depends on T020.
- T022 depends on T011 and the existing `EdgeServer.trustedUsers` access model.
- T023 depends on T020 and T022.
- T024 depends on T012 and T020.
- T025 depends on the final route and response mapping from T020-T024.
- T026 depends on T002 and the finalized realtime payload shape.
- T027-T036 depend on implementation completion.

## Parallel Opportunities

- T002 and T003 can run in parallel with T001 because they touch Client types and test helpers.
- T006 and T012 can run in parallel after T001 because validation and broadcast helpers are separate files.
- T007 and T008 can run in parallel after T004 if service ownership is coordinated carefully.
- T020 and T025 can begin in parallel once the ACK route shape is fixed, but T025 must be finalized after response mapping is stable.
- T027 and T028 can run in parallel with verification commands after implementation is complete.
- T029-T033 can run in parallel after the implementation is complete, subject to local tool/runtime constraints.

## Parallel Example: User Story 1

```text
Task: "Add compact integration proof for trusted Edge `active -> duplicate active -> clear` plus `alarm_incident_changed` broadcasts and duplicate active suppression in `cloud_server/tests/integration/alarm-incidents.test.ts`"
Task: "Implement `registerAlarmEventHandler` to accept only trusted `/edge` sockets, validate `alarm_event`, call incident active/clear service helpers, and broadcast changed incident projections in `cloud_server/src/socket/events/alarm.ts`"
```

## Implementation Strategy

### MVP First

1. Complete Phase 1 to anchor contracts and test helpers.
2. Complete Phase 2 to add the no-TTL incident model, validation, service helpers, and broadcast helper.
3. Complete Phase 3 so trusted Edge alarm events can create, update, clear, and broadcast incidents.
4. Complete Phase 4 so USER ACK works through REST and broadcasts updated incident state.
5. Complete Phase 5 verification and Technical Lead Review.

### Validation Bias

- Prefer compact direct validation functions for the incoming event payload instead of broad schema frameworks or exhaustive validation matrices.
- Treat invalid `alarm_event` payloads as ignored socket events with bounded logs, not as reasons to mutate trust state.
- Keep Cloud incident persistence in `cloud_server/src/services/alarm-incidents.service.ts`, not in socket or controller handlers.
- Keep socket handlers responsible for trust, event parsing, and broadcast triggering only.
- Keep the REST ACK controller thin: request parsing, service call, response mapping.
- Keep Client changes limited to types and optional runtime parsing; do not build journal UI or ACK controls in this slice.

## Acceptance Checks

- A trusted Edge socket can emit a valid `active alarm_event`, and Cloud persists one incident with `isActive=true`, `isAcknowledged=false`, correct identity, rule snapshot, `activatedAt`, observed value, and timestamps.
- A repeated `active alarm_event` for the same reusable identity updates or reopens the same incident and does not create a duplicate reusable incident.
- A repeated `active alarm_event` does not change `isAcknowledged`.
- A matching `clear alarm_event` updates the same reusable incident with `isActive=false` and `clearedAt` without changing `isAcknowledged`.
- A `clear alarm_event` with no reusable incident creates no incident and is safely logged or ignored.
- A `clear alarm_event` with a different `ruleRevision` does not leave the incident active only because the revision changed.
- An authorized trusted USER can ACK an incident through `POST /api/edge-servers/:edgeId/alarm-incidents/:incidentId/ack`.
- ACK updates only `isAcknowledged=true`, `acknowledgedAt`, and `acknowledgedBy`.
- ACK does not change `isActive`, `clearedAt`, `severity`, rule snapshot, or observed alarm value fields.
- Repeated ACK is safe and does not rewrite unrelated incident fields.
- A fully closed incident remains historical, and a later `active alarm_event` for the same identity creates a new incident.
- Incident create, clear, reopen/update, and ACK changes are broadcast to subscribed clients through the `edgeId` room.
- A USER who is not trusted for the selected `edgeId` cannot ACK that Edge Server's incidents.
- The alarm incident collection has no TTL index.
- The alarm incident collection keeps non-TTL indexes or equivalent query support for reusable incident lookup and future journal filtering.
- Focused automated proof covers active creation, clear same-incident update, ACK-only update, and duplicate active suppression.

## Manual and Runtime Smoke

Manual smoke SHOULD use a trusted synthetic Edge socket and a subscribed Dashboard socket because Edge-side alarm detection and Client journal UI are out of scope for this slice.

### Smoke Notes - 2026-05-09

Manual live smoke status: `NOT RUN`. This slice did not run a separate operator/browser/hardware smoke pass.

Runtime-equivalent automated proof was collected through the focused integration server path in `cloud_server/tests/integration/alarm-incidents.test.ts`.

- Automated PASS: Trusted `/edge` socket `alarm_event` with `eventType: "active"` persisted one Cloud-owned `AlarmIncident` with `isActive=true`, `isAcknowledged=false`, expected identity fields, rule snapshot, and latest observation fields.
- Automated PASS: A mismatched `payload.edgeId` was ignored and created no incident or Dashboard broadcast.
- Automated PASS: Duplicate `active` for the same `edgeId + ruleId + deviceId + metric` reused the same incident id, updated latest observation fields, and did not create a duplicate reusable incident.
- Automated PASS: Matching `clear` reused the same incident, set `isActive=false`, set `clearedAt`, preserved ACK fields, and did not require matching `ruleRevision`.
- Automated PASS: Authorized trusted USER ACK through `POST /api/edge-servers/:edgeId/alarm-incidents/:incidentId/ack` updated only ACK fields while preserving active state, clear state, identity, latest observation, and rule snapshot fields.
- Automated PASS: Untrusted USER ACK returned `403`, emitted no `alarm_incident_changed`, and left ACK fields unset.
- Automated PASS: `alarm_incident_changed` broadcasts were observed by the subscribed Dashboard socket for active, duplicate active, clear, and ACK changes through the `edgeId` room.
- Automated PASS: Client-side scope remains contract-only: Dashboard runtime types and optional socket parsing exist, but no Client incident journal UI or ACK button UI is required by this slice.
- Automated PASS: No full incident list, pagination, filtering, historical reporting API, Edge YAML parsing, Cloud rule evaluation, or telemetry-derived Client alarm logic was introduced for this slice.

Remaining manual risk: a live operator/browser/hardware smoke pass still needs to verify the same lifecycle through a running Cloud instance and subscribed Dashboard socket if manual evidence is required.

Validation evidence:

- `cmd /c npm run test -- tests/integration/alarm-incidents.test.ts` from `cloud_server`: PASS, 1 file and 2 tests.
- `cmd /c npm run typecheck` from `cloud_server`: PASS.
- `cmd /c npx @redocly/cli lint openapi.yaml` from `cloud_server`: PASS; one existing warning remains for the local development server URL.
- `cmd /c npm run build` from `client`: PASS.

1. Start Cloud locally and create an admin, a USER, an Active Edge Server, and a trusted USER assignment.
2. Connect a Dashboard socket as the trusted USER and subscribe to the selected `edgeId`.
3. Connect a trusted `/edge` runtime socket for the same `edgeId`.
4. Emit a valid `alarm_event` with `eventType: "active"` and confirm one `AlarmIncident` is created with `isActive=true` and `isAcknowledged=false`.
5. Emit the same `active` event again and confirm no duplicate reusable incident is created.
6. Emit a matching `alarm_event` with `eventType: "clear"` and confirm the same incident changes to `isActive=false` without ACK fields changing.
7. Call `POST /api/edge-servers/:edgeId/alarm-incidents/:incidentId/ack` with the trusted USER token and confirm only ACK fields change.
8. Confirm each create/update/clear/ACK change emits `alarm_incident_changed` to the subscribed Dashboard socket.
9. Inspect the `AlarmIncident` indexes and confirm no TTL index exists.

Do not count smoke as successful if Cloud computes alarm rules, Client reads Edge YAML, Client derives alarms from telemetry, Edge owns ACK state, a full incident list UI/API is required, or a duplicate active creates another reusable incident.

### Automated and Code Proof Notes - 2026-05-09

- No TTL: `cloud_server/src/models/AlarmIncident.ts` defines timestamps and three explicit indexes, none with `expireAfterSeconds`; this preserves the alarm journal without TTL.
- Index support: `alarm_incident_reusable_lookup` supports reusable incident lookup; `alarm_incident_unique_active_identity` protects against concurrent active duplicates; `alarm_incident_journal_filters` supports future filtering by `edgeId`, `activatedAt`, severity, and lifecycle flags without adding the future list API.
- Duplicate active suppression: `persistActiveAlarmIncident` first updates the latest reusable incident where `isActive=true OR isAcknowledged=false`; create races fall back through duplicate-key handling and the partial active identity guard.
- Clear semantics: `persistClearAlarmIncident` matches by `edgeId + ruleId + deviceId + metric`, does not compare `ruleRevision`, and only sets latest observation fields, `isActive=false`, and `clearedAt`.
- ACK-only mutation: `acknowledgeAlarmIncident` updates only `isAcknowledged`, `acknowledgedAt`, and `acknowledgedBy`; repeated ACK returns the owned incident without rewriting unrelated fields.
- Trust boundary: `registerAlarmEventHandler` runs only on the trusted `/edge` namespace path and validates that `payload.edgeId` matches the authenticated Edge socket identity before persistence.
- Realtime routing: `emitAlarmIncidentChanged` emits `alarm_incident_changed` through `io.to(edgeId)` and does not modify telemetry, command RPC, capabilities, or subscribe behavior.
- REST boundary: `AlarmIncidentsController.ackIncident` delegates ownership and trust checks to the service, then broadcasts the projected incident after successful ACK.
- OpenAPI: `cloud_server/openapi.yaml` documents only the ACK route and incident projection schemas for this slice; no incident list, pagination, filtering, or reporting endpoint was added.
- Lean Testing: `cloud_server/tests/integration/alarm-incidents.test.ts` contains one active/duplicate/clear lifecycle proof and one ACK proof; it does not add a broad malformed-payload validation matrix.

## Technical Lead Review

Review this plan and implementation for Cloud-only incident journal ownership, Edge-only alarm diagnosis, Client display-only boundaries, `doc_cursed` alignment, reusable incident lookup races, ACK-only mutation, no TTL retention, future query index support, realtime room routing, OpenAPI coverage, and Lean Testing discipline.

### Review Checklist

- [X] Verify scope did not expand into Edge alarm detection, Edge YAML parsing, Client incident UI, Client ACK button UI, Constructor authoring, Cloud alarm rule authoring, telemetry semantics, full journal list API, or pagination/filtering UX.
- [X] Verify `doc_cursed/alarms_plan.md` remains the source of truth for lifecycle flags, severity semantics, Cloud journal ownership, ACK ownership, and no TTL retention.
- [X] Verify `alarm_event` is accepted only from authenticated trusted `/edge` sockets.
- [X] Verify the handler rejects mismatched `payload.edgeId` and authenticated socket `edgeId`.
- [X] Verify validation is compact but sufficient to protect persistence and contract semantics.
- [X] Verify the model has no TTL index.
- [X] Verify indexes support reusable lookup and future journal filters without implementing the future list API.
- [X] Verify reusable incident lookup uses the latest incident for `edgeId + ruleId + deviceId + metric` where `isActive=true OR isAcknowledged=false`.
- [X] Verify repeated `active` updates or reopens the reusable incident without changing ACK state or creating duplicates.
- [X] Verify fully closed incidents remain historical and later active events create a new incident.
- [X] Verify `clear` updates only active lifecycle and latest observation fields.
- [X] Verify `clear` does not require `ruleRevision` equality and does not leave incidents active after rule revision changes.
- [X] Verify ACK updates only `isAcknowledged`, `acknowledgedAt`, and `acknowledgedBy`.
- [X] Verify repeated ACK is idempotent or at least safe and does not rewrite unrelated fields.
- [X] Verify Cloud stores Edge timestamps as event context and uses server time for Cloud persistence timestamps.
- [X] Verify `alarm_incident_changed` broadcasts use `io.to(edgeId)` and do not alter telemetry, command RPC, capabilities, or subscribe behavior.
- [X] Verify OpenAPI documents the ACK endpoint and lint passes.
- [X] Verify OpenAPI does not add a full incident list, pagination, filtering, or reporting endpoint in this slice.
- [X] Verify Client changes, if any, are limited to contract types or optional socket parsing without UI.
- [X] Verify automated proof remains lean: one active/duplicate/clear lifecycle proof and one ACK-only proof, without broad malformed-payload matrices.

Technical Lead Review completed on 2026-05-09. Evidence reviewed: `cloud_server/src/models/AlarmIncident.ts`, `cloud_server/src/services/alarm-incidents.service.ts`, `cloud_server/src/services/alarm-events.validation.ts`, `cloud_server/src/socket/events/alarm.ts`, `cloud_server/src/socket/events/edge.ts`, `cloud_server/src/api/alarm-incidents.controller.ts`, `cloud_server/src/api/routes.ts`, `cloud_server/openapi.yaml`, `cloud_server/tests/integration/alarm-incidents.test.ts`, `client/src/features/dashboard/model/types.ts`, and `client/src/features/dashboard/services/cloudRuntimeClient.ts`.

## Review Trigger

Review this plan when the Edge `alarm_event` contract changes, alarm retention policy changes, `doc_cursed/alarms_plan.md` changes, `doc_cursed/monitoring_plan.md` changes, Dashboard incident UI enters scope, incident list API enters scope, or Cloud Socket.IO deployment topology changes.
