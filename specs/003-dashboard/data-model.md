# Data Model: Dashboard SPA Monitoring

## 1. Dashboard Route State

Represents the SPA-owned page state encoded in `/hub/dashboard`.

| Field | Type | Source | Notes |
|---|---|---|---|
| `diagramId` | string or null | URL query | Selected diagram id; may exist without `edgeId` during diagram-first flow |
| `edgeId` | string or null | URL query | Selected edge id; valid only together with a selected diagram |
| `selectionSource` | `route-prefill | user-selection | recovery-reset` | client | Explains how the current route state was reached |

### Validation rules

- `edgeId` without `diagramId` is invalid.
- `diagramId + edgeId` is valid only if the user can access the diagram, the user is trusted for the edge, and a saved binding profile exists for that pair.
- Diagram-only state is allowed but is not an active monitoring context yet.

## 2. Monitoring Context

Resolved only when both ids are valid and saved contracts are available.

| Field | Type | Source | Notes |
|---|---|---|---|
| `diagramId` | string | route | Active diagram id |
| `edgeId` | string | route | Active edge id |
| `diagramName` | string | `GET /api/diagrams` or `GET /api/diagrams/:id` | UI label |
| `edgeName` | string | `GET /api/edge-servers` | UI label |
| `bindingProfileId` | string | selected binding profile | Stable runtime profile id |

## 3. Diagram Runtime Document

Saved runtime surface loaded from cloud.

| Field | Type | Source | Notes |
|---|---|---|---|
| `_id` | string | `GET /api/diagrams/:id` | Diagram identifier |
| `name` | string | same | Human-readable title |
| `layout` | object | same | Saved visual geometry only |
| `__v` | number | same | Saved revision/version |
| `updatedAt` | ISO datetime | same | Useful for debugging and stale-state messaging |

### Saved layout sections

| Section | Type | Notes |
|---|---|---|
| `images[]` | array of Diagram Image | Saved visual image nodes and their geometry |
| `connectionPoints[]` | array of Connection Point | Saved attachment points on image boundaries |
| `connections[]` | array of Connection | Saved visual links between connection points |
| `widgets[]` | array of Dashboard Widget Visual | Saved widget instances and display configuration |

### Diagram Image

| Field | Type | Notes |
|---|---|---|
| `imageId` | string | Stable image identifier used by points and widgets |
| `base64` | string | Saved image data URL |
| `x` | number | Canvas x position |
| `y` | number | Canvas y position |
| `width` | number | Saved image width |
| `height` | number | Saved image height |
| `scaleX` | number | Horizontal scale |
| `scaleY` | number | Vertical scale |

### Connection Point

| Field | Type | Notes |
|---|---|---|
| `id` | string | Stable point identifier |
| `side` | `top | right | bottom | left` | Image side where the point is attached |
| `offset` | number | Relative offset along the side, clamped to `0..1` |
| `imageId` | string | Parent image identifier |

### Connection

| Field | Type | Notes |
|---|---|---|
| `id` | string | Stable connection identifier |
| `fromPinId` | string | Source connection point id |
| `toPinId` | string | Target connection point id |
| `segments` | array | Saved routed connection segments |
| `userModified` | boolean | Whether the route was manually modified in Constructor |

### Dashboard Widget Visual

| Field | Type | Notes |
|---|---|---|
| `id` | string | Stable widget identifier used by binding profiles |
| `type` | string | Saved widget type |
| `imageId` | string | Parent image identifier when the widget is attached to an image |
| `x` | number | Canvas x position |
| `y` | number | Canvas y position |
| `width` | number | Widget width |
| `height` | number | Widget height |
| `relativeX` | number | Relative x position within parent image |
| `relativeY` | number | Relative y position within parent image |
| `fontSize` | number | Saved text size when applicable |
| `color` | string | Saved foreground color |
| `backgroundColor` | string | Saved background color |
| `borderColor` | string | Saved border color |
| type-specific fields | mixed | Examples: `displayValue`, `unit`, `text`, `radius`, `colorOn`, `colorOff`, control labels |

### Derived runtime indexes

- `widgetIds`: set of saved widget ids extracted from `layout.widgets[]`
- `widgetById`: saved widget config keyed by `widgetId`
- `runtimeRenderableWidgets`: ordered list of saved widgets for visual rendering
- `imageById`: saved images keyed by `imageId`
- `pointById`: saved connection points keyed by `id`
- `connectionRenderSegments`: connection geometry resolved from saved `segments` when present, otherwise from saved point positions; incomplete geometry produces recoverable render issues
- `diagramBounds`: bounding box derived from images, connections, and widgets
- `renderIssues`: recoverable or blocking visual layout issues found during normalization

