# Tasks: Edge Alarm Detection Slice

**Input**: `doc_cursed/alarms_plan.md`, completed `specs/007-edge-server/slices/plan_edge_alarm_rules_slice.md`, `specs/007-edge-server/contracts/local-source-adapter.md`, `specs/007-edge-server/spec.md`, `specs/007-edge-server/plan.md`, `specs/007-edge-server/data-model.md`, `specs/007-edge-server/research.md`, `specs/007-edge-server/quickstart.md`, Edge runtime/source/cloud code.

**Prerequisites**: Root-level `config.Config.Alarms` and `config.AlarmRuleDefinition` already exist, config validation already supports `high`, `low`, `state`, and `connectivity`, and normalized readings already use `source.Reading` with `SourceID`, `DeviceID`, `Metric`, `Value`, and `TS`.

**Tests**: Lean Testing Policy applies. Add one compact happy path proof for `high` active/clear transition emission and at most one critical negative proof for duplicate suppression while already active or already clear. Do not add broad table-driven tests for every condition type, threshold branch, or validation branch.

**Organization**: Tasks are grouped as setup, foundational runtime/cloud infrastructure, one independently testable runtime story, and polish/review.

## Purpose

This slice MUST add Edge-side runtime alarm diagnosis over normalized readings.

The Edge runtime MUST evaluate configured alarm rules after source normalization, emit outbound alarm transition events to Cloud, and preserve normal telemetry batching behavior.

## Scope

This plan applies only to `edge_server`.

- MUST evaluate enabled alarm rules from root-level `config.Config.Alarms`.
- MUST match readings to alarm rules by normalized telemetry identity: `sourceId`, `deviceId`, and `metric`.
- MUST evaluate `high`, `low`, and `state` condition types for normalized reading values.
- MUST apply threshold hysteresis with inclusive comparisons.
- MUST maintain process-local per-rule runtime state.
- MUST emit an outbound alarm event only when a rule changes state.
- MUST emit `active` when a rule transitions from inactive to active.
- MUST emit `clear` when a rule transitions from active to inactive.
- MUST include a rule snapshot in every outbound event for future Cloud incident journal creation.
- MUST integrate detection after source reading normalization and before or alongside Cloud emission.
- MUST preserve the existing regular telemetry path and payload shape.
- MUST ignore alarm rules where `enabled` is not explicitly `true`.

## Out Of Scope

- MUST NOT implement Cloud incident persistence.
- MUST NOT implement Cloud incident uniqueness or update logic.
- MUST NOT implement ACK behavior.
- MUST NOT implement Dashboard or Client UI.
- MUST NOT implement Constructor alarm authoring.
- MUST NOT change the alarm YAML schema unless implementation discovers a required missing field.
- MUST NOT implement hardware-specific alarm behavior.
- MUST NOT rework telemetry batching beyond the minimum required to observe each normalized reading for alarm detection.
- MUST NOT implement runtime `connectivity` alarm evaluation in this slice because the runtime path is reading-driven.

## Constraints

- MUST treat `doc_cursed/alarms_plan.md` as the source of truth for MVP alarm ownership and semantics.
- MUST treat Edge as the alarm diagnosis owner for MVP.
- MUST treat Cloud as the incident journal owner.
- MUST NOT move Cloud incident lifecycle logic into Edge.
- MUST NOT make Client evaluate alarm rules.
- MUST NOT make Client read Edge YAML directly.
- MUST keep source adapter normalization and protocol concerns inside the existing source boundary.
- MUST keep alarm detection above normalized `source.Reading`; rules MUST NOT bind to Modbus register addresses.
- MUST preserve `sourceId` for alarm matching before regular telemetry removes it from the Cloud telemetry payload.
- MUST NOT attach a second independent consumer directly to `source.Manager.Readings()` if that can race the telemetry pipeline and drop readings from either path.
- MUST implement a safe fan-out or equivalent runtime integration so each normalized reading can reach both telemetry batching and alarm detection.
- MUST keep per-rule state process-local for this slice.
- MUST NOT persist alarm runtime state in Edge storage in this slice.
- MUST emit outbound alarm events only through the trusted runtime Cloud transport path.
- SHOULD avoid blocking source polling or telemetry batching indefinitely when outbound alarm event emission fails.
- MUST NOT reuse source `FaultSeverity` as alarm severity because source faults allow `error`, while alarm severity is `warning` or `danger`.
- MUST treat `severity` as rule importance, not as incident lifecycle state.
- MUST apply Lean Testing Policy: automated proof MUST cover one compact happy path and at most one critical negative scenario for duplicate suppression; tests MUST NOT expand into broad table-driven matrices for every validation or condition branch.
- MUST implement required runtime behavior even when automated proof remains lean.

