import { X, TriangleAlert } from 'lucide-react'
import { getDashboardAlarmIncidentIdentityLabel } from '@/features/dashboard/model/alarmIncidents'
import type { DashboardAlarmToastNotice as DashboardAlarmToastNoticeModel } from '@/features/dashboard/model/types'

interface DashboardAlarmToastNoticeProps {
  notice: DashboardAlarmToastNoticeModel
  onDismiss: (incidentId: string) => void
}

export function DashboardAlarmToastNotice({ notice, onDismiss }: DashboardAlarmToastNoticeProps) {
  const identityLabel = getDashboardAlarmIncidentIdentityLabel(notice.incident)

  return (
    <div
      role="alert"
      aria-label={`Unclosed alarm incident notice for ${identityLabel}`}
      data-testid="dashboard-alarm-toast-notice"
      data-incident-id={notice.incidentId}
      className="w-full max-w-sm rounded border border-[rgba(239,68,68,0.45)] bg-[#120b12] px-3 py-2 text-xs text-[#f8fafc] shadow-xl"
    >
      <div className="flex items-start gap-2">
        <TriangleAlert
          size={16}
          aria-hidden="true"
          className="mt-0.5 shrink-0 text-[var(--color-danger)]"
        />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-[var(--color-danger)]">Known unclosed alarm incident</p>
          <p className="mt-1 break-words text-[#e2e8f0]">{identityLabel}</p>
          <p className="mt-1 break-all text-[#94a3b8]">Incident ID: {notice.incidentId}</p>
        </div>
        <button
          type="button"
          aria-label={`Dismiss alarm incident notice ${notice.incidentId}`}
          data-testid="dashboard-alarm-toast-dismiss"
          onClick={() => onDismiss(notice.incidentId)}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-[#334155] bg-[#111827] text-[#e2e8f0] transition-colors hover:bg-[#1e293b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#38bdf8]"
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
