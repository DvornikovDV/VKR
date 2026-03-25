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
  onDiagramChange: (diagramId: string | null) => void
  onEdgeChange: (edgeId: string | null) => void
}

function toSelectValue(value: string | null): string {
  return value ?? ''
}

function fromSelectValue(value: string): string | null {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function DashboardToolbar({
  diagrams,
  selectedDiagramId,
  edgeOptions,
  selectedEdgeId,
  disabled = false,
  onDiagramChange,
  onEdgeChange,
}: DashboardToolbarProps) {
  const isEdgeDisabled = disabled || !selectedDiagramId || edgeOptions.length === 0

  return (
    <section className="rounded-lg border border-[var(--color-surface-border)] bg-[var(--color-surface-100)] p-4">
      <div className="grid gap-3 md:grid-cols-2">
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
            {edgeOptions.map((edge) => (
              <option key={edge._id} value={edge._id}>
                {edge.name}
              </option>
            ))}
          </select>
        </label>
      </div>
    </section>
  )
}
