import { RefreshCw } from 'lucide-react'
import { clsx } from 'clsx'
import type { AlarmIncidentListState } from '@/shared/api/alarmIncidents'
import {
  DISPATCH_ALARM_JOURNAL_STATE_OPTIONS,
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
  options?: readonly DispatchAlarmJournalStateOption[]
  layout?: 'bar' | 'slot'
  className?: string
}

function getSummary(visibleCount: number | undefined, total: number | undefined): string {
  if (visibleCount === undefined || total === undefined) {
    return 'Alarm incidents'
  }

  return `${visibleCount} visible | ${total} total`
}

export function DispatchAlarmJournalToolbar({
  state,
  onStateChange,
  onRefresh,
  isLoading = false,
  isDisabled = false,
  visibleCount,
  total,
  options = DISPATCH_ALARM_JOURNAL_STATE_OPTIONS,
  layout = 'bar',
  className,
}: DispatchAlarmJournalToolbarProps) {
  const controlsDisabled = isDisabled || isLoading
  const summary = getSummary(visibleCount, total)

  const content = (
    <>
      <label
        className={clsx(
          'flex min-w-0 flex-col gap-1',
          layout === 'slot' ? 'w-[10rem]' : null,
        )}
      >
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
        className={clsx(
          'min-w-0 text-xs text-[#94a3b8]',
          layout === 'bar' ? 'md:pb-2' : 'self-end pb-2',
        )}
      >
        {summary}
      </p>

      <button
        type={layout === 'bar' ? 'submit' : 'button'}
        data-testid="dispatch-alarm-journal-refresh"
        disabled={controlsDisabled}
        onClick={layout === 'slot' ? onRefresh : undefined}
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

  if (layout === 'slot') {
    return (
      <div
        role="group"
        aria-label="Alarm journal controls"
        data-testid="dispatch-alarm-journal-toolbar"
        className={clsx('flex min-w-0 flex-wrap items-end gap-2 text-sm text-[#cbd5e1]', className)}
      >
        {content}
      </div>
    )
  }

  return (
    <form
      aria-label="Alarm journal filters"
      data-testid="dispatch-alarm-journal-toolbar"
      className={clsx(
        'grid flex-shrink-0 gap-2 border-b border-[#1f2a3d] bg-[#0a1220] p-3 text-sm text-[#cbd5e1] md:grid-cols-[minmax(12rem,16rem)_1fr_auto] md:items-end',
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
