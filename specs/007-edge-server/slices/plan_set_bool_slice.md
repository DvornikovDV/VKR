# Tasks: Edge-only `set_bool` Slice

**Input**: `doc_cursed/edge_control_plan.md`, `doc_cursed/cloud_client_control_plan.md`, `specs/007-edge-server/protocol_adapter_mapping_boundary.md`, `edge_server/samples/arduino-stand/edge-runtime.yaml`, `edge_server/engineering_system/engineering_system.ino`, relevant Edge runtime/config/source/Modbus code.

**Prerequisites**: Existing Arduino telemetry path, existing Modbus RTU polling adapter, existing Edge runtime source manager.

**Tests**: Include compact behavior tests because this slice changes runtime command execution, Modbus transaction safety, and command confirmation semantics.

**Organization**: Tasks are grouped as setup, foundational command infrastructure, one independently testable slice story, and polish.

## Scope

This task plan applies only to local Edge execution of `set_bool` for the Arduino stand `pump_main` LED.

This document does not define Cloud command routing, Client UI, command journal, permissions, `set_number`, configurable widgets, queue brokers, or a second Modbus read loop.

## Constraints

- MUST define command mappings under the owning device, next to that device's `metrics`.
- MUST support only `set_bool` in this slice.
- MUST treat a successful Modbus write as write acceptance only, not command confirmation.
- MUST confirm command execution by observing the configured `reportedMetric` from the normal polling loop.
- MUST NOT add a second Modbus read loop for command confirmation.
- MUST NOT read the holding command register as command confirmation.
- MUST serialize Modbus reads and writes on the same serial connection.
- MUST NOT hardcode `pump_main`, `0xA0`, or `actual_state` in the adapter.
- SHOULD expose a local CLI for hardware setup and debugging, using the same internal command path that Cloud transport can call later.

## Format: `[ID] [P?] [Story] Description`

- `[P]` means the task can run in parallel with other marked tasks because it touches different files and does not depend on incomplete tasks.
- `[US1]` maps to the local slice story in Phase 3.
- Every task includes the file path that owns the change or proof.

## Phase 1: Setup

**Purpose**: Add the Arduino stand command mapping and verify the Modbus write API name before implementation.

- [X] T001 Add `pump_main.commands[]` with `set_bool`, `holding`, address `160`, and `reportedMetric: actual_state` in `edge_server/samples/arduino-stand/edge-runtime.yaml`
- [X] T002 Confirm the Simon Vetter Modbus single holding-register write method to use in `edge_server/go_core/internal/source/modbus_serial_adapter.go`

**Checkpoint**: The intended YAML mapping and Modbus write API are known before foundational code changes.

---

## Phase 2: Foundational Command Infrastructure

**Purpose**: Add shared command mapping and local command contracts that block the slice story.

- [X] T003 Add per-device command config structs and validation for `set_bool` mappings in `edge_server/go_core/internal/config/config.go`
- [X] T004 [P] Add config validation tests for valid and invalid per-device `set_bool` mappings in `edge_server/go_core/internal/config/config_test.go`
- [X] T005 Add source-layer command definitions and preserve them in config-to-source conversion in `edge_server/go_core/internal/source/adapter.go`
- [X] T006 Update source definition cloning and identity handling to include command definitions in `edge_server/go_core/internal/source/adapter.go`
- [X] T007 Define local command request/result types and statuses `confirmed`, `timeout`, and `failed` in `edge_server/go_core/internal/source/commands.go`
- [X] T008 Add optional adapter command capability, manager-level command routing, and one in-flight command policy per `deviceId + commandType` in `edge_server/go_core/internal/source/manager.go`
- [X] T009 [P] Add source manager tests for command routing, unknown device, unknown command, and non-command-capable adapter failures in `edge_server/go_core/internal/source/manager_test.go`

**Checkpoint**: Source manager callers can submit a normalized local command without knowing which source owns the target device.

---

## Phase 3: User Story 1 - Execute Local `set_bool` And Confirm Via Polling (Priority: P1) MVP

**Goal**: A local caller can execute `pump_main set_bool true/false`; Edge writes the configured Modbus holding register and returns `confirmed`, `timeout`, or `failed` based on normal polling of `actual_state`.

**Independent Test**: Use the local CLI or source manager command path to set `pump_main` to `true` and `false`; verify Modbus writes `1` and `0`, no read/write concurrency occurs, and command confirmation waits for fresh `actual_state` polling.

### Tests for User Story 1