## Assumptions

- The Cloud alarm event contract is missing; this plan defines `alarm_event` as a proposed Edge-to-Cloud event until the Cloud incident slice confirms or replaces it.
- `ruleRevision` is missing from YAML/config; this slice MUST derive a stable MVP revision from a deterministic hash of the rule snapshot without changing the YAML schema.
- The derived `ruleRevision` MUST be built from rule snapshot/config fields only and MUST NOT include runtime-only event fields such as `eventType`, `value`, `ts`, or `detectedAt`.
- Process-local alarm state is sufficient for MVP Edge detection; durable duplicate prevention belongs to the Cloud incident journal.
- After Edge restart, an already-violating condition MAY emit a new `active` event when the next reading arrives.
- `state` rule comparison uses exact equality for normalized boolean or numeric readings.
- Complex state values are outside runtime source values for this slice.
- Automated tests SHOULD focus on the `high` threshold transition path because it proves hysteresis and duplicate suppression.
- Alarm detection MAY evaluate readings while regular Cloud emission is not currently eligible, but outbound Cloud alarm emission MUST remain bound to trusted runtime Cloud transport behavior.

## Runtime Flow

The runtime flow MUST be:

1. A local adapter publishes a raw reading.
2. `source.Manager` normalizes and validates the reading as `source.Reading`.
3. The runtime delivers the normalized reading to the existing telemetry pipeline and to alarm detection without competing channel consumers.
4. Alarm detection finds enabled rules for `sourceId + deviceId + metric`.
5. Alarm detection evaluates each matching rule against the current per-rule state.
6. Alarm detection emits no event when the rule state is unchanged.
7. Alarm detection emits one outbound event when the rule transitions to `active`.
8. Alarm detection emits one outbound event when the rule transitions to `clear`.
9. Regular telemetry continues to emit `telemetry` batches through the existing Cloud path.

## Proposed Outbound Event Contract

The outbound event name MUST be `alarm_event` for this slice as a proposed contract until the Cloud incident slice confirms or replaces it.

The proposed payload MUST include:

| Field | Rule |
| --- | --- |
| `edgeId` | MUST identify the Edge runtime that diagnosed the alarm. |
| `eventType` | MUST be `active` or `clear`. |
| `sourceId` | MUST identify the local normalized source used for rule matching. |
| `deviceId` | MUST identify the normalized device. |
| `metric` | MUST identify the normalized metric. |
| `value` | MUST contain the observed reading value that caused the transition. |
| `ts` | MUST contain the reading timestamp that caused the transition. |
| `detectedAt` | MUST contain the Edge emission timestamp. |
| `rule` | MUST contain the rule snapshot fields needed by Cloud incident handling. |

The `rule` snapshot MUST include `ruleId`, `ruleRevision`, `conditionType`, `triggerThreshold`, `clearThreshold`, `expectedValue`, `severity`, and `label`.

## Acceptance Checks

