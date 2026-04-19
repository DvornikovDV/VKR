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

export function getEdgeAvailabilityBadgeClass(online: boolean | null | undefined): string {
  if (online === true) {
    return 'rounded-full bg-[var(--color-online)]/10 px-2 py-1 text-xs text-[var(--color-online)]'
  }

  if (online === false) {
    return 'rounded-full bg-[var(--color-offline)]/10 px-2 py-1 text-xs text-[var(--color-offline)]'
  }

  return 'rounded-full bg-[#94a3b8]/10 px-2 py-1 text-xs text-[#94a3b8]'
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
  return `${edgeName} (${lifecycleState}, ${availabilityLabel})`
}

export function canOpenDashboardForEdge(lifecycleState: EdgeLifecycleState | undefined): boolean {
  return lifecycleState === 'Active'
}

export function canOpenDashboardForEdgeContext(context: EdgeGuidanceContext): boolean {
  return context.contextStatus !== 'resolved' || context.lifecycleState !== 'Blocked'
}

export function getDashboardUnavailableReason(context: EdgeGuidanceContext): string | null {
  if (context.lifecycleState === 'Blocked') {
    return 'Native Dashboard handoff is unavailable while this edge is blocked.'
  }

  return null
}

export function getDashboardHandoffNote(context: EdgeGuidanceContext): string | null {
  if (context.contextStatus === 'unresolved') {
    return 'Edge lifecycle status is temporarily unavailable. Native Dashboard handoff remains available.'
  }

  return getDashboardUnavailableReason(context)
}

export function getConstructorEdgeGuidance(
  context: EdgeGuidanceContext,
  hasCatalogEntries: boolean,
): string | null {
  const edgeName = context.edgeName ?? 'Selected edge'

  if (context.lifecycleState === 'Blocked') {
    return `The selected edge is currently blocked (${edgeName}). Monitoring and native Dashboard handoff stay unavailable until an administrator unblocks this edge.`
  }

  if (!hasCatalogEntries) {
    return `The selected edge has no telemetry-derived catalog entries yet (${edgeName}). Keep the constructor layout work in progress and return after telemetry arrives to configure bindings.`
  }

  return null
}
