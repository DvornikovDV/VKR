# Edge Modbus Equipment Reconnect Resilience Slice

## Purpose

This slice MUST make the Edge Modbus RTU equipment path resilient to local Arduino or serial transport loss without treating equipment loss as cloud trust loss.

The runtime MUST keep the Edge process and Cloud session behavior alive while the affected local source degrades, reconnects, and resumes real polling after the equipment becomes available again.

## Scope

This plan applies only to `edge_server`.

- MUST add resilient reconnect behavior to the existing `modbus_rtu` adapter.
- MUST detect repeated Modbus or serial read/write failures as equipment connection degradation for the affected source.
- MUST close the stale Modbus serial client after the MVP failure threshold is reached.
- MUST reopen the Modbus serial connection from the already parsed source connection descriptor.
- MUST resume normal polling after reconnect succeeds.
- MUST restore source health to `running` only after a real successful polling reading.
- MUST fail commands clearly while the equipment connection is disconnected or reconnecting.
- MUST keep polling reads and command writes serialized on the same Modbus serial connection.
- MUST add logs that make manual Arduino unplug/replug investigation clear: disconnect detected, reconnect attempt, reconnect success, and reconnect failure reason.
- MAY update `status.json` projection only through the existing `runtimeapp` status persistence path and existing source/operator health helpers.

## Out Of Scope

- MUST NOT add new YAML reconnect policy fields in this slice.
- MUST NOT add new protocol adapters such as OPC UA or MQTT.
- MUST NOT add Arduino-specific hardcoding to generic Modbus adapter logic.
- MUST NOT add fake telemetry during equipment disconnect.
- MUST NOT add durable telemetry buffering or replay.
- MUST NOT queue commands while equipment is disconnected.
- MUST NOT change Cloud reconnect, credential, lifecycle, or trust semantics.
- MUST NOT add Client or Constructor UI changes.
- MUST NOT introduce a new operator status schema unless the existing schema cannot represent the required state.
- MUST NOT treat automated fake-client tests as proof of physical Windows COM-port unplug/replug behavior.

## Assumptions

- The active equipment path for this slice is the existing `modbus_rtu` adapter used by the Arduino stand.
- The existing source manager health model is sufficient to represent source-local `running`, `degraded`, and `failed` states.
- The existing operator status schema is sufficient to represent local source degradation through `sourceSummary: degraded` or `sourceSummary: failed` and `runtimeStatus: degraded`.
- The existing operator status schema has no separate `reconnecting` source summary. Reconnecting equipment MUST be represented through the existing degraded or failed source summary plus a non-secret `lastReason` when the runtime status path persists one.
- Equipment reconnect policy MAY use conservative adapter-local constants for MVP threshold and backoff behavior.
- The configured Windows COM port must remain the same after physical reconnect. If Windows assigns a different COM port, operator configuration or OS-level port assignment must be corrected outside this slice.
- Manual hardware smoke is required because unit tests cannot prove real USB/COM device removal and re-enumeration behavior.

## Constraints

- MUST treat `doc_cursed/edge_equipment_reconnect_resilience_plan.md` as the source of truth for this reliability behavior.
- MUST keep equipment reconnect ownership inside the local source adapter boundary.
- MUST keep Cloud lifecycle authority outside the adapter and source manager.
- MUST keep one active serial client per source.
- MUST NOT create concurrent serial clients for the same source during reconnect.
- MUST stop the reconnect loop on adapter `Close()` or runtime shutdown.
- MUST protect client replacement, client close, polling reads, and command writes with a consistent synchronization strategy.
- MUST NOT hold command observation locks, source-manager locks, or other unrelated locks while performing Modbus I/O, closing a client, opening a client, or sleeping for reconnect backoff.
- MUST feed read and write transport failures into the same adapter-local reconnect accounting when they indicate equipment transport loss.
- MUST classify reconnect-triggering failures narrowly enough to avoid reconnecting on static mapping or config validation errors.
- MUST keep source health degraded or failed while reconnecting.
- MUST NOT mark source health as `running` merely because a serial port opened.
- MUST publish normal telemetry only from successfully acquired readings.
- MUST keep device-specific register addresses in YAML, tests, or smoke notes, not in generic adapter code.
- MUST fail commands during disconnected or reconnecting state with a clear unavailable reason.
- MUST fail commands when the Modbus write itself fails; such commands MUST NOT return `confirmed`.
- SHOULD log reconnect events without credentials, secrets, or cloud auth material.
- MUST apply the Lean Testing Policy: automated proof MUST cover the main happy path and the main reconnect/command risk without broad validation matrices.
- MUST NOT use logs as a substitute for manual Arduino unplug/replug proof.