- [X] T010 [US1] Add Modbus command mapping parser tests for unsupported command type, non-holding register, unknown `reportedMetric`, and non-boolean `reportedMetric` in `edge_server/go_core/internal/source/modbus_serial_adapter_test.go`
- [X] T011 [US1] Add Modbus write tests proving `set_bool true` writes `1` and `set_bool false` writes `0` to the configured holding register in `edge_server/go_core/internal/source/modbus_serial_adapter_test.go`
- [X] T012 [US1] Add Modbus transaction safety test proving polling reads and command writes keep maximum concurrent transactions at `1` in `edge_server/go_core/internal/source/modbus_serial_adapter_test.go`
- [X] T013 [US1] Add command confirmation tests proving fresh post-write `actual_state` confirms, stale pre-write state does not confirm, no separate confirmation read occurs, and missing matching state returns `timeout` in `edge_server/go_core/internal/source/modbus_serial_adapter_test.go`

### Implementation for User Story 1

- [X] T014 [US1] Parse and store Modbus `set_bool` command mappings without hardcoded Arduino device names or addresses in `edge_server/go_core/internal/source/modbus_serial_adapter.go`
- [X] T015 [US1] Extend the internal Modbus client abstraction with single holding-register write support in `edge_server/go_core/internal/source/modbus_serial_adapter.go`
- [X] T016 [US1] Implement `set_bool` value validation and conversion to `uint16(1)` or `uint16(0)` in `edge_server/go_core/internal/source/modbus_serial_adapter.go`
- [X] T017 [US1] Execute Modbus command writes under the same transaction lock used by polling reads in `edge_server/go_core/internal/source/modbus_serial_adapter.go`
- [X] T018 [US1] Track adapter-local fresh reported-metric observations from the normal polling path for command confirmation in `edge_server/go_core/internal/source/modbus_serial_adapter.go`
- [X] T019 [US1] Return `confirmed`, `timeout`, or `failed` using a reported-metric observation count plus an outer timeout guard in `edge_server/go_core/internal/source/modbus_serial_adapter.go`
- [X] T020 [US1] Add local CLI command parsing for `--config`, `--device`, `--command`, and `--value` in `edge_server/go_core/cmd/edge-control/main.go`
- [X] T021 [US1] Wire the local CLI to load config, apply source definitions, execute the source manager command path without Cloud connection, and print the command result in `edge_server/go_core/cmd/edge-control/main.go`
- [X] T022 [US1] Add CLI argument validation tests for missing config, device, command, and value in `edge_server/go_core/cmd/edge-control/main_test.go`

**Checkpoint**: The Edge-only `set_bool` slice is functional through a local command path and testable without Cloud or Client work.

---

## Phase 4: Polish & Cross-Cutting Concerns

**Purpose**: Keep the slice aligned with repository quality gates without running the full speckit pipeline.