## 3a. Runtime Layout Model

Client-derived model used by the visual renderer after saved layout normalization.

| Field | Type | Source | Notes |
|---|---|---|---|
| `images` | Diagram Image[] | saved layout | Renderable image nodes |
| `connectionPoints` | Connection Point[] | saved layout | Renderable read-only points |
| `connections` | Connection[] | saved layout | Renderable read-only lines |
| `widgets` | Dashboard Widget Visual[] | saved layout | Renderable read-only widgets |
| `diagramBounds` | object | client-derived | Min/max bounds of renderable visual elements |
| `renderIssues` | Render Issue[] | client-derived | Visual layout problems detected during normalization |

### Render Issue

| Field | Type | Notes |
|---|---|---|
| `severity` | `blocking | recoverable` | Blocking prevents a completed visual surface; recoverable allows partial rendering |
| `kind` | string | Examples: `missing-image`, `damaged-image-data`, `missing-connection-point`, `unsupported-widget-shape` |
| `message` | string | Operator-facing summary suitable for diagnostics |
| `elementId` | string or null | Related saved element id when available |

### Validation rules

- Dashboard must not treat a textual widget/value summary as a completed visual runtime layout.
- Images with missing or invalid image data create render issues.
- Connections that reference missing points create render issues.
- Widgets that reference missing parent images remain diagnosable and may be omitted or rendered only when geometry is still meaningful.
- Recoverable render issues may produce a partial visual surface; blocking render issues produce `visual-rendering-error`.

## 4. Diagram Binding Profile

Saved runtime mapping for one `diagramId + edgeId` pair.

| Field | Type | Source | Notes |
|---|---|---|---|
| `_id` | string | `GET /api/diagrams/:id/bindings` | Profile identifier |
| `diagramId` | string | same | Parent diagram |
| `edgeServerId` | string | same | Bound edge context |
| `widgetBindings` | array | same | Saved widget mappings |
| `updatedAt` | ISO datetime | same | Useful for troubleshooting |

### Widget Binding

| Field | Type | Notes |
|---|---|---|
| `widgetId` | string | Must exist in the saved diagram snapshot |
| `deviceId` | string | Runtime lookup key part |
| `metric` | string | Runtime lookup key part |

### Validation rules

- Each `widgetId` must exist in the saved diagram snapshot.
- Dashboard must not synthesize missing bindings for unbound widgets.
- If any referenced `widgetId` is missing from the saved diagram snapshot, the profile is treated as invalid/stale for MVP runtime.

## 5. Trusted Edge Server Option

Selectable edge server candidate shown in the Dashboard page.

| Field | Type | Source | Notes |
|---|---|---|---|
| `_id` | string | `GET /api/edge-servers` | Edge identifier |
| `name` | string | same | UI label |
| `isActive` | boolean or undefined | same | Administrative activation state |
| `lastSeen` | ISO datetime or null | same | Non-authoritative boot hint only |
| `hasSavedBindingProfile` | boolean | client-derived | True only when a binding profile exists for the selected diagram |

## 6. Runtime Telemetry Event

Latest cloud runtime payload delivered over Socket.IO.

| Field | Type | Source | Notes |
|---|---|---|---|
| `edgeId` | string | `telemetry` event | Must match active context |
| `readings[]` | array | `telemetry` event | Latest readings batch |
| `serverTs` | number | `telemetry` event | Cloud emit timestamp |

### Runtime Reading

| Field | Type | Notes |
|---|---|---|
| `sourceId` | string | Cloud metadata, not part of the saved binding key |
| `deviceId` | string | Binding lookup key part |
| `metric` | string | Binding lookup key part |
| `last` | number or boolean | Latest runtime value |
| `ts` | number | Reading timestamp |

### Derived projection

- `latestMetricValueByBindingKey`: map keyed by `deviceId + metric`
- `widgetValueById`: map from saved `widgetId` to the latest resolved bound value

## 7. Runtime Status Model

Separates transport health from edge availability.

### Transport Status

| Value | Meaning |
|---|---|
| `idle` | No active full monitoring context |
| `connecting` | Opening Socket.IO session for the selected edge |
| `connected` | Subscribed and receiving runtime signals |
| `reconnecting` | Transport lost; retrying without clearing the last rendered values |
| `failed` | Runtime session could not be established |

### Edge Availability

