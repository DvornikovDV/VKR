# Research & Architecture Decisions: Cloud Server Core Platform

## 1. OCC for Diagrams

- **Decision**: Use Mongoose `__v` for optimistic concurrency control on diagram updates.
- **Rationale**: It keeps save conflicts simple and aligns with the current client flow.

## 2. Telemetry Persistence and Broadcast Split

- **Decision**: Broadcast latest telemetry immediately and persist aggregated data in a separate resilient path.
- **Rationale**: Dashboard latency matters more than database completeness during transient failures.

## 3. Cloud-Owned Edge Lifecycle Authority

- **Decision**: Treat `cloud_server` as the canonical authority for edge lifecycle state, credential validity, connection acceptance, and trusted-session interruption.
- **Rationale**: The new edge model requires lifecycle meaning to be decided centrally so `client` and `edge_server` do not invent competing interpretations.

## 4. Edge Authentication

- **Decision**: Edge runtimes authenticate only with the current persistent credential, and Cloud stores the credential as a non-recoverable hash.
- **Rationale**: The new model removes onboarding-package semantics and uses one persistent credential path for both the first trusted connect and later reconnects.

## 5. Edge Registration

- **Decision**: Registering an edge creates it in lifecycle state `Active`, leaves availability separate, and discloses the first persistent credential once.
- **Rationale**: The new lifecycle does not include pending onboarding states; a newly registered edge may legitimately be `Active + offline` until its first accepted runtime session.

## 6. Credential Rotation

- **Decision**: Credential rotation keeps the edge in `Active`, invalidates the previous credential immediately, and disconnects any active trusted runtime session.
- **Rationale**: Rotation is a credential-management action, not a trust-recovery workflow. Keeping the edge `Active` preserves lifecycle clarity while still stopping the old trusted path immediately.

## 7. Block and Unblock

- **Decision**: Blocking moves an edge to `Blocked`, interrupts active trusted runtime access immediately, and prevents later trusted reconnects until unblock. Unblock returns the edge to `Active` and discloses a fresh persistent credential once.
- **Rationale**: This separates administrative denial of operation from ordinary credential rotation and avoids reintroducing onboarding or re-enable workflows.

## 8. Lifecycle vs Availability

- **Decision**: Model lifecycle and availability as separate axes.
- **Rationale**: Normal disconnects, reconnect delays, and telemetry gaps must not redefine lifecycle meaning. `Blocked` is a trust decision; `offline` is an availability observation.

## 9. Partial Local-Source Degradation

- **Decision**: Continue accepting unaffected telemetry when some local sources fail, and do not infer trust loss or offline availability solely from partial source degradation.
- **Rationale**: The runtime remains trusted as long as the accepted edge session is intact. Local source failure affects telemetry completeness, not lifecycle authority.

## 10. Diagram Bindings Ownership

- **Decision**: Bindings remain a separate collection keyed by `(diagramId, edgeServerId)`.
- **Rationale**: Layout and binding lifecycle stay decoupled, which remains important for hosted constructor flows.

## 11. Hosted Constructor Catalog Endpoint

- **Decision**: Keep `GET /api/edge-servers/:edgeId/catalog` for trusted users.
- **Rationale**: Hosted constructor should not depend on project-local static catalog seed data.
- **MVP source**: Derive catalog rows from telemetry already known to Cloud for the selected edge.
- **Shape**: Return machine-scoped `deviceId + metric` options with stable identifiers and a fallback label derived from `deviceId + metric`.
- **Rejected alternatives**:
  - Keep static client catalog seed: rejected because it creates drift and temporary code.
  - Add a separate persistent device registry model first: rejected as unnecessary scope for the current integration.

## 12. Canonical Telemetry Identity Without `sourceId`

- **Decision**: Keep `sourceId` out of the canonical telemetry, catalog, and dashboard/client contracts; inside one `edgeId`, stream identity is defined only by `deviceId + metric`.
- **Rationale**: Dashboard bindings and hosted constructor resolve telemetry by `deviceId + metric`, so the canonical backend model should match the product binding key instead of carrying a second identity axis.
- **Compatibility note**: Legacy telemetry documents may still contain `metadata.sourceId`, but catalog derivation and runtime routing must ignore it as an identity key.
- **Explicit assumption**: The current system does not rely on multiple distinct devices inside the same `edgeId` that differ only by `sourceId` while sharing the same `deviceId + metric`.
- **Rejected alternative**:
  - Preserve `sourceId` as a hidden namespace in canonical contracts: rejected because it keeps contract drift between backend identity and client binding identity.

## 13. Bulk Delete For Destructive Layout Save

- **Decision**: Keep `DELETE /api/diagrams/:id/bindings` to delete all binding sets owned under one diagram.
- **Rationale**: Hosted constructor destructive save should not orchestrate N per-machine deletes in the client.
- **Rejected alternative**:
  - Keep only `DELETE /api/diagrams/:id/bindings/:edgeServerId`: rejected for hosted destructive-save flows because it keeps unnecessary orchestration complexity in the frontend.
