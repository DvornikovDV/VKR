import { apiClient } from '@/shared/api/client'

export type AlarmConditionType = 'high' | 'low' | 'state' | 'connectivity'
export type AlarmSeverity = 'warning' | 'danger'
export type AlarmIncidentLifecycleState =
  | 'active_unacknowledged'
  | 'active_acknowledged'
  | 'cleared_unacknowledged'
  | 'closed'

export type AlarmObservedValue = number | boolean
export type AlarmExpectedValue = AlarmObservedValue | null

export interface AlarmRuleSnapshot {
  ruleId: string
  ruleRevision: string
  conditionType: AlarmConditionType
  triggerThreshold: number | null
  clearThreshold: number | null
  expectedValue: AlarmExpectedValue
  severity: AlarmSeverity
  label: string
}

export interface AlarmIncidentProjection {
  incidentId: string
  edgeId: string
  sourceId: string
  deviceId: string
  metric: string
  ruleId: string
  lifecycleState: AlarmIncidentLifecycleState
  isActive: boolean
  isAcknowledged: boolean
  activatedAt: string
  clearedAt: string | null
  acknowledgedAt: string | null
  acknowledgedBy: string | null
  latestValue: AlarmObservedValue
  latestTs: number
  latestDetectedAt: number
  rule: AlarmRuleSnapshot
  createdAt: string
  updatedAt: string
}

export interface AckAlarmIncidentResponse {
  incident: AlarmIncidentProjection
}

export type AlarmIncidentListState = 'unclosed' | 'all'
export type AlarmIncidentListSort = 'latest'
export type AlarmIncidentListOrder = 'desc' | 'asc'

export interface ListAlarmIncidentsQuery {
  state?: AlarmIncidentListState
  page?: number
  limit?: number
  sort?: AlarmIncidentListSort
  order?: AlarmIncidentListOrder
}

export interface AlarmIncidentListResponse {
  incidents: AlarmIncidentProjection[]
  page: number
  limit: number
  total: number
  hasNextPage: boolean
}

const DEFAULT_LIST_ALARM_INCIDENTS_QUERY = {
  state: 'unclosed',
  page: 1,
  limit: 50,
  sort: 'latest',
  order: 'desc',
} as const satisfies Required<ListAlarmIncidentsQuery>

function buildAlarmIncidentListQuery(query: ListAlarmIncidentsQuery = {}): string {
  const mergedQuery = {
    ...DEFAULT_LIST_ALARM_INCIDENTS_QUERY,
    ...query,
  }
  const params = new URLSearchParams()

  params.set('state', mergedQuery.state)
  params.set('page', String(mergedQuery.page))
  params.set('limit', String(mergedQuery.limit))
  params.set('sort', mergedQuery.sort)
  params.set('order', mergedQuery.order)

  return params.toString()
}

export async function listAlarmIncidents(
  edgeId: string,
  query?: ListAlarmIncidentsQuery,
): Promise<AlarmIncidentListResponse> {
  const queryString = buildAlarmIncidentListQuery(query)

  return apiClient.get<AlarmIncidentListResponse>(
    `/edge-servers/${edgeId}/alarm-incidents?${queryString}`,
  )
}

export async function ackAlarmIncident(
  edgeId: string,
  incidentId: string,
): Promise<AlarmIncidentProjection> {
  const response = await apiClient.post<AckAlarmIncidentResponse>(
    `/edge-servers/${edgeId}/alarm-incidents/${incidentId}/ack`,
  )

  return response.incident
}
