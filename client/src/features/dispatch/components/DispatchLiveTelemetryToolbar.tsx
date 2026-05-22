import { Pause, Play } from 'lucide-react'
import { clsx } from 'clsx'
import type {
  DashboardEdgeAvailability,
  DashboardTransportStatus,
} from '@/features/dashboard/model/types'

interface DispatchLiveTelemetryPauseResumeButtonProps {
  isPaused: boolean
  onTogglePaused: () => void
  disabled?: boolean
  compact?: boolean
  testId?: string
}

interface DispatchLiveTelemetryToolbarProps extends DispatchLiveTelemetryPauseResumeButtonProps {
  visibleCount: number
  waitingCount: number
  transportStatus: DashboardTransportStatus
  edgeAvailability: DashboardEdgeAvailability
  className?: string
}

function getCloudStreamLabel(status: DashboardTransportStatus): string {
  switch (status) {
    case 'connected':
      return 'Подключено'
    case 'connecting':
      return 'Подключение'
    case 'reconnecting':
      return 'Переподключение'
    case 'failed':
      return 'Ошибка'
    case 'idle':
    default:
      return 'Ожидание'
  }
}

function getEdgeAvailabilityLabel(availability: DashboardEdgeAvailability): string {
  switch (availability) {
    case 'online':
      return 'В сети'
    case 'offline':
      return 'Не в сети'
    case 'unknown':
    default:
      return 'Неизвестно'
  }
}

export function DispatchLiveTelemetryPauseResumeButton({
  isPaused,
  onTogglePaused,
  disabled = false,
  compact = false,
  testId = 'dispatch-live-telemetry-pause-resume',
}: DispatchLiveTelemetryPauseResumeButtonProps) {
  const Icon = isPaused ? Play : Pause
  const label = isPaused ? 'Продолжить live-телеметрию' : 'Поставить live-телеметрию на паузу'
  const text = isPaused ? 'Продолжить' : 'Пауза'

  return (
    <button
      type="button"
      aria-label={label}
      data-testid={testId}
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
  edgeAvailability,
  className,
}: DispatchLiveTelemetryToolbarProps) {
  const cloudStreamLabel = getCloudStreamLabel(transportStatus)
  const edgeAvailabilityLabel = getEdgeAvailabilityLabel(edgeAvailability)

  return (
    <div
      aria-label="Управление live-телеметрией"
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
          Видимых строк: {visibleCount} | новых в ожидании: {waitingCount}
        </p>
        <p
          data-testid="dispatch-live-telemetry-cloud-stream-status"
          data-cloud-stream-status={transportStatus}
          className="min-w-0 text-xs text-[#94a3b8]"
        >
          Облачный поток: {cloudStreamLabel}
        </p>
        <p
          data-testid="dispatch-live-telemetry-edge-status"
          data-edge-availability={edgeAvailability}
          className="min-w-0 text-xs text-[#94a3b8]"
        >
          Объект: {edgeAvailabilityLabel}
        </p>
        <p
          data-testid="dispatch-live-telemetry-pause-state"
          data-paused={isPaused}
          className="min-w-0 text-xs text-[#94a3b8]"
        >
          Режим: {isPaused ? 'Пауза' : 'Работает'}
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
