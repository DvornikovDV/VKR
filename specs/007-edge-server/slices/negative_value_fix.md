# Negative Modbus Metric Values Fix

## Scope

Document type: task plan.

Primary reader: AI agent or human developer implementing the Modbus signed-metric fix in `edge_server`.

This plan applies to Modbus metric reads in `edge_server` and the local documentation that defines the Edge source mapping contract.

## Goal

The `modbus_rtu` adapter MUST correctly emit signed numeric telemetry when a physical value is encoded in one 16-bit Modbus register as two's complement.

Example: a temperature value of `-40.0` encoded as `temperature_x10 = -400` MUST be emitted as `-40.0`, not `6513.6`.

## Constraints

- MUST keep the Modbus wire/register container as `uint16`.
- MUST add signed interpretation only at the metric-read mapping layer.
- MUST keep missing `mapping.dataType` backward-compatible as `uint16`.
- MUST apply `mapping.dataType` before `scale`.
- MUST keep normalized telemetry as `number | boolean`; DO NOT expose Modbus mapping metadata in Cloud telemetry.
- MUST NOT change Cloud RPC payloads, `CommandAudit`, or command status vocabulary.
- MUST NOT make `set_number` accept negative values or scaled physical values in this fix.
- MUST NOT add `uint32`, `int32`, `float32`, `byteOrder`, or `wordOrder` support in this MVP.
- SHOULD update documentation before code so implementation follows the mapping contract.

## Mapping Contract

Metric mappings MAY include optional `dataType`:

```yaml
mapping:
  registerType: input
  address: 0
  dataType: int16
  scale: 0.1
```

Supported MVP values:

| `mapping.dataType` | Meaning |
| --- | --- |
| omitted | Same as `uint16` |
| `uint16` | Interpret the raw 16-bit register as unsigned |
| `int16` | Interpret the raw 16-bit register as signed two's complement |

Conversion order:

1. Read the Modbus register into a `uint16` container.
2. Interpret the raw value using `mapping.dataType`.
3. Apply `scale`.
4. Publish the normalized metric value.

Required examples:

| Raw register | `dataType` | `scale` | Emitted value |
| ---: | --- | ---: | ---: |
| `400` | omitted | `0.1` | `40.0` |
| `400` | `uint16` | `0.1` | `40.0` |
| `400` | `int16` | `0.1` | `40.0` |
| `65136` | `int16` | `0.1` | `-40.0` |

## Execution Tasks

### Phase 1: Spec And Contract Updates

- [x] T001 Update the Modbus adapter boundary so source configuration owns register payload interpretation, including `mapping.dataType`, in `specs/007-edge-server/slices/protocol_adapter_mapping_boundary.md`
- [x] T002 [P] Add `mapping.dataType` to the `modbus_rtu` metric mapping contract, with omitted/`uint16` default and `int16` signed-read semantics, in `specs/007-edge-server/contracts/local-source-adapter.md`
- [x] T003 [P] Update the Edge runtime data model so `mapping.dataType` is documented as adapter-validated metric-read metadata, not Cloud telemetry, in `specs/007-edge-server/data-model.md`
- [x] T004 [P] Update the Arduino stand quickstart example so `environment.temperature` uses `dataType: int16` and humidity remains unsigned behavior in `specs/007-edge-server/quickstart.md`

### Phase 2: Sample And Firmware Contract

- [x] T005 Add `mapping.dataType: int16` only to the Arduino stand `environment.temperature` metric in `edge_server/samples/arduino-stand/edge-runtime.yaml`
- [x] T006 Make temperature register encoding explicit as signed-to-`uint16_t` container conversion while preserving `uint16_t inputRegisters[]` in `edge_server/engineering_system/engineering_system.ino`

### Phase 3: Focused Proofs Before Adapter Logic

- [x] T007 Add a sample config assertion that `environment.temperature.mapping.dataType` is preserved as `int16` and omitted mappings remain valid in `edge_server/go_core/internal/config/config_test.go`
- [x] T008 [P] Add a source conversion clone proof that arbitrary metric mapping fields such as `dataType` survive config-to-source conversion without mutating config-owned maps in `edge_server/go_core/internal/source/manager_test.go`
- [x] T009 Add Modbus adapter parsing and conversion proofs for omitted `dataType`, explicit `uint16`, positive `int16`, negative two's-complement `int16`, and invalid `dataType` in `edge_server/go_core/internal/source/modbus_serial_adapter_test.go`
- [x] T010 Add a production telemetry pipeline proof that raw `65136` with `dataType: int16` and `scale: 0.1` reaches the Cloud-bound reading as `-40.0` without source or Modbus mapping metadata in `edge_server/go_core/tests/integration/telemetry_pipeline_test.go`
- [x] T011 Verify existing `set_number` negative-value and unsigned-range regression coverage still proves rejection before Modbus write in `edge_server/go_core/internal/source/modbus_serial_adapter_test.go`

