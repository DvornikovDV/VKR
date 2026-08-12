# Implementation Plan: Edge Server Onboarding Contract

**Branch**: `004-edge-onboarding` | **Date**: 2026-03-26 | **Spec**: [specs/004-edge-onboarding/spec.md](./spec.md)
**Input**: Feature specification from `specs/004-edge-onboarding/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command.

## Summary

Implement the canonical Edge Server onboarding contract in `cloud_server` and expose it consistently to `client` and the future `edge_server` runtime. The current single-credential `apiKeyHash` model will be replaced by a lifecycle-aware aggregate that supports Admin registration, one-time first-connection packages, persistent reconnect credentials, recovery resets, trust revocation, blocking, and telemetry-ready filtering. Onboarding lifecycle state remains separate from runtime availability so Admin Fleet, Constructor readiness, and Dashboard monitoring all consume the same meaning of `Pending First Connection`, `Active`, `Re-onboarding Required`, and `Blocked`.

## Technical Context

**Language/Version**: TypeScript 5.4 in `cloud_server`, TypeScript 5.9 in `client`, Node.js 20+ runtime, Node-based edge runtime contract for `edge_server`  
**Primary Dependencies**: Express 4, Mongoose 8, Socket.IO 4, bcrypt, React 19, React Router 7, Zustand 5, Vitest, Supertest, React Testing Library, MSW  
**Storage**: MongoDB via Mongoose for edge registration, current onboarding credential metadata, persistent credential state, and immutable onboarding audit events  
**Testing**: Vitest in `cloud_server` and `client`, Supertest for REST, Socket.IO integration tests for edge auth flows, React Testing Library + MSW for Admin/User lifecycle views  
**Target Platform**: `cloud_server` REST + Socket.IO runtime, `client` SPA Admin/User surfaces, Node-based edge process in `edge_server`  
**Project Type**: Monorepo contract feature spanning backend, SPA, and edge runtime protocol  
**Performance Goals**: Admin registration plus first-package disclosure completes in under 1 minute; valid first activation succeeds in one successful connection flow; block or trust-revoke disconnects active edge sessions immediately; lifecycle/readiness changes are visible on the next Admin/User fetch without full page reload  
**Constraints**: Full onboarding secret is visible only during issue/reset; one-time package expires after 24 hours; onboarding lifecycle and runtime availability must remain separate; only `Active` edges are telemetry-ready; no direct cross-module imports; no hardcoded secrets, URLs, or IP addresses  
**Scale/Scope**: Replace the current single `apiKeyHash` edge identity with lifecycle-aware credential handling, add Admin recovery/block flows, update user-facing ready-edge filtering, and cover the new contract with focused backend and client tests

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **Principle 2 (Architectural Scope)**: Authoritative onboarding behavior stays in `cloud_server`; `client` only consumes lifecycle/readiness contracts; `edge_server` implements the transport client. No new delivery work is routed through legacy `/dashboard`.
- [x] **Principle 3 (Strict Module Isolation)**: Integration stays contract-first through REST plus Socket.IO `/edge`; no direct imports across `client`, `cloud_server`, and `edge_server`.
- [x] **Principle 4 (State Containment)**: No `window.*` or `global.*` state is introduced. Runtime socket registries stay process-local inside `cloud_server`.
- [x] **Principle 5 (Secrets)**: One-time and persistent edge credentials are generated server-side, hashed before storage, and never hardcoded or re-disclosed after the initial issue/reset flow.
- [x] **Principle 6 (Context Awareness)**: Decisions are grounded in root and local AGENTS files, the `004-edge-onboarding` specification, the constitution, and the existing `cloud_server`/`client` edge contracts.
- [x] **Post-design re-check**: Phase 1 outputs preserve cloud ownership, keep lifecycle meaning contract-based, and introduce no constitution violations.

## Project Structure

### Documentation (this feature)

```text
specs/004-edge-onboarding/
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- contracts/
|   |-- openapi.yaml
|   |-- edge-socket-contract.md
|   `-- lifecycle-state-machine.md
`-- tasks.md
```

### Source Code (repository root)

```text
cloud_server/
|-- src/
|   |-- api/
|   |   |-- routes.ts
|   |   |-- admin.controller.ts
|   |   `-- edge-servers.controller.ts
|   |-- models/
|   |   `-- EdgeServer.ts
|   |-- services/
|   |   `-- edge-servers.service.ts
|   |-- socket/
|   |   |-- io.ts
|   |   `-- events/edge.ts
|   `-- config/
|       `-- env.ts
|-- tests/
|   |-- integration/
|   |   |-- edge-servers.test.ts
|   |   `-- edge-onboarding.test.ts
|   `-- unit/
|       `-- edge-onboarding.service.test.ts
client/
|-- src/
|   |-- shared/api/edgeServers.ts
|   |-- features/admin-hub/pages/EdgeFleetPage.tsx
|   |-- features/user-hub/pages/FullConstructorPage.tsx
|   `-- features/user-hub/pages/DashboardPage.tsx
`-- tests/
    |-- integration/AdminHubPages.test.tsx
    `-- unit/useEdgeStatus.test.ts
