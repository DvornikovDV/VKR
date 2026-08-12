# Dispatch Live Telemetry Slice Plan

## Document Scope

This document is the general implementation plan for the Dispatch Live Telemetry slice in `specs/012-dispatch`.

The primary reader is an implementation agent or reviewer replacing the `/hub/dispatch/telemetry` placeholder with a realtime operational telemetry journal for one selected Dispatch context.

This document intentionally does not include implementation batches.

## Planning Note

The speckit prerequisite command `.agent/skills/scripts/powershell/check-prerequisites.ps1 -Json` was attempted during task planning and was blocked by local PowerShell Execution Policy. This does not block this slice plan because the user provided the target slice file, source documents, scope, code paths, runtime path, and constraints.

## Purpose

This slice MUST replace the inert `/hub/dispatch/telemetry` placeholder with a live operational telemetry journal for the selected `diagramId + edgeId` Dispatch context.

The slice MUST show realtime telemetry relevant to the selected saved binding profile, keep only a bounded 60-second client-memory window, and support `Pause` / `Resume` without stopping bounded telemetry buffering.

## Source Of Truth

- Dispatch route and subtab model: `doc_cursed/monitoring_workspace_routing_draft.md`.
- Monitoring operational journal behavior: `doc_cursed/monitoring_plan.md`.
- Dispatch shared context ownership: `doc_cursed/dispatch_onboarding_slice_draft.md`.
- Dashboard command and reported telemetry semantics: `doc_cursed/cloud_client_control_plan.md`.
- Realtime telemetry transport contract: `specs/003-dashboard/contracts/runtime-signals.md`.
- Existing Dispatch shell baseline: `specs/012-dispatch/slices/plan_dispatch_workspace_shell_onboarding_slice.md`.

## Current Code Facts

- `client/src/features/dispatch/pages/DispatchWorkspacePage.tsx` currently routes `DISPATCH_TELEMETRY_TAB` to `DispatchPlaceholderTab`.
- Dispatch already owns the selected `diagramId`, selected `edgeId`, selected binding profile, selected Edge, context bar, tabs, and action slot.
- `client/src/features/dispatch/hooks/useDispatchWorkspaceContext.ts` loads binding profiles for the selected diagram even when Dashboard runtime context is not enabled.
- `loadDashboardRuntimeContext` is currently true only for the Dashboard tab, so non-Dashboard tabs do not load saved diagram/catalog runtime context by default.
- `client/src/features/dashboard/services/cloudRuntimeClient.ts` starts a Socket.IO session, authenticates with the existing token, emits `subscribe` with `{ edgeId }`, parses `telemetry`, and rejects telemetry for a non-active `edgeId`.
- `client/src/features/dashboard/hooks/useDashboardRuntimeSession.ts` owns Dashboard widget projection, alarm incident realtime/list behavior, ACK state, edge availability, and transport state. It is not a telemetry-only hook.
- `client/src/shared/store/useTelemetryStore.ts` uses a legacy generic WebSocket `/telemetry` shape with `telemetry-update` envelopes and a `diagramId` subscribe field. It does not match the current Socket.IO runtime contract.

## Scope

- MUST replace only the Telemetry placeholder under `/hub/dispatch/telemetry`.
- MUST keep this slice Client-only unless implementation proves the existing realtime transport contract is unusable.
- MUST use the existing Cloud Socket.IO realtime telemetry contract.
- MUST subscribe only to the selected `edgeId`.
- MUST derive the default visible telemetry set from the selected Dispatch binding profile.
- MUST filter default rows by `deviceId + metric`.
- MUST display at least received time, device, metric, value, and telemetry event timestamp.
- MUST show newest telemetry rows first.
- MUST keep only a 60-second rolling in-memory window.
- MUST remove rows older than the 60-second window from memory, not only from the rendered table.
- MUST provide `Pause` / `Resume` through the Dispatch action slot or the established Dispatch subtab action pattern.
- MUST continue buffering recent relevant telemetry while paused inside the same bounded 60-second window.
- MUST show that newer rows are waiting while paused.
- MUST reset visible rows, buffered rows, paused snapshot, and waiting state when selected `edgeId`, selected `diagramId`, or selected binding profile changes.
- MUST show bounded loading, empty, no-selected-context, connected, reconnecting, and error states.
- SHOULD make local physical changes visible when those changes arrive as telemetry, for example `pump_main.local_button_pressed` and `pump_main.actual_state`.
- MAY document a future diagnostic mode for all selected-Edge telemetry, but the default MVP mode MUST remain binding-profile-relevant.

## Out Of Scope

