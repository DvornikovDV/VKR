import { useEffect, useMemo, useState } from 'react'
import { DashboardViewportControls } from '@/features/dashboard/components/DashboardViewportControls'
import { DashboardVisualSurface } from '@/features/dashboard/components/DashboardVisualSurface'
import { normalizeDashboardRuntimeLayout } from '@/features/dashboard/model/runtimeLayout'
import {
  createDashboardInitialViewport,
  panDashboardViewport,
  resetDashboardViewport,
  zoomDashboardViewport,
} from '@/features/dashboard/model/viewport'
import type {
  DashboardDiagramDocument,
  DashboardEdgeAvailability,
  DashboardMetricValueByBindingKey,
  DashboardRuntimeProjection,
  DashboardRuntimeLayout,
  DashboardRuntimeValue,
  DashboardTransportStatus,
} from '@/features/dashboard/model/types'
import type {
  DashboardViewportSize,
  DashboardViewportState,
} from '@/features/dashboard/model/viewport'

interface DashboardRuntimeSurfaceProps {
  isActiveContext: boolean
  savedDiagram: DashboardDiagramDocument | null
  runtimeProjection: DashboardRuntimeProjection | null
  transportStatus: DashboardTransportStatus
  edgeAvailability: DashboardEdgeAvailability
  latestMetricValueByBindingKey: DashboardMetricValueByBindingKey
  lastServerTimestamp?: number | null
}

const VISUAL_VIEWPORT_SIZE: DashboardViewportSize = {
  width: 960,
  height: 540,
}

function formatRuntimeValue(value: DashboardRuntimeValue): string {
  if (value === null) {
    return 'null'
  }

  return String(value)
}

function selectRuntimeWidgetClassName(isSupported: boolean): string {
  const baseClassName =
    'rounded-md border border-[var(--color-surface-border)] bg-[var(--color-surface-200)] px-3 py-2 text-sm text-white transition-opacity duration-150'

  if (isSupported) {
    return baseClassName
  }

  return `${baseClassName} pointer-events-none select-none border-dashed opacity-75`
}

function createFallbackRuntimeLayout(): DashboardRuntimeLayout {
  return normalizeDashboardRuntimeLayout({ widgets: [] })
}

