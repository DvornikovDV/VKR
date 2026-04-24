import type {
  DashboardMetricValueByBindingKey,
  DashboardRenderIssue,
  DashboardRuntimeProjection,
  DashboardRuntimeValue,
} from '@/features/dashboard/model/types'

interface DashboardDiagnosticsPanelProps {
  runtimeProjection: DashboardRuntimeProjection | null
  telemetryValues: DashboardMetricValueByBindingKey
  renderIssues: DashboardRenderIssue[]
  lastServerTimestamp?: number | null
}

function formatRuntimeValue(value: DashboardRuntimeValue): string {
  if (value === null) {
    return 'null'
  }

  return String(value)
}

export function DashboardDiagnosticsPanel({
  runtimeProjection,
  telemetryValues,
  renderIssues,
  lastServerTimestamp = null,
}: DashboardDiagnosticsPanelProps) {
  const telemetryEntries = Object.entries(telemetryValues).sort(([left], [right]) =>
    left.localeCompare(right),
  )
  const widgets = runtimeProjection?.widgets ?? []

  return (
    <aside
      data-testid="dashboard-diagnostics-panel"
      className="rounded-t-lg border border-[#334155] bg-[#07111f]/95 text-[#e2e8f0] shadow-2xl backdrop-blur"
      aria-label="Dashboard diagnostics"
    >
      <div
        data-testid="dashboard-diagnostics-scroll-region"
        className="max-h-80 overflow-y-auto p-4"
      >
        <div className="grid gap-4 lg:grid-cols-3">
          <section aria-labelledby="dashboard-diagnostics-telemetry">
            <h3 id="dashboard-diagnostics-telemetry" className="text-sm font-semibold text-white">
              Telemetry
            </h3>
            <p className="mt-1 text-xs text-[#94a3b8]">
              Last server timestamp: {lastServerTimestamp !== null ? String(lastServerTimestamp) : 'n/a'}
            </p>
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

          <section aria-labelledby="dashboard-diagnostics-bindings">
            <h3 id="dashboard-diagnostics-bindings" className="text-sm font-semibold text-white">
              Bindings
            </h3>
            {widgets.length === 0 ? (
              <p className="mt-3 text-sm text-[#94a3b8]">Saved diagram has no runtime widgets.</p>
            ) : (
              <ul className="mt-3 space-y-2" aria-label="Runtime widget diagnostics">
                {widgets.map((widget) => (
                  <li
                    key={widget.widgetId}
                    data-testid={`dashboard-runtime-widget-${widget.widgetId}`}
                    aria-disabled={!widget.isSupported ? 'true' : undefined}
                    className={`rounded-md border bg-[#0f172a] px-3 py-2 text-sm text-white ${
                      widget.isSupported ? 'border-[#1f2a3d]' : 'pointer-events-none select-none border-dashed border-[#475569] opacity-75'
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
                  </li>
                ))}
              </ul>
            )}
          </section>

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
        </div>
      </div>
    </aside>
  )
}
