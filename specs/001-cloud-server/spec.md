# Feature Specification: Cloud Server Core Platform

> **NOTE:** The active OpenAPI source of truth lives in `/cloud_server/openapi.yaml`.

## 1. Problem Statement & Purpose

The `cloud_server` module is the central backend for the SCADA system. It stores users and diagrams, owns edge lifecycle and trust decisions, authorizes access to edge servers, routes live telemetry, and supports the frontend flows used by the dashboard and hosted constructor.

This feature now also needs to close the remaining API gap for hosted constructor integration, so the frontend does not rely on temporary static catalog data or client-side delete loops.

### Edge Semantics Authority

For edge lifecycle meaning, trusted runtime behavior, and cloud-facing edge trust semantics, this cloud feature now treats [`specs/007-edge-server/spec.md`](../007-edge-server/spec.md) as the active semantic source.

Older edge documents from `004-edge-onboarding`, `005-edge-test`, `006-edge-runtime-windows-mvp`, and `001-edge-runtime` may still contain useful implementation history, edge cases, or reusable constraints, but they are no longer authoritative for cloud-facing edge lifecycle semantics.

## Clarifications

### Session 2026-02-26

- Diagram deletion is hard delete.
- Dashboard real-time routing has priority over database persistence.
- Edge sends raw telemetry batches containing `deviceId`, `metric`, `value`, and `ts`.
- Human-readable sensor naming may be composed from `deviceId + metric` for now.
- Socket.IO dashboard auth uses JWT in handshake auth payload.

### Session 2026-03-05 (Cross-reference with 002-frontend)

- Missing frontend-support APIs were identified and added for admin user management, edge fleet listing, user stats, and password change.

### Session 2026-03-16 (Constructor hosting API parity)

- Hosted constructor must not depend on static client-side seed data for device/metric discovery.
- Cloud Server must expose `GET /api/edge-servers/:edgeId/catalog` for trusted users.
- The MVP catalog is read-only and derived from telemetry already known to Cloud for the selected edge server.
- Hosted constructor destructive layout save should use one bulk-delete endpoint instead of looping over binding-set deletes in the client.

### Session 2026-03-31 (sourceId removal prep)

- Canonical telemetry identity inside one `edgeId` is the pair `deviceId + metric`.
- Compatibility assumption for removing `sourceId`: within one `edgeId`, there are no conflicting telemetry streams that are distinguishable only by `sourceId`.
- If such a namespace collision is discovered, the removal must stop until a separate namespacing design is specified.
- Cloud-facing telemetry, catalog, and dashboard runtime contracts must not require `sourceId` as part of stream identity. `sourceId` may appear only as explicitly documented legacy compatibility or Edge-local source configuration data.

### Session 2026-06-12 (Admin diagram template assignment)

- An Admin-owned diagram is a retained layout template. Assignment creates a new independent User-owned diagram copy and never transfers template ownership.
- The assigned copy receives the latest persisted template name and layout, receives no binding profiles, and stores nullable `sourceTemplateId` as provenance only.
- Later template edits or deletion do not synchronize, delete, or invalidate existing User copies.
- Cloud revalidates the target as an active `USER`, enforces the target's current persisted tier and quota, and prevents duplicate assignment.
- FREE USER diagram creation, Save As, and assignment share atomic quota slots protected by the named partial unique index `uniq_diagram_owner_quota_slot`.
- Duplicate assignment provenance is protected by the named partial unique index `uniq_diagram_owner_source_template`.

## 2. Target Users & Roles

- **Admin**: manages users, subscription tier, bans, edge registration, edge assignments, and cloud-owned edge lifecycle actions.
- **Regular USER (PRO)**: can create unlimited diagrams and binding sets, and monitor assigned edge servers.
- **Regular USER (FREE)**: limited to 3 diagrams and 1 assigned edge server.
- **Edge Server**: external runtime agent that connects under cloud authority, uses the current persistent credential, and sends telemetry only while cloud accepts the trusted session.

## 3. User Scenarios / Use Cases

- **Scenario 1: User registration and edge assignment**
  - A user registers, then an Admin assigns one or more edge servers that remain governed by cloud-owned lifecycle and availability rules.
- **Scenario 2: Creating and saving diagrams**
  - A user edits a diagram and saves in place with OCC, or creates a new diagram via Save As.
- **Scenario 3: Managing bindings**
  - A user loads binding sets for a diagram and machine, edits `widgetId + deviceId + metric` bindings, and saves them.