## Acceptance Checks

- Given a configured `modbus_rtu` source, repeated fake Modbus read failures MUST publish source faults and move the affected source health away from `running`.
- When the failure threshold is reached, the adapter MUST close the stale client exactly once for that disconnect episode and enter reconnect behavior.
- During reconnect, polling MUST not use a nil, stale, or concurrently replaced client.
- Reconnect attempts MUST create a fresh client using the same parsed connection settings from the applied source definition.
- A successful serial reopen alone MUST NOT publish telemetry, clear a fault, or mark the source as `running`.
- When a later fake client opens and polling succeeds, normal readings MUST resume.
- Source health MUST return to `running` only after a successful reading is accepted by the source manager.
- A command submitted while the source is disconnected or reconnecting MUST return `failed` quickly with a clear unavailable reason.
- A Modbus write transport failure MUST return `failed`, MUST NOT wait for confirmation as if the write succeeded, and MUST move the adapter toward reconnect behavior.
- Repeated Modbus write transport failures MUST close and reopen the stale client through the same reconnect behavior used for repeated read transport failures.
- Adapter `Close()` MUST stop polling and reconnect activity and close the current client without leaving background reconnect work active.
- If another source remains healthy, its readings MUST remain eligible for normal telemetry while the failed source reconnects.
- Local equipment loss MUST NOT mark the Cloud session untrusted and MUST NOT change Cloud lifecycle semantics.
- `status.json` SHOULD reflect source degradation through existing status fields when the runtime status path is active.
- Manual Arduino hardware smoke MUST prove the real Windows COM-port path: normal polling, physical unplug, logged disconnect/degradation without process exit, reconnect attempts, physical replug, reconnect success, resumed telemetry, and command success only after polling recovery.
- Manual smoke MUST NOT count as successful if only the Edge process stays alive but polling never recovers.

## Source Of Truth

- `doc_cursed/edge_equipment_reconnect_resilience_plan.md`
- `specs/007-edge-server/contracts/local-source-adapter.md`
- `specs/007-edge-server/contracts/operator-status-snapshot.md`

## Format

Tasks use the strict checklist format:

`- [ ] T001 [P?] [US?] Description with file path`

- `[P]` means the task can run in parallel with other marked tasks because it touches different files and does not depend on incomplete tasks.
- `[US1]`, `[US2]`, and `[US3]` map to the independently testable runtime stories below.
- This document intentionally does not include implementation batches.

## Phase 1: Setup

**Purpose**: Establish reconnect constants, test seams, and status-projection anchors before changing runtime behavior.

- [X] T001 Add adapter-local reconnect state names and conservative MVP reconnect constants in `edge_server/go_core/internal/source/modbus_serial_adapter.go`
- [X] T002 [P] Add sequential fake Modbus client factory helpers for open/read/write/close assertions in `edge_server/go_core/internal/source/modbus_serial_adapter_test.go`
- [X] T003 [P] Add runtimeapp source-health-to-operator-summary test fixtures for status projection work in `edge_server/go_core/internal/runtimeapp/process_test.go`

**Checkpoint**: The slice has stable constants, fake-client proof seams, and status-projection test anchors before behavior is wired.

---

## Phase 2: Foundational Reconnect Infrastructure

**Purpose**: Refactor the Modbus adapter around explicit client lifecycle state without changing the public source adapter contract.

- [X] T004 Store the parsed Modbus serial connection descriptor, metric mappings, command mappings, source ID, and sink for reconnect reuse in `edge_server/go_core/internal/source/modbus_serial_adapter.go`
- [X] T005 Implement client replacement helpers that open, close, and swap Modbus clients under the existing transaction serialization boundary in `edge_server/go_core/internal/source/modbus_serial_adapter.go`
- [X] T006 Implement adapter-local transport failure classification and shared read/write reconnect accounting in `edge_server/go_core/internal/source/modbus_serial_adapter.go`
- [X] T007 Implement state-aware snapshots for polling and commands so disconnected or reconnecting state is visible without exposing a new adapter interface in `edge_server/go_core/internal/source/modbus_serial_adapter.go`
- [X] T008 Implement a state-aware poll/reconnect loop skeleton that stops on adapter `Close()` or runtime context cancellation in `edge_server/go_core/internal/source/modbus_serial_adapter.go`
- [X] T009 Add non-secret reconnect observability logs for disconnect detection, reconnect attempt, reconnect failure, and reconnect success in `edge_server/go_core/internal/source/modbus_serial_adapter.go`
- [X] T010 [P] Add a runtimeapp source summary projection helper that maps `source.Manager.HealthSnapshot()` through existing operator health helpers in `edge_server/go_core/internal/runtimeapp/process.go`

