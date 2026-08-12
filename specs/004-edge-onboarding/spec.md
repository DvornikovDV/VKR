# Feature Specification: Edge Server Onboarding Contract

**Feature Branch**: `004-edge-onboarding`  
**Created**: 2026-03-26  
**Status**: Draft  
**Input**: User description: "Describe a new end-to-end onboarding scenario for Edge Server that defines registration, first-connection credentials, onboarding states, and cloud-side verification without duplicating existing client work from 002-frontend."

---

## 1. Problem Statement & Purpose

`002-frontend` already establishes Admin fleet management, User equipment visibility, and later telemetry-facing flows, but it does not yet define one canonical product contract for how an Edge Server is registered, how its first-connection credentials are issued and handled, how first trust is established, or which lifecycle states the product must use before and after the first successful connection.

Without that contract, `client` and `cloud_server` can drift in meaning. The same edge could be treated as "registered", "offline", "not yet connected", or "ready for telemetry" differently by different modules, which creates duplicated ownership and inconsistent onboarding behavior.

The purpose of this specification is to define a single source of truth for Edge Server onboarding across product and system behavior:

- what an Admin does when creating a new edge
- what one-time credentials the system issues for the first connection
- how those credentials are disclosed, protected, and reset
- how cloud verifies an edge during the first connection and later reconnects
- which onboarding states exist before and after first trust is established
- which downstream client flows may rely on an edge as telemetry-ready

---

## 2. Product Direction & Scope Boundaries

This feature owns the onboarding contract for Edge Servers. It defines the product lifecycle from administrative registration to first successful trusted connection and the canonical meaning of edge onboarding states.

This feature is in scope for:

- Admin-driven registration of a new Edge Server record
- issuing a one-time first-connection credential package
- protecting the secret so it is not recoverable from normal product views
- resetting onboarding credentials when the secret is lost, expired, or compromised
- cloud-side acceptance or rejection of a first connection based on presented credentials
- the canonical state model used before first trust, after activation, and during recovery
- the eligibility rule that determines when downstream product flows may treat an edge as telemetry-ready

This feature is out of scope for:

- the layout and detailed UX of `My Equipment`
- telemetry binding setup in Constructor
- Dashboard runtime behavior
- the simulator and protocol-specific device emulation
- the full telemetry pipeline after onboarding is complete

Dependency boundaries:

- `002-frontend` keeps ownership of Admin fleet pages, `My Equipment`, Constructor readiness guidance, and related client tasks, but those surfaces must consume the onboarding states and readiness rules defined here instead of redefining first-connection behavior locally.
- `003-dashboard` keeps ownership of monitoring behavior, but it may only treat edges that satisfy this specification's trusted-ready rule as valid monitoring targets.
- `cloud_server` keeps ownership of the concrete implementation, but its behavior must match the product contract defined here for registration, verification outcomes, and lifecycle transitions.

---

## Clarifications

### Session 2026-03-26

- Q: Which trust mechanism should an edge use for later reconnects after the first successful activation? -> A: Cloud issues the edge a new persistent credential for subsequent reconnects.
- Q: What should happen to an already active edge when an Admin resets onboarding credentials for recovery? -> A: The reset prepares new onboarding credentials, but the current active edge remains trusted until trust is later removed separately.
- Q: Which onboarding state should a blocked edge enter after an Admin re-enables onboarding? -> A: It enters `Re-onboarding Required` and must complete a fresh onboarding cycle.
- Q: What should happen to an already connected active edge when an Admin blocks it? -> A: Blocking immediately revokes current trust, invalidates the persistent credential, and stops trusted operation until re-enabled and re-onboarded.
- Q: How long should a one-time first-connection package remain valid after issue or reset? -> A: The package remains valid for 24 hours after issue or reset.

---

## 3. User Scenarios & Testing *(mandatory)*

### User Story 1 - Register Edge And Issue First-Connection Package (Priority: P1)

As an Admin, I want to register a new Edge Server and immediately receive a one-time first-connection package so that an installer or operator can connect the physical edge for the first time without manual back-office intervention.

**Why this priority**: No onboarding journey can begin until the product creates the edge record and hands out the first-connection package in a secure, usable way.

**Independent Test**: Register a new edge as an Admin, capture the issued package, reopen the edge record, and verify the product still shows the onboarding state and package metadata but no longer reveals the full secret. Reset the package and verify the previously issued secret is no longer valid.

**Acceptance Scenarios**:

1. **Given** an authenticated Admin starts edge registration, **When** the required identification details are submitted, **Then** the system creates the edge in `Pending First Connection` state and issues a one-time first-connection package.
2. **Given** the first-connection package is displayed, **When** the Admin views it for the initial time, **Then** the package includes a stable edge identifier, a one-time first-connection secret, and clear instructions that these credentials are required for the first connection only.
3. **Given** the Admin leaves the initial disclosure flow, **When** they later reopen the edge record, **Then** the product shows that credentials were issued but does not reveal the previously issued full secret again.
4. **Given** an edge has not completed its first connection yet, **When** the Admin resets onboarding credentials, **Then** the previously issued package becomes unusable immediately and a new one-time package is issued for the same edge record.

---

### User Story 2 - Complete First Connection And Establish Trust (Priority: P1)

As the product platform, I want cloud to accept only a valid first-time edge connection and then promote that edge into a trusted active state so that later telemetry and monitoring flows start from a verified device identity rather than an unverified registration record.

**Why this priority**: The first successful connection is the trust boundary for all later product behavior. If this step is ambiguous, the platform cannot reliably decide which edges are safe to use in telemetry-related flows.

**Independent Test**: Attempt a first connection from a newly registered edge with valid credentials, then retry with the same credentials again and with an invalid package. Verify that only the first valid activation succeeds, the edge becomes active, and later attempts with reused or invalid first-connection credentials are rejected.

**Acceptance Scenarios**:

1. **Given** an edge is in `Pending First Connection`, **When** cloud receives a first connection with the correct edge identifier and currently valid one-time secret, **Then** cloud accepts the connection, marks the edge as `Active`, records that the first connection succeeded, and retires the one-time secret from future use.
2. **Given** an edge is already `Active`, **When** it reconnects later, **Then** the product treats it as a returning trusted edge and does not require the original first-connection secret again.
3. **Given** a first connection is attempted with an unknown, wrong, expired, reset, reused, or blocked credential package, **When** cloud evaluates the request, **Then** the connection is rejected and the edge does not become `Active`.
4. **Given** more than one device attempts to use the same one-time first-connection package, **When** those attempts occur, **Then** the product allows at most one successful first activation and rejects all later uses of that same package.

---

### User Story 3 - Use Canonical Onboarding States Across Product Surfaces (Priority: P2)

As a product team, we want Admin, client, and cloud work to use one shared meaning for edge onboarding states so that registration, equipment readiness, and later telemetry flows stay aligned without duplicated ownership.

**Why this priority**: The product can only stay coherent if "not yet connected", "active", "blocked", and "must reconnect through onboarding" mean the same thing everywhere.

**Independent Test**: Create one never-connected edge, one successfully activated edge that is currently offline, one edge forced back into onboarding, and one blocked edge. Verify each case is distinguishable by lifecycle meaning and that only the active trusted edge is eligible for downstream telemetry-related flows.

**Acceptance Scenarios**:

1. **Given** an edge has been registered but has never completed a valid first connection, **When** its state is shown anywhere in the product, **Then** it is represented as `Pending First Connection`, not as a generic offline device.
2. **Given** an edge has already completed onboarding, **When** it is temporarily unreachable later, **Then** it remains `Active` in onboarding terms and its current availability is shown separately as a runtime status rather than resetting the onboarding lifecycle.
3. **Given** an `Active` edge must be prepared for future recovery, **When** the Admin resets onboarding credentials, **Then** the system issues a fresh one-time onboarding package for that edge without immediately removing its current trusted access or changing its onboarding state.
4. **Given** an edge's current trusted access is later removed after recovery preparation, **When** the product evaluates its onboarding lifecycle, **Then** the edge moves to `Re-onboarding Required` until a new successful first connection is completed.
5. **Given** an Admin blocks an edge that is already trusted, **When** the block is applied, **Then** the product immediately revokes the current trusted access, invalidates the persistent reconnect credential, and stops trusted operation for that edge.
6. **Given** an Admin re-enables onboarding for a previously blocked edge, **When** the product restores eligibility for onboarding, **Then** the edge enters `Re-onboarding Required` and must complete a fresh onboarding cycle before it becomes telemetry-ready again.
7. **Given** an Admin blocks an edge, **When** that edge attempts either a first-time connection or a later reconnect after the block, **Then** the product rejects the attempt and the edge remains in `Blocked` state until the Admin deliberately re-enables onboarding.
8. **Given** downstream client flows need an edge for equipment readiness, telemetry profile setup, or Dashboard monitoring, **When** eligibility is evaluated, **Then** only edges in `Active` state are considered telemetry-ready.

