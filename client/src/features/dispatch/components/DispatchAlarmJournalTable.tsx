import { Check, Loader2 } from 'lucide-react'
import { clsx } from 'clsx'
import type { AlarmIncidentProjection, AlarmSeverity } from '@/shared/api/alarmIncidents'
import {
  createDispatchAlarmJournalDisplayRow,
  getDispatchAlarmJournalSeverityLabel,
} from '@/features/dispatch/model/alarmJournal'

interface DispatchAlarmJournalTableProps {
  incidents: readonly AlarmIncidentProjection[]
  ackPendingIncidentIds?: ReadonlySet<string>
  ackErrorsByIncidentId?: Readonly<Record<string, string | null | undefined>>
  emptyMessage?: string
  isAckDisabled?: boolean
  onAcknowledgeIncident?: (incident: AlarmIncidentProjection) => void
  className?: string
}

function getSeverityClassName(severity: AlarmSeverity): string {
  if (severity === 'danger') {
    return 'border-[#7f1d1d] bg-[#2a1014] text-[#fecdd3]'
  }

  return 'border-[#854d0e] bg-[#231a0a] text-[#fde68a]'
}

function renderTimestamp(value: string | null, dateTime: string | null) {
  if (!value) {
    return <span className="text-[#64748b]">-</span>
  }

  return <time dateTime={dateTime ?? undefined}>{value}</time>
}

export function DispatchAlarmJournalTable({
  incidents,
  ackPendingIncidentIds,
  ackErrorsByIncidentId,
  emptyMessage = 'No alarm incidents were returned for the selected Edge Server.',
  isAckDisabled = false,
  onAcknowledgeIncident,
  className,
}: DispatchAlarmJournalTableProps) {
  const rows = incidents.map(createDispatchAlarmJournalDisplayRow)

  return (
    <section
      aria-label="Alarm incident journal table"
      data-testid="dispatch-alarm-journal-table"
      className={
        className
          ?? 'flex min-h-[20rem] min-w-0 flex-col rounded-md border border-[#1f2a3d] bg-[#0f172a] p-4'
      }
    >
      <h3 className="text-sm font-semibold text-white">Alarm journal</h3>
      <div className="mt-4 min-h-0 flex-1 overflow-auto">
        <table className="w-max min-w-full table-auto border-separate border-spacing-0 text-left text-xs text-[#cbd5e1]">
          <thead className="sticky top-0 bg-[#0f172a] text-[#94a3b8]">
            <tr>
              <th className="border-b border-[#1f2a3d] py-2 pr-3 font-medium">rule</th>
              <th className="border-b border-[#1f2a3d] py-2 pr-3 font-medium">equipment</th>
              <th className="border-b border-[#1f2a3d] py-2 pr-3 font-medium">condition</th>
              <th className="border-b border-[#1f2a3d] py-2 pr-3 font-medium">severity</th>
              <th className="border-b border-[#1f2a3d] py-2 pr-3 font-medium">lifecycle</th>
              <th className="border-b border-[#1f2a3d] py-2 pr-3 font-medium">activatedAt</th>
              <th className="border-b border-[#1f2a3d] py-2 pr-3 font-medium">clearedAt</th>
              <th className="border-b border-[#1f2a3d] py-2 pr-3 font-medium">
                acknowledgedAt
              </th>
              <th className="border-b border-[#1f2a3d] py-2 pr-3 font-medium">closedAt</th>
              <th className="border-b border-[#1f2a3d] py-2 font-medium">ack</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr data-testid="dispatch-alarm-journal-empty-row">
                <td
                  colSpan={10}
                  className="h-32 border-b border-[#172033] px-3 py-6 text-center text-sm text-[#94a3b8]"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const incident = row.incident
                const isAckPending = ackPendingIncidentIds?.has(incident.incidentId) ?? false
                const ackError = ackErrorsByIncidentId?.[incident.incidentId] ?? null
                const canAcknowledge = !incident.isAcknowledged && Boolean(onAcknowledgeIncident)
                const ackButtonDisabled = isAckDisabled || isAckPending

                return (
                  <tr
                    key={incident.incidentId}
                    data-testid={`dispatch-alarm-journal-row-${incident.incidentId}`}
                    data-edge-id={incident.edgeId}
                    data-incident-id={incident.incidentId}
                  >
                    <td className="max-w-[18rem] border-b border-[#172033] py-2 pr-3 align-top">
                      <div className="font-medium text-white">{row.ruleTitle}</div>
                      <div className="mt-1 font-mono text-[11px] text-[#64748b]">
                        {incident.ruleId}
                      </div>
                    </td>
                    <td className="whitespace-nowrap border-b border-[#172033] py-2 pr-3 align-top">
                      {row.equipmentIdentity}
                    </td>
                    <td className="max-w-[24rem] border-b border-[#172033] py-2 pr-3 align-top">
                      {row.conditionSummary}
                    </td>
                    <td className="whitespace-nowrap border-b border-[#172033] py-2 pr-3 align-top">
                      <span
                        className={clsx(
                          'inline-flex rounded border px-2 py-0.5 text-[11px] font-semibold uppercase',
                          getSeverityClassName(row.severity),
                        )}
                      >
                        {getDispatchAlarmJournalSeverityLabel(row.severity)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap border-b border-[#172033] py-2 pr-3 align-top">
                      {row.lifecycleLabel}
                    </td>
                    <td className="whitespace-nowrap border-b border-[#172033] py-2 pr-3 align-top">
                      {renderTimestamp(row.timestamps.activatedAt, incident.activatedAt)}
                    </td>
                    <td className="whitespace-nowrap border-b border-[#172033] py-2 pr-3 align-top">
                      {renderTimestamp(row.timestamps.clearedAt, incident.clearedAt)}
                    </td>
                    <td className="whitespace-nowrap border-b border-[#172033] py-2 pr-3 align-top">
                      {renderTimestamp(row.timestamps.acknowledgedAt, incident.acknowledgedAt)}
                    </td>
                    <td
                      data-testid={`dispatch-alarm-journal-closed-at-${incident.incidentId}`}
                      className="whitespace-nowrap border-b border-[#172033] py-2 pr-3 align-top"
                    >
                      {renderTimestamp(row.timestamps.closedAt, null)}
                    </td>
                    <td className="min-w-[9rem] border-b border-[#172033] py-2 align-top">
                      {canAcknowledge ? (
                        <div className="flex min-w-0 flex-col gap-1">
                          <button
                            type="button"
                            aria-label={`Acknowledge alarm ${row.ruleTitle}`}
                            disabled={ackButtonDisabled}
                            onClick={() => onAcknowledgeIncident?.(incident)}
                            className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded border border-[#38bdf8] bg-[#0f172a] px-2 py-1 text-[11px] font-semibold text-[#e0f2fe] transition hover:bg-[#123049] disabled:cursor-not-allowed disabled:border-[#334155] disabled:text-[#64748b]"
                          >
                            {isAckPending ? (
                              <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                            ) : (
                              <Check size={14} aria-hidden="true" />
                            )}
                            <span>{isAckPending ? 'Pending' : 'ACK'}</span>
                          </button>
                          {ackError ? (
                            <span role="alert" className="text-[11px] text-[#fecdd3]">
                              {ackError}
                            </span>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-[#94a3b8]">
                          {incident.isAcknowledged ? 'Acknowledged' : '-'}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
