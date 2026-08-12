# Tasks: Edge Capabilities Catalog Slice

**Input**: `doc_cursed/cloud_client_control_plan.md`, `doc_cursed/edge_control_plan.md`, `edge_server/AGENTS.md`, `cloud_server/AGENTS.md`, `client/AGENTS.md`, and the current Edge runtime, Cloud socket/catalog, OpenAPI, and Client shared API code.

**Tests**: Lean proof only. Add one happy path proof and one critical negative proof. Do not add broad validation matrices.

**Organization**: This document is a mini-slice implementation plan. It includes one detailed checklist plus batch prompts for execution.

## Purpose

Add the minimal contract path `Edge -> Cloud -> Client` for a sanitized capabilities catalog.

The catalog MUST include both reported telemetry metrics and command capabilities. This slice exists before Client authoring/runtime slices so Client never reads `edge-runtime.yaml` and never guesses command support from telemetry.

## Scope

This slice covers the contract and persistence path for the latest sanitized Edge capabilities snapshot:

- Edge builds a sanitized catalog from parsed runtime config/source definitions.
- Edge includes telemetry metrics and command capabilities in one snapshot.
- Edge emits the snapshot to Cloud after runtime config/bootstrap is ready and the trusted `/edge` socket connection is established.
- Cloud accepts the snapshot only from the authenticated trusted `/edge` socket for the same `edgeId`.
- Cloud stores the latest snapshot for that `edgeId`.
- Cloud exposes the stored snapshot through `GET /api/edge-servers/:edgeId/catalog`.
- Client shared API types and normalizer can read the new catalog shape.

Target catalog shape:

```ts
{
  edgeServerId: string;
  telemetry: Array<{
    deviceId: string;
    metric: string;
    valueType?: 'boolean' | 'number' | 'string';
    label: string;
  }>;
  commands: Array<{
    deviceId: string;
    commandType: 'set_bool' | 'set_number';
    valueType: 'boolean' | 'number';
    min?: number;
    max?: number;
    reportedMetric: string;
    label: string;
  }>;
}
```

## Out of Scope

- Constructor dropdown UI.
- Saving `commandBindings[]`.
- Dashboard command execution.
- Cloud `CommandAudit`.
- Edge command execution.
- Direct Client access to Edge YAML.
- Presence Lock / `ControlLease`.
- New command types beyond `set_bool` and `set_number`.
- Modbus register details, addresses, connection data, credentials, URLs, IP addresses, or raw YAML exposure.
- Full speckit pipeline.

## Assumptions

- Edge config parsing and validation already accepts `set_bool` and `set_number` command definitions in `edge_server/go_core/internal/config/config.go`.
- Edge source definitions already preserve parsed command metadata through `edge_server/go_core/internal/source/adapter.go`.
- Runtime bootstrap already has a stable persistent credential path before this slice starts.
- The active YAML field is `command`; the public catalog field is `commandType`.
- Edge telemetry config currently validates only `boolean` and `number`; the catalog type may allow future `string`, but Edge must not invent unsupported value types.
- Cloud can store the latest catalog snapshot as an embedded sanitized subdocument on `EdgeServer` unless implementation review finds a dedicated model is cleaner.
- `GET /api/edge-servers/:edgeId/catalog` should return the latest sanitized snapshot. If no snapshot has been received yet, the endpoint should return an empty snapshot for the authorized edge rather than deriving command capabilities from telemetry history.
- Client normalizer may accept the old telemetry-row array during rollout, but the canonical shared type must be the new snapshot object.

## Constraints

- Edge is the source of command capabilities.
- Cloud is the stable API facade.
- Client consumes only the sanitized Cloud catalog.
- Telemetry catalog describes reported state.
- Command catalog describes desired command targets.
- `reportedMetric` links a command capability to actual telemetry, but later visual state remains telemetry-driven.
- Cloud MUST reject or ignore snapshots from untrusted sockets, stale sockets, or sockets whose authenticated `edgeId` does not match the payload `edgeServerId`.
- Cloud MUST NOT trust any client-supplied catalog data.
- Cloud MUST NOT derive command capabilities from telemetry rows.
- Edge MUST NOT expose raw command mappings, register addresses, connection settings, secrets, URLs, or adapter-specific internals.
- Edge MUST map `set_number` `min` and `max` to finite JSON numbers when present.
- Edge MUST include only enabled runtime source definitions in the emitted runtime catalog unless an explicit product decision says disabled source definitions are authorable.
- Labels MUST be deterministic and sanitized; default label format should be `deviceId / metric` for telemetry and `deviceId / commandType` for commands unless existing UI/API conventions provide a better local pattern.
- OpenAPI MUST document the new catalog object shape and pass lint.
- Documentation in this file remains English per repository rules.

