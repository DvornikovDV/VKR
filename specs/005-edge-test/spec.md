# Feature Specification: Test Edge Server MVP

**Feature Branch**: `005-edge-test`  
**Created**: 2026-04-02  
**Status**: Draft  
**Input**: User description: "Specify a new feature for a test Edge Server MVP in `edge_server` as a separate feature for early end-to-end validation of edge onboarding and telemetry in the SCADA system."

---

## 1. Problem Statement & Purpose

`004-edge-onboarding` already defines the canonical cloud-side onboarding lifecycle, credential rotation meaning, and trusted reconnect contract for Edge Servers. However, the repository still lacks a dedicated edge-side MVP that can exercise that contract end to end in a production-shaped way before real hardware polling exists.

Without such a feature, the team can define onboarding and telemetry contracts on paper but still miss important runtime gaps around local credential persistence, reconnect behavior, trust loss handling, operator recoverability, and the way device catalogs appear in user-facing surfaces only after telemetry has actually reached cloud.

The purpose of this feature is to define a separate test Edge Server MVP inside `edge_server` that:

- validates first onboarding and later reconnect behavior against the existing cloud edge runtime contract
- persists and rotates edge-side trust material locally
- emits cyclic telemetry from a simulator-owned source instead of real controllers for now
- proves that cloud and client can observe a realistic edge lifecycle and telemetry-derived device catalog without inventing extra cloud-side inventory management
- keeps the edge runtime shape reusable so the simulator can later be replaced by real polling adapters

---

## 2. Product Direction & Scope Boundaries

This feature owns the edge-side runtime behavior for a test Edge Server MVP. It defines how a single edge process is bootstrapped, trusted, re-trusted, operated, and recovered locally while using a simulated telemetry source for now.

### Ownership Sync

- `004-edge-onboarding` owns the canonical lifecycle meaning, credential semantics, and cloud acceptance rules for onboarding and reconnect.
- `005-edge-test` owns the edge-side runtime behavior needed to consume that contract and prove the onboarding plus telemetry path end to end.
- `002-frontend` and `003-dashboard` remain consumers of telemetry-derived visibility. They do not own simulator inventory or device-list authoring for this MVP.

### MVP Scope

This feature is in scope for:

- a dedicated test Edge Server runtime in `edge_server` for early end-to-end validation
- a production-shaped runtime split between reusable core behavior and simulator-specific behavior
- first startup from a one-time onboarding package and later reconnects from a locally persisted credential
- local runtime state that supports restart, reconnect, trust loss, re-onboarding, and credential rotation flows
- operator control through config file inputs, CLI flags, and readable logs
- cyclic telemetry batch generation in the canonical sample model using `deviceId`, `metric`, `value`, and `ts`
- a simulator-owned local configuration that defines which devices and metrics exist for the test edge
- trust-revoke, block, re-enable, forced-disconnect, re-onboarding, and outdated-credential handling from the edge perspective
- compatibility with current cloud/client behavior where the visible device catalog is read-only and emerges from telemetry already received by cloud

### Post-MVP Direction

Post-MVP work may extend this feature with:

- richer telemetry generation scenarios such as ramps, spikes, alarms, drift, and multi-rate streams
- deterministic replay or seeded generation modes for repeatable demonstrations and tests
- hot reload or live profile switching for simulator inputs
- smoke-run and quickstart ergonomics for faster local validation
- multi-instance operator conveniences and richer diagnostics
- replacement of the simulator adapter with real controller or protocol adapters

### Out Of Scope

This feature is out of scope for:

- real industrial hardware or protocol integration
- moving cloud business rules or inventory ownership into `edge_server`
- client-side editing of device lists for this MVP
- introducing a separate cloud-managed device inventory before telemetry arrives
- redefining the canonical lifecycle semantics already owned by `004-edge-onboarding`
- advanced simulator ergonomics beyond what is needed for MVP operator usability and end-to-end validation

---

## 3. User Scenarios & Testing *(mandatory)*

### User Story 1 - Activate A New Test Edge (Priority: P1)

As an operator, I want to start a freshly registered test edge from a one-time onboarding package so that the edge can establish trust once and become ready for later unattended reconnects.

**Why this priority**: The trust boundary is the first usable step in the whole feature. Without a valid first activation, there is no trusted runtime, no reconnect story, and no telemetry proof.

