import { useEffect, useMemo, useState } from 'react'
import { getDashboardBindingProfiles } from '@/shared/api/bindings'
import { getDashboardDiagramById, getDashboardDiagrams } from '@/shared/api/diagrams'
import { getDashboardTrustedEdgeServers } from '@/shared/api/edgeServers'
import { useDashboardRouteState } from '@/features/dashboard/hooks/useDashboardRouteState'
import { useDashboardRuntimeSession } from '@/features/dashboard/hooks/useDashboardRuntimeSession'
import { DashboardToolbar } from '@/features/dashboard/components/DashboardToolbar'
import { DashboardStatePanel } from '@/features/dashboard/components/DashboardStatePanel'
import { DashboardRuntimeSurface } from '@/features/dashboard/components/DashboardRuntimeSurface'
import {
  resolveBindingProfileForEdge,
  validateBindingProfileAgainstSavedWidgets,
} from '@/features/dashboard/model/bindingValidation'
import { selectDashboardRuntimeProjection } from '@/features/dashboard/model/selectors'
import type {
  DashboardBindingProfile,
  DashboardDiagramDocument,
  DashboardRecoveryState,
  DashboardDiagramSummary,
  DashboardTrustedEdgeServer,
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

  const [isBootstrapLoading, setIsBootstrapLoading] = useState(true)
  const [isBindingsLoading, setIsBindingsLoading] = useState(false)
  const [isSavedDiagramLoading, setIsSavedDiagramLoading] = useState(false)
  const [bootstrapError, setBootstrapError] = useState<string | null>(null)
  const [bindingsError, setBindingsError] = useState<string | null>(null)
  const [savedDiagramError, setSavedDiagramError] = useState<string | null>(null)

  const selectedDiagramId = routeState.diagramId
  const selectedEdgeId = routeState.edgeId

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
          getDashboardTrustedEdgeServers(),
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
    selectedSavedDiagram,
    selectedEdge,
    selectedEdgeId,
  ])

  const isToolbarDisabled = isBootstrapLoading || Boolean(bootstrapError)
  const isRuntimeEnabled = recoveryState === 'ready' && Boolean(selectedEdgeId && selectedBindingProfile)
  const isRecoveryLoading = recoveryState === 'loading'

  const runtimeSession = useDashboardRuntimeSession({
    edgeId: selectedEdgeId,
    enabled: isRuntimeEnabled,
  })
  const runtimeProjection = useMemo(() => {
    if (!selectedSavedDiagram || !selectedBindingProfile) {
      return null
    }

    return selectDashboardRuntimeProjection(
      selectedSavedDiagram,
      selectedBindingProfile,
      runtimeSession.latestMetricValueByBindingKey,
    )
  }, [runtimeSession.latestMetricValueByBindingKey, selectedBindingProfile, selectedSavedDiagram])

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className={`space-y-4 transition-opacity duration-200 ${isRecoveryLoading ? 'opacity-90' : 'opacity-100'}`}>
        <DashboardToolbar
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
        />

        <DashboardStatePanel
          state={recoveryState}
          selectedDiagramName={selectedDiagram?.name ?? null}
          selectedEdgeName={selectedEdge?.name ?? null}
          transportStatus={runtimeSession.transportStatus}
          edgeAvailability={runtimeSession.edgeAvailability}
          errorMessage={bootstrapError ?? bindingsError ?? savedDiagramError ?? runtimeSession.runtimeError}
        />

        <section className="rounded-xl border border-[#1f2a3d] bg-[#0a1220] p-3 shadow-[inset_0_1px_0_rgba(148,163,184,0.08)]">
          <div className="rounded-lg border border-[#162033] bg-[radial-gradient(circle_at_top,_#132238,_#0a1220_58%)] p-2">
            <DashboardRuntimeSurface
              isActiveContext={isRuntimeEnabled}
              savedDiagram={selectedSavedDiagram}
              runtimeProjection={runtimeProjection}
              transportStatus={runtimeSession.transportStatus}
              edgeAvailability={runtimeSession.edgeAvailability}
              latestMetricValueByBindingKey={runtimeSession.latestMetricValueByBindingKey}
              lastServerTimestamp={runtimeSession.lastServerTimestamp}
            />
          </div>
        </section>
      </div>
    </section>
  )
}
