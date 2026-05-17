import type {
  AlarmIncidentListOrder,
  AlarmIncidentListResponse,
  AlarmIncidentListSort,
  AlarmIncidentListState,
  AlarmIncidentProjection,
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
