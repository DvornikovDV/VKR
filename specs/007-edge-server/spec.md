# Feature Specification: Edge Server Telemetry Baseline

**Feature Branch**: `007-edge-server`  
**Created**: 2026-04-12  
**Status**: Draft  
**Input**: User description: "Create a new specification for `007-edge-server` as the new base edge feature for the applied Windows hardware MVP. Define the edge runtime as a telemetry-focused runtime that acquires real local data and delivers it to cloud using cloud-owned lifecycle and authentication rules. This spec must establish the new edge baseline only. Alarming and control are out of scope and must be left for separate future specs."

---

## 1. Problem Statement & Purpose

The repository already contains older onboarding-oriented edge materials, a simulator-first edge validation feature, and a Windows narrowing feature for the earlier runtime direction. Those materials remain useful as references, but they no longer match the updated lifecycle model that removes onboarding packages and reduces the lifecycle to `Active` and `Blocked` under cloud authority.

Without a clean new baseline, the product risks mixing two incompatible meanings of edge trust:

- an older onboarding-package lifecycle with temporary first-connection states
- a newer persistent-credential lifecycle where registration issues a current runtime credential immediately

That ambiguity would let `cloud_server`, `client`, and `edge_server` drift in how they interpret registration, trusted reconnect, rotation, block, and unblock behavior.

The purpose of this specification is to define the new baseline feature for `007-edge-server`:

- a Windows-first edge runtime focused on acquiring real local telemetry
- one persistent credential path governed by cloud authority
- canonical telemetry delivery from edge to cloud
- reconnect behavior that follows the updated lifecycle model
- clear product boundaries between `cloud_server`, `client`, and `edge_server`
- a stable foundation for later hardware integrations without turning this feature into an implementation plan

This specification uses [`doc/edge-lifecycle-updated-model.md`](../../doc/edge-lifecycle-updated-model.md) as the primary semantic authority for lifecycle meaning. Older specifications are used only where they still support that model and do not reintroduce onboarding-package semantics.

---

## 2. Product Direction & Scope Boundaries

This feature owns the edge runtime baseline under the updated cloud-owned lifecycle model. It defines what the runtime is allowed to do, when telemetry is trusted, and how cloud-owned lifecycle administration affects runtime behavior on the edge.

### Authority And Ownership Model

- `cloud_server` is the canonical authority for edge lifecycle state, credential validity, registration outcomes, blocking and unblocking behavior, and cloud-facing edge contract semantics.
- `client` remains a consumer of cloud-managed lifecycle and availability outputs; client-facing presentation rules are specified separately in `002-frontend` and `003-dashboard`.
- `edge_server` acquires local telemetry, uses the cloud-defined credential path, and conforms to cloud-defined authentication and telemetry expectations.
- This feature does not redefine cloud authority and does not introduce an edge-owned contract model that competes with cloud semantics.

### Lifecycle Baseline

This feature adopts the updated simplified lifecycle model:

- persistent lifecycle states: `Active`, `Blocked`
- separate availability axis: `online`, `offline`, `lastSeenAt`
- one persistent credential path only
- no onboarding package
- no `Pending First Connection`
- no `Re-onboarding Required`

### Administrative Baseline

This feature assumes four administrative actions owned by cloud:

- register edge
- rotate credential
- block edge
- unblock edge

Their expected outcomes are:

- registration creates the edge in `Active` and issues the first persistent credential immediately
- credential rotation keeps the edge in `Active`, invalidates the previous credential immediately, and interrupts the current trusted session
- blocking moves the edge to `Blocked`, invalidates current access, and stops trusted operation immediately
- unblocking returns the edge to `Active` and issues a fresh persistent credential

### In Scope

This feature is in scope for:

- edge behavior under the cloud-owned lifecycle model
- persistent-credential-based runtime behavior under cloud authority
- acquisition of real telemetry from local hardware-facing sources
- canonical telemetry batching and delivery at feature level
- reconnect behavior aligned with the updated lifecycle
- one edge runtime reporting multiple local devices and multiple metrics
- product responsibility boundaries between edge, cloud, and client
- Windows-first delivery assumptions for the applied hardware MVP

### Out Of Scope

This feature is out of scope for:

