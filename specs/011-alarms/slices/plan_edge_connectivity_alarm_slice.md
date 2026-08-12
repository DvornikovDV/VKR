# Tasks: Edge Connectivity Alarm Slice

**Input**: `doc_cursed/alarms_plan.md`, `doc/slices.md`, completed Edge alarm config/detection plans, completed Cloud alarm incident journal plan, completed Client alarm journal/red-light plans, existing Cloud `/edge` Socket.IO lifecycle, existing Cloud alarm incident model/service/ACK route, existing Dashboard alarm projection parser.

**Prerequisites**: Existing trusted `/edge` runtime authentication, active trusted Edge socket tracking, ordinary offline transition through `markEdgeOffline`, existing `AlarmIncident` model, existing `persistActiveAlarmIncident` / `persistClearAlarmIncident`, existing `findReusableAlarmIncident`, existing `alarm_incident_changed` broadcast helper, existing Client support for `conditionType: connectivity`.

**Tests**: Lean Testing Policy applies. Add one focused Cloud integration proof for initial trusted connect no-op, ordinary trusted disconnect activating one connectivity incident, ACK while active, trusted reconnect clearing the same incident, and ACK staying independent. Add at most one critical negative proof for forced/admin disconnect exclusion. Do not add broad Socket.IO lifecycle matrices, malformed alarm payload matrices, or Client UI test expansion.

**Organization**: Tasks are grouped as setup, foundational Cloud helper work, one independently testable connectivity lifecycle story, forced/admin exclusion proof, and polish/review. This document intentionally does not include implementation batches.

## Purpose

This slice MUST make Cloud create and clear a system alarm incident when the trusted `/edge` Socket.IO lifecycle proves that an Edge runtime is disconnected or reconnected.

This slice MUST preserve the existing alarm architecture:

- Edge MUST remain the diagnosis owner for ordinary telemetry alarm rules.
- Cloud MUST remain the incident journal, lifecycle flag, ACK, and realtime projection owner.
- Client MUST remain a display and ACK-initiation layer.

## Scope

- MUST plan Cloud-observed connectivity as a special system alarm over the `/edge` Socket.IO lifecycle.
- MUST activate or update a connectivity incident when Cloud observes the selected Edge as disconnected/offline through the ordinary runtime disconnect path.
- MUST clear the connectivity incident when Cloud observes a trusted reconnect for the same `edgeId`.
- MUST keep ACK independent from active/clear lifecycle.
- MUST broadcast connectivity incident changes through existing `alarm_incident_changed` room routing.
- MUST preserve existing Dashboard journal and red-light behavior by emitting the existing incident projection shape.
- MUST define the contract boundary so this slice does not contradict Edge ownership of ordinary telemetry alarms.

## Out Of Scope

- MUST NOT change Edge reading-driven alarm detection behavior.
- MUST NOT require Edge to decide whether Cloud currently considers it offline.
- MUST NOT implement alarm rule authoring or Constructor UI.
- MUST NOT implement a new Client alarm UI unless a small type/parser adjustment is strictly required.
- MUST NOT add a full incident list endpoint, pagination, reporting, analytics, or historical alarm search.
- MUST NOT change normal telemetry payload semantics.
- MUST NOT treat forced administrative disconnect, credential rotation, or blocked-edge flows as connectivity alarm activation in MVP.
- MUST NOT add multi-instance Socket.IO or broker coordination in this slice unless existing Cloud architecture already requires it.

## Constraints

- MUST apply Lean Testing Policy: automated proof MUST cover the main happy path and at most one critical negative scenario for the main risk; tests MUST NOT expand into broad Socket.IO lifecycle matrices, malformed-payload matrices, or Client UI matrices.
- MUST keep test code smaller than production code for this slice.
- MUST keep complex lifecycle edge cases in manual/runtime smoke unless they are the main risk.
- MUST NOT weaken the trusted Edge `alarm_event` validation contract to support Cloud-generated system events.
- MUST create connectivity incidents through a narrow Cloud-only helper.
- MUST reuse the existing Cloud incident persistence, projection, ACK, and `alarm_incident_changed` broadcast behavior where possible.
- MUST keep alarm incidents as non-TTL journal records.
- MUST keep `isActive` and `isAcknowledged` independent.
- MUST treat a closed incident as `!isActive && isAcknowledged`.
- MUST NOT let ACK clear an active incident.
- MUST NOT let trusted reconnect acknowledge a cleared incident.
- MUST NOT make Client read Edge YAML, infer alarms from telemetry, or infer alarms from widget labels.
- MUST NOT move `high`, `low`, or `state` telemetry alarm evaluation from Edge to Cloud.
- MUST re-check that no active trusted socket remains before activating a connectivity incident after asynchronous offline work completes.
- MUST keep Socket.IO broadcasting in the socket/event layer; a Cloud service helper MUST persist and return a projected incident or `null`, not emit realtime events directly.

## Assumptions

