# Feature Specification: Windows-Only Narrow MVP Delivery Slice For `001-edge-runtime`

**Feature Branch**: `006-edge-runtime-windows-mvp`  
**Last Updated**: 2026-04-06  
**Status**: Draft  
**Input**: Delivery-oriented narrowing of the accepted `001-edge-runtime` feature into the fastest safe MVP that reaches hardware-integration readiness without broad runtime persistence or cross-platform scope.

## Scope Note

This document does not replace `001-edge-runtime`.

It defines a separate delivery slice whose purpose is to implement the smallest functional subset of `001-edge-runtime` that still preserves the accepted lifecycle, telemetry, and cloud-boundary semantics.

- `004-edge-onboarding` remains the authority for lifecycle meaning, trust decisions, and cloud-side eligibility.
- `005-edge-test` remains the simulator-era end-to-end baseline.
- `001-edge-runtime` remains the broader production-shaped feature.
- `006-edge-runtime-windows-mvp` narrows only delivery scope: Windows-only, Go-first, no local machine-written runtime state files, no telemetry backlog, and no cross-platform delivery work in this scope.

The goal is not to define different runtime semantics. The goal is to reach the first safe runtime shape that can onboard, emit trusted telemetry, stop on trust loss, and expose a clean seam for the first Rust hardware integration while remaining compatible with the accepted functional direction of `001-edge-runtime`.

---

## 1. Problem Statement & Purpose

The repository already has the cloud-owned onboarding lifecycle from `004-edge-onboarding` and simulator-oriented end-to-end validation from `005-edge-test`. What is still missing is the smallest practical runtime that can run on Windows, connect to cloud through the real edge contract, emit trusted telemetry from a local source, and stop safely when trust is lost.

The broader `001-edge-runtime` feature includes local persisted credentials, runtime-state files, backlog replay, cross-platform layout, and early Go/Rust worker-process design. That broader shape remains useful as the parent feature direction, but it is too wide for the current delivery goal.

The current purpose of `006-edge-runtime-windows-mvp` is therefore narrower:

- establish a trusted runtime session on Windows
- emit canonical telemetry only while the cloud session is currently trusted and connected
- stop trusted telemetry immediately when trust or session legitimacy is lost
- allow fresh re-onboarding after revoke or block recovery
- keep the source boundary clean enough that Rust hardware work can start quickly when hardware is available

---

## 2. Product Direction & Scope Boundaries

### Ownership Sync

- `cloud_server` remains the only authority for lifecycle states, onboarding acceptance, reconnect rejection, trust revoke, block, re-enable, and forced disconnect meaning.
- `edge_server/go_core` owns local runtime orchestration, telemetry gating, and the local source integration boundary.
- `client` remains a consumer of cloud-derived visibility only.
- `001-edge-runtime` remains the parent feature whose accepted lifecycle and telemetry semantics must not be contradicted by this delivery slice.

### Compatibility Rule

This delivery slice MUST remain functionally compatible with the accepted runtime behavior of `001-edge-runtime` for:

- lifecycle meaning
- trust-loss handling
- canonical telemetry shape
- cloud-owned visibility derivation

This document narrows implementation scope only. It does not authorize different trust or telemetry behavior.

### MVP Scope

This feature is in scope for:

- Windows-only runtime delivery
- first onboarding using a valid one-time onboarding package
- in-memory use of the cloud-issued persistent reconnect credential while the current process remains alive
- same-process reconnect attempts after connectivity loss when the runtime still has valid in-memory reconnect material
- polling local sources through an in-process mock source path first
- canonical `telemetry { readings[] }` emission while the runtime is trusted and currently connected
- immediate telemetry stop on revoke, block, forced disconnect, connect rejection, or ordinary socket disconnect
- fresh onboarding after recovery flows, without recreating unchanged source definitions
- a minimal local source contract that can later be implemented by Rust without changing the cloud-facing contract

### Explicit MVP Limitations

The following limitations are intentional in this MVP:

- No local machine-written `credential.json`, `runtime-state.json`, or `status.json`
- No trusted reconnect across process restart or host restart
- No telemetry backlog, replay, or overflow handling
- No worker-process supervision or external Rust worker in this scope
- No cross-platform packaging, Linux parity, or deployment-layout work
- No local operator UI beyond logs and direct runtime invocation