- **Scenario 4: Hosted constructor catalog loading**
  - A hosted constructor page loads trusted machines, then requests a machine-scoped device/metric catalog from Cloud for the selected edge server.
- **Scenario 5: Destructive layout save**
  - If an in-place layout save should invalidate existing bindings, the hosted client may choose to delete all binding sets for the diagram after a successful diagram save.
- **Scenario 6: Real-time monitoring**
  - Dashboard subscribes to an edge stream and receives live telemetry with minimal latency.
- **Scenario 7: Cloud-owned edge lifecycle management**
  - An Admin registers an edge, rotates its credential, blocks it, or unblocks it, while Cloud keeps lifecycle meaning separate from availability and enforces trust changes on active runtime sessions.
- **Scenario 8: Admin template assignment**
  - An Admin creates and edits a retained layout-only template, then assigns it to an eligible User as an independent binding-free copy while keeping the source template.

## 4. Functional Requirements

- **FR-1**: The system MUST support user registration and authentication using email.
- **FR-2**: The system MUST enforce role-based access control and subscription-tier business limits.
- **FR-2b**: FREE users MUST be limited to 1 assigned edge server.
- **FR-3**: The system MUST allow Admins to register edge servers, assign users, view the global fleet, rotate edge credentials, block edges, and unblock edges under cloud-owned lifecycle authority.
- **FR-3b**: The system MUST expose a trusted-user device/metric catalog endpoint for a selected Edge Server: `GET /api/edge-servers/:edgeId/catalog`.
- **FR-4**: The system MUST allow users to save mnemonic diagrams, with FREE users limited to 3 owned diagrams through atomic quota slots shared by ordinary creation, Save As, and Admin-template assignment.
- **FR-4b**: The system MUST allow users to create and manage `DiagramBindings` sets keyed by `(diagramId, edgeServerId)`.
- **FR-5**: In-place diagram save MUST use OCC and include `bindingsInvalidated: true` when bindings exist for the diagram.
- **FR-6**: Hard delete of a diagram MUST also remove its binding sets.
- **FR-6b**: The system MUST allow users to bulk-delete all binding sets for a diagram through `DELETE /api/diagrams/:id/bindings`.
- **FR-7**: Admins may assign only their own retained diagram templates. Assignment MUST create a new independent User-owned copy from the latest persisted template name and layout, MUST NOT transfer ownership or copy bindings, and MUST leave the Admin template available.
- **FR-7A**: Assigned copies MUST store nullable `sourceTemplateId` provenance, while ordinary creation and Save As MUST omit it; provenance MUST NOT synchronize a copy with its source template.
- **FR-7B**: Cloud MUST reject ineligible targets, quota-full targets, and duplicate `(ownerId, sourceTemplateId)` assignment before creating a partial copy.
- **FR-7C**: FREE quota and duplicate assignment concurrency MUST be enforced by the named partial unique indexes `uniq_diagram_owner_quota_slot` and `uniq_diagram_owner_source_template`.
- **FR-8**: Users MUST NOT bind to edge servers they do not own or are not trusted to access.
- **FR-9**: The system MUST expose a real-time connection endpoint for receiving telemetry from edge servers.
- **FR-10**: The system MUST expose a real-time subscription endpoint for dashboards with authorization checks.
- **FR-11**: The system MUST support soft deletion of users.
- **FR-12**: Edge servers MUST authenticate through the current cloud-issued persistent credential only, and Cloud MUST store credential secrets as non-recoverable hashes.
- **FR-12A**: Edge registration MUST create the edge in lifecycle state `Active` and issue the first persistent credential immediately.
- **FR-12B**: Cloud MUST accept edge runtime sessions only when the edge exists, remains `Active`, and presents the current valid persistent credential.
- **FR-12C**: Credential rotation MUST keep the edge in `Active`, invalidate the previous credential immediately, and interrupt any active trusted runtime session.
- **FR-12D**: Blocking an edge MUST move it to `Blocked`, invalidate current trusted access immediately, and interrupt any active trusted runtime session.
- **FR-12E**: Unblocking an edge MUST return it to `Active` and issue a fresh persistent credential.
- **FR-13**: The system MUST aggregate raw telemetry batches into `{ min, max, last }` records while broadcasting the latest value immediately.
- **FR-13A**: Cloud MUST key telemetry aggregation, dashboard broadcast readings, and catalog rows inside one `edgeId` by `deviceId + metric`, without requiring `sourceId`.
- **FR-14**: The system MUST project edge lifecycle state separately from edge availability and MUST expose at minimum lifecycle `Active | Blocked` plus availability `online | offline | lastSeenAt` to downstream consumers.
- **FR-15**: Database failures MUST NOT block live telemetry broadcasts.
- **FR-16**: The system MUST be covered by unit and integration tests.
- **FR-17**: The system MUST provide OpenAPI-backed REST documentation.
- **FR-18**: The system MUST be implemented in TypeScript.
- **FR-19**: Cloud MUST remain the canonical authority for edge lifecycle state, credential validity, connection acceptance or rejection outcomes, and cloud-facing edge contract semantics.
- **FR-20**: Cloud MUST treat trusted telemetry as eligible only while an edge runtime session is currently connected under an accepted credential and the edge lifecycle remains `Active`.
- **FR-21**: When a trusted edge disconnects normally, Cloud MUST update availability without changing lifecycle meaning.
- **FR-22**: When some devices or metrics stop producing readings while a trusted edge session remains accepted, Cloud MUST continue accepting unaffected telemetry and MUST NOT infer trust loss or force offline availability solely from partial local-source degradation.
- **FR-23**: Cloud MUST preserve auditable outcomes for edge registration, credential issuance, credential rotation, block, unblock, accepted edge connection, rejected edge connection, and trusted-session interruption.

