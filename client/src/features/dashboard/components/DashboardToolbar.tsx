import { Info } from 'lucide-react'
import type {
  DashboardDiagramSummary,
  DashboardTrustedEdgeServer,
} from '@/features/dashboard/model/types'

interface DashboardToolbarProps {
  diagrams: DashboardDiagramSummary[]
  selectedDiagramId: string | null
  edgeOptions: DashboardTrustedEdgeServer[]
  selectedEdgeId: string | null
  disabled?: boolean
  diagnosticsOpen: boolean
  onDiagramChange: (diagramId: string | null) => void
  onEdgeChange: (edgeId: string | null) => void
  onToggleDiagnostics: () => void
}

function toSelectValue(value: string | null): string {
  return value ?? ''
}

function fromSelectValue(value: string): string | null {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function hasOptionWithId<T extends { _id: string }>(options: T[], id: string | null): boolean {
  return Boolean(id) && options.some((option) => option._id === id)
}

export function DashboardToolbar({
  diagrams,
  selectedDiagramId,
  edgeOptions,
  selectedEdgeId,
  disabled = false,
  diagnosticsOpen,
  onDiagramChange,
  onEdgeChange,
  onToggleDiagnostics,
}: DashboardToolbarProps) {
  const isEdgeDisabled = disabled || !selectedDiagramId || edgeOptions.length === 0
  const hasSelectedDiagramOption = hasOptionWithId(diagrams, selectedDiagramId)
  const hasSelectedEdgeOption = hasOptionWithId(edgeOptions, selectedEdgeId)

  return (
    <section className="rounded-lg border border-[var(--color-surface-border)] bg-[var(--color-surface-100)] p-4">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <label className="flex flex-col gap-1 text-sm text-[#cbd5e1]">
          Diagram
          <select
            aria-label="Diagram"
            value={toSelectValue(selectedDiagramId)}
            disabled={disabled}
            onChange={(event) => onDiagramChange(fromSelectValue(event.target.value))}
            className="rounded-md border border-[var(--color-surface-border)] bg-[var(--color-surface-200)] px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            <option value="">Select diagram</option>
            {selectedDiagramId && !hasSelectedDiagramOption ?
              <option value={selectedDiagramId}>Loading selected diagram...</option>
            : null}
            {diagrams.map((diagram) => (
              <option key={diagram._id} value={diagram._id}>
                {diagram.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm text-[#cbd5e1]">
          Edge Server
          <select
            aria-label="Edge Server"
            value={toSelectValue(selectedEdgeId)}
            disabled={isEdgeDisabled}
            onChange={(event) => onEdgeChange(fromSelectValue(event.target.value))}
            className="rounded-md border border-[var(--color-surface-border)] bg-[var(--color-surface-200)] px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            <option value="">Select edge server</option>
            {selectedEdgeId && !hasSelectedEdgeOption ?
              <option value={selectedEdgeId}>Loading selected edge server...</option>
            : null}
            {edgeOptions.map((edge) => (
              <option key={edge._id} value={edge._id}>
                {edge.name}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-end">
          <button
            type="button"
            aria-expanded={diagnosticsOpen}
            onClick={onToggleDiagnostics}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-[var(--color-surface-border)] bg-[var(--color-surface-200)] px-3 text-sm font-medium text-white transition-colors hover:bg-[var(--color-surface-300)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
          >
            <Info aria-hidden="true" size={16} />
            Details
          </button>
        </div>
      </div>
    </section>
  )
}