- Connectivity incident SHOULD be created through a Cloud-only helper, not through public `validateAlarmEventPayload`, to avoid mixing the trusted Edge telemetry alarm contract with a Cloud system event.
- Synthetic identity is assumed to be stable and explicitly system-owned until code review finds an existing convention:
  - `ruleId: system.edge_connectivity`
  - `ruleRevision: mvp-1`
  - `sourceId: system`
  - `deviceId: edge`
  - `metric: connectivity`
  - `conditionType: connectivity`
  - `value: false` for disconnected
  - `value: true` for connected
- Connectivity alarm SHOULD activate only on the ordinary runtime disconnect/offline path in `cloud_server/src/socket/events/edge.ts`, where `shouldSkipOfflineTransition(socket)` is `false`.
- Forced admin disconnect, credential rotation, and blocked-edge flows SHOULD be excluded from connectivity alarm activation for MVP, even if they continue to update `availability.online=false` and emit `edge_status`.
- Connectivity severity SHOULD be `danger` for MVP because loss of the trusted Edge runtime makes current runtime visibility unreliable.
- `triggerThreshold`, `clearThreshold`, and `expectedValue` SHOULD be `null` for the connectivity rule snapshot.
- Existing Client incident projection parsing already accepts `conditionType: connectivity`; Client changes SHOULD be avoided unless implementation finds a real parser or type mismatch.

## Runtime Flow

1. A trusted Edge connects to Cloud `/edge`.
2. Cloud authenticates the runtime socket and promotes it to the active trusted Edge session.
3. Cloud clears any reusable connectivity incident for that `edgeId` immediately after successful trusted promotion.
4. Failed promotion, rejected duplicate sockets, and pending authenticated sockets that never become active do not clear connectivity incidents.
5. Later, the trusted Edge socket disconnects.
6. Cloud removes the socket from active and pending registries.
7. If no active trusted socket remains and `shouldSkipOfflineTransition(socket)` is `false`, Cloud marks the Edge offline through the existing availability path.
8. After asynchronous offline work completes, Cloud re-checks that no active trusted socket exists for the same `edgeId`.
9. Cloud activates or updates the reusable connectivity incident only when the re-check still proves offline.
10. Cloud broadcasts the changed incident projection with `alarm_incident_changed` to the existing `edgeId` room.
11. Existing Dashboard journal and red-light logic displays the connectivity incident from the projection.
12. User ACK uses the existing ACK REST route and changes only `isAcknowledged`.
13. A later trusted reconnect clears only `isActive`.

## Proposed System Contract

The Cloud-only helper MUST construct the following system incident event shape internally:

| Field | Value |
| --- | --- |
| `rule.ruleId` | `system.edge_connectivity` |
| `rule.ruleRevision` | `mvp-1` |
| `sourceId` | `system` |
| `deviceId` | `edge` |
| `metric` | `connectivity` |
| `rule.conditionType` | `connectivity` |
| `rule.triggerThreshold` | `null` |
| `rule.clearThreshold` | `null` |
| `rule.expectedValue` | `null` |
| `rule.severity` | `danger` |
| `rule.label` | `Edge connectivity lost` or an equivalent stable operator label |
| `value` on active | `false` |
| `value` on clear | `true` |

## Acceptance Checks

- A trusted Edge initial connect with no reusable connectivity incident MUST NOT create a cleared-only incident.
- A trusted Edge ordinary disconnect that makes Cloud consider the Edge offline MUST create or reactivate exactly one connectivity incident.
- A repeated ordinary disconnect/offline handling for the same `edgeId` MUST NOT create duplicate reusable connectivity incidents.
- A trusted reconnect for the same `edgeId` MUST clear the reusable connectivity incident by setting `isActive=false`.
- A trusted reconnect when no reusable connectivity incident exists MUST NOT create a cleared incident.
- Failed promotion or rejected duplicate active socket attempts MUST NOT clear the connectivity incident.
- A stale asynchronous offline continuation that completes after a trusted reconnect MUST NOT reactivate the connectivity incident.
- ACK before reconnect MUST remain acknowledged after reconnect; reconnect MUST NOT reset `isAcknowledged`.
- ACK after reconnect MUST close the cleared incident as `!isActive && isAcknowledged`.
- Forced admin disconnect, credential rotation, and blocked-edge flows MUST NOT activate connectivity alarms in MVP.
- Connectivity active and clear changes MUST broadcast `alarm_incident_changed` through the existing `edgeId` room.
- Existing Client journal and red-light behavior MUST remain compatible with the connectivity incident projection.
- Existing trusted Edge telemetry `alarm_event` active/clear handling MUST remain unchanged.
- No Edge runtime connectivity evaluation MUST be introduced.

## Format: `[ID] [P?] [Story?] Description`

- `[P]` means the task can run in parallel because it touches different files and does not depend on incomplete tasks.
- `[US1]` maps to the ordinary trusted disconnect/reconnect connectivity incident lifecycle story.
- `[US2]` maps to forced/admin disconnect exclusion and lifecycle boundary protection.
- Every task includes the file path that owns the change or proof.

## Phase 1: Setup

**Purpose**: Add stable Cloud connectivity alarm anchors and integration-test harness support before production lifecycle wiring.

