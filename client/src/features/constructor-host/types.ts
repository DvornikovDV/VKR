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

export interface CommandBindingRecord {
  widgetId: string
  deviceId: string
  commandType: 'set_bool' | 'set_number'
}

export interface DiagramBindingProfileRecord {
  widgetBindings: WidgetBindingRecord[]
  commandBindings: CommandBindingRecord[]
}

export interface EditorMachineOption {
  edgeServerId: string
  label: string
  edgeName?: string
  lifecycleState?: 'Active' | 'Blocked'
  availabilityLabel?: 'Online' | 'Offline' | 'Unknown'
  lastSeenAt?: string | null
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

export interface EditorCommandOption {
  commandType: 'set_bool' | 'set_number'
  valueType: 'boolean' | 'number'
  label: string
  min?: number
  max?: number
  reportedMetric: string
}

export interface EditorDeviceCommandCatalogEntry {
  edgeServerId: string
  deviceId: string
  deviceLabel: string
  commands: EditorCommandOption[]
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
  commandCatalog?: EditorDeviceCommandCatalogEntry[]
  activeEdgeServerId?: string | null
  initialBindings?: WidgetBindingRecord[]
  initialCommandBindings?: CommandBindingRecord[]
  callbacks: HostedConstructorCallbacks
}

export interface HostedConstructorCatalogUpdateInput {
  machines: EditorMachineOption[]
  deviceCatalog: EditorDeviceMetricCatalogEntry[]
  commandCatalog?: EditorDeviceCommandCatalogEntry[]
}

export interface HostedConstructorInstance {
  loadLayout(layout: LayoutDocument): Promise<void>
  getLayout(): Promise<LayoutDocument>
  /**
   * @deprecated Use {@link loadBindingProfile} instead. This method loads only
   * telemetry (widgetBindings) and silently drops any existing commandBindings.
   */
  loadBindings(bindings: WidgetBindingRecord[]): Promise<void>
  /**
   * @deprecated Use {@link getBindingProfile} instead. This method returns only
   * telemetry (widgetBindings) and omits commandBindings entirely.
   */
  getBindings(): Promise<WidgetBindingRecord[]>
  loadBindingProfile(profile: DiagramBindingProfileRecord): Promise<void>
  getBindingProfile(): Promise<DiagramBindingProfileRecord>
  updateCatalog(input: HostedConstructorCatalogUpdateInput): void
  setActiveMachine(edgeServerId: string | null): void
  destroy(): Promise<void> | void
}

export interface HostedConstructorModule {
  createHostedConstructor(config: HostedConstructorConfig): Promise<HostedConstructorInstance>
}
