# Dashboard Alarm Visual UX Slice Plan

## Purpose

This slice MUST add runtime-only visual alarm indication to the Dashboard saved mnemonic diagram.

The Dashboard MUST project Cloud-owned alarm incidents through the saved Dashboard binding profile and render widget/image alarm indicators without mutating the saved diagram layout, saved binding profile, Cloud alarm lifecycle, Edge alarm detection, or Constructor authoring flows.

## Scope

- MUST render an alarm outline and compact corner badge for renderable Dashboard widgets whose saved telemetry binding matches one or more unclosed Cloud alarm incidents.
- MUST derive widget alarm state from `AlarmIncidentProjection` items and the saved Dashboard binding profile for the selected `diagramId + edgeId`.
- MUST match incidents to widgets only by `deviceId + metric` within the selected `edgeId` context.
- MUST treat `sourceId` as diagnostic compatibility only; it MUST NOT participate in Dashboard runtime lookup.
- MUST use severity priority `danger > warning` for widget and image visual color selection.
- MUST aggregate image badges from alarmed child widgets through `widget.imageId`.
- MUST render an aggregate image corner badge only for images present in `runtimeRenderableImageById`.
- MUST preserve current Dashboard pan, zoom, fit-to-view, and reset behavior without auto-moving the viewport.
- MUST preserve existing visual-rendering recovery behavior for missing, damaged, or non-renderable images.

## Out Of Scope

- MUST NOT highlight diagram connections.
- MUST NOT auto-navigate, auto-focus, auto-pan, or auto-zoom to alarmed widgets.
- MUST NOT add diagram-local alarm details or acknowledgement workflows.
- MUST NOT acknowledge incidents from the diagram overlay; ACK remains in alarm journal UI surfaces.
- MUST NOT read Edge YAML in Client.
- MUST NOT derive alarm targets from labels, geometry, telemetry values, socket history, diagram text, connection topology, or any Constructor internals.
- MUST NOT add or change Edge alarm detection rules.
- MUST NOT move alarm diagnosis into Cloud.
- MUST NOT change Cloud ACK lifecycle semantics.
- MUST NOT add historical alarm analytics, exports, search, or broad monitoring filters.
- MUST NOT mutate saved diagram layout or saved binding profiles.
- MUST NOT add Constructor authoring UX for alarms or diagram bindings.

## Assumptions

- It is safe for planning to assume a separate model/helper function near the Dashboard model code for incident-to-visual mapping, so DashboardVisualSurface remains mostly rendering-focused and does not own business mapping.
- Renderable image for aggregate badge means an image present in runtimeRenderableImageById, not merely imageById.
- Badge count for both widget and image counts mapped unclosed incidents, not widgets.
- Colors may use existing danger/warning design tokens where available; exact visual values remain UI implementation detail.

## Constraints

- The runtime source of truth MUST remain the saved diagram revision plus saved binding profile for `diagramId + edgeId`.
- Only `AlarmIncidentProjection` items for the selected `edgeId` MUST participate in diagram overlay mapping.
- The overlay MUST consume Cloud-owned incident projection state already loaded through the incident list endpoint or received through `alarm_incident_changed` realtime updates.
- The overlay MUST NOT create a second incident source.
- Visual alarm projection MUST use the saved `DashboardBindingProfile.widgetBindings` directly and MUST NOT derive alarm targets from `runtimeProjection`, live telemetry, or rendered text.
- Unclosed incidents MUST be defined as `isActive == true OR isAcknowledged == false`.
- Closed incidents MUST be defined as `isActive == false AND isAcknowledged == true`.
- Closed incidents MUST NOT produce widget or image diagram indication.
- When multiple unclosed incidents map to one widget or image, visual mode MUST use priority `active_unacknowledged > active_acknowledged > cleared_unacknowledged`.
- Transport connectivity and Edge availability MUST remain separate from alarm lifecycle state.
- The saved diagram layout MUST remain immutable; overlay state is Client runtime state only.
- Lean Testing Policy MUST apply: implementation proof SHOULD cover the main happy path and at most one critical negative scenario for the main slice risk. Tests MUST remain concrete and verifiable, but MUST NOT expand into a large lifecycle/severity matrix.
- Test proof SHOULD remain lean and MUST NOT expand lifecycle/severity acceptance checks into an exhaustive matrix.

## Runtime Flow