- [X] T001 Add Cloud system connectivity alarm constants, synthetic identity values, and exported helper input types in `cloud_server/src/services/connectivity-alarm.service.ts`
- [X] T002 [P] Add or extend Edge socket integration helper utilities for waiting on `edge_status`, waiting on `alarm_incident_changed`, and querying connectivity incident records by the system identity in `cloud_server/tests/integration/edge-socket.helpers.ts`

**Checkpoint**: The slice has stable system identity anchors and test harness support without changing production `/edge` lifecycle behavior.

---

## Phase 2: Foundational Cloud Connectivity Helper

**Purpose**: Build Cloud-only system incident construction and persistence without Socket.IO broadcast coupling.

- [X] T003 Implement `buildConnectivityAlarmEvent(edgeId, eventType, observedAt)` or equivalent helper that returns an internal `AlarmEventPayloadDto` with the stable system identity and `value=false` for active / `value=true` for clear in `cloud_server/src/services/connectivity-alarm.service.ts`
- [X] T004 Implement `activateConnectivityAlarmIncident(edgeId, observedAt)` that delegates to `persistActiveAlarmIncident`, returns `projectAlarmIncident(incident)` or `null`, and does not import Socket.IO in `cloud_server/src/services/connectivity-alarm.service.ts`
- [X] T005 Implement `clearConnectivityAlarmIncident(edgeId, observedAt)` that first checks `findReusableAlarmIncident` for the system identity, returns `null` without logging when no reusable incident exists, delegates to `persistClearAlarmIncident` only when reusable exists, and does not create cleared-only records in `cloud_server/src/services/connectivity-alarm.service.ts`
- [X] T006 Ensure the connectivity helper uses Cloud server time for `ts`, `detectedAt`, and persistence context consistently with existing alarm incident service behavior in `cloud_server/src/services/connectivity-alarm.service.ts`

**Checkpoint**: Cloud can construct active/clear connectivity system events and reuse existing incident lifecycle persistence without exposing a new public Edge event contract.

---

## Phase 3: User Story 1 - Ordinary Trusted Disconnect Activates And Reconnect Clears (Priority: P1) MVP

**Goal**: When Cloud observes an ordinary trusted Edge runtime disconnect that leaves no active trusted socket, it creates or reactivates one connectivity incident; when the same Edge reconnects through a trusted socket, Cloud clears the same incident without changing ACK state.

**Independent Test**: Use the real Cloud integration server, a trusted Edge socket, a subscribed Dashboard socket, and existing ACK route. Initial trusted connect must not create a cleared-only incident. Ordinary disconnect activates one incident and broadcasts it. ACK while active changes only ACK fields. Trusted reconnect clears the same incident, preserving ACK, so the incident becomes closed. A repeated ordinary disconnect/reconnect cycle must not create a second reusable incident while the incident is not fully closed.

### Tests for User Story 1

- [X] T007 [US1] Add focused integration proof for initial trusted connect no-op, ordinary trusted disconnect activating one connectivity incident, `alarm_incident_changed` active broadcast, ACK while active, trusted reconnect clearing the same incident into closed state, and ACK-only independence in `cloud_server/tests/integration/edge-socket-lifecycle.test.ts`
- [X] T008 [US1] Include duplicate suppression in the same focused proof by running a repeated ordinary disconnect/reconnect cycle for the same `edgeId` and asserting reusable connectivity incident count does not exceed one while the incident is not fully closed in `cloud_server/tests/integration/edge-socket-lifecycle.test.ts`

### Implementation for User Story 1

- [X] T009 [US1] Import the connectivity helper and existing `emitAlarmIncidentChanged` broadcast helper into the trusted `/edge` namespace lifecycle owner in `cloud_server/src/socket/events/edge.ts`
- [X] T010 [US1] Call `clearConnectivityAlarmIncident(edgeId, new Date())` only after `promoteAuthenticatedEdgeSocket(edgeId, socket)` succeeds, then broadcast the returned projection through `emitAlarmIncidentChanged` when non-null in `cloud_server/src/socket/events/edge.ts`
- [X] T011 [US1] Ensure failed promotion and duplicate active socket rejection return before any connectivity clear call can run in `cloud_server/src/socket/events/edge.ts`
- [X] T012 [US1] Call `activateConnectivityAlarmIncident(edgeId, observedAt)` only in the ordinary last-trusted-socket disconnect path where `getActiveEdgeSocketCount(edgeId) === 0` and `shouldSkipOfflineTransition(socket)` is `false` in `cloud_server/src/socket/events/edge.ts`
- [X] T013 [US1] After `markEdgeOffline(edgeId)` completes, re-check `getActiveEdgeSocketCount(edgeId) === 0` before activating or broadcasting the connectivity incident so stale offline continuations cannot override a trusted reconnect in `cloud_server/src/socket/events/edge.ts`
- [X] T014 [US1] Preserve existing `edge_status` offline broadcast semantics while adding connectivity incident activation, including `lastSeenAt` behavior from `markEdgeOffline`, in `cloud_server/src/socket/events/edge.ts`
- [X] T015 [US1] Preserve the existing telemetry-driven `edge_status online=true` notification timing when adding trusted reconnect connectivity clear behavior in `cloud_server/src/socket/events/edge.ts`

