import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import { clsx } from 'clsx'
import type { AlarmIncidentListState } from '@/shared/api/alarmIncidents'
import {
  DISPATCH_ALARM_JOURNAL_STATE_OPTIONS,
  canDispatchAlarmJournalGoToNextPage,
  canDispatchAlarmJournalGoToPreviousPage,
  type DispatchAlarmJournalPaginationState,
  type DispatchAlarmJournalStateOption,
} from '@/features/dispatch/model/alarmJournal'

interface DispatchAlarmJournalToolbarProps {
  state: AlarmIncidentListState
  onStateChange: (state: AlarmIncidentListState) => void
  onRefresh: () => void
  isLoading?: boolean
  isDisabled?: boolean
  visibleCount?: number
  total?: number
  pagination?: DispatchAlarmJournalPaginationState
  onPreviousPage?: () => void
  onNextPage?: () => void
  options?: readonly DispatchAlarmJournalStateOption[]
  className?: string
}

function getSummary(
  pagination: DispatchAlarmJournalPaginationState | undefined,
  visibleCount: number | undefined,
  total: number | undefined,
): string {
  if (!pagination || visibleCount === undefined || total === undefined) {
    return 'Alarm incidents'
  }

  return `Page ${pagination.page} | ${visibleCount} incidents visible | ${total} total`
}

export function DispatchAlarmJournalToolbar({
  state,
  onStateChange,
  onRefresh,
  isLoading = false,
  isDisabled = false,
  visibleCount,
  total,
  pagination,
  onPreviousPage,
  onNextPage,
  options = DISPATCH_ALARM_JOURNAL_STATE_OPTIONS,
  className,
}: DispatchAlarmJournalToolbarProps) {
  const controlsDisabled = isDisabled || isLoading
  const summary = getSummary(pagination, visibleCount, total)
  const canGoPrevious = Boolean(
    pagination && !controlsDisabled && canDispatchAlarmJournalGoToPreviousPage(pagination),
  )
  const canGoNext = Boolean(
    pagination && !controlsDisabled && canDispatchAlarmJournalGoToNextPage(pagination),
  )

  const content = (
    <>
      <label className="flex min-w-0 flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-[#94a3b8]">State</span>
        <select
          aria-label="Alarm incident state"
          value={state}
          disabled={controlsDisabled}
          onChange={(event) => onStateChange(event.target.value as AlarmIncidentListState)}
          className="min-h-9 rounded border border-[#334155] bg-[#0f1929] px-2 py-1 text-sm text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <p
        data-testid="dispatch-alarm-journal-toolbar-summary"
        className="min-w-0 text-xs text-[#94a3b8] md:pb-2"
      >
        {summary}
      </p>

      <div className="flex min-w-0 items-center gap-1">
        <button
          type="button"
          aria-label="Previous alarm journal page"
          disabled={!canGoPrevious}
          onClick={onPreviousPage}
          className="inline-flex min-h-9 min-w-9 items-center justify-center rounded border border-[#334155] bg-[#0f172a] text-[#cbd5e1] disabled:cursor-not-allowed disabled:text-[#64748b]"
        >
          <ChevronLeft size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Next alarm journal page"
          disabled={!canGoNext}
          data-has-next-page={pagination?.hasNextPage ?? false}
          onClick={onNextPage}
          className="inline-flex min-h-9 min-w-9 items-center justify-center rounded border border-[#334155] bg-[#0f172a] text-[#cbd5e1] disabled:cursor-not-allowed disabled:text-[#64748b]"
        >
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>

      <button
        type="submit"
        data-testid="dispatch-alarm-journal-refresh"
        disabled={controlsDisabled}
        className="inline-flex min-h-9 items-center justify-center gap-2 rounded border border-[#38bdf8] bg-[#0f172a] px-3 py-1.5 text-sm font-semibold text-[#e0f2fe] transition hover:bg-[#123049] disabled:cursor-not-allowed disabled:border-[#334155] disabled:text-[#64748b]"
      >
        <RefreshCw
          size={16}
          className={isLoading ? 'animate-spin' : undefined}
          aria-hidden="true"
        />
        <span>{isLoading ? 'Loading...' : 'Refresh'}</span>
      </button>
    </>
  )

  return (
    <form
      aria-label="Alarm journal filters"
      data-testid="dispatch-alarm-journal-toolbar"
      className={clsx(
        'grid flex-shrink-0 gap-2 border-b border-[#1f2a3d] bg-[#0a1220] p-3 text-sm text-[#cbd5e1] md:grid-cols-[minmax(12rem,16rem)_1fr_auto_auto] md:items-end',
        className,
      )}
      onSubmit={(event) => {
        event.preventDefault()
        onRefresh()
      }}
    >
      {content}
    </form>
  )
}
