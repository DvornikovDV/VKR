import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronUp, Info, Loader2, Maximize2, Monitor } from 'lucide-react'
import { DashboardDiagnosticsPanel } from '@/features/dashboard/components/DashboardDiagnosticsPanel'
import { DashboardVisualSurface } from '@/features/dashboard/components/DashboardVisualSurface'
import { normalizeDashboardRuntimeLayout } from '@/features/dashboard/model/runtimeLayout'
import {
  createDashboardInitialViewport,
  panDashboardViewport,
  zoomDashboardViewport,
} from '@/features/dashboard/model/viewport'
import type {
  DashboardDiagramDocument,
  DashboardDiagramSummary,
  DashboardEdgeAvailability,
  DashboardMetricValueByBindingKey,
  DashboardRecoveryState,
  DashboardRuntimeLayout,
  DashboardRuntimeProjection,
  DashboardTransportStatus,
  DashboardTrustedEdgeServer,
} from '@/features/dashboard/model/types'
import type {
  DashboardViewportSize,
  DashboardViewportState,
} from '@/features/dashboard/model/viewport'

interface DashboardRuntimeSurfaceProps {
  isActiveContext: boolean
  recoveryState: DashboardRecoveryState
  savedDiagram: DashboardDiagramDocument | null
  runtimeProjection: DashboardRuntimeProjection | null
  transportStatus: DashboardTransportStatus
  edgeAvailability: DashboardEdgeAvailability
  latestMetricValueByBindingKey: DashboardMetricValueByBindingKey
  lastServerTimestamp?: number | null
  diagnosticsOpen: boolean
  onToggleDiagnostics: () => void
  // Toolbar props
  diagrams: DashboardDiagramSummary[]
  selectedDiagramId: string | null
  edgeOptions: DashboardTrustedEdgeServer[]
  selectedEdgeId: string | null
  disabled?: boolean
  onDiagramChange: (diagramId: string | null) => void
  onEdgeChange: (edgeId: string | null) => void
  // Error info for status tab
  errorMessage?: string | null
}

const FALLBACK_VIEWPORT_SIZE: DashboardViewportSize = {
  width: 960,
  height: 540,
}

function normalizeMeasuredSize(width: number, height: number): DashboardViewportSize | null {
  const normalizedWidth = Math.round(width)
  const normalizedHeight = Math.round(height)

  if (normalizedWidth <= 0 || normalizedHeight <= 0) {
    return null
  }

  return {
    width: normalizedWidth,
    height: normalizedHeight,
  }
}

function isSameViewportSize(left: DashboardViewportSize, right: DashboardViewportSize): boolean {
  return left.width === right.width && left.height === right.height
}

function createFallbackRuntimeLayout(): DashboardRuntimeLayout {
  return normalizeDashboardRuntimeLayout({ widgets: [] })
}

function toSelectValue(value: string | null): string {
  return value ?? ''
}

function fromSelectValue(value: string): string | null {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function hasOptionWithId<T extends { _id: string }>(options: T[], id: string | null): boolean {
  return Boolean(id) && options.some((option) => option._id === id)
}

function getRecoveryLabel(state: DashboardRecoveryState): string {
  switch (state) {
    case 'empty':
      return 'Select Diagram and Edge Server to start monitoring'
    case 'loading':
      return 'Loading...'
    case 'generic-error':
      return 'Failed to load dashboard context'
    case 'invalid-selection':
      return 'Invalid selection'
    case 'missing-binding-profile':
      return 'No saved binding profile for this Diagram + Edge pair'
    case 'invalid-binding-profile':
      return 'Saved binding profile references stale widget ids'
    case 'visual-rendering-error':
      return 'Saved diagram visual layout cannot be rendered'
    case 'partial-visual-rendering':
      return 'Saved diagram rendered with recoverable visual issues'
    case 'ready':
      return 'Ready'
    default:
      return 'Dashboard state is unavailable'
  }
}

function RecoveryPlaceholder({
  state,
  onOpenDetails,
}: {
  state: DashboardRecoveryState
  onOpenDetails: () => void
}) {
  const isError =
    state === 'generic-error' ||
    state === 'invalid-selection' ||
    state === 'missing-binding-profile' ||
    state === 'invalid-binding-profile' ||
    state === 'visual-rendering-error'
  const isLoading = state === 'loading'
  const label = getRecoveryLabel(state)

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 min-h-0">
      {isLoading ? (
        <Loader2 className="animate-spin text-[#38bdf8]" size={32} aria-hidden="true" />
      ) : isError ? (
        <AlertTriangle className="text-[var(--color-danger)]" size={32} aria-hidden="true" />
      ) : (
        <Monitor className="text-[#475569]" size={32} aria-hidden="true" />
      )}
      <p className={`text-sm text-center ${isError ? 'text-[var(--color-danger)]' : 'text-[#94a3b8]'}`}>
        {label}
      </p>
      {isError && (
        <button
          type="button"
          onClick={onOpenDetails}
          className="text-xs text-[#38bdf8] underline underline-offset-2 hover:text-[#7dd3fc] transition-colors"
        >
          Open Details for more info
        </button>
      )}
    </div>
  )
}

