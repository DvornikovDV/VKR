# Implementation Batches: Edge Modbus Equipment Reconnect Resilience Slice

## Scope

These batches execute the task plan in `specs/007-edge-server/slices/plan_edge_modbus_equipment_reconnect_slice.md`.

Each batch references only task IDs from that task plan. Do not write these batches back into the slice plan file.

---

## Batch 1: Setup Constants And Test Seams

Execute `.agent\workflows\07a-speckit.implement.quickcheck.md` for the task batch in Scope.

Scope:
- TASK_IDS: T001, T002, T003
- TASKS_FILE: `specs/007-edge-server/slices/plan_edge_modbus_equipment_reconnect_slice.md`

Batch-specific constraints:
- Keep reconnect policy adapter-local and constant-based for MVP; do not add YAML fields.
- Test helpers must support deterministic open/read/write/close assertions without depending on real COM ports.

Main proof:
- The task files contain stable constants and reusable fake-client/status fixtures that later reconnect and status tests can consume.

Do not count this as success:
- Defining constants or fixtures that are unused, global to unrelated packages, or tied to Arduino-specific register addresses.

---

## Batch 2: Stored Definition And Client Lifecycle Helpers

Execute `.agent\workflows\07b-speckit.implement.experimental.md` for the task batch in Scope.

Scope:
- TASK_IDS: T004, T005
- TASKS_FILE: `specs/007-edge-server/slices/plan_edge_modbus_equipment_reconnect_slice.md`

Batch-specific constraints:
- Preserve the existing source adapter interface; reconnect state must stay inside `ModbusSerialAdapter`.
- Client open, close, and swap must preserve one active serial client per source.

Main proof:
- Existing Modbus adapter tests still pass, and later fake-client tests can observe client close/open order through the production adapter path.

Do not count this as success:
- Recreating the source definition by reapplying manager definitions, or introducing a second client path outside the existing adapter lifecycle.

---

## Batch 3: Reconnect State Machine Skeleton And Shutdown Safety

Execute `.agent\workflows\07b-speckit.implement.experimental.md` for the task batch in Scope.

Scope:
- TASK_IDS: T006, T007, T008, T009, T013
- TASKS_FILE: `specs/007-edge-server/slices/plan_edge_modbus_equipment_reconnect_slice.md`

Batch-specific constraints:
- Read and write transport failures must share adapter-local reconnect accounting when they indicate equipment loss.
- Reconnect/backoff must not hold command observation locks, source-manager locks, or unrelated locks.

Main proof:
- The shutdown cleanup test proves `Close()` stops reconnect/backoff work and prevents later open attempts after close.

Do not count this as success:
- A reconnect loop that works in the happy case but can continue running, reopen a client, or leak background work after adapter `Close()`.

---

## Batch 4: Runtimeapp Source Summary Projection Anchor

Execute `.agent\workflows\07a-speckit.implement.quickcheck.md` for the task batch in Scope.

Scope:
- TASK_IDS: T010
- TASKS_FILE: `specs/007-edge-server/slices/plan_edge_modbus_equipment_reconnect_slice.md`

Batch-specific constraints:
- Use existing source manager health snapshots and existing operator helpers.
- Do not add a new `status.json` schema field or a `reconnecting` source summary.

Main proof:
- Runtimeapp has a narrow helper path that can project source health into existing `healthy`, `degraded`, or `failed` status values.

Do not count this as success:
- Hardcoding `healthy`, adding schema values, or moving operator status projection logic into source adapters.

---

## Batch 5: Read-Side Disconnect And Polling Recovery

Execute `.agent\workflows\07b-speckit.implement.experimental.md` for the task batch in Scope.

Scope:
- TASK_IDS: T011, T012, T015, T016, T017
- TASKS_FILE: `specs/007-edge-server/slices/plan_edge_modbus_equipment_reconnect_slice.md`

Batch-specific constraints:
- A successful serial reopen alone must not publish telemetry, clear faults, or mark the source as `running`.
- Recovery must use the same parsed connection descriptor from the applied source definition.

Main proof:
- Fake Modbus clients prove repeated read failures close the stale client, reconnect attempts use the same settings, and readings resume only after a real successful poll.

Do not count this as success:
- Treating `Open()` success as recovery, publishing fake telemetry, or requiring runtime restart/reapply to recover.

---

## Batch 6: Source Health And Unaffected Source Regression

Execute `.agent\workflows\07a-speckit.implement.quickcheck.md` for the task batch in Scope.

Scope:
- TASK_IDS: T014
- TASKS_FILE: `specs/007-edge-server/slices/plan_edge_modbus_equipment_reconnect_slice.md`

Batch-specific constraints:
- Keep reconnect mechanics out of `source.Manager`; manager should react only to readings and faults.
- Preserve source-local degradation so one failed source does not block another source's readings.

Main proof:
- Source manager tests prove health moves away from `running`, returns to `running` only after an accepted reading, and unaffected source readings continue.

Do not count this as success:
- Adding Modbus-specific state to `source.Manager` or proving only adapter-local state without manager health behavior.

