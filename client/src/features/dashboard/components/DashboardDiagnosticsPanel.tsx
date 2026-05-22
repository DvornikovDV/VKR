import { useState } from 'react'
import {
  selectEdgeAvailabilityLabel,
  selectTransportStatusLabel,
} from '@/features/dashboard/model/selectors'
import type {
  DashboardEdgeAvailability,
  DashboardCatalogLoadStatus,
  DashboardCommandLifecycleByWidgetId,
  DashboardMetricValueByBindingKey,
  DashboardRecoveryState,
  DashboardRenderIssue,
  DashboardRuntimeProjection,
  DashboardRuntimeValue,
  DashboardTransportStatus,
} from '@/features/dashboard/model/types'

type DiagnosticsTab = 'status' | 'telemetry' | 'bindings' | 'render-issues'

interface DashboardDiagnosticsPanelProps {
  runtimeProjection: DashboardRuntimeProjection | null
  commandLifecycleByWidgetId?: DashboardCommandLifecycleByWidgetId
  catalogStatus?: DashboardCatalogLoadStatus
  catalogError?: string | null
  telemetryValues: DashboardMetricValueByBindingKey
  renderIssues: DashboardRenderIssue[]
  lastServerTimestamp?: number | null
  recoveryState?: DashboardRecoveryState
  transportStatus?: DashboardTransportStatus
  edgeAvailability?: DashboardEdgeAvailability
  recoveryMessage?: string
  recoveryHint?: string | null
}

function formatRuntimeValue(value: DashboardRuntimeValue): string {
  if (value === null) {
    return 'null'
  }

  return String(value)
}

function formatCatalogStatus(status: DashboardCatalogLoadStatus): string {
  switch (status) {
    case 'loading':
      return 'Загрузка'
    case 'loaded':
      return 'Загружен'
    case 'error':
      return 'Ошибка'
    case 'idle':
    default:
      return 'Ожидание'
  }
}

function getMessage(
  state: DashboardRecoveryState,
  selectedDiagramName?: string | null,
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

interface TabButtonProps {
  label: string
  active: boolean
  onClick: () => void
}

function TabButton({ label, active, onClick }: TabButtonProps) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`px-3 py-1.5 text-xs font-medium rounded-t-md transition-colors border-b-2 ${active
          ? 'border-[#38bdf8] text-[#38bdf8] bg-[#0f172a]'
          : 'border-transparent text-[#94a3b8] hover:text-[#e2e8f0] hover:bg-[#0f172a]/50'
        }`}
    >
      {label}
    </button>
  )
}