- MUST NOT add or change Cloud telemetry history APIs.
- MUST NOT add persistence, exports, reports, server-side journal retention, or local durable storage.
- MUST NOT query `GET /api/telemetry/historic`.
- MUST NOT implement Trends behavior in this slice.
- MUST NOT implement Command Audit behavior in this slice.
- MUST NOT expand Alarm Journal behavior in this slice.
- MUST NOT change Dashboard widget runtime projection semantics.
- MUST NOT implement the journal by starting `useDashboardRuntimeSession` with Dashboard widget/alarm side effects.
- MUST NOT start Dashboard visual runtime, Dashboard widget projection, Dashboard alarm incident list loading, Dashboard ACK state, or Dashboard command lifecycle.
- MUST NOT duplicate Dashboard as a second product runtime; a telemetry-only Socket.IO session scoped to the selected `edgeId` is allowed for this tab.
- MUST NOT change Edge runtime, Edge YAML, telemetry ingestion, telemetry rollups, alarm detection, command execution, or hardware contracts.
- MUST NOT change Constructor behavior.
- MUST NOT infer bindings from labels, visual geometry, source IDs, raw Edge YAML, or telemetry history.
- MUST NOT introduce `window.*` or `global.*` application state.
- MUST NOT make all selected-Edge telemetry the default view.

## Assumptions

- The existing Socket.IO `subscribe` + `telemetry` contract is usable for this slice.
- A telemetry-only session abstraction MAY be extracted from `cloudRuntimeClient` or implemented as a narrow reusable client path, as long as it does not carry Dashboard widget/alarm side effects.
- The default relevant telemetry set is the unique set of `deviceId + metric` pairs from `selectedBindingProfile.widgetBindings`.
- Command catalog `reportedMetric` entries are included in the default journal only when the selected binding profile already binds the same `deviceId + metric` pair.
- Waiting row count while paused counts only normalized rows that pass the active binding-profile filter.
- Values MAY be rendered as safe raw display values for MVP without deriving widget physical state or command capability.

## Constraints

- MUST keep Dispatch context as the source of selected `diagramId`, selected `edgeId`, and selected binding profile.
- MUST keep telemetry subscription scope to one selected `edgeId` at a time.
- MUST use `deviceId + metric` as telemetry row filter identity.
- MUST ignore `sourceId` for runtime lookup and display filtering.
- MUST isolate old Edge telemetry after selected Edge changes.
- MUST isolate old diagram and binding-profile rows after selected diagram or selected profile changes.
- MUST keep transport disconnect/reconnect state separate from Edge availability.
- MUST preserve Dashboard physical widget state as telemetry-driven and unaffected by the Live Telemetry journal.
- MUST keep the 60-second window as client memory only; it is not a historical data promise.
- MUST prune by client received time for the bounded memory window.
- MUST use telemetry event timestamp only as displayed field data; it MUST NOT control 60-second memory pruning.
- MUST keep the journal as append-only event rows inside the bounded window; it MUST NOT collapse rows into Dashboard-style latest-value replacement.
- MUST dispose the telemetry-only session on tab unmount and selected `edgeId` changes.
- MUST keep stale telemetry events and late session callbacks from updating the active context after context changes.
- MUST guard telemetry-only session callbacks with an active context generation or equivalent request key.
- MUST keep UI state route-owned or feature-local; DO NOT use global application state for the journal unless a scoped store is explicitly justified.
- MUST treat `client/src/shared/store/useTelemetryStore.ts` as legacy for this slice unless it is first aligned with the current Socket.IO runtime contract.
- MUST apply Lean Testing Policy: automated proof SHOULD cover the main happy path and at most one critical negative scenario for the main slice risk.
- MUST NOT add broad table-driven tests for every malformed payload, timestamp boundary, visual variant, copy variant, or irrelevant telemetry pair.

## Runtime Flow

1. A USER opens `/hub/dispatch/telemetry?diagramId=:diagramId&edgeId=:edgeId`.
2. The existing `/hub` auth guard protects the route.
3. Dispatch shell resolves the selected diagram, selected Edge, and selected binding profile.
4. Live Telemetry derives the active relevant set from `selectedBindingProfile.widgetBindings`.
5. Live Telemetry starts a telemetry-only realtime session for the selected `edgeId`.
6. Client emits `subscribe` with only `{ edgeId }`.
7. Cloud sends realtime `telemetry` events for the subscribed Edge.
8. Client ignores telemetry events whose `edgeId` does not match the active selected Edge.
9. Client filters event readings to the active relevant `deviceId + metric` set.
10. Client appends normalized journal rows with received time, device, metric, value, event timestamp, and optional server timestamp.
11. Client prunes the in-memory buffer to rows received within the last 60 seconds.
12. When running, the visible list follows the current bounded buffer.
13. When paused, the visible list remains frozen while the bounded buffer continues to update and prune.
14. While paused, the UI shows that newer relevant rows are waiting.
15. On `Resume`, the visible list is replaced by the current bounded buffer and waiting indication clears.
16. On selected Edge, diagram, or binding profile change, the tab disposes or resets the previous context and starts clean for the new context.

