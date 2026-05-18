import type { DashboardRuntimeValue } from '@/features/dashboard/model/types'
import type { DispatchLiveTelemetryRow } from '@/features/dispatch/model/liveTelemetry'

interface DispatchLiveTelemetryTableProps {
  rows: readonly DispatchLiveTelemetryRow[]
  emptyMessage?: string
  className?: string
}

function formatRuntimeValue(value: DashboardRuntimeValue): string {
  if (value === null) {
    return 'null'
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false'
  }

  return String(value)
}

function formatTimestamp(value: string): string {
  return value.replace('T', ' ').replace('.000Z', 'Z')
}

function sortNewestFirst(rows: readonly DispatchLiveTelemetryRow[]): DispatchLiveTelemetryRow[] {
  return [...rows].sort((left, right) => {
    if (right.receivedAt !== left.receivedAt) {
      return right.receivedAt - left.receivedAt
    }

    return right.eventTimestamp - left.eventTimestamp
  })
}

export function DispatchLiveTelemetryTable({
  rows,
  emptyMessage = 'No realtime telemetry rows match the selected binding profile yet.',
  className,
}: DispatchLiveTelemetryTableProps) {
  const sortedRows = sortNewestFirst(rows)

  return (
    <section
      aria-label="Dispatch live telemetry table"
      data-testid="dispatch-live-telemetry-table"
      className={
        className
          ?? 'min-w-0 rounded-md border border-[#1f2a3d] bg-[#0f172a] p-3'
      }
    >
      <h3 className="text-sm font-semibold text-white">Live telemetry</h3>
      <div className="mt-3 min-w-0 overflow-x-auto">
        <table className="w-full min-w-[68rem] table-auto border-separate border-spacing-0 text-left text-xs text-[#cbd5e1]">
          <thead className="sticky top-0 bg-[#0f172a] text-[#94a3b8]">
            <tr>
              <th className="border-b border-[#1f2a3d] py-2 pr-3 font-medium">received</th>
              <th className="border-b border-[#1f2a3d] py-2 pr-3 font-medium">device</th>
              <th className="border-b border-[#1f2a3d] py-2 pr-3 font-medium">metric</th>
              <th className="border-b border-[#1f2a3d] py-2 pr-3 font-medium">value</th>
              <th className="border-b border-[#1f2a3d] py-2 pr-3 font-medium">event timestamp</th>
              <th className="border-b border-[#1f2a3d] py-2 font-medium">server timestamp</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 ? (
              <tr data-testid="dispatch-live-telemetry-empty-row">
                <td
                  colSpan={6}
                  className="h-32 border-b border-[#172033] px-3 py-6 text-center text-sm text-[#94a3b8]"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              sortedRows.map((row) => (
                <tr
                  key={row.id}
                  data-testid="dispatch-live-telemetry-row"
                  data-row-id={row.id}
                  data-edge-id={row.edgeId}
                  data-device-id={row.deviceId}
                  data-metric={row.metric}
                >
                  <td className="whitespace-nowrap border-b border-[#172033] py-2 pr-3 align-top">
                    <time dateTime={row.receivedAtIso}>{formatTimestamp(row.receivedAtIso)}</time>
                  </td>
                  <td className="max-w-[14rem] break-words border-b border-[#172033] py-2 pr-3 align-top font-mono text-[11px] text-[#e2e8f0]">
                    {row.deviceId}
                  </td>
                  <td className="max-w-[14rem] break-words border-b border-[#172033] py-2 pr-3 align-top font-mono text-[11px] text-[#e2e8f0]">
                    {row.metric}
                  </td>
                  <td
                    data-testid={`dispatch-live-telemetry-value-${row.id}`}
                    className="max-w-[14rem] break-words border-b border-[#172033] py-2 pr-3 align-top font-mono text-[11px] text-white"
                  >
                    {formatRuntimeValue(row.value)}
                  </td>
                  <td className="whitespace-nowrap border-b border-[#172033] py-2 pr-3 align-top">
                    <time dateTime={row.eventTimestampIso}>
                      {formatTimestamp(row.eventTimestampIso)}
                    </time>
                  </td>
                  <td className="whitespace-nowrap border-b border-[#172033] py-2 align-top">
                    <time dateTime={row.serverTimestampIso}>
                      {formatTimestamp(row.serverTimestampIso)}
                    </time>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
