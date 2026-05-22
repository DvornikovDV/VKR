import type { EdgeLifecycleState } from '@/shared/api/edgeServers'

export type EdgeAvailabilityLabel = 'Online' | 'Offline' | 'Unknown'
export type EdgeConsumerContextStatus = 'resolved' | 'unresolved'

interface EdgeGuidanceContext {
  contextStatus?: EdgeConsumerContextStatus
  edgeName?: string
  lifecycleState?: EdgeLifecycleState
  availabilityLabel?: EdgeAvailabilityLabel
}

export function getEdgeAvailabilityLabel(online: boolean | null | undefined): EdgeAvailabilityLabel {
  if (online === true) {
    return 'Online'
  }

  if (online === false) {
    return 'Offline'
  }

  return 'Unknown'
}

export function getEdgeAvailabilityDisplayLabel(label: EdgeAvailabilityLabel): string {
  switch (label) {
    case 'Online':
      return 'В сети'
    case 'Offline':
      return 'Не в сети'
    case 'Unknown':
      return 'Неизвестно'
  }
}

export function getEdgeAvailabilityBadgeClass(online: boolean | null | undefined): string {
  if (online === true) {
    return 'rounded-full bg-[var(--color-online)]/10 px-2 py-1 text-xs text-[var(--color-online)]'
  }

  if (online === false) {
    return 'rounded-full bg-[var(--color-offline)]/10 px-2 py-1 text-xs text-[var(--color-offline)]'
  }

  return 'rounded-full bg-[#94a3b8]/10 px-2 py-1 text-xs text-[#94a3b8]'
}

export function getEdgeLifecycleDisplayLabel(lifecycleState: EdgeLifecycleState | undefined): string {
  if (lifecycleState === 'Active') {
    return 'Активен'
  }

  if (lifecycleState === 'Blocked') {
    return 'Заблокирован'
  }

  return 'Неизвестно'
}

export function getEdgeLifecycleBadgeClass(lifecycleState: EdgeLifecycleState | undefined): string {
  if (lifecycleState === 'Blocked') {
    return 'rounded-full bg-[var(--color-danger)]/10 px-2 py-1 text-xs text-[var(--color-danger)]'
  }

  return 'rounded-full bg-[var(--color-online)]/10 px-2 py-1 text-xs text-[var(--color-online)]'
}

export function formatEdgeMachineLabel(
  edgeName: string,
  lifecycleState: EdgeLifecycleState,
  availabilityLabel: EdgeAvailabilityLabel,
): string {
  return `${edgeName} (${getEdgeLifecycleDisplayLabel(lifecycleState)}, ${getEdgeAvailabilityDisplayLabel(availabilityLabel)})`
}

export function canOpenDashboardForEdge(lifecycleState: EdgeLifecycleState | undefined): boolean {
  return lifecycleState === 'Active'
}

export function canOpenDashboardForEdgeContext(context: EdgeGuidanceContext): boolean {
  return context.contextStatus !== 'resolved' || context.lifecycleState !== 'Blocked'
}

export function getDashboardUnavailableReason(context: EdgeGuidanceContext): string | null {
  if (context.lifecycleState === 'Blocked') {
    return 'Переход в диспетчеризацию недоступен, пока объект заблокирован.'
  }

  return null
}

export function getDashboardHandoffNote(context: EdgeGuidanceContext): string | null {
  if (context.contextStatus === 'unresolved') {
    return 'Статус объекта временно недоступен. Переход в диспетчеризацию остается доступным.'
  }

  return getDashboardUnavailableReason(context)
}

export function getConstructorEdgeGuidance(
  context: EdgeGuidanceContext,
  hasCatalogEntries: boolean,
): string | null {
  const edgeName = context.edgeName ?? 'Выбранный объект'

  if (context.lifecycleState === 'Blocked') {
    return `Выбранный объект сейчас заблокирован (${edgeName}). Мониторинг и переход в диспетчеризацию будут недоступны, пока администратор не разблокирует объект.`
  }

  if (!hasCatalogEntries) {
    return `У выбранного объекта пока нет каталога телеметрии (${edgeName}). Продолжайте работу со схемой и вернитесь к привязкам после поступления телеметрии.`
  }

  return null
}