## Acceptance Checks

- `/hub/dispatch/telemetry` renders a Live Telemetry journal instead of `DispatchPlaceholderTab`.
- `DISPATCH_TELEMETRY_TAB` is no longer routed to `DispatchPlaceholderTab`.
- The tab remains under the existing `/hub` USER auth guard.
- The tab uses the selected Dispatch `diagramId`, `edgeId`, and binding profile.
- With no valid selected Edge or binding profile, the tab shows a bounded selection/empty state and does not start a telemetry subscription.
- The tab does not start Dashboard widget projection, Dashboard alarm incident list loading, Dashboard ACK state, or Dashboard visual runtime behavior.
- Client emits a realtime `subscribe` request with only `{ edgeId }` for the selected Edge.
- Telemetry events for any other `edgeId` do not create visible rows.
- Default visible rows are limited to readings whose `deviceId + metric` exists in the selected binding profile.
- Rows display received time, device, metric, value, and telemetry event timestamp.
- Newest rows appear first.
- Rows older than the 60-second received-time window are removed from the in-memory buffer.
- Automated or code proof verifies that pruning removes rows from the in-memory buffer, not only from rendered output.
- `Pause` freezes visible rows without stopping the active bounded buffer.
- New relevant telemetry received during `Pause` increments or updates a waiting-newer-rows indication.
- `Resume` shows the current bounded buffer and clears the waiting indication.
- Changing selected Edge, diagram, or binding profile clears previous rows, paused snapshot, waiting state, and stale callbacks.
- Loading, empty, connected, reconnecting, and bounded error states are visible when applicable.
- Local physical changes are visible when they arrive as realtime telemetry for a bound `deviceId + metric`.
- Dashboard runtime semantics, command widget physical state, Trends, Command Audit, Alarm Journal, Cloud, Edge, and Constructor behavior remain unchanged.

## Format: `[ID] [P?] [Story?] Description`

- `[P]` means the task can run in parallel because it touches different files and does not depend on incomplete tasks.
- `[US1]` maps to replacing the Telemetry placeholder with a selected-context realtime journal.
- `[US2]` maps to Pause/Resume, bounded buffering, and stale selected-context isolation.
- Setup, Foundational, Polish, and Review tasks do not use story labels.
- Every task includes the file path that owns the change or proof.
- This document intentionally does not include implementation batches.

## Phase 1: Setup

**Purpose**: Add stable Live Telemetry anchors and focused fixture support before replacing the placeholder.

- [X] T001 Add Dispatch Live Telemetry constants, row types, request/context keys, binding-pair helpers, row normalization helpers, received-time pruning helpers, and waiting-count helpers in `client/src/features/dispatch/model/liveTelemetry.ts`.
- [X] T002 [P] Extend realtime socket/client harness support for telemetry-only session assertions, subscribe payload capture, transport status emission, telemetry emission, and dispose count tracking in `client/tests/integration/helpers/mockDashboardRuntimeSocket.ts`.
- [X] T003 [P] Extend Dispatch workspace fixture exports for Live Telemetry rows, multi-Edge binding profile fixtures, and telemetry event helpers in `client/tests/integration/helpers/dispatchWorkspaceHarness.tsx`.

**Checkpoint**: Dispatch has model and test anchors for Live Telemetry without changing the `/hub/dispatch/telemetry` route.

---

## Phase 2: Foundational Realtime And UI Primitives

**Purpose**: Build the telemetry-only transport path, route-owned state hook, and presentational primitives that block both user-facing stories.

- [X] T004 Add a telemetry-only realtime session API that reuses the existing Socket.IO subscribe/telemetry parser, emits `subscribe` with only `{ edgeId }`, reports transport status, and disposes without Dashboard alarm/widget side effects in `client/src/features/dashboard/services/cloudRuntimeClient.ts`.
- [X] T005 Add `useDispatchLiveTelemetrySession` with selected `edgeId`, selected `diagramId`, selected binding profile keying, telemetry-only session lifecycle, active-context generation guards, transport status, bounded error state, and no Dashboard runtime side effects in `client/src/features/dispatch/hooks/useDispatchLiveTelemetrySession.ts`.
- [X] T006 [P] Create `DispatchLiveTelemetryTable` for newest-first journal rows with received time, device, metric, value, telemetry event timestamp, optional server timestamp, empty body rendering, and stable row test anchors in `client/src/features/dispatch/components/DispatchLiveTelemetryTable.tsx`.
- [X] T007 [P] Create `DispatchLiveTelemetryToolbar` for running/paused state, visible count, waiting newer row count, transport status, and action-slot-compatible `Pause` / `Resume` control content in `client/src/features/dispatch/components/DispatchLiveTelemetryToolbar.tsx`.

