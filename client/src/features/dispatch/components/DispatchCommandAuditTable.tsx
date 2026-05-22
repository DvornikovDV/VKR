import type { CommandAuditProjection } from '@/shared/api/commands'
import {
  formatDispatchCommandAuditPayload,
  formatDispatchCommandAuditTimestamp,
  getDispatchCommandAuditFailureReasonLabel,
  getDispatchCommandAuditStatusLabel,
} from '@/features/dispatch/model/commandAudit'

interface DispatchCommandAuditTableProps {
  audits: CommandAuditProjection[]
  className?: string
}

export function DispatchCommandAuditTable({
  audits,
  className,
}: DispatchCommandAuditTableProps) {
  return (
    <section
      aria-label="Таблица аудита команд"
      data-testid="dispatch-command-audit-table"
      className={
        className
          ?? 'flex min-h-[20rem] min-w-0 flex-col rounded-md border border-[#1f2a3d] bg-[#0f172a] p-4'
      }
    >
      <h3 className="text-sm font-semibold text-white">Аудит команд</h3>
      <div className="mt-4 min-h-0 flex-1 overflow-auto">
        <table className="w-max min-w-full table-auto border-separate border-spacing-0 text-left text-xs text-[#cbd5e1]">
          <thead className="sticky top-0 bg-[#0f172a] text-[#94a3b8]">
            <tr>
              <th className="border-b border-[#1f2a3d] py-2 pr-3 font-medium">Запрошена</th>
              <th className="border-b border-[#1f2a3d] py-2 pr-3 font-medium">Завершена</th>
              <th className="border-b border-[#1f2a3d] py-2 pr-3 font-medium">Статус</th>
              <th className="border-b border-[#1f2a3d] py-2 pr-3 font-medium">Причина ошибки</th>
              <th className="border-b border-[#1f2a3d] py-2 pr-3 font-medium">Инициатор</th>
              <th className="border-b border-[#1f2a3d] py-2 pr-3 font-medium">deviceId</th>
              <th className="border-b border-[#1f2a3d] py-2 pr-3 font-medium">commandType</th>
              <th className="border-b border-[#1f2a3d] py-2 font-medium">payload</th>
            </tr>
          </thead>
          <tbody>
            {audits.map((audit) => (
              <tr
                key={audit.requestId}
                data-testid={`dispatch-command-audit-row-${audit.requestId}`}
                data-edge-id={audit.edgeId}
              >
                <td className="whitespace-nowrap border-b border-[#172033] py-2 pr-3 align-top">
                  <time dateTime={audit.requestedAt}>
                    {formatDispatchCommandAuditTimestamp(audit.requestedAt)}
                  </time>
                </td>
                <td className="whitespace-nowrap border-b border-[#172033] py-2 pr-3 align-top">
                  {audit.completedAt ? (
                    <time dateTime={audit.completedAt}>
                      {formatDispatchCommandAuditTimestamp(audit.completedAt)}
                    </time>
                  ) : (
                    '-'
                  )}
                </td>
                <td className="whitespace-nowrap border-b border-[#172033] py-2 pr-3 align-top">
                  {getDispatchCommandAuditStatusLabel(audit.status)}
                </td>
                <td className="whitespace-nowrap border-b border-[#172033] py-2 pr-3 align-top">
                  {getDispatchCommandAuditFailureReasonLabel(audit.failureReason)}
                </td>
                <td className="whitespace-nowrap border-b border-[#172033] py-2 pr-3 align-top">
                  {audit.requestedByEmail ?? audit.requestedBy}
                </td>
                <td className="whitespace-nowrap border-b border-[#172033] py-2 pr-3 align-top">
                  {audit.deviceId}
                </td>
                <td className="whitespace-nowrap border-b border-[#172033] py-2 pr-3 align-top">
                  {audit.commandType}
                </td>
                <td className="max-w-[22rem] border-b border-[#172033] py-2 align-top">
                  <code className="block overflow-hidden text-ellipsis whitespace-nowrap rounded bg-[#08111f] px-2 py-1 font-mono text-[11px] text-[#e2e8f0]">
                    {formatDispatchCommandAuditPayload(audit.payload)}
                  </code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
