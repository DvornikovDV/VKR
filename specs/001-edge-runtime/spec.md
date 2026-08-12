# Feature Specification: Production-Shaped Local Edge Runtime

**Feature Branch**: `001-edge-runtime`  
**Created**: 2026-04-05  
**Status**: Draft  
**Input**: User description: "Create the specification for a new edge feature aligned with 004-edge-onboarding and 005-edge-test. Specify a production-shaped local edge runtime that preserves the full onboarding and trust lifecycle, persists local credential and runtime state, polls real data, publishes regular telemetry batches, stops trusted telemetry whenever trust is lost, keeps cloud and client visibility derived from telemetry already received by cloud, stays hardware-agnostic, leaves room for later control, and is not framed as permanently limited to a locally run PC."

- Q: Must the local telemetry backlog survive runtime or host restart? -> A: No; MVP backlog is best-effort and may be lost on restart.

---

## 1. Problem Statement & Purpose

`004-edge-onboarding` already defines the canonical onboarding lifecycle, trust states, persistent reconnect behavior, and cloud authority for Edge Server identity. `005-edge-test` then proves that the lifecycle can be exercised end to end with a simulator-owned telemetry source. What the product still lacks is a specification for the next step: a production-shaped local edge runtime that keeps the same trust model but moves the MVP toward real data collection instead of simulator-only validation.

Without this feature, the system risks staying in a demo shape where onboarding works in principle, but the runtime that should justify onboarding still depends on synthetic data. That gap would make it harder to validate real operator recovery flows, durable local trust state, trusted restart behavior, telemetry gating after trust loss, and the requirement that cloud and client visibility must continue to emerge from telemetry already received by cloud rather than from manually authored inventory.

The purpose of this feature is to define a local Edge Server runtime that:

- preserves the full onboarding and trust lifecycle already defined by `004-edge-onboarding`
- extends the runtime direction beyond the simulator-only MVP in `005-edge-test`
- polls real local data sources in MVP so the system can show actual data in cloud and client surfaces
- persists local trust and runtime state across restarts
- publishes telemetry in regular trusted batches and stops trusted telemetry immediately when trust is lost
- remains hardware-agnostic at specification level so future deployments are not locked to one device family, protocol, transport, or a permanently PC-only form factor

---

## 2. Product Direction & Scope Boundaries

This feature owns the product behavior of a production-shaped local edge runtime. It defines how a local edge is bootstrapped, trusted, restarted, polled, disconnected, recovered, and re-onboarded while keeping cloud-side lifecycle authority and telemetry-derived visibility intact.

### Ownership Sync

- `004-edge-onboarding` remains the authority for onboarding lifecycle meaning, trust transitions, reconnect credential semantics, forced disconnect expectations, and block or re-enable outcomes.
- `005-edge-test` remains the simulator-only validation baseline that proved the early end-to-end trust and telemetry path.
- `001-edge-runtime` owns the next runtime step: polling-based local data acquisition and trusted telemetry publication for a production-shaped edge runtime that can evolve beyond the simulator-only MVP.

### MVP Scope

This feature is in scope for:

- a local edge runtime that supports first onboarding, persistent reconnect, trust revoke, block, re-enable, forced disconnect handling, recovery-needed behavior, and re-onboarding
- persisted local credential and runtime state that survives normal restarts
- regular polling as the MVP data-acquisition method so the system can show real data
- trusted telemetry publication in regular batches only while a trusted session exists
- telemetry-derived cloud and client visibility for devices and metrics already received by cloud
- minimal local operator support for bootstrap, status awareness, and recovery guidance
- a runtime shape that may begin on a locally run PC but is not defined as permanently limited to that environment

### Post-MVP Direction

Later work may extend this feature with:

- richer polling-source libraries and broader equipment compatibility
- stronger deployment packaging for dedicated edge environments
- advanced backlog retention, replay policies, and resilience improvements beyond the MVP local buffering baseline
- trusted control capabilities that reuse the same lifecycle and trust foundation without redefining it

### Out Of Scope

This feature is out of scope for:

- selecting one mandatory hardware family, industrial protocol, or transport as the only supported MVP path
- detailed implementation structure inside `edge_server`
- a required full edge UI beyond minimal operator support
- manual client-side authoring of device or metric catalogs for MVP visibility
- a separate cloud-managed inventory that exists before telemetry arrives
- redefining lifecycle authority, trust decisions, or visibility rules that already belong to cloud-side contracts
- device control, command execution, or actuation in MVP

## Clarifications

### Session 2026-04-05

