# Implementation Plan: Windows-First Edge Runtime Under Existing Cloud Authority

**Branch**: `main` | **Date**: 2026-04-19 | **Spec**: [spec.md](./spec.md)  
**Input**: Feature specification from `specs/007-edge-server/spec.md`

**Note**: This plan is produced via the `speckit.plan` workflow for the user-selected spec directory `specs/007-edge-server`. The repository branch is currently `main`, so the plan targets this spec without redefining branch naming.

## Summary

Build the production-shaped `edge_server` runtime as a Windows-first telemetry service in `edge_server/go_core` that consumes the already-fixed cloud contract instead of redefining it. The runtime will load operator-managed local config, read a persistent credential disclosed by cloud-admin flows, establish a trusted `/edge` session using the current credential only, normalize telemetry from local controller adapters into the cloud-owned `telemetry { readings[] }` payload, and persist only edge-owned local runtime/config/status state.

The current `edge_server` has reusable pieces for YAML config loading, Socket.IO framing, telemetry batching, source management, and file-backed state stores, but its bootstrap and trust model are centered on onboarding-package and `edge_activation` semantics that are no longer valid. This plan therefore keeps the reusable transport and local-source foundations, while replacing the onboarding-centric runtime path with a persistent-credential runtime loop and operator-visible local state model aligned with `Active | Blocked` plus separate availability.

## Technical Context

**Language/Version**: Go 1.24 for the runtime core; existing TypeScript in `edge_server/src` remains reference-only and is not the main runtime path  
**Primary Dependencies**: Socket.IO v4 `/edge` contract from `specs/001-cloud-server/contracts/websocket.md`, `cloud_server/openapi.yaml`, `gopkg.in/yaml.v3`, `github.com/simonvetter/modbus` for the first Modbus RTU client path, Windows-compatible local file persistence, structured logging, local controller adapter boundary inside `edge_server/go_core`, generic Modbus RTU source adapter family `modbus_rtu`  
**Storage**: Operator-edited YAML config plus edge-owned local JSON files for credential, runtime state, and operator-visible status; transient in-memory session and telemetry buffers only  
**Testing**: Go unit tests for config/state/adapter/runtime logic, Go contract tests for local contracts and cloud parity assumptions, Windows-first integration and smoke tests for trusted telemetry flow  
**Target Platform**: Windows 11 or Windows Server class deployment for the first real runtime, with no broad cross-platform commitment in this phase  
**Project Type**: Single service runtime inside the monorepo, implemented in `edge_server/go_core` as a cloud contract consumer  
**Constraints**: Cloud owns lifecycle and trust outcomes; persistent credential only; telemetry only baseline; no durable backlog or replay; no alarms/control; partial local-source failure must not imply trust loss; no redesign of cloud contracts; no dependency on `edge_telemetry_test` as the production path  
**Scale/Scope**: One runtime process per edge, one accepted trusted session per edge, multiple local devices and metrics per runtime, first production adapter path for Windows-attached Modbus RTU controller hardware, extensible local adapter seam for later protocol families

## Constitution Check

*GATE: Passed before Phase 0 research and re-checked after Phase 1 design.*

- The implementation home is `edge_server/go_core` because the work is local telemetry acquisition, local runtime state, and cloud transport consumption. No lifecycle authority or cloud business logic is moved out of `cloud_server`.
- No direct cross-module imports are required. Integration boundaries are:
  - `cloud_server/openapi.yaml` for admin-issued credential flows and fleet visibility
  - `specs/001-cloud-server/contracts/websocket.md` for `/edge` handshake, rejection, forced disconnect, and telemetry semantics
  - edge-owned local contracts in `specs/007-edge-server/contracts/` for controller adapters and operator-visible status
- Security rules remain satisfied because secrets stay in operator-provided config/state files, never hardcoded in code or docs, and local status snapshots explicitly exclude credential secrets.
- State-containment rules remain satisfied because trust state stays inside runtime-owned structs and persisted local files, not `global.*` or hidden shared process state.
- Documentation rules remain satisfied because design artifacts live under `specs/007-edge-server` and describe the edge-owned local model in English without embedding machine-local notes into README files.

