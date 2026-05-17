import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  canDispatchAlarmJournalGoToNextPage,
  canDispatchAlarmJournalGoToPreviousPage,
  type DispatchAlarmJournalPaginationState,
} from '@/features/dispatch/model/alarmJournal'

interface DispatchAlarmJournalPaginationProps {
  pagination: DispatchAlarmJournalPaginationState
  visibleCount: number
  isDisabled?: boolean
  onPreviousPage: () => void
  onNextPage: () => void
  className?: string
}

function getVisibleRange(
  pagination: DispatchAlarmJournalPaginationState,
  visibleCount: number,
): string {
  if (pagination.total === 0 || visibleCount === 0) {
    return '0 of 0 incidents'
  }

  const start = (pagination.page - 1) * pagination.limit + 1
  const end = Math.min(start + visibleCount - 1, pagination.total)

  return `${start}-${end} of ${pagination.total} incidents`
}

export function DispatchAlarmJournalPagination({
  pagination,
  visibleCount,
  isDisabled = false,
  onPreviousPage,
  onNextPage,
  className,
}: DispatchAlarmJournalPaginationProps) {
  const canGoPrevious =
    !isDisabled && canDispatchAlarmJournalGoToPreviousPage(pagination)
  const canGoNext = !isDisabled && canDispatchAlarmJournalGoToNextPage(pagination)

  return (
    <nav
      aria-label="Alarm journal pagination"
      data-testid="dispatch-alarm-journal-pagination"
      className={
        className
          ?? 'flex min-w-0 flex-wrap items-center justify-between gap-2 border-t border-[#1f2a3d] bg-[#0a1220] px-3 py-2 text-xs text-[#94a3b8]'
      }
    >
      <p data-testid="dispatch-alarm-journal-page-summary" className="min-w-0">
        Page {pagination.page} | {getVisibleRange(pagination, visibleCount)}
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
          data-has-next-page={pagination.hasNextPage}
          onClick={onNextPage}
          className="inline-flex min-h-9 min-w-9 items-center justify-center rounded border border-[#334155] bg-[#0f172a] text-[#cbd5e1] disabled:cursor-not-allowed disabled:text-[#64748b]"
        >
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>
    </nav>
  )
}
