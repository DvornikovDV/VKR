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
      return 'Loading'
    case 'loaded':
      return 'Loaded'
    case 'error':
      return 'Error'
    case 'idle':
    default:
      return 'Idle'
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
        return 'Select an edge server to start monitoring.'
      }
      return 'Select a diagram to start monitoring.'
    case 'loading':
      return 'Loading dashboard context...'
    case 'generic-error':
      return errorMessage?.trim() || 'Failed to load dashboard context.'
    case 'invalid-selection':
      return 'Invalid dashboard selection.'
    case 'missing-binding-profile':
      return 'No saved binding profile for the selected Diagram + Edge pair.'
    case 'invalid-binding-profile':
      return 'Saved binding profile references stale widget ids.'
    case 'visual-rendering-error':
      return 'Saved diagram visual layout cannot be rendered.'
    case 'partial-visual-rendering':
      return 'Saved diagram rendered with recoverable visual issues.'
    case 'ready':
      return 'Monitoring context resolved.'
    default:
      return 'Dashboard state is unavailable.'
  }
}

function getHint(state: DashboardRecoveryState): string | null {
  switch (state) {
    case 'empty':
      return 'Dashboard starts monitoring after Diagram and Edge Server are both selected.'
    case 'loading':
      return 'Resolving saved diagram and binding profile from cloud contracts.'
    case 'invalid-selection':
      return 'Choose a valid Diagram and Edge pair from the selectors above.'
    case 'missing-binding-profile':
      return 'Create or save bindings in Constructor, then return to Dashboard monitoring.'
    case 'invalid-binding-profile':
      return 'Saved binding profile needs a refresh because widget ids no longer match.'
    case 'visual-rendering-error':
      return 'Open the saved diagram in Constructor and restore its visual layout before monitoring.'
    case 'partial-visual-rendering':
      return 'Renderable visual elements stay visible while damaged saved elements are reported below.'
    case 'ready':
      return 'Live telemetry updates are applied from the selected Edge subscription.'
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
      aria-label="Dashboard diagnostics"
    >
      {/* Tab bar */}
      <div
        className="flex gap-1 border-b border-[#1f2a3d] px-3 pt-2"
        role="tablist"
        aria-label="Diagnostics tabs"
      >
        <TabButton label="Status" active={activeTab === 'status'} onClick={() => setActiveTab('status')} />
        <TabButton label="Telemetry" active={activeTab === 'telemetry'} onClick={() => setActiveTab('telemetry')} />
        <TabButton label="Bindings" active={activeTab === 'bindings'} onClick={() => setActiveTab('bindings')} />
        <TabButton label="Render issues" active={activeTab === 'render-issues'} onClick={() => setActiveTab('render-issues')} />
      </div>

      <div
        data-testid="dashboard-diagnostics-scroll-region"
        className="max-h-80 overflow-y-auto p-4"
      >
        {activeTab === 'status' && (
          <section aria-labelledby="dashboard-diagnostics-status">
            <h3 id="dashboard-diagnostics-status" className="text-sm font-semibold text-white">
              Status
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
              <p>Transport: {transportLabel}</p>
              <p>Edge: {edgeAvailabilityLabel}</p>
              <p>Catalog: {formatCatalogStatus(catalogStatus)}</p>
            </div>
            {catalogError ? (
              <p className="mt-2 text-xs text-[var(--color-warning)]">
                Catalog error: {catalogError}
              </p>
            ) : null}
            {isReconnecting && (
              <p className="mt-2 text-xs text-[var(--color-warning)]">
                Transport reconnecting. Last rendered values are preserved.
              </p>
            )}
            <p className="mt-3 text-xs text-[#64748b]">
              Last server timestamp: {lastServerTimestamp !== null ? String(lastServerTimestamp) : 'n/a'}
            </p>
          </section>
        )}

        {activeTab === 'telemetry' && (
          <section aria-labelledby="dashboard-diagnostics-telemetry">
            <h3 id="dashboard-diagnostics-telemetry" className="text-sm font-semibold text-white">
              Telemetry
            </h3>
            {telemetryEntries.length === 0 ? (
              <p className="mt-3 text-sm text-[#94a3b8]">No live telemetry values received yet.</p>
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
              Bindings
            </h3>
            {widgets.length === 0 ? (
              <p className="mt-3 text-sm text-[#94a3b8]">Saved diagram has no runtime widgets.</p>
            ) : (
              <ul className="mt-3 space-y-2" aria-label="Runtime widget diagnostics">
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
                          Visible only. Unsupported in monitoring MVP.
                        </p>
                      ) : !widget.isBound ? (
                        <p className="mt-1 text-xs text-[#94a3b8]">Value: unbound</p>
                      ) : (
                        <p className="mt-1 text-xs text-[#94a3b8]">
                          Value: {formatRuntimeValue(widget.value)}
                        </p>
                      )}
                      {commandProjection ? (
                        <p className="mt-1 text-xs text-[#94a3b8]">
                          Command: {commandProjection.isExecutable ? 'available' : `unavailable (${commandProjection.reason})`}
                        </p>
                      ) : null}
                      {commandLifecycle ? (
                        <p className="mt-1 text-xs text-[#94a3b8]">
                          Command lifecycle: {commandLifecycle.status}
                          {commandLifecycle.error ? ` (${commandLifecycle.error})` : ''}
                        </p>
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
              Render issues
            </h3>
            {renderIssues.length === 0 ? (
              <p className="mt-3 text-sm text-[#94a3b8]">No visual render issues reported.</p>
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
                      <p className="mt-1 text-xs text-[#64748b]">Element: {issue.elementId}</p>
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