export function DashboardDiagnosticsPanel({
  runtimeProjection,
  commandLifecycleByWidgetId = {},
  catalogStatus = 'idle',
  catalogError = null,
  telemetryValues,
  renderIssues,
  lastServerTimestamp = null,
  recoveryState = 'empty',
  transportStatus = 'idle',
  edgeAvailability = 'unknown',
  recoveryMessage,
  recoveryHint,
}: DashboardDiagnosticsPanelProps) {
  const [activeTab, setActiveTab] = useState<DiagnosticsTab>('status')

  const telemetryEntries = Object.entries(telemetryValues).sort(([left], [right]) =>
    left.localeCompare(right),
  )
  const widgets = runtimeProjection?.widgets ?? []

  const transportLabel = selectTransportStatusLabel(transportStatus)
  const edgeAvailabilityLabel = selectEdgeAvailabilityLabel(edgeAvailability)
  const statusMessage = recoveryMessage ?? getMessage(recoveryState)
  const statusHint = recoveryHint !== undefined ? recoveryHint : getHint(recoveryState)
  const isError =
    recoveryState === 'generic-error' || recoveryState === 'visual-rendering-error'
  const isReconnecting = transportStatus === 'reconnecting'

  return (
    <aside
      data-testid="dashboard-diagnostics-panel"
      className="rounded-t-lg border border-[#334155] bg-[#07111f]/95 text-[#e2e8f0] shadow-2xl backdrop-blur"
      aria-label="Диагностика диспетчеризации"
    >
      {/* Tab bar */}
      <div
        className="flex gap-1 border-b border-[#1f2a3d] px-3 pt-2"
        role="tablist"
        aria-label="Вкладки диагностики"
      >
        <TabButton label="Статус" active={activeTab === 'status'} onClick={() => setActiveTab('status')} />
        <TabButton label="Телеметрия" active={activeTab === 'telemetry'} onClick={() => setActiveTab('telemetry')} />
        <TabButton label="Привязки" active={activeTab === 'bindings'} onClick={() => setActiveTab('bindings')} />
        <TabButton label="Проблемы отрисовки" active={activeTab === 'render-issues'} onClick={() => setActiveTab('render-issues')} />
      </div>

      <div
        data-testid="dashboard-diagnostics-scroll-region"
        className="max-h-80 overflow-y-auto p-4"
      >
        {activeTab === 'status' && (
          <section aria-labelledby="dashboard-diagnostics-status">
            <h3 id="dashboard-diagnostics-status" className="text-sm font-semibold text-white">
              Статус
            </h3>
            <p
              className={`mt-2 text-sm ${isError ? 'text-[var(--color-danger)]' : 'text-[#94a3b8]'}`}
            >
              {statusMessage}
            </p>
            {statusHint && (
              <p className="mt-1 text-xs text-[#7f90a7]">{statusHint}</p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[#cbd5e1]">
              <p>Транспорт: {transportLabel}</p>
              <p>Объект: {edgeAvailabilityLabel}</p>
              <p>Каталог: {formatCatalogStatus(catalogStatus)}</p>
            </div>
            {catalogError ? (
              <p className="mt-2 text-xs text-[var(--color-warning)]">
                Ошибка каталога: {catalogError}
              </p>
            ) : null}
            {isReconnecting && (
              <p className="mt-2 text-xs text-[var(--color-warning)]">
                Транспорт переподключается. Последние отрисованные значения сохранены.
              </p>
            )}
            <p className="mt-3 text-xs text-[#64748b]">
              Последняя серверная метка времени: {lastServerTimestamp !== null ? String(lastServerTimestamp) : 'нет данных'}
            </p>
          </section>
        )}

        {activeTab === 'telemetry' && (
          <section aria-labelledby="dashboard-diagnostics-telemetry">
            <h3 id="dashboard-diagnostics-telemetry" className="text-sm font-semibold text-white">
              Телеметрия
            </h3>
            {telemetryEntries.length === 0 ? (
              <p className="mt-3 text-sm text-[#94a3b8]">Живые значения телеметрии еще не получены.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {telemetryEntries.map(([bindingKey, value]) => (
                  <li
                    key={bindingKey}
                    className="rounded-md border border-[#1f2a3d] bg-[#0f172a] px-3 py-2 text-sm"
                  >
                    <p className="font-medium text-white">{bindingKey}</p>
                    <p className="mt-1 text-xs text-[#94a3b8]">{formatRuntimeValue(value)}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {activeTab === 'bindings' && (
          <section aria-labelledby="dashboard-diagnostics-bindings">
            <h3 id="dashboard-diagnostics-bindings" className="text-sm font-semibold text-white">
              Привязки
            </h3>
            {widgets.length === 0 ? (
              <p className="mt-3 text-sm text-[#94a3b8]">В сохраненной мнемосхеме нет runtime-виджетов.</p>
            ) : (
              <ul className="mt-3 space-y-2" aria-label="Диагностика runtime-виджетов">
                {widgets.map((widget) => {
                  const commandProjection = runtimeProjection?.commandAvailabilityByWidgetId[widget.widgetId]
                  const commandLifecycle = commandLifecycleByWidgetId[widget.widgetId]

                  return (
                    <li
                      key={widget.widgetId}
                      data-testid={`dashboard-runtime-widget-${widget.widgetId}`}
                      aria-disabled={!widget.isSupported ? 'true' : undefined}
                      className={`rounded-md border bg-[#0f172a] px-3 py-2 text-sm text-white ${widget.isSupported ? 'border-[#1f2a3d]' : 'pointer-events-none select-none border-dashed border-[#475569] opacity-75'
                        }`}
                    >
                      <p className="font-medium">{widget.widgetId}</p>
                      <p className="text-xs text-[#94a3b8]">{widget.widgetType}</p>
                      {!widget.isSupported ? (
                        <p className="mt-1 text-xs text-[#94a3b8]">
                          Только отображение. Не поддерживается в MVP мониторинга.
                        </p>
                      ) : !widget.isBound ? (
                        <p className="mt-1 text-xs text-[#94a3b8]">Значение: не привязано</p>
                      ) : (
                        <p className="mt-1 text-xs text-[#94a3b8]">
                          Значение: {formatRuntimeValue(widget.value)}
                        </p>
                      )}
                      {commandProjection ? (
                        <p className="mt-1 text-xs text-[#94a3b8]">
                          Команда: {commandProjection.isExecutable ? 'доступна' : `недоступна (${commandProjection.reason})`}
                        </p>
                      ) : null}
                      {commandLifecycle ? (
                        <div className="mt-1 space-y-1 text-xs text-[#94a3b8]">
                          <p data-testid={`dashboard-diagnostics-command-lifecycle-${widget.widgetId}`}>
                            Жизненный цикл команды: {commandLifecycle.status}
                          </p>
                          {commandLifecycle.failureKind ? (
                            <p data-testid={`dashboard-diagnostics-command-failure-${widget.widgetId}`}>
                              Ошибка выполнения: {commandLifecycle.failureKind}
                            </p>
                          ) : null}
                          {commandLifecycle.error ? (
                            <p data-testid={`dashboard-diagnostics-command-last-error-${widget.widgetId}`}>
                              Последняя ошибка: {commandLifecycle.error}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        )}

        {activeTab === 'render-issues' && (
          <section aria-labelledby="dashboard-diagnostics-render-issues">
            <h3 id="dashboard-diagnostics-render-issues" className="text-sm font-semibold text-white">
              Проблемы отрисовки
            </h3>
            {renderIssues.length === 0 ? (
              <p className="mt-3 text-sm text-[#94a3b8]">Проблемы визуальной отрисовки не обнаружены.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {renderIssues.map((issue, index) => (
                  <li
                    key={`${issue.kind}-${issue.elementId ?? 'layout'}-${index}`}
                    className="rounded-md border border-[#1f2a3d] bg-[#0f172a] px-3 py-2 text-sm"
                  >
                    <p className="font-medium text-white">
                      {issue.severity}: {issue.kind}
                    </p>
                    <p className="mt-1 text-xs text-[#94a3b8]">{issue.message}</p>
                    {issue.elementId ? (
                      <p className="mt-1 text-xs text-[#64748b]">Элемент: {issue.elementId}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </aside>
  )
}