- Given an enabled `high` alarm rule for `arduino_stand/environment/temperature` with `triggerThreshold: 30.0` and `clearThreshold: 28.0`, a reading below trigger MUST emit no alarm event.
- When a later reading reaches `30.0` or above, Edge MUST emit exactly one `active` alarm event.
- The `active` event MUST include `edgeId`, `sourceId`, `deviceId`, `metric`, observed value, reading timestamp, detected timestamp, and rule snapshot data.
- Repeated readings while the rule is already active MUST NOT emit duplicate `active` events.
- When a later reading reaches `28.0` or below, Edge MUST emit exactly one `clear` alarm event.
- The `clear` event MUST include the same rule identity and rule snapshot semantics as the `active` event.
- Repeated readings while the rule is already clear MUST NOT emit duplicate `clear` events.
- The same normalized reading MUST remain available to both regular telemetry batching and alarm detection.
- Existing regular telemetry batching MUST continue to emit `telemetry` payloads without adding `sourceId` to regular Cloud telemetry readings.
- Alarm detection MUST not require Cloud DB, Cloud incident journal mutation, Client UI, Constructor UI, or hardware-specific behavior.
- Focused Go tests MUST prove the main active/clear path and duplicate suppression risk without broad table-driven coverage.

## Format: `[ID] [P?] [Story] Description`

- `[P]` means the task can run in parallel because it touches different files and does not depend on incomplete tasks.
- `[US1]` maps to the single runtime alarm detection story.
- Every task includes the file path that owns the change or proof.
- This document intentionally does not include implementation batches.

## Phase 1: Setup

**Purpose**: Add explicit alarm event and detector anchors before changing runtime reading flow.

- [X] T001 Add proposed `alarm_event` event name, `active`/`clear` event type constants, alarm payload DTOs, and rule snapshot DTOs in `edge_server/go_core/internal/cloud/alarms.go`
- [X] T002 [P] Add runtime alarm detector skeleton, detector config, emitter interface, rule snapshot type, and process-local state map in `edge_server/go_core/internal/runtime/alarm_detector.go`
- [X] T003 [P] Add a reading fan-out or dispatcher skeleton that owns one source reading input and named downstream consumers in `edge_server/go_core/internal/runtime/reading_dispatcher.go`

**Checkpoint**: The slice has stable event, detector, and reading-dispatch anchors before behavior is wired into the production runtime.

---

## Phase 2: Foundational Alarm Runtime Infrastructure

**Purpose**: Implement reusable alarm evaluation and outbound event construction without Cloud incident journal behavior.

- [X] T004 Implement `alarm_event` payload construction, including `edgeId`, `eventType`, normalized reading identity, observed value, reading `ts`, `detectedAt`, and nested rule snapshot in `edge_server/go_core/internal/cloud/alarms.go`
- [X] T005 Implement deterministic `ruleRevision` derivation from rule snapshot/config fields only, excluding `eventType`, observed value, reading `ts`, and `detectedAt`, in `edge_server/go_core/internal/runtime/alarm_detector.go`
- [X] T006 Implement alarm rule indexing by `sourceId + deviceId + metric`, skipping rules whose `enabled` pointer is nil or not true, in `edge_server/go_core/internal/runtime/alarm_detector.go`
- [X] T007 Implement condition evaluation for `high`, `low`, and `state` over normalized `source.Reading` values with inclusive threshold comparisons and exact boolean/number state equality in `edge_server/go_core/internal/runtime/alarm_detector.go`
- [X] T008 Implement per-rule process-local transition tracking so unchanged inactive, unchanged active, and unsupported runtime value shapes emit no alarm event in `edge_server/go_core/internal/runtime/alarm_detector.go`
- [X] T009 Implement the Cloud-facing alarm emitter using the existing runtime transport `Emit` path without importing Cloud incident journal or persistence logic in `edge_server/go_core/internal/cloud/socketio_client.go`
- [X] T010 Update runtime reading dispatch so each `source.Reading` from the single source channel reaches both telemetry batching and optional alarm detection without competing channel consumers in `edge_server/go_core/internal/runtime/reading_dispatcher.go`
- [X] T011 Update `TelemetryPipeline` or its binding surface to accept readings from the runtime dispatcher without changing the regular telemetry payload shape in `edge_server/go_core/internal/runtime/telemetry_pipeline.go`
- [X] T012 Add runner-level binding and current accessor for the alarm detector or alarm reading consumer, including access to `StateSnapshot` so outbound `alarm_event` emission can follow trusted/connected runtime gating, in `edge_server/go_core/internal/runtime/runtime.go`
- [X] T013 Wire `runtimeapp.Process` to construct the alarm detector from `cfg.Alarms`, bind it to the configured `runtime.edgeId`, attach it to the same normalized reading flow as telemetry, and keep configs with no alarms on a no-op path in `edge_server/go_core/internal/runtimeapp/process.go`