export function DashboardRuntimeSurface({
  isActiveContext,
  savedDiagram,
  runtimeProjection,
  transportStatus,
  edgeAvailability,
  latestMetricValueByBindingKey,
  lastServerTimestamp = null,
}: DashboardRuntimeSurfaceProps) {
  const runtimeLayout = useMemo(
    () => (savedDiagram ? normalizeDashboardRuntimeLayout(savedDiagram.layout) : null),
    [savedDiagram],
  )
  const [viewport, setViewport] = useState<DashboardViewportState>(() =>
    createDashboardInitialViewport(createFallbackRuntimeLayout().diagramBounds, VISUAL_VIEWPORT_SIZE),
  )

  useEffect(() => {
    if (!runtimeLayout) {
      return
    }

    setViewport(createDashboardInitialViewport(runtimeLayout.diagramBounds, VISUAL_VIEWPORT_SIZE))
  }, [runtimeLayout])

  if (!isActiveContext) {
    return (
      <section className="rounded-lg border border-[var(--color-surface-border)] bg-[var(--color-surface-100)] p-4">
        <h2 className="text-lg font-semibold text-white">Live Runtime Surface</h2>
        <p className="mt-2 text-sm text-[#94a3b8]">
          Monitoring session is inactive. Select Diagram and Edge Server to start.
        </p>
      </section>
    )
  }

  const metricEntries = Object.entries(latestMetricValueByBindingKey).sort(([left], [right]) =>
    left.localeCompare(right),
  )
  const hasValues = metricEntries.length > 0
  const runtimeWidgets = runtimeProjection?.widgets ?? []
  const hasRuntimeWidgets = runtimeWidgets.length > 0

  return (
    <section className="rounded-lg border border-[var(--color-surface-border)] bg-[var(--color-surface-100)] p-4">
      <h2 className="text-lg font-semibold text-white">Live Runtime Surface</h2>

      <div className="mt-2 flex flex-wrap gap-4 text-xs text-[#94a3b8]">
        <p>Transport state: {transportStatus}</p>
        <p>Edge availability: {edgeAvailability}</p>
        <p>
          Last server timestamp: {lastServerTimestamp !== null ? String(lastServerTimestamp) : 'n/a'}
        </p>
      </div>

      {transportStatus === 'reconnecting' && (
        <p className="mt-2 text-xs text-[var(--color-warning)]">
          Transport reconnecting. Displaying last received values.
        </p>
      )}

      <div className="mt-4 space-y-3">
        {!savedDiagram || !runtimeLayout ? (
          <p className="text-sm text-[#94a3b8]">Saved diagram snapshot is unavailable.</p>
        ) : (
          <>
            <DashboardViewportControls
              viewport={viewport}
              onZoomIn={() =>
                setViewport((current) =>
                  zoomDashboardViewport(current, {
                    factor: 1.25,
                    anchor: {
                      x: VISUAL_VIEWPORT_SIZE.width / 2,
                      y: VISUAL_VIEWPORT_SIZE.height / 2,
                    },
                  }),
                )
              }
              onZoomOut={() =>
                setViewport((current) =>
                  zoomDashboardViewport(current, {
                    factor: 0.8,
                    anchor: {
                      x: VISUAL_VIEWPORT_SIZE.width / 2,
                      y: VISUAL_VIEWPORT_SIZE.height / 2,
                    },
                  }),
                )
              }
              onFitToView={() =>
                setViewport(createDashboardInitialViewport(runtimeLayout.diagramBounds, VISUAL_VIEWPORT_SIZE))
              }
              onReset={() => setViewport(resetDashboardViewport(runtimeLayout.diagramBounds))}
              onPan={(pan) => setViewport((current) => panDashboardViewport(current, pan))}
            />
            <DashboardVisualSurface
              runtimeLayout={runtimeLayout}
              runtimeProjection={runtimeProjection}
              viewport={viewport}
              viewportSize={VISUAL_VIEWPORT_SIZE}
              onPanViewport={(pan) => setViewport((current) => panDashboardViewport(current, pan))}
            />
          </>
        )}
      </div>

      <div className="mt-4">
        <h3 className="text-sm font-semibold text-white">Runtime diagnostics</h3>
        {!savedDiagram ? (
          <p className="mt-2 text-sm text-[#94a3b8]">Saved diagram snapshot is unavailable.</p>
        ) : !hasRuntimeWidgets ? (
          <p className="mt-2 text-sm text-[#94a3b8]">Saved diagram has no runtime widgets.</p>
        ) : (
          <ul className="mt-2 space-y-2" aria-label="Runtime widget diagnostics">
            {runtimeWidgets.map((widget) => {
              const isNonOperative = !widget.isSupported

              return (
                <li
                  key={widget.widgetId}
                  data-testid={`dashboard-runtime-widget-${widget.widgetId}`}
                  aria-disabled={isNonOperative ? 'true' : undefined}
                  className={selectRuntimeWidgetClassName(widget.isSupported)}
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
              )
            })}
          </ul>
        )}
      </div>

      <h3 className="mt-4 text-sm font-semibold text-white">Telemetry by binding key</h3>
      {!hasValues ? (
        <p className="mt-3 text-sm text-[#94a3b8]">No live telemetry values received yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {metricEntries.map(([bindingKey, value]) => (
            <li
              key={bindingKey}
              className="flex items-center justify-between rounded-md border border-[var(--color-surface-border)] bg-[var(--color-surface-200)] px-3 py-2 text-sm text-white"
            >
              <span>{bindingKey}</span>
              <span>{formatRuntimeValue(value)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
