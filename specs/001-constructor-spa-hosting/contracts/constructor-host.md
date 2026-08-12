# Contracts: SPA Host <-> Constructor Runtime

This is a project-local runtime contract. It is intentionally narrow and is not a generic public library API.

## 1. Runtime loading boundary

- `/client` loads the constructor runtime from a same-origin hosted entry module.
- The hosted entry must expose a factory function and must not rely on `window.*` globals for host communication.

Illustrative shape:

```ts
export interface HostedConstructorModule {
  createHostedConstructor(config: HostedConstructorConfig): Promise<HostedConstructorInstance>
}
```

## 2. Host -> constructor config

```ts
type EditorMode = 'full' | 'reduced'

interface HostedConstructorConfig {
  container: HTMLElement
  mode: EditorMode
  initialLayout: LayoutDocument
  machines?: EditorMachineOption[]
  deviceCatalog?: EditorDeviceMetricCatalogEntry[]
  activeEdgeServerId?: string | null
  initialBindings?: WidgetBindingRecord[]
  callbacks: HostedConstructorCallbacks
}
```

Rules:

- `machines`, `deviceCatalog`, `activeEdgeServerId`, and `initialBindings` are only meaningful in full mode.
- Reduced mode must tolerate all binding-related inputs being omitted.

## 3. Constructor -> host callbacks

```ts
interface HostedConstructorCallbacks {
  onDirtyStateChange(state: DirtyState): void
  onSaveLayoutIntent(): void
  onSaveAsIntent(): void
  onSaveBindingsIntent(): void
  onMachineChange(edgeServerId: string | null): void
  onFatalError(error: Error): void
}
```

Rules:

- Constructor never persists directly.
- Save buttons inside constructor UI emit intents; the SPA decides what backend flow to run.
- `onMachineChange` is emitted after the editor-local selector changes.
- `onFatalError` is for unrecoverable runtime bootstrap/restore failures that should switch the page into an error state.

## 4. Host -> constructor instance methods

```ts
interface HostedConstructorInstance {
  loadLayout(layout: LayoutDocument): Promise<void>
  getLayout(): Promise<LayoutDocument>
  loadBindings(bindings: WidgetBindingRecord[]): Promise<void>
  getBindings(): Promise<WidgetBindingRecord[]>
  updateCatalog(input: {
    machines: EditorMachineOption[]
    deviceCatalog: EditorDeviceMetricCatalogEntry[]
  }): void
  setActiveMachine(edgeServerId: string | null): void
  destroy(): Promise<void> | void
}
```

Rules:

- `loadBindings`, `getBindings`, `updateCatalog`, and `setActiveMachine` may be no-op in reduced mode.
- `destroy()` must be safe to call multiple times.
- Late async work from older `loadLayout()` or `loadBindings()` calls must be ignored after destroy or after a newer generation supersedes the older one.

## 5. Behavioral guarantees required from constructor runtime

- Render only inside the supplied `container`.
- Do not call backend APIs directly.
- Do not own Save As naming, conflict modals, or destructive-save confirmation.
- Do not rely on hardcoded page-level ids outside the hosted container.
- Prefer full bindings disablement in reduced mode; if fallback hiding is used, hidden behavior must not affect persistence or require user action.
- Use container-aware resize handling (`ResizeObserver` or equivalent host-safe strategy), not `window.resize` alone.

## 6. Dirty-state semantics

- `layoutDirty` becomes `true` after any layout-changing action since the last successful layout baseline.
- `bindingsDirty` becomes `true` in full mode after any binding or machine-scoped binding-edit action since the last successful bindings baseline.
- A successful Save As resets the layout baseline for the newly created diagram route.
- A successful bindings save resets only the bindings baseline for the active `edgeServerId`.