**Checkpoint**: Alarm detection can be configured and wired to the runtime reading stream, but the user-story proof still owns final behavior validation.

---

## Phase 3: User Story 1 - Detect Alarm Transitions From Normalized Readings (Priority: P1) MVP

**Goal**: Edge evaluates enabled alarm rules from normalized readings and emits outbound `alarm_event` only on active or clear transitions while preserving regular telemetry batching.

**Independent Test**: Feed normalized readings for `arduino_stand/environment/temperature` through the runtime alarm detection path and assert one `active` event at `30.0` or above, no duplicate while still active, one `clear` event at `28.0` or below, and no duplicate while already clear.

### Tests for User Story 1

- [X] T014 [US1] Add compact happy path proof through the runtime reading dispatcher for a `high` rule crossing below trigger, then `30.0` or above, then `28.0` or below, asserting exactly one `active`, one `clear`, rule snapshot data, and the same normalized reading reaching a telemetry test sink in `edge_server/go_core/internal/runtime/alarm_detector_test.go`
- [X] T015 [US1] Add the critical negative duplicate-suppression proof for repeated readings while already active and already clear, asserting no duplicate outbound events in `edge_server/go_core/internal/runtime/alarm_detector_test.go`

### Implementation for User Story 1

- [X] T016 [US1] Complete `high` transition behavior so inactive rules activate at `value >= triggerThreshold` and active rules clear at `value <= clearThreshold` in `edge_server/go_core/internal/runtime/alarm_detector.go`
- [X] T017 [US1] Complete `low` transition behavior so inactive rules activate at `value <= triggerThreshold` and active rules clear at `value >= clearThreshold` in `edge_server/go_core/internal/runtime/alarm_detector.go`
- [X] T018 [US1] Complete `state` transition behavior so inactive rules activate when normalized value equals `expectedValue` and active rules clear when normalized value differs in `edge_server/go_core/internal/runtime/alarm_detector.go`
- [X] T019 [US1] Complete transition event emission so `active` and `clear` payloads include `edgeId`, identity fields, observed value, reading `ts`, `detectedAt`, and full rule snapshot, and emission is skipped unless runtime state is trusted and connected, in `edge_server/go_core/internal/runtime/alarm_detector.go`
- [X] T020 [US1] Ensure outbound alarm event emission failures are surfaced through the existing runtime async error path or a narrow detector error callback without blocking the source reading loop, dispatcher, or telemetry batching indefinitely in `edge_server/go_core/internal/runtime/alarm_detector.go`
- [X] T021 [US1] Ensure alarm detector wiring does not emit events when no configured rules exist and does not change runtime startup behavior for configs without `alarms` in `edge_server/go_core/internal/runtimeapp/process.go`
- [X] T022 [US1] Ensure existing telemetry batching still emits regular `telemetry` payloads without `sourceId` after reading-dispatch changes in `edge_server/go_core/internal/runtime/telemetry_pipeline.go`

**Checkpoint**: The Edge runtime diagnoses configured reading-driven alarms and emits transition-only Cloud events without breaking normal telemetry.

---

## Phase 4: Polish, Verification, and Review

**Purpose**: Verify the narrow runtime slice and document manual smoke without expanding automated proof volume.

