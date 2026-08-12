# Tasks: Edge Alarm Rules Config Slice

**Input**: `doc_cursed/alarms_plan.md`, `edge_server/go_core/internal/config/config.go`, `edge_server/go_core/internal/config/config_test.go`, `edge_server/samples/arduino-stand/edge-runtime.yaml`, `edge_server/tests/fixtures/runtime/config.mock.yaml`, `edge_server/tests/fixtures/runtime/config.modbus.yaml`, completed Edge slice plans for `set_bool` and `set_number`.

**Prerequisites**: Existing Edge YAML parser, existing normalized telemetry identity under `sources[].sourceId`, `devices[].deviceId`, and `metrics[].metric`, existing Arduino stand telemetry mappings.

**Tests**: Include compact config proof only. This slice MUST prove one valid alarm rule and one critical threshold or hysteresis failure. It MUST NOT grow into an exhaustive table-driven validation matrix.

**Organization**: Tasks are grouped as setup, foundational config model work, one independently testable slice story, and polish.

## Purpose

This slice establishes the Edge YAML alarm rule contract and config validation for MVP alarm diagnosis.

The slice MUST stay config-only. Later slices MAY implement runtime alarm evaluation, Cloud incident journal storage, Client display, ACK handling, and Constructor authoring.

## Scope

- MUST add an Edge config model for root-level `alarms`.
- MUST validate alarm rules during `config.Parse`.
- MUST support `conditionType` values `high`, `low`, `state`, and `connectivity`.
- MUST support alarm `severity` values `warning` and `danger`.
- MUST validate `triggerThreshold` and `clearThreshold` for `high` and `low` rules.
- MUST enforce hysteresis for threshold rules:
  - `high`: `triggerThreshold > clearThreshold`.
  - `low`: `triggerThreshold < clearThreshold`.
- MUST bind alarm rules to normalized telemetry identity: `sourceId`, `deviceId`, and `metric`.
- MUST keep alarm rules independent from Modbus register addresses.
- MUST implement all validation rules in this plan, even when automated proof stays lean.

## Out Of Scope

- MUST NOT implement runtime alarm evaluation in this slice.
- MUST NOT implement Cloud incident journal behavior in this slice.
- MUST NOT change Client alarm display or ACK behavior in this slice.
- MUST NOT add Constructor alarm authoring UI in this slice.
- MUST NOT change Modbus adapter polling, mapping, or command execution in this slice.
- MUST NOT allow alarm rules to bind directly to Modbus register addresses.

## Constraints

- MUST treat Edge as the MVP alarm diagnosis owner.
- MUST treat Cloud as the incident journal owner.
- MUST NOT make Client read Edge YAML directly.
- MUST NOT treat `severity` as an incident lifecycle state.
- MUST NOT reuse Edge source `FaultSeverity` for alarm severity because source faults allow `error`, while alarm severity MUST be `warning` or `danger`.
- MUST preserve existing Edge config parsing behavior for runtime, cloud, batch, sources, logging, metrics, and commands.
- MUST keep module boundaries strict: config parsing and validation belong in `edge_server/go_core/internal/config`.
- MUST keep docs and code comments in English.
- MUST apply Lean Testing Policy: tests MUST prove the main happy path and at most one critical negative case for the main risk; tests MUST NOT expand into an exhaustive validation matrix.
- MUST separate required validation behavior from automated proof scope; not every validation branch needs its own automated test in this slice.

## Assumptions

- `alarms` will be a root-level YAML section, matching the example shape in `doc_cursed/alarms_plan.md`, unless existing Edge config conventions prove a safer local placement.
- `state` rules use `expectedValue`; runtime comparison semantics are out of scope for this config-only slice.
- `connectivity` rules MAY use the same `sourceId`/`deviceId`/`metric` identity shape for MVP, but runtime disconnect/connect evaluation is out of scope.
- `ruleRevision` belongs to future runtime or journal snapshot handling and is not required in YAML for this config-only slice unless `doc_cursed/alarms_plan.md` is later clarified to require it as stored rule configuration.

## Acceptance Checks

- `config.Parse` MUST accept YAML containing a valid root-level `alarms` rule bound to an existing `sourceId`/`deviceId`/`metric`.
- `config.Parse` MUST preserve parsed alarm fields in `Config`.
- `config.Parse` MUST reject one critical invalid hysteresis case, such as `high` with `triggerThreshold <= clearThreshold`.
- `config.Parse` MUST reject unsupported alarm severity, including `error`.
- `config.Parse` MUST reject an alarm rule that points to an unknown telemetry identity.
- `config.Parse` MUST reject duplicate `ruleId` values.
- Existing configs without `alarms` MUST continue to parse.
- Existing Arduino stand command mapping parse proof MUST keep passing.
- Targeted config tests MUST pass with `go test ./internal/config -count=1` from `edge_server/go_core`.