1. Dashboard receives incident projections through the existing initial REST list path or realtime `alarm_incident_changed` upsert path.
2. Dashboard filters known incidents to the selected `edgeId`.
3. The visual alarm projection filters out closed incidents.
4. Each remaining incident maps by `deviceId + metric` to saved `DashboardBindingProfile.widgetBindings`.
5. Each matched binding maps to `widgetId` and then to a renderable visual widget.
6. Widget visual state derives count, strongest severity, and lifecycle visual treatment from mapped unclosed incidents.
7. Image visual state derives count, strongest severity, and pulse state from alarmed child widgets whose `widget.imageId` points to a renderable image.
8. Dashboard renders widget outlines, widget badges, and image badges without changing viewport state or saved layout data.

## Lifecycle Visual Treatment

| Incident state | Widget indication | Badge indication |
| --- | --- | --- |
| `isActive=true`, `isAcknowledged=false` | MUST use pulsing outline | MUST use bright badge |
| `isActive=true`, `isAcknowledged=true` | MUST use steady outline | MUST use steady badge |
| `isActive=false`, `isAcknowledged=false` | MUST use muted dashed outline | MUST use muted badge |
| `isActive=false`, `isAcknowledged=true` | MUST render no overlay | MUST render no overlay |

Image badge animation MUST pulse when at least one child incident is active and unacknowledged.

## Responsibility Boundaries

- Client Dashboard model code MUST own incident-to-visual mapping, lifecycle visual classification, severity priority, and image aggregation.
- `DashboardRuntimeSurface` SHOULD only wire selected-edge incident state and saved runtime inputs into the visual surface.
- `DashboardVisualSurface` SHOULD remain rendering-focused and render the supplied visual alarm state.
- Cloud MUST remain the owner of incident lifecycle, incident projection shape, list endpoint, ACK endpoint, and realtime incident events.
- Edge MUST remain the owner of local alarm detection from local configuration and device telemetry.
- Constructor MUST remain the owner of diagram and binding authoring.

## Acceptance Checks

- Given a saved diagram with renderable widgets and saved widget bindings, when selected-edge unclosed `AlarmIncidentProjection` items match `deviceId + metric`, then the matching widgets show an alarm outline and compact badge.
- Given multiple mapped unclosed incidents for one widget, then the widget badge count equals the mapped unclosed incident count and the color uses the strongest mapped severity.
- Given multiple lifecycle states mapped to one widget or image, then the most urgent lifecycle visual mode wins by priority `active_unacknowledged > active_acknowledged > cleared_unacknowledged`.
- Given alarmed child widgets attached to a renderable image through `widget.imageId`, then the image shows an aggregate top-right badge.
- Given multiple mapped child incidents for one image, then the image badge count equals the total mapped unclosed incident count across child widgets and the color uses the strongest child severity.
- Given an active unacknowledged incident, then the widget indication and relevant image badge use pulsing or prominent visual treatment.
- Given an active acknowledged incident, then the widget indication and relevant image badge use steady visual treatment.
- Given a cleared unacknowledged incident, then the widget indication and relevant image badge use muted visual treatment.
- Given a closed incident, then no widget or image overlay is rendered for that incident.
- Given an unclosed incident with no saved widget binding match, then no widget or image overlay is rendered.
- Given only telemetry or `runtimeProjection` evidence without a saved widget binding match, then no widget or image overlay is rendered.
- Given an incident whose target can only be guessed from labels, geometry, telemetry values, socket history, diagram text, Edge YAML, or topology, then Dashboard MUST NOT render an inferred overlay.
- Given a widget whose `imageId` points to a missing, damaged, or non-renderable image, then the widget MAY show its own valid alarm indication when renderable, but Dashboard MUST NOT invent an image badge target.
- Given an existing viewport state, then alarm overlay changes MUST NOT trigger auto-pan, auto-zoom, fit-to-view, reset, or focus changes.

## Detailed Task Plan

### Phase 1: Setup

**Purpose**: Anchor the slice in the existing Dashboard runtime surface and test fixtures.

- [X] T001 [P] Confirm existing dashboard visual fixture covers two bound child widgets sharing `image-boiler` in `client/tests/fixtures/dashboardVisualLayout.ts`
- [X] T002 [P] Confirm existing alarm incident fixtures expose active, acknowledged, cleared, closed, warning, and danger projections in `client/tests/integration/helpers/mockDashboardRuntimeSocket.ts`

### Phase 2: Foundational

**Purpose**: Add shared visual alarm state contracts before model or renderer work begins.

- [X] T003 Add Dashboard widget/image alarm visual state types and lifecycle visual mode unions in `client/src/features/dashboard/model/types.ts`
- [X] T004 Add stable alarm overlay test IDs and visual constants near the Dashboard renderer in `client/src/features/dashboard/components/DashboardVisualSurface.tsx`

### Phase 3: User Story 1 - Derive Alarm Visual State From Saved Bindings (Priority: P1)