| Value | Meaning |
|---|---|
| `unknown` | No authoritative runtime signal received yet |
| `online` | `edge_status` reports the selected edge online |
| `offline` | `edge_status` reports the selected edge offline/unavailable |

## 8. Diagram Workspace Viewport

Client-owned view state for navigating the visual diagram surface.

| Field | Type | Source | Notes |
|---|---|---|---|
| `scale` | number | client | Current zoom scale |
| `offsetX` | number | client | Horizontal viewport offset |
| `offsetY` | number | client | Vertical viewport offset |
| `minScale` | number | client | Lower zoom bound |
| `maxScale` | number | client | Upper zoom bound |
| `mode` | `fit | manual | reset` | client | Explains how the current viewport was reached |
| `bounds` | object | Runtime Layout Model | Diagram bounds used for fit/reset calculations |

### Viewport rules

- Initial viewport uses an intelligent fit: near-100% scale when the diagram fits, otherwise fit-to-view.
- Pan and zoom update viewport state only; they do not mutate the saved layout.
- The grid uses the same transform as the diagram workspace so it moves and scales with the visual surface.
- Reset returns to the default workspace transform, while fit-to-view recomputes a fit from current bounds and workspace size.

## 9. Runtime Diagnostic Details

Secondary diagnostic state for troubleshooting telemetry, bindings, and visual rendering.

| Field | Type | Source | Notes |
|---|---|---|---|
| `isOpen` | boolean | client | Collapsed by default |
| `telemetryEntries` | array | Telemetry Snapshot | Latest values grouped for diagnostics |
| `bindingEntries` | array | Diagram Binding Profile | Widget-to-device mappings for the active context |
| `renderIssues` | Render Issue[] | Runtime Layout Model | Visual layout issues |
| `lastServerTimestamp` | number or null | Runtime Telemetry Event | Latest telemetry server timestamp |

### Diagnostic rules

- Diagnostics are secondary and must not replace the visual monitoring surface.
- Collapsed diagnostics occupy only a small handle area in the Dashboard workspace.
- Expanded diagnostics have bounded height and internal scrolling.
- Diagnostic content may be grouped by telemetry values, bindings, and render issues without requiring tabbed navigation in the first increment.

## 10. Dashboard Recovery State

Primary page state presented to the user.

| Value | Trigger | Recovery path |
|---|---|---|
| `empty` | No context selected yet | User selects diagram, then edge |
| `loading` | REST/bootstrap/runtime resolution in progress | Wait or retry |
| `ready` | Valid saved context resolved | Observe live runtime |
| `generic-error` | Unexpected fetch/init failure | Retry current load |
| `invalid-selection` | Invalid ids, inaccessible ids, or mismatched pair | Choose a new valid context on the same page |
| `missing-binding-profile` | No saved profile for `diagramId + edgeId` | Return to constructor authoring flow to create bindings |
| `invalid-binding-profile` | Saved profile references stale widget ids | Return to constructor authoring flow and resave bindings |
| `visual-rendering-error` | Saved layout cannot be rendered as a visual monitoring surface | Return to Constructor or inspect diagnostic details |
| `partial-visual-rendering` | Recoverable layout elements render while some saved elements are omitted or degraded | Inspect diagnostic details and continue monitoring if the context is otherwise valid |

## 11. State Transitions

1. `empty -> loading`
   - Trigger: valid route prefill or user completes both selections.
2. `loading -> ready`
   - Trigger: saved diagram, saved binding profile, and initial runtime session all resolve successfully.
3. `loading -> invalid-selection`
   - Trigger: inaccessible diagram, inaccessible edge, `edgeId` without diagram, or pair not allowed by saved bindings.
4. `loading -> missing-binding-profile`
   - Trigger: selected pair has no saved binding profile.
5. `loading -> invalid-binding-profile`
   - Trigger: binding `widgetId` references do not exist in the saved diagram snapshot.
6. `loading -> generic-error`
   - Trigger: unexpected REST or runtime bootstrap failure.
7. `loading -> visual-rendering-error`
   - Trigger: blocking visual layout issue prevents a completed visual monitoring surface.
8. `loading -> partial-visual-rendering`
   - Trigger: saved diagram and binding profile are valid, but recoverable render issues are present.
9. `partial-visual-rendering` may keep a runtime session active when the monitoring context is otherwise valid.
10. `ready -> loading`
   - Trigger: user changes diagram or edge selection.
11. `ready` keeps its page state while transport moves `connected -> reconnecting -> connected`.
12. `ready` keeps its page state while edge availability moves `unknown/online -> offline -> online`.
