import { RefreshCw } from 'lucide-react'
import { TELEMETRY_HISTORY_MAX_POINTS } from '@/shared/api/telemetryHistory'
import type {
  DispatchTrendsFilter,
  DispatchTrendsNumericMetricOption,
  DispatchTrendsValueMode,
} from '@/features/dispatch/model/trends'

interface DispatchTrendsControlsProps {
  filter: DispatchTrendsFilter
  metricOptions: DispatchTrendsNumericMetricOption[]
  validationMessage: string | null
  isCatalogLoading: boolean
  isHistoryLoading: boolean
  onFilterChange: (patch: Partial<DispatchTrendsFilter>) => void
  onRefresh: () => void
}

function toMetricValue(filter: DispatchTrendsFilter): string {
  return filter.deviceId && filter.metric ? `${filter.deviceId}:${filter.metric}` : ''
}

function toDateTimeLocalValue(value: string): string {
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) {
    return ''
  }

  return new Date(timestamp).toISOString().slice(0, 16)
}

function fromDateTimeLocalValue(value: string): string {
  if (!value) {
    return ''
  }

  const normalized = value.length === 16 ? `${value}:00.000Z` : value
  const timestamp = Date.parse(normalized)
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : value
}

function parseMaxPoints(value: string): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0
}

export function DispatchTrendsControls({
  filter,
  metricOptions,
  validationMessage,
  isCatalogLoading,
  isHistoryLoading,
  onFilterChange,
  onRefresh,
}: DispatchTrendsControlsProps) {
  const metricValue = toMetricValue(filter)
  const refreshDisabled = Boolean(validationMessage) || isCatalogLoading || isHistoryLoading

  function handleMetricChange(value: string) {
    const selected = metricOptions.find((option) => option.id === value)
    onFilterChange({
      deviceId: selected?.deviceId ?? null,
      metric: selected?.metric ?? null,
    })
  }

  function handleValueModeChange(valueMode: DispatchTrendsValueMode) {
    onFilterChange({ valueMode })
  }

  return (
    <form
      aria-label="Trends filters"
      className="grid flex-shrink-0 gap-3 border-b border-[#1f2a3d] bg-[#0a1220] p-3 text-sm text-[#cbd5e1] lg:grid-cols-[minmax(16rem,1.5fr)_repeat(3,minmax(10rem,1fr))_auto]"
      onSubmit={(event) => {
        event.preventDefault()
        onRefresh()
      }}
    >
      <label className="flex min-w-0 flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-[#94a3b8]">
          Numeric telemetry metric
        </span>
        <select
          aria-label="Numeric telemetry metric"
          value={metricValue}
          disabled={isCatalogLoading || metricOptions.length === 0}
          onChange={(event) => handleMetricChange(event.target.value)}
          className="min-h-9 rounded border border-[#334155] bg-[#0f1929] px-2 py-1 text-sm text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          <option value="">
            {isCatalogLoading ? 'Loading metrics...' : 'Select metric'}
          </option>
          {metricOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex min-w-0 flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-[#94a3b8]">Start</span>
        <input
          aria-label="Start date"
          type="datetime-local"
          value={toDateTimeLocalValue(filter.dateStart)}
          onChange={(event) =>
            onFilterChange({ dateStart: fromDateTimeLocalValue(event.target.value) })
          }
          className="min-h-9 rounded border border-[#334155] bg-[#0f1929] px-2 py-1 text-sm text-white"
        />
      </label>

      <label className="flex min-w-0 flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-[#94a3b8]">End</span>
        <input
          aria-label="End date"
          type="datetime-local"
          value={toDateTimeLocalValue(filter.dateEnd)}
          onChange={(event) =>
            onFilterChange({ dateEnd: fromDateTimeLocalValue(event.target.value) })
          }
          className="min-h-9 rounded border border-[#334155] bg-[#0f1929] px-2 py-1 text-sm text-white"
        />
      </label>

      <label className="flex min-w-0 flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-[#94a3b8]">
          Max points
        </span>
        <input
          aria-label="Max points"
          type="number"
          min={1}
          max={TELEMETRY_HISTORY_MAX_POINTS}
          step={1}
          value={filter.maxPoints}
          onChange={(event) => onFilterChange({ maxPoints: parseMaxPoints(event.target.value) })}
          className="min-h-9 rounded border border-[#334155] bg-[#0f1929] px-2 py-1 text-sm text-white"
        />
      </label>

      <fieldset className="flex min-w-0 flex-col gap-1">
        <legend className="text-xs font-medium uppercase tracking-wide text-[#94a3b8]">
          Value
        </legend>
        <div className="inline-flex min-h-9 overflow-hidden rounded border border-[#334155] bg-[#0f1929]">
          {(['avg', 'last'] as const).map((valueMode) => (
            <label
              key={valueMode}
              className="inline-flex cursor-pointer items-center justify-center px-3 text-xs font-semibold uppercase text-[#cbd5e1] has-[:checked]:bg-[#164e63] has-[:checked]:text-white"
            >
              <input
                className="sr-only"
                type="radio"
                name="dispatch-trends-value-mode"
                value={valueMode}
                checked={filter.valueMode === valueMode}
                onChange={() => handleValueModeChange(valueMode)}
              />
              {valueMode}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex min-w-0 flex-col justify-end gap-1 lg:col-start-5 lg:row-start-1">
        <button
          type="submit"
          disabled={refreshDisabled}
          className="inline-flex min-h-9 items-center justify-center gap-2 rounded border border-[#38bdf8] bg-[#0f172a] px-3 py-1.5 text-sm font-semibold text-[#e0f2fe] transition hover:bg-[#123049] disabled:cursor-not-allowed disabled:border-[#334155] disabled:text-[#64748b]"
        >
          <RefreshCw
            size={16}
            className={isHistoryLoading ? 'animate-spin' : undefined}
            aria-hidden="true"
          />
          <span>{isHistoryLoading ? 'Loading...' : 'Refresh trends'}</span>
        </button>
      </div>

      {validationMessage ? (
        <p
          role="alert"
          className="text-xs text-[var(--color-danger)] lg:col-span-5"
        >
          {validationMessage}
        </p>
      ) : null}
    </form>
  )
}