- alarm rules, alarm evaluation, and alarm user experience
- command, control, actuation, or execution of operator commands
- durable backlog or replay persistence
- worker-process orchestration
- broad cross-platform delivery commitments
- simulator-only positioning as the defining runtime value
- detailed implementation structure, code layout, or module rewrite planning
- detailed cloud migration or client migration planning

### Deferred Follow-Up Direction

This specification intentionally leaves room for later follow-up work:

- alarming may later extend this baseline following the direction in [`doc/edge-alarms-minimal-architecture.md`](../../doc/edge-alarms-minimal-architecture.md)
- control may later extend this baseline following the direction in [`doc/edge-control-minimal-architecture.md`](../../doc/edge-control-minimal-architecture.md)

Neither follow-up changes the authority model or telemetry-first baseline defined here.

## Clarifications

### Session 2026-04-12

- Q: How should `edge_server` behave when some local telemetry sources fail while others continue to produce valid readings? → A: Continue trusted telemetry for unaffected sources and treat the condition as local degradation, not as trust loss or forced offline state.
- Q: What minimum local identity rule must `edge_server` preserve for devices and metrics within one runtime? → A: Preserve `deviceId` uniqueness within one edge and `metric` uniqueness within one device, while leaving global interpretation to cloud.
- Q: Must the minimum normalized telemetry reading include a per-reading quality or status field? → A: No. The baseline requires only readings that were successfully acquired, with `deviceId`, `metric`, `value`, and `timestamp`; missing or degraded data is handled by runtime behavior and later cloud/client interpretation.
- Q: What minimum locally visible runtime signals must `edge_server` expose in the baseline? → A: Expose connection state and authentication outcome locally so the operator can tell whether retry is possible or manual action such as a new credential is required; an explicit local degradation signal is not mandatory in the baseline.
- Q: How many trusted runtime sessions may one edge hold at a time? → A: At most one currently accepted trusted runtime session per edge; concurrent additional sessions are outside the baseline.
- Q: Does `007-edge-server` need any additional global edge-side stop rule for trusted telemetry beyond disconnect, credential rotation, block, and rejected connection? → A: No. Trusted telemetry stops only on trust or connection loss; local source failures affect only which readings are available.

---

## 3. User Scenarios & Testing *(mandatory)*

### User Story 1 - Register An Edge And Start Trusted Telemetry (Priority: P1)

As an Admin and operator, I want a newly registered edge to receive a current persistent credential immediately so that the runtime can begin trusted telemetry without a separate onboarding-package phase.

**Why this priority**: This is the foundational trust path for the new lifecycle. If registration still depends on an onboarding-only state machine, the new baseline is not actually established.

**Independent Test**: Start the runtime with a newly disclosed current persistent credential and verify that the runtime can establish trusted telemetry without any onboarding-package or first-connection-only mode.

**Acceptance Scenarios**:

1. **Given** the runtime presents the current persistent credential for an `Active` edge, **When** cloud evaluates the connection, **Then** the runtime receives an accepted session and allows trusted telemetry flow.
2. **Given** the runtime presents an incorrect, outdated, or unknown credential, **When** cloud evaluates the connection, **Then** the runtime remains untrusted and trusted telemetry does not begin.

---

### User Story 2 - Acquire And Deliver Real Telemetry From One Edge Runtime (Priority: P1)

As a platform team, we want one edge runtime to acquire real local telemetry from more than one device and metric and deliver it to cloud in the canonical telemetry shape so that the product baseline is about actual edge data, not simulator-only proof.

**Why this priority**: The value of the edge baseline is trusted data acquisition and delivery. Without real local telemetry, the feature remains only a lifecycle exercise.

**Independent Test**: Connect one trusted edge runtime to local hardware-facing sources that expose multiple devices and metrics, then verify that cloud receives canonical telemetry batches from the runtime.

**Acceptance Scenarios**:

1. **Given** a trusted and connected edge runtime, **When** local telemetry is acquired, **Then** the runtime sends canonical telemetry batches to cloud under the edge's current trusted session.
2. **Given** one edge runtime observes more than one local device and more than one metric per device, **When** telemetry is delivered, **Then** cloud receives those readings under the same edge identity without requiring separate runtime registration per device.
3. **Given** the runtime is disconnected or no longer trusted, **When** a telemetry cycle occurs, **Then** trusted telemetry is not accepted as active runtime output.
4. **Given** one or more local telemetry sources are temporarily unavailable while other sources still produce valid readings, **When** the runtime remains connected under a currently accepted credential, **Then** it continues sending trusted telemetry for unaffected sources and treats the condition as local degradation rather than trust loss.
5. **Given** one edge runtime reports multiple devices and metrics, **When** normalized readings are produced, **Then** each `deviceId` remains stable and unique within that edge and each `metric` remains stable and unique within its parent device without requiring the edge runtime to invent global uniqueness beyond the edge boundary.
6. **Given** a telemetry batch is produced during normal trusted operation, **When** some device metrics cannot be acquired in that cycle, **Then** the batch includes only successfully acquired normalized readings and does not require a per-reading quality or status field in the baseline contract.
7. **Given** an operator or test environment inspects the runtime locally, **When** the runtime is disconnected, retrying, rejected, blocked, or requires a new credential, **Then** the runtime exposes local connection state and authentication outcome that explain whether automatic retry can continue or operator action is required.

---

### User Story 3 - Rotate Credentials Without Re-Onboarding Semantics (Priority: P1)

As an Admin, I want credential rotation to replace the current credential immediately while keeping the edge `Active` so that routine credential replacement does not masquerade as a separate onboarding lifecycle.

**Why this priority**: Credential rotation is a core semantic difference between the updated model and older onboarding-based behavior.

**Independent Test**: Run a currently trusted edge, rotate its credential from cloud, confirm the active session is interrupted, and verify that the old credential is rejected while the new credential can restore trusted telemetry without moving the edge out of `Active`.

**Acceptance Scenarios**:

1. **Given** an `Active` edge is currently connected, **When** an Admin rotates its credential, **Then** the previous credential becomes invalid immediately and the current trusted session is interrupted.
2. **Given** credential rotation has completed, **When** the runtime retries with the old credential, **Then** cloud rejects the connection and trusted telemetry remains stopped.
3. **Given** credential rotation has completed, **When** the runtime reconnects with the newly issued credential, **Then** the edge resumes trusted telemetry while remaining in `Active`.

---

### User Story 4 - Block And Unblock An Edge Under Cloud Authority (Priority: P2)

As an Admin, I want block and unblock actions to be cloud-owned trust decisions so that unsafe or forbidden edge operation stops immediately and resumes only through fresh authorized credentials.

**Why this priority**: Blocking is the strongest safety boundary in the lifecycle and must not depend on local edge interpretation.

**Independent Test**: Run a trusted edge, block it from cloud, verify immediate stop of trusted operation, then replace the local credential with a freshly disclosed unblock credential and verify that trusted telemetry resumes only with that new credential.

**Acceptance Scenarios**:

1. **Given** an `Active` edge is currently trusted, **When** an Admin blocks the edge, **Then** the runtime loses trusted operation immediately.
2. **Given** an edge is blocked, **When** it attempts to reconnect with any previously valid credential, **Then** trusted telemetry does not resume.
3. **Given** an edge has been unblocked, **When** the runtime reconnects without the newly issued credential, **Then** the edge remains unable to resume trusted operation.

---

### Edge Cases

- The runtime attempts to reconnect with a credential that was valid earlier in the same day but was replaced by rotation.
- The runtime is actively sending telemetry when a block or credential rotation occurs.
- An edge is unblocked, but the operator still has only the previously invalidated credential.
- One runtime reports multiple devices and metrics, but some local sources are temporarily unavailable while others still produce valid readings.
- Concurrent runtime sessions attempt to connect for the same edge while one trusted session is already active.
- Cloud receives a connection attempt for an unknown edge identifier that otherwise appears syntactically valid.
- A normal disconnect makes the edge offline, but lifecycle meaning must remain unchanged if no block or credential replacement occurred.

---

