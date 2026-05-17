import type {
  AlarmConditionType,
  AlarmIncidentListOrder,
  AlarmIncidentListResponse,
  AlarmIncidentListSort,
  AlarmIncidentListState,
  AlarmIncidentProjection,
  AlarmSeverity,
  ListAlarmIncidentsQuery,
} from '@/shared/api/alarmIncidents'

export const DISPATCH_ALARM_JOURNAL_DEFAULT_QUERY = {
  state: 'unclosed',
  page: 1,
  limit: 50,
  sort: 'latest',
  order: 'desc',
} as const satisfies Required<ListAlarmIncidentsQuery>

export const DISPATCH_ALARM_JOURNAL_STATE_OPTIONS = [
  { value: 'unclosed', label: 'Unclosed' },
  { value: 'all', label: 'All incidents' },
] as const satisfies readonly DispatchAlarmJournalStateOption[]

export type DispatchAlarmJournalLoadStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error'

export interface DispatchAlarmJournalLoadState {
  status: DispatchAlarmJournalLoadStatus
  error: string | null
}

export interface DispatchAlarmJournalStateOption {
  value: AlarmIncidentListState
  label: string
}

export interface DispatchAlarmJournalRequestDescriptor {
  edgeId: string
  state: AlarmIncidentListState
  page: number
  limit: number
  sort: AlarmIncidentListSort
  order: AlarmIncidentListOrder
}

export interface DispatchAlarmJournalRequestGuard {
  requestId: number
  key: string
}

export interface DispatchAlarmJournalPaginationState {
  page: number
  limit: number
  total: number
  hasNextPage: boolean
}

export interface DispatchAlarmJournalDisplayTimestamps {
  activatedAt: string
  clearedAt: string | null
  acknowledgedAt: string | null
  closedAt: string | null
}

export interface DispatchAlarmJournalDisplayRow {
  incident: AlarmIncidentProjection
  ruleTitle: string
  equipmentIdentity: string
  conditionSummary: string
  severity: AlarmIncidentProjection['rule']['severity']
  lifecycleLabel: string
  timestamps: DispatchAlarmJournalDisplayTimestamps
}

const DISPATCH_ALARM_JOURNAL_LIFECYCLE_LABELS: Record<
  AlarmIncidentProjection['lifecycleState'],
  string
> = {
  active_unacknowledged: 'Active unacknowledged',
  active_acknowledged: 'Active acknowledged',
  cleared_unacknowledged: 'Cleared unacknowledged',
  closed: 'Closed',
}

const DISPATCH_ALARM_JOURNAL_SEVERITY_LABELS: Record<AlarmSeverity, string> = {
  warning: 'Warning',
  danger: 'Danger',
}

const DISPATCH_ALARM_JOURNAL_CONDITION_LABELS: Record<AlarmConditionType, string> = {
  high: 'High condition',
  low: 'Low condition',
  state: 'State condition',
  connectivity: 'Connectivity condition',
}

function parseDispatchAlarmJournalTimeMs(value: string | number | null | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

function formatDispatchAlarmJournalValue(
  value: string | number | boolean | null | undefined,
): string {
  if (value === null || value === undefined) {
    return 'not configured'
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false'
  }

  return String(value)
}

export function createDispatchAlarmJournalQuery(
  query: Partial<ListAlarmIncidentsQuery> = {},
): Required<ListAlarmIncidentsQuery> {
  return {
    ...DISPATCH_ALARM_JOURNAL_DEFAULT_QUERY,
    ...query,
  }
}

export function createDispatchAlarmJournalRequestDescriptor(
  edgeId: string,
  query: Partial<ListAlarmIncidentsQuery> = {},
): DispatchAlarmJournalRequestDescriptor {
  return {
    edgeId,
    ...createDispatchAlarmJournalQuery(query),
  }
}

export function createDispatchAlarmJournalRequestKey(
  descriptor: DispatchAlarmJournalRequestDescriptor,
): string {
  return [
    descriptor.edgeId,
    descriptor.state,
    String(descriptor.page),
    String(descriptor.limit),
    descriptor.sort,
    descriptor.order,
  ].join('\u001f')
}

export function createDispatchAlarmJournalRequestGuard(
  requestId: number,
  descriptor: DispatchAlarmJournalRequestDescriptor,
): DispatchAlarmJournalRequestGuard {
  return {
    requestId,
    key: createDispatchAlarmJournalRequestKey(descriptor),
  }
}

export function isDispatchAlarmJournalRequestCurrent(
  activeGuard: DispatchAlarmJournalRequestGuard | null,
  responseGuard: DispatchAlarmJournalRequestGuard,
): boolean {
  return activeGuard?.requestId === responseGuard.requestId && activeGuard.key === responseGuard.key
}

export function createDispatchAlarmJournalPaginationState(
  response: Pick<AlarmIncidentListResponse, 'page' | 'limit' | 'total' | 'hasNextPage'>,
): DispatchAlarmJournalPaginationState {
  return {
    page: response.page,
    limit: response.limit,
    total: response.total,
    hasNextPage: response.hasNextPage,
  }
}

export function canDispatchAlarmJournalGoToPreviousPage(
  pagination: Pick<DispatchAlarmJournalPaginationState, 'page'>,
): boolean {
  return pagination.page > 1
}

export function canDispatchAlarmJournalGoToNextPage(
  pagination: Pick<DispatchAlarmJournalPaginationState, 'hasNextPage'>,
): boolean {
  return pagination.hasNextPage
}

export function getDispatchAlarmJournalPreviousPage(
  pagination: Pick<DispatchAlarmJournalPaginationState, 'page'>,
): number {
  return Math.max(1, pagination.page - 1)
}

export function getDispatchAlarmJournalNextPage(
  pagination: Pick<DispatchAlarmJournalPaginationState, 'page' | 'hasNextPage'>,
): number {
  return pagination.hasNextPage ? pagination.page + 1 : pagination.page
}

export function formatDispatchAlarmJournalTimestamp(
  value: string | number | null | undefined,
  locale?: string,
): string | null {
  const timeMs = parseDispatchAlarmJournalTimeMs(value)
  if (timeMs === null) {
    return null
  }

  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(timeMs))
}