### Out Of Scope

This feature is out of scope for:

- durable reconnect state across restart
- local status snapshot files
- replay ordering and backlog retention
- control, actuation, or command execution
- broad TypeScript runtime parity work
- worker heartbeat persistence
- dedicated deployment packaging or service-manager integration

---

## 3. User Scenarios & Testing

### User Story 1 - Establish A Trusted Runtime Session In The Current Process (Priority: P1)

As an operator, I want a Windows edge runtime to complete onboarding and stay able to reconnect during transient connectivity loss while the process is still alive, so that I can validate real trusted runtime behavior without waiting for persistent state work.

**Independent Test**: Start the runtime on Windows with a valid onboarding package and no prior trusted process state, verify onboarding succeeds, confirm `edge_activation` is received, then simulate a temporary socket disconnect and verify the same process can reconnect using the in-memory persistent credential.

**Acceptance Scenarios**:

1. **Given** a valid onboarding package and a reachable cloud, **When** the runtime starts, **Then** it connects with `credentialMode = onboarding`, receives `edge_activation`, stores the persistent reconnect credential in memory, and enters a trusted session.
2. **Given** the same runtime process already received a valid persistent reconnect credential, **When** connectivity is temporarily lost and the runtime reconnects, **Then** it reconnects with `credentialMode = persistent` without requiring a second onboarding package.
3. **Given** the runtime process is restarted and no local trusted state was persisted, **When** the runtime starts again, **Then** it remains untrusted until a valid onboarding path succeeds again.

### User Story 2 - Poll And Publish Trusted Telemetry (Priority: P1)

As a platform team, we want the runtime to publish real canonical telemetry from a local source while the session is trusted, so that cloud and client surfaces can show actual edge-originated data.

**Independent Test**: Run the trusted runtime against a mock local source that produces multiple devices and metrics, then verify canonical telemetry batches reach cloud while the trusted connection is active.

**Acceptance Scenarios**:

1. **Given** the runtime is trusted and connected, **When** the local polling cycle produces readings, **Then** the runtime emits canonical `telemetry { readings[] }` batches to cloud.
2. **Given** one edge reports more than one device and more than one metric per device, **When** telemetry is emitted, **Then** cloud receives all readings under the same edge runtime identity.
3. **Given** the runtime is not currently trusted or not currently connected, **When** the local polling cycle produces readings, **Then** the runtime does not buffer them for later delivery and does not emit them to cloud.

### User Story 3 - Stop Safely On Trust Loss And Recover Through Fresh Onboarding (Priority: P1)

As an operator, I want trust loss to stop trusted telemetry immediately and require a fresh valid onboarding path when needed, so that a no-longer-trusted edge never keeps publishing as if nothing happened.

**Independent Test**: Run a trusted runtime that is emitting telemetry, trigger revoke, block, forced disconnect, invalid reconnect, and ordinary socket disconnect scenarios, then verify telemetry stops immediately and resumes only after a valid trust path succeeds again.

**Acceptance Scenarios**:

1. **Given** the runtime is publishing trusted telemetry, **When** cloud emits `edge_disconnect` with `trust_revoked`, `blocked`, or `edge_forced_disconnect`, **Then** trusted telemetry stops immediately.
2. **Given** the runtime attempts to reconnect with invalid or revoked persistent credentials, **When** cloud rejects the connect attempt, **Then** the runtime remains untrusted and does not emit telemetry.
3. **Given** the runtime loses the socket without a cloud-issued lifecycle event, **When** the disconnect becomes known locally, **Then** trusted telemetry stops immediately and only resumes after a trusted session is re-established.
4. **Given** cloud re-enables onboarding and a fresh onboarding package is later supplied, **When** fresh onboarding succeeds, **Then** trusted telemetry may resume without rebuilding unchanged local source definitions.

### Edge Cases

- `edge_activation` carries an unexpected `edgeId`
- cloud returns `edge_auth_internal_error`
- socket disconnect happens without a preceding `edge_disconnect`
- the runtime receives local readings while cloud is unavailable
- one source reports faults while other sources continue producing valid readings
- cloud re-enables onboarding but no fresh onboarding package has been issued yet