edge_server/
`-- src/
    |-- onboarding/
    |-- transport/
    `-- config/
```

**Structure Decision**: Keep `cloud_server` as the canonical onboarding owner, reuse the existing edge resource surfaces in `client`, and introduce a minimal explicit onboarding/reconnect client in `edge_server` instead of moving lifecycle logic away from cloud.

## Phase 0: Research Conclusions Applied

- Replace the single `apiKeyHash` identity with two credential slots on the edge aggregate: one active onboarding package and one persistent reconnect credential.
- Add an immutable onboarding audit stream so support and operations can explain issue, reset, rejection, activation, block, re-enable, and trust-revoke outcomes.
- Keep first activation and later reconnects on the existing Socket.IO `/edge` transport, but version the handshake by credential mode and emit an activation payload only on first successful onboarding.
- Introduce explicit trust revocation as a recovery action separate from blocking, because resetting onboarding credentials for an `Active` edge must not immediately remove current trusted access.
- Filter user-facing trusted edge lists to `Active` only, while Admin views retain lifecycle metadata for all states.

## Phase 1: Design Plan

### Cloud domain and persistence changes

1. Extend `EdgeServer` from a simple registration record into the canonical onboarding aggregate with:
   - lifecycle state
   - current onboarding credential metadata
   - persistent reconnect credential metadata
   - activation timestamps
   - trusted user assignments
   - runtime last-seen/availability data kept distinct from lifecycle
2. Add a dedicated onboarding audit collection for immutable support and security events.
3. Migrate current `isActive` meaning from a generic enabled flag into explicit lifecycle semantics and credential revocation behavior.

### Admin REST contract

1. Keep `GET /api/admin/edge-servers` as the fleet summary endpoint, but enrich it with lifecycle state, masked credential metadata, audit timestamps, and readiness information.
2. Rework Admin registration to return a one-time first-connection package on create.
3. Add explicit Admin actions for:
   - onboarding credential reset
   - trust revoke for recovery
   - block
   - re-enable onboarding
4. Preserve bind/unbind operations, but ensure downstream telemetry-related access is allowed only when the edge lifecycle is `Active`.

### Edge Socket.IO contract

1. Keep `/edge` as the only edge-ingress namespace.
2. Accept two credential modes:
   - `onboarding`: valid only for `Pending First Connection` or `Re-onboarding Required`
   - `persistent`: valid only for `Active`
3. On successful onboarding:
   - retire the one-time secret
   - promote lifecycle to `Active`
   - issue a fresh persistent reconnect credential
   - emit the activation payload once to the connecting edge
4. On block or trust revoke:
   - invalidate the current persistent credential
   - reject future reconnects
   - disconnect any currently trusted edge session immediately

### Client contract integration

1. Update `client/src/shared/api/edgeServers.ts` to consume the richer Admin fleet payload and new recovery/block endpoints.
2. Adjust Admin Fleet to show lifecycle state, package metadata, and one-time disclosure flows without re-showing full secrets later.
3. Keep Constructor and Dashboard eligibility logic tied to `Active` edges only; availability remains a separate runtime concern.
4. Ensure user-facing trusted edge queries never misclassify `Pending First Connection`, `Re-onboarding Required`, or `Blocked` as telemetry-ready.

### Test plan

1. Backend integration coverage for registration, first activation, invalid credential rejection, one-time reuse rejection, reset behavior, trust revoke, block, re-enable, and user-facing filtering.
2. Backend unit coverage for lifecycle transition rules and credential rotation helpers.
3. Client integration coverage for Admin Fleet disclosure/reset/block actions and for `Active`-only edge availability in user flows.
4. Socket-focused tests for activation payload delivery, persistent reconnect acceptance, and immediate disconnect on trust revoke/block.

## Complexity Tracking

No constitution violations or exception justifications are required for this plan.
