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

export async function ackAlarmIncident(
  edgeId: string,
  incidentId: string,
): Promise<AlarmIncidentProjection> {
  const response = await apiClient.post<AckAlarmIncidentResponse>(
    `/edge-servers/${edgeId}/alarm-incidents/${incidentId}/ack`,
  )

  return response.incident
}