---

## Batch 7: Command Rejection While Equipment Is Unavailable

Execute `.agent\workflows\07b-speckit.implement.experimental.md` for the task batch in Scope.

Scope:
- TASK_IDS: T018, T021
- TASKS_FILE: `specs/007-edge-server/slices/plan_edge_modbus_equipment_reconnect_slice.md`

Batch-specific constraints:
- Disconnected or reconnecting equipment must fail commands quickly and must not queue commands.
- The unavailable command path must not perform a Modbus write.

Main proof:
- Adapter command tests prove disconnected/reconnecting state returns `failed` with a clear unavailable reason and no write call.

Do not count this as success:
- Letting commands wait for confirmation, block on reconnect, or return timeout when the adapter already knows the equipment is unavailable.

---

## Batch 8: Write Failure Reconnect And Lock Ordering

Execute `.agent\workflows\07b-speckit.implement.experimental.md` for the task batch in Scope.

Scope:
- TASK_IDS: T019, T020, T022, T023
- TASKS_FILE: `specs/007-edge-server/slices/plan_edge_modbus_equipment_reconnect_slice.md`

Batch-specific constraints:
- Write transport failures must enter the same reconnect path as read transport failures.
- Command observation locks must not be held during Modbus write, client close, client open, or reconnect backoff.

Main proof:
- Fake-client command tests prove write failure returns `failed`, skips confirmation waiting, and repeated write failures close/reopen through the reconnect path.

Do not count this as success:
- Returning `failed` from a write error while leaving the stale client in place, or fixing the test through helper-only state that production command execution does not use.

---

## Batch 9: Status Projection Tests And Mapping

Execute `.agent\workflows\07a-speckit.implement.quickcheck.md` for the task batch in Scope.

Scope:
- TASK_IDS: T024, T025, T026, T027
- TASKS_FILE: `specs/007-edge-server/slices/plan_edge_modbus_equipment_reconnect_slice.md`

Batch-specific constraints:
- Status projection must use existing `sourceSummary` and `runtimeStatus` values.
- Keep mapping local to `runtimeapp`; do not change public source or operator contracts.

Main proof:     
- Runtimeapp tests prove degraded/failed source health persists through existing `status.json` fields and recovery returns to healthy/trusted values without Cloud lifecycle changes.

Do not count this as success:
- Adding a new status schema value, changing Cloud availability semantics, or projecting status only in helper tests without the runtimeapp persistence path.

---

## Batch 10: Runtime Status Refresh Wiring

Execute `.agent\workflows\07b-speckit.implement.experimental.md` for the task batch in Scope.

Scope:
- TASK_IDS: T028, T029
- TASKS_FILE: `specs/007-edge-server/slices/plan_edge_modbus_equipment_reconnect_slice.md`

Batch-specific constraints:
- Runtime refresh must persist current runtime status without changing trust, credential, or Cloud connection state.
- Use `source.Manager.Faults()` and a separate `ReadingDispatcher` recovery-status consumer; do not attach a second direct consumer to `source.Manager.Readings()`.

Main proof:
- Runtimeapp status tests observe source fault and recovery updates through the production process wiring and existing status store.

Do not count this as success:
- Polling `HealthSnapshot()` from an unrelated goroutine without event wiring, or consuming `source.Manager.Readings()` directly in a way that can race telemetry/alarm consumers.

---

## Batch 11: Focused Verification

Execute `.agent\workflows\07a-speckit.implement.quickcheck.md` for the task batch in Scope.

Scope:
- TASK_IDS: T030, T031, T032
- TASKS_FILE: `specs/007-edge-server/slices/plan_edge_modbus_equipment_reconnect_slice.md`

Batch-specific constraints:
- Run the focused package tests from `edge_server/go_core`.
- Do not replace focused verification with hardware smoke or log inspection.

Main proof:
- `go test ./internal/source -count=1`, `go test ./internal/runtimeapp ./internal/operator -count=1`, and `go test ./internal/runtime -count=1` pass.

Do not count this as success:
- Running only a subset of the listed packages, relying on cached results, or skipping a failing package because the failure appears unrelated.

---

## Batch 12: Manual Smoke Documentation And Final Review

Execute `.agent\workflows\07a-speckit.implement.quickcheck.md` for the task batch in Scope.

Scope:
- TASK_IDS: T033, T034
- TASKS_FILE: `specs/007-edge-server/slices/plan_edge_modbus_equipment_reconnect_slice.md`

Batch-specific constraints:
- Manual smoke must explicitly separate fake-client automated proof from physical Windows COM-port unplug/replug proof.
- Technical Lead Review must check scope, lock ordering, stale client lifecycle, command safety, source health projection, shutdown cleanup, and Lean Testing discipline.

Main proof:
- The slice plan contains final manual smoke criteria and a completed Technical Lead Review section grounded in the implemented behavior and test results.

Do not count this as success:
- Treating logs alone as hardware proof, or marking review complete without checking that polling actually recovers after physical reconnect.
