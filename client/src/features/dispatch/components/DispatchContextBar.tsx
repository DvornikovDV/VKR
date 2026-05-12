import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import { clsx } from 'clsx'
import { DispatchActionSlot, createDispatchActionSlotContextKey } from '@/features/dispatch/components/DispatchActionSlot'
import type { DispatchTabId } from '@/features/dispatch/model/routes'
import type {
  DispatchDiagramOption,
  DispatchEdgeOption,
  DispatchWorkspaceContextSnapshot,
} from '@/features/dispatch/model/types'

interface DispatchContextBarProps {
  workspaceContext: DispatchWorkspaceContextSnapshot
  onDiagramChange: (diagramId: string | null) => void
  onEdgeChange: (edgeId: string | null) => void
  activeTabId?: DispatchTabId
  disabled?: boolean
  className?: string
}

function toSelectValue(value: string | null): string {
  return value ?? ''
}

function fromSelectValue(value: string): string | null {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function hasDiagramOption(options: DispatchDiagramOption[], id: string | null): boolean {
  return Boolean(id) && options.some((option) => option.id === id)
}

function hasEdgeOption(options: DispatchEdgeOption[], id: string | null): boolean {
  return Boolean(id) && options.some((option) => option.id === id)
}

function getSelectedContextLabel(context: DispatchWorkspaceContextSnapshot): string {
  const { diagramId, edgeId, selectedDiagram, selectedEdge } = context.selection

  if (!diagramId && !edgeId) {
    return 'No context selected'
  }

  const diagramLabel = selectedDiagram?.name ?? (diagramId ? 'Unknown diagram' : 'No diagram selected')
  const edgeLabel = selectedEdge?.name ?? (edgeId ? 'Unknown Edge Server' : 'No Edge Server selected')

  return `${diagramLabel} / ${edgeLabel}`
}

function getStatusLabel(context: DispatchWorkspaceContextSnapshot): string {
  if (context.errorMessage) {
    return context.errorMessage
  }

  switch (context.status) {
    case 'idle':
      return 'Context idle'
    case 'loading':
      return 'Loading context'
    case 'ready':
      return 'Context ready'
    case 'error':
      return 'Context error'
    default:
      return 'Context unavailable'
  }
}

export function DispatchContextBar({
  workspaceContext,
  onDiagramChange,
  onEdgeChange,
  activeTabId = workspaceContext.routeState.tabId,
  disabled = false,
  className,
}: DispatchContextBarProps) {
  const { diagramOptions, edgeOptions, selection } = workspaceContext
  const contextKey = createDispatchActionSlotContextKey(selection)
  const hasSelectedDiagramOption = hasDiagramOption(diagramOptions, selection.diagramId)
  const hasSelectedEdgeOption = hasEdgeOption(edgeOptions, selection.edgeId)
  const controlsDisabled = disabled || workspaceContext.status === 'loading'
  const edgeDisabled = controlsDisabled || !selection.diagramId || edgeOptions.length === 0
  const statusLabel = getStatusLabel(workspaceContext)
  const selectedContextLabel = getSelectedContextLabel(workspaceContext)
  const isError = workspaceContext.status === 'error'
  const isLoading = workspaceContext.status === 'loading'

  return (
    <section
      aria-label="Dispatch context"
      className={clsx(
        'flex flex-shrink-0 flex-col gap-2 border-b border-[#1f2a3d] bg-[#0a1220] px-3 py-2',
        className,
      )}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <label className="flex min-w-0 items-center gap-1.5 text-xs text-[#cbd5e1]">
          <span className="shrink-0">Diagram</span>
          <select
            aria-label="Diagram"
            value={toSelectValue(selection.diagramId)}
            disabled={controlsDisabled}
            onChange={(event) => onDiagramChange(fromSelectValue(event.target.value))}
            className="max-w-56 rounded border border-[#334155] bg-[#0f1929] px-2 py-1 text-xs text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            <option value="">Select diagram</option>
            {selection.diagramId && !hasSelectedDiagramOption ? (
              <option value={selection.diagramId}>Loading selected diagram...</option>
            ) : null}
            {diagramOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-w-0 items-center gap-1.5 text-xs text-[#cbd5e1]">
          <span className="shrink-0">Edge Server</span>
          <select
            aria-label="Edge Server"
            value={toSelectValue(selection.edgeId)}
            disabled={edgeDisabled}
            onChange={(event) => onEdgeChange(fromSelectValue(event.target.value))}
            className="max-w-56 rounded border border-[#334155] bg-[#0f1929] px-2 py-1 text-xs text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            <option value="">Select edge server</option>
            {selection.edgeId && !hasSelectedEdgeOption ? (
              <option value={selection.edgeId}>Loading selected edge server...</option>
            ) : null}
            {edgeOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </label>

        <div
          data-testid="dispatch-selected-context"
          className="flex min-w-0 items-center gap-2 rounded border border-[#1f2a3d] bg-[#0f172a] px-2 py-1 text-xs text-[#cbd5e1]"
        >
          {isLoading ? (
            <Loader2 className="shrink-0 animate-spin text-[#38bdf8]" size={14} aria-hidden="true" />
          ) : isError ? (
            <AlertTriangle className="shrink-0 text-[var(--color-danger)]" size={14} aria-hidden="true" />
          ) : (
            <CheckCircle2 className="shrink-0 text-[var(--color-online)]" size={14} aria-hidden="true" />
          )}
          <span className="truncate">{selectedContextLabel}</span>
          <span className="hidden text-[#64748b] sm:inline" aria-live="polite">
            {statusLabel}
          </span>
        </div>

        <div className="ml-auto min-w-0">
          <DispatchActionSlot activeTabId={activeTabId} contextKey={contextKey} />
        </div>
      </div>

      {workspaceContext.errorMessage ? (
        <p role="alert" className="text-xs text-[var(--color-danger)]">
          {workspaceContext.errorMessage}
        </p>
      ) : null}
    </section>
  )
}
