import type {
  DashboardAlarmIncidentLifecycleState,
  DashboardAlarmIncidentProjection,
} from '@/features/dashboard/model/types'

const lifecycleLabels: Record<DashboardAlarmIncidentLifecycleState, string> = {
  active_unacknowledged: 'Active Unacknowledged',
  active_acknowledged: 'Active Acknowledged',
  cleared_unacknowledged: 'Cleared Unacknowledged',
  closed: 'Closed',
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

export function upsertDashboardAlarmIncident(
  incidents: readonly DashboardAlarmIncidentProjection[],
  incident: DashboardAlarmIncidentProjection,
): DashboardAlarmIncidentProjection[] {
  const nextIncidents = incidents.filter((existing) => existing.incidentId !== incident.incidentId)
  nextIncidents.push(incident)

  return sortDashboardAlarmIncidents(nextIncidents)
}