---

### Edge Cases

- An Admin loses the one-time first-connection secret before the device is connected for the first time.
- A screenshot or copied secret from an older package is used after the Admin has already reset onboarding credentials.
- A device presents the right edge identifier with the wrong secret, or the right secret with the wrong edge identifier.
- An edge finishes onboarding once, later loses its trusted access, and must return to `Re-onboarding Required` without being mistaken for a brand-new record.
- An Admin prepares recovery for an `Active` edge by resetting onboarding credentials, but the edge must remain trusted until its current trusted access is separately removed.
- An `Active` edge goes offline for an extended period; the product must not misclassify it as `Pending First Connection`.
- A `Blocked` edge attempts to reconnect using previously valid information.
- An Admin blocks an edge that is currently connected; the product must stop trusting that edge immediately rather than waiting for the next reconnect.
- Two physical devices attempt to activate themselves from the same one-time package.

---

## 4. Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow an Admin to create a new Edge Server registration record with the minimum identifying information needed to recognize that edge in product surfaces.
- **FR-002**: System MUST place a newly registered edge into `Pending First Connection` state until the first successful trusted connection is completed.
- **FR-003**: System MUST issue a one-time first-connection credential package at registration time.
- **FR-004**: The first-connection package MUST include a stable edge identifier, a one-time first-connection secret, and concise instructions that the package is meant for first connection only.
- **FR-004A**: Each issued or reset one-time first-connection package MUST expire 24 hours after issuance if it has not already been used, reset, or blocked.
- **FR-005**: System MUST disclose the full one-time secret only during the initial issue flow or an explicit reset flow.
- **FR-006**: After the initial disclosure flow is closed, system MUST NOT reveal the previously issued full secret again in standard product views.
- **FR-007**: System MUST retain non-secret package metadata so an Admin can tell whether onboarding credentials were issued, reset, used, expired, or blocked without seeing the full secret.
- **FR-008**: System MUST allow an Admin to reset onboarding credentials before or after activation when recovery or re-onboarding is required.
- **FR-008A**: If onboarding credentials are reset for an edge that is already `Active`, system MUST issue a fresh one-time onboarding package without immediately invalidating the edge's current persistent post-activation credential or changing its onboarding lifecycle state.
- **FR-009**: When onboarding credentials are reset, system MUST invalidate any previously issued unused one-time package immediately.
- **FR-010**: Cloud MUST verify the presented edge identifier together with the currently valid one-time secret before accepting a first connection from an edge that is not yet trusted.
- **FR-011**: If first-connection verification succeeds, system MUST move the edge from `Pending First Connection` or `Re-onboarding Required` to `Active`.
- **FR-012**: After a successful first connection, system MUST retire the one-time first-connection secret from future use.
- **FR-013**: After onboarding is complete, cloud MUST issue the edge a persistent post-activation credential for subsequent trusted reconnects.
- **FR-014**: After onboarding is complete, system MUST treat later reconnects as trusted reconnects using the persistent post-activation credential and MUST NOT require the original one-time first-connection secret again.
- **FR-015**: If a presented credential package is unknown, wrong, expired, reset, reused, or blocked, system MUST reject the connection and MUST NOT activate the edge.
- **FR-016**: System MUST accept at most one successful first activation for any single one-time package.
- **FR-017**: System MUST distinguish onboarding lifecycle state from runtime availability state.
- **FR-018**: System MUST support these canonical onboarding lifecycle states at minimum: `Pending First Connection`, `Active`, `Re-onboarding Required`, and `Blocked`.
- **FR-019**: `Pending First Connection` MUST mean the edge record exists and a valid first-connection package may exist, but no successful trusted connection has happened yet.
- **FR-020**: `Active` MUST mean the edge has completed at least one successful trusted connection, holds a valid persistent post-activation credential for reconnects, and is eligible for downstream telemetry-related product flows.
- **FR-021**: `Re-onboarding Required` MUST mean the edge is no longer trusted for downstream use until it completes a fresh onboarding cycle with a newly issued first-connection package; issuing that package alone does not enter this state until the current trusted access has been removed.
- **FR-022**: `Blocked` MUST mean the edge is intentionally prevented from both first-time connection and later reconnects, and any currently trusted access for that edge MUST be revoked immediately when the block is applied.
- **FR-022A**: When an Admin re-enables onboarding for a previously `Blocked` edge, system MUST move that edge to `Re-onboarding Required` and require a fresh onboarding cycle before downstream telemetry-related use is restored.
- **FR-023**: Once an edge is `Active`, system MUST show onboarding state and current availability as separate concepts rather than collapsing both into a single status label.
- **FR-024**: Downstream client flows defined in `002-frontend` and `003-dashboard` MUST treat only `Active` edges as telemetry-ready for equipment readiness, telemetry profile work, and monitoring.
- **FR-025**: This specification MUST be the canonical product contract for edge registration terminology, first-connection credential handling, persistent reconnect credential handling, verification outcomes, and onboarding lifecycle meanings across client and cloud work.
- **FR-026**: This feature MUST NOT redefine the detailed UX of `My Equipment`, Constructor bindings, Dashboard runtime behavior, the simulator, or the complete telemetry flow after onboarding.
- **FR-027**: System MUST preserve an auditable outcome for credential issue, reset, first successful activation, rejected activation attempts, persistent reconnect credential issuance, immediate trust revocation on block, and blocking so support and operations can explain the current lifecycle state.

