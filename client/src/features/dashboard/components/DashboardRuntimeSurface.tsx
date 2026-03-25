import type {
  DashboardEdgeAvailability,
  DashboardMetricValueByBindingKey,
  DashboardRuntimeValue,
  DashboardTransportStatus,
} from '@/features/dashboard/model/types'

interface DashboardRuntimeSurfaceProps {
  isActiveContext: boolean
  transportStatus: DashboardTransportStatus
  edgeAvailability: DashboardEdgeAvailability
  latestMetricValueByBindingKey: DashboardMetricValueByBindingKey
  lastServerTimestamp?: number | null
}

function formatRuntimeValue(value: DashboardRuntimeValue): string {
  if (value === null) {
    return 'null'
  }

  return String(value)
}

export function DashboardRuntimeSurface({
  isActiveContext,
  transportStatus,
  edgeAvailability,
  latestMetricValueByBindingKey,
  lastServerTimestamp = null,
}: DashboardRuntimeSurfaceProps) {
  if (!isActiveContext) {
    return (
      <section className="rounded-lg border border-[var(--color-surface-border)] bg-[var(--color-surface-100)] p-4">
        <h2 className="text-lg font-semibold text-white">Live Runtime Surface</h2>
        <p className="mt-2 text-sm text-[#94a3b8]">
          Monitoring session is inactive. Select Diagram and Edge Server to start.
        </p>
      </section>
    )
  }

  const metricEntries = Object.entries(latestMetricValueByBindingKey).sort(([left], [right]) =>
    left.localeCompare(right),
  )
  const hasValues = metricEntries.length > 0

  return (
    <section className="rounded-lg border border-[var(--color-surface-border)] bg-[var(--color-surface-100)] p-4">
      <h2 className="text-lg font-semibold text-white">Live Runtime Surface</h2>

      <div className="mt-2 flex flex-wrap gap-4 text-xs text-[#94a3b8]">
        <p>Transport state: {transportStatus}</p>
        <p>Edge availability: {edgeAvailability}</p>
        <p>
          Last server timestamp: {lastServerTimestamp !== null ? String(lastServerTimestamp) : 'n/a'}
        </p>
      </div>

      {transportStatus === 'reconnecting' && (
        <p className="mt-2 text-xs text-[var(--color-warning)]">
          Transport reconnecting. Displaying last received values.
        </p>
      )}

      {!hasValues ? (
        <p className="mt-3 text-sm text-[#94a3b8]">No live telemetry values received yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {metricEntries.map(([bindingKey, value]) => (
            <li
              key={bindingKey}
              className="flex items-center justify-between rounded-md border border-[var(--color-surface-border)] bg-[var(--color-surface-200)] px-3 py-2 text-sm text-white"
            >
              <span>{bindingKey}</span>
              <span>{formatRuntimeValue(value)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
