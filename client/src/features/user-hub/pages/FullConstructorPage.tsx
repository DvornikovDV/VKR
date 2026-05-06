import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { ConstructorHost } from '@/features/constructor-host/ConstructorHost'
import {
  mapAssignedEdgeServersToMachineOptions,
  mapCatalogRowsToDeviceMetricCatalog,
  mapCatalogCommandsToDeviceCommandCatalog,
} from '@/features/constructor-host/adapters/catalogAdapter'
import {
  exportWidgetBindingsPayload,
  exportCommandBindingsPayload,
  findBindingSetForEdgeServer,
  importBindingSetsPayload,
  importBindingSetsPayloadWithRecovery,
  isBindingsPayloadError,
  hasAnyBindings,
  type DiagramBindingSetRecord,
} from '@/features/constructor-host/adapters/bindingsAdapter'
import {
  exportLayoutPayload,
  importLayoutPayload,
  isLayoutPayloadError,
} from '@/features/constructor-host/adapters/layoutAdapter'
import type {
  DirtyState,
  EditorDeviceMetricCatalogEntry,
  EditorDeviceCommandCatalogEntry,
  EditorMachineOption,
  HostedConstructorInstance,
} from '@/features/constructor-host/types'
import {
  hasUnsavedChangesFromDirtyState,
  useUnsavedChangesGuard,
} from '@/features/constructor-host/useUnsavedChangesGuard'
import { useHostedLayoutSaveFlow } from '@/features/constructor-host/useHostedLayoutSaveFlow'
import { deleteAllBindings, getBindingsByDiagram, createBinding } from '@/shared/api/bindings'
import { getConstructorEdgeGuidance } from '@/shared/edgePresentation'
import { BindingsInvalidatedModal } from '@/shared/components/BindingsInvalidatedModal'
import { SaveBindingsRequiresLayoutModal } from '@/shared/components/SaveBindingsRequiresLayoutModal'
import { SaveAsDialog } from '@/shared/components/SaveAsDialog'
import { SaveConflictModal } from '@/shared/components/SaveConflictModal'
import type { EditorRouteDiagram } from '@/shared/api/diagrams'
import { getDiagramById, updateDiagram } from '@/shared/api/diagrams'
import { getAssignedEdgeServers, getEdgeServerCatalog } from '@/shared/api/edgeServers'

type PagePhase = 'loading' | 'ready' | 'error'

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }

  return fallback
}

