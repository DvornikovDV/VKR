# Tasks: Edge-only `set_number` Slice

**Input**: `doc_cursed/edge_control_plan.md`, `specs/007-edge-server/slices/protocol_adapter_mapping_boundary.md`, `specs/007-edge-server/slices/plan_set_bool_slice.md`, `edge_server/samples/arduino-stand/edge-runtime.yaml`, `edge_server/engineering_system/engineering_system.ino`, relevant Edge config/source/manager/Modbus/CLI code.

**Prerequisites**: Existing Arduino telemetry path, existing Modbus RTU polling adapter, existing Edge source manager command path, completed Edge-only `set_bool` slice.

**Tests**: Include compact behavior tests because this slice changes command mapping validation, numeric command execution, Modbus transaction safety, and command confirmation semantics.

**Organization**: Tasks are grouped as setup, foundational numeric command infrastructure, one independently testable slice story, and polish.

## Purpose

This slice defines local Edge execution of `set_number` for the Arduino stand `valve_pwm` actuator.

The command MUST write an integer register-domain value to the configured Modbus holding register and MUST confirm execution only by observing the configured reported metric from the normal polling loop.

## Scope

This task plan applies only to local Edge execution of `set_number` for the Arduino stand `valve_pwm` PWM output.

This document does not define Cloud command routing, Client UI, command journal, permissions, configurable widgets, ControlLease, queue brokers, floating-point command conversion, or a second Modbus read loop.

## Constraints

- MUST define command mappings under the owning device, next to that device's `metrics`.
- MUST support `set_number` without regressing the existing `set_bool` command path.
- MUST treat YAML command mappings as allowed commands, not specific command executions.
- MUST validate `set_number` values as numeric integer register-domain values before Modbus write.
- MUST validate `set_number` values against configured command-level `min` and `max` limits.
- MUST write `valve_pwm set_number` to holding register `0xA2` / `162` through YAML mapping.
- MUST treat `reportedMetric` as a reference to a telemetry metric on the same device; that metric's `mapping` owns the input register used for confirmation.
- MUST confirm `valve_pwm set_number` through `reportedMetric: actual_value`, whose telemetry mapping is read from input register `0x12` / `18` through normal polling.
- MUST treat a successful Modbus write as write acceptance only, not command confirmation.
- MUST keep Modbus write transaction timeout separate from the polling confirmation timeout or attempt budget.
- MUST NOT add a second Modbus read loop for command confirmation.
- MUST NOT read the holding command register as command confirmation.
- MUST serialize Modbus reads and writes on the same serial connection.
- MUST keep the desired command value in command-local state and MUST NOT emit it as normalized telemetry.
- MUST NOT hardcode `valve_pwm`, `162`, `18`, or `actual_value` in generic adapter logic.
- SHOULD expose `set_number` through the local `edge-control` CLI using the same source manager command path as `set_bool`.

## Assumptions

- The active YAML shape remains the current repository shape: `command`, nested `mapping`, `min`, `max`, and `reportedMetric`.
- `min` and `max` are command-level limits owned by local source configuration.
- For this slice, `valve_pwm` uses integer register-domain values with `min: 0`, `max: 255`, and no floating-point command conversion.
- `scale` remains part of the mapping vocabulary, but this slice MUST NOT introduce floating-point command conversion.
- Numeric confirmation uses exact integer equality between the expected command value and the numeric value produced by normal polling for the configured reported metric; tolerance, range-based confirmation, and command/fact scale-offset conversion are out of scope.

## Acceptance Checks

