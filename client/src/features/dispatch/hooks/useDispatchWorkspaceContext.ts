import { useEffect, useMemo, useRef, useState } from 'react'
import { getDashboardBindingProfiles } from '@/shared/api/bindings'
import { getDashboardDiagramById, getDashboardDiagrams } from '@/shared/api/diagrams'
import { getAssignedEdgeServers, getEdgeServerCatalog } from '@/shared/api/edgeServers'
import { validateBindingProfileAgainstSavedWidgets } from '@/features/dashboard/model/bindingValidation'
import type {
  DashboardBindingProfile,
  DashboardCatalogLoadStatus,
  DashboardCommandCatalog,
  DashboardDiagramDocument,
  DashboardDiagramSummary,
  DashboardTrustedEdgeServer,
} from '@/features/dashboard/model/types'
import {
  hasDispatchBindingProfilesForDiagram,
  hasDispatchSavedDiagram,
  selectDispatchAllowedEdgeOptions,
  selectDispatchBindingProfilesForDiagram,
  selectDispatchDiagramOptions,
  selectDispatchRecoveryState,
  selectDispatchRuntimeLayout,
  selectDispatchSelectedBindingProfile,
  selectDispatchSelectedCatalog,
  selectDispatchSelectedCatalogError,
  selectDispatchSelectedCatalogStatus,
  selectDispatchSelectedDiagram,
  selectDispatchSelectedEdge,
  selectDispatchSelectedSavedDiagram,
} from '@/features/dispatch/model/context'
import type {
  DispatchWorkspaceContextSnapshot,
  DispatchRouteState,
} from '@/features/dispatch/model/types'

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }

  return fallback
}

function removeRecordKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  if (!Object.prototype.hasOwnProperty.call(record, key)) {
    return record
  }

  const next = { ...record }
  delete next[key]
  return next
}

export interface UseDispatchWorkspaceContextOptions {
  routeState: DispatchRouteState
  isRouteStateStructurallyInvalid: boolean
  loadDashboardRuntimeContext?: boolean
}