**Independent Test**: Start the test edge with no prior local state and a valid one-time onboarding package, then confirm that the edge becomes trusted and stores the post-activation reconnect credential locally for future runs.

**Acceptance Scenarios**:

1. **Given** a freshly registered edge has no local persisted credential, **When** the operator starts the runtime with a valid one-time onboarding package, **Then** the runtime authenticates through the onboarding path, becomes trusted, and persists the newly issued reconnect credential locally.
2. **Given** the operator starts a freshly registered edge with a wrong, expired, reused, or mismatched onboarding package, **When** the first connection is attempted, **Then** the runtime remains untrusted, sends no telemetry, and exposes a readable recovery reason.
3. **Given** the edge has already completed a successful onboarding cycle once, **When** the process is started again later, **Then** the runtime no longer depends on the original one-time onboarding package for normal reconnect.

---

### User Story 2 - Reconnect And Publish Simulated Telemetry (Priority: P1)

As a platform team, we want the trusted test edge to reconnect automatically and emit canonical telemetry from a simulator-owned configuration so that cloud and client can validate the real end-to-end telemetry path before hardware polling exists.

**Why this priority**: This is the fastest way to validate that onboarding actually leads to useful runtime behavior and that user-facing device visibility still comes from telemetry instead of manual catalog editing.

**Independent Test**: Activate the edge once, restart it, and verify that it reconnects using the persisted credential, resumes telemetry cycles, and causes cloud/client to show device and metric visibility derived only from received telemetry.

**Acceptance Scenarios**:

1. **Given** a trusted runtime and a local simulator configuration with devices and metrics, **When** the telemetry cycle runs, **Then** the runtime emits telemetry batches whose samples use the canonical fields `deviceId`, `metric`, `value`, and `ts`.
2. **Given** cloud receives valid telemetry from the test edge, **When** user-facing catalog surfaces refresh, **Then** the visible devices and metrics appear as read-only data derived from telemetry already received by cloud.
3. **Given** the runtime has a valid persisted reconnect credential, **When** the process restarts under normal conditions, **Then** it reconnects through the returning-trusted path and resumes telemetry without requiring the one-time onboarding package again.
4. **Given** the runtime is disconnected or not trusted, **When** the next telemetry cycle would occur, **Then** trusted telemetry is not emitted until a trusted session is restored.

---

### User Story 3 - Recover From Trust Loss And Credential Change (Priority: P2)

As an operator, I want the test edge to react clearly to trust revoke, block, forced disconnect, and outdated credentials so that recovery and re-onboarding are safe, understandable, and do not rely on hidden cloud logic inside the edge runtime.

**Why this priority**: A realistic edge MVP must prove not only the happy path, but also how trust is intentionally removed and restored without ambiguity or stale credentials continuing to behave as trusted.

**Independent Test**: Run an already trusted test edge, then trigger trust revoke, block, re-enable, credential replacement, and re-onboarding from cloud-side controls. Verify that telemetry stops immediately when trust is lost and resumes only after a valid fresh onboarding cycle.

**Acceptance Scenarios**:

1. **Given** a trusted runtime is currently sending telemetry, **When** cloud revokes trust, blocks the edge, or forces a disconnect, **Then** the runtime stops trusted telemetry immediately and records an operator-visible reason for the stop.
2. **Given** the runtime later presents an outdated or revoked reconnect credential, **When** cloud rejects that reconnect, **Then** the runtime does not continue operating as trusted and surfaces that recovery or re-onboarding is required.
3. **Given** the edge has been re-enabled for onboarding and the operator provides a fresh onboarding package, **When** a new onboarding cycle succeeds, **Then** the runtime persists the rotated reconnect credential locally and returns to trusted telemetry operation.
4. **Given** the edge is blocked, **When** restart or reconnect attempts happen before re-enable and fresh onboarding, **Then** the runtime remains unable to operate as trusted and does not resume telemetry.

---

### User Story 4 - Operate The Test Edge Through Stable Local Inputs (Priority: P3)

As an operator, I want simple local controls and readable logs so that I can bootstrap, restart, inspect, and recover the test edge without editing source code or guessing which credential mode it is currently using.

**Why this priority**: The MVP is meant for early validation, so it must be practical for humans to run and understand even before richer automation and quickstart tooling exist.

