export type { AssignedEdgeServer as DashboardTrustedEdgeServer } from '@/shared/api/edgeServers'

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
  | 'visual-rendering-error'
  | 'partial-visual-rendering'

export type DashboardTransportStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'failed'
export type DashboardEdgeAvailability = 'unknown' | 'online' | 'offline'

export interface DashboardWidget {
  id: string
  type: string
  imageId?: string
  x?: number
  y?: number
  width?: number
  height?: number
  relativeX?: number
  relativeY?: number
  fontSize?: number
  color?: string
  backgroundColor?: string
  borderColor?: string
  [key: string]: unknown
}

export interface DashboardSavedImage {
  imageId: string
  base64?: string
  x?: number
  y?: number
  width?: number
  height?: number
  scaleX?: number
  scaleY?: number
  [key: string]: unknown
}

export type DashboardConnectionPointSide = 'top' | 'right' | 'bottom' | 'left'

export interface DashboardConnectionPoint {
  id: string
  imageId: string
  side?: DashboardConnectionPointSide
  offset?: number
  [key: string]: unknown
}

export interface DashboardSavedConnectionSegment {
  x1?: number
  y1?: number
  x2?: number
  y2?: number
  [key: string]: unknown
}

export interface DashboardSavedConnection {
  id: string
  fromPinId: string
  toPinId: string
  segments?: DashboardSavedConnectionSegment[]
  userModified?: boolean
  [key: string]: unknown
}

export interface DashboardSavedLayoutDocument {
  images?: DashboardSavedImage[]
  connectionPoints?: DashboardConnectionPoint[]
  connections?: DashboardSavedConnection[]
  widgets?: DashboardWidget[]
  [key: string]: unknown
}

export interface DashboardLayoutDocument {
  images?: DashboardSavedImage[]
  connectionPoints?: DashboardConnectionPoint[]
  connections?: DashboardSavedConnection[]
  widgets?: DashboardWidget[]
  [key: string]: unknown
}

export interface DashboardDiagramBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
  width: number
  height: number
}

export type DashboardRenderIssueSeverity = 'blocking' | 'recoverable'

export interface DashboardRenderIssue {
  severity: DashboardRenderIssueSeverity
  kind: string
  message: string
  elementId: string | null
}

export interface DashboardCanvasPoint {
  x: number
  y: number
}

export type DashboardConnectionRenderSegmentSource = 'saved-segment' | 'connection-point'

export interface DashboardConnectionRenderSegment {
  connectionId: string
  from: DashboardCanvasPoint
  to: DashboardCanvasPoint
  source: DashboardConnectionRenderSegmentSource
  savedSegment?: DashboardSavedConnectionSegment
}

export interface DashboardRuntimeLayout {
  images: DashboardSavedImage[]
  runtimeRenderableImages: DashboardSavedImage[]
  connectionPoints: DashboardConnectionPoint[]
  runtimeRenderableConnectionPoints: DashboardConnectionPoint[]
  connections: DashboardSavedConnection[]
  widgets: DashboardWidget[]
  imageById: Map<string, DashboardSavedImage>
  runtimeRenderableImageById: Map<string, DashboardSavedImage>
  pointById: Map<string, DashboardConnectionPoint>
  runtimeRenderablePointById: Map<string, DashboardConnectionPoint>
  widgetById: Map<string, DashboardWidget>
  widgetIds: Set<string>
  runtimeRenderableWidgets: DashboardWidget[]
  connectionRenderSegments: DashboardConnectionRenderSegment[]
  diagramBounds: DashboardDiagramBounds
  renderIssues: DashboardRenderIssue[]
  hasBlockingIssues: boolean
  hasRecoverableIssues: boolean
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

export type DashboardRuntimeValue = number | string | boolean | null

export interface DashboardTelemetryReading {
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
export type DashboardWidgetRuntimeValueState = 'pending' | 'live'

export interface DashboardWidgetRuntimeProjection {
  widgetId: string
  widgetType: string
  isBound: boolean
  isSupported: boolean
  value: DashboardRuntimeValue
  visualValue: string
  valueState: DashboardWidgetRuntimeValueState
  unitLabel: string | null
}

export interface DashboardRuntimeProjection {
  metricValueByBindingKey: DashboardMetricValueByBindingKey
  widgetValueById: DashboardWidgetValueById
  widgets: DashboardWidgetRuntimeProjection[]
}