**Checkpoint**: The adapter can own reconnect lifecycle state and runtimeapp has a narrow way to project source health without schema changes.

---

## Phase 3: User Story 1 - Recover Modbus Polling After Equipment Loss (Priority: P1)

**Goal**: A configured Modbus RTU source degrades after repeated transport failures, closes its stale serial client, reconnects with the same source definition, and resumes real polling without restarting Edge.

**Independent Test**: Use fake Modbus clients to force repeated read failures, verify stale client close and reconnect attempts, then provide a later successful client and verify readings resume only after a real successful poll.

### Tests for User Story 1

- [X] T011 [US1] Add a reconnect test proving repeated read failures publish faults, close the stale client once for the disconnect episode, and enter reconnect behavior in `edge_server/go_core/internal/source/modbus_serial_adapter_test.go`
- [X] T012 [US1] Add a reconnect recovery test proving later open success uses the same parsed connection settings, does not publish telemetry on open alone, and resumes readings only after successful polling in `edge_server/go_core/internal/source/modbus_serial_adapter_test.go`
- [X] T013 [US1] Add a shutdown cleanup test proving adapter `Close()` stops reconnect/backoff activity and closes the current client without later open attempts in `edge_server/go_core/internal/source/modbus_serial_adapter_test.go`
- [X] T014 [US1] Add a source manager health and unaffected-source proof that source health moves away from `running`, returns to `running` only after a recovered reading, and does not block another source's readings in `edge_server/go_core/internal/source/manager_test.go`

### Implementation for User Story 1

- [X] T015 [US1] Implement read-failure threshold handling that transitions the Modbus adapter from connected polling into reconnect behavior in `edge_server/go_core/internal/source/modbus_serial_adapter.go`
- [X] T016 [US1] Implement reconnect attempts with adapter-local backoff constants, current-client closure, fresh-client creation, `Open()`, and existing settle delay reuse in `edge_server/go_core/internal/source/modbus_serial_adapter.go`
- [X] T017 [US1] Ensure successful reconnect resumes the normal poll loop without marking source health `running` until a real reading is published in `edge_server/go_core/internal/source/modbus_serial_adapter.go`

**Checkpoint**: Read-side equipment loss and recovery are proven with fake clients and remain source-local.

---

## Phase 4: User Story 2 - Fail Commands Safely While Equipment Is Unavailable (Priority: P1)

**Goal**: Commands targeting disconnected or reconnecting Modbus equipment fail clearly and are not queued, replayed, or reported as confirmed.

**Independent Test**: Force write transport failures and disconnected/reconnecting state with fake Modbus clients, then verify command results are `failed`, confirmation waiting is skipped when write did not succeed, and reconnect accounting is shared with polling failures.

### Tests for User Story 2

- [X] T018 [US2] Add a command test proving disconnected or reconnecting adapter state returns `failed` quickly with an unavailable reason and performs no Modbus write in `edge_server/go_core/internal/source/modbus_serial_adapter_test.go`
- [X] T019 [US2] Add a write-failure test proving a Modbus write transport failure returns `failed`, skips confirmation waiting, and feeds reconnect accounting in `edge_server/go_core/internal/source/modbus_serial_adapter_test.go`
- [X] T020 [US2] Add a repeated write-failure reconnect test proving write failures can close and reopen the stale client through the same reconnect path as read failures in `edge_server/go_core/internal/source/modbus_serial_adapter_test.go`

### Implementation for User Story 2

- [X] T021 [US2] Update command execution snapshots to reject disconnected or reconnecting equipment before Modbus write in `edge_server/go_core/internal/source/modbus_serial_adapter.go`
- [X] T022 [US2] Route write transport failures into the shared reconnect accounting and transition path in `edge_server/go_core/internal/source/modbus_serial_adapter.go`
- [X] T023 [US2] Preserve strict lock ordering so command observation locks are not held during Modbus write, client close, client open, or reconnect backoff in `edge_server/go_core/internal/source/modbus_serial_adapter.go`

**Checkpoint**: Command behavior is safe during equipment loss and cannot produce false confirmation.

---

## Phase 5: User Story 3 - Reflect Source Degradation In Local Operator Status (Priority: P2)