**Checkpoint**: The slice can start a telemetry-only session, maintain route-owned journal state, and render rows/controls before route wiring.

---

## Phase 3: User Story 1 - Selected-Context Realtime Journal (Priority: P1)

**Goal**: A USER opens `/hub/dispatch/telemetry` with a selected Dispatch context and sees realtime telemetry rows for the selected binding profile without starting Dashboard visual runtime behavior.

**Independent Test**: Mount User Hub Dispatch routes at `/hub/dispatch/telemetry?diagramId=...&edgeId=...`, emit realtime telemetry for bound and unbound pairs, and verify selected Edge subscribe, binding-pair filtering, row rendering, newest-first ordering, and no Dashboard runtime side effects.

### Tests For User Story 1

- [X] T008 [US1] Add focused Dispatch Live Telemetry integration proof for selected Edge subscribe, binding-profile `deviceId + metric` filtering, bound row rendering, newest-first ordering, ignored other-Edge telemetry, and no Dashboard visual/alarm runtime side effects in `client/tests/integration/DispatchWorkspacePage.test.tsx`.

### Implementation For User Story 1

- [X] T009 [US1] Create `DispatchLiveTelemetryTab` with selected-context validation, relevant binding-pair derivation, telemetry-only session hook wiring, loading/empty/error/connected/reconnecting states, and no-selected-context handling in `client/src/features/dispatch/components/DispatchLiveTelemetryTab.tsx`.
- [X] T010 [US1] Wire `DispatchLiveTelemetryTab` to `DISPATCH_TELEMETRY_TAB` instead of `DispatchPlaceholderTab` in `client/src/features/dispatch/pages/DispatchWorkspacePage.tsx`.
- [X] T011 [US1] Remove the Telemetry-specific unimplemented placeholder path while keeping only still-placeholder tab ids valid in `client/src/features/dispatch/components/DispatchPlaceholderTab.tsx`.
- [X] T012 [US1] Ensure `DispatchLiveTelemetryTab` renders `DispatchLiveTelemetryTable` from append-only normalized journal rows rather than Dashboard latest-value projection in `client/src/features/dispatch/components/DispatchLiveTelemetryTab.tsx`.
- [X] T013 [US1] Ensure Live Telemetry does not require Dashboard saved diagram, Dashboard catalog, alarm incident list, ACK state, command lifecycle, or visual runtime context in `client/src/features/dispatch/pages/DispatchWorkspacePage.tsx`.

**Checkpoint**: `/hub/dispatch/telemetry` is a realtime selected-context operational journal and does not start Dashboard runtime behavior.

---

## Phase 4: User Story 2 - Pause/Resume, Bounded Window, And Context Isolation (Priority: P1)

**Goal**: A USER can pause visible rows for inspection while relevant telemetry keeps buffering inside the same 60-second memory window, then resume to the current buffer; context changes clear stale rows and late callbacks.

**Independent Test**: Use a controlled clock or model helper proof for bounded pruning and pause buffering, then use the Dispatch route harness to verify Pause freezes visible rows, waiting indication appears, Resume catches up, and old Edge/profile rows do not survive a context switch.

### Tests For User Story 2

- [X] T014 [US2] Add compact model proof for append-only row normalization, binding-pair filtering, received-time 60-second pruning from memory, and waiting newer row count in `client/tests/unit/dispatchLiveTelemetry.test.ts`.
- [X] T015 [US2] Extend the focused Dispatch Live Telemetry integration proof with Pause freezing visible rows, buffered waiting indication, Resume reconciliation, selected Edge/profile switch cleanup, and stale callback rejection in `client/tests/integration/DispatchWorkspacePage.test.tsx`.

### Implementation For User Story 2

- [X] T016 [US2] Implement bounded buffer append/prune behavior in `useDispatchLiveTelemetrySession` so rows older than 60 seconds by `receivedAt` are removed from memory in `client/src/features/dispatch/hooks/useDispatchLiveTelemetrySession.ts`.
- [X] T017 [US2] Implement `Pause` / `Resume` state in `DispatchLiveTelemetryTab` so visible rows freeze while the bounded buffer continues updating and resume replaces visible rows with the current buffer in `client/src/features/dispatch/components/DispatchLiveTelemetryTab.tsx`.
- [X] T018 [US2] Register Live Telemetry action-slot controls for `Pause` / `Resume`, transport status, visible row count, and waiting newer row count in `client/src/features/dispatch/components/DispatchLiveTelemetryTab.tsx`.
- [X] T019 [US2] Reset rows, bounded buffer, paused snapshot, waiting indication, transport error state, and active session generation when selected `edgeId`, selected `diagramId`, or selected binding profile changes in `client/src/features/dispatch/hooks/useDispatchLiveTelemetrySession.ts`.
- [X] T020 [US2] Ensure telemetry-only session cleanup disposes the active Socket.IO session on tab unmount and selected Edge changes in `client/src/features/dispatch/hooks/useDispatchLiveTelemetrySession.ts`.

