export type DashboardSelectionSource = 'route-prefill' | 'user-selection' | 'recovery-reset'

export interface DashboardRouteState {
  diagramId: string | null
  edgeId: string | null
  selectionSource: DashboardSelectionSource
}

export type DashboardRecoveryState =
  | 'empty'
  | 'loading'
  | 'ready'
  | 'generic-error'
  | 'invalid-selection'
  | 'missing-binding-profile'
  | 'invalid-binding-profile'

export type DashboardTransportStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'failed'
export type DashboardEdgeAvailability = 'unknown' | 'online' | 'offline'

export interface DashboardWidget {
  id: string
  type: string
  [key: string]: unknown
}

export interface DashboardLayoutDocument {
  widgets?: DashboardWidget[]
  [key: string]: unknown
}

export interface DashboardDiagramSummary {
  _id: string
  name: string
  layout: DashboardLayoutDocument
  __v?: number
  createdAt?: string
  updatedAt?: string
}

export type DashboardDiagramDocument = DashboardDiagramSummary

export interface DashboardWidgetBinding {
  widgetId: string
  deviceId: string
  metric: string
}

export interface DashboardBindingProfile {
  _id: string
  diagramId: string
  edgeServerId: string
  widgetBindings: DashboardWidgetBinding[]
  createdAt?: string
  updatedAt?: string
}

export interface DashboardTrustedEdgeServer {
  _id: string
  name: string
  isActive?: boolean
  lastSeen?: string | null
}

export type DashboardRuntimeValue = number | string | boolean | null

export interface DashboardTelemetryReading {
  sourceId: string
  deviceId: string
  metric: string
  last: DashboardRuntimeValue
  ts: number
}

export interface DashboardTelemetryEvent {
  edgeId: string
  readings: DashboardTelemetryReading[]
  serverTs: number
}

export interface DashboardEdgeStatusEvent {
  edgeId: string
  online: boolean
}

export interface DashboardSubscribedEvent {
  edgeId: string
}

export type DashboardMetricValueByBindingKey = Record<string, DashboardRuntimeValue>
export type DashboardWidgetValueById = Record<string, DashboardRuntimeValue>

export interface DashboardWidgetRuntimeProjection {
  widgetId: string
  widgetType: string
  isBound: boolean
  isSupported: boolean
  value: DashboardRuntimeValue
}

export interface DashboardRuntimeProjection {
  metricValueByBindingKey: DashboardMetricValueByBindingKey
  widgetValueById: DashboardWidgetValueById
  widgets: DashboardWidgetRuntimeProjection[]
}
