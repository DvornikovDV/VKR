import { RefreshCw } from 'lucide-react'
import { TELEMETRY_HISTORY_MAX_POINTS } from '@/shared/api/telemetryHistory'
import {
  DISPATCH_TRENDS_VALUE_MODES,
  DISPATCH_TRENDS_VIEW_MODES,
  fromDispatchTrendsDateTimeLocalValue,
  toDispatchTrendsDateTimeLocalValue,
  type DispatchTrendsFilter,
  type DispatchTrendsNumericMetricOption,
  type DispatchTrendsValueMode,
  type DispatchTrendsViewMode,
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

const segmentedGroupClassName =
  'inline-flex min-h-8 overflow-hidden rounded border border-[#334155] bg-[#0f1929]'

const segmentedOptionClassName =
  'inline-flex cursor-pointer items-center justify-center px-2.5 text-[11px] font-semibold uppercase text-[#cbd5e1] has-[:checked]:bg-[#164e63] has-[:checked]:text-white'

function toMetricValue(filter: DispatchTrendsFilter): string {
  return filter.deviceId && filter.metric ? `${filter.deviceId}:${filter.metric}` : ''
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

  function handleViewModeChange(viewMode: DispatchTrendsViewMode) {
    onFilterChange({ viewMode })
  }

  return (
    <form
      aria-label="Trends filters"
      className="grid flex-shrink-0 gap-2 border-b border-[#1f2a3d] bg-[#0a1220] p-3 text-sm text-[#cbd5e1] md:grid-cols-2 lg:grid-cols-[minmax(14rem,1.4fr)_repeat(3,minmax(8.5rem,1fr))] xl:grid-cols-[minmax(16rem,1.5fr)_repeat(3,minmax(9rem,1fr))_minmax(18rem,auto)_auto]"
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
          value={toDispatchTrendsDateTimeLocalValue(filter.dateStart)}
          onChange={(event) =>
            onFilterChange({ dateStart: fromDispatchTrendsDateTimeLocalValue(event.target.value) })
          }
          className="min-h-9 rounded border border-[#334155] bg-[#0f1929] px-2 py-1 text-sm text-white"
        />
      </label>

      <label className="flex min-w-0 flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-[#94a3b8]">End</span>
        <input
          aria-label="End date"
          type="datetime-local"
          value={toDispatchTrendsDateTimeLocalValue(filter.dateEnd)}
          onChange={(event) =>
            onFilterChange({ dateEnd: fromDispatchTrendsDateTimeLocalValue(event.target.value) })
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

      <div className="flex min-w-0 flex-wrap items-end gap-2 lg:col-span-3 xl:col-span-1">
        <fieldset className="flex min-w-0 flex-col gap-1">
          <legend className="text-xs font-medium uppercase tracking-wide text-[#94a3b8]">
            Value
          </legend>
          <div className={segmentedGroupClassName}>
            {DISPATCH_TRENDS_VALUE_MODES.map((valueMode) => (
              <label
                key={valueMode}
                className={segmentedOptionClassName}
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

        <fieldset className="flex min-w-0 flex-col gap-1">
          <legend className="text-xs font-medium uppercase tracking-wide text-[#94a3b8]">
            View
          </legend>
          <div className={segmentedGroupClassName}>
            {DISPATCH_TRENDS_VIEW_MODES.map((viewMode) => (
              <label
                key={viewMode}
                className={segmentedOptionClassName}
              >
                <input
                  className="sr-only"
                  type="radio"
                  name="dispatch-trends-view-mode"
                  value={viewMode}
                  checked={filter.viewMode === viewMode}
                  onChange={() => handleViewModeChange(viewMode)}
                />
                {viewMode}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="flex min-w-0 flex-col justify-end gap-1 lg:col-start-4 lg:row-start-2 xl:col-start-6 xl:row-start-1">
        <button
          type="submit"
          data-testid="dispatch-trends-refresh"
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
          className="text-xs text-[var(--color-danger)] md:col-span-2 lg:col-span-4 xl:col-span-6"
        >
          {validationMessage}
        </p>
      ) : null}
    </form>
  )
}
