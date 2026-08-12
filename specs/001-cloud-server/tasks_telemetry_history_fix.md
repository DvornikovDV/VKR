# Implementation Tasks: Telemetry History Event-Time Rollups

## 1. Foundational Phase

- [X] T001 Replace the telemetry rollup document model and 1-second bucket comments in `cloud_server/src/models/Telemetry.ts`
- [X] T002 [P] Add a one-time legacy telemetry reset script and package command in `cloud_server/src/scripts/reset-telemetry.ts` and `cloud_server/package.json`

## 2. User Story 1: Accurate Historical Rollups [US1]

**Goal**: Persist compact 1-second telemetry history rollups keyed by edge measurement time while keeping live dashboard delivery unchanged.

**Independent Test Criteria**: Edge readings are bucketed by `r.ts`, numeric and boolean rollups persist the expected fields, slightly late packets are handled deterministically, old telemetry can be cleared, and real-time socket broadcasts still work even if DB writes fail.

- [X] T003 [US1] Rework the telemetry aggregation pipeline for event-time bucket keys, numeric and boolean rollups, timestamp validation, and lateness-aware flushing in `cloud_server/src/services/telemetry-aggregator.service.ts`
- [X] T004 [US1] Keep broadcast-first websocket telemetry handling while feeding validated edge timestamps into the new history pipeline in `cloud_server/src/socket/events/telemetry.ts` and `cloud_server/src/socket/io.ts`
- [X] T005 [US1] Preserve metadata and metric compatibility for telemetry-derived catalog queries against the new rollup documents in `cloud_server/src/services/edge-servers.service.ts`
- [X] T006 [US1] Update telemetry-focused automated coverage for event-time bucketing, late data, DB-failure isolation, and catalog compatibility in `cloud_server/tests/unit/telemetry-aggregator.test.ts`, `cloud_server/tests/integration/telemetry.resilience.test.ts`, and `cloud_server/tests/integration/edge-servers.catalog.test.ts`

## 3. Polish Phase

- [X] T007 Document the rollout and validation steps for clearing legacy telemetry data and verifying the new history model in `specs/001-cloud-server/data-history-fix-tasks.md`

## Execution Strategy

1. Complete T001 and T002 first so the new storage shape and cleanup path are defined before the aggregator rewrite.
2. Implement T003 through T005 as one vertical telemetry-history slice under [US1].
3. Finish with T006 and run focused validation before checking off the story.
4. Use T007 to leave behind a concise runbook for the one-time cleanup and verification flow.

## Dependencies

1. T001 blocks T003 and T005.
2. T002 can run in parallel with T001.
3. T003 blocks T004, T005, and T006.
4. T004 and T005 must complete before T006 is considered done.
5. T007 should be completed after implementation details and validation commands are known.

## Suggested Validation

Run from `cloud_server/` after implementation:

```powershell
npm run typecheck
npm run test
npm run lint
```