## 5. Success Criteria

- Live telemetry reaches dashboards with low perceived latency.
- Unauthorized users cannot read another user's diagrams, bindings, or machine-scoped catalog data.
- Concurrent diagram saves produce a conflict for the stale client.
- Admin template assignment creates one independent binding-free User copy, preserves the Admin template, and cannot bypass current quota or duplicate prevention.
- A trusted USER can request an edge catalog and receive device/metric entries that match hosted constructor binding identifiers.
- Product consumers can distinguish edge lifecycle state from current availability in registration, reconnect, rotation, block, and unblock scenarios.
- Edge credential rotation and block actions stop trusted runtime telemetry immediately without requiring a separate onboarding workflow.

## 6. Key Entities

- **User**: credentials, role, tier, account state.
- **EdgeServer**: registration metadata, lifecycle state, availability snapshot, current persistent credential metadata, trusted users, and assignment metadata.
- **Diagram**: visual layout, sole ownership, OCC version, optional assignment provenance, and optional internal FREE quota slot.
- **DiagramBindings**: `diagramId + edgeServerId` binding set with `[{ widgetId, deviceId, metric }]`.
- **Telemetry**: time-series telemetry records derived from trusted edge sessions.
- **EdgeDeviceMetricCatalogEntry**: derived read model describing one visible device/metric option for a selected edge server.
- **Trusted Edge Session**: the currently accepted realtime edge connection under which Cloud treats telemetry as trusted.
- **Edge Lifecycle Action**: an Admin-owned Cloud action that changes credential validity or lifecycle meaning through registration, rotation, block, or unblock.

## 7. Assumptions & Constraints

- Cloud does not speak industrial protocols directly; edge servers send normalized payloads.
- `specs/007-edge-server/spec.md` is the authoritative semantic source for edge lifecycle meaning, trusted runtime behavior, and cloud-facing edge trust expectations.
- The initial catalog endpoint may derive entries from telemetry already stored or observed by Cloud.
- Within one `edgeId`, canonical telemetry identity and binding identity are defined only by `deviceId + metric`.
- Catalog labels may use the fallback `deviceId + metric` composition until richer metadata exists.
- Historical telemetry documents may still carry legacy `metadata.sourceId`, but Cloud treats that field as non-canonical compatibility data and must not use it as an identity key.
- Authentication uses standard JWT-based web flows for HTTP and Socket.IO dashboard access.
- Edge trust uses a persistent-credential-only model; one-time onboarding packages and onboarding-only lifecycle states are no longer part of the active cloud-facing edge semantics.

## 8. Resolved Clarifications

- Subscriptions are managed manually through `subscriptionTier`.
- Telemetry is both routed live and persisted with TTL-based retention.
- MongoDB remains the primary database.
- Hosted constructor should consume a cloud-backed catalog via `/client`, not static seed data.
- Hosted constructor destructive save should use a dedicated bulk-delete bindings endpoint.
- Admin diagrams are retained layout templates; assignment creates independent copies and does not establish template synchronization.