### Phase 4: Adapter Implementation

- [x] T012 Implement a `modbusMetricDataType` representation and store it in metric mappings without changing command mappings in `edge_server/go_core/internal/source/modbus_serial_adapter.go`
- [x] T013 Parse optional `mapping.dataType`, default it to `uint16`, accept only `uint16` and `int16`, and report invalid values at `devices[i].metrics[j].mapping.dataType` in `edge_server/go_core/internal/source/modbus_serial_adapter.go`
- [x] T014 Apply `dataType` before `scale` for numeric Modbus metrics and keep boolean conversion as `raw != 0` in `edge_server/go_core/internal/source/modbus_serial_adapter.go`
- [x] T015 Keep `set_number` write conversion, `min`/`max`, reported-metric confirmation, and desired-value telemetry suppression unchanged in `edge_server/go_core/internal/source/modbus_serial_adapter.go`

### Phase 5: Cross-Slice Non-Impact Review

- [x] T016 Review that Edge RPC bridge files still contain no Modbus-specific mapping logic in `edge_server/go_core/internal/cloud/commands.go`, `edge_server/go_core/internal/runtime/command_bridge.go`, and `edge_server/go_core/internal/runtimeapp/process.go`
- [x] T017 Review that Cloud command validation and OpenAPI remain command-only contracts and do not document local `mapping.dataType` in `cloud_server/src/services/commands.validation.ts`, `cloud_server/src/types/index.ts`, and `cloud_server/openapi.yaml`
- [x] T018 Review that `set_bool` behavior remains raw-boolean polling confirmation plus holding-register write semantics in `edge_server/go_core/internal/source/modbus_serial_adapter_test.go`

### Phase 6: Verification

- [x] T019 Run `go test ./internal/config -count=1` from `edge_server/go_core`
- [x] T020 Run `go test ./internal/source -count=1` from `edge_server/go_core`
- [x] T021 Run `go test ./tests/integration -run TestT015ProductionModbusRTUTelemetryPipeline -count=1` from `edge_server/go_core`
- [x] T022 If T016 or T017 found an unexpected command/RPC code change, run `go test ./internal/cloud ./internal/runtime ./internal/runtimeapp -count=1` from `edge_server/go_core`

## Cross-Slice Review

### `protocol_adapter_mapping_boundary.md`

- MUST update the adapter boundary to say source configuration owns register payload interpretation.
- MUST list `mapping.dataType` with `registerType`, `address`, `scale`, range, and type conversion rules.
- MUST update the temperature example to `dataType: int16`.

### `plan_set_number_slice.md`

- MUST preserve the rule that `set_number` writes integer register-domain values.
- MUST state or preserve that metric `dataType` is read-only mapping semantics.
- MUST verify negative `set_number` values are still rejected by `modbusCommandWriteValue`.
- MUST verify this fix does not introduce signed command ranges.

### `plan_set_bool_slice.md`

- MUST verify boolean metric conversion remains `raw != 0`.
- MUST verify `dataType` does not change `set_bool` write or confirmation behavior.

### `plan_edge_rpc_bridge_slice.md`

- MUST verify no Edge RPC bridge code imports Modbus-specific mapping logic.
- MUST verify the bridge still forwards `payload.value` to `source.Manager.ExecuteCommand(...)` without interpreting register encoding.
- MUST rerun bridge tests only if command request parsing, local command value semantics, or runtime bridge code changes.

### `plan_cloud_rpc_and_audit_slice.md`

- MUST verify Cloud remains unaware of Modbus `dataType`.
- MUST verify Cloud accepting a finite negative `set_number` payload still does not imply Edge writes it; Edge command validation remains authoritative.
- MUST NOT update OpenAPI for `mapping.dataType` because local Edge source mapping is not a Cloud API contract.

## Acceptance Checks

- Missing `mapping.dataType` preserves existing `uint16` telemetry behavior.
- `mapping.dataType: uint16` reads raw `400` with `scale: 0.1` as `40.0`.
- `mapping.dataType: int16` reads raw `400` with `scale: 0.1` as `40.0`.
- `mapping.dataType: int16` reads raw `65136` with `scale: 0.1` as `-40.0`.
- Invalid `mapping.dataType` fails during adapter definition application with a clear mapping error.
- Arduino temperature uses signed encoding intentionally while Modbus register arrays remain `uint16_t`.
- Cloud-bound telemetry can carry a negative numeric value and still omits source and Modbus mapping metadata.
- `set_number` command writes remain unsigned register-domain writes.
- Negative `set_number` payloads remain rejected by Edge before Modbus write.
- Cloud and Edge RPC contracts remain unchanged unless a later command-value design explicitly changes them.

## Review Trigger

Review this plan when:

- Modbus metric mapping adds another physical data type.
- Command writes gain signed, scaled, or floating-point conversion.
- Cloud starts storing or exposing local source mapping metadata.
- The telemetry pipeline changes how numeric readings are normalized.