**Checkpoint**: Pause/Resume and 60-second memory bounds are implemented with stale selected-context isolation.

---

## Phase 5: Verification, Documentation Notes, And Technical Lead Review

**Purpose**: Verify boundaries, keep proof lean, and record implementation evidence without expanding the slice.

- [X] T021 Inspect `client/src/features/dispatch/pages/DispatchWorkspacePage.tsx` and verify `DISPATCH_TELEMETRY_TAB` no longer routes to `DispatchPlaceholderTab`.
- [X] T022 Inspect `client/src/features/dispatch/components/DispatchLiveTelemetryTab.tsx`, `client/src/features/dispatch/hooks/useDispatchLiveTelemetrySession.ts`, and `client/src/features/dashboard/services/cloudRuntimeClient.ts` to verify Live Telemetry does not import `useDashboardRuntimeSession`, start Dashboard visual runtime, load alarm incidents, manage ACK state, or project widget values.
- [X] T023 Inspect `client/src/shared/store/useTelemetryStore.ts` usage and verify Live Telemetry does not depend on the legacy `/telemetry` WebSocket store in `client/src/shared/store/useTelemetryStore.ts`.
- [X] T024 Run focused Dispatch Live Telemetry model tests from `client` using `cmd /c npm run test -- dispatchLiveTelemetry` and record the result in `specs/012-dispatch/slices/plan_dispatch_live_telemetry_slice.md`.
- [X] T025 Run focused Dispatch workspace tests from `client` using `cmd /c npm run test -- DispatchWorkspacePage` and record the result in `specs/012-dispatch/slices/plan_dispatch_live_telemetry_slice.md`.
- [X] T026 Run focused Dashboard runtime regression tests from `client` using `cmd /c npm run test -- useDashboardRuntimeSession` and record the result in `specs/012-dispatch/slices/plan_dispatch_live_telemetry_slice.md`.
- [X] T027 Run Client build from `client` using `cmd /c npm run build` and record the result in `specs/012-dispatch/slices/plan_dispatch_live_telemetry_slice.md`.
- [X] T028 Add automated/code proof notes for selected Edge subscribe, binding-profile filtering, newest-first rows, append-only journal behavior, received-time pruning from memory, Pause/Resume buffering, stale context isolation, no Dashboard runtime side effects, and Lean Testing boundaries in `specs/012-dispatch/slices/plan_dispatch_live_telemetry_slice.md`.
- [X] T029 Add manual/runtime smoke status for live selected Edge telemetry, physical local input visibility, Pause/Resume behavior, 60-second memory pruning, Edge switch cleanup, and no Dashboard runtime side effects in `specs/012-dispatch/slices/plan_dispatch_live_telemetry_slice.md`.
- [X] T030 Complete Technical Lead Review for scope leakage, Dispatch/Dashboard boundaries, Socket.IO contract reuse, stale callbacks, pruning proof, Pause/Resume semantics, no legacy WebSocket dependency, acceptance coverage, and Lean Testing Policy in `specs/012-dispatch/slices/plan_dispatch_live_telemetry_slice.md`.

### T021-T027 Quickcheck Evidence

- T021 inspection result: PASS. `DispatchWorkspacePage.tsx` routes `DISPATCH_TELEMETRY_TAB` to `DispatchLiveTelemetryTab`; `DispatchPlaceholderTab` is not used for Telemetry.
- T022 inspection result: PASS. `DispatchLiveTelemetryTab.tsx` uses `useDispatchLiveTelemetrySession`, the hook starts `cloudRuntimeClient.startTelemetryOnlySession`, and `cloudRuntimeClient.ts` telemetry-only mode subscribes to telemetry without edge status, alarm incident, ACK, command lifecycle, visual runtime, or widget projection callbacks. `useDashboardRuntimeSession` is not imported by Live Telemetry.
- T023 inspection result: PASS. Live Telemetry has no dependency on `client/src/shared/store/useTelemetryStore.ts`; the legacy store remains limited to its existing `/telemetry` WebSocket users outside this slice.
- T024 command result: PASS. From `client`, `cmd /c npm run test -- dispatchLiveTelemetry` passed 2 files and 6 tests.
- T025 command result: PASS. From `client`, `cmd /c npm run test -- DispatchWorkspacePage` passed 1 file and 10 tests. The run emitted an existing Recharts container-size warning in the Trends coverage path, but no test failed.
- T026 command result: PASS. From `client`, `cmd /c npm run test -- useDashboardRuntimeSession` passed 1 file and 11 tests.
- T027 command result: PASS. From `client`, `cmd /c npm run build` completed `tsc -b` and Vite production build. Vite reported the existing large chunk warning for `DispatchWorkspacePage`, but the build succeeded.

