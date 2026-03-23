import { useCallback, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { DashboardRouteState, DashboardSelectionSource } from '@/features/dashboard/model/types'

const DASHBOARD_DIAGRAM_QUERY_KEY = 'diagramId'
const DASHBOARD_EDGE_QUERY_KEY = 'edgeId'

function normalizeQueryValue(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function normalizeRouteState(
  state: Pick<DashboardRouteState, 'diagramId' | 'edgeId'>,
): Pick<DashboardRouteState, 'diagramId' | 'edgeId'> {
  const diagramId = normalizeQueryValue(state.diagramId)
  const edgeId = normalizeQueryValue(state.edgeId)

  if (!diagramId) {
    return {
      diagramId: null,
      edgeId: null,
    }
  }

  return {
    diagramId,
    edgeId,
  }
}

export interface DashboardRouteStatePatch {
  diagramId?: string | null
  edgeId?: string | null
}

export interface SetDashboardRouteStateOptions {
  replace?: boolean
  source?: DashboardSelectionSource
}

export interface UseDashboardRouteStateResult {
  routeState: DashboardRouteState
  isStructurallyInvalid: boolean
  setRouteState: (
    patch: DashboardRouteStatePatch,
    options?: SetDashboardRouteStateOptions,
  ) => void
  clearRouteState: (options?: SetDashboardRouteStateOptions) => void
}

export function parseDashboardRouteState(
  searchParams: URLSearchParams,
  selectionSource: DashboardSelectionSource = 'route-prefill',
): DashboardRouteState {
  return {
    diagramId: normalizeQueryValue(searchParams.get(DASHBOARD_DIAGRAM_QUERY_KEY)),
    edgeId: normalizeQueryValue(searchParams.get(DASHBOARD_EDGE_QUERY_KEY)),
    selectionSource,
  }
}

export function isDashboardRouteStructurallyInvalid(
  state: Pick<DashboardRouteState, 'diagramId' | 'edgeId'>,
): boolean {
  return !state.diagramId && Boolean(state.edgeId)
}

export function createDashboardSearchParams(
  state: Pick<DashboardRouteState, 'diagramId' | 'edgeId'>,
): URLSearchParams {
  const normalized = normalizeRouteState(state)
  const nextParams = new URLSearchParams()

  if (normalized.diagramId) {
    nextParams.set(DASHBOARD_DIAGRAM_QUERY_KEY, normalized.diagramId)
  }

  if (normalized.edgeId) {
    nextParams.set(DASHBOARD_EDGE_QUERY_KEY, normalized.edgeId)
  }

  return nextParams
}

export function useDashboardRouteState(): UseDashboardRouteStateResult {
  const [searchParams, setSearchParams] = useSearchParams()
  const searchParamsKey = searchParams.toString()
  const lastSelectionSourceRef = useRef<DashboardSelectionSource>('route-prefill')
  const lastUpdatedSearchKeyRef = useRef<string | null>(null)

  const routeState = useMemo(() => {
    const parsed = parseDashboardRouteState(new URLSearchParams(searchParamsKey), 'route-prefill')
    const selectionSource =
      lastUpdatedSearchKeyRef.current === searchParamsKey ?
        lastSelectionSourceRef.current
      : 'route-prefill'

    return {
      ...parsed,
      selectionSource,
    }
  }, [searchParamsKey])

  const isStructurallyInvalid = useMemo(
    () => isDashboardRouteStructurallyInvalid(routeState),
    [routeState],
  )

  const setRouteState = useCallback(
    (patch: DashboardRouteStatePatch, options: SetDashboardRouteStateOptions = {}) => {
      const selectionSource = options.source ?? 'user-selection'
      const current = parseDashboardRouteState(new URLSearchParams(searchParamsKey), 'route-prefill')

      const nextDiagramId =
        typeof patch.diagramId === 'undefined'
          ? current.diagramId
          : normalizeQueryValue(patch.diagramId)

      let nextEdgeId =
        typeof patch.edgeId === 'undefined' ? current.edgeId : normalizeQueryValue(patch.edgeId)

      // Diagram change defaults to edge reset when caller does not provide a replacement.
      if (
        typeof patch.diagramId !== 'undefined' &&
        typeof patch.edgeId === 'undefined' &&
        nextDiagramId !== current.diagramId
      ) {
        nextEdgeId = null
      }

      const nextSearchParams = createDashboardSearchParams({
        diagramId: nextDiagramId,
        edgeId: nextEdgeId,
      })
      const nextSearchKey = nextSearchParams.toString()

      lastSelectionSourceRef.current = selectionSource
      lastUpdatedSearchKeyRef.current = nextSearchKey
      setSearchParams(nextSearchParams, { replace: options.replace ?? true })
    },
    [searchParamsKey, setSearchParams],
  )

  const clearRouteState = useCallback(
    (options: SetDashboardRouteStateOptions = {}) => {
      setRouteState(
        {
          diagramId: null,
          edgeId: null,
        },
        {
          replace: options.replace ?? true,
          source: options.source ?? 'recovery-reset',
        },
      )
    },
    [setRouteState],
  )

  return {
    routeState,
    isStructurallyInvalid,
    setRouteState,
    clearRouteState,
  }
}