## Project Structure

### Documentation (this feature)

```text
specs/007-edge-server/
|-- spec.md
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- contracts/
|   |-- local-source-adapter.md
|   `-- operator-status-snapshot.md
`-- tasks.md
```

### Source Code (repository root)

```text
edge_server/
|-- go_core/
|   |-- cmd/edge-runtime/
|   |-- internal/cloud/
|   |-- internal/config/
|   |-- internal/operator/
|   |-- internal/runtime/
|   |-- internal/source/
|   |-- internal/state/
|   `-- tests/
|-- src/                         # legacy TypeScript reference path, not the runtime implementation home
`-- tests/fixtures/runtime/
```

**Structure Decision**: Keep the production runtime in `edge_server/go_core` and evolve the existing Go packages instead of reviving the legacy TypeScript path or building a parallel demo runtime. The plan keeps `internal/source` as the local adapter seam, `internal/state` as the home for local persisted files, `internal/cloud` as the cloud contract consumer, and `internal/runtime` as the trust-aware orchestration layer.

## Design Overview

### Runtime shape

The main runtime is a single Windows-first process with four explicit responsibilities:

1. `config + state bootstrap`
   - load operator YAML
   - load current persistent credential from a local state file
   - initialize runtime/state/status files

2. `trusted cloud session`
   - connect to `/edge` using `edgeId + credentialSecret`
   - interpret `connect_error` and `edge_disconnect`
   - maintain one accepted trusted session at a time

3. `local source/controller acquisition`
   - apply stable source definitions to controller adapters
   - normalize raw device readings into runtime-local readings
   - preserve runtime-local `deviceId` and per-device `metric`

4. `telemetry pipeline`
   - batch successfully acquired readings
   - emit only while the session is trusted and connected
   - drop or suppress cloud sends when trust or connectivity is absent

### Local state split

The edge runtime persists only edge-owned local artifacts:

- `edge-runtime.yaml`: operator-edited config, including cloud URL, state directory, and source definitions
- `credential.json`: current persistent credential disclosure installed on the machine
- `runtime-state.json`: last authentication outcome, retry eligibility, last trusted session time, last telemetry send time, and source revision
- `status.json`: operator-visible snapshot for local inspection and service tooling

Transient process memory holds:

- active connection state
- retry backoff state
- per-source adapter handles
- last seen local faults
- pending telemetry batch
- session epoch used to prevent sends from stale trusted sessions

### Local source boundary

The local adapter boundary remains explicit and independent from cloud logic. Source adapters receive source definitions and produce normalized readings and local faults. They do not receive cloud credentials, do not talk to `cloud_server`, and do not reinterpret lifecycle or trust.

Adapter families are selected by protocol and transport, not by one physical controller layout. The first production family is `modbus_rtu`: one implementation must support different Arduino sketches or Modbus RTU controllers by consuming `connection`, `devices`, and per-metric `mapping` from the operator config. Changing the set of exposed devices or registers must be a config change, not a new adapter implementation.

### Trusted telemetry rule

The runtime treats telemetry as cloud-trusted only while all of the following are true:

- the current `/edge` socket is connected
- the last handshake was accepted
- no `blocked`, `credential_rotated`, or equivalent trust-ending outcome has been observed for the current session

Partial source failure remains local degradation only. The runtime continues sending unaffected readings without redefining lifecycle or forcing trust loss.

## Reuse vs Replace Decisions

### Reuse as foundations

- `internal/config/config.go`
  - Keep YAML parsing, Windows-safe environment expansion, and most source-definition validation.
  - Remove onboarding-specific defaults and adapt the schema toward persistent credential plus state directory semantics.
- `internal/source/*`
  - Keep the source manager, definition application flow, reading normalization, and fault channeling as the local adapter backbone.
  - Refine the contract so controller adapters are production-oriented instead of mock-first.
