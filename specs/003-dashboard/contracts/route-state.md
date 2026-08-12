# Dashboard Route State Contract

## Route

`/hub/dashboard`

## Query parameters

| Name | Type | Required | Meaning |
|---|---|---|---|
| `diagramId` | string | no | Selected diagram id |
| `edgeId` | string | no | Selected edge id |

## Semantics

1. No query params
   - Dashboard opens in the empty state.
   - No monitoring session starts.

2. `diagramId` only
   - Diagram is preselected.
   - Edge selector stays active and waits for a valid edge for that diagram.
   - No monitoring session starts until `edgeId` is also valid.

3. `diagramId + edgeId`
   - Dashboard attempts to resolve the full monitoring context.
   - The pair is valid only if:
     - the diagram is accessible to the current user;
     - the edge is trusted for the current user;
     - a saved binding profile exists for the same `diagramId + edgeId` pair.

4. `edgeId` without `diagramId`
   - Treated as invalid selection.
   - Dashboard stays on the page and prompts the user to choose a valid diagram first.

## Update rules

- User selection must update the browser URL without a full page reload.
- Diagram changes should clear or replace `edgeId` when the old edge is no longer valid for the new diagram.
- A full monitoring context is represented by both `diagramId` and `edgeId` in the URL.
- Recovery actions that clear the selection may remove one or both params while keeping the user on `/hub/dashboard`.
