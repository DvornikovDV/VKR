# Dispatch Trends Manual Fix Batch Plan

Status: targeted manual-test follow-up plan. This document is not a replacement for the accepted Dispatch Trends slice plan.

## Purpose

Close the manual-testing UI and behavior gaps found after Dispatch Trends started rendering history charts correctly.

The batch MUST stay Client-only unless implementation discovers a real contract defect. Cloud already returns `min`, `max`, `avg`, `last`, and `count` for each numeric history point, so this batch MUST NOT change the telemetry history API contract.

## Scope

- Tighten the Trends filter bar layout.
- Add missing chart/table display switching near the value mode selector.
- Expose `min` and `max` as chart value modes in addition to `avg` and `last`.
- Fix local time handling and 24-hour timestamp rendering.
- Remove the redundant `Trends / Selected Edge Server` header.
- Preserve the existing catalog and history request flow.

## Out of Scope

- Cloud aggregation changes.
- Edge telemetry or capabilities catalog changes.
- New historical retention rules.
- Seed/demo telemetry generation.
- Reworking the Dispatch context bar.

## Systemic Implementation Strategy

Treat the fix as one Client-owned flow:

`DispatchTrendsTab` owns filter state and request lifecycle -> `DispatchTrendsControls` edits filter/view options -> `projectDispatchTrendsHistoryResponse` maps API history into chart/table projections -> chart/table components render the selected projection.

The implementation SHOULD centralize enum values and time conversion helpers in the Dispatch Trends model layer instead of scattering local string literals through JSX. This avoids a locally correct UI patch that leaves tests, projection, and component state out of sync.

## Fix Stages

### Stage 1 - Centralize Trends Display Model

Problem: value modes are hardcoded as `avg | last` in the Client even though the API already returns `min | max | avg | last`.

Target files:
- `client/src/features/dispatch/model/trends.ts`
- `client/tests/unit/dispatchTrends.test.ts`

Tasks:
- Extend `DispatchTrendsValueMode` to `min | max | avg | last`.
- Add a shared ordered value mode list for controls/tests.
- Add `DispatchTrendsViewMode = chart | table | both`.
- Add a default view mode of `both` to `DispatchTrendsFilter`.
- Keep request descriptor generation unchanged because view/value modes do not change the server query.
- Add lean model proof that `min` and `max` project into chart values correctly.

Acceptance:
- Chart projection can use all four numeric aggregates from one API response.
- Switching value mode does not trigger a new history request by itself.

### Stage 2 - Add Missing Chart/Table View Switch

Problem: there is currently no user-visible chart/table/both switch. The switch must be added next to the displayed value selector, not hidden in the loaded results area.

Target files:
- `client/src/features/dispatch/components/DispatchTrendsControls.tsx`
- `client/src/features/dispatch/components/DispatchTrendsTab.tsx`
- `client/tests/unit/DispatchTrendsTab.test.tsx`

Tasks:
- Add a compact `chart | table | both` segmented control beside the `min | max | avg | last` value mode control.
- Store the selected view mode in `DispatchTrendsFilter`.
- Render chart only for `chart` or `both`.
- Render table only for `table` or `both`.
- Keep both controls visible before history loads so the user understands the available output modes.

Acceptance:
- Before loading history, the user can see and change both value mode and view mode.
- After loading history, `chart` shows only the chart, `table` shows only the table, and `both` shows both.
- View switching reuses the already loaded projection and does not issue another API call.

### Stage 3 - Compact the Value/View Controls

Problem: the current `avg / last` value control is visually too large for the filter bar, and adding view mode can make the bar worse unless layout is handled as a group.

Target files:
- `client/src/features/dispatch/components/DispatchTrendsControls.tsx`

Tasks:
- Group value mode and view mode into one compact filter-bar area.
- Use short labels: `min`, `max`, `avg`, `last` and `chart`, `table`, `both`.
- Preserve keyboard-accessible radio semantics.
- Keep the refresh action visually distinct from passive controls.

Acceptance:
- The controls fit in the current filter bar without adding a large vertical block.
- The layout remains usable on narrower widths by wrapping cleanly.

### Stage 4 - Fix Local Time Semantics