**Checkpoint**: The ordinary trusted runtime lifecycle now drives one Cloud-owned connectivity incident without changing telemetry alarm event handling.

---

## Phase 4: User Story 2 - Exclude Forced/Admin Disconnects From Connectivity Alarm Activation (Priority: P1) MVP

**Goal**: Forced administrative disconnect, credential rotation, and blocked-edge flows continue to update availability and emit `edge_status`, but do not activate connectivity alarms in MVP.

**Independent Test**: Use one existing forced/admin lifecycle integration path, such as credential rotation or block, and assert that no connectivity incident is created while existing forced disconnect and `edge_status` expectations still pass.

### Tests for User Story 2

- [X] T016 [US2] Add the single critical negative proof that credential rotation or blocked-edge forced disconnect emits the existing forced lifecycle behavior but creates no connectivity incident in `cloud_server/tests/integration/edge-socket-lifecycle.test.ts`

### Implementation for User Story 2

- [X] T017 [US2] Verify `disconnectEdgeSockets(edgeId, reason)` continues to set `skipOfflineTransition` before forced socket disconnect and does not call connectivity alarm activation in `cloud_server/src/socket/events/edge.ts`
- [X] T018 [US2] Verify `disconnectEdgeSocketsById(edgeId, reason)` continues to own forced availability updates and `edge_status` emission without invoking the connectivity alarm helper in `cloud_server/src/socket/io.ts`
- [X] T019 [US2] Keep credential rotation and blocked-edge controller flows using `disconnectEdgeSocketsById` without adding direct connectivity alarm calls in `cloud_server/src/api/edge-servers.controller.ts`

**Checkpoint**: Administrative lifecycle operations remain separate from runtime connectivity alarm activation.

---

## Phase 5: Contract Alignment, Verification, And Review

**Purpose**: Verify Cloud/Edge/Client boundaries, lean proof, and no contract drift.

- [X] T020 Inspect `cloud_server/src/services/alarm-events.validation.ts` and verify public trusted Edge `alarm_event` validation was not weakened for Cloud-generated connectivity events
- [X] T021 Inspect `cloud_server/src/models/AlarmIncident.ts` and verify `connectivity` remains accepted, no TTL index was added, and reusable identity still applies to `edgeId + ruleId + deviceId + metric`
- [X] T022 Inspect `client/src/shared/api/alarmIncidents.ts`, `client/src/features/dashboard/services/cloudRuntimeClient.ts`, and `client/src/features/dashboard/model/alarmIncidents.ts` to verify existing Client projection parsing and lifecycle derivation remain compatible with connectivity incidents without Client diagnosis logic
- [X] T023 Inspect `edge_server/go_core/internal/runtime/alarm_detector.go` and verify no Edge runtime `connectivity` evaluation was introduced for this Cloud-observed system alarm slice
- [X] T024 Run focused Cloud lifecycle integration tests with `cmd /c npm run test -- tests/integration/edge-socket-lifecycle.test.ts` from `cloud_server`, covering `cloud_server/tests/integration/edge-socket-lifecycle.test.ts`
- [X] T025 Run focused Cloud alarm incident regression tests with `cmd /c npm run test -- tests/integration/alarm-incidents.test.ts` from `cloud_server`, covering `cloud_server/tests/integration/alarm-incidents.test.ts`
- [X] T026 Run Cloud typecheck with `cmd /c npm run typecheck` from `cloud_server`, covering `cloud_server/src/services/connectivity-alarm.service.ts` and touched socket files
- [X] T027 Run Client build or focused Client alarm parsing tests only if Client type/parser files changed; otherwise record that no Client verification command is required in `specs/011-alarms/slices/plan_edge_connectivity_alarm_slice.md`
- [X] T028 Add manual/runtime smoke notes for ordinary Edge disconnect activation, trusted reconnect clear, ACK before/after reconnect, forced/admin disconnect exclusion, and stale offline reconnect race in `specs/011-alarms/slices/plan_edge_connectivity_alarm_slice.md`
- [X] T029 Add automated/code proof notes for stable system identity, no public `alarm_event` validation weakening, service/socket boundary, async offline re-check, no duplicate reusable incident, and no Edge/Client diagnosis changes in `specs/011-alarms/slices/plan_edge_connectivity_alarm_slice.md`
- [X] T030 Complete Technical Lead Review for scope leakage, Cloud/Edge/Client boundaries, `doc_cursed` alignment, contract drift, stale offline races, ACK independence, forced/admin exclusions, proof sufficiency, and Lean Testing Policy in `specs/011-alarms/slices/plan_edge_connectivity_alarm_slice.md`

---

## T020-T023 Boundary Verification Notes

