export type { AssignedEdgeServer as DashboardTrustedEdgeServer } from '@/shared/api/edgeServers'
import type {
  AlarmConditionType,
  AlarmExpectedValue,
  AlarmIncidentLifecycleState,
  AlarmIncidentProjection,
  AlarmObservedValue,
  AlarmRuleSnapshot,
  AlarmSeverity,
} from '@/shared/api/alarmIncidents'

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
export type DashboardCatalogLoadStatus = 'idle' | 'loading' | 'loaded' | 'error'

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
  start?: DashboardCanvasPoint
  end?: DashboardCanvasPoint
  from?: DashboardCanvasPoint
  to?: DashboardCanvasPoint
  points?: DashboardCanvasPoint[]
  direction?: string
  index?: number
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

export type DashboardCommandType = 'set_bool' | 'set_number'

export interface DashboardCommandBinding {
  widgetId: string
  deviceId: string
  commandType: DashboardCommandType
}

export type DashboardCommandValueType = 'boolean' | 'number' | 'string'

export interface DashboardCatalogTelemetryMetric {
  deviceId: string
  metric: string
  valueType?: DashboardCommandValueType
  label: string
}

export interface DashboardCommandCapability {
  deviceId: string
  commandType: DashboardCommandType
  valueType: 'boolean' | 'number'
  min?: number
  max?: number
  reportedMetric: string
  label: string
}

export interface DashboardCommandCatalog {
  edgeServerId: string
  telemetry: DashboardCatalogTelemetryMetric[]
  commands: DashboardCommandCapability[]
}

export interface DashboardBindingProfile {
  _id: string
  diagramId: string
  edgeServerId: string
  widgetBindings: DashboardWidgetBinding[]
  commandBindings: DashboardCommandBinding[]
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

export const DASHBOARD_ALARM_INCIDENT_CHANGED_EVENT = 'alarm_incident_changed' as const

export const DASHBOARD_ALARM_CONDITION_TYPES = ['high', 'low', 'state', 'connectivity'] as const
export type DashboardAlarmConditionType = AlarmConditionType

export const DASHBOARD_ALARM_SEVERITIES = ['warning', 'danger'] as const
export type DashboardAlarmSeverity = AlarmSeverity

export const DASHBOARD_ALARM_INCIDENT_LIFECYCLE_STATES = [
  'active_unacknowledged',
  'active_acknowledged',
  'cleared_unacknowledged',
  'closed',
] as const
export type DashboardAlarmIncidentLifecycleState = AlarmIncidentLifecycleState

export type DashboardAlarmObservedValue = AlarmObservedValue
export type DashboardAlarmExpectedValue = AlarmExpectedValue
export type DashboardAlarmRuleSnapshot = AlarmRuleSnapshot
export type DashboardAlarmIncidentProjection = AlarmIncidentProjection

export type DashboardAlarmIncidentList = DashboardAlarmIncidentProjection[]
export type DashboardAlarmAckPendingByIncidentId = Record<string, boolean>
export type DashboardAlarmAckErrorByIncidentId = Record<string, string>
export interface DashboardAlarmRedLightSummary {
  unclosedCount: number
  unclosedIncidents: DashboardAlarmIncidentList
  newestUnclosedIncident: DashboardAlarmIncidentProjection | null
}
export interface DashboardAlarmToastNotice {
  incidentId: string
  incident: DashboardAlarmIncidentProjection
}
export type DashboardAlarmJournalInitialLoadBlockedReason =
  'missing-cloud-incident-list-endpoint'
export interface DashboardAlarmJournalInitialLoadBlockedMarker {
  blocked: true
  reason: DashboardAlarmJournalInitialLoadBlockedReason
}

export interface DashboardAlarmIncidentChangedEvent {
  edgeId: string
  incident: DashboardAlarmIncidentProjection
}

export type DashboardMetricValueByBindingKey = Record<string, DashboardRuntimeValue>
export type DashboardMetricRevisionByBindingKey = Record<string, number>
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

export type DashboardCommandAvailabilityReason =
  | 'available'
  | 'missing-command-binding'
  | 'unsupported-widget-type'
  | 'incompatible-widget-command'
  | 'missing-catalog-command'
  | 'missing-reported-widget-binding'

export interface DashboardCommandRuntimeProjection {
  widgetId: string
  widgetType: string
  isExecutable: boolean
  reason: DashboardCommandAvailabilityReason
  commandType: DashboardCommandType | null
  commandBinding: DashboardCommandBinding | null
  reportedWidgetBinding: DashboardWidgetBinding | null
  catalogCommand: DashboardCommandCapability | null
}

export type DashboardCommandLifecycleStatus =
  | 'pending'
  | 'confirmed-waiting-telemetry'
  | 'timeout'
  | 'unavailable'
  | 'error'

export type DashboardCommandFailureKind =
  | 'cloud_rpc_timeout'
  | 'edge_command_timeout'
  | 'edge_command_failed'
  | 'edge_unavailable'
  | 'network_error'
  | 'unknown_error'

export interface DashboardCommandLifecycleState {
  status: DashboardCommandLifecycleStatus
  error: string | null
  failureKind?: DashboardCommandFailureKind
  reportedBindingKey?: string
  confirmedMetricRevision?: number
}

export type DashboardCommandLifecycleByWidgetId = Record<string, DashboardCommandLifecycleState>

export interface DashboardRuntimeProjection {
  metricValueByBindingKey: DashboardMetricValueByBindingKey
  widgetValueById: DashboardWidgetValueById
  widgets: DashboardWidgetRuntimeProjection[]
  commandAvailabilityByWidgetId: Record<string, DashboardCommandRuntimeProjection>
}
