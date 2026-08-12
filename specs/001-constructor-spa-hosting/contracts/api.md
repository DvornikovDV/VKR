# Contracts: Backend Usage For Hosted Constructor

This feature does not introduce a new backend domain. It reuses existing cloud APIs and adds strict orchestration rules in the SPA host.

## 1. Diagram loading

### `GET /api/diagrams/:id`

- Purpose: load the current diagram into the editor page.
- Caller: `/client` page loader for both full and reduced routes.
- Success payload:

```ts
interface DiagramResponse {
  status: 'success'
  data: DiagramRecord
}
```

Usage rules:

- Required for direct editor-route entry.
- `client/src/shared/api/diagrams.ts` must expose a typed `getDiagramById()` helper.

## 2. In-place layout save

### `PUT /api/diagrams/:id`

- Purpose: save the current layout back to the existing diagram.
- Caller: `/client` after the constructor emits a layout-save intent.
- Request payload:

```ts
interface UpdateDiagramPayload {
  name?: string
  layout?: LayoutDocument
  __v: number
  confirmBindingsDeletion?: boolean
}
```

- Success response:

```ts
interface UpdateDiagramResponse {
  status: 'success'
  data: DiagramRecord
  bindingsInvalidated: boolean
}
```

Usage rules:

- Full mode must perform a fresh destructive-save preflight by reading current binding sets for the diagram immediately before in-place save orchestration.
- If binding sets exist, the host must present a blocking choice (Save As or destructive in-place save) before issuing destructive save.
- Destructive in-place save must send `confirmBindingsDeletion: true`; without it, the backend must reject the operation with `412 Precondition Failed`.
- A successful `PUT` response with `bindingsInvalidated: true` is telemetry/diagnostic feedback only; it is not a substitute for the required pre-save blocking confirmation.
- `409` means version conflict; the host must keep the in-memory session and surface recovery UI.
- A failed `PUT` must never trigger bindings deletion.

## 3. Save As

### `POST /api/diagrams`

- Purpose: create a new diagram from the current layout after the user provides a name.
- Caller: `/client` Save As flow in both editor modes.
- Request payload:

```ts
interface CreateDiagramPayload {
  name: string
  layout: LayoutDocument
}
```

Usage rules:

- Save As never overwrites the original diagram.
- Save As is the non-destructive alternative when an in-place save would delete bindings.
- In reduced Admin mode, this endpoint may create a new retained Admin layout template with an empty or current layout and no binding persistence.

## 3a. Admin template assignment boundary

### `POST /api/diagrams/:id/assign`

- Purpose: create an independent User-owned copy from the latest persisted Admin template.
- Caller: `/client` Admin Diagram Gallery, not the constructor runtime.

Usage rules:

- Assignment copies the persisted template name and layout and copies no binding sets.
- The source Admin template remains owned by the Admin and available for reduced-mode editing and later assignment.
- The created User copy may expose `sourceTemplateId` provenance, but that field is not a synchronization contract.
- Later reduced-mode saves or deletion of the Admin template must not update, replace, delete, or invalidate existing User copies.
- Cloud owns target eligibility, current quota, and duplicate-assignment validation.

## 4. Binding-set loading

### `GET /api/diagrams/:id/bindings`

- Purpose: load all existing binding sets for the diagram.
- Caller: `/client` full-mode page only.
- Success payload:

```ts
interface BindingListResponse {
  status: 'success'
  data: BindingSetRecord[]
}
```

Usage rules:

- Reduced mode must not call this endpoint.
- The host selects the active binding set by `edgeServerId`.
- Presence of any binding sets means in-place layout save is destructive under the current backend rule.

## 5. Binding-set upsert

### `POST /api/diagrams/:id/bindings`

- Purpose: create or replace one binding set for the selected machine (`edgeServerId`).
- Caller: `/client` full-mode page only.
- Request payload:

```ts
interface UpsertBindingsPayload {
  edgeServerId: string
  widgetBindings: WidgetBindingRecord[]
}
```

Usage rules:

- Only full mode may call this endpoint.
- The payload must contain `metric` for every binding row.

## 6. Binding-set deletion

### `DELETE /api/diagrams/:id/bindings/:edgeServerId`

- Purpose: delete one binding set for a given diagram and machine context.
- Caller: `/client` only.

Usage rules:

- This endpoint remains valid for targeted per-machine removal.

### `DELETE /api/diagrams/:id/bindings`

- Purpose: delete all binding sets for the current diagram after a confirmed destructive in-place layout save.
- Caller: `/client` only.

Usage rules:

- Destructive in-place layout save must call this endpoint only after a successful diagram update.
- Reduced mode must not call this endpoint.

## 7. Machine list for full mode

### `GET /api/edge-servers`

- Purpose: load trusted machines for the authenticated USER.
- Caller: `/client` full-mode page only.
- Success payload:

```ts
interface EdgeServerRecord {
  _id: string
  name: string
  lastSeen?: string | null
  isActive?: boolean
}
```

Usage rules:

- The resulting options feed the constructor machine selector.
- Reduced admin mode does not use this endpoint.

## 8. Device-metric catalog

### `GET /api/edge-servers/:edgeServerId/catalog`

- Purpose: load the device/metric catalog for the selected machine context.
- Caller: `/client` full-mode page only.

Usage rules:

- `/client` remains the owner of fetching and shaping catalog data for the constructor.
- Constructor runtime must not own this fetch.
- Reduced admin mode does not use this endpoint.
