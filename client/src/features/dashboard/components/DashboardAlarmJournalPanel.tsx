import { Bell, Check, Loader2, TriangleAlert } from 'lucide-react'
import {
  getDashboardAlarmIncidentDisplayDetails,
} from '@/features/dashboard/model/alarmIncidents'
import type {
  DashboardAlarmAckErrorByIncidentId,
  DashboardAlarmAckPendingByIncidentId,
  DashboardAlarmIncidentList,
  DashboardAlarmIncidentProjection,
  DashboardAlarmJournalInitialLoadBlockedMarker,
  DashboardAlarmJournalLoadState,
} from '@/features/dashboard/model/types'

interface DashboardAlarmJournalPanelProps {
  alarmIncidents: DashboardAlarmIncidentList
  loadState?: DashboardAlarmJournalLoadState
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

function AlarmJournalEmptyState({
  loadState,
  initialLoadBlocked,
}: {
  loadState: DashboardAlarmJournalLoadState
  initialLoadBlocked: DashboardAlarmJournalInitialLoadBlockedMarker | null
}) {
  if (loadState.status === 'loading') {
    return (
      <div className="flex min-h-0 flex-1 flex-col justify-center gap-2 px-3 py-4 text-xs text-[#94a3b8]">
        <div className="flex items-center gap-2 font-medium text-[#e2e8f0]">
          <Loader2 size={14} aria-hidden="true" className="animate-spin text-[#38bdf8]" />
          <span>Загрузка аварий...</span>
        </div>
        <p>Восстанавливаем известные незакрытые аварии для выбранного объекта.</p>
      </div>
    )
  }

  if (loadState.status === 'error') {
    return (
      <div className="flex min-h-0 flex-1 flex-col justify-center gap-2 px-3 py-4 text-xs text-[#94a3b8]">
        <div
          role="alert"
          className="rounded border border-[rgba(239,68,68,0.35)] bg-[rgba(239,68,68,0.08)] px-2 py-2 text-[var(--color-danger)]"
        >
          <p className="font-medium">Список аварий недоступен.</p>
          <p className="mt-1 text-[#fecaca]">
            {loadState.error ?? 'Аварии, полученные в реальном времени в этой сессии, появятся здесь.'}
          </p>
        </div>
        <p>Аварии, полученные в реальном времени в этой сессии, появятся здесь.</p>
      </div>
    )
  }

  if (loadState.status === 'loaded') {
    return (
      <div className="flex min-h-0 flex-1 flex-col justify-center gap-2 px-3 py-4 text-xs text-[#94a3b8]">
        <p className="font-medium text-[#e2e8f0]">Незакрытых аварий нет.</p>
        <p>Оперативный журнал загружен для выбранного объекта.</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col justify-center gap-2 px-3 py-4 text-xs text-[#94a3b8]">
      {initialLoadBlocked ? (
        <>
          <p className="font-medium text-[#e2e8f0]">Начальная загрузка аварий недоступна.</p>
          <p>
            Заблокировано до появления cloud endpoint списка аварий. Аварии, полученные
            в реальном времени в этой сессии, появятся здесь.
          </p>
        </>
      ) : (
        <p>Журнал аварий ожидает активную runtime-сессию.</p>
      )}
    </div>
  )
}

export function DashboardAlarmJournalPanel({
  alarmIncidents,
  loadState = { status: 'idle', error: null },
  initialLoadBlocked,
  ackPendingByIncidentId = {},
  ackErrorByIncidentId = {},
  onAcknowledgeAlarmIncident,
}: DashboardAlarmJournalPanelProps) {
  return (
    <aside
      data-testid="dashboard-alarm-journal-panel"
      aria-label="Журнал аварий"
      className="flex h-full min-h-0 flex-col border-[#1f2a3d] bg-[#08111f]"
    >
      <div className="flex flex-shrink-0 items-center gap-2 border-b border-[#1f2a3d] px-3 py-2">
        <Bell size={14} aria-hidden="true" className="text-[#38bdf8]" />
        <h2 className="text-xs font-semibold uppercase tracking-normal text-[#e2e8f0]">
          Журнал аварий
        </h2>
      </div>

      {alarmIncidents.length === 0 ? (
        <AlarmJournalEmptyState loadState={loadState} initialLoadBlocked={initialLoadBlocked} />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {loadState.status === 'error' ? (
            <div
              role="alert"
              className="mb-2 rounded border border-[rgba(239,68,68,0.35)] bg-[rgba(239,68,68,0.08)] px-2 py-1.5 text-xs text-[var(--color-danger)]"
            >
              Список аварий недоступен. Показаны аварии, уже известные в этой сессии.
            </div>
          ) : null}
          <ul className="space-y-2">
            {alarmIncidents.map((incident) => {
              const displayDetails = getDashboardAlarmIncidentDisplayDetails(incident)
              const isAckPending = Boolean(ackPendingByIncidentId[incident.incidentId])
              const ackError = ackErrorByIncidentId[incident.incidentId]

              return (
                <li
                  key={incident.incidentId}
                  data-testid={`dashboard-alarm-incident-row-${incident.incidentId}`}
                  data-ack-pending={isAckPending ? 'true' : 'false'}
                  aria-busy={isAckPending || undefined}
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
                      <p className="break-words font-medium text-[#f8fafc]">
                        {displayDetails.ruleTitle}
                      </p>
                      <p className="mt-1 break-words text-[#cbd5e1]">
                        {displayDetails.equipmentIdentity}
                      </p>
                      <p className="mt-1 break-words text-[#94a3b8]">
                        {displayDetails.conditionSummary}
                      </p>
                      <p className="mt-1 text-[#64748b]">
                        Время последней записи:{' '}
                        <span>{displayDetails.latestRowTime ?? 'Время недоступно'}</span>
                      </p>
                    </div>
                  </div>

                  <div className="mt-2 flex items-center justify-between gap-2 border-t border-[#1f2a3d] pt-2">
                    <span className="inline-flex items-center gap-1 text-[#e2e8f0]">
                      {incident.isAcknowledged ? (
                        <Check size={13} aria-hidden="true" className="text-[#22c55e]" />
                      ) : (
                        <TriangleAlert size={13} aria-hidden="true" className="text-[#f59e0b]" />
                      )}
                      {displayDetails.lifecycleLabel}
                    </span>
                    {!incident.isAcknowledged ? (
                      <button
                        type="button"
                        aria-label={`Подтвердить аварию ${displayDetails.ruleTitle}`}
                        disabled={isAckPending}
                        onClick={() => {
                          void onAcknowledgeAlarmIncident(incident.incidentId)
                        }}
                        className="inline-flex h-7 items-center gap-1.5 rounded border border-[#334155] bg-[#111827] px-2 font-medium text-[#e2e8f0] transition-colors hover:bg-[#1e293b] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isAckPending ? <Loader2 size={13} aria-hidden="true" className="animate-spin" /> : null}
                        Подтвердить
                      </button>
                    ) : null}
                  </div>

                  <dl className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] text-[#94a3b8]">
                    <div>
                      <dt className="text-[#64748b]">Активирована</dt>
                      <dd className="break-words text-[#cbd5e1]">
                        {displayDetails.lifecycleTimestamps.activatedAt}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[#64748b]">Сброшена</dt>
                      <dd className="break-words text-[#cbd5e1]">
                        {displayDetails.lifecycleTimestamps.clearedAt ?? 'Не сброшена'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[#64748b]">Подтверждена</dt>
                      <dd className="break-words text-[#cbd5e1]">
                        {displayDetails.lifecycleTimestamps.acknowledgedAt ?? 'Не подтверждена'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[#64748b]">Закрыта</dt>
                      <dd className="break-words text-[#cbd5e1]">
                        {displayDetails.lifecycleTimestamps.closedAt ?? 'Не закрыта'}
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-2 flex flex-wrap gap-1">
                    {displayDetails.secondaryDetails.map((detail) => (
                      <span
                        key={detail}
                        className="rounded border border-[#1f2a3d] bg-[#08111f] px-1.5 py-0.5 text-[11px] text-[#94a3b8]"
                      >
                        {detail}
                      </span>
                    ))}
                  </div>

                  {ackError ? (
                    <p
                      role="alert"
                      className="mt-2 rounded border border-[rgba(239,68,68,0.35)] bg-[rgba(239,68,68,0.08)] px-2 py-1 text-[var(--color-danger)]"
                    >
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
