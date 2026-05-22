import {
  COMMAND_AUDIT_LIST_STATUSES,
  type CommandAuditProjection,
  type CommandAuditStatus,
  type EdgeCommandFailureReason,
} from '@/shared/api/commands'

export type DispatchCommandAuditStatusFilter = 'all' | CommandAuditStatus

export interface DispatchCommandAuditStatusOption {
  value: DispatchCommandAuditStatusFilter
  label: string
}

export interface DispatchCommandAuditRequestDescriptor {
  edgeId: string
  page: number
  limit: number
  status?: CommandAuditStatus
}

export interface DispatchCommandAuditRequestGuard {
  requestId: number
  key: string
}

const COMMAND_AUDIT_STATUS_LABELS: Record<CommandAuditStatus, string> = {
  accepted: 'Принята',
  sent_to_edge: 'Отправлена на объект',
  confirmed: 'Подтверждена',
  timeout: 'Тайм-аут',
  failed: 'Ошибка',
}

const COMMAND_AUDIT_FAILURE_REASON_LABELS: Record<EdgeCommandFailureReason, string> = {
  cloud_rpc_timeout: 'Тайм-аут RPC в облаке',
  edge_command_timeout: 'Тайм-аут команды на объекте',
  edge_command_failed: 'Команда на объекте завершилась ошибкой',
  edge_unavailable: 'Объект недоступен',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export const DISPATCH_COMMAND_AUDIT_STATUS_OPTIONS: readonly DispatchCommandAuditStatusOption[] = [
  { value: 'all', label: 'Все статусы' },
  ...COMMAND_AUDIT_LIST_STATUSES.map((status) => ({
    value: status,
    label: COMMAND_AUDIT_STATUS_LABELS[status],
  })),
]

export function getDispatchCommandAuditStatusLabel(status: CommandAuditStatus): string {
  return COMMAND_AUDIT_STATUS_LABELS[status]
}

export function getDispatchCommandAuditFailureReasonLabel(
  failureReason: EdgeCommandFailureReason | null,
): string {
  return failureReason ? COMMAND_AUDIT_FAILURE_REASON_LABELS[failureReason] : '-'
}

export function formatDispatchCommandAuditTimestamp(value: string | null, locale?: string): string {
  if (!value) {
    return '-'
  }

  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) {
    return value
  }

  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(timestamp))
}

export function formatDispatchCommandAuditPayload(
  payload: CommandAuditProjection['payload'] | unknown,
): string {
  if (payload === null || payload === undefined) {
    return '-'
  }

  if (typeof payload === 'string' || typeof payload === 'number' || typeof payload === 'boolean') {
    return String(payload)
  }

  if (isRecord(payload) && 'value' in payload) {
    return formatDispatchCommandAuditPayload(payload.value)
  }

  try {
    return JSON.stringify(payload)
  } catch {
    return String(payload)
  }
}

export function createDispatchCommandAuditRequestKey(
  descriptor: DispatchCommandAuditRequestDescriptor,
): string {
  return JSON.stringify([
    descriptor.edgeId,
    descriptor.page,
    descriptor.limit,
    descriptor.status ?? 'all',
  ])
}

export function createDispatchCommandAuditRequestGuard(
  requestId: number,
  descriptor: DispatchCommandAuditRequestDescriptor,
): DispatchCommandAuditRequestGuard {
  return {
    requestId,
    key: createDispatchCommandAuditRequestKey(descriptor),
  }
}

export function isDispatchCommandAuditRequestCurrent(
  activeGuard: DispatchCommandAuditRequestGuard | null,
  responseGuard: DispatchCommandAuditRequestGuard,
): boolean {
  return activeGuard?.requestId === responseGuard.requestId && activeGuard.key === responseGuard.key
}