## Acceptance Checks

- Edge can build a snapshot with one telemetry metric and one command capability from parsed runtime config.
- Edge emits the snapshot after a trusted runtime socket connection is established.
- Cloud stores the latest snapshot for the same authenticated `edgeId`.
- `GET /api/edge-servers/:edgeId/catalog` returns `{ edgeServerId, telemetry, commands }`.
- Client shared API receives and normalizes both telemetry and command entries from the catalog.
- Cloud rejects or ignores a capabilities snapshot from the wrong or untrusted Edge session.
- The catalog response contains no raw YAML, Modbus addresses, register types, connection settings, credentials, URLs, IP addresses, or adapter-specific internals.
- Existing trusted-user and lifecycle checks on the catalog endpoint remain enforced.
- Old telemetry-derived row shape is no longer the canonical catalog contract.
- No task implements Constructor UI, bindings persistence, Dashboard command execution, command audit, Edge command execution, direct Client YAML reads, or Presence Lock.

## Detailed Task Checklist

- [X] T001 Define Edge catalog DTOs, event name, and sanitization vocabulary for telemetry metrics and command capabilities in `edge_server/go_core/internal/cloud/events.go`.
- [X] T002 Add an Edge catalog snapshot builder that converts parsed runtime config/source definitions into the public `{ edgeServerId, telemetry, commands }` shape without raw mapping data in `edge_server/go_core/internal/runtime/capabilities_catalog.go`.
- [X] T003 Add focused Edge unit coverage proving `set_bool`, `set_number`, `reportedMetric`, `valueType`, `min`, `max`, labels, and raw mapping exclusion in `edge_server/go_core/internal/runtime/capabilities_catalog_test.go`.
- [X] T004 Ensure config-to-source command metadata remains sufficient for catalog generation, adding only targeted preservation tests if a gap is found in `edge_server/go_core/internal/source/adapter.go` and `edge_server/go_core/internal/source/manager_test.go`.
- [X] T005 Extend the Edge Cloud client with a narrow `EmitCapabilitiesCatalog(...)` method that emits the catalog event through the existing transport in `edge_server/go_core/internal/cloud/socketio_client.go`.
- [X] T006 Update Edge transport fakes used by runtime tests to capture the new capabilities event without changing production transport boundaries in `edge_server/go_core/internal/cloud/socketio_client_behavior_test.go` and relevant runtime/runtimeapp test helpers.
- [X] T007 Wire Edge runtime startup so the snapshot is emitted after successful trusted connection and runtime config/source definitions are ready in `edge_server/go_core/internal/runtime/runtime.go`.
- [X] T008 If runtime config/source definitions are owned outside `Runner`, pass the sanitized catalog builder input through the existing runtime app wiring without exposing YAML to Cloud code in `edge_server/go_core/internal/runtimeapp/process.go`.
- [X] T009 Add a runtime proof that a config with one telemetry metric and one command capability emits exactly one catalog snapshot after connect in `edge_server/go_core/internal/runtime/runtime_test.go` or `edge_server/go_core/internal/runtimeapp/process_test.go`.
- [X] T010 Define Cloud catalog payload types and compact validators for telemetry and command entries in `cloud_server/src/services/edge-capabilities.validation.ts`.
- [X] T011 Add a sanitized latest catalog subdocument to `EdgeServer` with `edgeServerId`, `telemetry`, `commands`, and `updatedAt` fields in `cloud_server/src/models/EdgeServer.ts`.
- [X] T012 Add a Cloud service helper that validates, sanitizes, and stores the latest catalog snapshot for an authenticated edge in `cloud_server/src/services/edge-servers.service.ts`.
- [X] T013 Add a dedicated `/edge` socket handler for the capabilities catalog event that checks `isTrustedEdgeSocket(socket, edgeId)` and payload `edgeServerId === edgeId` before storing in `cloud_server/src/socket/events/capabilities.ts`.
- [X] T014 Register the capabilities handler in the trusted Edge socket connection path next to telemetry and command result handlers in `cloud_server/src/socket/events/edge.ts`.
- [X] T015 Replace the telemetry-aggregate catalog response with the stored sanitized snapshot while preserving user trust, `Active` lifecycle, and persistent credential checks in `cloud_server/src/services/edge-servers.service.ts`.
- [X] T016 Update the catalog controller response type from row array to snapshot object in `cloud_server/src/api/edge-servers.controller.ts`.
- [X] T017 Update OpenAPI for `GET /api/edge-servers/{edgeId}/catalog` and add `EdgeCapabilitiesCatalog`, `EdgeCatalogTelemetryMetric`, and `EdgeCatalogCommandCapability` schemas in `cloud_server/openapi.yaml`.
- [X] T018 Add Cloud happy path integration coverage proving a trusted Edge socket sends one telemetry metric and one command capability, Cloud stores it, and catalog API returns both in `cloud_server/tests/integration/edge-capabilities-catalog.test.ts`.
- [X] T019 Add Cloud negative integration coverage proving a wrong/untrusted Edge session is rejected or ignored and does not overwrite the stored catalog in `cloud_server/tests/integration/edge-capabilities-catalog.test.ts`.
- [X] T020 Update Client shared catalog types to the new snapshot object, including telemetry and command capability interfaces, in `client/src/shared/api/edgeServersCanonical.ts`.
- [X] T021 Add a Client normalizer for the new catalog shape and, if needed for rollout, a legacy row-array adapter that maps old rows to `telemetry` with empty `commands` in `client/src/shared/api/edgeServersCanonical.ts`.
- [X] T022 Add focused Client API normalizer tests for the new object shape with one telemetry metric and one command capability in `client/src/shared/api/edgeServersCanonical.test.ts` or the nearest existing shared API test file.
- [X] T023 Run focused Edge tests from `edge_server/go_core`: `go test ./internal/cloud ./internal/runtime ./internal/runtimeapp ./internal/source -count=1`.
- [X] T024 Run focused Cloud checks from `cloud_server`: package typecheck/test script for the new integration test, then `cmd /c npx @redocly/cli lint openapi.yaml`.
- [X] T025 Run focused Client checks from `client`: package typecheck/test script covering `edgeServersCanonical`.
- [X] T026 Complete this document's Manual/runtime smoke notes after implementation evidence is available in `specs/009-edge-capabilities/slices/plan_edge_capabilities_catalog_slice.md`.
- [X] T027 Complete Technical Lead Review in this document before handing the slice to Client authoring/runtime work.