**Goal**: Existing local operator status projection reflects Modbus source degradation and recovery through the current `status.json` schema without adding Client UI, Cloud contracts, or a new status schema.

**Independent Test**: Use runtimeapp tests with fake sources to publish source faults and recovery readings, then verify `status.json` uses existing `sourceSummary` and `runtimeStatus` values while Cloud connection semantics remain unchanged.

### Tests for User Story 3

- [X] T024 [US3] Add a runtimeapp test proving a trusted runtime with a failed or degraded source persists `status.json` with existing degraded/failed source summary fields in `edge_server/go_core/internal/runtimeapp/process_test.go`
- [X] T025 [US3] Add a runtimeapp recovery test proving a later accepted source reading allows the next status projection to return to healthy/trusted values without changing Cloud lifecycle fields in `edge_server/go_core/internal/runtimeapp/process_test.go`

### Implementation for User Story 3

- [X] T026 [US3] Add a runtimeapp-local mapper from `source.SourceHealthSnapshot` states to `operator.SourceHealthSnapshot` states without changing public source or operator contracts in `edge_server/go_core/internal/runtimeapp/process.go`
- [X] T027 [US3] Update `runtimeStatusProjector` to compute source summary from current `source.Manager.HealthSnapshot()` through the runtimeapp mapper and existing operator helpers in `edge_server/go_core/internal/runtimeapp/process.go`
- [X] T028 [US3] Add a narrow runtime status refresh method that persists the current runtime state/status without changing trust, credential, or Cloud connection state in `edge_server/go_core/internal/runtime/runtime.go`
- [X] T029 [US3] Wire runtimeapp status refresh from `source.Manager.Faults()` and a separate `ReadingDispatcher` recovery-status consumer, avoiding a second direct consumer on `source.Manager.Readings()`, in `edge_server/go_core/internal/runtimeapp/process.go`

**Checkpoint**: Local operator status exposes source degradation through existing schema values and does not redefine cloud availability or lifecycle.

---

## Phase 6: Polish, Verification, And Review

**Purpose**: Verify the narrow reconnect slice, keep proof lean, and document the manual hardware boundary.

- [X] T030 Run focused source tests with `go test ./internal/source -count=1` from `edge_server/go_core`, covering `edge_server/go_core/internal/source`
- [X] T031 Run focused runtimeapp/operator tests with `go test ./internal/runtimeapp ./internal/operator -count=1` from `edge_server/go_core`, covering `edge_server/go_core/internal/runtimeapp` and `edge_server/go_core/internal/operator`
- [X] T032 Run focused runtime regression tests with `go test ./internal/runtime -count=1` from `edge_server/go_core`, covering `edge_server/go_core/internal/runtime`
- [X] T033 Add final manual Arduino unplug/replug smoke instructions and success/failure criteria in `specs/007-edge-server/slices/plan_edge_modbus_equipment_reconnect_slice.md`
- [X] T034 Complete Technical Lead Review for reconnect scope, lock ordering, stale client lifecycle, source health projection, command safety, shutdown cleanup, and Lean Testing Policy in `specs/007-edge-server/slices/plan_edge_modbus_equipment_reconnect_slice.md`

---

## Fix Batch: Classify And Diagnose Unknown Runtime Modbus I/O Failures

**Trigger**: Physical Windows COM-port smoke on 2026-06-07 proved that source health moved to `failed` after unplug, but the adapter did not enter observable reconnect behavior and real polling did not resume after replug. Restarting Edge with the Arduino already connected restored polling.

**Confirmed failure cause**: Physical Windows COM-port smoke captured runtime read failure `syscall.Errno(5)` / `Access is denied` with diagnostic decision `ignored`. The previous message-dependent classifier therefore published source faults without feeding reconnect accounting, leaving the stale serial client active and preventing reconnect attempts after replug.

**Design rule**: Classification MUST use the boundary where an error originated and an explicit recovery-decision matrix, not an expanding list of operating-system message strings. Confirmed Modbus exception responses, static/configuration errors, and adapter-internal lifecycle errors MUST be excluded from reconnect accounting. RTU link-integrity failures, timeouts, OS I/O failures, and otherwise unknown errors returned directly by an accepted runtime Modbus read or write MUST be diagnosed as reconnect candidates and feed the existing shared reconnect threshold.

**Recovery-decision matrix**:

- `static_or_internal`: adapter lifecycle errors, `modbus.ErrConfigurationError`, and `modbus.ErrUnexpectedParameters`; publish or return the existing failure but do not reconnect.
- `device_exception_response`: typed Modbus exception responses such as illegal function/address/value, server device failure/busy, acknowledge, parity error, and gateway exception responses; the peer returned a valid exception response, so publish the fault but do not reconnect.
- `link_integrity_candidate`: `modbus.ErrBadCRC`, `modbus.ErrShortFrame`, `modbus.ErrProtocolError`, and `modbus.ErrBadUnitId`; feed the reconnect threshold because repeated framing or identity failures can require line/client re-synchronization.
- `transport_candidate`: timeout, EOF/closed connection, OS I/O errors, and any otherwise unknown error returned directly by accepted runtime `ReadRegister` or `WriteRegister`; feed the reconnect threshold.
- OS error code extraction is best-effort diagnostic metadata only. Missing `syscall.Errno` MUST NOT change the recovery decision.

**Scope boundaries**:

- MUST preserve the existing reconnect state machine, threshold, backoff, client lifecycle, and lock ordering.
- MUST apply one classification and diagnostic path to both polling reads and command writes.
- MUST retain the original error as the cause and expose safe diagnostic fields sufficient to distinguish operation, recovery class, concrete error type, and wrapped OS error code when available.
- MUST log the first accepted runtime read/write failure in a diagnostic failure streak, including the current reconnect decision, so an error currently ignored by reconnect accounting is still observable without logging every repeated poll failure.
- MUST keep the diagnostic failure streak separate from reconnect accounting: it starts on the first accepted runtime read/write failure, resets after a fully successful poll or successful write, and does not reset because another register in the same poll succeeded.
- MUST preserve the existing all-or-nothing poll behavior: a poll containing any reconnect candidate MUST NOT publish partial telemetry or reset reconnect accounting because another register read succeeded.
- MUST NOT rely on Windows-specific PnP monitoring or message strings as the primary disconnect detector.
- MUST NOT change initial source application behavior when the COM port is absent at Edge startup.
- MUST NOT change source manager, runtimeapp, Cloud lifecycle, public adapter contracts, YAML schema, or operator status schema.

### Fix Tasks

- [X] T035 Confirm the recovery-decision matrix against the pinned `github.com/simonvetter/modbus` and `github.com/goburrow/serial` source paths, documenting which errors prove a Modbus exception response, which represent RTU link integrity, and which preserve OS I/O errors in this plan
- [X] T036 Add a small adapter-local runtime I/O diagnostic value and typed adapter-internal lifecycle errors, keeping OS error code extraction optional and retaining the original cause in `edge_server/go_core/internal/source/modbus_serial_adapter.go`
- [X] T037 Add first-failure diagnostic streak logging around accepted runtime read/write I/O without changing the current reconnect decision policy, so a later physical smoke automatically records operation, current decision, concrete error type, optional OS code, and message even when the current policy ignores that error in `edge_server/go_core/internal/source/modbus_serial_adapter.go`
- [X] T038 Add focused tests for diagnostic extraction, internal-error identification, first-failure/streak reset semantics, optional OS error codes, and absence of repeated-poll log flooding in `edge_server/go_core/internal/source/modbus_serial_adapter_test.go`
- [X] T039 Replace message-allowlist recovery decisions with the documented matrix and route both accepted polling read and command write errors through it without changing reconnect state transitions, threshold, lock ordering, or confirmation behavior in `edge_server/go_core/internal/source/modbus_serial_adapter.go`
- [X] T040 Add focused decision tests proving static/internal and confirmed exception responses do not reconnect, while link-integrity, timeout/OS I/O, and unknown accepted runtime read/write errors reach the existing reconnect threshold; retain proof that a mixed-success poll publishes no partial telemetry in `edge_server/go_core/internal/source/modbus_serial_adapter_test.go`
- [X] T041 Run `go test ./internal/source -count=1` from `edge_server/go_core` and confirm existing reconnect, command safety, serialization, stale-client lifecycle, partial-poll suppression, and shutdown tests remain green
- [X] T042 Repeat the Physical Windows COM-Port Unplug/Replug Proof as the only required manual fact-gathering step; record the automatically emitted unplug diagnostic, confirm Windows restored the same configured COM port, and prove reconnect attempts, successful post-replug polling, source health recovery, and post-recovery command result in this plan
- [X] T043 Reopen and complete Technical Lead Review for the evidence-backed recovery matrix, diagnostic safety, unchanged lock/client lifecycle, Lean Testing discipline, and physical polling recovery evidence in this plan

