# Telemetry History Rollout Runbook

## Purpose

This runbook describes the one-time rollout steps for the event-time telemetry history model in `cloud_server`.

## 1. Preconditions

1. Ensure the backend is stopped or in maintenance mode.
2. Verify database access is configured in `cloud_server/.env`.
3. Backup telemetry data if historical legacy records are still needed.

## 2. One-Time Legacy Reset

Run from `cloud_server/`:

```powershell
npm run reset:telemetry -- --yes
```

What it does:

1. Connects to MongoDB using existing server config.
2. Drops the `telemetry` collection if it exists.
3. Recreates it as a native MongoDB time-series collection with 7-day TTL.

## 3. Validation Commands

Run from `cloud_server/`:

```powershell
npm run typecheck
npm run test -- tests/unit/telemetry-aggregator.test.ts tests/integration/telemetry.resilience.test.ts tests/integration/edge-servers.catalog.test.ts
```

Validation intent:

1. Event-time 1-second bucket rollups persist correctly for numeric and boolean signals.
2. Slightly late packets are handled deterministically.
3. DB write failures do not block realtime socket broadcasts.
4. Telemetry-derived catalog queries remain compatible with rollup documents.

## 4. Post-Rollout Spot Check (Optional)

From a Mongo shell or admin UI, inspect recent telemetry rows:

1. `timestamp` is aligned to second boundaries.
2. `metadata.edgeId/sourceId/deviceId` and `metric` are present.
3. `rollup.kind` is either `numeric` or `boolean`.

