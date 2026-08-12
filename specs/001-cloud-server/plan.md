# Implementation Plan: Cloud Server Core Platform

**Branch**: `main` | **Date**: 2026-04-12 | **Spec**: [specs/001-cloud-server/spec.md](./spec.md)
**Input**: Feature specification from `specs/001-cloud-server/spec.md`

## Summary

Adapt `cloud_server` to the new edge model defined semantically by `007-edge-server` while preserving the existing cloud responsibilities for users, diagrams, bindings, realtime telemetry routing, and telemetry-derived catalog discovery.

The cloud implementation must now treat:

- `Active` and `Blocked` as the only persistent edge lifecycle states
- `online`, `offline`, and `lastSeenAt` as a separate availability axis
- the current persistent credential as the only trusted edge authentication path
- `register`, `rotate-credential`, `block`, and `unblock` as the canonical admin-owned lifecycle actions

This plan keeps the existing hosted-constructor parity work in scope:

- `GET /api/edge-servers/:edgeId/catalog` for trusted-user device/metric discovery without static client seed data
- `DELETE /api/diagrams/:id/bindings` for bulk deletion of all binding sets during destructive layout-save flows

## Technical Context

**Language/Version**: Node.js 20+, TypeScript 5+  
**Primary Dependencies**: Express.js, Socket.IO, Mongoose, JsonWebToken, bcrypt, dotenv  
**Storage**: MongoDB (standard collections for Users, Diagrams, EdgeServers; time-series TTL collection for Telemetry)  
**Testing**: Vitest, Supertest  
**Target Platform**: Node.js backend runtime  
**Project Type**: Backend REST API and WebSocket hub  
**Performance Goals**:

- live dashboard telemetry should remain low-latency
- broadcast must still happen independently of telemetry persistence
- lifecycle actions that remove trust must stop trusted runtime traffic immediately

**Constraints**:

- `cloud_server` remains the canonical authority for edge lifecycle and cloud-facing edge contracts
- diagram and user management behavior must continue working during the edge-model migration
- database failures must not block live telemetry broadcasts
- the active cloud wire identity for telemetry and catalog remains `deviceId + metric` inside one `edgeId`

## Constitution Check

*GATE: Must pass before implementation starts. Re-check after contracts and data model are updated.*

- [x] **Principle 1**: Uses a factual, code-first technical plan format.
- [x] **Principle 3 (Isolation)**: Keeps cloud behavior within REST, service, model, and Socket.IO boundaries.
- [x] **Principle 4 (Local/Global State)**: Process-wide realtime connection registries remain scoped to actual socket/session tracking only.
- [x] **Principle 5 (Secrets)**: Edge credentials are disclosed once, stored as non-recoverable hashes, and never persisted in plaintext.

## Project Structure

### Documentation (this feature)

```text
specs/001-cloud-server/
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
`-- contracts/
    |-- openapi.yaml
    `-- websocket.md
```

### Source Code (repository root)

```text
cloud_server/
|-- src/
|   |-- api/
|   |   |-- admin.controller.ts
|   |   |-- auth.controller.ts
|   |   |-- diagrams.controller.ts
|   |   |-- edge-servers.controller.ts
|   |   `-- routes.ts
|   |-- config/
|   |   `-- env.ts
|   |-- database/
|   |   `-- mongoose.ts
|   |-- models/
|   |   |-- User.ts
|   |   |-- Diagram.ts
|   |   |-- EdgeServer.ts
|   |   `-- Telemetry.ts
|   |-- services/
|   |   |-- diagrams.service.ts
|   |   |-- edge-servers.service.ts
|   |   `-- telemetry-aggregator.service.ts
|   |-- socket/
|   |   `-- io.ts
|   |-- types/
|   |   `-- index.ts
|   `-- app.ts
|-- tests/
|   |-- unit/
|   `-- integration/
|-- openapi.yaml
`-- package.json
```