### T028-T030 Quickcheck Evidence

#### T028 Automated And Code Proof Notes

- Automated/code proof status: PASS for the implemented client behavior covered by focused tests and inspection.
- Selected Edge subscribe proof: `DispatchWorkspacePage.test.tsx` asserts the Telemetry route emits exactly one Socket.IO `subscribe` event with payload `{ edgeId: 'edge-visual-1' }`, and after selected Edge switch emits `{ edgeId: 'edge-visual-2' }`.
- Binding-profile filtering proof: `DispatchWorkspacePage.test.tsx` emits bound and unbound readings, then verifies only selected binding-profile `deviceId + metric` pairs render. Other selected-Edge unbound readings and other-Edge readings are absent.
- Newest-first row proof: the route proof emits multiple relevant rows and verifies the rendered order places the newer `pump-1.running` row before newer and older `boiler-1.temperature` rows. `DispatchLiveTelemetryTable.tsx` also sorts rows newest-first by `receivedAt`, then `eventTimestamp`.
- Append-only journal proof: `dispatchLiveTelemetry.test.ts` verifies repeated readings for the same `deviceId + metric` produce separate unique rows instead of replacing a latest-value projection.
- Received-time pruning proof: `dispatchLiveTelemetry.test.ts` verifies `appendDispatchLiveTelemetryRows` and `pruneDispatchLiveTelemetryRows` remove rows from the in-memory buffer by `receivedAt`, while stale telemetry `eventTimestamp` remains display data and does not control retention.
- Pause/Resume buffering proof: `DispatchWorkspacePage.test.tsx` pauses visible rows, emits two relevant readings, verifies the visible table remains frozen, verifies the waiting indication increases, verifies the Socket.IO session is not disconnected, then resumes and verifies the current bounded buffer is shown with waiting cleared.
- Stale context isolation proof: `DispatchWorkspacePage.test.tsx` switches from `edge-visual-1` to `edge-visual-2`, verifies rows, paused state, waiting count, and transport error clear, then verifies late `edge-visual-1` telemetry and late stale transport errors do not render in the active context.
- No Dashboard runtime side effects proof: `DispatchWorkspacePage.test.tsx` verifies `startSession` is not called, Dashboard visual surface is absent, and Dashboard alarm runtime indicators are absent. T022 inspection confirms Live Telemetry uses `useDispatchLiveTelemetrySession` and `cloudRuntimeClient.startTelemetryOnlySession`, not `useDashboardRuntimeSession`.
- No legacy WebSocket proof: T023 inspection confirms Live Telemetry does not depend on `client/src/shared/store/useTelemetryStore.ts`.
- Lean Testing boundary: proof is intentionally limited to one focused route/runtime integration path plus one compact model-helper proof for filtering, append-only rows, pruning, and waiting count. Mocked integration tests are not counted as live physical telemetry smoke.

#### T029 Manual And Runtime Smoke Status

- Manual/runtime smoke status: NOT RUN.
- Live selected Edge telemetry in an authenticated Cloud environment: NOT RUN.
- Physical local input visibility, including examples such as `pump_main.local_button_pressed` or `pump_main.actual_state`: NOT RUN.
- Pause/Resume behavior against a live telemetry stream: NOT RUN.
- 60-second memory pruning in a live authenticated session: NOT RUN.
- Edge switch cleanup in a live authenticated session: NOT RUN.
- No Dashboard runtime side effects in a live authenticated session: NOT RUN.
- Reason: this quickcheck did not run a live Cloud server with an authenticated trusted USER and a selected trusted Edge emitting physical telemetry. Code inspection, unit tests, and mocked integration tests are recorded only as automated/code proof and are not treated as live physical telemetry smoke.

#### T030 Technical Lead Review Conclusions