**Independent Test**: Configure the edge through a local config file and CLI flags, run it through onboarding and reconnect flows, and confirm that logs clearly explain mode changes, failures, and next actions without exposing secrets.

**Acceptance Scenarios**:

1. **Given** an operator has a local config file and optional CLI overrides, **When** the runtime starts, **Then** they can control cloud target, bootstrap inputs, simulator profile, cycle behavior, and local state location without changing source code.
2. **Given** the runtime changes connection mode, trust status, or telemetry status, **When** it writes logs, **Then** the logs identify the edge, current mode, and actionable reason without printing full secrets.
3. **Given** the runtime must survive normal restarts but also support clean recovery, **When** the operator inspects local artifacts, **Then** stable simulator configuration and rotatable runtime state are kept as separate concerns.

---

### Edge Cases

- A persisted reconnect credential exists locally, but the operator also supplies a one-time onboarding package on startup.
- The local state file is missing, partially written, or corrupted after a previous run.
- Onboarding succeeds remotely, but the process stops before the new reconnect credential is durably persisted.
- Cloud rejects a reconnect because the stored persistent credential has become outdated after trust revoke or rotation.
- Cloud forces a disconnect while a telemetry batch is in progress.
- An edge is re-enabled after block, but the operator has not yet received or entered a fresh onboarding package.
- The simulator configuration defines no devices, no metrics, or invalid combinations for a telemetry cycle.
- An operator accidentally retries with an old onboarding package after credentials were reset on the cloud side.
- A restart happens while the runtime is already in a recovery-needed state and should not resume trusted telemetry.

---

## 4. Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a dedicated test Edge Server runtime feature in `edge_server` for early end-to-end validation of onboarding and telemetry.
- **FR-002**: System MUST keep reusable runtime behavior separate from simulator-specific behavior so the simulated source can later be replaced without redesigning the full edge runtime.
- **FR-003**: System MUST model the simulated telemetry source as a replaceable adapter rather than as hard-wired business logic spread across the runtime.
- **FR-004**: System MUST support first startup from an operator-supplied one-time onboarding package that identifies the edge and authorizes only the initial trust establishment flow.
- **FR-005**: After successful onboarding, system MUST persist the post-activation reconnect credential locally for later trusted reconnects.
- **FR-006**: On later runs, system MUST prefer a valid locally persisted reconnect credential over the original one-time onboarding package.
- **FR-007**: System MUST keep local runtime state sufficient to distinguish first activation, normal trusted reconnect, recovery-needed, re-onboarding, and blocked-retry behavior.
- **FR-008**: System MUST allow normal restarts to reconnect without requiring the operator to re-enter the one-time onboarding secret once a valid reconnect credential has been persisted.
- **FR-009**: System MUST accept operator inputs through a config file and CLI flags.
- **FR-010**: CLI flags MUST be able to override config-file values for a single run without requiring source changes.
- **FR-011**: System MUST expose readable logs for startup mode, trust outcome, reconnect outcome, disconnect reason, telemetry start, and telemetry stop.
- **FR-012**: System MUST NOT print full onboarding or reconnect secrets in ordinary logs or status output.
- **FR-013**: System MUST consume the existing cloud edge runtime contract for both first onboarding and later trusted reconnects.
- **FR-014**: System MUST switch from onboarding behavior to returning-trusted behavior only after cloud accepts the edge and returns a reconnect credential.
- **FR-015**: System MUST persist any newly issued reconnect credential after successful onboarding or successful re-onboarding.
- **FR-016**: System MUST send telemetry cyclically in batches after trust is established.
- **FR-017**: Each emitted telemetry sample in MVP MUST use the canonical payload fields `deviceId`, `metric`, `value`, and `ts`.
- **FR-018**: System MUST source emitted devices and metrics from an edge-owned local simulator configuration rather than from a cloud-managed inventory.
- **FR-019**: The local simulator configuration MUST be able to define more than one device and more than one metric per device in MVP.
- **FR-020**: System MUST stop trusted telemetry emission whenever the runtime is disconnected, blocked, revoked, or otherwise not in a trusted session.
- **FR-021**: System MUST treat trust revoke, block, forced disconnect, outdated reconnect credential, and fresh re-onboarding as distinct operator-visible outcomes.
- **FR-022**: When a reconnect credential is rejected as outdated, revoked, or otherwise no longer valid, system MUST enter a recovery-needed path instead of continuing to behave as a trusted edge.
- **FR-023**: When the edge is blocked, system MUST keep the runtime out of trusted operation until cloud later permits re-onboarding and a fresh onboarding cycle succeeds.
- **FR-024**: When re-onboarding succeeds, system MUST replace the old reconnect credential with the new trusted credential for future runs.
- **FR-025**: System MUST fit the existing cloud/client behavior where the user-facing device catalog is read-only and derived from telemetry already received by cloud.
- **FR-026**: System MUST NOT require client-side editing of device lists for simulated devices or metrics to become visible in MVP.
- **FR-027**: System MUST NOT introduce a separate cloud-managed device inventory as part of this MVP.
- **FR-028**: System MUST keep cloud business logic out of `edge_server`; the runtime may react to cloud outcomes but must not redefine cloud-side lifecycle authority locally.
- **FR-029**: System MUST keep stable operator configuration separate from rotatable local credential or session state so recovery actions do not require rebuilding simulator definitions.
- **FR-030**: This feature MUST NOT define real hardware or industrial protocol integration in MVP.