### Fix Dependencies And Completion Gate

- T036 depends on T035.
- T037 depends on T036.
- T038 depends on T037.
- T039 depends on T035 and T038.
- T040 depends on T039.
- T041 depends on T040.
- T042 depends on T041.
- T043 depends on T041 and T042.
- T034 depends on T043 and MUST remain unchecked until physical polling recovery is proven.

**Fix-batch completion requires** both focused automated proof and physical Windows COM-port proof that real polling resumes after replug. Logs, source degradation, or successful reconnect classification alone MUST NOT close the batch.

### Physical Reconnect Proof Record

Physical Windows COM-port smoke completed successfully on 2026-06-07 using the configured Arduino stand source and unchanged configured COM port.

- At `18:23:35`, physical unplug produced runtime read failure `syscall.Errno(5)` / `Access is denied` with `currentDecision=reconnect_candidate`.
- At `18:23:37`, the existing failure threshold produced `disconnect detected`; the stale client was removed from the active adapter slot even though Windows returned `Access is denied` while closing its invalidated handle.
- Reconnect attempts ran while the device was absent and failed clearly with `The system cannot find the file specified`.
- At `18:23:47`, after physical replug, the adapter logged `reconnect succeeded after successful poll`.
- After recovery, `status.json` reported `sourceSummary: healthy`, and `runtime-state.json` recorded later telemetry at `2026-06-07T09:38:54.2425078Z`, proving polling and telemetry continued after reconnect rather than relying on the reconnect log alone.
- The operator confirmed the safe post-recovery command and shutdown checks completed successfully.

### Pinned Library Facts For T035

- `github.com/simonvetter/modbus@v1.6.4` maps valid Modbus exception responses to typed exception errors: illegal function/address/value, server device failure/busy, acknowledge, memory parity, gateway path unavailable, and gateway target failed to respond.
- The same library emits `ErrBadCRC`, `ErrShortFrame`, `ErrProtocolError`, and `ErrBadUnitId` for RTU framing, response validation, or unit identity failures; these do not prove a valid Modbus exception response.
- `ErrConfigurationError` and `ErrUnexpectedParameters` originate from static client/request validation and do not indicate runtime equipment transport loss.
- `ErrRequestTimedOut` represents runtime request timeout. Other serial read/write failures can pass through from the underlying serial implementation.
- `github.com/goburrow/serial@v0.1.0` calls Windows `syscall.ReadFile` and `syscall.WriteFile` directly and returns their errors, so a wrapped `syscall.Errno` may be available for diagnosis. Timeout is normalized to the library's timeout error, so OS error code presence is optional.

---

## Dependencies And Execution Order

### Phase Dependencies

- Phase 1 has no code dependencies.
- Phase 2 depends on Phase 1 because reconnect implementation needs constants, test seams, and projection anchors.
- Phase 3 depends on Phase 2 client lifecycle and state-aware polling infrastructure.
- Phase 4 depends on Phase 2 command state snapshots and SHOULD run after the read-side reconnect path exists.
- Phase 5 depends on source health behavior from Phase 3 and the runtimeapp projection helper from Phase 2.
- Phase 6 depends on Phase 3, Phase 4, and Phase 5 implementation completion.

### Task Dependencies

- T004 depends on T001.
- T005 depends on T004.
- T006 depends on T004 and T005.
- T007 depends on T004 and T006.
- T008 depends on T005, T006, and T007.
- T009 depends on T006 and T008.
- T010 depends on T003.
- T011 and T012 depend on T002, T004, T005, T006, and T008.
- T013 depends on T002, T005, and T008.
- T014 depends on T011 behavior expectations and the existing `source.Manager` health model.
- T015 depends on T006 and T011.
- T016 depends on T005, T008, T012, and T015.
- T017 depends on T012 and T016.
- T018 depends on T007.
- T019 depends on T006 and the state contract proven by T018.
- T020 depends on T015 and the expected write-failure behavior from T019.
- T021 depends on T007 and T018.
- T022 depends on T006, T019, and T021.
- T023 depends on T005, T015, and T022.
- T024 and T025 depend on T003 and T010.
- T026 depends on T010, T024, and T025.
- T027 depends on T010, T024, T025, and T026.
- T028 depends on T024 and T027.
- T029 depends on T027 and T028.
- T030 through T034 depend on the relevant implementation phases being complete.

## Parallel Opportunities