- T020: `cloud_server/src/services/alarm-events.validation.ts` still validates public trusted Edge `alarm_event` payloads against the authenticated `edgeId`, requires the payload `edgeId` to match, and keeps rule snapshot validation on the shared alarm condition enum. No Cloud-only connectivity bypass was added to the public Edge event validator.
- T021: `cloud_server/src/models/AlarmIncident.ts` still stores `rule.conditionType` through `ALARM_CONDITION_TYPES`, so `connectivity` remains accepted. The model has no TTL or `expireAfterSeconds` index, and reusable/active identity indexes still use `edgeId + ruleId + deviceId + metric`.
- T022: Client alarm incident types and Dashboard socket parsing already accept `conditionType: connectivity`, boolean `latestValue`, nullable thresholds, and nullable `expectedValue`. Dashboard lifecycle/red-light derivation remains based only on incident projection flags (`isActive`, `isAcknowledged`) and does not infer alarms from telemetry, Edge YAML, widget labels, or local diagnosis.
- T023: `edge_server/go_core/internal/runtime/alarm_detector.go` still evaluates only `high`, `low`, and `state` rule types in the runtime detector. Other condition types, including `connectivity`, fall through without emission, so Edge runtime connectivity evaluation was not introduced.

Validation:

- `cloud_server`: `cmd /c npm run test -- tests/unit/alarm-events.validation.test.ts tests/unit/alarm-incident.model.test.ts` passed, covering public alarm event validation and incident model/index contract checks.
- `client`: `cmd /c npm run test -- tests/unit/alarmIncidentsContracts.test.ts` passed, covering Client alarm incident contract and projection helpers.
- `edge_server/go_core`: `go test ./internal/runtime -run Alarm -count=1` passed, covering Edge alarm detector behavior.
- `cloud_server`: `cmd /c npm run test -- tests/integration/edge-socket-lifecycle.test.ts` passed, covering trusted connect no-op, ordinary disconnect activation, reconnect clear, ACK independence, duplicate suppression, stale offline continuation, and forced rotate/block exclusions.
- `cloud_server`: `cmd /c npm run test -- tests/integration/alarm-incidents.test.ts` passed, covering incident active/duplicate/clear regression and ACK-only mutation.
- `cloud_server`: `cmd /c npm run typecheck` passed, covering TypeScript compatibility for the Cloud connectivity helper and socket integration surface.
- `client`: no Client verification command was required for T027 because this batch did not change Client type/parser files; T022 remains the compatibility proof for existing alarm incident projection parsing and lifecycle derivation.
- `cloud_server`: `cmd /c npm run test -- tests/integration/edge-socket-lifecycle.test.ts` was re-run on 2026-05-10 for T028-T029 and passed with 3 tests, reconfirming the runtime lifecycle proof before recording this evidence.

## T028 Manual And Runtime Smoke Notes

Manual live smoke status: not run in this batch. The batch used the real Cloud integration server with trusted synthetic `/edge` and Dashboard Socket.IO clients as runtime smoke coverage; no physical Edge runtime or browser Dashboard session was started.

Runtime smoke evidence from `cloud_server/tests/integration/edge-socket-lifecycle.test.ts`:

- Ordinary trusted disconnect activation: covered by closing the trusted Edge socket, observing `edge_status` with `online=false`, receiving `alarm_incident_changed`, and asserting one active connectivity incident with `ruleId: system.edge_connectivity`, `conditionType: connectivity`, `isActive=true`, `isAcknowledged=false`, and `latestValue=false`.
- Trusted reconnect clear: covered by reconnecting the same `edgeId`, asserting no reconnect-time `edge_status` regression, receiving `alarm_incident_changed`, and verifying the same incident becomes `isActive=false` with `latestValue=true`.
- ACK before reconnect: covered by ACKing the active incident through the existing REST route and verifying the incident remains active while `isAcknowledged=true`.
- ACK after reconnect / closed semantics: covered by reconnect clear after ACK and verifying the same incident becomes `!isActive && isAcknowledged` with lifecycle state `closed`.
- Forced/admin disconnect exclusion: covered by credential rotation and blocked-edge flows preserving forced disconnect plus `edge_status` behavior while asserting no connectivity incident record or broadcast is created for credential rotation.
- Stale offline reconnect race: covered by delaying `markEdgeOffline`, reconnecting before the asynchronous offline continuation resumes, and verifying no active connectivity broadcast or reactivation remains after the continuation completes.

Remaining manual risks:

- Physical Edge runtime behavior and a real browser Dashboard ACK flow were not manually smoke-tested in this batch.
- Multi-process or multi-instance Socket.IO coordination remains out of scope for this slice and is not covered by the integration runtime smoke.
- The block-flow test verifies forced disconnect and telemetry exclusion; credential rotation is the explicit negative proof that also asserts no connectivity incident broadcast/record.

## T029 Automated And Code Proof Notes