- Q: What level of protection is required for locally persisted trusted reconnect state? → A: Ordinary local file with OS access permissions is sufficient for MVP.
- Q: What should runtime do with telemetry when cloud connectivity is temporarily lost but trust is not revoked? → A: Continue polling, buffer telemetry locally, and send the backlog after a trusted session is restored.

- Q: Must the local telemetry backlog survive runtime or host restart? -> A: No; MVP backlog is best-effort and may be lost on restart.
- Q: What delivery order is required when a trusted session is restored and backlog exists? -> A: Publish backlog first in chronological order, then resume live telemetry.
- Q: What uniqueness scope is required for deviceId in MVP telemetry? -> A: deviceId is unique only within one edge runtime; cloud identity derives from edgeId plus deviceId.
- Q: What batching policy makes "regular telemetry batches" testable in MVP? -> A: MVP uses a bounded, operator-configurable batching policy with a defined flush interval and maximum batch size; defaults must still satisfy the restart-to-first-batch success criterion.
- Q: What happens when the in-memory telemetry backlog reaches its MVP limit during a connectivity-only interruption? -> A: MVP backlog remains best-effort and bounded in memory; overflow handling may drop the oldest buffered samples, but the runtime must record an operator-visible overflow outcome and preserve chronological order for the backlog that remains.
- Q: What minimum local operator surface is required in MVP? -> A: MVP must provide an operator-readable status snapshot file plus a runtime status command; any richer local UI remains optional.
- Q: What filesystem protection is required for persisted local credential and runtime files? -> A: MVP stores them in ordinary local files protected by standard host filesystem permissions limited to the runtime/service account and authorized local operators as supported by the host environment.

---

## 3. User Scenarios & Testing *(mandatory)*

### User Story 1 - Establish And Resume Trusted Runtime (Priority: P1)

As an operator, I want a newly installed local edge runtime to complete first onboarding once and later restart through trusted reconnect so that normal operation does not depend on re-entering one-time credentials after every restart.

**Why this priority**: First trust and later trusted restart are the foundation for everything else. Without them, real polling and telemetry cannot become normal runtime behavior.

**Independent Test**: Start the runtime with no prior local state and a valid onboarding package, verify that trust is established and persistent reconnect state is saved locally, then restart the runtime and confirm that it resumes through the trusted reconnect path without using the original onboarding package.

**Acceptance Scenarios**:

1. **Given** a registered edge has no valid local trusted state, **When** the operator starts the runtime with a valid one-time onboarding package, **Then** the runtime completes onboarding, becomes trusted, and persists the issued reconnect state locally.
2. **Given** the runtime already holds valid local reconnect state from a prior successful onboarding cycle, **When** the runtime starts again after a normal restart, **Then** it reconnects through the returning-trusted path and does not depend on the original onboarding package for normal operation.
3. **Given** local trusted state is missing, corrupt, outdated, or rejected, **When** the runtime starts, **Then** it remains untrusted, preserves a recovery-needed outcome, and does not continue as a trusted edge until a valid trust path succeeds.
4. **Given** both persisted reconnect state and a one-time onboarding package are present, **When** the runtime starts under normal trusted conditions, **Then** normal operation continues through the trusted reconnect path rather than treating every restart as a new onboarding event.

---

### User Story 2 - Poll Real Data And Publish Trusted Telemetry (Priority: P1)

As a platform team, we want the local edge runtime to poll real local data sources and publish telemetry in regular trusted batches so that cloud and client surfaces show actual device data without inventing a separate inventory path.

**Why this priority**: The value of the runtime is not only to be trusted, but to turn that trust into real system data that can be observed in the product.

**Independent Test**: Connect a trusted edge to local data sources, let the polling cycle run, and verify that regular telemetry batches reach cloud, while user-facing visibility of devices and metrics remains derived only from telemetry already received by cloud.

**Acceptance Scenarios**:

1. **Given** the runtime has an active trusted session and local data sources are available, **When** the polling cycle runs, **Then** the runtime publishes regular telemetry batches representing the current device and metric values.
2. **Given** one edge is polling more than one device and more than one metric per device, **When** telemetry is published, **Then** cloud can receive and attribute all reported device and metric samples within the same edge runtime.
3. **Given** cloud receives telemetry from the trusted edge, **When** cloud or client visibility surfaces refresh, **Then** the visible device and metric catalog remains read-only data derived from telemetry already received by cloud.
4. **Given** no trusted session exists, **When** the next telemetry cycle would occur, **Then** the runtime does not publish trusted telemetry until trust is restored.

---

### User Story 3 - Recover Safely From Trust Loss (Priority: P1)