**Structure Decision**: Keep the layered Express.js + Socket.IO architecture. REST controllers expose admin and user flows, services enforce lifecycle and authorization rules, models persist cloud-owned edge state, and `socket` remains the single place for trusted edge session handling and dashboard broadcasts.

## Implementation Streams

### 1. Edge Lifecycle Domain And Persistence

Update the cloud edge aggregate so it models the new lifecycle and trust rules directly.

- replace the old single-secret or onboarding-centric edge state with:
  - lifecycle `Active | Blocked`
  - availability snapshot `online | offline | lastSeenAt`
  - current persistent credential metadata and secret hash
  - lifecycle/audit timestamps needed for registration, rotation, block, unblock, accepted connection, rejected connection, and forced disconnect visibility
- ensure newly registered edges are created as `Active + offline`
- ensure credential rotation invalidates the previous credential immediately without changing lifecycle
- ensure block removes trusted access immediately and unblock issues a fresh future credential path

### 2. Admin REST Contract And Fleet Projections

Align the REST API and fleet read models with the new cloud-owned lifecycle model.

- registration returns the first persistent credential once
- add or update admin endpoints for:
  - register edge
  - rotate credential
  - block edge
  - unblock edge
  - assign edge to user
- remove onboarding-package-specific admin responses and lifecycle language
- update admin and user edge projections so they expose lifecycle and availability separately
- preserve diagram, binding, and user-management REST behavior that remains valid

### 3. Edge Socket Authentication And Forced Disconnect Behavior

Adapt the realtime edge contract so the runtime authenticates only with the current persistent credential.

- `/edge` handshake uses `edgeId + credentialSecret`
- accepted connection requires:
  - edge exists
  - lifecycle is `Active`
  - presented credential matches the current persistent credential
- connection rejection remains cloud-owned with stable failure categories such as:
  - edge not found
  - blocked
  - invalid credential
  - internal auth error
- forced disconnects must cover:
  - credential rotation
  - block
  - generic server-side disconnect

### 4. Telemetry, Availability, And Catalog Continuity

Preserve the existing telemetry-routing value while aligning trust behavior with the new model.

- trusted telemetry remains eligible only during an accepted edge session under `Active`
- normal disconnect changes availability only, not lifecycle
- partial local-source degradation must not imply trust loss or force offline availability by itself
- telemetry broadcast still happens before aggregation persistence
- hosted-constructor catalog continues to derive `deviceId + metric` entries from telemetry already known to cloud

### 5. Auditability And Verification

Make lifecycle and trust transitions observable enough for cloud code and later client integration.

- preserve auditable outcomes for:
  - registration
  - credential issuance
  - credential rotation
  - block
  - unblock
  - accepted edge connection
  - rejected edge connection
  - trusted-session interruption
- keep enough testable surface for later client work to consume lifecycle and availability as separate concepts

## Delivery Sequence

### Phase A: Contract And Domain Baseline

- update the edge data model
- update REST and websocket contracts
- align plan, research, and quickstart docs

### Phase B: Cloud Lifecycle Implementation

- implement lifecycle-aware edge aggregate behavior
- implement new admin actions and projections
- implement persistent-credential-only socket auth and forced disconnect handling

### Phase C: Verification And Compatibility

- verify telemetry routing, aggregation, and catalog derivation still work
- verify lifecycle and availability projections remain coherent
- verify all old onboarding semantics are removed from active cloud-facing behavior

## Verification Targets

Cloud implementation is ready for new task generation when:

- all active `001-cloud-server` docs describe the same edge lifecycle and credential model
- spec-local `contracts/openapi.yaml` matches `cloud_server/openapi.yaml`
- no active cloud doc still treats onboarding packages or `Re-onboarding Required` as part of the new model
- edge registration, credential rotation, block, unblock, trusted connect, rejected connect, and trusted telemetry stop conditions all have explicit documentation support