## 4. Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST treat `cloud_server` as the canonical authority for edge lifecycle state, credential validity, registration outcomes, block and unblock behavior, and cloud-facing edge contract semantics.
- **FR-002**: System MUST define `edge_server` as a telemetry-focused runtime that acquires local data and conforms to the cloud-defined authentication and telemetry contract.
- **FR-004**: System MUST support only two persistent lifecycle states for the new edge baseline: `Active` and `Blocked`.
- **FR-006**: System MUST use one persistent credential path for both initial trusted connection and later trusted reconnects.
- **FR-007**: System MUST NOT require or define an onboarding package, `Pending First Connection`, or `Re-onboarding Required` as part of this feature's lifecycle baseline.
- **FR-010**: The edge runtime MUST establish `/edge` authentication using only `edgeId` and the current persistent credential from the installed credential file.
- **FR-011**: The edge runtime MUST treat cloud-owned rejection outcomes such as invalid credential, blocked access, unknown edge, or concurrent-session denial as untrusted outcomes and MUST NOT begin or resume trusted telemetry from them.
- **FR-012**: The currently valid persistent credential MUST be the only credential that authorizes trusted runtime behavior at any moment.
- **FR-013**: The edge runtime MUST use the current persistent credential for ordinary reconnect behavior until cloud replaces or invalidates it.
- **FR-013A**: The baseline MUST assume at most one currently accepted trusted runtime session per edge at a time.
- **FR-014**: When cloud rotates the credential for the edge, the runtime MUST treat the previously loaded credential as no longer sufficient for trusted operation and MUST stop trusted telemetry for the interrupted session.
- **FR-015**: After credential rotation, the old credential MUST NOT restore trusted runtime behavior.
- **FR-016**: When cloud blocks the edge, the runtime MUST stop trusted operation immediately and MUST NOT treat automatic reconnect as sufficient to restore trust.
- **FR-017**: A `Blocked` edge MUST NOT reconnect or deliver trusted telemetry until cloud returns it to `Active` and issues a fresh persistent credential.
- **FR-018**: After cloud unblocks an edge, the runtime MUST resume trusted operation only after a newly issued persistent credential is installed locally.
- **FR-019**: The edge runtime MUST deliver trusted telemetry only while the edge is connected under a currently accepted credential and the lifecycle remains `Active`.
- **FR-020**: Trusted telemetry MUST stop immediately when the edge is blocked, when its credential is rotated and the active session is interrupted, when the current session disconnects, or when a connection attempt is rejected.
- **FR-020A**: This feature MUST NOT introduce any additional global stop rule for trusted telemetry based solely on local source failure while the trusted session remains connected and accepted.
- **FR-021**: System MUST support one edge runtime acquiring telemetry from more than one local device and more than one metric per device.
- **FR-021A**: When some local telemetry sources fail while others remain valid, the edge runtime MUST continue trusted telemetry for unaffected devices and metrics as long as the current trusted session remains connected and accepted.
- **FR-021B**: Partial local-source failure MUST be treated as local runtime degradation and MUST NOT by itself invalidate trust or make the runtime behave as if the trusted session were globally lost.
- **FR-022**: System MUST deliver telemetry to cloud in the canonical cloud-owned telemetry shape so downstream product surfaces continue to rely on one consistent contract.
- **FR-023**: The canonical telemetry baseline for this feature MUST support normalized readings that identify at minimum the device, metric, value, and timestamp for each sample.
- **FR-023A**: Within one edge runtime, each normalized reading MUST preserve a stable `deviceId` that is unique within that edge and a stable `metric` that is unique within its parent device.
- **FR-023B**: This feature MUST NOT require `edge_server` to guarantee global uniqueness of device or metric identifiers beyond the boundary of one edge runtime.
- **FR-023C**: The minimum normalized telemetry baseline for this feature MUST require only successfully acquired readings and MUST NOT require a per-reading quality or status field.
- **FR-024**: This feature MUST position the edge runtime around real local telemetry acquisition from hardware-facing sources and MUST NOT define simulator-only behavior as the primary product value.
- **FR-025**: This feature MUST leave room for future controller or protocol integrations without redefining lifecycle authority or cloud-facing telemetry semantics.
- **FR-028**: Administrative actions for register edge, rotate credential, block edge, and unblock edge MUST remain cloud-owned behaviors even when their effects immediately change runtime operation.
- **FR-029A**: The edge runtime MUST expose locally visible connection state sufficient to distinguish at minimum connected, disconnected, and retrying conditions without redefining cloud availability semantics.
- **FR-029B**: The edge runtime MUST expose a locally visible authentication outcome sufficient to distinguish retry-eligible disconnection from operator-action-required conditions such as blocked access or the need for a newly issued credential.
- **FR-030**: This feature MUST remain Windows-first in delivery assumptions while avoiding any requirement to define broad cross-platform behavior in the same specification.
- **FR-032**: Alarm semantics and alarm user experience MUST remain out of scope for this feature and be deferred to a later separate specification.
- **FR-033**: Command, control, and actuation semantics MUST remain out of scope for this feature and be deferred to a later separate specification.
- **FR-034**: This feature MUST supersede older onboarding-package lifecycle assumptions for the new edge baseline without rewriting cloud authority into an edge-owned alternative contract model.