export function FullConstructorPage() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const runtimeRef = useRef<HostedConstructorInstance | null>(null)
  const isSyncingBindingsBaselineRef = useRef(false)
  const isSavingBindingsRef = useRef(false)
  const isSavingLayoutThenBindingsRef = useRef(false)
  const isForwardingLayoutSaveIntentRef = useRef(false)
  const shouldSaveBindingsAfterDestructiveSaveRef = useRef(false)
  const [phase, setPhase] = useState<PagePhase>('loading')
  const [diagram, setDiagram] = useState<EditorRouteDiagram | null>(null)
  const [machines, setMachines] = useState<EditorMachineOption[]>([])
  const [activeEdgeServerId, setActiveEdgeServerId] = useState<string | null>(null)
  const [deviceCatalog, setDeviceCatalog] = useState<EditorDeviceMetricCatalogEntry[]>([])
  const [commandCatalog, setCommandCatalog] = useState<EditorDeviceCommandCatalogEntry[]>([])
  const [bindingSets, setBindingSets] = useState<DiagramBindingSetRecord[]>([])
  const [bindingsSaveError, setBindingsSaveError] = useState<string | null>(null)
  const [saveBindingsRequiresLayoutModalOpen, setSaveBindingsRequiresLayoutModalOpen] = useState(false)
  const [bindingsInvalidatedModalOpen, setBindingsInvalidatedModalOpen] = useState(false)
  const [isSubmittingDestructiveSave, setIsSubmittingDestructiveSave] = useState(false)
  const [bindingsInvalidatedModalError, setBindingsInvalidatedModalError] = useState<string | null>(null)
  const [dirtyState, setDirtyState] = useState<DirtyState>({ layoutDirty: false, bindingsDirty: false })
  const [error, setError] = useState<string | null>(null)
  const [layoutRecoveryNotice, setLayoutRecoveryNotice] = useState<string | null>(null)
  const [canOpenWithEmptyBindings, setCanOpenWithEmptyBindings] = useState(false)
  const requestedEdgeServerId = useMemo(() => {
    const candidate = new URLSearchParams(location.search).get('edgeId')
    return candidate && candidate.trim().length > 0 ? candidate.trim() : null
  }, [location.search])

  const saveFlow = useHostedLayoutSaveFlow({
    diagram,
    onDiagramChange: setDiagram,
    routePrefix: '/hub/editor',
  })

  const loadCatalogForMachine = useCallback(
    async (edgeServerId: string | null): Promise<{ deviceCatalog: EditorDeviceMetricCatalogEntry[], commandCatalog: EditorDeviceCommandCatalogEntry[] }> => {
      if (!edgeServerId) {
        return { deviceCatalog: [], commandCatalog: [] }
      }

      const catalogSnapshot = await getEdgeServerCatalog(edgeServerId)
      return {
        deviceCatalog: mapCatalogRowsToDeviceMetricCatalog(edgeServerId, catalogSnapshot),
        commandCatalog: mapCatalogCommandsToDeviceCommandCatalog(edgeServerId, catalogSnapshot),
      }
    },
    [],
  )

  const hasPersistedBindingSets = useMemo(
    () => bindingSets.some(hasAnyBindings),
    [bindingSets],
  )
  const activeEdgeServerLabel = useMemo(
    () =>
      machines.find((machine) => machine.edgeServerId === activeEdgeServerId)?.edgeName ?? activeEdgeServerId,
    [activeEdgeServerId, machines],
  )
  const activeMachine = useMemo(
    () => machines.find((machine) => machine.edgeServerId === activeEdgeServerId) ?? null,
    [activeEdgeServerId, machines],
  )
  const activeMachineGuidance =
    phase === 'ready' && activeMachine
      ? getConstructorEdgeGuidance(activeMachine, deviceCatalog.length > 0)
      : null
  const hasUnsavedChanges = hasUnsavedChangesFromDirtyState(dirtyState)
  useUnsavedChangesGuard({ hasUnsavedChanges })

  const loadDiagram = useCallback(async () => {
    if (!id) {
      setPhase('error')
      setError('Missing diagram id in route.')
      setLayoutRecoveryNotice(null)
      setCanOpenWithEmptyBindings(false)
      return
    }

    setPhase('loading')
    setError(null)
    setLayoutRecoveryNotice(null)
    setCanOpenWithEmptyBindings(false)
    setBindingsSaveError(null)
    setSaveBindingsRequiresLayoutModalOpen(false)
    setBindingsInvalidatedModalError(null)
    setBindingsInvalidatedModalOpen(false)
    setDirtyState({ layoutDirty: false, bindingsDirty: false })
    isSavingBindingsRef.current = false
    isSavingLayoutThenBindingsRef.current = false
    isForwardingLayoutSaveIntentRef.current = false
    shouldSaveBindingsAfterDestructiveSaveRef.current = false

    try {
      const [loadedDiagram, trustedEdgeServers, loadedBindingSets] = await Promise.all([
        getDiagramById(id),
        getAssignedEdgeServers(),
        getBindingsByDiagram(id),
      ])
      let normalizedLayout: EditorRouteDiagram['layout'] = {}
      let layoutRecoveryError: Error | null = null

      try {
        normalizedLayout = importLayoutPayload(loadedDiagram.layout)
      } catch (layoutError) {
        if (!isLayoutPayloadError(layoutError)) {
          throw layoutError
        }
        layoutRecoveryError = layoutError
      }

      const bindingsRecovery = importBindingSetsPayloadWithRecovery(loadedBindingSets)
      const nextMachines = mapAssignedEdgeServersToMachineOptions(trustedEdgeServers)
      const nextActiveEdgeServerId = nextMachines.some(
        (machine) => machine.edgeServerId === requestedEdgeServerId,
      )
        ? requestedEdgeServerId
        : null
      const nextCatalog = await loadCatalogForMachine(nextActiveEdgeServerId)

      setDiagram({
        ...loadedDiagram,
        layout: normalizedLayout,
      })
      setMachines(nextMachines)
      setActiveEdgeServerId(nextActiveEdgeServerId)
      setDeviceCatalog(nextCatalog.deviceCatalog)
      setCommandCatalog(nextCatalog.commandCatalog)
      setBindingSets(bindingsRecovery.recoveryError ? [] : bindingsRecovery.bindingSets)
      setDirtyState({ layoutDirty: false, bindingsDirty: false })

      if (layoutRecoveryError) {
        setLayoutRecoveryNotice(
          `Layout payload was invalid and has been recovered with an empty layout: ${layoutRecoveryError.message}`,
        )
      }

      if (bindingsRecovery.recoveryError) {
        setPhase('error')
        setLayoutRecoveryNotice(null)
        setCanOpenWithEmptyBindings(true)
        setError(`Invalid bindings payload: ${bindingsRecovery.recoveryError.message}`)
        return
      }

      setCanOpenWithEmptyBindings(false)
      setPhase('ready')
    } catch (loadError) {
      setDiagram(null)
      setMachines([])
      setActiveEdgeServerId(null)
      setDeviceCatalog([])
      setCommandCatalog([])
      setBindingSets([])
      setDirtyState({ layoutDirty: false, bindingsDirty: false })
      setPhase('error')
      setLayoutRecoveryNotice(null)
      setCanOpenWithEmptyBindings(false)

      if (isLayoutPayloadError(loadError)) {
        setError(`Invalid diagram layout payload: ${loadError.message}`)
        return
      }

      if (isBindingsPayloadError(loadError)) {
        setError(`Invalid bindings payload: ${loadError.message}`)
        return
      }

      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Failed to load diagram for full constructor mode.',
      )
    }
  }, [id, loadCatalogForMachine, requestedEdgeServerId])

  useEffect(() => {
    void loadDiagram()
  }, [loadDiagram])

  const handleDirtyStateChange = useCallback((nextDirtyState: DirtyState) => {
    setDirtyState((previous) => {
      if (
        isSyncingBindingsBaselineRef.current &&
        nextDirtyState.layoutDirty === false &&
        nextDirtyState.bindingsDirty === false
      ) {
        return {
          layoutDirty: previous.layoutDirty,
          bindingsDirty: false,
        }
      }

      return nextDirtyState
    })
  }, [])

  const syncRuntimeForActiveMachine = useCallback(async () => {
    const runtime = runtimeRef.current
    if (!runtime) {
      return
    }

    isSyncingBindingsBaselineRef.current = true

    try {
      runtime.setActiveMachine(activeEdgeServerId)

      const activeBindingSet = findBindingSetForEdgeServer(bindingSets, activeEdgeServerId)
      await runtime.loadBindingProfile({
        widgetBindings: activeBindingSet?.widgetBindings ?? [],
        commandBindings: activeBindingSet?.commandBindings ?? [],
      })
      setDirtyState((previous) => ({ ...previous, bindingsDirty: false }))
    } catch (syncError) {
      setBindingsSaveError(
        toErrorMessage(syncError, 'Failed to apply bindings for selected machine context.'),
      )
    } finally {
      isSyncingBindingsBaselineRef.current = false
    }
  }, [activeEdgeServerId, bindingSets])

  useEffect(() => {
    void syncRuntimeForActiveMachine()
  }, [syncRuntimeForActiveMachine])

  const handleRuntimeReady = useCallback(
    (runtime: HostedConstructorInstance) => {
      runtimeRef.current = runtime
      saveFlow.registerRuntime(runtime)

      void syncRuntimeForActiveMachine()
    },
    [saveFlow, syncRuntimeForActiveMachine],
  )

  const handleMachineChange = useCallback(
    (nextEdgeServerId: string | null) => {
      isSyncingBindingsBaselineRef.current = true
      setActiveEdgeServerId(nextEdgeServerId)

      const runtime = runtimeRef.current
      if (!runtime) {
        isSyncingBindingsBaselineRef.current = false
        return
      }

      void (async () => {
        try {
          const nextCatalog = await loadCatalogForMachine(nextEdgeServerId)
          setDeviceCatalog(nextCatalog.deviceCatalog)
          setCommandCatalog(nextCatalog.commandCatalog)
          runtime.updateCatalog({
            machines,
            deviceCatalog: nextCatalog.deviceCatalog,
            commandCatalog: nextCatalog.commandCatalog,
          })
        } catch (catalogError) {
          setBindingsSaveError(
            toErrorMessage(catalogError, 'Failed to load machine catalog for selected context.'),
          )
        }
      })()
    },
    [loadCatalogForMachine, machines],
  )

  const persistActiveBindingSet = useCallback(
    async (options?: { replaceAllExisting?: boolean }): Promise<boolean> => {
      if (!diagram || !activeEdgeServerId || isSavingBindingsRef.current) {
        return false
      }

      const runtime = runtimeRef.current
      if (!runtime) {
        setBindingsSaveError('Hosted constructor runtime is not ready yet.')
        return false
      }

      isSavingBindingsRef.current = true
      setBindingsSaveError(null)

      try {
        const runtimeProfile = await runtime.getBindingProfile()
        const serializedBindings = exportWidgetBindingsPayload(runtimeProfile.widgetBindings)
        const serializedCommandBindings = exportCommandBindingsPayload(runtimeProfile.commandBindings)
        const savedBindingSet = await createBinding(diagram._id, {
          edgeServerId: activeEdgeServerId,
          widgetBindings: serializedBindings,
          commandBindings: serializedCommandBindings,
        })
        const [normalizedSavedSet] = importBindingSetsPayload([savedBindingSet])

        if (!normalizedSavedSet) {
          throw new Error('Saved binding set payload is empty.')
        }

        if (options?.replaceAllExisting) {
          setBindingSets([normalizedSavedSet])
        } else {
          setBindingSets((previous) => [
            ...previous.filter((bindingSet) => bindingSet.edgeServerId !== normalizedSavedSet.edgeServerId),
            normalizedSavedSet,
          ])
        }
        setDirtyState((previous) => ({ ...previous, bindingsDirty: false }))
        return true
      } catch (saveError) {
        if (isBindingsPayloadError(saveError)) {
          setBindingsSaveError(`Invalid bindings payload: ${saveError.message}`)
          return false
        }

        setBindingsSaveError(toErrorMessage(saveError, 'Failed to save binding set.'))
        return false
      } finally {
        isSavingBindingsRef.current = false
      }
    },
    [activeEdgeServerId, diagram],
  )

  const handleSaveBindingsIntent = useCallback(() => {
    if (!diagram || !activeEdgeServerId || isSavingBindingsRef.current || isSavingLayoutThenBindingsRef.current) {
      return
    }

    if (dirtyState.layoutDirty) {
      setSaveBindingsRequiresLayoutModalOpen(true)
      setBindingsInvalidatedModalError(null)
      return
    }

    void (async () => {
      await persistActiveBindingSet()
    })()
  }, [
    activeEdgeServerId,
    diagram,
    dirtyState.layoutDirty,
    persistActiveBindingSet,
  ])

  const handleConfirmSaveLayoutThenBindings = useCallback(() => {
    if (isSavingLayoutThenBindingsRef.current) {
      return
    }

    setSaveBindingsRequiresLayoutModalOpen(false)

    if (hasPersistedBindingSets) {
      shouldSaveBindingsAfterDestructiveSaveRef.current = true
      setBindingsInvalidatedModalError(null)
      setBindingsInvalidatedModalOpen(true)
      return
    }

    void (async () => {
      isSavingLayoutThenBindingsRef.current = true

      try {
        const layoutSaved = await saveFlow.saveLayoutNow()
        if (!layoutSaved) {
          return
        }

        setDirtyState((previous) => ({ ...previous, layoutDirty: false }))
        await persistActiveBindingSet()
      } finally {
        isSavingLayoutThenBindingsRef.current = false
      }
    })()
  }, [hasPersistedBindingSets, persistActiveBindingSet, saveFlow])

  const handleSaveLayoutIntent = useCallback(() => {
    if (isSubmittingDestructiveSave || isForwardingLayoutSaveIntentRef.current) {
      return
    }

    if (hasPersistedBindingSets) {
      setSaveBindingsRequiresLayoutModalOpen(false)
      shouldSaveBindingsAfterDestructiveSaveRef.current = false
      setBindingsInvalidatedModalError(null)
      setBindingsInvalidatedModalOpen(true)
      return
    }

    shouldSaveBindingsAfterDestructiveSaveRef.current = false
    setSaveBindingsRequiresLayoutModalOpen(false)
    isForwardingLayoutSaveIntentRef.current = true
    saveFlow.onSaveLayoutIntent()
    void Promise.resolve().then(() => {
      isForwardingLayoutSaveIntentRef.current = false
    })
  }, [hasPersistedBindingSets, isSubmittingDestructiveSave, saveFlow])

  const handleSaveAsCopyFromModal = useCallback(() => {
    if (isSubmittingDestructiveSave) {
      return
    }

    shouldSaveBindingsAfterDestructiveSaveRef.current = false
    setSaveBindingsRequiresLayoutModalOpen(false)
    setBindingsInvalidatedModalError(null)
    setBindingsInvalidatedModalOpen(false)
    saveFlow.onSaveAsIntent()
  }, [isSubmittingDestructiveSave, saveFlow])

  const handleContinueDestructiveSave = useCallback(() => {
    if (!diagram || isSubmittingDestructiveSave) {
      return
    }

    const runtime = runtimeRef.current
    if (!runtime) {
      setBindingsInvalidatedModalError('Hosted constructor runtime is not ready yet.')
      return
    }

    setIsSubmittingDestructiveSave(true)
    setBindingsInvalidatedModalError(null)

    void (async () => {
      try {
        const shouldSaveBindingsAfterLayout = shouldSaveBindingsAfterDestructiveSaveRef.current
        const bindingProfileBeforeLayoutReload = shouldSaveBindingsAfterLayout
          ? await runtime.getBindingProfile()
          : null
        const runtimeLayout = await runtime.getLayout()
        const serializedLayout = exportLayoutPayload(runtimeLayout)

        await updateDiagram(diagram._id, {
          layout: serializedLayout,
          __v: diagram.__v,
        })
        await deleteAllBindings(diagram._id)

        const latestDiagram = await getDiagramById(diagram._id)
        const latestLayout = importLayoutPayload(latestDiagram.layout)

        await runtime.loadLayout(latestLayout)
        if (bindingProfileBeforeLayoutReload) {
          await runtime.loadBindingProfile(bindingProfileBeforeLayoutReload)
        }
        setDiagram({
          ...latestDiagram,
          layout: latestLayout,
        })
        setBindingsInvalidatedModalOpen(false)
        setBindingSets([])

        shouldSaveBindingsAfterDestructiveSaveRef.current = false
        setDirtyState((previous) => ({ ...previous, layoutDirty: false }))

        if (shouldSaveBindingsAfterLayout) {
          await persistActiveBindingSet({ replaceAllExisting: true })
          return
        }

        setDirtyState({ layoutDirty: false, bindingsDirty: false })
      } catch (destructiveSaveError) {
        if (isLayoutPayloadError(destructiveSaveError)) {
          setBindingsInvalidatedModalError(
            `Invalid diagram layout payload: ${destructiveSaveError.message}`,
          )
          return
        }

        if (isBindingsPayloadError(destructiveSaveError)) {
          setBindingsInvalidatedModalError(
            `Invalid bindings payload: ${destructiveSaveError.message}`,
          )
          return
        }

        setBindingsInvalidatedModalError(
          toErrorMessage(destructiveSaveError, 'Failed to complete destructive save flow.'),
        )
      } finally {
        shouldSaveBindingsAfterDestructiveSaveRef.current = false
        setIsSubmittingDestructiveSave(false)
      }
    })()
  }, [diagram, isSubmittingDestructiveSave, persistActiveBindingSet])

  return (
    <section className="flex h-full min-h-[calc(100svh-3.5rem)] w-full flex-col" style={{ overscrollBehaviorX: 'none' }}>
      {bindingsSaveError && (
        <div className="px-4 pt-3">
          <p className="rounded-md border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 px-3 py-2 text-xs text-[var(--color-danger)]">
            {bindingsSaveError}
          </p>
        </div>
      )}
      {layoutRecoveryNotice && (
        <div className="px-4 pt-3">
          <p className="rounded-md border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 px-3 py-2 text-xs text-[var(--color-warning)]">
            {layoutRecoveryNotice}
          </p>
        </div>
      )}
      {activeMachineGuidance && (
        <div className="px-4 pt-3">
          <p className="rounded-md border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 px-3 py-2 text-xs text-[var(--color-warning)]">
            {activeMachineGuidance.replace('Selected edge', activeEdgeServerLabel ?? 'Selected edge')}
          </p>
        </div>
      )}

      {phase === 'loading' && (
        <div className="mx-4 my-4 flex min-h-[18rem] flex-1 items-center justify-center border border-dashed border-[var(--color-surface-border)] text-sm text-[#94a3b8]">
          Loading diagram...
        </div>
      )}

      {phase === 'error' && (
        <div className="mx-4 my-4 flex min-h-[18rem] flex-1 flex-col items-center justify-center gap-3 border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 p-6 text-center">
          <p className="text-sm font-medium text-[var(--color-danger)]">
            Unable to open hosted constructor page.
          </p>
          {error && <p className="text-xs text-[var(--color-danger)]/90">{error}</p>}
          {canOpenWithEmptyBindings && diagram && (
            <button
              type="button"
              className="rounded-md border border-[var(--color-surface-border)] px-3 py-1.5 text-xs text-white hover:bg-[var(--color-surface-200)]"
              onClick={() => {
                setBindingSets([])
                setDirtyState((previous) => ({ ...previous, bindingsDirty: false }))
                setCanOpenWithEmptyBindings(false)
                setError(null)
                setPhase('ready')
              }}
            >
              Open with empty bindings
            </button>
          )}
          <button
            type="button"
            className="rounded-md border border-[var(--color-surface-border)] px-3 py-1.5 text-xs text-white hover:bg-[var(--color-surface-200)]"
            onClick={() => {
              void loadDiagram()
            }}
          >
            Retry loading
          </button>
        </div>
      )}

      {phase === 'ready' && diagram && (
        <div className="flex min-h-[18rem] flex-1 overflow-hidden">
          <ConstructorHost
            className="h-full w-full"
            mode="full"
            initialLayout={diagram.layout}
            machines={machines}
            activeEdgeServerId={activeEdgeServerId}
            deviceCatalog={deviceCatalog}
            commandCatalog={commandCatalog}
            onReady={handleRuntimeReady}
            onSaveLayoutIntent={handleSaveLayoutIntent}
            onSaveAsIntent={saveFlow.onSaveAsIntent}
            onSaveBindingsIntent={handleSaveBindingsIntent}
            onMachineChange={handleMachineChange}
            onDirtyStateChange={handleDirtyStateChange}
          />
        </div>
      )}

      <SaveAsDialog
        open={saveFlow.saveAsDialog.open}
        initialName={saveFlow.saveAsDialog.initialName}
        isSubmitting={saveFlow.saveAsDialog.isSubmitting}
        error={saveFlow.saveAsDialog.error}
        onSubmit={saveFlow.saveAsDialog.onSubmit}
        onCancel={saveFlow.saveAsDialog.onCancel}
      />

      <SaveConflictModal
        open={saveFlow.saveConflictModal.open}
        isReloadingLatest={saveFlow.saveConflictModal.isReloadingLatest}
        isSavingAs={saveFlow.saveConflictModal.isSavingAs}
        error={saveFlow.saveConflictModal.error}
        onReloadLatest={saveFlow.saveConflictModal.onReloadLatest}
        onContinueEditing={saveFlow.saveConflictModal.onContinueEditing}
        onSaveAs={saveFlow.saveConflictModal.onSaveAs}
      />

      <SaveBindingsRequiresLayoutModal
        open={saveBindingsRequiresLayoutModalOpen}
        isSubmitting={isSavingLayoutThenBindingsRef.current}
        onConfirm={handleConfirmSaveLayoutThenBindings}
        onCancel={() => {
          if (isSavingLayoutThenBindingsRef.current) {
            return
          }

          shouldSaveBindingsAfterDestructiveSaveRef.current = false
          setSaveBindingsRequiresLayoutModalOpen(false)
        }}
      />

      <BindingsInvalidatedModal
        open={bindingsInvalidatedModalOpen}
        isSubmitting={isSubmittingDestructiveSave}
        error={bindingsInvalidatedModalError}
        onSaveAsCopy={handleSaveAsCopyFromModal}
        onContinueDestructiveSave={handleContinueDestructiveSave}
        onCancel={() => {
          if (isSubmittingDestructiveSave) {
            return
          }

          shouldSaveBindingsAfterDestructiveSaveRef.current = false
          setSaveBindingsRequiresLayoutModalOpen(false)
          setBindingsInvalidatedModalError(null)
          setBindingsInvalidatedModalOpen(false)
        }}
      />
    </section>
  )
}