## Format: `[ID] [P?] [Story] Description`

- `[P]` means the task can run in parallel with other marked tasks because it touches different files and does not depend on incomplete tasks.
- `[US1]` maps to the local config slice story in Phase 3.
- Every task includes the file path that owns the change or proof.
- This document intentionally does not include implementation batches.

## Phase 1: Setup

**Purpose**: Make the intended alarm YAML shape explicit before config validation changes.

- [X] T001 Add a root-level `alarms` example for `arduino_stand/environment/temperature` with `conditionType: high`, `triggerThreshold: 30.0`, `clearThreshold: 28.0`, `severity: warning`, and `enabled: true` in `edge_server/samples/arduino-stand/edge-runtime.yaml`
- [X] T002 [P] Align the Modbus runtime fixture with the root-level alarm shape by adding the same minimal alarm example in `edge_server/tests/fixtures/runtime/config.modbus.yaml`

**Checkpoint**: The intended root-level alarm shape is visible in Edge-owned YAML and remains bound to logical telemetry identity.

---

## Phase 2: Foundational Alarm Config Model

**Purpose**: Add shared alarm structs and validation helpers before story-level proof.

- [X] T003 Add optional root-level `Alarms []AlarmRuleDefinition` to `Config` and define alarm config structs with YAML fields for `ruleId`, explicit `enabled`, `sourceId`, `deviceId`, `metric`, `conditionType`, `triggerThreshold`, `clearThreshold`, `expectedValue`, `severity`, and `label` in `edge_server/go_core/internal/config/config.go`
- [X] T004 Add helper types or decode validation that can distinguish missing `enabled`, missing thresholds, and explicit zero threshold values in `edge_server/go_core/internal/config/config.go`
- [X] T005 Build a telemetry identity index from `sources[].sourceId`, `devices[].deviceId`, and `metrics[].metric` with metric `valueType` preserved for alarm validation in `edge_server/go_core/internal/config/config.go`
- [X] T006 Validate shared alarm fields, including non-empty `ruleId`, unique `ruleId`, explicit `enabled`, non-empty identity fields, supported `conditionType`, supported `severity`, and existing telemetry identity in `edge_server/go_core/internal/config/config.go`
- [X] T007 Validate condition-specific fields for `high`, `low`, `state`, and `connectivity`, including numeric metric requirement for `high` and `low`, threshold presence, finite threshold values, hysteresis direction, `state.expectedValue`, and forbidden threshold or expected fields where out of scope in `edge_server/go_core/internal/config/config.go`
- [X] T008 Ensure alarm structs expose no `mapping`, `register`, `address`, or `registerType` YAML fields so `KnownFields(true)` rejects physical register binding attempts in `edge_server/go_core/internal/config/config.go`

**Checkpoint**: `config.Parse` has an explicit alarm config contract and rejects invalid alarm definitions before runtime startup.

---

## Phase 3: User Story 1 - Parse And Validate Edge Alarm Rules (Priority: P1) MVP

**Goal**: Edge accepts a local YAML alarm rule bound to normalized telemetry identity and rejects a critical invalid hysteresis rule before runtime startup.

**Independent Test**: Parse config YAML containing one valid `high` alarm for `arduino_stand/environment/temperature`; then parse the same rule with invalid `high` hysteresis and verify validation fails with a clear error.

### Tests for User Story 1

- [X] T009 [US1] Add compact valid alarm parse proof that reads `edge_server/samples/arduino-stand/edge-runtime.yaml`, verifies one parsed alarm rule, and asserts key preserved fields in `edge_server/go_core/internal/config/config_test.go`
- [X] T010 [US1] Add one critical invalid hysteresis proof for `high` with `triggerThreshold <= clearThreshold` using a small YAML fixture helper in `edge_server/go_core/internal/config/config_test.go`

### Implementation for User Story 1

- [X] T011 [US1] Wire alarm validation into `Config.validate()` after source validation so missing or empty `alarms` preserves existing parse behavior and non-empty `alarms` can be checked against a validated telemetry identity index in `edge_server/go_core/internal/config/config.go`
- [X] T012 [US1] Return clear validation errors that include the alarm list index and field path for invalid rule identity, severity, condition type, thresholds, and duplicate `ruleId` in `edge_server/go_core/internal/config/config.go`
- [X] T013 [US1] Preserve existing command validation behavior for `set_bool` and `set_number` while adding alarm validation in `edge_server/go_core/internal/config/config.go`
- [X] T014 [US1] Keep alarm definitions as parsed config data only, without adding runtime alarm evaluator hooks, source manager changes, Cloud calls, or Client-facing contracts in `edge_server/go_core/internal/config/config.go`

**Checkpoint**: The Edge config parser accepts valid alarm YAML, rejects the main hysteresis failure, and keeps the slice limited to config parsing and validation.

---

## Phase 4: Polish & Cross-Cutting Concerns