- Stable system identity: `cloud_server/src/services/connectivity-alarm.service.ts` centralizes `system.edge_connectivity`, `mvp-1`, `system`, `edge`, `connectivity`, `conditionType: connectivity`, nullable thresholds/expected value, `severity: danger`, and active/clear values `false`/`true`; `getConnectivityAlarmIdentity(edgeId)` uses the reusable identity fields consistently.
- No public `alarm_event` validation weakening: `cloud_server/src/services/alarm-events.validation.ts` still validates trusted Edge payloads against the authenticated `edgeId` and shared alarm rule snapshot constraints; Cloud connectivity incidents are built internally instead of bypassing `validateAlarmEventPayload`.
- Service/socket boundary: `connectivity-alarm.service.ts` imports incident persistence/projection helpers only and does not import Socket.IO; `cloud_server/src/socket/events/edge.ts` owns `emitAlarmIncidentChanged` broadcasts for returned projections.
- Clear placement and failed promotion safety: `cloud_server/src/socket/events/edge.ts` calls `clearConnectivityAlarmIncident` only after `promoteAuthenticatedEdgeSocket(edgeId, socket)` succeeds; duplicate active socket rejection returns before the clear call.
- Async offline re-check: ordinary disconnect activation runs after `markEdgeOffline(edgeId)` and re-checks `getActiveEdgeSocketCount(edgeId) === 0` before `activateConnectivityAlarmIncident`, preventing stale offline continuations from reactivating after trusted reconnect.
- Duplicate reusable incident proof: the lifecycle integration test repeats ordinary disconnect/reconnect for the same `edgeId` and asserts the connectivity incident count remains one while the reusable incident is not fully closed.
- Forced/admin boundary: `disconnectEdgeSockets` marks sockets with `skipOfflineTransition`, `disconnectEdgeSocketsById` owns forced availability and `edge_status` emission without connectivity helper calls, and credential rotation/block controller flows continue through `disconnectEdgeSocketsById`.
- No Edge/Client diagnosis changes: `edge_server/go_core/internal/runtime/alarm_detector.go` still evaluates only `high`, `low`, and `state`; Client alarm projection parsing and Dashboard red-light derivation remain projection-driven and accept `connectivity` without local diagnosis logic.

---

## Dependencies And Execution Order

### Phase Dependencies

- Phase 1 establishes constants, helper anchors, and test utilities.
- Phase 2 depends on Phase 1 constants and blocks production lifecycle wiring.
- Phase 3 depends on Phase 2 helper behavior and is the MVP behavior path.
- Phase 4 depends on Phase 3 wiring decisions and verifies forced/admin exclusions.
- Phase 5 depends on implementation completion and focused proof.

### Task Dependencies

- T003-T006 depend on T001.
- T007 and T008 depend on T002 and pass only after T009-T015 are implemented.
- T009 depends on T004, T005, and existing `emitAlarmIncidentChanged`.
- T010 depends on T009 and successful promotion placement in `cloud_server/src/socket/events/edge.ts`.
- T011 depends on T010 and promotion/rejection branch review.
- T012 depends on T009 and existing ordinary disconnect branch.
- T013 depends on T012 and the existing asynchronous `markEdgeOffline` continuation.
- T014 depends on T012 and existing `edge_status` behavior.
- T015 depends on T010 and existing telemetry-driven online status behavior.
- T016 depends on T002 and passes only after T017-T019 preserve forced/admin boundaries.
- T017-T019 depend on the final decision that forced/admin disconnects are excluded from connectivity alarm activation.
- T020-T030 depend on implementation completion.

## Parallel Opportunities

- T002 can run in parallel with T001 because it touches test helpers.
- T003 and T005 can be drafted in parallel after T001 if one owner keeps the shared constants stable.
- T020-T023 can run in parallel with verification commands after implementation is complete because they inspect different modules.
- T024 and T025 can run in parallel if local test tooling supports parallel Vitest execution without shared database/server conflicts; otherwise run sequentially.

T009-T015 SHOULD be sequenced by one owner because they all modify `cloud_server/src/socket/events/edge.ts`.
T017-T019 SHOULD be reviewed together because they define the forced/admin boundary across socket and controller paths.

## Parallel Example: Foundational Work

```text
Task: "Implement `activateConnectivityAlarmIncident(edgeId, observedAt)` that delegates to `persistActiveAlarmIncident`, returns `projectAlarmIncident(incident)` or `null`, and does not import Socket.IO in `cloud_server/src/services/connectivity-alarm.service.ts`"
Task: "Add or extend Edge socket integration helper utilities for waiting on `edge_status`, waiting on `alarm_incident_changed`, and querying connectivity incident records by the system identity in `cloud_server/tests/integration/edge-socket.helpers.ts`"
```

## Parallel Example: Review Work

```text
Task: "Inspect `client/src/shared/api/alarmIncidents.ts`, `client/src/features/dashboard/services/cloudRuntimeClient.ts`, and `client/src/features/dashboard/model/alarmIncidents.ts` to verify existing Client projection parsing and lifecycle derivation remain compatible with connectivity incidents without Client diagnosis logic"
Task: "Inspect `edge_server/go_core/internal/runtime/alarm_detector.go` and verify no Edge runtime `connectivity` evaluation was introduced for this Cloud-observed system alarm slice"
```

## Implementation Strategy

### MVP First

1. Complete Phase 1 to establish system identity and helper/test anchors.
2. Complete Phase 2 to make Cloud-only connectivity incident active/clear helpers real.
3. Complete Phase 3 to wire ordinary trusted disconnect/reconnect lifecycle into Cloud incident persistence and broadcast.
4. Complete Phase 4 to protect forced/admin lifecycle exclusions.
5. Complete Phase 5 verification and Technical Lead Review.

### Boundary Bias

