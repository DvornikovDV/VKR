import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { getEdgeServerCatalog, type EdgeCapabilitiesCatalogSnapshot } from '@/shared/api/edgeServers'
import {
  getTelemetryHistory,
  TELEMETRY_HISTORY_MAX_POINTS,
  type TelemetryHistoryResponse,
} from '@/shared/api/telemetryHistory'
import { DispatchTrendsChart } from '@/features/dispatch/components/DispatchTrendsChart'
import { DispatchTrendsControls } from '@/features/dispatch/components/DispatchTrendsControls'
import { DispatchTrendsTable } from '@/features/dispatch/components/DispatchTrendsTable'
import {
  createDispatchTrendsDefaultFilter,
  createDispatchTrendsRequestGuard,
  createDispatchTrendsRequestKey,
  isDispatchTrendsRequestCurrent,
  projectDispatchTrendsHistoryResponse,
  selectDispatchTrendsNumericMetricOptions,
  type DispatchTrendsFilter,
  type DispatchTrendsLoadState,
  type DispatchTrendsProjection,
  type DispatchTrendsRequestDescriptor,
  type DispatchTrendsRequestGuard,
} from '@/features/dispatch/model/trends'
import type { DispatchWorkspaceContextSnapshot } from '@/features/dispatch/model/types'

interface DispatchTrendsTabProps {
  workspaceContext: DispatchWorkspaceContextSnapshot
  className?: string
}

type CatalogLoadState = 'idle' | 'loading' | 'ready' | 'error'

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }

  return fallback
}

function parseTime(value: string): number | null {
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : null
}

function buildValidationMessage(
  filter: DispatchTrendsFilter,
  catalogStatus: CatalogLoadState,
  metricOptionsCount: number,
  workspaceContext: DispatchWorkspaceContextSnapshot,
): string | null {
  if (workspaceContext.status === 'loading') {
    return 'Dispatch context is still loading.'
  }

  if (workspaceContext.errorMessage) {
    return workspaceContext.errorMessage
  }

  if (!filter.edgeId) {
    return 'Select an Edge Server before loading trends.'
  }

  if (catalogStatus === 'loading') {
    return 'Selected Edge catalog is still loading.'
  }

  if (catalogStatus === 'error') {
    return 'Selected Edge catalog could not be loaded.'
  }

  if (metricOptionsCount === 0) {
    return 'Selected Edge catalog has no numeric telemetry metrics.'
  }

  if (!filter.deviceId || !filter.metric) {
    return 'Select a numeric telemetry metric.'
  }

  const dateStart = parseTime(filter.dateStart)
  const dateEnd = parseTime(filter.dateEnd)

  if (dateStart === null || dateEnd === null) {
    return 'Select a valid time range.'
  }

  if (dateStart >= dateEnd) {
    return 'Start date must be earlier than end date.'
  }

  if (
    !Number.isInteger(filter.maxPoints) ||
    filter.maxPoints < 1 ||
    filter.maxPoints > TELEMETRY_HISTORY_MAX_POINTS
  ) {
    return `Max points must be between 1 and ${TELEMETRY_HISTORY_MAX_POINTS}.`
  }

  return null
}

function createRequestDescriptor(filter: DispatchTrendsFilter): DispatchTrendsRequestDescriptor | null {
  if (!filter.edgeId || !filter.deviceId || !filter.metric) {
    return null
  }

  return {
    edgeId: filter.edgeId,
    deviceId: filter.deviceId,
    metric: filter.metric,
    dateStart: filter.dateStart,
    dateEnd: filter.dateEnd,
    maxPoints: filter.maxPoints,
  }
}

function toHelperParams(descriptor: DispatchTrendsRequestDescriptor) {
  return {
    edgeId: descriptor.edgeId,
    deviceId: descriptor.deviceId,
    metric: descriptor.metric,
    date_start: descriptor.dateStart,
    date_end: descriptor.dateEnd,
    maxPoints: descriptor.maxPoints,
  }
}

function isCatalogForSelectedEdge(
  catalog: EdgeCapabilitiesCatalogSnapshot,
  edgeId: string,
): boolean {
  return catalog.edgeServerId === edgeId
}

