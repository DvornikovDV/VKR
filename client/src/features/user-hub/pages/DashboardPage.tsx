import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getDashboardBindingProfiles } from '@/shared/api/bindings'
import { executeEdgeServerCommand, type NormalizedCommandOutcome } from '@/shared/api/commands'
import { getDashboardDiagramById, getDashboardDiagrams } from '@/shared/api/diagrams'
import { getAssignedEdgeServers, getEdgeServerCatalog } from '@/shared/api/edgeServers'
import { useDashboardCommandLifecycle } from '@/features/dashboard/hooks/useDashboardCommandLifecycle'
import { useDashboardRouteState } from '@/features/dashboard/hooks/useDashboardRouteState'
import { useDashboardRuntimeSession } from '@/features/dashboard/hooks/useDashboardRuntimeSession'
import { DashboardRuntimeSurface } from '@/features/dashboard/components/DashboardRuntimeSurface'
import {
  resolveBindingProfileForEdge,
  validateBindingProfileAgainstSavedWidgets,
} from '@/features/dashboard/model/bindingValidation'
import { normalizeDashboardRuntimeLayout } from '@/features/dashboard/model/runtimeLayout'
import {
  createDashboardBindingKey,
  selectDashboardRuntimeProjection,
} from '@/features/dashboard/model/selectors'
import type {
  DashboardBindingProfile,
  DashboardCatalogLoadStatus,
  DashboardCommandCatalog,
  DashboardDiagramDocument,
  DashboardRecoveryState,
  DashboardDiagramSummary,
  DashboardTrustedEdgeServer,
  DashboardCommandType,
} from '@/features/dashboard/model/types'

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }

  return fallback
}

function hasOwnKey<T extends object>(value: T, key: PropertyKey): key is keyof T {
  return Object.prototype.hasOwnProperty.call(value, key)
}

interface DashboardPageCommandCommit {
  widgetId: string
  deviceId: string
  commandType: DashboardCommandType
  value: boolean | number
}

function formatCommandOutcomeError(outcome: Exclude<NormalizedCommandOutcome, 'confirmed'>): string {
  switch (outcome) {
    case 'cloud_rpc_timeout':
      return 'Cloud RPC timeout'
    case 'edge_command_timeout':
      return 'Edge command timeout'
    case 'edge_command_failed':
      return 'Edge command failed'
    case 'edge_unavailable':
      return 'Edge unavailable'
    case 'network_error':
      return 'Network error'
    case 'unknown_error':
    default:
      return 'Command failed'
  }
}

