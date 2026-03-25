import { useEffect, useMemo, useState } from 'react'
import { getDashboardBindingProfiles } from '@/shared/api/bindings'
import { getDashboardDiagrams } from '@/shared/api/diagrams'
import { getDashboardTrustedEdgeServers } from '@/shared/api/edgeServers'
import { useDashboardRouteState } from '@/features/dashboard/hooks/useDashboardRouteState'
import { useDashboardRuntimeSession } from '@/features/dashboard/hooks/useDashboardRuntimeSession'
import { DashboardToolbar } from '@/features/dashboard/components/DashboardToolbar'
import { DashboardStatePanel } from '@/features/dashboard/components/DashboardStatePanel'
import { DashboardRuntimeSurface } from '@/features/dashboard/components/DashboardRuntimeSurface'
import type {
  DashboardBindingProfile,
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
  const [trustedEdges, setTrustedEdges] = useState<DashboardTrustedEdgeServer[]>([])
  const [bindingProfilesByDiagram, setBindingProfilesByDiagram] = useState<
    Record<string, DashboardBindingProfile[]>
  >({})

  const [isBootstrapLoading, setIsBootstrapLoading] = useState(true)
  const [isBindingsLoading, setIsBindingsLoading] = useState(false)
  const [bootstrapError, setBootstrapError] = useState<string | null>(null)
  const [bindingsError, setBindingsError] = useState<string | null>(null)

  const selectedDiagramId = routeState.diagramId
  const selectedEdgeId = routeState.edgeId

  const selectedDiagram = useMemo(
    () => diagrams.find((diagram) => diagram._id === selectedDiagramId) ?? null,
    [diagrams, selectedDiagramId],
  )

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

    let isMounted = true
    setIsBindingsLoading(true)
    setBindingsError(null)

    async function loadBindings() {
      try {
        const profiles = await getDashboardBindingProfiles(selectedDiagramId)
        if (!isMounted) {
          return
        }

        setBindingProfilesByDiagram((previous) => ({
          ...previous,
          [selectedDiagramId]: profiles,
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

  const recoveryState: DashboardRecoveryState = useMemo(() => {
    if (isStructurallyInvalid) {
      return 'invalid-selection'
    }

    if (bootstrapError || bindingsError) {
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

    const isValidPair = edgeOptions.some((edge) => edge._id === selectedEdgeId)
    if (!isValidPair) {
      return 'invalid-selection'
    }

    return 'ready'
  }, [
    bindingsError,
    bootstrapError,
    edgeOptions,
    hasBindingsForSelectedDiagram,
    isBindingsLoading,
    isBootstrapLoading,
    isStructurallyInvalid,
    selectedDiagram,
    selectedDiagramId,
    selectedEdge,
    selectedEdgeId,
  ])

  const isToolbarDisabled = isBootstrapLoading || Boolean(bootstrapError)
  const isRuntimeEnabled = recoveryState === 'ready' && Boolean(selectedEdgeId)

  const runtimeSession = useDashboardRuntimeSession({
    edgeId: selectedEdgeId,
    enabled: isRuntimeEnabled,
  })

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="space-y-4">
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
          errorMessage={bootstrapError ?? bindingsError ?? runtimeSession.runtimeError}
        />

        <DashboardRuntimeSurface
          isActiveContext={isRuntimeEnabled}
          transportStatus={runtimeSession.transportStatus}
          edgeAvailability={runtimeSession.edgeAvailability}
          latestMetricValueByBindingKey={runtimeSession.latestMetricValueByBindingKey}
          lastServerTimestamp={runtimeSession.lastServerTimestamp}
        />
      </div>
    </section>
  )
}