As an operator, I want trust revoke, block, forced disconnect, stale credentials, and re-enable flows to stop trusted behavior immediately and guide fresh onboarding when needed so that a no-longer-trusted edge never continues to publish data as if it were still trusted.

**Why this priority**: Trust loss is a safety boundary. A production-shaped edge runtime must behave conservatively the moment trust or session legitimacy is lost.

**Independent Test**: Run a trusted edge that is publishing telemetry, trigger trust revoke, block, forced disconnect, re-enable, and re-onboarding from cloud-side controls, and verify that trusted telemetry stops immediately on trust loss and resumes only after a successful fresh onboarding cycle.

**Acceptance Scenarios**:

1. **Given** the runtime is publishing trusted telemetry, **When** cloud revokes trust, blocks the edge, or forces a disconnect, **Then** the runtime stops trusted telemetry immediately and records an operator-visible reason.
2. **Given** the runtime later attempts a reconnect with outdated or revoked reconnect state, **When** cloud rejects that reconnect, **Then** the runtime enters recovery-needed behavior and does not continue operating as trusted.
3. **Given** an edge has been re-enabled after a block or recovery action, **When** the runtime starts before a fresh onboarding cycle succeeds, **Then** trusted telemetry does not resume merely because the block was cleared.
4. **Given** the operator provides a fresh valid onboarding package after trust was lost, **When** re-onboarding succeeds, **Then** the runtime persists the newly issued reconnect state and returns to trusted telemetry operation.

---

### User Story 4 - Operate With Minimal Local Support And Future Deployment Flexibility (Priority: P3)

As an operations team, we want minimal local support for bootstrap and recovery without locking the runtime to a permanent desktop-only shape so that the same product behavior can serve early local installs now and dedicated edge deployments later.

**Why this priority**: MVP should be practical to run, but not at the cost of defining the edge as a one-off PC utility with product behavior that cannot scale beyond local pilots.

**Independent Test**: Start, restart, recover, and re-onboard the runtime using only minimal local support, then confirm that the same expected behavior still makes sense if the runtime is later deployed outside a desktop operator workflow.

**Acceptance Scenarios**:

1. **Given** the runtime requires bootstrap or recovery, **When** an operator inspects the available local support, **Then** they can determine whether the edge is awaiting onboarding, ready for trusted reconnect, blocked, or recovery-needed without a full dedicated UI.
2. **Given** the runtime is first introduced as a locally run edge on a PC, **When** product behavior is evaluated, **Then** the feature remains described as a local edge runtime concept rather than as a permanently desktop-only special case.
3. **Given** future work later adds trusted device control, **When** this specification is used as the foundation, **Then** control can extend the trusted edge model without redefining onboarding, trust loss, or telemetry responsibilities described here.

---

### Edge Cases

- A restart happens after onboarding is accepted but before the newly issued reconnect state is durably saved locally.
- Persisted local trust state exists, but it is partially written, corrupted, or no longer matches cloud authority.
- The runtime starts with both stale reconnect state and a newly provided onboarding package.
- Trust is lost while a telemetry batch is being prepared or published.
- Cloud connectivity is temporarily lost without an explicit trust revoke, while local polling should continue and telemetry backlog should accumulate until trusted reconnect succeeds.
- The in-memory telemetry backlog reaches its configured MVP limit before cloud connectivity returns.
- The runtime or host restarts while telemetry is buffered from a connectivity-only interruption, and MVP may resume without preserving that backlog.
- Trusted connectivity returns while both buffered backlog and newly polled live values are available, and the runtime must preserve a consistent replay order.
- A local data source becomes temporarily unavailable after the edge has already become trusted.
- An edge is re-enabled for onboarding, but no fresh onboarding package has been issued or supplied yet.
- Local polling discovers device or metric changes over time, and visibility must still remain derived from telemetry rather than from manual catalog authoring.
- The runtime begins on a locally managed PC for MVP, but later moves into a different edge-hosting environment without changing product semantics.

---