Problem: `datetime-local` currently derives its input value with `toISOString().slice(0, 16)`, which displays UTC as if it were local time.

Target files:
- `client/src/features/dispatch/model/trends.ts`
- `client/src/features/dispatch/components/DispatchTrendsControls.tsx`
- `client/tests/unit/dispatchTrends.test.ts`

Tasks:
- Move datetime-local conversion helpers into the model layer.
- Convert stored UTC ISO values to local `YYYY-MM-DDTHH:mm` values for native inputs.
- Convert native local input values back to UTC ISO values before storing them in filter state.
- Preserve the API request contract: `date_start` and `date_end` remain ISO UTC strings.

Acceptance:
- A local input selection is sent to the API as the corresponding UTC instant.
- Existing default range behavior remains bounded and ISO-based.

### Stage 5 - Use Explicit 24-Hour Local Timestamp Formatting

Problem: chart and table timestamps use browser default short formatting, which may render AM/PM and is not explicit enough for manual SCADA inspection.

Target files:
- `client/src/features/dispatch/model/trends.ts`
- `client/src/features/dispatch/components/DispatchTrendsChart.tsx`
- `client/src/features/dispatch/components/DispatchTrendsTable.tsx`
- `client/tests/unit/dispatchTrends.test.ts`

Tasks:
- Update `formatDispatchTrendsTimestamp` to use local time with `hour12: false`.
- Prefer a stable concise format suitable for chart ticks and table cells.
- Do not claim native `datetime-local` itself can be forced to 24-hour display across all browsers/locales.

Acceptance:
- Chart ticks, tooltips, and table timestamps render in local time with 24-hour clock.
- The formatter does not change the underlying ISO timestamps used in `dateTime` attributes.

### Stage 6 - Remove Redundant Trends Header

Problem: the `Trends / Selected Edge Server` header duplicates the Dispatch context bar and consumes vertical space.

Target files:
- `client/src/features/dispatch/components/DispatchTrendsTab.tsx`
- `client/tests/unit/DispatchTrendsTab.test.tsx`

Tasks:
- Remove the redundant header block from the Trends tab.
- Keep useful context in the existing Dispatch context bar and chart/table summary.
- Avoid tests that pin decorative headings as behavior.

Acceptance:
- The Trends content starts with the filter bar.
- No functional state, request, or metric selection behavior changes.

### Stage 7 - Lean Verification

Target files:
- `client/tests/unit/dispatchTrends.test.ts`
- `client/tests/unit/DispatchTrendsTab.test.tsx`

Tasks:
- Extend existing tests instead of creating broad new suites.
- Cover one happy path for selecting a metric, loading history, switching value mode to `max`, and toggling view mode.
- Cover one model-level time conversion/formatting regression.
- Run `cmd /c npm run test -- dispatchTrends`.

Acceptance:
- Existing Dispatch Trends behavior remains covered.
- New tests verify behavior, not decorative CSS or copy.

## Main Risks

- Native `datetime-local` display may still show AM/PM depending on browser locale. The systemic fix is correct local-time semantics plus explicit 24-hour formatting for rendered chart/table timestamps. A custom datetime control should be a separate follow-up only if native input display is unacceptable after manual verification.
- Adding view mode must not reset loaded history or fire duplicate API calls.
- Value mode expansion must use the existing response fields instead of changing Cloud query parameters.

## Fix-Batch Prompt

Execute a targeted Client-only Dispatch Trends manual-fix batch.

Scope:
- TASKS_FILE: `specs/012-dispatch/slices/plan_dispatch_trends_manual_fix_batch.md`
- Stages: 1-7

Constraints:
- Do not change Cloud or Edge code unless a real contract defect is discovered.
- Do not change telemetry history API request/response shape.
- Add the missing chart/table/both display switch next to the value mode selector.
- Keep proof lean: extend the existing Dispatch Trends tests only where they verify behavior.

Main proof:
- `cmd /c npm run test -- dispatchTrends` from `client`.

Do not count this as success:
- A visual-only layout tweak that leaves value/view modes hardcoded in components.
- A chart/table switch that appears only after history loads.
- A time display change that only formats table cells while leaving datetime-local UTC/local semantics wrong.
