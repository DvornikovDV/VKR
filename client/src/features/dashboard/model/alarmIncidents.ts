import type {
  DashboardAlarmIncidentList,
  DashboardAlarmIncidentLifecycleState,
  DashboardAlarmIncidentProjection,
  DashboardAlarmRedLightSummary,
} from '@/features/dashboard/model/types'

const lifecycleLabels: Record<DashboardAlarmIncidentLifecycleState, string> = {
  active_unacknowledged: 'Active Unacknowledged',
  active_acknowledged: 'Active Acknowledged',
  cleared_unacknowledged: 'Cleared Unacknowledged',
  closed: 'Closed',
}

interface DashboardAlarmIncidentLifecycleTimestamps {
  activatedAt: string
  clearedAt: string | null
  acknowledgedAt: string | null
  closedAt: string | null
}

interface DashboardAlarmIncidentDisplayDetails {
  ruleTitle: string
  equipmentIdentity: string
  conditionSummary: string
  lifecycleLabel: string
  latestRowTime: string | null
  lifecycleTimestamps: DashboardAlarmIncidentLifecycleTimestamps
  secondaryDetails: string[]
}

function parseTimeMs(value: string | number | null | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

function formatTimeValue(value: string | number | null | undefined): string | null {
  const timeMs = parseTimeMs(value)
  return timeMs === null ? null : new Date(timeMs).toISOString()
}

function formatAlarmValue(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) {
    return 'not configured'
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false'
  }

  return String(value)
}

function getComputedClosedAt(
  incident: Pick<
    DashboardAlarmIncidentProjection,
    'isActive' | 'isAcknowledged' | 'clearedAt' | 'acknowledgedAt'
  >,
): string | null {
  if (incident.isActive || !incident.isAcknowledged) {
    return null
  }

  const closedAtMs = [
    parseTimeMs(incident.clearedAt),
    parseTimeMs(incident.acknowledgedAt),
  ].filter((value): value is number => value !== null)

  return closedAtMs.length > 0 ? new Date(Math.max(...closedAtMs)).toISOString() : null
}

export function getDashboardAlarmIncidentLifecycleState(
  incident: Pick<DashboardAlarmIncidentProjection, 'isActive' | 'isAcknowledged'>,
): DashboardAlarmIncidentLifecycleState {
  if (incident.isActive && !incident.isAcknowledged) {
    return 'active_unacknowledged'
  }

  if (incident.isActive && incident.isAcknowledged) {
    return 'active_acknowledged'
  }

  if (!incident.isActive && !incident.isAcknowledged) {
    return 'cleared_unacknowledged'
  }

  return 'closed'
}

export function getDashboardAlarmIncidentLifecycleLabel(
  incident: Pick<DashboardAlarmIncidentProjection, 'isActive' | 'isAcknowledged'>,
): string {
  return lifecycleLabels[getDashboardAlarmIncidentLifecycleState(incident)]
}

export function getDashboardAlarmIncidentRuleTitle(
  incident: Pick<DashboardAlarmIncidentProjection, 'ruleId' | 'rule'>,
): string {
  const ruleLabel = incident.rule.label.trim()
  if (ruleLabel.length > 0) {
    return ruleLabel
  }

  const ruleId = incident.ruleId.trim()
  return ruleId.length > 0 ? ruleId : 'Untitled alarm rule'
}

export function isDashboardAlarmIncidentUnclosed(
  incident: Pick<DashboardAlarmIncidentProjection, 'isActive' | 'isAcknowledged'>,
): boolean {
  return incident.isActive || !incident.isAcknowledged
}

export function getDashboardAlarmIncidentIdentityLabel(
  incident: Pick<DashboardAlarmIncidentProjection, 'deviceId' | 'metric' | 'ruleId' | 'rule'>,
): string {
  const ruleLabel = incident.rule.label.trim()
  if (ruleLabel.length > 0) {
    return ruleLabel
  }

  const metricIdentity = `${incident.deviceId}.${incident.metric}`
  return incident.ruleId.trim().length > 0
    ? `${metricIdentity} (${incident.ruleId})`
    : metricIdentity
}

export function getDashboardAlarmIncidentEquipmentIdentityLabel(
  incident: Pick<DashboardAlarmIncidentProjection, 'deviceId' | 'metric'>,
): string {
  const deviceId = incident.deviceId.trim()
  const metric = incident.metric.trim()

  if (deviceId.length > 0 && metric.length > 0) {
    return `${deviceId} / ${metric}`
  }

  if (deviceId.length > 0) {
    return `${deviceId} / unknown metric`
  }

  if (metric.length > 0) {
    return `unknown device / ${metric}`
  }

  return 'unknown device / unknown metric'
}

export function getDashboardAlarmIncidentConditionSummary(
  incident: Pick<DashboardAlarmIncidentProjection, 'latestValue' | 'rule'>,
): string {
  const latestValue = formatAlarmValue(incident.latestValue)
  const triggerThreshold = formatAlarmValue(incident.rule.triggerThreshold)
  const clearThreshold = formatAlarmValue(incident.rule.clearThreshold)
  const expectedValue = formatAlarmValue(incident.rule.expectedValue)

  switch (incident.rule.conditionType) {
    case 'high':
      return `High condition: latest ${latestValue}; trigger ${triggerThreshold}; clear ${clearThreshold}`
    case 'low':
      return `Low condition: latest ${latestValue}; trigger ${triggerThreshold}; clear ${clearThreshold}`
    case 'state':
      return `State condition: latest ${latestValue}; expected ${expectedValue}`
    case 'connectivity':
      return `Connectivity condition: latest ${latestValue}; expected ${expectedValue}`
    default:
      return `Condition: latest ${latestValue}`
  }
}

