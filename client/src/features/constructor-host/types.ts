export type EditorMode = 'full' | 'reduced'

export interface LayoutDocument {
  images?: unknown[]
  connectionPoints?: unknown[]
  connections?: unknown[]
  widgets?: unknown[]
  [key: string]: unknown
}

export interface WidgetBindingRecord {
  widgetId: string
  deviceId: string
  metric: string
}

export interface EditorMachineOption {
  edgeServerId: string
  label: string
  isOnline?: boolean
}

export interface EditorMetricOption {
  key: string
  label: string
  unit?: string
  valueType?: 'number' | 'boolean' | 'string'
  min?: number
  max?: number
}

export interface EditorDeviceMetricCatalogEntry {
  edgeServerId: string
  deviceId: string
  deviceLabel: string
  deviceType?: string
  metrics: EditorMetricOption[]
}

export interface DirtyState {
  layoutDirty: boolean
  bindingsDirty: boolean
}

export interface HostedConstructorCallbacks {
  onDirtyStateChange(state: DirtyState): void
  onSaveLayoutIntent(): void
  onSaveAsIntent(): void
  onSaveBindingsIntent(): void
  onMachineChange(edgeServerId: string | null): void
  onFatalError(error: Error): void
}

export interface HostedConstructorConfig {
  container: HTMLElement
  mode: EditorMode
  initialLayout: LayoutDocument
  machines?: EditorMachineOption[]
  deviceCatalog?: EditorDeviceMetricCatalogEntry[]
  activeEdgeServerId?: string | null
  initialBindings?: WidgetBindingRecord[]
  callbacks: HostedConstructorCallbacks
}

export interface HostedConstructorCatalogUpdateInput {
  machines: EditorMachineOption[]
  deviceCatalog: EditorDeviceMetricCatalogEntry[]
}

export interface HostedConstructorInstance {
  loadLayout(layout: LayoutDocument): Promise<void>
  getLayout(): Promise<LayoutDocument>
  loadBindings(bindings: WidgetBindingRecord[]): Promise<void>
  getBindings(): Promise<WidgetBindingRecord[]>
  updateCatalog(input: HostedConstructorCatalogUpdateInput): void
  setActiveMachine(edgeServerId: string | null): void
  destroy(): Promise<void> | void
}

export interface HostedConstructorModule {
  createHostedConstructor(config: HostedConstructorConfig): Promise<HostedConstructorInstance>
}