## 4. Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a dedicated local Edge Server runtime feature that extends the simulator-only MVP toward production-shaped operation with real polled data.
- **FR-002**: System MUST preserve the onboarding lifecycle meanings, reconnect meanings, trust-loss meanings, and forced-disconnect meanings defined by `004-edge-onboarding` and its related contracts.
- **FR-003**: System MUST support first onboarding from a valid one-time onboarding package for edges that are not currently trusted.
- **FR-004**: After successful onboarding, system MUST persist the issued reconnect state locally for later trusted reconnects.
- **FR-004a**: For MVP, system MAY persist trusted reconnect and runtime-state files in ordinary local files protected by standard host filesystem access permissions; these files MUST be limited to the runtime or service account and authorized local operators as supported by the host environment. OS-specific secret stores and encryption-at-rest are not required by this specification.
- **FR-005**: On later starts, system MUST use valid persisted reconnect state for normal trusted operation rather than requiring the original onboarding package again.
- **FR-006**: System MUST persist local runtime state across restarts so the edge can distinguish at minimum: never onboarded, trusted reconnect ready, recovery-needed, blocked, and re-onboarding required.
- **FR-007**: If local trust state is missing, corrupt, outdated, or rejected by cloud, system MUST remain untrusted and MUST identify recovery or re-onboarding as required before trusted operation can resume.
- **FR-008**: System MUST support regular polling as the MVP data-acquisition method because the MVP goal is to show real data in the system.
- **FR-009**: System MUST obtain telemetry input from local data sources that can represent real device data rather than relying only on simulator-generated values.
- **FR-010**: System MUST remain hardware-agnostic at specification level and MUST NOT require one specific device family, industrial protocol, or transport to satisfy MVP.
- **FR-011**: System MUST support more than one device and more than one metric per device within a single edge runtime in MVP.
- **FR-012**: System MUST publish telemetry in regular batches while a trusted session exists, using a bounded, operator-configurable flush interval and maximum batch size.
- **FR-012a**: If cloud connectivity is temporarily lost without a trust revoke, block, or recovery-required outcome, system MUST continue local polling and buffer telemetry locally until a trusted session is restored.
- **FR-012b**: After trusted session restoration following a connectivity-only interruption, system MUST publish the buffered telemetry backlog before resuming live telemetry.
- **FR-012c**: MVP telemetry backlog buffering is best-effort only and is not required to survive runtime restart, host reboot, or process replacement during the interruption.
- **FR-012d**: When replaying buffered telemetry backlog, system MUST preserve chronological ordering by sample timestamp before switching to live telemetry emission.
- **FR-012e**: MVP MUST define and enforce a bounded in-memory backlog limit and MUST surface an operator-visible overflow outcome whenever best-effort backlog data is discarded due to that limit.
- **FR-013**: Each emitted telemetry sample MUST provide `deviceId`, `metric`, `value`, and `ts` so existing cloud and client flows can continue to derive visibility from received telemetry.
- **FR-013a**: For MVP, `deviceId` MUST be unique only within a single edge runtime; cloud and client identity for a device MUST derive from `edgeId` plus `deviceId`, rather than from a globally unique `deviceId` alone.
- **FR-014**: System MUST stop trusted telemetry immediately whenever trust is revoked, the edge is blocked, the session is forcibly disconnected, the session is otherwise disconnected, or no trusted session exists.
- **FR-015**: Once trust loss or session loss is known, system MUST keep trusted telemetry gated and MUST NOT send any additional trusted telemetry until a trusted session is restored.
- **FR-015a**: Buffered telemetry collected during a connectivity-only interruption MUST NOT be published after a trust revoke, block, forced disconnect, or recovery-required outcome invalidates the trusted session under which that backlog was collected.
- **FR-016**: System MUST treat onboarding lifecycle state, current trust status, and local data-source health as separate concerns.
- **FR-017**: Cloud and client visibility of devices and metrics MUST remain derived from telemetry already received by cloud.
- **FR-018**: System MUST NOT require manual client-side device catalog entry or a separate cloud-managed inventory for MVP visibility.
- **FR-019**: System MUST preserve locally the operator-relevant reason for the latest trust failure, disconnect, or recovery-required condition across restarts until a newer outcome supersedes it.
- **FR-020**: System MUST surface operator-visible outcomes for successful onboarding, rejected onboarding, successful trusted reconnect, rejected trusted reconnect, trust revoke, block, re-enable, forced disconnect, recovery-needed, and successful re-onboarding.
- **FR-021**: When cloud revokes trust for recovery, system MUST stop trusted operation, preserve the need for fresh onboarding, and remain untrusted until re-onboarding succeeds.
- **FR-022**: When cloud blocks the edge, system MUST stop trusted operation immediately and MUST remain unable to operate as trusted until cloud re-enables onboarding and a fresh onboarding cycle succeeds.
- **FR-023**: Re-enable onboarding MUST NOT by itself restore trusted telemetry or trusted reconnect eligibility.
- **FR-024**: When a fresh onboarding cycle succeeds after recovery or block, system MUST replace outdated or revoked reconnect state with the newly issued trusted reconnect state for future starts.
- **FR-025**: Recovery or re-onboarding MUST NOT require operators to recreate stable local source definitions for the same edge unless the local source configuration itself changed.
- **FR-026**: System MUST support minimal local operator assistance for bootstrap, status awareness, and recovery guidance through an operator-readable status snapshot file and a runtime status command, without requiring a full edge UI.
- **FR-027**: Any optional edge UI MUST remain a consumer of runtime state rather than a separate source of lifecycle truth.
- **FR-028**: This feature MUST allow the runtime to begin as a locally run edge on a PC while keeping the same product behavior applicable to future dedicated edge deployments.
- **FR-029**: This feature MUST leave room for later trusted control capabilities without redefining onboarding, trust, or telemetry responsibilities introduced here.
- **FR-030**: Device control, command execution, and actuation MUST remain out of scope for MVP behavior defined by this feature.
- **FR-031**: System MUST keep cloud lifecycle authority, trust decisions, and telemetry-derived visibility rules outside the local runtime; the edge may react to those outcomes but MUST NOT redefine them locally.
- **FR-032**: This feature MUST NOT be defined as simulator-only; simulator data may still exist as a fallback or testing aid, but MVP value requires polling-based real data acquisition.

