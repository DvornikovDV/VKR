# Phase 1: Data Model

This feature reuses existing backend entities and adds a project-local runtime contract between the SPA host and the constructor runtime.

## 1. Backend-aligned entities

### DiagramRecord

Represents one persisted mnemonic diagram owned by the authenticated user.

```ts
interface DiagramRecord {
  _id: string
  ownerId: string
  sourceTemplateId?: string | null
  name: string
  layout: LayoutDocument
  __v: number
  createdAt?: string
  updatedAt?: string
}
```

Validation rules:

- `name` is required for create and Save As.
- `layout` is always a plain object, but may be empty (`{}`) for a new diagram.
- `__v` is required for in-place updates.
- `sourceTemplateId` is optional provenance for an independent User copy created by Admin-template assignment. It is not a live dependency and does not cause template synchronization.
- An Admin-owned record may be a retained layout-only template edited in reduced mode. Assignment and quota enforcement remain application/Cloud responsibilities outside the constructor runtime.

### LayoutDocument

Represents the serialized visual state of the constructor.

```ts
interface LayoutDocument {
  images?: ImageNode[]
  connectionPoints?: ConnectionPointNode[]
  connections?: ConnectionNode[]
  widgets?: WidgetNode[]
  [key: string]: unknown
}
```

Notes:

- Layout contains visual/editor data only.
- Binding persistence remains separate from layout persistence.
- Existing legacy widget payloads may still contain `bindingId`; hosted integration must treat that as legacy compatibility data, not as the source of truth for full-mode bindings.

### BindingSetRecord

Represents one machine-scoped binding set persisted by the backend.

```ts
interface BindingSetRecord {
  _id: string
  diagramId: string
  edgeServerId: string
  widgetBindings: WidgetBindingRecord[]
  createdAt?: string
  updatedAt?: string
}
```

Validation rules:

- Exactly one binding set exists per `(diagramId, edgeServerId)` pair.
- Admin routes do not read or write this entity.

### WidgetBindingRecord

Represents one widget-to-telemetry binding inside a binding set.

```ts
interface WidgetBindingRecord {
  widgetId: string
  deviceId: string
  metric: string
}
```

Validation rules:

- `widgetId`, `deviceId`, and `metric` are all required in full mode.
- `metric` is mandatory even when one device currently exposes one dominant reading.

## 2. Hosted editor catalog entities

These entities are not persisted by constructor. They are supplied by the SPA host.

### EditorMachineOption

Represents one selectable machine context in the constructor UI.

```ts
interface EditorMachineOption {
  edgeServerId: string
  label: string
  isOnline?: boolean
}
```

Notes:

- UI wording may continue to say "machine".
- Persistence and API calls use `edgeServerId`.

### EditorDeviceMetricCatalogEntry

Represents one device with one or more selectable metrics for the active machine context.

```ts
interface EditorDeviceMetricCatalogEntry {
  edgeServerId: string
  deviceId: string
  deviceLabel: string
  deviceType?: string
  metrics: EditorMetricOption[]
}
```

### EditorMetricOption

```ts
interface EditorMetricOption {
  key: string
  label: string
  unit?: string
  valueType?: 'number' | 'boolean' | 'string'
  min?: number
  max?: number
}
```

Validation rules:

- A catalog entry must expose at least one metric.
- The constructor must not attempt to fetch catalog data independently.
- The catalog adapter belongs to `/client`, even if its initial implementation reads from a static asset.

## 3. Runtime session entities

### EditorMode

```ts
type EditorMode = 'full' | 'reduced'
```

Behavior rules:

- `full` mode may load and persist binding sets.
- `reduced` mode must not call bindings persistence flows.

### DirtyState

Tracks host-visible unsaved state for route guards and warnings.

```ts
interface DirtyState {
  layoutDirty: boolean
  bindingsDirty: boolean
}
```

Derived rules:

- Reduced mode always reports `bindingsDirty = false`.
- `hasUnsavedChanges = layoutDirty || bindingsDirty`.

### HostedConstructorSnapshot

Represents the current exportable state coming from the constructor runtime.

```ts
interface HostedConstructorSnapshot {
  layout: LayoutDocument
  bindings?: WidgetBindingRecord[]
}
```

Rules:

- In reduced mode, `bindings` is omitted.
- The host owns persistence decisions; constructor only exports the current state.

## 4. State transitions

### Editor page lifecycle

```text
bootstrapping -> runtime-loading -> session-ready -> dirty -> saving -> saved
                                            |            |
                                            |            -> conflict
                                            -> fatal-load-error
```

Rules:

- `bootstrapping` includes route guards, API loading, and runtime asset loading.
- `saving -> saved` updates the clean baseline for the relevant dirty segment.
- `saving -> conflict` must not destroy the current in-memory editor state.

### Machine context lifecycle (full mode only)

```text
machine-selected -> bindings-loaded -> bindings-dirty -> bindings-saved
         |
         -> machine-switch-pending-warning
```

Rules:

- Machine switching replaces the active binding set in full mode.
- If current bindings are dirty, the host must warn before replacing them.

## 5. Data integrity constraints

- Diagram round-trip must preserve semantic layout structure across open -> edit -> save -> reopen.
- Binding round-trip must preserve widget-to-`deviceId + metric` mappings for a selected `edgeServerId`.
- Destructive in-place layout save deletes all persisted binding sets for the diagram after successful diagram update.
- Save As creates a new `DiagramRecord` only; it does not overwrite the original diagram or delete original bindings.
- Reduced-mode Admin template saves update only the opened template. They do not synchronize existing User copies.
- Assigned User copies remain independent if the source Admin template is later edited or deleted.