- The Arduino stand sample config MUST contain a `valve_pwm` `set_number` command mapping to holding register `162`, with `min: 0`, `max: 255`, and `reportedMetric: actual_value`.
- Config validation MUST accept valid `set_bool` and `set_number` mappings and reject invalid command mappings with clear errors.
- Config validation MUST reject missing command mapping, non-holding command register type, unknown `reportedMetric`, non-number `reportedMetric` for `set_number`, missing range limits, and invalid ranges.
- The source manager command routing and in-flight protection MUST continue to work for both `set_bool` and `set_number`.
- The Modbus adapter MUST write `set_number` values to the configured holding register without hardcoded Arduino stand identities.
- Hardcoded `valve_pwm`, `162`, `18`, or `actual_value` references MUST appear only in sample config, tests, or smoke instructions, not in generic adapter logic.
- Invalid `set_number` values MUST fail before Modbus write, including non-number values, fractional values, NaN or infinity values, values outside configured range, and values outside `uint16`.
- Confirmation MUST require fresh post-write normal polling observations of `actual_value`.
- Stale pre-write observations MUST NOT confirm a command.
- Missing matching reported values MUST return `timeout`.
- Tests MUST distinguish Modbus write timeout or failure from polling confirmation timeout.
- Tests MUST prove that confirmation performs no separate read and that polling reads plus command writes remain serialized.
- The local CLI MUST execute `set_number` through the same source manager command path as `set_bool`.
- One-shot command execution MAY force a bounded number of normal `pollOnce()` attempts after a successful write; this still counts as the normal polling path and MUST NOT become a separate confirmation read.
- Manual hardware smoke SHOULD use `go run ./cmd/edge-control` from `edge_server/go_core`, matching the current `set_bool` one-shot smoke shape.

## Format: `[ID] [P?] [Story] Description`

- `[P]` means the task can run in parallel with other marked tasks because it touches different files and does not depend on incomplete tasks.
- `[US1]` maps to the local slice story in Phase 3.
- Every task includes the file path that owns the change or proof.
- This document intentionally does not include implementation batches.

## Phase 1: Setup

**Purpose**: Add the Arduino stand numeric command mapping and keep hardware-specific identities in configuration.

- [X] T001 Add `valve_pwm.commands[]` with `command: set_number`, `mapping.registerType: holding`, `mapping.address: 162`, `min: 0`, `max: 255`, and `reportedMetric: actual_value` in `edge_server/samples/arduino-stand/edge-runtime.yaml`
- [X] T002 [P] Add an Arduino stand sample parse assertion for `valve_pwm set_number` command mapping in `edge_server/go_core/internal/config/config_test.go`

**Checkpoint**: The Arduino stand exposes the numeric command through YAML, and the sample config proves the intended mapping shape.

---

## Phase 2: Foundational Numeric Command Infrastructure

**Purpose**: Extend shared command metadata and validation before Modbus execution changes.

- [X] T003 Extend command config structs with command-level `min` and `max` fields and validate `set_bool` plus `set_number` command shapes in `edge_server/go_core/internal/config/config.go`
- [X] T004 [P] Add config validation tests for valid `set_number`, `set_bool` regression, missing range limits, invalid ranges, non-integer limits, out-of-`uint16` limits, non-holding command mappings, unknown `reportedMetric`, and non-number `reportedMetric` in `edge_server/go_core/internal/config/config_test.go`
- [X] T005 Preserve command-level `min` and `max` during config-to-source conversion and source definition cloning in `edge_server/go_core/internal/source/adapter.go`
- [X] T006 [P] Add source conversion and clone tests proving `set_number` range metadata is preserved without mutating config-owned maps in `edge_server/go_core/internal/source/manager_test.go`
- [X] T007 Add source manager tests proving `set_number` command routing, missing command mapping failure with a clear reason, and existing `deviceId + commandType` in-flight protection in `edge_server/go_core/internal/source/manager_test.go`

**Checkpoint**: Source manager callers can submit `set_number` through the same normalized command boundary as `set_bool`.

---

## Phase 3: User Story 1 - Execute Local `set_number` And Confirm Via Polling (Priority: P1) MVP

**Goal**: A local caller can execute `valve_pwm set_number 0..255`; Edge writes the configured Modbus holding register and returns `confirmed`, `timeout`, or `failed` based on normal polling of `actual_value`.

**Independent Test**: Use the local CLI or source manager command path to set `valve_pwm` to `0`, `128`, and `255`; verify Modbus writes those values to the configured holding register, no read/write concurrency occurs, and command confirmation waits for fresh `actual_value` polling.

### Tests for User Story 1