export function DispatchTrendsTab({
  workspaceContext,
  className,
}: DispatchTrendsTabProps) {
  const selectedEdgeId = workspaceContext.selection.edgeId
  const selectedEdgeName = workspaceContext.selection.selectedEdge?.name ?? selectedEdgeId
  const [filter, setFilter] = useState<DispatchTrendsFilter>(() =>
    createDispatchTrendsDefaultFilter(selectedEdgeId),
  )
  const [catalog, setCatalog] = useState<EdgeCapabilitiesCatalogSnapshot | null>(null)
  const [catalogStatus, setCatalogStatus] = useState<CatalogLoadState>('idle')
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [historyState, setHistoryState] = useState<DispatchTrendsLoadState>('idle')
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [projection, setProjection] = useState<DispatchTrendsProjection | null>(null)
  const catalogRequestIdRef = useRef(0)
  const historyRequestIdRef = useRef(0)
  const activeHistoryGuardRef = useRef<DispatchTrendsRequestGuard | null>(null)
  const currentDescriptorKeyRef = useRef<string | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    setFilter(createDispatchTrendsDefaultFilter(selectedEdgeId))
    setProjection(null)
    setHistoryState('idle')
    setHistoryError(null)
    activeHistoryGuardRef.current = null
    currentDescriptorKeyRef.current = null
  }, [selectedEdgeId])

  useEffect(() => {
    if (!selectedEdgeId || !workspaceContext.selection.selectedEdge) {
      catalogRequestIdRef.current += 1
      setCatalog(null)
      setCatalogStatus('idle')
      setCatalogError(null)
      return
    }

    const edgeId = selectedEdgeId
    const requestId = ++catalogRequestIdRef.current
    let isCurrent = true

    setCatalog(null)
    setCatalogStatus('loading')
    setCatalogError(null)

    async function loadCatalog() {
      try {
        const loadedCatalog = await getEdgeServerCatalog(edgeId)

        if (
          !mountedRef.current ||
          !isCurrent ||
          requestId !== catalogRequestIdRef.current ||
          !isCatalogForSelectedEdge(loadedCatalog, edgeId)
        ) {
          return
        }

        setCatalog(loadedCatalog)
        setCatalogStatus('ready')
      } catch (error) {
        if (!mountedRef.current || !isCurrent || requestId !== catalogRequestIdRef.current) {
          return
        }

        setCatalog(null)
        setCatalogError(toErrorMessage(error, 'Failed to load selected Edge catalog.'))
        setCatalogStatus('error')
      }
    }

    void loadCatalog()

    return () => {
      isCurrent = false
    }
  }, [selectedEdgeId, workspaceContext.selection.selectedEdge])

  const metricOptions = useMemo(
    () => selectDispatchTrendsNumericMetricOptions(catalog),
    [catalog],
  )

  useEffect(() => {
    if (!filter.deviceId || !filter.metric) {
      return
    }

    const selectedMetricId = `${filter.deviceId}:${filter.metric}`
    if (metricOptions.some((option) => option.id === selectedMetricId)) {
      return
    }

    setFilter((current) => ({
      ...current,
      deviceId: null,
      metric: null,
    }))
  }, [filter.deviceId, filter.metric, metricOptions])

  const validationMessage = useMemo(
    () => buildValidationMessage(filter, catalogStatus, metricOptions.length, workspaceContext),
    [catalogStatus, filter, metricOptions.length, workspaceContext],
  )
  const requestDescriptor = useMemo(() => createRequestDescriptor(filter), [filter])
  const requestDescriptorKey = useMemo(
    () => (requestDescriptor ? createDispatchTrendsRequestKey(requestDescriptor) : null),
    [requestDescriptor],
  )

  useEffect(() => {
    currentDescriptorKeyRef.current = requestDescriptorKey
    activeHistoryGuardRef.current = activeHistoryGuardRef.current?.key === requestDescriptorKey
      ? activeHistoryGuardRef.current
      : null
    setProjection(null)
    setHistoryError(null)
    setHistoryState('idle')
  }, [requestDescriptorKey])

  function handleFilterChange(patch: Partial<DispatchTrendsFilter>) {
    setFilter((current) => ({
      ...current,
      ...patch,
      edgeId: selectedEdgeId,
    }))
  }

  async function handleRefresh() {
    if (validationMessage || !requestDescriptor) {
      return
    }

    const requestId = ++historyRequestIdRef.current
    const requestGuard = createDispatchTrendsRequestGuard(requestId, requestDescriptor)
    activeHistoryGuardRef.current = requestGuard
    currentDescriptorKeyRef.current = requestGuard.key
    setHistoryState('loading')
    setHistoryError(null)
    setProjection(null)

    try {
      const response = await getTelemetryHistory(toHelperParams(requestDescriptor))
      const currentGuard = activeHistoryGuardRef.current
      const responseGuardIsCurrent =
        currentDescriptorKeyRef.current === requestGuard.key &&
        isDispatchTrendsRequestCurrent(currentGuard, requestGuard)

      if (!mountedRef.current || !responseGuardIsCurrent) {
        return
      }

      const nextProjection = projectDispatchTrendsHistoryResponse(response, filter.valueMode)
      setProjection(nextProjection)
      setHistoryState(nextProjection.response.series.length > 0 ? 'ready' : 'empty')
    } catch (error) {
      const currentGuard = activeHistoryGuardRef.current
      const responseGuardIsCurrent =
        currentDescriptorKeyRef.current === requestGuard.key &&
        isDispatchTrendsRequestCurrent(currentGuard, requestGuard)

      if (!mountedRef.current || !responseGuardIsCurrent) {
        return
      }

      setHistoryError(toErrorMessage(error, 'Failed to load telemetry history.'))
      setHistoryState('error')
    }
  }

  const displayProjection = projection
    ? projectDispatchTrendsHistoryResponse(projection.response as TelemetryHistoryResponse, filter.valueMode)
    : null
  const boundedError = historyError ?? catalogError

  return (
    <section
      aria-label="Dispatch trends"
      data-testid="dispatch-trends-tab"
      data-edge-id={selectedEdgeId ?? ''}
      className={className ?? 'flex min-h-0 flex-1 flex-col bg-[#08111f]'}
    >
      <div className="flex flex-shrink-0 flex-col gap-1 border-b border-[#1f2a3d] bg-[#08111f] px-3 py-2">
        <h2 className="text-base font-semibold text-white">Trends</h2>
        <p className="text-xs text-[#94a3b8]">
          {selectedEdgeId ? `Selected Edge Server: ${selectedEdgeName ?? selectedEdgeId}` : 'Select an Edge Server to load historical telemetry.'}
        </p>
      </div>

      <DispatchTrendsControls
        filter={filter}
        metricOptions={metricOptions}
        validationMessage={validationMessage}
        isCatalogLoading={catalogStatus === 'loading'}
        isHistoryLoading={historyState === 'loading'}
        onFilterChange={handleFilterChange}
        onRefresh={() => void handleRefresh()}
      />

      {boundedError ? (
        <div
          role="alert"
          className="mx-3 mt-3 flex items-center gap-2 rounded-md border border-[var(--color-danger)] bg-[#190f16] p-3 text-sm text-[#fecdd3]"
        >
          <AlertTriangle size={16} aria-hidden="true" />
          <span>{boundedError}</span>
        </div>
      ) : null}

      {historyState === 'loading' ? (
        <div className="flex min-h-[12rem] flex-1 items-center justify-center gap-2 text-sm text-[#cbd5e1]">
          <Loader2 className="animate-spin text-[#38bdf8]" size={18} aria-hidden="true" />
          <span>Loading telemetry history...</span>
        </div>
      ) : historyState === 'empty' ? (
        <div className="flex min-h-[12rem] flex-1 items-center justify-center p-4 text-center text-sm text-[#94a3b8]">
          No aggregate points were returned for the selected range.
        </div>
      ) : displayProjection ? (
        <div className="grid min-h-0 flex-1 gap-3 overflow-auto p-3 xl:grid-cols-[minmax(0,1fr)_minmax(30rem,0.8fr)]">
          <DispatchTrendsChart projection={displayProjection} />
          <DispatchTrendsTable projection={displayProjection} />
        </div>
      ) : (
        <div className="flex min-h-[12rem] flex-1 items-center justify-center p-4 text-center text-sm text-[#94a3b8]">
          Select a numeric metric and refresh trends to load historical telemetry.
        </div>
      )}
    </section>
  )
}