- Prefer one narrow `connectivity-alarm.service.ts` helper over changing `validateAlarmEventPayload`.
- Keep service helpers transport-agnostic and let socket handlers own broadcasts.
- Keep ordinary telemetry alarm event handling unchanged.
- Keep trusted reconnect clear after successful socket promotion only.
- Keep offline activation behind a post-`markEdgeOffline` active-socket re-check.
- Keep Client changes out unless an actual parser/type incompatibility is found.
- Keep Edge changes out; Edge cannot reliably decide whether Cloud considers it offline.

## Manual And Runtime Smoke

Manual smoke SHOULD use a live Cloud server, a trusted Edge runtime socket or synthetic trusted test client, and a subscribed Dashboard socket.

1. Start Cloud and connect a Dashboard socket subscribed to the target `edgeId`.
2. Connect a trusted `/edge` runtime socket.
3. Confirm the initial connect does not create a cleared-only connectivity incident.
4. Disconnect the trusted Edge socket through an ordinary client/runtime disconnect.
5. Confirm Cloud emits `edge_status` with `online=false`.
6. Confirm Cloud creates or reactivates one connectivity incident with `ruleId: system.edge_connectivity`, `conditionType: connectivity`, `isActive=true`, `isAcknowledged=false`, and `latestValue=false`.
7. Confirm Cloud emits `alarm_incident_changed` for the active connectivity incident.
8. ACK the active incident and confirm it remains `isActive=true`.
9. Reconnect the trusted Edge socket for the same `edgeId`.
10. Confirm the same incident is cleared with `isActive=false`, `latestValue=true`, and preserved ACK fields.
11. Trigger credential rotation or block flow and confirm existing forced disconnect plus `edge_status` behavior still happens without creating a connectivity incident.
12. Simulate quick disconnect/reconnect timing and confirm stale offline continuation does not reactivate after trusted reconnect.

Do not count smoke as successful if Edge computes the connectivity alarm, Client derives it from telemetry, public `alarm_event` validation is weakened, forced/admin disconnect activates the incident, ACK clears active state, or reconnect acknowledges the incident.

## Technical Lead Review

Review this plan and implementation for Cloud-only system alarm ownership, Edge ordinary telemetry alarm ownership, Client projection-only behavior, `doc_cursed` lifecycle alignment, stable synthetic identity, service/socket boundary, stale offline race handling, forced/admin exclusion, duplicate reusable incident suppression, ACK independence, and Lean Testing discipline.

Review outcome for the T028-T029 batch: evidence was recorded, but T030 remained open until the full implementation review below.

### Review Evidence To Inspect

- `doc_cursed/alarms_plan.md`
- `cloud_server/src/services/connectivity-alarm.service.ts`
- `cloud_server/src/services/alarm-incidents.service.ts`
- `cloud_server/src/services/alarm-events.validation.ts`
- `cloud_server/src/models/AlarmIncident.ts`
- `cloud_server/src/socket/events/edge.ts`
- `cloud_server/src/socket/events/alarm.ts`
- `cloud_server/src/socket/io.ts`
- `cloud_server/src/api/edge-servers.controller.ts`
- `cloud_server/tests/integration/edge-socket-lifecycle.test.ts`
- `cloud_server/tests/integration/alarm-incidents.test.ts`
- `cloud_server/tests/integration/edge-socket.helpers.ts`
- `client/src/shared/api/alarmIncidents.ts`
- `client/src/features/dashboard/services/cloudRuntimeClient.ts`
- `client/src/features/dashboard/model/alarmIncidents.ts`
- `edge_server/go_core/internal/runtime/alarm_detector.go`

### Review Checklist

- [X] Verify scope did not expand into Edge runtime connectivity evaluation, telemetry alarm Cloud evaluation, Constructor UI, new Client UI, incident list API, pagination, reporting, analytics, or multi-instance Socket.IO coordination.
- [X] Verify `doc_cursed/alarms_plan.md` remains the source of truth for condition types, lifecycle flags, ACK independence, closed semantics, and no-TTL incident journal retention.
- [X] Verify connectivity incidents are created only through a Cloud-only helper and not through public `validateAlarmEventPayload`.
- [X] Verify the stable system identity is used consistently for active and clear.
- [X] Verify helper functions do not import Socket.IO or emit realtime events directly.
- [X] Verify `clearConnectivityAlarmIncident` returns `null` without creating a cleared-only record when no reusable connectivity incident exists.
- [X] Verify `cloud_server/src/socket/events/edge.ts` calls clear only after successful trusted promotion.
- [X] Verify failed promotion and duplicate active socket attempts cannot clear a connectivity incident.
- [X] Verify ordinary last trusted disconnect activates the incident only when `shouldSkipOfflineTransition(socket)` is `false`.
- [X] Verify async offline activation re-checks that no active trusted socket exists after `markEdgeOffline` completes.
- [X] Verify forced admin disconnect, credential rotation, and blocked-edge flows do not activate connectivity alarms.
- [X] Verify reconnect clear does not acknowledge incidents.
- [X] Verify ACK does not clear active incidents.
- [X] Verify repeated disconnect/offline handling does not create duplicate reusable connectivity incidents.
- [X] Verify existing Edge telemetry `alarm_event` handling remains unchanged.
- [X] Verify existing Client journal/red-light projection behavior remains compatible and does not infer alarms locally.
- [X] Verify automated proof remains lean: one main lifecycle path plus at most one critical negative proof.
- [X] Verify recorded validation outcomes cover focused Cloud lifecycle tests, Cloud alarm incident regression tests, Cloud typecheck, and any required Client or Edge compatibility proof.
- [X] Verify manual/runtime smoke is either recorded with live evidence or explicitly marked as not run with reason.