export function getDispatchAlarmJournalSeverityLabel(severity: AlarmSeverity): string {
  return DISPATCH_ALARM_JOURNAL_SEVERITY_LABELS[severity]
}

export function getDispatchAlarmJournalLifecycleLabel(
  incident: Pick<AlarmIncidentProjection, 'isActive' | 'isAcknowledged'>,
): string {
  if (incident.isActive && !incident.isAcknowledged) {
    return DISPATCH_ALARM_JOURNAL_LIFECYCLE_LABELS.active_unacknowledged
  }

  if (incident.isActive && incident.isAcknowledged) {
    return DISPATCH_ALARM_JOURNAL_LIFECYCLE_LABELS.active_acknowledged
  }

  if (!incident.isActive && !incident.isAcknowledged) {
    return DISPATCH_ALARM_JOURNAL_LIFECYCLE_LABELS.cleared_unacknowledged
  }

  return DISPATCH_ALARM_JOURNAL_LIFECYCLE_LABELS.closed
}

export function getDispatchAlarmJournalRuleTitle(
  incident: Pick<AlarmIncidentProjection, 'ruleId' | 'rule'>,
): string {
  const ruleLabel = incident.rule.label.trim()
  if (ruleLabel.length > 0) {
    return ruleLabel
  }

  const ruleId = incident.ruleId.trim()
  return ruleId.length > 0 ? ruleId : 'Untitled alarm rule'
}

export function getDispatchAlarmJournalEquipmentIdentity(
  incident: Pick<AlarmIncidentProjection, 'deviceId' | 'metric'>,
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

export function getDispatchAlarmJournalConditionSummary(
  incident: Pick<AlarmIncidentProjection, 'latestValue' | 'rule'>,
): string {
  const conditionLabel = DISPATCH_ALARM_JOURNAL_CONDITION_LABELS[incident.rule.conditionType]
  const latestValue = formatDispatchAlarmJournalValue(incident.latestValue)
  const triggerThreshold = formatDispatchAlarmJournalValue(incident.rule.triggerThreshold)
  const clearThreshold = formatDispatchAlarmJournalValue(incident.rule.clearThreshold)
  const expectedValue = formatDispatchAlarmJournalValue(incident.rule.expectedValue)

  if (incident.rule.conditionType === 'high' || incident.rule.conditionType === 'low') {
    return `${conditionLabel}: latest ${latestValue}; trigger ${triggerThreshold}; clear ${clearThreshold}`
  }

  return `${conditionLabel}: latest ${latestValue}; expected ${expectedValue}`
}

export function getDispatchAlarmJournalClosedAt(
  incident: Pick<
    AlarmIncidentProjection,
    'isActive' | 'isAcknowledged' | 'clearedAt' | 'acknowledgedAt'
  >,
): string | null {
  if (incident.isActive || !incident.isAcknowledged) {
    return null
  }

  const closedAtMs = [
    parseDispatchAlarmJournalTimeMs(incident.clearedAt),
    parseDispatchAlarmJournalTimeMs(incident.acknowledgedAt),
  ].filter((value): value is number => value !== null)

  return closedAtMs.length > 0
    ? formatDispatchAlarmJournalTimestamp(Math.max(...closedAtMs))
    : null
}

export function getDispatchAlarmJournalTimestamps(
  incident: Pick<
    AlarmIncidentProjection,
    'activatedAt' | 'clearedAt' | 'acknowledgedAt' | 'isActive' | 'isAcknowledged'
  >,
): DispatchAlarmJournalDisplayTimestamps {
  return {
    activatedAt: formatDispatchAlarmJournalTimestamp(incident.activatedAt) ?? 'Time unavailable',
    clearedAt: formatDispatchAlarmJournalTimestamp(incident.clearedAt),
    acknowledgedAt: formatDispatchAlarmJournalTimestamp(incident.acknowledgedAt),
    closedAt: getDispatchAlarmJournalClosedAt(incident),
  }
}

export function createDispatchAlarmJournalDisplayRow(
  incident: AlarmIncidentProjection,
): DispatchAlarmJournalDisplayRow {
  return {
    incident,
    ruleTitle: getDispatchAlarmJournalRuleTitle(incident),
    equipmentIdentity: getDispatchAlarmJournalEquipmentIdentity(incident),
    conditionSummary: getDispatchAlarmJournalConditionSummary(incident),
    severity: incident.rule.severity,
    lifecycleLabel: getDispatchAlarmJournalLifecycleLabel(incident),
    timestamps: getDispatchAlarmJournalTimestamps(incident),
  }
}