### Key Entities *(include if feature involves data)*

- **Edge Record**: The cloud-owned product record that identifies one edge runtime and carries lifecycle and availability meaning.
- **Persistent Credential**: The current cloud-issued secret that authorizes trusted runtime connection and reconnect behavior for one edge.
- **Lifecycle State**: The persistent cloud-owned trust state of an edge, limited in this feature to `Active` or `Blocked`.
- **Availability Status**: The cloud-projected operational status that indicates whether an edge is online or offline and when it was last seen.
- **Trusted Runtime Session**: The currently accepted runtime connection during which telemetry from the edge is considered trusted.
- **Local Telemetry Source**: A hardware-facing local source from which the edge acquires real device and metric values.
- **Telemetry Batch**: A cloud-bound group of normalized telemetry readings emitted by one trusted edge runtime.
- **Local Device Identity**: The stable per-edge identifier used by the runtime to distinguish one reported local device from another within the same edge.
- **Local Metric Identity**: The stable per-device `metric` value used by the runtime to distinguish one reported metric from another within the same local device.
- **Administrative Lifecycle Action**: A cloud-owned action that changes credential validity or lifecycle meaning through registration, rotation, block, or unblock.

---

## 5. Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of connection attempts that use an outdated, incorrect, blocked, unknown, or concurrently superseded credential do not begin trusted telemetry.
- **SC-002**: When a connected edge is blocked or its credential is rotated, trusted telemetry stops before any additional trusted batch is emitted after the runtime learns of the trust-ending outcome.
- **SC-003**: A single trusted edge runtime can expose telemetry for more than one device and more than one metric per device while preserving one edge identity and one cloud lifecycle state.
- **SC-004**: If one or more local telemetry sources fail while others remain valid, unaffected readings continue to reach cloud without causing the runtime to treat the trusted session as lost.
- **SC-005**: After rotate or unblock, trusted telemetry resumes only after the newly issued persistent credential is installed locally, without entering an onboarding-package workflow.

---

## 6. Assumptions & Constraints

- [`doc/edge-lifecycle-updated-model.md`](../../doc/edge-lifecycle-updated-model.md) is the primary semantic source for lifecycle meaning in this feature.
- `specs/001-cloud-server/spec.md` is the canonical specification for cloud-owned registration, lifecycle projection, credential issuance, availability semantics, and auditable cloud outcomes.
- `specs/002-frontend/spec.md` and `specs/003-dashboard/spec.md` are the canonical specifications for client-facing lifecycle and availability presentation.
- Older materials from `004`, `005`, `006`, and `001` are used only where they remain compatible with the updated lifecycle and do not reintroduce onboarding-package semantics.
- The channel used to deliver a newly issued or rotated persistent credential from cloud-admin flow to the machine running the edge is outside this specification.
- The concrete local mechanism used to expose runtime-visible connection state or authentication outcome on the edge machine is outside this specification.
- Windows is the first delivery target for this feature, but the specification does not attempt to define broad platform strategy in the same scope.
- Real local telemetry acquisition is the baseline product value for this feature; simulator behavior may still exist for testing but is not the defining scope here.
- This specification defines feature behavior and product boundaries, not module layout, process topology, storage internals, or transport implementation details.
- Durable backlog, replay persistence, and worker orchestration are intentionally deferred so the feature stays focused on trust, telemetry, and ownership boundaries.
- Future alarm and control features must extend this baseline without redefining cloud authority, lifecycle meaning, or the telemetry-first responsibility split introduced here.