export function DashboardRuntimeSurface({
  isActiveContext,
  recoveryState,
  savedDiagram,
  runtimeProjection,
  transportStatus,
  edgeAvailability,
  latestMetricValueByBindingKey,
  lastServerTimestamp = null,
  diagnosticsOpen,
  onToggleDiagnostics,
  diagrams,
  selectedDiagramId,
  edgeOptions,
  selectedEdgeId,
  disabled = false,
  onDiagramChange,
  onEdgeChange,
  errorMessage = null,
}: DashboardRuntimeSurfaceProps) {
  const runtimeLayout = useMemo(
    () => (savedDiagram ? normalizeDashboardRuntimeLayout(savedDiagram.layout) : null),
    [savedDiagram],
  )

  const canvasContainerRef = useRef<HTMLDivElement | null>(null)
  const [containerSize, setContainerSize] = useState<DashboardViewportSize>(FALLBACK_VIEWPORT_SIZE)

  const [viewport, setViewport] = useState<DashboardViewportState>(() =>
    createDashboardInitialViewport(createFallbackRuntimeLayout().diagramBounds, FALLBACK_VIEWPORT_SIZE),
  )
  const showCanvas = Boolean(isActiveContext && savedDiagram && runtimeLayout)

  // Recalculate viewport when runtimeLayout changes, using current containerSize
  useEffect(() => {
    if (!runtimeLayout) {
      return
    }

    setViewport(createDashboardInitialViewport(runtimeLayout.diagramBounds, containerSize))
  }, [runtimeLayout]) // eslint-disable-line react-hooks/exhaustive-deps

  // Observe canvas container size and keep containerSize + viewport in sync
  useEffect(() => {
    if (!showCanvas || !runtimeLayout) {
      return
    }

    const container = canvasContainerRef.current
    if (!container || typeof ResizeObserver === 'undefined') {
      return
    }

    let lastAppliedSize: DashboardViewportSize | null = null

    const applyContainerSize = (width: number, height: number) => {
      const nextSize = normalizeMeasuredSize(width, height)
      if (!nextSize) {
        return
      }

      if (lastAppliedSize && isSameViewportSize(lastAppliedSize, nextSize)) {
        return
      }

      lastAppliedSize = nextSize
      setContainerSize((currentSize) =>
        isSameViewportSize(currentSize, nextSize) ? currentSize : nextSize,
      )
      setViewport((currentViewport) =>
        currentViewport.mode === 'manual'
          ? currentViewport
          : createDashboardInitialViewport(runtimeLayout.diagramBounds, nextSize),
      )
    }

    const initialRect = container.getBoundingClientRect()
    applyContainerSize(initialRect.width, initialRect.height)

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) {
        return
      }

      const { width, height } = entry.contentRect
      applyContainerSize(width, height)
    })

    observer.observe(container)

    return () => {
      observer.disconnect()
    }
  }, [runtimeLayout, showCanvas])

  const isEdgeDisabled = disabled || !selectedDiagramId || edgeOptions.length === 0
  const hasSelectedDiagramOption = hasOptionWithId(diagrams, selectedDiagramId)
  const hasSelectedEdgeOption = hasOptionWithId(edgeOptions, selectedEdgeId)

  return (
    <section className="relative flex flex-col overflow-hidden h-full">
      {/* Inline header bar */}
      <div className="flex flex-shrink-0 items-center gap-2 border-b border-[#1f2a3d] bg-[#0a1220] px-3 py-2">
        {/* Diagram select */}
        <label className="flex items-center gap-1.5 text-xs text-[#cbd5e1]">
          <span className="shrink-0">Diagram</span>
          <select
            aria-label="Diagram"
            value={toSelectValue(selectedDiagramId)}
            disabled={disabled}
            onChange={(event) => onDiagramChange(fromSelectValue(event.target.value))}
            className="rounded border border-[#334155] bg-[#0f1929] px-2 py-1 text-xs text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            <option value="">Select diagram</option>
            {selectedDiagramId && !hasSelectedDiagramOption ? (
              <option value={selectedDiagramId}>Loading selected diagram...</option>
            ) : null}
            {diagrams.map((diagram) => (
              <option key={diagram._id} value={diagram._id}>
                {diagram.name}
              </option>
            ))}
          </select>
        </label>

        {/* Edge Server select */}
        <label className="flex items-center gap-1.5 text-xs text-[#cbd5e1]">
          <span className="shrink-0">Edge Server</span>
          <select
            aria-label="Edge Server"
            value={toSelectValue(selectedEdgeId)}
            disabled={isEdgeDisabled}
            onChange={(event) => onEdgeChange(fromSelectValue(event.target.value))}
            className="rounded border border-[#334155] bg-[#0f1929] px-2 py-1 text-xs text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            <option value="">Select edge server</option>
            {selectedEdgeId && !hasSelectedEdgeOption ? (
              <option value={selectedEdgeId}>Loading selected edge server...</option>
            ) : null}
            {edgeOptions.map((edge) => (
              <option key={edge._id} value={edge._id}>
                {edge.name}
              </option>
            ))}
          </select>
        </label>

        <div className="ml-auto flex items-center gap-1">
          {/* Fit to View button */}
          {showCanvas && (
            <button
              type="button"
              aria-label="Fit to view"
              title="Fit to view"
              onClick={() =>
                setViewport(createDashboardInitialViewport(runtimeLayout!.diagramBounds, containerSize))
              }
              className="inline-flex h-7 w-7 items-center justify-center rounded border border-[#334155] bg-[#0f172a] text-[#e2e8f0] transition-colors hover:bg-[#1e293b]"
            >
              <Maximize2 size={14} aria-hidden="true" />
            </button>
          )}

          {/* Details button */}
          <button
            type="button"
            aria-expanded={diagnosticsOpen}
            onClick={onToggleDiagnostics}
            className="inline-flex h-7 items-center gap-1.5 rounded border border-[#334155] bg-[#0f172a] px-2 text-xs font-medium text-white transition-colors hover:bg-[#1e293b]"
          >
            <Info aria-hidden="true" size={13} />
            Details
          </button>
        </div>
      </div>

      {/* Canvas / Recovery area */}
      <div className="relative flex flex-1 flex-col min-h-0 bg-[radial-gradient(circle_at_top,_#132238,_#0a1220_58%)]">
        {showCanvas ? (
          <div className="relative min-h-0 min-w-0 flex-1">
            <div ref={canvasContainerRef} className="absolute inset-x-3 bottom-3 top-2 overflow-hidden">
              <DashboardVisualSurface
                runtimeLayout={runtimeLayout!}
                runtimeProjection={runtimeProjection}
                viewport={viewport}
                viewportSize={containerSize}
                onPanViewport={(pan) => setViewport((current) => panDashboardViewport(current, pan))}
                onZoomAtCursor={(anchor, factor) =>
                  setViewport((current) => zoomDashboardViewport(current, { factor, anchor }))
                }
              />
            </div>
          </div>
        ) : (
          <RecoveryPlaceholder state={recoveryState} onOpenDetails={onToggleDiagnostics} />
        )}

        {/* Diagnostics bottom handle */}
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
              recoveryState={recoveryState}
              transportStatus={transportStatus}
              edgeAvailability={edgeAvailability}
              recoveryMessage={errorMessage ?? undefined}
            />
          </div>
        ) : null}

        {transportStatus === 'reconnecting' && (
          <p className="absolute bottom-14 left-3 z-10 text-xs text-[var(--color-warning)]">
            Transport reconnecting. Displaying last received values.
          </p>
        )}
      </div>
    </section>
  )
}