- Overall code-review conclusion: PASS for automated/code proof, with manual/runtime smoke remaining PENDING because it was not run.
- Scope leakage: PASS. The slice remains Client-only and does not add Cloud telemetry history APIs, persistence, exports, reports, Trends behavior, Command Audit behavior, Alarm Journal expansion, Edge runtime changes, Edge YAML changes, telemetry ingestion changes, command execution changes, or Constructor changes.
- Dispatch/Dashboard boundary: PASS. `/hub/dispatch/telemetry` uses the Dispatch selected `diagramId`, `edgeId`, and binding profile; `loadDashboardRuntimeContext` remains limited to the Dashboard tab.
- Socket.IO contract reuse: PASS. Live Telemetry reuses the existing Socket.IO telemetry parser through `startTelemetryOnlySession` and subscribes with `{ edgeId }` only.
- Stale callbacks and context cleanup: PASS. The hook uses active generation/context guards, resets state on selected diagram, Edge, or binding-profile changes, and disposes the active session on unmount or selected Edge change.
- Pruning semantics: PASS. The bounded 60-second client-memory window is pruned by client `receivedAt`, not telemetry event timestamp, and proof covers memory removal rather than render-only hiding.
- Pause/Resume semantics: PASS. Pause freezes visible rows while the bounded buffer continues receiving relevant telemetry; Resume reconciles the visible rows with the current buffer and clears waiting state.
- Legacy WebSocket dependency: PASS. Live Telemetry does not use the legacy `/telemetry` WebSocket store.
- Acceptance coverage: PASS for automated acceptance checks that can be proven without a live physical Edge. Runtime acceptance checks that require authenticated live telemetry remain manual smoke PENDING.
- Lean Testing Policy: PASS. Coverage stays focused on the route/runtime risk and compact model behavior instead of broad malformed-payload, timestamp-boundary, visual-copy, or unrelated telemetry-pair matrices.

---

## Dependencies And Execution Order

### Phase Dependencies

- Phase 1 establishes model and fixture anchors.
- Phase 2 depends on Phase 1 model contracts and blocks both user stories.
- Phase 3 depends on Phase 2 telemetry-only session, hook, table, and toolbar primitives.
- Phase 4 depends on Phase 3 route wiring and Phase 2 bounded journal state ownership.
- Phase 5 depends on implementation completion from Phases 3 and 4.

### Task Dependencies

- T005 depends on T001 and T004.
- T006 depends on T001.
- T007 depends on T001.
- T008 depends on T002-T003 and passes only after T009-T013.
- T009 depends on T005-T007.
- T010 depends on T009.
- T011 depends on T010 because the placeholder type should only exclude Telemetry after the real tab is wired.
- T012 depends on T001, T006, and T009.
- T013 depends on T009-T010 and the existing `loadDashboardRuntimeContext` boundary.
- T014 depends on T001.
- T015 depends on T002-T003 and passes only after T016-T020.
- T016 depends on T001 and T005.
- T017 depends on T009 and T016.
- T018 depends on T007 and T017.
- T019 depends on T005 and T016.
- T020 depends on T004-T005.
- T021-T023 depend on implementation completion.
- T024-T027 depend on implementation completion and should run after T021-T023 inspection.
- T028-T030 depend on T024-T027 verification outcomes.

### Parallel Opportunities

- T002 and T003 can run in parallel after T001 is understood because they touch separate test helper files.
- T006 and T007 can run in parallel after T001 because they target separate presentation components.
- T008 and T014 can be drafted in parallel while implementation proceeds, but one owner should coordinate shared fixture assumptions.
- T012 and T013 can run in parallel after T009-T010 if one owner verifies the final route/runtime boundary.
- T016 and T020 should be sequenced by one owner because both modify `useDispatchLiveTelemetrySession.ts`.
- T021-T023 can run in parallel with verification commands after implementation is complete.
- T024-T026 can run in parallel if local Vitest resources are stable.

## Parallel Example: UI Primitives

```text
Task: "Create `DispatchLiveTelemetryTable` for newest-first journal rows with received time, device, metric, value, telemetry event timestamp, optional server timestamp, empty body rendering, and stable row test anchors in `client/src/features/dispatch/components/DispatchLiveTelemetryTable.tsx`."
Task: "Create `DispatchLiveTelemetryToolbar` for running/paused state, visible count, waiting newer row count, transport status, and action-slot-compatible `Pause` / `Resume` control content in `client/src/features/dispatch/components/DispatchLiveTelemetryToolbar.tsx`."
```

## Parallel Example: Verification

```text
Task: "Inspect `client/src/features/dispatch/components/DispatchLiveTelemetryTab.tsx`, `client/src/features/dispatch/hooks/useDispatchLiveTelemetrySession.ts`, and `client/src/features/dashboard/services/cloudRuntimeClient.ts` to verify Live Telemetry does not import `useDashboardRuntimeSession`, start Dashboard visual runtime, load alarm incidents, manage ACK state, or project widget values."
Task: "Run focused Dispatch Live Telemetry model tests from `client` using `cmd /c npm run test -- dispatchLiveTelemetry` and record the result in `specs/012-dispatch/slices/plan_dispatch_live_telemetry_slice.md`."
```

## Implementation Strategy

### MVP First

