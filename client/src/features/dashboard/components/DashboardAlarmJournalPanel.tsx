import { Bell, Check, Loader2, TriangleAlert } from 'lucide-react'
import {
  getDashboardAlarmIncidentIdentityLabel,
  getDashboardAlarmIncidentLifecycleLabel,
  getDashboardAlarmIncidentRowTime,
} from '@/features/dashboard/model/alarmIncidents'
import type {
  DashboardAlarmAckErrorByIncidentId,
  DashboardAlarmAckPendingByIncidentId,
  DashboardAlarmIncidentList,
  DashboardAlarmIncidentProjection,
  DashboardAlarmJournalInitialLoadBlockedMarker,
} from '@/features/dashboard/model/types'

interface DashboardAlarmJournalPanelProps {
  alarmIncidents: DashboardAlarmIncidentList
  initialLoadBlocked: DashboardAlarmJournalInitialLoadBlockedMarker | null
  ackPendingByIncidentId?: DashboardAlarmAckPendingByIncidentId
  ackErrorByIncidentId?: DashboardAlarmAckErrorByIncidentId
  onAcknowledgeAlarmIncident: (incidentId: string) => void | Promise<void>
}

function getSeverityClass(incident: DashboardAlarmIncidentProjection): string {
  return incident.rule.severity === 'danger'
    ? 'border-[var(--color-danger)] bg-[rgba(239,68,68,0.12)] text-[var(--color-danger)]'
    : 'border-[var(--color-warning)] bg-[rgba(245,158,11,0.12)] text-[var(--color-warning)]'
}

export function DashboardAlarmJournalPanel({
  alarmIncidents,
  initialLoadBlocked,
  ackPendingByIncidentId = {},
  ackErrorByIncidentId = {},
  onAcknowledgeAlarmIncident,
}: DashboardAlarmJournalPanelProps) {
  return (
    <aside
      data-testid="dashboard-alarm-journal-panel"
      aria-label="Alarm incident journal"
      className="flex h-full min-h-0 flex-col border-[#1f2a3d] bg-[#08111f]"
    >
      <div className="flex flex-shrink-0 items-center gap-2 border-b border-[#1f2a3d] px-3 py-2">
        <Bell size={14} aria-hidden="true" className="text-[#38bdf8]" />
        <h2 className="text-xs font-semibold uppercase tracking-normal text-[#e2e8f0]">
          Alarm Journal
        </h2>
      </div>

      {alarmIncidents.length === 0 ? (
        <div className="flex min-h-0 flex-1 flex-col justify-center gap-2 px-3 py-4 text-xs text-[#94a3b8]">
          {initialLoadBlocked ? (
            <>
              <p className="font-medium text-[#e2e8f0]">Initial alarm incident load is unavailable.</p>
              <p>
                Blocked until the Cloud incident list endpoint exists. Realtime incidents received
                during this session will appear here.
              </p>
            </>
          ) : (
            <p>Alarm incident journal is waiting for an active runtime session.</p>
          )}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          <ul className="space-y-2">
            {alarmIncidents.map((incident) => {
              const identityLabel = getDashboardAlarmIncidentIdentityLabel(incident)
              const rowTime = getDashboardAlarmIncidentRowTime(incident) ?? 'Time unavailable'
              const lifecycleLabel = getDashboardAlarmIncidentLifecycleLabel(incident)
              const isAckPending = Boolean(ackPendingByIncidentId[incident.incidentId])
              const ackError = ackErrorByIncidentId[incident.incidentId]

              return (
                <li
                  key={incident.incidentId}
                  data-testid={`dashboard-alarm-incident-row-${incident.incidentId}`}
                  className="rounded border border-[#1f2a3d] bg-[#0f172a] p-2 text-xs text-[#cbd5e1]"
                >
                  <div className="flex items-start gap-2">
                    <span
                      className={`shrink-0 rounded border px-1.5 py-0.5 font-semibold uppercase ${getSeverityClass(
                        incident,
                      )}`}
                    >
                      {incident.rule.severity}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="break-words font-medium text-[#f8fafc]">{identityLabel}</p>
                      <p className="mt-1 text-[#94a3b8]">{rowTime}</p>
                    </div>
                  </div>

                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1 text-[#e2e8f0]">
                      {incident.isAcknowledged ? (
                        <Check size={13} aria-hidden="true" className="text-[#22c55e]" />
                      ) : (
                        <TriangleAlert size={13} aria-hidden="true" className="text-[#f59e0b]" />
                      )}
                      {lifecycleLabel}
                    </span>
                    {!incident.isAcknowledged ? (
                      <button
                        type="button"
                        aria-label={`Acknowledge incident ${identityLabel}`}
                        disabled={isAckPending}
                        onClick={() => {
                          void onAcknowledgeAlarmIncident(incident.incidentId)
                        }}
                        className="inline-flex h-7 items-center gap-1.5 rounded border border-[#334155] bg-[#111827] px-2 font-medium text-[#e2e8f0] transition-colors hover:bg-[#1e293b] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isAckPending ? <Loader2 size={13} aria-hidden="true" className="animate-spin" /> : null}
                        ACK
                      </button>
                    ) : null}
                  </div>

                  {ackError ? (
                    <p className="mt-2 rounded border border-[rgba(239,68,68,0.35)] bg-[rgba(239,68,68,0.08)] px-2 py-1 text-[var(--color-danger)]">
                      {ackError}
                    </p>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </aside>
  )
}