export function DashboardPage() {
  const { routeState, isStructurallyInvalid, setRouteState } = useDashboardRouteState()

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

  const [isBootstrapLoading, setIsBootstrapLoading] = useState(true)
  const [isBindingsLoading, setIsBindingsLoading] = useState(false)
  const [isSavedDiagramLoading, setIsSavedDiagramLoading] = useState(false)
  const [bootstrapError, setBootstrapError] = useState<string | null>(null)
  const [bindingsError, setBindingsError] = useState<string | null>(null)
  const [savedDiagramError, setSavedDiagramError] = useState<string | null>(null)
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState(false)

  const selectedDiagramId = routeState.diagramId
  const selectedEdgeId = routeState.edgeId
  const commandLifecycle = useDashboardCommandLifecycle()

  const selectedDiagram = useMemo(
    () => diagrams.find((diagram) => diagram._id === selectedDiagramId) ?? null,
    [diagrams, selectedDiagramId],
  )
  const hasSavedDiagramForSelectedDiagram =
    selectedDiagramId ? hasOwnKey(savedDiagramDocumentsById, selectedDiagramId) : false
  const selectedSavedDiagram = useMemo(() => {
    if (!selectedDiagramId || !hasSavedDiagramForSelectedDiagram) {
      return null
    }

    return savedDiagramDocumentsById[selectedDiagramId]
  }, [savedDiagramDocumentsById, hasSavedDiagramForSelectedDiagram, selectedDiagramId])

  const hasBindingsForSelectedDiagram =
    selectedDiagramId ? hasOwnKey(bindingProfilesByDiagram, selectedDiagramId) : false

  useEffect(() => {
    let isMounted = true

    async function loadBootstrap() {
      setIsBootstrapLoading(true)
      setBootstrapError(null)

      try {
        const [loadedDiagrams, loadedTrustedEdges] = await Promise.all([
          getDashboardDiagrams(),
          getAssignedEdgeServers().then((rows) => rows.filter((edge) => edge.lifecycleState === 'Active')),
        ])

        if (!isMounted) {
          return
        }

        setDiagrams(loadedDiagrams)
        setTrustedEdges(loadedTrustedEdges)
      } catch (error) {
        if (!isMounted) {
          return
        }

        setBootstrapError(toErrorMessage(error, 'Failed to load dashboard catalog data.'))
      } finally {
        if (isMounted) {
          setIsBootstrapLoading(false)
        }
      }
    }

    void loadBootstrap()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    if (!selectedDiagramId || hasBindingsForSelectedDiagram) {
      return
    }

    const diagramId = selectedDiagramId
    let isMounted = true
    setIsBindingsLoading(true)
    setBindingsError(null)

    async function loadBindings() {
      try {
        const profiles = await getDashboardBindingProfiles(diagramId)
        if (!isMounted) {
          return
        }

        setBindingProfilesByDiagram((previous) => ({
          ...previous,
          [diagramId]: profiles,
        }))
      } catch (error) {
        if (!isMounted) {
          return
        }

        setBindingsError(toErrorMessage(error, 'Failed to load dashboard binding profiles.'))
      } finally {
        if (isMounted) {
          setIsBindingsLoading(false)
        }
      }
    }

    void loadBindings()

    return () => {
      isMounted = false
    }
  }, [hasBindingsForSelectedDiagram, selectedDiagramId])

  useEffect(() => {
    if (!selectedDiagramId || !selectedDiagram || hasSavedDiagramForSelectedDiagram) {
      return
    }

    const diagramId = selectedDiagramId
    let isMounted = true
    setIsSavedDiagramLoading(true)
    setSavedDiagramError(null)

    async function loadSavedDiagramDocument() {
      try {
        const document = await getDashboardDiagramById(diagramId)
        if (!isMounted) {
          return
        }

        setSavedDiagramDocumentsById((previous) => ({
          ...previous,
          [diagramId]: document,
        }))
      } catch (error) {
        if (!isMounted) {
          return
        }

        setSavedDiagramError(toErrorMessage(error, 'Failed to load saved dashboard diagram.'))
      } finally {
        if (isMounted) {
          setIsSavedDiagramLoading(false)
        }
      }
    }

    void loadSavedDiagramDocument()

    return () => {
      isMounted = false
    }
  }, [hasSavedDiagramForSelectedDiagram, selectedDiagram, selectedDiagramId])

  const selectedDiagramProfiles = useMemo(() => {
    if (!selectedDiagramId || !hasBindingsForSelectedDiagram) {
      return []
    }

    return bindingProfilesByDiagram[selectedDiagramId]
  }, [bindingProfilesByDiagram, hasBindingsForSelectedDiagram, selectedDiagramId])

  const edgeOptions = useMemo(() => {
    const allowedEdgeIds = new Set(selectedDiagramProfiles.map((profile) => profile.edgeServerId))
    return trustedEdges.filter((edge) => allowedEdgeIds.has(edge._id))
  }, [selectedDiagramProfiles, trustedEdges])

  const selectedEdge = useMemo(
    () => trustedEdges.find((edge) => edge._id === selectedEdgeId) ?? null,
    [selectedEdgeId, trustedEdges],
  )
  const selectedCatalogStatus: DashboardCatalogLoadStatus = selectedEdgeId
    ? catalogStatusByEdgeId[selectedEdgeId] ?? 'idle'
    : 'idle'
  const selectedCatalogError = selectedEdgeId ? catalogErrorByEdgeId[selectedEdgeId] ?? null : null
  const selectedCommandCatalog = selectedEdgeId ? catalogsByEdgeId[selectedEdgeId] ?? null : null
  const selectedBindingProfile = useMemo(
    () => resolveBindingProfileForEdge(selectedDiagramProfiles, selectedEdgeId),
    [selectedDiagramProfiles, selectedEdgeId],
  )
  const bindingValidation = useMemo(() => {
    if (!selectedSavedDiagram) {
      return null
    }

    return validateBindingProfileAgainstSavedWidgets(selectedBindingProfile, selectedSavedDiagram.layout)
  }, [selectedBindingProfile, selectedSavedDiagram])
  const selectedRuntimeLayout = useMemo(
    () => (selectedSavedDiagram ? normalizeDashboardRuntimeLayout(selectedSavedDiagram.layout) : null),
    [selectedSavedDiagram],
  )

  useEffect(() => {
    if (!selectedEdgeId || !selectedEdge) {
      return
    }

    const edgeId = selectedEdgeId
    if (catalogStatusByEdgeId[edgeId]) {
      return
    }

    let isMounted = true
    let didSettle = false
    setCatalogStatusByEdgeId((previous) => ({
      ...previous,
      [edgeId]: 'loading',
    }))
    setCatalogErrorByEdgeId((previous) => {
      if (!Object.prototype.hasOwnProperty.call(previous, edgeId)) {
        return previous
      }

      const next = { ...previous }
      delete next[edgeId]
      return next
    })

    async function loadSelectedEdgeCatalog() {
      try {
        const catalog = await getEdgeServerCatalog(edgeId)
        didSettle = true
        if (!isMounted) {
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
        if (!isMounted) {
          return
        }

        setCatalogsByEdgeId((previous) => {
          if (!Object.prototype.hasOwnProperty.call(previous, edgeId)) {
            return previous
          }

          const next = { ...previous }
          delete next[edgeId]
          return next
        })
        setCatalogErrorByEdgeId((previous) => ({
          ...previous,
          [edgeId]: toErrorMessage(error, 'Failed to load dashboard command catalog.'),
        }))
        setCatalogStatusByEdgeId((previous) => ({
          ...previous,
          [edgeId]: 'error',
        }))
      }
    }

    void loadSelectedEdgeCatalog()

    return () => {
      isMounted = false
      if (!didSettle) {
        setCatalogStatusByEdgeId((previous) => {
          if (previous[edgeId] !== 'loading') {
            return previous
          }

          const next = { ...previous }
          delete next[edgeId]
          return next
        })
      }
    }
  }, [selectedEdge, selectedEdgeId])

  const recoveryState: DashboardRecoveryState = useMemo(() => {
    if (isStructurallyInvalid) {
      return 'invalid-selection'
    }

    if (bootstrapError || bindingsError) {
      return 'generic-error'
    }

    if (savedDiagramError) {
      return 'generic-error'
    }

    if (isBootstrapLoading) {
      return 'loading'
    }

    if (!selectedDiagramId) {
      return 'empty'
    }

    if (!selectedDiagram) {
      return 'invalid-selection'
    }

    if (!hasBindingsForSelectedDiagram || isBindingsLoading) {
      return 'loading'
    }

    if (!selectedEdgeId) {
      return 'empty'
    }

    if (!selectedEdge) {
      return 'invalid-selection'
    }

    if (!selectedBindingProfile) {
      return 'missing-binding-profile'
    }

    if (isSavedDiagramLoading || !selectedSavedDiagram) {
      return 'loading'
    }

    if (!bindingValidation) {
      return 'loading'
    }

    if (bindingValidation.state === 'invalid-binding-profile') {
      return 'invalid-binding-profile'
    }

    if (bindingValidation.state === 'missing-binding-profile') {
      return 'missing-binding-profile'
    }

    if (!selectedRuntimeLayout) {
      return 'loading'
    }

    if (selectedRuntimeLayout.hasBlockingIssues) {
      return 'visual-rendering-error'
    }

    if (selectedRuntimeLayout.hasRecoverableIssues) {
      return 'partial-visual-rendering'
    }

    return 'ready'
  }, [
    bindingValidation,
    bindingsError,
    bootstrapError,
    hasBindingsForSelectedDiagram,
    isBindingsLoading,
    isBootstrapLoading,
    isSavedDiagramLoading,
    isStructurallyInvalid,
    savedDiagramError,
    selectedDiagram,
    selectedDiagramId,
    selectedBindingProfile,
    selectedRuntimeLayout,
    selectedSavedDiagram,
    selectedEdge,
    selectedEdgeId,
  ])

  const isToolbarDisabled = isBootstrapLoading || Boolean(bootstrapError)
  const isRuntimeEnabled =
    (recoveryState === 'ready' || recoveryState === 'partial-visual-rendering') &&
    Boolean(selectedEdgeId && selectedBindingProfile)

  const runtimeSession = useDashboardRuntimeSession({
    edgeId: selectedEdgeId,
    enabled: isRuntimeEnabled,
  })
  const metricRevisionByBindingKeyRef = useRef(runtimeSession.metricRevisionByBindingKey)
  const runtimeProjection = useMemo(() => {
    if (!selectedSavedDiagram || !selectedBindingProfile) {
      return null
    }

    return selectDashboardRuntimeProjection(
      selectedSavedDiagram,
      selectedBindingProfile,
      runtimeSession.latestMetricValueByBindingKey,
      selectedCatalogStatus === 'loaded' ? selectedCommandCatalog : null,
    )
  }, [
    runtimeSession.latestMetricValueByBindingKey,
    selectedBindingProfile,
    selectedCatalogStatus,
    selectedCommandCatalog,
    selectedSavedDiagram,
  ])

  useEffect(() => {
    metricRevisionByBindingKeyRef.current = runtimeSession.metricRevisionByBindingKey
  }, [runtimeSession.metricRevisionByBindingKey])

  useEffect(() => {
    commandLifecycle.clearConfirmedWaitingTelemetryForUpdatedBindings(
      runtimeSession.metricRevisionByBindingKey,
    )
  }, [commandLifecycle, runtimeSession.metricRevisionByBindingKey])

  const handleCommandCommit = useCallback(
    async (command: DashboardPageCommandCommit) => {
      if (!selectedEdgeId) {
        commandLifecycle.markError(command.widgetId, 'Edge server is not selected')
        return
      }

      const commandProjection = runtimeProjection?.commandAvailabilityByWidgetId[command.widgetId]
      if (
        !commandProjection?.isExecutable ||
        commandProjection.commandType !== command.commandType ||
        !commandProjection.commandBinding ||
        !commandProjection.reportedWidgetBinding
      ) {
        commandLifecycle.markError(command.widgetId, 'Command is unavailable')
        return
      }

      const reportedBindingKey = createDashboardBindingKey(
        commandProjection.reportedWidgetBinding.deviceId,
        commandProjection.reportedWidgetBinding.metric,
      )

      commandLifecycle.markPending(command.widgetId)
      const outcome = await executeEdgeServerCommand(selectedEdgeId, {
        deviceId: commandProjection.commandBinding.deviceId,
        commandType: commandProjection.commandBinding.commandType,
        payload: {
          value: command.value,
        },
      })

      if (outcome === 'confirmed') {
        const confirmedMetricRevision =
          metricRevisionByBindingKeyRef.current[reportedBindingKey] ?? 0

        commandLifecycle.markConfirmedWaitingTelemetry(
          command.widgetId,
          reportedBindingKey,
          confirmedMetricRevision,
        )
        return
      }

      commandLifecycle.markFailure(command.widgetId, outcome, formatCommandOutcomeError(outcome))
    },
    [commandLifecycle, runtimeProjection, selectedEdgeId],
  )

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <DashboardRuntimeSurface
        isActiveContext={isRuntimeEnabled}
        recoveryState={recoveryState}
        savedDiagram={selectedSavedDiagram}
        runtimeProjection={runtimeProjection}
        commandLifecycleByWidgetId={commandLifecycle.lifecycleByWidgetId}
        onCommandCommit={handleCommandCommit}
        catalogStatus={selectedCatalogStatus}
        catalogError={selectedCatalogError}
        transportStatus={runtimeSession.transportStatus}
        edgeAvailability={runtimeSession.edgeAvailability}
        latestMetricValueByBindingKey={runtimeSession.latestMetricValueByBindingKey}
        lastServerTimestamp={runtimeSession.lastServerTimestamp}
        diagnosticsOpen={isDiagnosticsOpen}
        onToggleDiagnostics={() => setIsDiagnosticsOpen((isOpen) => !isOpen)}
        diagrams={diagrams}
        selectedDiagramId={selectedDiagramId}
        edgeOptions={edgeOptions}
        selectedEdgeId={selectedEdgeId}
        disabled={isToolbarDisabled}
        onDiagramChange={(diagramId) =>
          setRouteState(
            {
              diagramId,
            },
            { source: 'user-selection' },
          )
        }
        onEdgeChange={(edgeId) =>
          setRouteState(
            {
              edgeId,
            },
            { source: 'user-selection' },
          )
        }
        errorMessage={bootstrapError ?? bindingsError ?? savedDiagramError ?? runtimeSession.runtimeError}
      />
    </div>
  )
}
