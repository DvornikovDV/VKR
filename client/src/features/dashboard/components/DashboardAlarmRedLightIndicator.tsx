import { Siren } from 'lucide-react'

interface DashboardAlarmRedLightIndicatorProps {
  count: number
}

export function DashboardAlarmRedLightIndicator({ count }: DashboardAlarmRedLightIndicatorProps) {
  if (count <= 0) {
    return null
  }

  const incidentLabel = count === 1 ? 'incident' : 'incidents'

  return (
    <div
      role="status"
      aria-label={`Known unclosed alarm incidents: ${count}`}
      data-testid="dashboard-alarm-red-light-indicator"
      className="inline-flex h-7 items-center gap-1.5 rounded border border-[rgba(239,68,68,0.55)] bg-[rgba(239,68,68,0.14)] px-2 text-xs font-semibold text-[var(--color-danger)] shadow-sm"
    >
      <Siren size={14} aria-hidden="true" />
      <span data-testid="dashboard-alarm-red-light-count">{count}</span>
      <span className="hidden sm:inline">{incidentLabel}</span>
    </div>
  )
}