### Technical Lead Review Completion - 2026-05-10

Technical Lead Review result: PASS for T030, with no production-code correction required.

- Evidence inspected: `doc_cursed/alarms_plan.md`, `doc/slices.md`, the completed Edge alarm config/detection plans, the completed Cloud incident journal plan, the completed Client alarm journal/red-light plans, and every file listed in `Review Evidence To Inspect`.
- Scope control: no Edge runtime connectivity evaluation, Cloud telemetry alarm evaluation, Constructor UI, new Client UI, incident list API, pagination, reporting, analytics, hardcoded endpoint, secret, or multi-instance Socket.IO coordination was introduced by this slice.
- Cloud ownership: `connectivity-alarm.service.ts` is a narrow Cloud-only helper that builds the stable `system.edge_connectivity` identity, delegates to existing incident persistence/projection, and does not import Socket.IO. `edge.ts` owns the `alarm_incident_changed` broadcast after successful helper results.
- Public `alarm_event` contract: `alarm-events.validation.ts` and `socket/events/alarm.ts` still validate trusted Edge telemetry alarm events through the authenticated `edgeId`; Cloud-generated connectivity incidents do not weaken or reuse the public Edge payload validator.
- Lifecycle placement: `edge.ts` clears only after `promoteAuthenticatedEdgeSocket` succeeds, rejects failed/duplicate promotion before clear can run, activates only on ordinary last trusted disconnect when `shouldSkipOfflineTransition(socket)` is false, and re-checks active socket count after `markEdgeOffline`.
- Forced/admin exclusions: `disconnectEdgeSockets` marks forced sockets with `skipOfflineTransition`, `disconnectEdgeSocketsById` owns forced availability and `edge_status`, and credential rotation/block controller flows do not call the connectivity alarm helper directly.
- Incident semantics: `AlarmIncident` has no TTL index, accepts `connectivity`, and preserves reusable identity by `edgeId + ruleId + deviceId + metric`. ACK changes only acknowledgment fields; reconnect clear changes active state/latest observation without acknowledging.
- Edge and Client boundaries: `alarm_detector.go` still evaluates only `high`, `low`, and `state`; Client types/parser accept `connectivity`, boolean values, nullable thresholds, and lifecycle derivation remains projection-only from `isActive` and `isAcknowledged`.
- Proof sufficiency: automated proof remains lean. The main lifecycle integration test covers initial trusted connect no-op, ordinary disconnect activation, active broadcast, duplicate suppression, ACK while active, reconnect clear, ACK independence, and stale offline race handling. The single critical negative proof is credential rotation with no connectivity incident; the block-flow test still covers forced disconnect and telemetry exclusion.
- Validation rerun: `cmd /c npm run test -- tests/integration/edge-socket-lifecycle.test.ts` from `cloud_server` passed with 1 file and 3 tests; `cmd /c npm run test -- tests/integration/alarm-incidents.test.ts` from `cloud_server` passed with 1 file and 2 tests; `cmd /c npm run typecheck` from `cloud_server` passed; `cmd /c npm run test -- alarmIncidentsContracts` from `client` passed with 1 file and 4 tests; `go test ./internal/runtime -run Alarm -count=1` from `edge_server/go_core` passed.
- Review setup note: the prerequisite script was attempted exactly as requested by the quickcheck skill, but local PowerShell execution policy blocked it. This is not a T030 blocker because the batch explicitly allowed skipping the prerequisite check and the slice document provided the full scope.
- Remaining risk: physical Edge runtime behavior and a real browser Dashboard ACK/red-light session remain `NOT RUN`, as already recorded in T028 manual/runtime smoke notes. The current executable substitute is the real Cloud integration server with trusted synthetic `/edge` and Dashboard Socket.IO clients.

## Source Of Truth

- Alarm ownership and lifecycle semantics: `doc_cursed/alarms_plan.md`.
- Slice planning rules: `doc/slices.md`.
- Existing Edge alarm config/detection context: `specs/007-edge-server/slices/plan_edge_alarm_rules_slice.md`, `specs/007-edge-server/slices/plan_edge_alarm_detection_slice.md`.
- Existing Cloud incident context: `specs/011-alarms/slices/plan_cloud_alarm_incident_journal_slice.md`.
- Existing Client alarm projection context: `specs/011-alarms/slices/plan_client_alarm_journal_slice.md`, `specs/011-alarms/slices/plan_client_alarm_red_light_slice.md`.

## Review Trigger

Review this plan when `/edge` Socket.IO lifecycle semantics change, when Cloud alarm incident projection changes, when Client alarm projection parsing changes, when Edge starts reporting a distinct Cloud connectivity signal, or when `doc_cursed/alarms_plan.md` changes connectivity ownership.