**Goal**: Dashboard can derive widget and image alarm state from Cloud incidents plus the saved binding profile without using labels, geometry, telemetry, socket history, or Edge YAML.

**Independent Test**: A model test can pass with no React render by feeding incidents, a binding profile, and normalized runtime layout, then asserting widget/image alarm state and excluded incidents.

#### Tests for User Story 1

- [X] T005 [US1] Add model happy-path proof for widget and image alarm aggregation by saved `deviceId + metric` bindings in `client/tests/unit/dashboardAlarmVisualProjection.test.ts`
- [X] T006 [US1] Add model negative proof that closed incidents, unmatched incidents, telemetry-only evidence, labels, geometry, and missing image targets do not produce overlay state in `client/tests/unit/dashboardAlarmVisualProjection.test.ts`

#### Implementation for User Story 1

- [X] T007 [US1] Implement incident-to-widget alarm mapping helper using `DashboardBindingProfile.widgetBindings` in `client/src/features/dashboard/model/alarmVisualProjection.ts`
- [X] T008 [US1] Implement lifecycle visual mode priority `active_unacknowledged > active_acknowledged > cleared_unacknowledged` and severity priority `danger > warning` in `client/src/features/dashboard/model/alarmVisualProjection.ts`
- [X] T009 [US1] Implement image alarm aggregation through `widget.imageId` and `runtimeRenderableImageById` in `client/src/features/dashboard/model/alarmVisualProjection.ts`
- [X] T010 [US1] Export named alarm visual projection functions and types for import by `DashboardRuntimeSurface.tsx` from `client/src/features/dashboard/model/alarmVisualProjection.ts`

### Phase 4: User Story 2 - Render Widget And Image Alarm Overlay (Priority: P1)

**Goal**: The visual Dashboard surface renders widget outlines, widget badges, and aggregate image badges from supplied alarm visual state without owning business mapping.

**Independent Test**: A component test can render `DashboardVisualSurface` with prepared alarm visual state and assert stable Konva/DOM anchors for widget and image overlay without starting a runtime socket.

#### Tests for User Story 2

- [X] T011 [US2] Add component proof for widget alarm outline and compact badge render anchors in `client/tests/integration/DashboardVisualSurface.test.tsx`
- [X] T012 [US2] Add component proof for aggregate image top-right badge render anchors in `client/tests/integration/DashboardVisualSurface.test.tsx`

#### Implementation for User Story 2

- [X] T013 [US2] Add `alarmVisualState` prop to `DashboardVisualSurface` in `client/src/features/dashboard/components/DashboardVisualSurface.tsx`
- [X] T014 [US2] Render widget alarm outlines and badges from supplied widget alarm state in `client/src/features/dashboard/components/DashboardVisualSurface.tsx`
- [X] T015 [US2] Render aggregate image corner badges from supplied image alarm state in `client/src/features/dashboard/components/DashboardVisualSurface.tsx`
- [X] T016 [US2] Preserve command DOM anchors, Konva widget groups, and viewport transform behavior while adding overlay render layers in `client/src/features/dashboard/components/DashboardVisualSurface.tsx`

### Phase 5: User Story 3 - Wire Runtime Incidents Into The Visual Surface (Priority: P1)

**Goal**: The Dashboard runtime path feeds selected-edge Cloud incident state and the saved binding profile into the visual overlay while preserving alarm journal ownership for ACK.

**Independent Test**: A Dashboard integration test can load a saved diagram, return incidents from the existing alarm incident list endpoint, and observe widget/image overlay anchors without using telemetry-derived target inference.

#### Tests for User Story 3

- [X] T017 [US3] Extend Dashboard runtime fixture data with warning and danger incidents that map to existing visual bindings in `client/tests/integration/helpers/mockDashboardRuntimeSocket.ts`
- [X] T018 [US3] Add Dashboard happy-path integration proof for REST-loaded selected-edge incidents producing widget and image overlay anchors in `client/tests/integration/DashboardVisualSurface.test.tsx`
- [X] T019 [US3] Add Dashboard critical negative integration proof that closed and unmatched incidents do not produce overlay anchors in `client/tests/integration/DashboardVisualSurface.test.tsx`

#### Implementation for User Story 3

