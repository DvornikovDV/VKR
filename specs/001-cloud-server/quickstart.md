# Quickstart: Cloud Server

## Prerequisites

- Node.js 20+
- MongoDB 6+
- npm or pnpm

## Environment

Create `cloud_server/.env`:

```env
PORT=3000
NODE_ENV=development
MONGO_URI=mongodb://localhost:27017/vkr-scada
JWT_SECRET=supersecret123
CORS_ORIGINS=http://localhost:5173
```

## Run

```bash
cd cloud_server
npm install
npm run migrate:diagram-quota-slots
npm run dev
```

`npm run migrate:diagram-quota-slots` is required before deploying the quota-slot
release. It clears stale slots, assigns slots `1..3` to each FREE User's three
newest diagrams, and leaves quota-excess diagrams without slots. Per-User
resource leases coordinate the migration with active application writers.

If a Cloud process stops during diagram deletion, tier reconciliation, or an
older quota-lock operation, run the idempotent standalone-compatible repair:

```bash
cd cloud_server
npm run repair:diagram-consistency
```

The repair removes orphan diagram bindings, clears obsolete persisted quota-lock
fields, and reconciles quota slots. It does not require a MongoDB replica set.

## Validation Flow

1. Register a new edge through the admin API and confirm:
   - the edge is created in lifecycle state `Active`
   - availability is still offline until a trusted runtime session appears
   - the first persistent credential is disclosed once in the response

2. Start an edge runtime with the disclosed persistent credential and confirm:
   - `/edge` authentication succeeds
   - trusted telemetry is accepted
   - the edge becomes online through cloud-projected availability
   - a second concurrent runtime connect for the same `edgeId` is rejected

3. Rotate the credential and confirm:
   - the current trusted runtime session is interrupted
   - reconnect with the old credential fails
   - reconnect with the newly issued credential succeeds
   - lifecycle remains `Active` throughout the rotation flow

4. Block the edge and confirm:
   - the active trusted runtime session is interrupted immediately
   - trusted telemetry stops
   - reconnect attempts are rejected while lifecycle is `Blocked`
   - cloud still reports availability separately from lifecycle

5. Unblock the edge and confirm:
   - lifecycle returns to `Active`
   - a fresh persistent credential is disclosed once
   - reconnect without the fresh credential still fails
   - reconnect with the fresh credential restores trusted telemetry

6. Verify telemetry continuity rules:
   - accepted telemetry is still broadcast before aggregation persistence
   - normal disconnect changes availability without changing lifecycle
   - partial device/metric loss does not force trust loss or offline availability by itself

7. Verify hosted-constructor parity behavior:
   - diagram CRUD with OCC still works
   - binding-set CRUD still works
   - `GET /api/edge-servers/:edgeId/catalog` returns trusted-user catalog data for an edge with telemetry history
   - `DELETE /api/diagrams/:id/bindings` deletes all binding sets for the selected diagram owner

## Targeted Verification Commands

Run from `cloud_server/`:

```bash
cmd /c npx @redocly/cli lint openapi.yaml
cmd /c npm run test -- tests/integration/admin.edge-servers.lifecycle.test.ts
cmd /c npm run test -- tests/integration/edge-lifecycle.contract.test.ts
cmd /c npm run test -- tests/integration/edge-socket-auth.test.ts
cmd /c npm run test -- tests/integration/telemetry.resilience.test.ts
cmd /c npm run test -- tests/integration/edge-servers.catalog.test.ts
```

## Source Of Truth

- Feature spec: [specs/001-cloud-server/spec.md](/d:/Study/4_course/VKR/specs/001-cloud-server/spec.md)
- REST contract: [cloud_server/openapi.yaml](/d:/Study/4_course/VKR/cloud_server/openapi.yaml)
- Spec-local contract mirror: [specs/001-cloud-server/contracts/openapi.yaml](/d:/Study/4_course/VKR/specs/001-cloud-server/contracts/openapi.yaml)
- WebSocket contract: [specs/001-cloud-server/contracts/websocket.md](/d:/Study/4_course/VKR/specs/001-cloud-server/contracts/websocket.md)
- Express routes: `cloud_server/src/api/routes.ts`
- Service layer: `cloud_server/src/services/`
