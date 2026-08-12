# Quickstart: Edge Server Onboarding Contract

## Goal

Validate the new edge onboarding contract end to end: Admin registration, one-time package disclosure, first trusted activation, persistent reconnects, recovery reset, trust revoke, blocking, re-enable, and `Active`-only telemetry readiness.

## Preconditions

- `cloud_server` dependencies are installed and MongoDB is available.
- `client` dependencies are installed for Admin/User flow validation.
- An Admin account exists.
- At least one test user exists for bind/unbind and telemetry-ready checks.
- The edge runtime client can connect to the Cloud Socket.IO `/edge` namespace.

## Suggested implementation order

1. Extend `cloud_server/src/models/EdgeServer.ts` with lifecycle-aware credential fields.
2. Add onboarding lifecycle helpers in `cloud_server/src/services/edge-onboarding.service.ts` and keep lifecycle-aware projections in `cloud_server/src/services/edge-servers.service.ts`.
3. Expand `cloud_server/src/api/edge-servers.controller.ts` and `cloud_server/src/api/routes.ts` with reset, trust-revoke, block, and re-enable actions.
4. Update `cloud_server/src/socket/events/edge.ts` to support onboarding and persistent reconnect credential modes.
5. Add immutable onboarding audit persistence and response projections for `GET /api/admin/edge-servers`.
6. Update `client/src/shared/api/edgeServers.ts` and Admin Fleet UI to consume masked lifecycle metadata plus one-time disclosure/reset flows.
7. Ensure user-facing edge queries expose only `Active` edges to Constructor and Dashboard.
8. Add backend and client tests before any broader UI polish.

## Manual validation flow

1. Register a new edge as an Admin and verify the response includes:
   - stable `edgeId`
   - one-time onboarding secret
   - expiry timestamp 24 hours from issuance
   - lifecycle state `Pending First Connection`
2. Refresh or reopen the Admin Fleet view and confirm the secret is no longer visible, while issue/reset metadata remains visible.
3. Attempt a first edge connection with:
   - the correct onboarding package and verify promotion to `Active`
   - the same package again and verify rejection
   - a wrong or expired package and verify rejection
4. Confirm the successful onboarding connection receives a persistent reconnect credential and stores it locally on the edge.
5. Reconnect the same edge with the persistent credential and verify Cloud accepts it without the original onboarding secret.
6. Reset onboarding credentials for an `Active` edge and verify the edge remains `Active`, while a fresh package is prepared for future recovery.
7. Revoke trust for recovery and verify:
   - the active edge socket is disconnected
   - lifecycle becomes `Re-onboarding Required`
   - the old persistent credential no longer works
8. Complete a fresh onboarding cycle from `Re-onboarding Required` and verify the edge returns to `Active` with a rotated persistent credential.
9. Block the edge and verify both onboarding and reconnect attempts are rejected immediately.
10. Re-enable onboarding, issue a fresh onboarding package, and verify the edge can return to `Active`.
11. Open Constructor and Dashboard user flows and verify only `Active` edges appear as telemetry-ready choices.

## Verification commands

Run from the repository root unless stated otherwise.

### Focused quickcheck (recommended for task-level validation)

```powershell
cd cloud_server
cmd /c npm run test -- tests/unit/edge-onboarding.service.test.ts
```

```powershell
cmd /c npx @redocly/cli lint specs/004-edge-onboarding/contracts/openapi.yaml
```

### Extended regression (before release)

```powershell
cd cloud_server
npm run test
npm run lint
npm run typecheck
```

```powershell
cd client
npm run test
npm run lint
```

## Test focus

- Registration returns one-time disclosure once and only once.
- Onboarding package reuse, expiry, reset, and block paths are rejected.
- Successful onboarding rotates the edge into persistent reconnect mode.
- Trust revoke and block disconnect active edge sessions immediately.
- User-facing ready-edge lists include only `Active` edges.
- Admin Fleet keeps lifecycle state and availability separate.

## Source contracts

- REST contract: [contracts/openapi.yaml](./contracts/openapi.yaml)
- Edge runtime transport: [contracts/edge-socket-contract.md](./contracts/edge-socket-contract.md)
- Lifecycle semantics: [contracts/lifecycle-state-machine.md](./contracts/lifecycle-state-machine.md)