- T002 and T003 can run in parallel after T001 because they touch separate test files.
- T009 can run in parallel with T010 because reconnect logs and runtimeapp projection helpers touch separate packages.
- T013 can run in parallel with T011 and T012 after reconnect state expectations are agreed.
- T014 can run in parallel with T011 and T012 after expected source health transitions are agreed.
- T018 can run in parallel with T011 because command unavailable behavior and read-side disconnect proof can share only the adapter state contract.
- T024 and T025 can run in parallel with late Phase 4 command work because they target runtimeapp status projection.
- T030, T031, and T032 can run in parallel after implementation is complete.

### Parallel Example: User Story 1

```text
Task: "Add a reconnect recovery test proving later open success uses the same parsed connection settings, does not publish telemetry on open alone, and resumes readings only after successful polling in `edge_server/go_core/internal/source/modbus_serial_adapter_test.go`"
Task: "Add a source manager health proof that source health moves away from `running` on reconnect faults and returns to `running` only after a recovered reading in `edge_server/go_core/internal/source/manager_test.go`"
```

### Parallel Example: User Story 2

```text
Task: "Add a command test proving disconnected or reconnecting adapter state returns `failed` quickly with an unavailable reason and performs no Modbus write in `edge_server/go_core/internal/source/modbus_serial_adapter_test.go`"
Task: "Update command execution snapshots to reject disconnected or reconnecting equipment before Modbus write in `edge_server/go_core/internal/source/modbus_serial_adapter.go`"
```

### Parallel Example: User Story 3

```text
Task: "Add a runtimeapp test proving a trusted runtime with a failed or degraded source persists `status.json` with existing degraded/failed source summary fields in `edge_server/go_core/internal/runtimeapp/process_test.go`"
Task: "Update `runtimeStatusProjector` to compute source summary from current `source.Manager.HealthSnapshot()` through existing operator helpers in `edge_server/go_core/internal/runtimeapp/process.go`"
```

## Implementation Strategy

### MVP First

1. Complete Phase 1 and Phase 2 to make reconnect state explicit without changing external contracts.
2. Complete Phase 3 to prove equipment reconnect from read failures, stale client closure, fresh client open, and polling recovery.
3. Complete Phase 4 to close the main safety risk: commands must fail clearly while equipment is unavailable and must not return false confirmation.
4. Complete Phase 5 only through the existing status projection path and existing schema values.
5. Complete Phase 6 targeted tests and manual hardware smoke.

### Runtime Bias

- Prefer adapter-local state and constants over YAML schema growth in this MVP.
- Keep reconnect per source and inside the `modbus_rtu` adapter.
- Keep Cloud trust and reconnect lifecycle untouched.
- Keep source health recovery tied to real accepted readings.
- Keep status projection schema-compatible and local to runtimeapp/operator helpers.
- Keep tests focused on state transitions, close/reopen behavior, command rejection, shutdown cleanup, and status projection. Do not expand into broad validation matrices.

## Manual Hardware Smoke

### Automated Fake-Client Proof

Automated fake-client tests prove adapter behavior without claiming physical hardware behavior:

1. Run `go test ./internal/source -count=1` from `edge_server/go_core`.
2. Run `go test ./internal/runtimeapp ./internal/operator -count=1` from `edge_server/go_core`.
3. Run `go test ./internal/runtime -count=1` from `edge_server/go_core`.
4. Require all commands to pass before starting the physical smoke.

This proof covers repeated read/write transport failures, stale-client close and replacement, same-definition reconnect, polling recovery only after a successful fake-client read, command rejection while unavailable, source health projection, and shutdown cleanup. It MUST NOT be recorded as proof of Windows COM-port unplug/replug recovery.

### Physical Windows COM-Port Unplug/Replug Proof

Use the Arduino stand and `edge_server/samples/arduino-stand/edge-runtime.yaml`. Record the configured COM port, test time, and observed telemetry metric/value changes.

1. Connect the Arduino and verify Windows exposes the same COM port configured in `edge-runtime.yaml`.
2. Start Edge and confirm at least two real Modbus polling cycles produce current telemetry.
3. Send one safe configured command and confirm it succeeds before disconnect.
4. Physically unplug the Arduino or USB/serial path.
5. Confirm the Edge process remains alive, the source becomes degraded or failed through existing status fields, and commands to that source fail without being queued.
6. Confirm logs show disconnect detection, reconnect attempts, and failure reasons while the COM device is absent.
7. Physically reconnect the Arduino and verify Windows assigns the same configured COM port.
8. Confirm logs show reconnect success, then independently confirm at least two new real telemetry readings arrive from polling after replug.
9. Confirm `status.json` returns to the existing healthy/running source summary only after those recovered readings.
10. Send one safe configured command after polling recovery and confirm it succeeds.
11. Stop Edge and confirm the process exits without continued reconnect activity.

