import {
  selectEdgeAvailabilityLabel,
  selectTransportStatusLabel,
} from '@/features/dashboard/model/selectors'
import type {
  DashboardEdgeAvailability,
  DashboardRecoveryState,
  DashboardRenderIssue,
  DashboardTransportStatus,
} from '@/features/dashboard/model/types'

interface DashboardStatePanelProps {
  state: DashboardRecoveryState
  selectedDiagramName: string | null
  selectedEdgeName: string | null
  transportStatus?: DashboardTransportStatus
  edgeAvailability?: DashboardEdgeAvailability
  errorMessage?: string | null
  renderIssues?: DashboardRenderIssue[]
}

function formatIssueCount(count: number, label: string): string | null {
  if (count === 0) {
    return null
  }

  return `${count} ${label}`
}

function formatRenderIssueSummary(renderIssues: DashboardRenderIssue[]): string | null {
  if (renderIssues.length === 0) {
    return null
  }

  const blockingCount = renderIssues.filter((issue) => issue.severity === 'blocking').length
  const recoverableCount = renderIssues.length - blockingCount
  const summaryParts = [
    formatIssueCount(blockingCount, 'блокирующих'),
    formatIssueCount(recoverableCount, 'восстановимых'),
  ].filter((part): part is string => Boolean(part))

  return `Проблемы визуальной отрисовки: ${summaryParts.join(', ')}`
}

function getMessage(
  state: DashboardRecoveryState,
  selectedDiagramName: string | null,
  errorMessage?: string | null,
): string {
  switch (state) {
    case 'empty':
      if (selectedDiagramName) {
        return 'Выберите объект, чтобы начать мониторинг.'
      }
      return 'Выберите мнемосхему, чтобы начать мониторинг.'
    case 'loading':
      return 'Загрузка контекста диспетчеризации...'
    case 'generic-error':
      return errorMessage?.trim() || 'Не удалось загрузить контекст диспетчеризации.'
    case 'invalid-selection':
      return 'Некорректный выбор для диспетчеризации.'
    case 'missing-binding-profile':
      return 'Для выбранной пары мнемосхемы и объекта нет сохраненного профиля привязок.'
    case 'invalid-binding-profile':
      return 'Сохраненный профиль привязок ссылается на устаревшие widget id.'
    case 'visual-rendering-error':
      return 'Сохраненную визуальную схему невозможно отрисовать.'
    case 'partial-visual-rendering':
      return 'Схема отрисована с восстановимыми визуальными проблемами.'
    case 'ready':
      return 'Контекст мониторинга определен.'
    default:
      return 'Состояние диспетчеризации недоступно.'
  }
}

function getHint(state: DashboardRecoveryState): string | null {
  switch (state) {
    case 'empty':
      return 'Мониторинг начнется после выбора мнемосхемы и объекта.'
    case 'loading':
      return 'Загружаются сохраненная мнемосхема и профиль привязок из облачных контрактов.'
    case 'invalid-selection':
      return 'Выберите корректную пару мнемосхемы и объекта в селекторах выше.'
    case 'missing-binding-profile':
      return 'Создайте или сохраните привязки в конструкторе, затем вернитесь к диспетчеризации.'
    case 'invalid-binding-profile':
      return 'Профиль привязок нужно обновить: widget id больше не совпадают.'
    case 'visual-rendering-error':
      return 'Откройте мнемосхему в конструкторе и восстановите визуальную схему перед мониторингом.'
    case 'partial-visual-rendering':
      return 'Доступные визуальные элементы остаются видимыми, поврежденные элементы перечислены ниже.'
    case 'ready':
      return 'Живая телеметрия применяется из подписки выбранного объекта.'
    default:
      return null
  }
}

export function DashboardStatePanel({
  state,
  selectedDiagramName,
  selectedEdgeName,
  transportStatus = 'idle',
  edgeAvailability = 'unknown',
  errorMessage = null,
  renderIssues = [],
}: DashboardStatePanelProps) {
  const message = getMessage(state, selectedDiagramName, errorMessage)
  const hint = getHint(state)
  const transportLabel = selectTransportStatusLabel(transportStatus)
  const edgeAvailabilityLabel = selectEdgeAvailabilityLabel(edgeAvailability)
  const isReconnecting = transportStatus === 'reconnecting'
  const isLoading = state === 'loading'
  const isError = state === 'generic-error' || state === 'visual-rendering-error'
  const visibleRenderIssues =
    state === 'visual-rendering-error' || state === 'partial-visual-rendering' ? renderIssues : []
  const renderIssueSummary = formatRenderIssueSummary(visibleRenderIssues)

  return (
    <section
      aria-busy={isLoading}
      className="rounded-lg border border-[var(--color-surface-border)] bg-[var(--color-surface-100)] p-4 shadow-[inset_0_1px_0_rgba(148,163,184,0.06)]"
    >
      <h1 className="text-xl font-semibold text-white">Мониторинг диспетчеризации</h1>
      <p
        className={`mt-1 text-sm transition-colors duration-200 ${isError ? 'text-[var(--color-danger)]' : 'text-[#94a3b8]'}`}
      >
        {message}
      </p>
      {hint && <p className="mt-1 text-xs text-[#7f90a7]">{hint}</p>}

      <div className="mt-3 text-xs text-[#94a3b8]">
        <p>Мнемосхема: {selectedDiagramName ?? 'Не выбрана'}</p>
        <p>Объект: {selectedEdgeName ?? 'Не выбран'}</p>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-[#cbd5e1]">
        <p>Транспорт: {transportLabel}</p>
        <p>Объект: {edgeAvailabilityLabel}</p>
      </div>

      {renderIssueSummary && (
        <div
          data-testid="dashboard-state-render-issues"
          className="mt-3 rounded-md border border-[#334155] bg-[#020617]/45 px-3 py-2 text-xs text-[#cbd5e1]"
        >
          <p className="font-medium text-white">{renderIssueSummary}</p>
          <ul className="mt-2 space-y-1">
            {visibleRenderIssues.map((issue, index) => (
              <li key={`${issue.kind}-${issue.elementId ?? 'layout'}-${index}`}>
                <span className="font-medium">{issue.kind}</span>
                {issue.elementId ? <span> ({issue.elementId})</span> : null}
                <span>: {issue.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {isLoading && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-200)]">
          <div className="h-full w-2/5 animate-pulse rounded-full bg-[var(--color-brand-500)]" />
        </div>
      )}

      {isReconnecting && (
        <p className="mt-2 text-xs text-[var(--color-warning)]">
          Транспорт переподключается. Последние отрисованные значения сохранены.
        </p>
      )}
    </section>
  )
}