- [X] T023 Run focused runtime alarm tests with `go test ./internal/runtime -count=1` from `edge_server/go_core`, covering `edge_server/go_core/internal/runtime/alarm_detector_test.go`
- [X] T024 Run focused Cloud/runtimeapp regression tests with `go test ./internal/cloud ./internal/runtimeapp -count=1` from `edge_server/go_core`, covering `edge_server/go_core/internal/cloud` and `edge_server/go_core/internal/runtimeapp`
- [X] T025 Run telemetry/source regression tests with `go test ./internal/source ./internal/runtime -run Telemetry -count=1` from `edge_server/go_core`, covering `edge_server/go_core/internal/source` and `edge_server/go_core/internal/runtime/telemetry_pipeline_test.go`
- [X] T026 [P] Inspect `edge_server/go_core/internal/source/readings.go` and `edge_server/go_core/internal/cloud/alarms.go` to verify alarm severity does not reuse `source.FaultSeverity` or allow `error`
- [X] T027 [P] Inspect `edge_server/go_core/internal/runtime/alarm_detector_test.go` and keep automated proof limited to the happy active/clear path plus duplicate suppression negative proof
- [X] T028 Add manual runtime smoke instructions for observing one `alarm_event` active transition and one `alarm_event` clear transition from the Arduino stand temperature rule in `specs/007-edge-server/slices/plan_edge_alarm_detection_slice.md`
- [X] T029 Complete Technical Lead Review for scope leakage, Cloud/Edge/Client boundaries, alarm event contract drift, reading fan-out safety, transition state correctness, stale state behavior, emission failure handling, and Lean Testing Policy in `specs/007-edge-server/slices/plan_edge_alarm_detection_slice.md`

---

## Dependencies and Execution Order

### Phase Dependencies

- Phase 1 has no code dependency beyond the completed alarm config slice.
- Phase 2 depends on Phase 1 event, detector, and dispatcher anchors.
- Phase 3 depends on Phase 2 rule indexing, condition evaluation, event construction, and runtime reading wiring.
- Phase 4 depends on Phase 3 implementation and proofs.

### Task Dependencies

- T004 depends on T001.
- T005 through T008 depend on T002.
- T009 depends on T001.
- T010 depends on T003.
- T011 depends on T010 and the existing `TelemetryPipeline` behavior.
- T012 depends on T002 and T010.
- T013 depends on T012 and the existing `runtimeapp.Process` construction.
- T014 and T015 depend on T001, T002, T004, and enough detector skeleton to compile.
- T016 depends on T007, T008, and T014.
- T017 and T018 depend on T007 and T008.
- T019 depends on T004, T005, T008, T012, and T016.
- T020 depends on T010, T019, and the runtime async error path.
- T021 depends on T013.
- T022 depends on T010 and T011.
- T023 depends on T014 through T020.
- T024 depends on T009, T013, and T021.
- T025 depends on T010, T011, and T022.
- T026 through T029 depend on implementation completion.

## Parallel Opportunities

- T002 and T003 can run in parallel with T001 because detector and dispatcher skeletons touch separate runtime files.
- T004 and T005 can run in parallel after T001/T002 because Cloud payload construction and revision derivation have separate owners.
- T009 can run in parallel with T010 because Cloud event emission and reading fan-out touch separate packages.
- T026 and T027 can run in parallel with command verification after implementation is complete because they are inspection tasks.

T006, T007, and T008 SHOULD be sequenced by one owner because they all change `edge_server/go_core/internal/runtime/alarm_detector.go`.
T014 and T015 SHOULD be sequenced by one owner because they share `edge_server/go_core/internal/runtime/alarm_detector_test.go`.
T017 and T018 SHOULD be sequenced by one owner because they share `edge_server/go_core/internal/runtime/alarm_detector.go`.

## Parallel Example: User Story 1

```text
Task: "Add compact happy path proof through the runtime reading dispatcher for a `high` rule crossing below trigger, then `30.0` or above, then `28.0` or below, asserting exactly one `active`, one `clear`, rule snapshot data, and the same normalized reading reaching a telemetry test sink in `edge_server/go_core/internal/runtime/alarm_detector_test.go`"
Task: "Implement `alarm_event` payload construction, including `edgeId`, `eventType`, normalized reading identity, observed value, reading `ts`, `detectedAt`, and nested rule snapshot in `edge_server/go_core/internal/cloud/alarms.go`"
```