export function useDispatchWorkspaceContext({
  routeState,
  isRouteStateStructurallyInvalid,
  loadDashboardRuntimeContext = false,
}: UseDispatchWorkspaceContextOptions): DispatchWorkspaceContextSnapshot {
  const [diagrams, setDiagrams] = useState<DashboardDiagramSummary[]>([])
  const [savedDiagramDocumentsById, setSavedDiagramDocumentsById] = useState<
    Record<string, DashboardDiagramDocument>
  >({})
  const [trustedEdges, setTrustedEdges] = useState<DashboardTrustedEdgeServer[]>([])
  const [bindingProfilesByDiagram, setBindingProfilesByDiagram] = useState<
    Record<string, DashboardBindingProfile[]>
  >({})
  const [catalogsByEdgeId, setCatalogsByEdgeId] = useState<Record<string, DashboardCommandCatalog>>({})
  const [catalogStatusByEdgeId, setCatalogStatusByEdgeId] = useState<
    Record<string, DashboardCatalogLoadStatus>
  >({})
  const [catalogErrorByEdgeId, setCatalogErrorByEdgeId] = useState<Record<string, string>>({})
  const [bindingErrorByDiagramId, setBindingErrorByDiagramId] = useState<Record<string, string>>({})
  const [savedDiagramErrorById, setSavedDiagramErrorById] = useState<Record<string, string>>({})

  const [isBootstrapLoading, setIsBootstrapLoading] = useState(true)
  const [bootstrapError, setBootstrapError] = useState<string | null>(null)
  const [loadingBindingDiagramId, setLoadingBindingDiagramId] = useState<string | null>(null)
  const [loadingSavedDiagramId, setLoadingSavedDiagramId] = useState<string | null>(null)
  const bootstrapRequestIdRef = useRef(0)
  const bindingRequestIdRef = useRef(0)
  const savedDiagramRequestIdRef = useRef(0)
  const catalogRequestIdRef = useRef(0)
  const catalogStatusByEdgeIdRef = useRef(catalogStatusByEdgeId)

  const routeDiagramId = routeState.diagramId
  const routeEdgeId = routeDiagramId ? routeState.edgeId : null
  const shouldLoadDashboardRuntimeContext = loadDashboardRuntimeContext && !isRouteStateStructurallyInvalid

  useEffect(() => {
    catalogStatusByEdgeIdRef.current = catalogStatusByEdgeId
  }, [catalogStatusByEdgeId])

  useEffect(() => {
    const requestId = ++bootstrapRequestIdRef.current
    let isCurrent = true

    async function loadBootstrap() {
      setIsBootstrapLoading(true)
      setBootstrapError(null)

      try {
        const [loadedDiagrams, loadedTrustedEdges] = await Promise.all([
          getDashboardDiagrams(),
          getAssignedEdgeServers().then((rows) =>
            rows.filter((edge) => edge.lifecycleState === 'Active'),
          ),
        ])

        if (!isCurrent || requestId !== bootstrapRequestIdRef.current) {
          return
        }

        setDiagrams(loadedDiagrams)
        setTrustedEdges(loadedTrustedEdges)
      } catch (error) {
        if (!isCurrent || requestId !== bootstrapRequestIdRef.current) {
          return
        }

        setBootstrapError(toErrorMessage(error, 'Failed to load dispatch context data.'))
      } finally {
        if (isCurrent && requestId === bootstrapRequestIdRef.current) {
          setIsBootstrapLoading(false)
        }
      }
    }

    void loadBootstrap()

    return () => {
      isCurrent = false
    }
  }, [])

  const selectedDiagram = useMemo(
    () => selectDispatchSelectedDiagram(diagrams, routeDiagramId),
    [diagrams, routeDiagramId],
  )
  const hasBindingProfilesForSelectedDiagram = useMemo(
    () => hasDispatchBindingProfilesForDiagram(bindingProfilesByDiagram, routeDiagramId),
    [bindingProfilesByDiagram, routeDiagramId],
  )
  const selectedDiagramProfiles = useMemo(
    () => selectDispatchBindingProfilesForDiagram(bindingProfilesByDiagram, routeDiagramId),
    [bindingProfilesByDiagram, routeDiagramId],
  )
  const edgeOptions = useMemo(
    () => selectDispatchAllowedEdgeOptions(trustedEdges, selectedDiagramProfiles),
    [selectedDiagramProfiles, trustedEdges],
  )
  const selectedEdge = useMemo(
    () => selectDispatchSelectedEdge(trustedEdges, routeEdgeId),
    [routeEdgeId, trustedEdges],
  )
  const selectedBindingProfile = useMemo(
    () => selectDispatchSelectedBindingProfile(selectedDiagramProfiles, routeEdgeId),
    [routeEdgeId, selectedDiagramProfiles],
  )
  const hasSavedDiagramForSelectedDiagram = useMemo(
    () => hasDispatchSavedDiagram(savedDiagramDocumentsById, routeDiagramId),
    [routeDiagramId, savedDiagramDocumentsById],
  )
  const selectedSavedDiagram = useMemo(() => {
    if (!shouldLoadDashboardRuntimeContext) {
      return null
    }

    return selectDispatchSelectedSavedDiagram(savedDiagramDocumentsById, routeDiagramId)
  }, [routeDiagramId, savedDiagramDocumentsById, shouldLoadDashboardRuntimeContext])

  useEffect(() => {
    if (!routeDiagramId || hasBindingProfilesForSelectedDiagram) {
      return
    }

    const diagramId = routeDiagramId
    const requestId = ++bindingRequestIdRef.current
    let isCurrent = true
    let didSettle = false

    setLoadingBindingDiagramId(diagramId)
    setBindingErrorByDiagramId((previous) => removeRecordKey(previous, diagramId))

    async function loadBindings() {
      try {
        const profiles = await getDashboardBindingProfiles(diagramId)
        didSettle = true

        if (!isCurrent || requestId !== bindingRequestIdRef.current) {
          return
        }

        setBindingProfilesByDiagram((previous) => ({
          ...previous,
          [diagramId]: profiles,
        }))
      } catch (error) {
        didSettle = true

        if (!isCurrent || requestId !== bindingRequestIdRef.current) {
          return
        }

        setBindingErrorByDiagramId((previous) => ({
          ...previous,
          [diagramId]: toErrorMessage(error, 'Failed to load dispatch binding profiles.'),
        }))
      } finally {
        if (isCurrent && requestId === bindingRequestIdRef.current) {
          setLoadingBindingDiagramId((current) => (current === diagramId ? null : current))
        }
      }
    }

    void loadBindings()

    return () => {
      isCurrent = false
      if (!didSettle) {
        setLoadingBindingDiagramId((current) => (current === diagramId ? null : current))
      }
    }
  }, [hasBindingProfilesForSelectedDiagram, routeDiagramId])

  useEffect(() => {
    if (
      !shouldLoadDashboardRuntimeContext ||
      !routeDiagramId ||
      !selectedDiagram ||
      hasSavedDiagramForSelectedDiagram
    ) {
      return
    }

    const diagramId = routeDiagramId
    const requestId = ++savedDiagramRequestIdRef.current
    let isCurrent = true
    let didSettle = false

    setLoadingSavedDiagramId(diagramId)
    setSavedDiagramErrorById((previous) => removeRecordKey(previous, diagramId))

    async function loadSavedDiagramDocument() {
      try {
        const document = await getDashboardDiagramById(diagramId)
        didSettle = true

        if (!isCurrent || requestId !== savedDiagramRequestIdRef.current) {
          return
        }

        setSavedDiagramDocumentsById((previous) => ({
          ...previous,
          [diagramId]: document,
        }))
      } catch (error) {
        didSettle = true

        if (!isCurrent || requestId !== savedDiagramRequestIdRef.current) {
          return
        }

        setSavedDiagramErrorById((previous) => ({
          ...previous,
          [diagramId]: toErrorMessage(error, 'Failed to load saved dispatch diagram.'),
        }))
      } finally {
        if (isCurrent && requestId === savedDiagramRequestIdRef.current) {
          setLoadingSavedDiagramId((current) => (current === diagramId ? null : current))
        }
      }
    }

    void loadSavedDiagramDocument()

    return () => {
      isCurrent = false
      if (!didSettle) {
        setLoadingSavedDiagramId((current) => (current === diagramId ? null : current))
      }
    }
  }, [
    hasSavedDiagramForSelectedDiagram,
    routeDiagramId,
    selectedDiagram,
    shouldLoadDashboardRuntimeContext,
  ])

  const selectedCatalogStatus = shouldLoadDashboardRuntimeContext
    ? selectDispatchSelectedCatalogStatus(catalogStatusByEdgeId, routeEdgeId)
    : 'idle'
  const selectedCatalogError = shouldLoadDashboardRuntimeContext
    ? selectDispatchSelectedCatalogError(catalogErrorByEdgeId, routeEdgeId)
    : null
  const selectedCommandCatalog = shouldLoadDashboardRuntimeContext
    ? selectDispatchSelectedCatalog(catalogsByEdgeId, routeEdgeId)
    : null

  useEffect(() => {
    if (!shouldLoadDashboardRuntimeContext || !routeEdgeId || !selectedEdge) {
      return
    }

    const edgeId = routeEdgeId
    if (catalogStatusByEdgeIdRef.current[edgeId]) {
      return
    }

    const requestId = ++catalogRequestIdRef.current
    let isCurrent = true
    let didSettle = false

    setCatalogStatusByEdgeId((previous) => ({
      ...previous,
      [edgeId]: 'loading',
    }))
    setCatalogErrorByEdgeId((previous) => removeRecordKey(previous, edgeId))

    async function loadSelectedEdgeCatalog() {
      try {
        const catalog = await getEdgeServerCatalog(edgeId)
        didSettle = true

        if (!isCurrent || requestId !== catalogRequestIdRef.current) {
          return
        }

        setCatalogsByEdgeId((previous) => ({
          ...previous,
          [edgeId]: catalog,
        }))
        setCatalogStatusByEdgeId((previous) => ({
          ...previous,
          [edgeId]: 'loaded',
        }))
      } catch (error) {
        didSettle = true

        if (!isCurrent || requestId !== catalogRequestIdRef.current) {
          return
        }

        setCatalogsByEdgeId((previous) => removeRecordKey(previous, edgeId))
        setCatalogErrorByEdgeId((previous) => ({
          ...previous,
          [edgeId]: toErrorMessage(error, 'Failed to load dispatch command catalog.'),
        }))
        setCatalogStatusByEdgeId((previous) => ({
          ...previous,
          [edgeId]: 'error',
        }))
      }
    }

    void loadSelectedEdgeCatalog()

    return () => {
      isCurrent = false
      if (!didSettle) {
        setCatalogStatusByEdgeId((previous) =>
          previous[edgeId] === 'loading' ? removeRecordKey(previous, edgeId) : previous,
        )
      }
    }
  }, [routeEdgeId, selectedEdge, shouldLoadDashboardRuntimeContext])

  const bindingValidation = useMemo(() => {
    if (!shouldLoadDashboardRuntimeContext || !selectedSavedDiagram) {
      return null
    }

    return validateBindingProfileAgainstSavedWidgets(
      selectedBindingProfile,
      selectedSavedDiagram.layout,
    )
  }, [selectedBindingProfile, selectedSavedDiagram, shouldLoadDashboardRuntimeContext])
  const selectedRuntimeLayout = useMemo(
    () =>
      shouldLoadDashboardRuntimeContext
        ? selectDispatchRuntimeLayout(selectedSavedDiagram)
        : null,
    [selectedSavedDiagram, shouldLoadDashboardRuntimeContext],
  )

  const isBindingsLoading = loadingBindingDiagramId === routeDiagramId
  const isSavedDiagramLoading =
    shouldLoadDashboardRuntimeContext && loadingSavedDiagramId === routeDiagramId
  const selectedBindingsError = routeDiagramId ? bindingErrorByDiagramId[routeDiagramId] ?? null : null
  const selectedSavedDiagramError =
    shouldLoadDashboardRuntimeContext && routeDiagramId
      ? savedDiagramErrorById[routeDiagramId] ?? null
      : null

  const recoveryState = useMemo(
    () =>
      selectDispatchRecoveryState({
        isRouteStateStructurallyInvalid,
        bootstrapError,
        bindingsError: selectedBindingsError,
        savedDiagramError: selectedSavedDiagramError,
        isBootstrapLoading,
        isBindingsLoading,
        isSavedDiagramLoading,
        hasBindingProfilesForSelectedDiagram,
        requiresDashboardRuntimeContext: shouldLoadDashboardRuntimeContext,
        selectedDiagramId: routeDiagramId,
        selectedDiagram,
        selectedEdgeId: routeEdgeId,
        selectedEdge,
        selectedBindingProfile,
        selectedSavedDiagram,
        bindingValidation,
        selectedRuntimeLayout,
      }),
    [
      bindingValidation,
      bootstrapError,
      hasBindingProfilesForSelectedDiagram,
      isBootstrapLoading,
      isBindingsLoading,
      isRouteStateStructurallyInvalid,
      isSavedDiagramLoading,
      routeDiagramId,
      routeEdgeId,
      selectedBindingProfile,
      selectedBindingsError,
      selectedDiagram,
      selectedEdge,
      selectedRuntimeLayout,
      selectedSavedDiagram,
      selectedSavedDiagramError,
      shouldLoadDashboardRuntimeContext,
    ],
  )

  const isContextLoading =
    isBootstrapLoading ||
    isBindingsLoading ||
    isSavedDiagramLoading ||
    selectedCatalogStatus === 'loading'
  const errorMessage =
    bootstrapError ?? selectedBindingsError ?? selectedSavedDiagramError ?? selectedCatalogError
  const status =
    errorMessage ? 'error'
    : isContextLoading ? 'loading'
    : 'ready'

  return {
    status,
    routeState,
    diagramOptions: selectDispatchDiagramOptions(diagrams),
    edgeOptions,
    bindingProfiles: selectedDiagramProfiles,
    selection: {
      diagramId: routeDiagramId,
      edgeId: routeEdgeId,
      selectedDiagram,
      selectedEdge,
      selectedBindingProfile,
    },
    dashboardRuntime: {
      savedDiagram: selectedSavedDiagram,
      edgeCatalog: selectedCommandCatalog,
      edgeCatalogStatus: selectedCatalogStatus,
    },
    recoveryState,
    errorMessage,
  }
}