### Key Entities *(include if feature involves data)*

- **Local Edge Runtime**: The edge-side runtime that establishes trust, polls local data sources, publishes telemetry, and reacts to trust changes across restarts.
- **Local Device Identity**: A device identifier that is stable within one edge runtime and unique only within that runtime; cloud-visible identity is derived together with the hosting edge identity.
- **One-Time Onboarding Package**: The first-use edge identity package issued by cloud-side onboarding and used only to establish trust when no valid reconnect state exists.
- **Trusted Reconnect State**: The locally persisted trusted reconnect material and status needed for later returning-trusted sessions.
- **Local Runtime State**: The persisted edge-owned state that records trust readiness, recovery-needed outcomes, last disconnect or trust-loss reason, and other restart-relevant runtime facts.
- **Polling Source Definition**: The stable local description of which devices and metrics the edge should poll from its local environment.
- **Telemetry Batch**: A regular group of telemetry samples published while the runtime is in a trusted session.
- **Recovery Condition**: The operator-relevant reason why the runtime can no longer behave as trusted until a corrective lifecycle step occurs.

---

## 5. Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An operator can bring a newly registered edge from a valid onboarding package to first accepted telemetry from polled local data within 10 minutes under normal local conditions.
- **SC-002**: 100% of normal restarts after successful onboarding resume through trusted reconnect without requiring the original one-time onboarding package, as long as cloud trust remains valid.
- **SC-003**: Under standard local conditions, the first trusted telemetry batch after a normal restart reaches cloud within 60 seconds of runtime start.
- **SC-004**: 100% of trust-revoke, block, forced-disconnect, and invalid-reconnect scenarios stop trusted telemetry before any additional trusted batch is accepted after the trust loss is known.
- **SC-005**: In MVP validation flows, 100% of visible devices and metrics in cloud and client surfaces originate from telemetry already received by cloud rather than from manual catalog authoring.
- **SC-006**: An operator can determine whether the runtime is awaiting first onboarding, ready for trusted reconnect, blocked, or recovery-needed within 2 minutes using only the minimal local support provided by MVP.
- **SC-007**: After re-enable and successful fresh onboarding, the edge resumes trusted telemetry without requiring operators to rebuild unchanged local source definitions.
- **SC-008**: A single trusted edge runtime can expose telemetry for more than one device and more than one metric per device in MVP while preserving telemetry-derived visibility in cloud and client surfaces.

---

## 6. Assumptions & Constraints

- `004-edge-onboarding`, `edge-socket-contract.md`, and `lifecycle-state-machine.md` remain authoritative for lifecycle meanings, onboarding and reconnect acceptance rules, and trust-removal semantics.
- `005-edge-test` remains a valid simulator-focused baseline, but this feature extends the runtime direction beyond simulator-only data toward real polling-based data collection.
- Cloud already provides the trust authority and the telemetry ingestion path needed for onboarding, reconnect, forced disconnect, and telemetry-derived visibility.
- MVP requires polling because the feature goal is to show real data in the system rather than only proving the trust flow with simulated values.
- The runtime may first be introduced as a locally run edge on a PC, but the feature must remain applicable to later dedicated edge deployments.
- A full edge UI is optional; minimal operator support is sufficient for MVP as long as bootstrap and recovery remain understandable.
- Future control capabilities must build on the same trusted runtime foundation, but control behavior itself is intentionally deferred.
- This specification intentionally avoids committing MVP to one hardware family, one protocol, one transport, or one deployment form factor.