## Implementation Strategy

### MVP First

1. Complete Phase 1 to create event, detector, and reading-dispatch anchors.
2. Complete Phase 2 to make rule matching, transition state, outbound DTOs, and runtime reading fan-out real.
3. Add the two lean proofs in Phase 3 before broadening implementation details.
4. Complete `high`, `low`, and `state` behavior while keeping automated proof focused on the `high` active/clear path and duplicate suppression.
5. Run focused verification and complete Technical Lead Review.

### Runtime Bias

- Prefer one runtime-owned reading dispatcher over multiple direct consumers of `source.Manager.Readings()`.
- Keep `sourceId` inside Edge alarm detection and keep regular Cloud telemetry unchanged.
- Keep Cloud alarm event DTO construction in `internal/cloud`, but keep incident lifecycle and storage out of Edge.
- Keep the detector process-local; do not add Edge persistence for alarm state in this slice.
- Keep rule revision deterministic and stable across restarts for unchanged rule snapshots.
- Treat config validation as already owned by the completed alarm rules slice; runtime code should not duplicate broad config validation matrices.

## Final Manual Runtime Smoke

Manual smoke MUST use the checked-in Arduino stand alarm rule from `edge_server/samples/arduino-stand/edge-runtime.yaml`:

1. Start a local Cloud Socket.IO harness or Cloud runtime that accepts the `/edge` namespace connection and records raw events emitted by Edge.
2. Start `edge-runtime` with `edge_server/samples/arduino-stand/edge-runtime.yaml` and a valid `runtime.stateDir/credential.json`.
3. Produce normalized Arduino stand temperature readings below `30.0` and observe regular `telemetry` batches but no `alarm_event`.
4. Raise the normalized temperature reading to `30.0` or above and observe exactly one outbound `alarm_event` with `eventType: "active"` and `rule.ruleId: "temp_high_warning"`.
5. Keep subsequent normalized temperature readings above `28.0` and observe no duplicate `active` `alarm_event`.
6. Lower the normalized temperature reading to `28.0` or below and observe exactly one outbound `alarm_event` with `eventType: "clear"` and the same `rule.ruleId` and `rule.ruleRevision`.
7. Confirm the observed `alarm_event` payloads include `edgeId`, `sourceId: "arduino_stand"`, `deviceId: "environment"`, `metric: "temperature"`, observed `value`, reading `ts`, `detectedAt`, and the nested rule snapshot.
8. Confirm regular `telemetry` batches still arrive and regular telemetry readings still omit `sourceId`.

Smoke success is the Edge transport observation of one `alarm_event` active transition, one `alarm_event` clear transition, and continued regular telemetry. Do not require or count Cloud incident journal storage, Cloud ACK handling, Dashboard or Client UI behavior, Constructor UI behavior, or direct Modbus-register alarm binding as evidence for this Edge-only slice.

## Technical Lead Review

### Review Scope

Review this task plan and implementation for Edge-only scope, Cloud event contract assumptions, source/runtime/cloud module boundaries, reading fan-out safety, transition state correctness, stale process-local state, emission failure behavior, and Lean Testing discipline.

### Review Checklist