export function getDashboardAlarmIncidentRowTimeMs(
  incident: Pick<
    DashboardAlarmIncidentProjection,
    'activatedAt' | 'clearedAt' | 'acknowledgedAt' | 'latestDetectedAt' | 'updatedAt'
  >,
): number {
  const candidates = [
    parseTimeMs(incident.updatedAt),
    parseTimeMs(incident.acknowledgedAt),
    parseTimeMs(incident.clearedAt),
    parseTimeMs(incident.latestDetectedAt),
    parseTimeMs(incident.activatedAt),
  ].filter((value): value is number => value !== null)

  return candidates.length > 0 ? Math.max(...candidates) : 0
}

export function getDashboardAlarmIncidentRowTime(
  incident: Pick<
    DashboardAlarmIncidentProjection,
    'activatedAt' | 'clearedAt' | 'acknowledgedAt' | 'latestDetectedAt' | 'updatedAt'
  >,
): string | null {
  const timeMs = getDashboardAlarmIncidentRowTimeMs(incident)
  return timeMs > 0 ? new Date(timeMs).toISOString() : null
}

export function getDashboardAlarmIncidentLifecycleTimestamps(
  incident: Pick<
    DashboardAlarmIncidentProjection,
    'activatedAt' | 'clearedAt' | 'acknowledgedAt' | 'isActive' | 'isAcknowledged'
  >,
): DashboardAlarmIncidentLifecycleTimestamps {
  return {
    activatedAt: formatTimeValue(incident.activatedAt) ?? 'Time unavailable',
    clearedAt: formatTimeValue(incident.clearedAt),
    acknowledgedAt: formatTimeValue(incident.acknowledgedAt),
    closedAt: getComputedClosedAt(incident),
  }
}

export function getDashboardAlarmIncidentSecondaryDetails(
  incident: Pick<
    DashboardAlarmIncidentProjection,
    'sourceId' | 'ruleId' | 'latestTs' | 'latestDetectedAt'
  >,
): string[] {
  return [
    `Source ${incident.sourceId}`,
    `Rule ${incident.ruleId}`,
    `Latest detected ${formatTimeValue(incident.latestDetectedAt) ?? 'Time unavailable'}`,
    `Latest sample ${formatTimeValue(incident.latestTs) ?? 'Time unavailable'}`,
  ]
}

export function getDashboardAlarmIncidentDisplayDetails(
  incident: DashboardAlarmIncidentProjection,
): DashboardAlarmIncidentDisplayDetails {
  return {
    ruleTitle: getDashboardAlarmIncidentRuleTitle(incident),
    equipmentIdentity: getDashboardAlarmIncidentEquipmentIdentityLabel(incident),
    conditionSummary: getDashboardAlarmIncidentConditionSummary(incident),
    lifecycleLabel: getDashboardAlarmIncidentLifecycleLabel(incident),
    latestRowTime: getDashboardAlarmIncidentRowTime(incident),
    lifecycleTimestamps: getDashboardAlarmIncidentLifecycleTimestamps(incident),
    secondaryDetails: getDashboardAlarmIncidentSecondaryDetails(incident),
  }
}

export function compareDashboardAlarmIncidentRows(
  left: DashboardAlarmIncidentProjection,
  right: DashboardAlarmIncidentProjection,
): number {
  const timeDelta =
    getDashboardAlarmIncidentRowTimeMs(right) - getDashboardAlarmIncidentRowTimeMs(left)

  return timeDelta !== 0 ? timeDelta : left.incidentId.localeCompare(right.incidentId)
}

export function sortDashboardAlarmIncidents(
  incidents: readonly DashboardAlarmIncidentProjection[],
): DashboardAlarmIncidentProjection[] {
  return [...incidents].sort(compareDashboardAlarmIncidentRows)
}

export function selectDashboardUnclosedAlarmIncidents(
  incidents: readonly DashboardAlarmIncidentProjection[],
): DashboardAlarmIncidentList {
  return sortDashboardAlarmIncidents(incidents.filter(isDashboardAlarmIncidentUnclosed))
}

export function countDashboardUnclosedAlarmIncidents(
  incidents: readonly DashboardAlarmIncidentProjection[],
): number {
  return incidents.filter(isDashboardAlarmIncidentUnclosed).length
}

export function selectNewestDashboardUnclosedAlarmIncident(
  incidents: readonly DashboardAlarmIncidentProjection[],
): DashboardAlarmIncidentProjection | null {
  return selectDashboardUnclosedAlarmIncidents(incidents)[0] ?? null
}

export function selectDashboardAlarmRedLightSummary(
  incidents: readonly DashboardAlarmIncidentProjection[],
): DashboardAlarmRedLightSummary {
  const unclosedIncidents = selectDashboardUnclosedAlarmIncidents(incidents)

  return {
    unclosedCount: unclosedIncidents.length,
    unclosedIncidents,
    newestUnclosedIncident: unclosedIncidents[0] ?? null,
  }
}

export function upsertDashboardAlarmIncident(
  incidents: readonly DashboardAlarmIncidentProjection[],
  incident: DashboardAlarmIncidentProjection,
): DashboardAlarmIncidentProjection[] {
  const nextIncidents = incidents.filter((existing) => existing.incidentId !== incident.incidentId)
  nextIncidents.push(incident)

  return sortDashboardAlarmIncidents(nextIncidents)
}