### Key Entities *(include if feature involves data)*

- **Test Edge Runtime**: The dedicated edge-side process used to validate onboarding, reconnect, telemetry, and recovery behavior end to end before real hardware adapters exist.
- **Operator Bootstrap Input**: The local operator-provided inputs needed to start the runtime, including one-time onboarding data when no valid reconnect credential is already available.
- **Local Runtime State**: Edge-owned persisted state used to remember reconnect credentials and recovery-relevant status across process restarts.
- **Simulator Source Configuration**: Edge-owned local definition of simulated devices, metrics, and generation behavior that drives telemetry batches in MVP.
- **Trusted Reconnect Credential**: The locally persisted credential issued by cloud after successful onboarding and used for later returning-trusted sessions.
- **Telemetry Batch**: A cyclic payload containing one or more canonical telemetry samples identified by `deviceId`, `metric`, `value`, and `ts`.
- **Runtime Trust Outcome**: The operator-visible result of an onboarding or reconnect attempt, such as trusted, blocked, recovery-needed, or forced-disconnected.

---

## 5. Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An operator can bring a newly registered test edge from a one-time onboarding package to first accepted telemetry within 5 minutes under normal conditions, using only local config/CLI inputs and runtime logs.
- **SC-002**: 100% of normal restarts after successful activation reconnect without requiring the original one-time onboarding secret, as long as cloud trust has not been revoked.
- **SC-003**: After a normal trusted restart, the first telemetry batch reaches cloud within 30 seconds of process start under standard local conditions.
- **SC-004**: 100% of trust-revoke, block, forced-disconnect, and outdated-credential scenarios stop trusted telemetry before any additional trusted batch is sent after the trust loss is known.
- **SC-005**: In MVP validation flows, 100% of visible simulated devices and metrics in user-facing catalog surfaces are derived from telemetry already received by cloud rather than manual catalog editing.
- **SC-006**: An operator can determine the runtime's current trust mode and required recovery action from logs and local state in under 2 minutes without reading source code.
- **SC-007**: A re-enabled edge can complete re-onboarding and resume trusted telemetry without rebuilding its simulator device list or manually editing any client-side inventory.

---

## 6. Assumptions & Constraints

- The canonical lifecycle meaning, acceptance rules, and credential semantics from `004-edge-onboarding` remain authoritative for this feature.
- Cloud already provides the edge runtime contract and telemetry ingestion path needed for onboarding, reconnect, disconnect, and telemetry acceptance.
- The local operator can provide a config file, optional CLI overrides, and access to the edge-owned local state on the machine where the test runtime runs.
- The simulator only needs to produce believable telemetry for end-to-end validation; it does not need to model real physics, protocol timing, or hardware failure modes in MVP.
- User-facing device and metric visibility remains read-only and telemetry-derived; this feature must not backfill visibility through manual catalog authoring.
- Recovery actions that require new onboarding material are initiated outside the edge runtime by existing cloud-side lifecycle controls.
- Security hardening beyond ordinary local secret persistence and log redaction may be improved later, but MVP still must avoid exposing full secrets in normal operator output.
- Post-MVP ergonomics such as richer scenario libraries, deterministic replay, live simulator reload, and smoke-run shortcuts are intentionally deferred so MVP stays focused on the essential onboarding plus telemetry path.