- [X] T023 Run targeted config and source tests with `go test ./internal/config ./internal/source -count=1` from `edge_server/go_core`
- [X] T024 Run targeted CLI tests with `go test ./cmd/edge-control -count=1` from `edge_server/go_core`
- [X] T025 [P] Add a short local hardware smoke note for `edge-control` usage in `specs/007-edge-server/slices/plan_set_bool_slice.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup completion and blocks User Story 1.
- **User Story 1 (Phase 3)**: Depends on Foundational completion.
- **Polish (Phase 4)**: Depends on User Story 1 completion.

### Within User Story 1

- T010-T013 SHOULD be written before T014-T019 when using test-first proof.
- T014 MUST complete before T016, T018, and T019.
- T015 MUST complete before T017.
- T017 MUST complete before command execution can be considered safe.
- T018 MUST complete before T019 can return `confirmed` or `timeout` correctly.
- T020 MUST complete before T021 and T022.

### Parallel Opportunities

- T004 can run in parallel with T003 if one agent owns tests and one owns config implementation.
- T009 can run in parallel with T005-T008 if test expectations are agreed first.
- T020-T022 can begin after T008 if the CLI owner uses the source manager command contract and does not edit Modbus adapter files.
- T020-T022 can run alongside T010-T019 when separate owners coordinate only through the source manager command contract.

## Parallel Example: User Story 1

```text
Task: "Add Modbus write tests proving `set_bool true` writes `1` and `set_bool false` writes `0` to the configured holding register in `edge_server/go_core/internal/source/modbus_serial_adapter_test.go`"
Task: "Add local CLI command parsing for `--config`, `--device`, `--command`, and `--value` in `edge_server/go_core/cmd/edge-control/main.go`"
```

## Implementation Strategy

### MVP First

1. Complete Phase 1.
2. Complete Phase 2.
3. Complete Phase 3 through T019 to prove the source manager and Modbus adapter path.
4. Add the CLI through T022.
5. Run the targeted tests in Phase 4.

### Manual Hardware Smoke

After tests pass, run the standalone `edge-control` CLI only when the main Edge runtime, Serial Monitor, and any other tool are not using the configured Modbus serial port. The standalone CLI opens and owns that serial port while it runs, so it must not run concurrently with the runtime process that polls the same Arduino stand.

From the repository root, use the same source-manager command path that later Cloud transport can call:

```powershell
edge-control --config edge_server\samples\arduino-stand\edge-runtime.yaml --device pump_main --command set_bool --value true
edge-control --config edge_server\samples\arduino-stand\edge-runtime.yaml --device pump_main --command set_bool --value false
```

Each command should print a JSON result with `deviceId: "pump_main"`, `command: "set_bool"`, and `status: "confirmed"`. The first command should turn the `pump_main` LED on and the second should turn it off, unless the Arduino local button changes the same physical state. `actual_state` remains the source of truth because confirmation comes from the normal polling loop, not from a separate Modbus read or a direct holding-register check.

## Technical Lead Review

### Review Scope

This review covers race conditions, deadlocks, command confirmation correctness, Modbus read duplication, and desired/actual state separation for the Edge-only `set_bool` slice.

### Findings And Plan Corrections

1. **Confirmation MUST stay inside the adapter polling path.**
   - Risk: If confirmation listens to `source.Manager.Readings()`, it can compete with the telemetry pipeline or other consumers and accidentally steal readings.
   - Correction: T018 MUST implement confirmation notification inside `ModbusSerialAdapter` at the point where polling converts a register value into a reading. Manager-level code SHOULD only receive the final command result.

2. **Pending command state MUST NOT be held while performing Modbus I/O.**
   - Risk: A deadlock can occur if command state locks are held while waiting for `transactionMu`, while polling holds `transactionMu` and then tries to notify command state.
   - Correction: T017-T019 MUST use a strict lock order: snapshot command state without holding `transactionMu`, perform Modbus I/O under `transactionMu`, then update pending confirmation state under a separate short-held command mutex or channel.

3. **Confirmation MUST require post-write observations.**
   - Risk: A cached `actual_state=true` observed before a write could incorrectly confirm a later `set_bool true`.
   - Correction: T018 MUST record a command start marker, such as `writeCompletedAt` or a monotonic observation sequence, and only count reported-metric observations produced after that marker.

4. **The observation window SHOULD be based on reported-metric observations, not wall-clock only.**
   - Risk: A slow or temporarily faulting serial line could make a 2-3 second wall-clock timeout expire without any real polling observations.
   - Correction: T018-T019 SHOULD wait for 2-3 fresh observations of the specific `reportedMetric`, with an outer wall-clock guard to prevent indefinite waits.

5. **Modbus confirmation MUST NOT create extra reads.**
   - Risk: A helper that reads `actual_state` immediately after write would duplicate the polling loop and violate the slice constraint.
   - Correction: T013 and T018 MUST verify that confirmation uses values observed during normal `pollOnce` execution only.

6. **Desired command value MUST remain separate from reported state.**
   - Risk: Publishing the desired value as telemetry would hide Arduino local button changes and mix command intent with physical fact.
   - Correction: T016-T019 MUST keep desired value only in pending command state. Only input-register polling may publish `actual_state`.

7. **Concurrent commands for the same device need an explicit MVP rule.**
   - Risk: Two local commands for `pump_main set_bool` can overlap and cause ambiguous confirmation, especially `true` followed quickly by `false`.
   - Correction: T008 and T019 MUST reject or serialize a second in-flight command for the same `deviceId + commandType`. MVP SHOULD return `failed` with a clear busy reason rather than queueing commands.

8. **CLI MUST avoid booting the cloud runtime path.**
   - Risk: Reusing full `runtimeapp.Process` can require credentials, start telemetry, and connect to Cloud, which is outside this slice.
   - Correction: T021 SHOULD build only the local source manager path from config for CLI execution. It MUST NOT connect to Cloud.

9. **Standalone CLI and running Edge runtime cannot share the serial port.**
   - Risk: If the main runtime is already polling COM7, the CLI can fail to open the port or interfere with timing.
   - Correction: T021-T025 MUST document and surface a clear port-open failure. Long-term in-process Cloud commands should call the same manager command path in the running runtime.

10. **Config validation SHOULD remain generic but strict for this slice.**
    - Risk: Validating `reportedMetric` only in the Modbus adapter delays operator feedback until source application.
    - Correction: T003 SHOULD validate device-local command structure generically in config where possible, and T014 SHOULD keep protocol-specific validation in the adapter.

### Required Task Adjustments

- T008 MUST include an in-flight command policy for `deviceId + commandType`.
- T013 MUST assert that command confirmation does not perform a separate Modbus read.
- T018 MUST implement adapter-local post-write observation tracking.
- T019 MUST combine a reported-metric observation count with an outer timeout guard.
- T021 MUST use local source manager wiring only and MUST NOT connect to Cloud.

## Review Trigger

Review this plan when Cloud command transport enters scope, when `set_number` enters scope, when Modbus adapter transaction scheduling changes, or when the Arduino register map changes.