---

## 4. Requirements

### Functional Requirements

- **FR-001**: The system MUST deliver a Windows-only narrow edge runtime MVP in `edge_server/go_core`.
- **FR-002**: The runtime MUST reuse the `004-edge-onboarding` Socket.IO `/edge` contract without redefining lifecycle semantics locally.
- **FR-003**: The runtime MUST support first onboarding from a valid one-time onboarding package.
- **FR-004**: After successful onboarding, the runtime MUST keep the issued persistent reconnect credential in process memory for later reconnect attempts while the process remains alive.
- **FR-005**: The MVP MUST NOT require or depend on machine-written local files for reconnect credentials, runtime state, or operator status.
- **FR-006**: The MVP MUST NOT claim trusted reconnect readiness after a process restart because no local trusted state is persisted in this scope.
- **FR-007**: The runtime MUST support same-process reconnect attempts using the in-memory persistent credential after temporary connectivity loss.
- **FR-008**: The runtime MUST poll local sources through a minimal source boundary that is independent from cloud lifecycle logic.
- **FR-009**: The runtime MUST support more than one device and more than one metric per device in one edge process.
- **FR-010**: The runtime MUST emit telemetry only in the canonical `telemetry { readings[] }` payload already accepted by cloud.
- **FR-011**: Each telemetry reading MUST contain `deviceId`, `metric`, `value`, and `ts`.
- **FR-012**: The runtime MUST emit telemetry only while the session is both trusted and currently connected.
- **FR-013**: When the runtime is disconnected or untrusted, it MUST drop new readings instead of buffering them for replay in this MVP.
- **FR-014**: The runtime MUST stop trusted telemetry immediately on `trust_revoked`, `blocked`, or `edge_forced_disconnect`.
- **FR-015**: The runtime MUST stop trusted telemetry immediately on ordinary socket disconnect, even if no explicit lifecycle event preceded it.
- **FR-016**: The runtime MUST treat connect rejections as untrusted outcomes and MUST NOT emit telemetry after a rejected reconnect.
- **FR-017**: The runtime MUST allow fresh onboarding after cloud-side recovery flows without recreating unchanged source definitions.
- **FR-018**: The MVP MUST leave a clean local source contract that can later be implemented by Rust without changing the cloud-facing contract.
- **FR-019**: The runtime MUST NOT introduce control or actuation behavior in this MVP.
- **FR-020**: The runtime MUST keep cloud trust authority and telemetry-derived visibility outside the local runtime.

### Key Entities

- **Onboarding Package**: First-use operator input containing `edgeId` and a one-time onboarding secret.
- **In-Memory Persistent Credential**: The cloud-issued reconnect secret retained only for the current process lifetime.
- **Runtime Session State**: Process-local runtime state that tracks trusted vs untrusted execution and the last stop reason relevant to the running process.
- **Polling Source Definition**: Stable local configuration for one or more devices and metrics.
- **Normalized Reading**: A local reading already shaped for the cloud telemetry contract.

---

## 5. Success Criteria

- **SC-001**: On Windows, an operator can bring a newly registered edge from a valid onboarding package to first accepted telemetry within 10 minutes under normal local conditions.
- **SC-002**: During a same-process connectivity interruption, the runtime reconnects through the in-memory persistent credential path without requiring a second onboarding package.
- **SC-003**: 100% of revoke, block, forced-disconnect, invalid-reconnect, and ordinary socket-disconnect scenarios stop trusted telemetry before any additional trusted batch is accepted after the loss is known.
- **SC-004**: A single runtime can emit telemetry for more than one device and more than one metric per device in MVP.
- **SC-005**: The runtime surface is ready for the first Rust hardware integration without requiring changes to the cloud-facing contract.

---

## 6. Assumptions & Constraints

- `004-edge-onboarding` remains authoritative for lifecycle meaning and connect rejection codes.
- `005-edge-test` remains valid background coverage, but it is not the production runtime path.
- Windows is the only delivery target in this MVP scope.
- The runtime may use operator-provided onboarding input at process start, but the runtime itself does not persist trusted state to local files in this scope.
- Telemetry is intentionally best-effort with no replay in this MVP.
- Rust hardware work starts only after the Go runtime exposes a stable local source seam.