### Success Criteria

- The physical device was unplugged and replugged on Windows; fake-client execution or logs alone do not satisfy this criterion.
- Edge stayed alive while the device was absent.
- Commands failed clearly while the source was unavailable and were not replayed later.
- Real polling resumed after physical replug, demonstrated by at least two new telemetry readings.
- Source health recovered only after real polling resumed.
- A safe command succeeded after polling recovery.
- Shutdown left no continued reconnect activity.

### Failure Criteria

- The Edge process exits or requires restart.
- Windows assigns a different COM port and the unchanged configuration cannot reconnect.
- Logs claim reconnect success but real telemetry does not resume.
- Source health returns to running before a real recovered reading.
- A command is queued, falsely confirmed, or executed while the source is unavailable.
- Polling or reconnect activity continues after shutdown.

Smoke success MUST require resumed real polling after physical reconnect. A live Edge process, passing fake-client tests, or reconnect logs without recovered polling MUST NOT count as success.

## Technical Lead Review

### Review Execution Record

Review date: 2026-06-07

Automated validation results:

- `go test ./internal/source -count=1`: PASS
- `go test ./internal/runtimeapp ./internal/operator -count=1`: PASS
- `go test ./internal/runtime -count=1`: PASS

Review findings:

- **Scope and ownership: PASS.** Reconnect behavior remains in the generic `modbus_rtu` adapter under `edge_server`; no Arduino-specific addresses or names were added, and Cloud credential, trust, and lifecycle behavior was not changed.
- **Lock ordering and I/O serialization: PASS.** `transactionMu` serializes polling reads, command writes, client close, and client replacement. Lifecycle state locks are acquired consistently under that boundary where client identity must be checked. Reconnect backoff does not hold adapter, command observation, or source-manager locks.
- **Stale client lifecycle: PASS.** The stale client is swapped out and closed before a fresh client is opened. Fake-client tests prove one close per disconnect episode, same parsed connection settings on replacement, rejection of stale snapshots, and no later open attempts after `Close()`.
- **Recovery decision scope: PASS.** Message-dependent recognition was replaced with a boundary-aware recovery matrix. Static/internal and valid Modbus exception responses are excluded; RTU link-integrity, OS I/O, timeout, and unknown accepted runtime read/write errors feed the existing reconnect threshold. Physical smoke proved the previously ignored Windows `syscall.Errno(5)` now enters reconnect behavior.
- **Diagnostic safety: PASS.** Diagnostics retain the original error, expose operation/current decision/concrete type and optional OS code, contain no credentials or Cloud auth material, and suppress repeated logs within a failure streak.
- **Command safety: PASS.** Commands fail quickly without Modbus writes while disconnected or reconnecting. Write transport failures return `failed`, enter shared reconnect accounting, and skip confirmation waiting; commands are not queued or replayed.
- **Source health projection: PASS.** Source faults move health away from running, accepted recovered readings restore it, and runtimeapp projects existing operator summary values without adding a `reconnecting` schema value or changing Cloud lifecycle fields. Physical smoke ended with `sourceSummary: healthy` and later telemetry after the successful recovery poll.
- **Shutdown cleanup: PASS.** Focused tests prove `Close()` cancels polling/reconnect backoff, waits for in-flight open work, closes the current client, and prevents later reconnect attempts.
- **Lean Testing Policy: PASS.** The focused suites cover the main reconnect, command, projection, and shutdown risks without a broad validation matrix. Fake-client and log tests are explicitly not treated as physical COM-port proof.

### Final Disposition

Technical implementation review and physical hardware acceptance are **PASS**. Focused automated suites pass, physical Windows COM-port unplug/replug caused reconnect attempts, and real polling/telemetry resumed after replug. Scope, lock ordering, stale client lifecycle, command safety, source health projection, shutdown cleanup, diagnostic safety, and Lean Testing discipline were rechecked.

Residual risk: Windows may return an error while closing an already invalidated stale serial handle. The adapter removes that handle from its active slot before close, continues reconnect attempts safely, and physical smoke proved this close error does not block fresh-client recovery.

## Review Trigger

Review this plan when Modbus reconnect thresholds become configurable, when the Arduino COM-port behavior differs during manual smoke, when the source adapter interface changes, when command confirmation changes, when `status.json` schema changes, or when a new equipment adapter enters scope.