**Purpose**: Verify the config-only slice and document review boundaries without expanding proof volume.

- [X] T015 Run targeted config tests with `go test ./internal/config -count=1` from `edge_server/go_core`
- [X] T016 [P] Inspect `edge_server/go_core/internal/source/readings.go` and confirm no alarm severity code reuses `FaultSeverity` or introduces `error` as an alarm severity in `edge_server/go_core/internal/source/readings.go`
- [X] T017 [P] Inspect `edge_server/go_core/internal/config/config_test.go` and remove any alarm validation table that exceeds the Lean Testing Policy for this slice in `edge_server/go_core/internal/config/config_test.go`
- [X] T018 Update this slice plan with implementation notes only if validation behavior intentionally differs from the assumptions in `specs/007-edge-server/slices/plan_edge_alarm_rules_slice.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No code dependency, but T001 can make existing sample parse tests fail until Phase 2 and Phase 3 are implemented.
- **Foundational (Phase 2)**: Depends on the selected YAML shape from Phase 1 and blocks User Story 1.
- **User Story 1 (Phase 3)**: Depends on alarm structs and validation helpers from Phase 2.
- **Polish (Phase 4)**: Depends on User Story 1 completion.

### Within User Story 1

- T009 and T010 SHOULD be written before or alongside T011-T014 when using test-first proof.
- T011 MUST happen after T005-T007 because it depends on telemetry identity indexing and condition validation.
- T012 MUST happen after T006-T007 define the validation branches and field names.
- T013 MUST be checked after T011 because existing command validation should remain part of the full config validation path.
- T014 MUST be checked before considering the slice complete because runtime hooks would leak scope into later alarm slices.

### Parallel Opportunities

- T002 can run in parallel with T001 because both touch separate YAML files and T002 is fixture alignment, not an additional proof task.
- T009 and T010 can run in parallel with T003-T008 if test expectations are agreed first.
- T016 and T017 can run in parallel with T015 after implementation is complete because they inspect different files.

## Parallel Example: User Story 1

```text
Task: "Add compact valid alarm parse proof that reads `edge_server/samples/arduino-stand/edge-runtime.yaml`, verifies one parsed alarm rule, and asserts key preserved fields in `edge_server/go_core/internal/config/config_test.go`"
Task: "Build a telemetry identity index from `sources[].sourceId`, `devices[].deviceId`, and `metrics[].metric` with metric `valueType` preserved for alarm validation in `edge_server/go_core/internal/config/config.go`"
```

## Implementation Strategy

### MVP First

1. Complete T001 to make the sample alarm contract explicit.
2. Complete T003-T008 to add the alarm config model and validation without runtime hooks.
3. Complete T009-T014 to prove valid parsing and critical hysteresis rejection.
4. Complete T015-T018 to verify targeted tests, Lean Testing boundaries, and scope containment.

### Validation Bias

- Prefer dedicated alarm validation helpers in `edge_server/go_core/internal/config/config.go` over mixing alarm rules into source, command, or Modbus validation helpers.
- Preserve enough field presence information to distinguish missing YAML fields from valid zero values.
- Keep threshold values finite numeric config values; runtime comparison precision and state-machine behavior belong to later slices.
- Keep hardware-specific identifiers in YAML samples, tests, and smoke instructions only.

## Manual/Runtime Smoke

This config-only slice has no hardware smoke. Manual smoke SHOULD be limited to config parsing:

```powershell
cd edge_server\go_core
go test ./internal/config -count=1
```

Do not count this slice as successful if a runtime alarm evaluator, Cloud incident write, Client ACK path, Constructor UI, or Modbus adapter change is required to pass.

## Technical Lead Review

### Review Scope

This review covers config contract drift, module boundary leakage, validation completeness, Lean Testing discipline, and alignment with `doc_cursed/alarms_plan.md`.

### Review Checklist

- Verify `alarms` remains root-level YAML and matches `doc_cursed/alarms_plan.md`.
- Verify configs without `alarms` continue to parse.
- Verify `ruleId` is required and unique.
- Verify `enabled` presence is validated and explicit `false` is allowed.
- Verify alarm severity is `warning` or `danger` only and does not reuse source `FaultSeverity`.
- Verify `high` and `low` require numeric telemetry metrics and valid hysteresis.
- Verify alarm rules bind through `sourceId`/`deviceId`/`metric`, not Modbus register addresses.
- Verify tests prove one valid parse path and one critical invalid hysteresis path without expanding into a large validation matrix.
- Verify no Cloud, Client, Constructor, runtime alarm evaluator, source manager, or Modbus adapter behavior changed in this slice.

## Review Trigger

Review this plan when runtime alarm evaluation enters scope, when Cloud incident journal contracts enter scope, when Client ACK/display enters scope, when Constructor alarm authoring enters scope, when `doc_cursed/alarms_plan.md` changes, or when Edge telemetry identity rules change.