- [X] T008 [US1] Add Modbus command mapping parser tests for valid `set_number`, non-holding register, unknown `reportedMetric`, non-number `reportedMetric`, missing range limits, and invalid range limits in `edge_server/go_core/internal/source/modbus_serial_adapter_test.go`
- [X] T009 [US1] Add Modbus write tests proving `set_number 0`, `set_number 128`, and `set_number 255` write the requested value to the configured holding register in `edge_server/go_core/internal/source/modbus_serial_adapter_test.go`
- [X] T010 [US1] Add invalid `set_number` value tests proving non-number, fractional, NaN, infinity, out-of-range, and out-of-`uint16` values fail with clear reasons before Modbus write in `edge_server/go_core/internal/source/modbus_serial_adapter_test.go`
- [X] T011 [US1] Add numeric command confirmation tests proving fresh post-write `actual_value` confirms, stale same-value pre-write `actual_value` does not confirm, bounded forced normal poll attempts after write do not create a separate confirmation read, and missing matching `actual_value` returns `timeout` in `edge_server/go_core/internal/source/modbus_serial_adapter_test.go`
- [X] T012 [US1] Add Modbus transaction safety regression proving polling reads and `set_number` command writes keep maximum concurrent transactions at `1` in `edge_server/go_core/internal/source/modbus_serial_adapter_test.go`
- [X] T013 [US1] Add CLI tests for valid `set_number`, invalid numeric values, `set_bool` regression, and local source manager delegation in `edge_server/go_core/cmd/edge-control/main_test.go`

### Implementation for User Story 1

- [X] T014 [US1] Extend Modbus command mapping storage with command type, command range, and reported metric type without hardcoded Arduino identities in `edge_server/go_core/internal/source/modbus_serial_adapter.go`
- [X] T015 [US1] Parse and store both `set_bool` and `set_number` Modbus command mappings while preserving existing `set_bool` validation in `edge_server/go_core/internal/source/modbus_serial_adapter.go`
- [X] T016 [US1] Implement `set_number` value validation and conversion to `uint16` for integer register-domain values in `edge_server/go_core/internal/source/modbus_serial_adapter.go`
- [X] T017 [US1] Execute `set_number` Modbus writes under the same transaction lock used by polling reads and existing `set_bool` writes, using strict lock ordering that does not hold command observation locks during Modbus I/O in `edge_server/go_core/internal/source/modbus_serial_adapter.go`
- [X] T018 [US1] Generalize command confirmation to compare boolean and numeric reported-metric observations using the existing post-write sequence marker, bounded forced normal poll attempts, and normal polling observations only in `edge_server/go_core/internal/source/modbus_serial_adapter.go`
- [X] T019 [US1] Ensure desired `set_number` values remain command-local and are never published as `RawReading` telemetry in `edge_server/go_core/internal/source/modbus_serial_adapter.go`
- [X] T020 [US1] Extend local CLI command parsing to accept `set_bool` booleans and `set_number` integer register-domain values in `edge_server/go_core/cmd/edge-control/main.go`
- [X] T021 [US1] Wire CLI `set_number` execution through the existing local source manager path without Cloud connection in `edge_server/go_core/cmd/edge-control/main.go`

**Checkpoint**: The Edge-only `set_number` slice is functional through a local command path and testable without Cloud or Client work.

---

## Phase 4: Polish & Cross-Cutting Concerns

**Purpose**: Keep the slice aligned with repository quality gates without running the full speckit pipeline.