- [X] T020 [US3] Add selected binding profile prop to `DashboardRuntimeSurface` in `client/src/features/dashboard/components/DashboardRuntimeSurface.tsx`
- [X] T021 [US3] Pass selected binding profile from Dashboard dispatch owner into `DashboardRuntimeSurface` in `client/src/features/dashboard/components/DashboardDispatchSubtab.tsx`
- [X] T022 [US3] Compute alarm visual projection from `activeEdgeAlarmIncidents`, selected binding profile, and normalized runtime layout in `client/src/features/dashboard/components/DashboardRuntimeSurface.tsx`
- [X] T023 [US3] Pass computed alarm visual state into `DashboardVisualSurface` from `client/src/features/dashboard/components/DashboardRuntimeSurface.tsx`
- [X] T024 [US3] Keep ACK callbacks and alarm journal props unchanged while wiring diagram overlay state in `client/src/features/dashboard/components/DashboardRuntimeSurface.tsx`

### Phase 6: Manual And Runtime Smoke

**Purpose**: Verify the slice against the real Dashboard runtime behavior without broad test expansion.

- [X] T025 Run focused unit proof for alarm visual projection with `cmd /c npm run test -- dashboardAlarmVisualProjection` using `client/package.json`
- [X] T026 Run focused visual/runtime proof with `cmd /c npm run test -- DashboardVisualSurface` using `client/package.json`
- [ ] T027 Run manual smoke on `/hub/dashboard?diagramId=<saved-diagram>&edgeId=<edge>` to verify widget/image overlay appears from Cloud incidents and pan/zoom/fit/reset do not auto-move through `client/src/features/dashboard/components/DashboardRuntimeSurface.tsx`; journal-only red light MUST NOT count as success

### Phase 7: Technical Lead Review

**Purpose**: Review implementation completeness before batching or coding follow-up work.

- [X] T028 [P] Review model mapping for scope leakage, binding inference, lifecycle priority, severity priority, and image renderability in `client/src/features/dashboard/model/alarmVisualProjection.ts`
- [X] T029 [P] Review renderer changes for viewport preservation, command anchor preservation, and journal/ACK separation in `client/src/features/dashboard/components/DashboardVisualSurface.tsx`
- [X] T030 [P] Review runtime wiring for selected-edge filtering, selected binding profile propagation, and single incident source usage in `client/src/features/dashboard/components/DashboardRuntimeSurface.tsx`

## Dependencies

- Phase 1 MUST complete before changing fixtures or relying on existing incident helpers.
- Phase 2 MUST complete before User Story implementation because shared types shape model and renderer contracts.
- US1 MUST complete before US2 and US3 because renderer and runtime wiring consume the model projection shape.
- US2 and US3 MAY proceed in parallel after US1 if they coordinate the `alarmVisualState` prop shape and selected binding profile prop shape.
- US3 implementation MUST include binding-profile propagation from `DashboardDispatchSubtab` before computing the visual alarm projection in `DashboardRuntimeSurface`.
- Manual/runtime smoke MUST run after US1, US2, and US3 are complete.
- Technical Lead Review MUST run after implementation and focused proof tasks are complete.

## Parallel Opportunities

- T001 and T002 MAY run in parallel because they inspect different fixture files.
- T003 and T004 SHOULD be implemented sequentially because renderer constants depend on the shared visual state names.
- T005 and T006 SHOULD be implemented sequentially because they share `client/tests/unit/dashboardAlarmVisualProjection.test.ts`.
- T011 and T012 SHOULD be implemented sequentially because they share `client/tests/integration/DashboardVisualSurface.test.tsx`.
- T018 and T019 SHOULD be implemented sequentially because they share `client/tests/integration/DashboardVisualSurface.test.tsx`.
- T028, T029, and T030 MAY run in parallel after implementation because they review different runtime boundaries.

## Implementation Strategy

1. Complete setup and foundational types first.
2. Deliver US1 as the MVP proof path because it establishes the contract that prevents binding inference.
3. Add US2 rendering after the model projection shape is stable.
4. Add US3 runtime wiring only after the renderer can consume supplied visual alarm state.
5. Run focused unit and component/integration tests.
6. Run manual smoke only for the main runtime behavior and viewport preservation.

## Task Plan Review Trigger

Trigger review when any task changes Cloud incident contract assumptions, saved binding lookup behavior, `DashboardRuntimeLayout` renderability rules, `DashboardVisualSurface` prop boundaries, or ACK ownership.

## Source Of Truth

- `doc_cursed/dashboard_alarm_visual_indication_plan.md`
- `doc_cursed/alarms_plan.md`
- `doc_cursed/alarm_incident_journal_api_plan.md`
- `doc_cursed/monitoring_plan.md`
- `specs/003-dashboard/spec.md`
- `specs/003-dashboard/data-model.md`
- `specs/003-dashboard/contracts/runtime-signals.md`

## Review Trigger

Review this plan when Dashboard alarm incident projection shape changes, saved binding profile identity changes, Dashboard runtime layout renderability rules change, or ACK ownership moves away from alarm journal UI surfaces.