- `internal/cloud/websocket_transport.go`
  - Keep the low-level Socket.IO v4 framing and event dispatch approach because it already fits the existing cloud namespace contract.
  - Remove support assumptions that depend on onboarding-mode handshakes or activation events.
- `internal/cloud/telemetry_client.go`
  - Keep canonical telemetry payload shaping around `deviceId`, `metric`, `value`, and `ts`.
  - Ensure local normalization remains consistent with the current cloud-owned contract.
- `internal/runtime/telemetry_pipeline.go`
  - Keep the session-aware batching/gating pattern because it already models stop-on-trust-loss behavior well for the new runtime.
- `internal/state/file_store.go` and atomic Windows file replace helpers
  - Keep the Windows-aware atomic write path for local credential/runtime/status files.

### Replace because of invalid legacy semantics

- `internal/runtime/bootstrap.go`
  - Replace the onboarding-package bootstrap session with persistent-credential bootstrap from local files.
- `internal/runtime/onboarding.go`
  - Remove from the main runtime path because onboarding-package input is not part of the active model.
- `internal/runtime/runtime.go` handshake loop
  - Replace activation-driven promotion logic with direct trusted-session establishment on accepted persistent handshake.
- `internal/runtime/runtime_state.go`
  - Replace `onboarding | persistent | none` credential-mode state with a model centered on `trusted`, `retrying`, `operator_action_required`, and current credential metadata.
- `internal/operator/outcomes.go`
  - Replace `re_onboarding_required` and onboarding-derived outcomes with current cloud-aligned meanings such as `retryable_disconnect`, `invalid_credential`, `blocked`, and `credential_replaced`.
- `internal/cloud/events.go`
  - Remove connect and disconnect codes that only exist to support onboarding-package semantics.
- `cmd/edge-runtime/main.go`
  - Replace `--onboarding-package` bootstrap flags with config/state bootstrap and optional explicit credential install/replace flow.
- `internal/mockadapter/*` as the primary adapter path
  - Keep only as a development harness if still useful; do not let it define the production runtime shape.
- `edge_server/src/*`
  - Treat the TypeScript code as legacy reference material. Do not extend it as the main runtime implementation path.

### Keep but narrow

- `internal/state/credential_store.go`, `runtime_state_store.go`, `status_store.go`
  - Keep the file-store concept and atomic persistence.
  - Replace field schemas to match persistent-only lifecycle, operator-visible status, and local runtime state required by `007`.
- existing contract and integration tests
  - Keep the habit of contract-first tests.
  - Replace tests that encode onboarding or `edge_activation` semantics with tests for current persistent-only handshake, rejection, rotation, block, and unaffected partial-source telemetry.

## Phase 0: Research Outcomes To Resolve

Phase 0 closes the following edge-side design questions before implementation tasks are created:

1. Windows-first operator/bootstrap flow without onboarding-package semantics
2. minimum local config plus local runtime state needed on the edge machine
3. credential storage, replacement, and use under the persistent-only model
4. local source/controller adapter boundary for the first real hardware path
5. telemetry normalization path from local sources to the cloud-owned telemetry envelope
6. explicit reuse/replace strategy for the current `edge_server`

The resolved decisions are captured in [research.md](./research.md).

## Phase 1: Design Artifacts

Phase 1 produces the following implementation-shaping artifacts:

- [data-model.md](./data-model.md)
  - edge-owned local config, state files, transient memory, adapter definitions, and telemetry normalization records
- [contracts/local-source-adapter.md](./contracts/local-source-adapter.md)
  - source/controller integration seam for the first real hardware path and future adapter expansion
- [contracts/operator-status-snapshot.md](./contracts/operator-status-snapshot.md)
  - stable operator-visible local status shape without leaking credential secrets
- [quickstart.md](./quickstart.md)
  - Windows-first operator flow under the current cloud lifecycle and persistent credential model

## Implementation Phases

### Phase 1 - Local State And Operator Visibility

Deliver:

- current credential persistence and replacement semantics
- operator-visible `runtime-state.json` and `status.json`
- retry policy that distinguishes automatic reconnect from operator-action-required states
- Windows-first startup and shutdown behavior for service-style operation

### Phase 2 - Persistent-Credential Bootstrap

Deliver a runtime startup path that:

- loads config plus local state directory
- validates the installed credential file
- establishes `/edge` handshake with persistent credential only
- maps `connect_error` and `edge_disconnect` to local runtime/state/status updates
- removes onboarding-package and `edge_activation` dependencies from the hot path

### Phase 3 - Real Adapter Path And Telemetry Normalization

Deliver:

- production-shaped local adapter boundary
- first real controller adapter path for the Windows-attached Modbus RTU hardware slice
- normalization from adapter readings to the cloud-owned telemetry payload
- partial-source failure handling that preserves trusted telemetry for unaffected readings
- proof that the production adapter is mapping-driven and does not hardcode Arduino stand device names, register addresses, or pin semantics

### Phase 4 - Credential Rotation Without Re-Onboarding Semantics

Deliver:

- rotation-aware trust-loss handling tied to cloud-owned `credential_rotated` outcomes
- operator-action-required state transitions for superseded credentials
- recovery only through locally replaced `credential.json`, never through onboarding-era fallback

### Phase 5 - Block And Unblock Under Cloud Authority

Deliver:

- immediate trust stop on cloud-owned blocked outcomes
- retry suppression while the installed credential is no longer valid for trusted access
- recovery only through a freshly installed unblock credential, without reviving onboarding semantics

### Phase 6 - Verification And Legacy Retirement

Deliver:

- contract tests aligned with the active cloud contract
- integration tests for accepted trusted session, invalid credential, unknown edge, concurrent-session rejection, block, credential replacement, and partial-source degradation
- removal or quarantine of onboarding-centric runtime code from the main path so legacy semantics do not re-enter future work

## Testing Strategy

1. Add unit coverage for config validation, credential loading, runtime-state transitions, status snapshot mapping, and source-definition validation.
2. Add contract coverage that proves the runtime speaks the current persistent-only cloud contract without `edge_activation`.
3. Add integration coverage for:
   - accepted trusted connect with current credential
   - rejected connect for invalid or outdated credential
   - rejected connect for unknown edge identity
   - rejection or forced denial for a second concurrent session for the same edge
   - forced disconnect on `credential_rotated`
   - forced disconnect on `blocked`
   - continued telemetry from unaffected sources during partial local-source failure
4. Add production-adapter coverage for Modbus RTU mapping behavior: one transaction at a time on the serial connection, input/holding register reads used as telemetry, `scale` conversion, boolean conversion from numeric registers, serial timeout faults, and rejection of invalid mapping fields.
5. Keep smoke coverage for a minimal telemetry path, but do not treat `edge_telemetry_test` or mock-only harnesses as runtime acceptance for the main implementation.

## Deferred Work

The following items are explicitly deferred because they are outside the baseline telemetry scope and can be added later without weakening this plan:

- alarms and alarm evaluation
- control and actuation
- durable backlog or replay persistence
- Modbus read-range grouping optimization beyond the baseline one-metric-one-read polling path
- worker-process orchestration and multi-process supervision
- broad cross-platform packaging and deployment
- cloud or client migration planning beyond consuming the fixed current contract

Deferring them is safe at this stage because the baseline contract authority, local state model, and adapter seam are designed to extend without redefining lifecycle or the cloud-facing telemetry envelope.

## Post-Design Constitution Re-Check

- Passed: the plan still keeps lifecycle, credential validity, and acceptance or rejection outcomes under `cloud_server`.
- Passed: the runtime remains isolated inside `edge_server` and integrates only through explicit contracts and local files.
- Passed: no hidden global state, hardcoded secrets, or documentation rule violations were introduced by the design artifacts.

## Complexity Tracking

No constitution violations are required. The main complexity comes from replacing legacy onboarding semantics without breaking useful runtime foundations, and the plan handles that by preserving transport/state primitives while explicitly retiring the invalid trust model.