- [X] Verify scope did not expand into Cloud incident persistence, Cloud uniqueness/update logic, ACK, Client UI, Constructor authoring, hardware-specific behavior, or alarm YAML schema changes.
- [X] Verify `doc_cursed/alarms_plan.md` remains the source of truth for alarm semantics.
- [X] Verify Edge remains the alarm diagnosis owner and Cloud remains the incident journal owner.
- [X] Verify alarm rules bind to normalized `sourceId + deviceId + metric`, not Modbus register addresses.
- [X] Verify regular telemetry payload shape remains unchanged and still omits `sourceId`.
- [X] Verify there is no second competing consumer directly attached to `source.Manager.Readings()`.
- [X] Verify every normalized reading can reach both telemetry batching and alarm detection.
- [X] Verify disabled alarm rules are ignored.
- [X] Verify `high`, `low`, and `state` transition logic uses process-local per-rule state and emits only on state changes.
- [X] Verify threshold comparisons are inclusive.
- [X] Verify `ruleRevision` is deterministic and excludes runtime-only event fields.
- [X] Verify outbound `alarm_event` includes `edgeId`, `eventType`, identity fields, observed value, reading `ts`, `detectedAt`, and full rule snapshot.
- [X] Verify alarm event emission uses the trusted runtime Cloud transport path and does not introduce Cloud incident lifecycle logic.
- [X] Verify source `FaultSeverity` is not reused for alarm severity and `error` is not accepted as an alarm severity.
- [X] Verify process restart stale state behavior is documented as process-local MVP behavior.
- [X] Verify automated proof remains lean: one happy active/clear path and one duplicate suppression negative proof.

### Completed Review Notes

- Scope remains Edge-only. The implementation adds Edge alarm diagnosis and outbound `alarm_event` emission, but does not add Cloud incident persistence, incident uniqueness/update logic, ACK handling, Client UI, Dashboard behavior, Constructor authoring, hardware-specific alarm logic, or alarm YAML schema changes.
- Live Cloud boundary check: `cloud_server/src/socket/events/edge.ts` currently registers telemetry, command result, and capabilities handlers for `/edge`; no Cloud `alarm_event` handler or incident journal mutation exists in the live Cloud socket implementation. This is aligned with the slice assumption that `alarm_event` is a proposed Edge-to-Cloud event and Cloud incident storage belongs to a later Cloud-owned slice.
- Cloud/Edge/Client boundary discipline is preserved. Edge owns runtime diagnosis from normalized readings and emits through the existing trusted Cloud transport path. Cloud remains the future incident journal owner. Client and Constructor remain out of scope and are not required evidence for this slice.
- Reading fan-out safety is acceptable for the current runtime path. `runtimeapp.Process` constructs one `ReadingDispatcher` over the single `source.Manager.Readings()` channel, then registers named `telemetry` and optional `alarm-detector` consumers. Production wiring therefore avoids two competing direct consumers on `source.Manager.Readings()`, and each normalized reading can reach both telemetry batching and alarm detection.
- Regular telemetry shape is preserved. Alarm matching keeps `sourceId` inside Edge, while regular telemetry emission still serializes only `deviceId`, `metric`, `value`, and `ts`.
- Transition state correctness is aligned with the plan. The detector indexes enabled rules by normalized `sourceId + deviceId + metric`, ignores rules where `enabled` is not explicitly `true`, tracks per-rule active/pending state in memory, emits only on `active` or `clear` transitions, and uses inclusive threshold comparisons for `high` and `low`.
- Stale state behavior is documented and acceptable for MVP. Alarm runtime state is process-local only; after Edge restart, an already-violating condition can produce a new `active` event when the next reading arrives. Durable duplicate prevention remains a Cloud incident journal concern.
- Emission failure handling is bounded to the runtime. Alarm event sends use the trusted runtime transport path and report failures through the runtime async error path without adding Cloud incident lifecycle logic.
- Severity boundaries are separated. Source `FaultSeverity` still allows `warning` or `error`, while alarm severity is constrained to `warning` or `danger`; `error` is rejected for alarm payloads/config and is not reused as an alarm severity.
- Lean Testing Policy is preserved. Automated coverage stays focused on the runtime dispatcher active/clear path, duplicate suppression, trusted-state gating, emission failure behavior, payload construction, and focused runtimeapp wiring rather than broad condition/validation matrices.

## Review Trigger

Review this plan when the Cloud incident event contract is defined, when `doc_cursed/alarms_plan.md` changes, when Edge telemetry reading flow changes, when alarm YAML schema changes, when runtime connectivity alarm evaluation enters scope, or when Edge alarm state persistence enters scope.
