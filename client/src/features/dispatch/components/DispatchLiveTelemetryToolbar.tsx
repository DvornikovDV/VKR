import { Pause, Play } from 'lucide-react'
import { clsx } from 'clsx'
import type { DashboardTransportStatus } from '@/features/dashboard/model/types'

interface DispatchLiveTelemetryPauseResumeButtonProps {
  isPaused: boolean
  onTogglePaused: () => void
  disabled?: boolean
  compact?: boolean
}

interface DispatchLiveTelemetryToolbarProps extends DispatchLiveTelemetryPauseResumeButtonProps {
  visibleCount: number
  waitingCount: number
  transportStatus: DashboardTransportStatus
  className?: string
}

function getTransportLabel(status: DashboardTransportStatus): string {
  switch (status) {
    case 'connected':
      return 'Connected'
    case 'connecting':
      return 'Connecting'
    case 'reconnecting':
      return 'Reconnecting'
    case 'failed':
      return 'Error'
    case 'idle':
    default:
      return 'Idle'
  }
}

export function DispatchLiveTelemetryPauseResumeButton({
  isPaused,
  onTogglePaused,
  disabled = false,
  compact = false,
}: DispatchLiveTelemetryPauseResumeButtonProps) {
  const Icon = isPaused ? Play : Pause
  const label = isPaused ? 'Resume live telemetry' : 'Pause live telemetry'
  const text = isPaused ? 'Resume' : 'Pause'

  return (
    <button
      type="button"
      aria-label={label}
      data-testid="dispatch-live-telemetry-pause-resume"
      disabled={disabled}
      onClick={onTogglePaused}
      className={clsx(
        'inline-flex min-h-9 items-center justify-center gap-2 rounded border border-[#38bdf8] bg-[#0f172a] px-3 py-1.5 text-sm font-semibold text-[#e0f2fe] transition hover:bg-[#123049] disabled:cursor-not-allowed disabled:border-[#334155] disabled:text-[#64748b]',
        compact ? 'min-w-9 px-2' : null,
      )}
    >
      <Icon size={16} aria-hidden="true" />
      <span className={compact ? 'sr-only' : undefined}>{text}</span>
    </button>
  )
}

export function DispatchLiveTelemetryToolbar({
  isPaused,
  onTogglePaused,
  disabled = false,
  visibleCount,
  waitingCount,
  transportStatus,
  className,
}: DispatchLiveTelemetryToolbarProps) {
  const transportLabel = getTransportLabel(transportStatus)

  return (
    <div
      aria-label="Live telemetry controls"
      data-testid="dispatch-live-telemetry-toolbar"
      className={clsx(
        'grid flex-shrink-0 gap-2 border-b border-[#1f2a3d] bg-[#0a1220] p-3 text-sm text-[#cbd5e1] md:grid-cols-[1fr_auto] md:items-center',
        className,
      )}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
        <p
          data-testid="dispatch-live-telemetry-toolbar-summary"
          className="min-w-0 text-xs text-[#94a3b8]"
        >
          {visibleCount} rows visible | {waitingCount} newer waiting
        </p>
        <p
          data-testid="dispatch-live-telemetry-transport-status"
          data-transport-status={transportStatus}
          className="min-w-0 text-xs text-[#94a3b8]"
        >
          Transport: {transportLabel}
        </p>
        <p
          data-testid="dispatch-live-telemetry-pause-state"
          data-paused={isPaused}
          className="min-w-0 text-xs text-[#94a3b8]"
        >
          Mode: {isPaused ? 'Paused' : 'Running'}
        </p>
      </div>

      <DispatchLiveTelemetryPauseResumeButton
        isPaused={isPaused}
        onTogglePaused={onTogglePaused}
        disabled={disabled}
      />
    </div>
  )
}
