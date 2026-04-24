import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { DashboardDiagnosticsPanel } from '@/features/dashboard/components/DashboardDiagnosticsPanel'
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
  diagnosticsOpen: boolean
  onToggleDiagnostics: () => void
}

const VISUAL_VIEWPORT_SIZE: DashboardViewportSize = {
  width: 960,
  height: 540,
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
  diagnosticsOpen,
  onToggleDiagnostics,
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

  return (
    <section className="relative overflow-hidden rounded-lg border border-[var(--color-surface-border)] bg-[var(--color-surface-100)] p-4 pb-16">
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

      <div className="absolute inset-x-3 bottom-3 z-10 flex justify-center">
        <button
          type="button"
          aria-label={diagnosticsOpen ? 'Close diagnostics' : 'Open diagnostics'}
          aria-expanded={diagnosticsOpen}
          onClick={onToggleDiagnostics}
          className="inline-flex items-center gap-2 rounded-full border border-[#334155] bg-[#020617] px-4 py-2 text-xs font-medium text-[#e2e8f0] shadow-lg transition-colors hover:bg-[#0f172a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#38bdf8]"
        >
          {diagnosticsOpen ? <ChevronDown aria-hidden="true" size={14} /> : <ChevronUp aria-hidden="true" size={14} />}
          Diagnostics
        </button>
      </div>

      {diagnosticsOpen ? (
        <div className="absolute inset-x-3 bottom-14 z-10">
          <DashboardDiagnosticsPanel
            runtimeProjection={runtimeProjection}
            telemetryValues={latestMetricValueByBindingKey}
            renderIssues={runtimeLayout?.renderIssues ?? []}
            lastServerTimestamp={lastServerTimestamp}
          />
        </div>
      ) : null}
    </section>
  )
}
