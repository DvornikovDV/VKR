import {
  selectEdgeAvailabilityLabel,
  selectTransportStatusLabel,
} from '@/features/dashboard/model/selectors'
import type {
  DashboardEdgeAvailability,
  DashboardRecoveryState,
  DashboardTransportStatus,
} from '@/features/dashboard/model/types'

interface DashboardStatePanelProps {
  state: DashboardRecoveryState
  selectedDiagramName: string | null
  selectedEdgeName: string | null
  transportStatus?: DashboardTransportStatus
  edgeAvailability?: DashboardEdgeAvailability
  errorMessage?: string | null
}

function getMessage(
  state: DashboardRecoveryState,
  selectedDiagramName: string | null,
  errorMessage?: string | null,
): string {
  switch (state) {
    case 'empty':
      if (selectedDiagramName) {
        return 'Select an edge server to start monitoring.'
      }
      return 'Select a diagram to start monitoring.'
    case 'loading':
      return 'Loading dashboard context...'
    case 'generic-error':
      return errorMessage?.trim() || 'Failed to load dashboard context.'
    case 'invalid-selection':
      return 'Invalid dashboard selection.'
    case 'missing-binding-profile':
      return 'No saved binding profile for the selected Diagram + Edge pair.'
    case 'invalid-binding-profile':
      return 'Saved binding profile references stale widget ids.'
    case 'ready':
      return 'Monitoring context resolved.'
    default:
      return 'Dashboard state is unavailable.'
  }
}

export function DashboardStatePanel({
  state,
  selectedDiagramName,
  selectedEdgeName,
  transportStatus = 'idle',
  edgeAvailability = 'unknown',
  errorMessage = null,
}: DashboardStatePanelProps) {
  const message = getMessage(state, selectedDiagramName, errorMessage)
  const transportLabel = selectTransportStatusLabel(transportStatus)
  const edgeAvailabilityLabel = selectEdgeAvailabilityLabel(edgeAvailability)
  const isReconnecting = transportStatus === 'reconnecting'

  return (
    <section className="rounded-lg border border-[var(--color-surface-border)] bg-[var(--color-surface-100)] p-4">
      <h1 className="text-xl font-semibold text-white">Dashboard Monitoring</h1>
      <p className="mt-1 text-sm text-[#94a3b8]">{message}</p>

      <div className="mt-3 text-xs text-[#94a3b8]">
        <p>Diagram: {selectedDiagramName ?? 'Not selected'}</p>
        <p>Edge Server: {selectedEdgeName ?? 'Not selected'}</p>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-[#cbd5e1]">
        <p>Transport: {transportLabel}</p>
        <p>Edge: {edgeAvailabilityLabel}</p>
      </div>

      {isReconnecting && (
        <p className="mt-2 text-xs text-[var(--color-warning)]">
          Transport reconnecting. Last rendered values are preserved.
        </p>
      )}
    </section>
  )
}