## Dependencies

- T002 depends on the parsed config/source command metadata confirmed by T001 and T004.
- T005 depends on T001 event/DTO naming.
- T007 depends on T002 and T005.
- T008 depends on where runtime app currently owns config/source definitions.
- T009 depends on T006-T008.
- T012 depends on T010 and T011.
- T013 depends on T012 and existing trusted socket helpers in `cloud_server/src/socket/events/edge-runtime-session.ts`.
- T014 depends on T013.
- T015-T016 depend on T011-T014.
- T017 depends on final API shape from T015-T016.
- T018 depends on T013-T017.
- T019 depends on T010-T014.
- T020-T022 depend on the final OpenAPI/API shape.
- T023-T025 depend on implementation tasks in their respective modules.
- T026-T027 depend on focused verification results.


## Manual/runtime Smoke

Manual smoke SHOULD use a local Cloud process and a real or test Edge runtime that connects through the authenticated `/edge` namespace. Do not count smoke as successful if Cloud storage is seeded directly or if Client reads Edge YAML.

1. Start local Cloud with MongoDB and the `/edge` namespace enabled.
2. Register or reuse an `Active` Edge server with a current persistent credential and a trusted USER assignment.
3. Start Edge runtime with a config containing at least one reported telemetry metric and one command mapping, for example a `set_bool` or `set_number` command with `reportedMetric`.
4. Observe Cloud logs or DB state to confirm one accepted capabilities catalog snapshot for the authenticated `edgeId`.
5. Call `GET /api/edge-servers/:edgeId/catalog` as the trusted USER.
6. Verify the response is a single snapshot object with `edgeServerId`, non-empty `telemetry`, and non-empty `commands`.
7. Verify no raw YAML fields, `mapping`, `registerType`, `address`, connection settings, credentials, URLs, or IP addresses are present.
8. Connect or simulate a second wrong/untrusted Edge session and emit the capabilities event with a mismatched `edgeServerId`; verify the stored catalog is unchanged.
9. Verify Client `getEdgeServerCatalog(edgeId)` returns the normalized snapshot shape.

Smoke notes from 2026-05-04 verification:

- Edge emission evidence: `go test ./internal/cloud ./internal/runtime ./internal/runtimeapp ./internal/source -count=1` passed from `edge_server/go_core`; `TestRuntimeStartup_EmitsCapabilitiesCatalogAfterConnect` proves the catalog emits after a trusted runtime connect with one telemetry metric and one command capability.
- Cloud trusted storage/API evidence: `cmd /c npm run test -- tests/integration/edge-capabilities-catalog.test.ts` passed from `cloud_server`; the test connects through the real `/edge` namespace, emits `capabilities_catalog`, stores the latest sanitized snapshot, calls `GET /api/edge-servers/:edgeId/catalog` as a trusted USER, and verifies the wrong/untrusted session does not overwrite the stored catalog. This smoke path does not seed the catalog directly in the DB.
- Client normalization evidence: `cmd /c npm run test -- tests/unit/edgeServers.normalization.test.ts` passed from `client`; it verifies `getEdgeServerCatalog(edgeId)` returns the new snapshot object with telemetry and commands. `cmd /c npm run typecheck` is not available in `client`, so the equivalent TypeScript project check `cmd /c npx tsc -b` was run and passed.
- OpenAPI evidence: `cmd /c npx @redocly/cli lint openapi.yaml` passed from `cloud_server`; Redocly reported one pre-existing warning for the local development server URL, but the API description is valid.

Focused commands after implementation:

```powershell
# edge_server/go_core
go test ./internal/cloud ./internal/runtime ./internal/runtimeapp ./internal/source -count=1

# cloud_server
cmd /c npm run typecheck
cmd /c npm run test -- tests/integration/edge-capabilities-catalog.test.ts
cmd /c npx @redocly/cli lint openapi.yaml

# client
cmd /c npm run typecheck
cmd /c npm run test -- edgeServersCanonical
```

## Technical Lead Review

Review this plan and implementation for module boundaries, sanitized data shape, trusted Edge session checks, API stability, and lean proof volume.

- [X] Verify Edge is the only source of command capabilities.
- [X] Verify Cloud stores only sanitized catalog data and no raw YAML or mapping internals.
- [X] Verify Cloud accepts snapshots only from the active trusted `/edge` socket for the same `edgeId`.
- [X] Verify wrong, stale, or untrusted Edge sessions cannot overwrite the stored snapshot.
- [X] Verify `GET /api/edge-servers/:edgeId/catalog` keeps existing trusted USER access checks.
- [X] Verify telemetry entries describe reported state and command entries describe desired command targets.
- [X] Verify `reportedMetric` is preserved on command capabilities and is not treated as visual state mutation.
- [X] Verify Client consumes only the Cloud catalog API and does not read Edge YAML.
- [X] Verify OpenAPI documents the new object shape and lint passes.
- [X] Verify tests remain lean: one happy path proof and one critical negative proof, plus narrow normalizer/unit coverage where needed.
- [X] Verify no work leaked into Constructor UI, `commandBindings[]`, Dashboard execution, `CommandAudit`, Edge execution, direct YAML access, or Presence Lock.

Technical Lead Review notes from 2026-05-04:

- Edge module boundary is preserved: `runtime.BuildCapabilitiesCatalog(...)` consumes parsed source definitions and `SocketIOClient.EmitCapabilitiesCatalog(...)` emits only the public `capabilities_catalog` DTO.
- Cloud module boundary is preserved: `/edge` socket handling is isolated in `socket/events/capabilities.ts`, validation/sanitization is in `services/edge-capabilities.validation.ts`, storage remains on the `EdgeServer.latestCapabilitiesCatalog` subdocument, and the REST API returns the stored snapshot instead of deriving commands from telemetry.
- Trust checks are explicit: `registerCapabilitiesCatalogHandler(...)` checks `isTrustedEdgeSocket(socket, edgeId)` and payload `edgeServerId === edgeId` before calling storage; the integration negative proof covers mismatched, invalid, and dashboard/untrusted emissions.
- Client boundary is preserved: `getEdgeServerCatalog(edgeId)` reads the Cloud catalog endpoint and normalizes the snapshot object; no direct Edge YAML reads or downstream UI scope were introduced.
- Scope leakage review found no Constructor UI, `commandBindings[]`, Dashboard command execution, `CommandAudit`, Edge command execution, direct YAML access, or Presence Lock changes in this slice.

## Review Trigger

Review this plan when Edge config command schema changes, `/edge` socket lifecycle changes, catalog endpoint shape changes, command types beyond `set_bool` and `set_number` enter scope, Client binding contracts change, or Cloud catalog storage moves out of `EdgeServer`.
