# Temporary Dispatch Trends Manual Notes

Status: temporary manual-testing notes. These are not acceptance proof.

## Deferred UI Notes

- Value mode control (`avg` / `last`) is visually too large for the current filter bar. Candidate fix: make it a compact segmented control next to `Max points`, or move it into the chart header.
- The Cloud history response already contains `min`, `max`, `avg`, and `last` per returned point, but the current Client chart mode only exposes `avg` and `last`. Candidate fix: if useful for manual demos or acceptance polish, extend the value mode selector to include `min` and `max` without changing the API contract.
- Current `datetime-local` inputs render in the browser/locale-specific format. On the tested machine this appears as `MM/DD/YYYY hh:mm AM/PM`. Candidate fix: convert stored UTC ISO values to local input values correctly and use an explicit 24-hour display format for non-native rendered timestamps. Native `datetime-local` may still stay locale-rendered by the browser.
- Table/chart timestamp formatting currently uses `Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'medium' })`. Candidate fix: use an explicit local 24-hour formatter, for example with `hour12: false`.
- The `Trends / Selected Edge Server` header duplicates the Dispatch context bar and takes vertical space. Candidate fix: remove the header or fold the selected Edge summary into the filter bar only when useful.
- There is no chart/table view switch. The current behavior renders both chart and table only after history loads. Candidate fix: add a compact `chart | table | both` view mode control, likely near the `avg | last` control.

## Catalog Loading Audit Note

- If metric loading remains stuck after the new catalog mismatch error is visible, audit the live `GET /api/edge-servers/:edgeId/catalog` request and the normalized Client response path. The current UI depends on a successful catalog response containing a matching `edgeServerId` and telemetry entries with `valueType: "number"`.
