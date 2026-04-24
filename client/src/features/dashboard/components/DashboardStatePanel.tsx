import {
  selectEdgeAvailabilityLabel,
  selectTransportStatusLabel,
} from '@/features/dashboard/model/selectors'
import type {
  DashboardEdgeAvailability,
  DashboardRecoveryState,
  DashboardRenderIssue,
  DashboardTransportStatus,
} from '@/features/dashboard/model/types'

interface DashboardStatePanelProps {
  state: DashboardRecoveryState
  selectedDiagramName: string | null
  selectedEdgeName: string | null
  transportStatus?: DashboardTransportStatus
  edgeAvailability?: DashboardEdgeAvailability
  errorMessage?: string | null
  renderIssues?: DashboardRenderIssue[]
}

function formatIssueCount(count: number, label: string): string | null {
  if (count === 0) {
    return null
  }

  return `${count} ${label}`
}

function formatRenderIssueSummary(renderIssues: DashboardRenderIssue[]): string | null {
  if (renderIssues.length === 0) {
    return null
  }

  const blockingCount = renderIssues.filter((issue) => issue.severity === 'blocking').length
  const recoverableCount = renderIssues.length - blockingCount
  const summaryParts = [
    formatIssueCount(blockingCount, 'blocking'),
    formatIssueCount(recoverableCount, 'recoverable'),
  ].filter((part): part is string => Boolean(part))

  return `Visual render issues: ${summaryParts.join(', ')}`
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
    case 'visual-rendering-error':
      return 'Saved diagram visual layout cannot be rendered.'
    case 'partial-visual-rendering':
      return 'Saved diagram rendered with recoverable visual issues.'
    case 'ready':
      return 'Monitoring context resolved.'
    default:
      return 'Dashboard state is unavailable.'
  }
}

function getHint(state: DashboardRecoveryState): string | null {
  switch (state) {
    case 'empty':
      return 'Dashboard starts monitoring after Diagram and Edge Server are both selected.'
    case 'loading':
      return 'Resolving saved diagram and binding profile from cloud contracts.'
    case 'invalid-selection':
      return 'Choose a valid Diagram and Edge pair from the selectors above.'
    case 'missing-binding-profile':
      return 'Create or save bindings in Constructor, then return to Dashboard monitoring.'
    case 'invalid-binding-profile':
      return 'Saved binding profile needs a refresh because widget ids no longer match.'
    case 'visual-rendering-error':
      return 'Open the saved diagram in Constructor and restore its visual layout before monitoring.'
    case 'partial-visual-rendering':
      return 'Renderable visual elements stay visible while damaged saved elements are reported below.'
    case 'ready':
      return 'Live telemetry updates are applied from the selected Edge subscription.'
    default:
      return null
  }
}

export function DashboardStatePanel({
  state,
  selectedDiagramName,
  selectedEdgeName,
  transportStatus = 'idle',
  edgeAvailability = 'unknown',
  errorMessage = null,
  renderIssues = [],
}: DashboardStatePanelProps) {
  const message = getMessage(state, selectedDiagramName, errorMessage)
  const hint = getHint(state)
  const transportLabel = selectTransportStatusLabel(transportStatus)
  const edgeAvailabilityLabel = selectEdgeAvailabilityLabel(edgeAvailability)
  const isReconnecting = transportStatus === 'reconnecting'
  const isLoading = state === 'loading'
  const isError = state === 'generic-error' || state === 'visual-rendering-error'
  const visibleRenderIssues =
    state === 'visual-rendering-error' || state === 'partial-visual-rendering' ? renderIssues : []
  const renderIssueSummary = formatRenderIssueSummary(visibleRenderIssues)

  return (
    <section
      aria-busy={isLoading}
      className="rounded-lg border border-[var(--color-surface-border)] bg-[var(--color-surface-100)] p-4 shadow-[inset_0_1px_0_rgba(148,163,184,0.06)]"
    >
      <h1 className="text-xl font-semibold text-white">Dashboard Monitoring</h1>
      <p
        className={`mt-1 text-sm transition-colors duration-200 ${isError ? 'text-[var(--color-danger)]' : 'text-[#94a3b8]'}`}
      >
        {message}
      </p>
      {hint && <p className="mt-1 text-xs text-[#7f90a7]">{hint}</p>}

      <div className="mt-3 text-xs text-[#94a3b8]">
        <p>Diagram: {selectedDiagramName ?? 'Not selected'}</p>
        <p>Edge Server: {selectedEdgeName ?? 'Not selected'}</p>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-[#cbd5e1]">
        <p>Transport: {transportLabel}</p>
        <p>Edge: {edgeAvailabilityLabel}</p>
      </div>

      {renderIssueSummary && (
        <div
          data-testid="dashboard-state-render-issues"
          className="mt-3 rounded-md border border-[#334155] bg-[#020617]/45 px-3 py-2 text-xs text-[#cbd5e1]"
        >
          <p className="font-medium text-white">{renderIssueSummary}</p>
          <ul className="mt-2 space-y-1">
            {visibleRenderIssues.map((issue, index) => (
              <li key={`${issue.kind}-${issue.elementId ?? 'layout'}-${index}`}>
                <span className="font-medium">{issue.kind}</span>
                {issue.elementId ? <span> ({issue.elementId})</span> : null}
                <span>: {issue.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {isLoading && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-200)]">
          <div className="h-full w-2/5 animate-pulse rounded-full bg-[var(--color-brand-500)]" />
        </div>
      )}

      {isReconnecting && (
        <p className="mt-2 text-xs text-[var(--color-warning)]">
          Transport reconnecting. Last rendered values are preserved.
        </p>
      )}
    </section>
  )
}
