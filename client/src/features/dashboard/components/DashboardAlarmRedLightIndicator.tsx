import { Siren } from 'lucide-react'
import { selectRuPluralForm } from '@/shared/i18n'

interface DashboardAlarmRedLightIndicatorProps {
  count: number
}

export function DashboardAlarmRedLightIndicator({ count }: DashboardAlarmRedLightIndicatorProps) {
  if (count <= 0) {
    return null
  }

  const incidentLabel = selectRuPluralForm(count, ['авария', 'аварии', 'аварий'])

  return (
    <div
      role="status"
      aria-label={`Известные незакрытые аварии: ${count}`}
      data-testid="dashboard-alarm-red-light-indicator"
      className="inline-flex h-7 items-center gap-1.5 rounded border border-[rgba(239,68,68,0.55)] bg-[rgba(239,68,68,0.14)] px-2 text-xs font-semibold text-[var(--color-danger)] shadow-sm"
    >
      <Siren size={14} aria-hidden="true" />
      <span data-testid="dashboard-alarm-red-light-count">{count}</span>
      <span className="hidden sm:inline">{incidentLabel}</span>
    </div>
  )
}