1. Complete Phase 1 and Phase 2 to establish model helpers, test fixtures, telemetry-only transport, hook state, and UI primitives.
2. Complete Phase 3 to replace the Telemetry placeholder with a selected-context realtime journal.
3. Complete Phase 4 to close the main runtime risks: Pause/Resume buffering, 60-second memory pruning, and stale context isolation.
4. Complete Phase 5 verification and Technical Lead Review.

### Boundary Bias

- Keep the 60-second journal state route-owned and feature-local.
- Reuse the existing Socket.IO subscribe/telemetry parser through a telemetry-only API instead of starting `useDashboardRuntimeSession`.
- Keep Dashboard widget projection, command lifecycle, alarm list, ACK state, and visual runtime untouched.
- Treat `client/src/shared/store/useTelemetryStore.ts` as legacy unless a separate contract-alignment task is explicitly accepted.
- Keep journal rows append-only within the bounded window instead of reusing Dashboard latest-value replacement semantics.
- Use controlled model proof for memory pruning instead of broad timing-heavy integration tests.

## Technical Lead Review

Review this plan and implementation for Client-only scope, Dispatch/Dashboard boundaries, Socket.IO contract reuse, binding-profile filtering, append-only journal behavior, received-time pruning, Pause/Resume buffering, stale selected-context callbacks, legacy WebSocket avoidance, acceptance coverage, and Lean Testing discipline.

### Review Checklist

- Verify scope did not expand into Cloud APIs, telemetry history, storage, exports, reports, Trends, Command Audit, Alarm Journal expansion, Edge runtime, Edge YAML, telemetry ingestion, alarm detection, command execution, or Constructor behavior.
- Verify `/hub/dispatch/telemetry` remains under the existing `/hub` USER auth guard.
- Verify `DISPATCH_TELEMETRY_TAB` no longer routes to `DispatchPlaceholderTab`.
- Verify Live Telemetry uses selected Dispatch `diagramId`, selected `edgeId`, and selected binding profile.
- Verify the realtime subscribe payload contains only `{ edgeId }`.
- Verify telemetry events for a non-active Edge cannot create visible rows.
- Verify default filtering uses `deviceId + metric` from `selectedBindingProfile.widgetBindings`.
- Verify `sourceId`, labels, geometry, Edge YAML, and telemetry history are not used for filtering.
- Verify the journal appends event rows inside the bounded window and does not collapse rows into Dashboard latest-value projection.
- Verify the 60-second memory window is pruned by `receivedAt`, not by telemetry event timestamp.
- Verify Pause freezes visible rows while bounded buffering continues.
- Verify Resume reconciles visible rows with the current bounded buffer.
- Verify selected Edge, diagram, or binding profile changes clear rows, paused snapshot, waiting indication, errors, and late callbacks.
- Verify telemetry-only session disposes on tab unmount and selected Edge changes.
- Verify Live Telemetry does not import `useDashboardRuntimeSession`, start Dashboard visual runtime, load alarm incidents, manage ACK state, project widget values, or mutate command lifecycle state.
- Verify Live Telemetry does not use the legacy `/telemetry` WebSocket store.
- Verify automated proof remains lean: one focused route/runtime proof plus one compact model proof for pruning and pause-buffer semantics.

## Manual And Runtime Smoke

Manual smoke SHOULD use a live Cloud server, an authenticated trusted USER, and a selected trusted Edge emitting telemetry for pairs present in the selected binding profile.

1. Open `/hub/dispatch/telemetry?diagramId=:diagramId&edgeId=:edgeId`.
2. Confirm the Telemetry tab renders the live journal instead of the placeholder.
3. Confirm the tab subscribes only to the selected Edge.
4. Confirm the tab does not start Dashboard visual runtime or alarm incident list behavior.
5. Trigger or wait for telemetry for a bound pair and confirm a newest-first row appears with received time, device, metric, value, and event timestamp.
6. Trigger telemetry for an unbound pair and confirm it is not shown in the default view.
7. Click `Pause`, trigger new bound telemetry, and confirm visible rows do not move while waiting indication appears.
8. Click `Resume` and confirm the current bounded buffer is visible.
9. Wait beyond the 60-second window or use a controlled test clock and confirm old rows are removed from memory.
10. Switch selected Edge or diagram and confirm old rows, paused snapshot, and waiting indication clear.

Manual smoke MUST NOT count as passed if the tab queries telemetry history, if it starts Dashboard runtime side effects, if old Edge rows remain visible after context switch, or if paused mode stops buffering instead of freezing only the visible list.

## Review Trigger

Review this plan when the realtime telemetry contract changes, Dispatch selected-context ownership changes, binding profile shape changes, Dashboard runtime session ownership changes, or a diagnostic all-Edge telemetry mode enters MVP scope.