- [X] T022 Run targeted config and source tests with `go test ./internal/config ./internal/source -count=1` from `edge_server/go_core`
- [X] T023 Run targeted CLI tests with `go test ./cmd/edge-control -count=1` from `edge_server/go_core`
- [X] T024 [P] Add or update the local hardware smoke procedure for `go run ./cmd/edge-control` one-shot `valve_pwm set_number` commands from `edge_server/go_core` in `specs/007-edge-server/slices/plan_set_number_slice.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup completion and blocks User Story 1.
- **User Story 1 (Phase 3)**: Depends on Foundational completion.
- **Polish (Phase 4)**: Depends on User Story 1 completion.

### Within User Story 1

- T008-T013 SHOULD be written before T014-T021 when using test-first proof.
- T014 MUST complete before T015, T016, and T018.
- T015 MUST complete before T016 and T017.
- T016 MUST complete before T017.
- T017 MUST preserve the existing `transactionMu` serialization used by `set_bool` and MUST NOT hold command observation locks while performing Modbus I/O.
- T018 MUST keep confirmation on the adapter-local normal polling observation path, MAY use bounded forced `pollOnce()` attempts for one-shot stability, and MUST require post-write sequence observations.
- T020 MUST complete before T021 and SHOULD satisfy T013 CLI parsing expectations.
- T021 MUST use local source manager wiring only and MUST NOT connect to Cloud.

### Parallel Opportunities

- T002 can run in parallel with T001 if one owner updates YAML and one owner updates config sample assertions.
- T004 can run in parallel with T003 if validation expectations are agreed first.
- T006 and T007 can run in parallel with T005 if one owner works on source metadata preservation and one owner works on manager command routing tests.
- T013 can begin after the source manager command contract is stable and can run alongside T008-T012 because it touches CLI files only.
- T020-T021 can run alongside T014-T019 when CLI work only depends on the shared `source.CommandRequest` contract.

## Parallel Example: User Story 1

```text
Task: "Add Modbus write tests proving `set_number 0`, `set_number 128`, and `set_number 255` write the requested value to the configured holding register in `edge_server/go_core/internal/source/modbus_serial_adapter_test.go`"
Task: "Add CLI tests for valid `set_number`, invalid numeric values, `set_bool` regression, and local source manager delegation in `edge_server/go_core/cmd/edge-control/main_test.go`"
```

## Implementation Strategy

### MVP First

1. Complete Phase 1 to make the Arduino stand command mapping explicit.
2. Complete Phase 2 to propagate numeric command metadata generically.
3. Complete Phase 3 through T019 to prove Modbus execution and polling-based confirmation.
4. Complete T020-T021 to expose the same command path through the local CLI.
5. Complete Phase 4 targeted tests and hardware smoke notes.

### Validation Bias

- Prefer generic validation helpers that keep `set_bool` and `set_number` behavior explicit.
- Keep range validation at config boundaries where possible and repeat runtime request validation before Modbus write.
- Keep hardware-specific identifiers in YAML, tests, and smoke notes only.
- Do not add Cloud, Client, journal, lease, or widget placeholders.

## Manual Hardware Smoke

After tests pass, run the standalone one-shot CLI only when the main Edge runtime, Serial Monitor, and any other tool are not using the configured Modbus serial port. The standalone CLI opens and owns that serial port while it runs, so it must not run concurrently with the runtime process that polls the same Arduino stand.

From `edge_server/go_core`, use the same source-manager command path that later Cloud transport can call. This is the same launch shape currently used for `set_bool` smoke, for example:

```powershell
go run ./cmd/edge-control --config ..\samples\arduino-stand\edge-runtime.yaml --device siren_alert --command set_bool --value true
go run ./cmd/edge-control --config ..\samples\arduino-stand\edge-runtime.yaml --device valve_pwm --command set_number --value 0
go run ./cmd/edge-control --config ..\samples\arduino-stand\edge-runtime.yaml --device valve_pwm --command set_number --value 128
go run ./cmd/edge-control --config ..\samples\arduino-stand\edge-runtime.yaml --device valve_pwm --command set_number --value 255
```

Each `valve_pwm` command should print a JSON result with `deviceId: "valve_pwm"`, `command: "set_number"`, and `status: "confirmed"`. The RGB blue channel should move to off, mid-level, and full brightness respectively. `actual_value` remains the source of truth because confirmation comes from the normal polling loop, including any bounded forced `pollOnce()` attempts used by the one-shot CLI path, not from a separate Modbus read or a direct holding-register check.

Do not count this hardware smoke as successful if the CLI only reports a successful Modbus write without a `confirmed` result.

## Technical Lead Review

### Review Scope

This review covers task completeness, task ordering, stale confirmation, race conditions, deadlocks, lock ordering, invalid value failures, compatibility with `set_bool`, and the absence of a separate confirmation read for the Edge-only `set_number` slice.

### Review Checklist

- Verify scope did not expand into Cloud, Client UI, journal, permissions, configurable widgets, or ControlLease.
- Verify desired command values and actual reported values remain separate.
- Verify confirmation uses the normal polling observation path and does not introduce a second Modbus read loop.
- Verify `set_number` value validation rejects non-number, fractional, NaN, infinity, out-of-range, and out-of-`uint16` values before write.
- Verify Modbus transaction serialization remains shared by polling reads, `set_bool` writes, and `set_number` writes.
- Verify concurrent commands for the same `deviceId + commandType` retain a clear busy failure.
- Verify `set_bool` parser, validation, write conversion, confirmation, and CLI behavior remain covered.
- Verify hardcoded Arduino stand identifiers appear only in sample config, tests, or smoke instructions.

## Review Trigger

Review this plan when Cloud command transport enters scope, when floating-point command conversion enters scope, when Modbus adapter transaction scheduling changes, when the Arduino register map changes, or when additional numeric command devices are added.
