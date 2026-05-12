import { useCallback, useMemo, useRef } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import {
  DISPATCH_DEFAULT_TAB_ID,
  DISPATCH_LEGACY_DASHBOARD_PATH,
  DISPATCH_ROUTE_PREFIX,
  DISPATCH_ROUTE_QUERY_KEYS,
  normalizeDispatchTabId,
  type DispatchTabId,
} from '@/features/dispatch/model/routes'
import type {
  DispatchRouteState,
  DispatchRouteStatePatch,
  DispatchSelectionSource,
} from '@/features/dispatch/model/types'

function normalizeQueryValue(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function normalizeRouteQueryState(
  state: Pick<DispatchRouteState, 'diagramId' | 'edgeId'>,
): Pick<DispatchRouteState, 'diagramId' | 'edgeId'> {
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

function normalizePathname(pathname: string): string {
  const normalized = pathname.replace(/\/+$/, '')
  return normalized.length > 0 ? normalized : '/'
}

export function resolveDispatchTabIdFromPathname(pathname: string): DispatchTabId {
  const normalizedPathname = normalizePathname(pathname)

  if (
    normalizedPathname === DISPATCH_ROUTE_PREFIX ||
    normalizedPathname === DISPATCH_LEGACY_DASHBOARD_PATH
  ) {
    return DISPATCH_DEFAULT_TAB_ID
  }

  const dispatchPrefix = `${DISPATCH_ROUTE_PREFIX}/`
  if (!normalizedPathname.startsWith(dispatchPrefix)) {
    return DISPATCH_DEFAULT_TAB_ID
  }

  const segment = normalizedPathname.slice(dispatchPrefix.length).split('/')[0]
  return normalizeDispatchTabId(segment)
}

export interface SetDispatchRouteStateOptions {
  replace?: boolean
  source?: DispatchSelectionSource
}

export interface UseDispatchRouteStateResult {
  routeState: DispatchRouteState
  isStructurallyInvalid: boolean
  setRouteState: (
    patch: DispatchRouteStatePatch,
    options?: SetDispatchRouteStateOptions,
  ) => void
  clearRouteState: (options?: SetDispatchRouteStateOptions) => void
}

export function parseDispatchRouteState(
  searchParams: URLSearchParams,
  tabId: DispatchTabId = DISPATCH_DEFAULT_TAB_ID,
  selectionSource: DispatchSelectionSource = 'route-prefill',
): DispatchRouteState {
  return {
    tabId,
    diagramId: normalizeQueryValue(searchParams.get(DISPATCH_ROUTE_QUERY_KEYS.diagramId)),
    edgeId: normalizeQueryValue(searchParams.get(DISPATCH_ROUTE_QUERY_KEYS.edgeId)),
    selectionSource,
  }
}

export function isDispatchRouteStructurallyInvalid(
  state: Pick<DispatchRouteState, 'diagramId' | 'edgeId'>,
): boolean {
  return !state.diagramId && Boolean(state.edgeId)
}

export function createDispatchSearchParams(
  state: Pick<DispatchRouteState, 'diagramId' | 'edgeId'>,
): URLSearchParams {
  const normalized = normalizeRouteQueryState(state)
  const nextParams = new URLSearchParams()

  if (normalized.diagramId) {
    nextParams.set(DISPATCH_ROUTE_QUERY_KEYS.diagramId, normalized.diagramId)
  }

  if (normalized.edgeId) {
    nextParams.set(DISPATCH_ROUTE_QUERY_KEYS.edgeId, normalized.edgeId)
  }

  return nextParams
}

export function useDispatchRouteState(): UseDispatchRouteStateResult {
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const searchParamsKey = searchParams.toString()
  const lastSelectionSourceRef = useRef<DispatchSelectionSource>('route-prefill')
  const lastUpdatedSearchKeyRef = useRef<string | null>(null)

  const tabId = useMemo(
    () => resolveDispatchTabIdFromPathname(location.pathname),
    [location.pathname],
  )

  const routeState = useMemo(() => {
    const parsed = parseDispatchRouteState(
      new URLSearchParams(searchParamsKey),
      tabId,
      'route-prefill',
    )
    const selectionSource =
      lastUpdatedSearchKeyRef.current === searchParamsKey
        ? lastSelectionSourceRef.current
        : 'route-prefill'

    return {
      ...parsed,
      selectionSource,
    }
  }, [searchParamsKey, tabId])

  const isStructurallyInvalid = useMemo(
    () => isDispatchRouteStructurallyInvalid(routeState),
    [routeState],
  )

  const setRouteState = useCallback(
    (patch: DispatchRouteStatePatch, options: SetDispatchRouteStateOptions = {}) => {
      const selectionSource = options.source ?? 'user-selection'
      const current = parseDispatchRouteState(
        new URLSearchParams(searchParamsKey),
        tabId,
        'route-prefill',
      )

      const nextDiagramId =
        typeof patch.diagramId === 'undefined'
          ? current.diagramId
          : normalizeQueryValue(patch.diagramId)

      let nextEdgeId =
        typeof patch.edgeId === 'undefined' ? current.edgeId : normalizeQueryValue(patch.edgeId)

      if (
        typeof patch.diagramId !== 'undefined' &&
        typeof patch.edgeId === 'undefined' &&
        nextDiagramId !== current.diagramId
      ) {
        nextEdgeId = null
      }

      const nextSearchParams = createDispatchSearchParams({
        diagramId: nextDiagramId,
        edgeId: nextEdgeId,
      })
      const nextSearchKey = nextSearchParams.toString()

      lastSelectionSourceRef.current = selectionSource
      lastUpdatedSearchKeyRef.current = nextSearchKey
      setSearchParams(nextSearchParams, { replace: options.replace ?? true })
    },
    [searchParamsKey, setSearchParams, tabId],
  )

  const clearRouteState = useCallback(
    (options: SetDispatchRouteStateOptions = {}) => {
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