### Key Entities *(include if feature involves data)*

- **Edge Registration Record**: The product record created by an Admin for a specific Edge Server before first trust is established.
- **First-Connection Credential Package**: The one-time package disclosed to the Admin for first installation, containing the stable edge identifier, the one-time secret, and usage instructions.
- **Persistent Post-Activation Credential**: The long-lived device credential issued by cloud after the first successful activation and used by the edge for subsequent trusted reconnects.
- **Onboarding Lifecycle State**: The canonical product state that describes whether the edge is waiting for first trust, active, forced back into onboarding, or blocked.
- **Trusted Edge Identity**: The product-recognized status of an edge after a successful first connection, allowing later reconnects and downstream telemetry-related use.
- **Availability Status**: The current operational reachability of an already active edge, separate from onboarding lifecycle state.
- **Verification Outcome**: The recorded result of a first-connection or reconnect attempt, including whether it was accepted or rejected and why.

---

## 5. Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An Admin can complete registration of a new edge and obtain its one-time first-connection package in under 1 minute under normal operating conditions.
- **SC-002**: 100% of newly registered edges that have never connected are represented as `Pending First Connection`, not as generic offline equipment.
- **SC-003**: 100% of successful first connections transition the corresponding edge to `Active` and retire the used one-time first-connection secret from further activation use.
- **SC-004**: 100% of invalid, expired, reset, reused, unknown, or blocked first-connection packages are rejected and do not activate an edge.
- **SC-004A**: 100% of unused one-time first-connection packages older than 24 hours are rejected as expired and do not activate an edge.
- **SC-005**: When onboarding credentials are reset, the previously issued package becomes unusable immediately and the Admin can continue recovery without support intervention.
- **SC-006**: Product surfaces that consume edge lifecycle data can distinguish `Active` from current online or offline availability in every onboarding-related scenario.
- **SC-007**: Only edges in `Active` state are eligible for downstream telemetry-ready flows; edges in `Pending First Connection`, `Re-onboarding Required`, or `Blocked` never enter those flows.
- **SC-008**: `002-frontend` and `003-dashboard` can reference one shared edge onboarding state model and readiness rule without redefining first-connection semantics in their own specifications.

---

## 6. Assumptions & Constraints

- Admin is the only product role that can register an edge, reset onboarding credentials, or intentionally block and re-enable onboarding.
- The person who performs the physical first connection may be different from the Admin who created the edge record; the delivery channel used to pass the one-time package to that installer or operator is outside this specification.
- An edge may be assigned to a user elsewhere in the product, but ownership or assignment rules are not redefined here.
- The product must never depend on showing a previously issued full secret again as a recovery method; recovery happens through credential reset and re-onboarding.
- Resetting onboarding credentials for an already `Active` edge prepares future recovery but does not by itself remove the edge's current trusted access.
- A one-time first-connection package remains valid for at most 24 hours after issue or reset unless it is used, reset, or blocked earlier.
- Runtime availability after activation is important for later flows, but it does not replace or redefine onboarding lifecycle meaning.
- `002-frontend` remains the owner of Admin fleet presentation, `My Equipment`, and Constructor-side readiness UX, while this specification defines the lifecycle semantics those surfaces must display.
- `003-dashboard` remains the owner of monitoring behavior, while this specification defines which edges are eligible to enter that monitoring flow.
- Protocol-specific handshakes, storage internals, cryptographic mechanisms, simulator behavior, and telemetry payload details are implementation concerns outside this product specification.
