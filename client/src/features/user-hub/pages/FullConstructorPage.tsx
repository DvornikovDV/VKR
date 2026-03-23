import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pencil } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { ConstructorHost } from '@/features/constructor-host/ConstructorHost'
import {
  mapCatalogRowsToDeviceMetricCatalog,
  mapTrustedEdgeServersToMachineOptions,
} from '@/features/constructor-host/adapters/catalogAdapter'
import {
  exportWidgetBindingsPayload,
  findBindingSetForEdgeServer,
  importBindingSetsPayload,
  importBindingSetsPayloadWithRecovery,
  isBindingsPayloadError,
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
  EditorMachineOption,
  HostedConstructorInstance,
} from '@/features/constructor-host/types'
import {
  hasUnsavedChangesFromDirtyState,
  useUnsavedChangesGuard,
} from '@/features/constructor-host/useUnsavedChangesGuard'
import { useHostedLayoutSaveFlow } from '@/features/constructor-host/useHostedLayoutSaveFlow'
import { deleteAllBindings, getBindingsByDiagram, createBinding } from '@/shared/api/bindings'
import { BindingsInvalidatedModal } from '@/shared/components/BindingsInvalidatedModal'
import { SaveAsDialog } from '@/shared/components/SaveAsDialog'
import { SaveConflictModal } from '@/shared/components/SaveConflictModal'
import type { EditorRouteDiagram } from '@/shared/api/diagrams'
import { getDiagramById, updateDiagram } from '@/shared/api/diagrams'
import { getEdgeServerCatalog, getTrustedEdgeServers } from '@/shared/api/edgeServers'

type PagePhase = 'loading' | 'ready' | 'error'

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }

  return fallback
}

export function FullConstructorPage() {
  const { id } = useParams<{ id: string }>()
  const runtimeRef = useRef<HostedConstructorInstance | null>(null)
  const diagramNameInputRef = useRef<HTMLInputElement | null>(null)
  const isSyncingBindingsBaselineRef = useRef(false)
  const isSavingBindingsRef = useRef(false)
  const isForwardingLayoutSaveIntentRef = useRef(false)
  const [phase, setPhase] = useState<PagePhase>('loading')
  const [diagram, setDiagram] = useState<EditorRouteDiagram | null>(null)
  const [machines, setMachines] = useState<EditorMachineOption[]>([])
  const [initialActiveEdgeServerId, setInitialActiveEdgeServerId] = useState<string | null>(null)
  const [activeEdgeServerId, setActiveEdgeServerId] = useState<string | null>(null)
  const [deviceCatalog, setDeviceCatalog] = useState<EditorDeviceMetricCatalogEntry[]>([])
  const [bindingSets, setBindingSets] = useState<DiagramBindingSetRecord[]>([])
  const [bindingsSaveError, setBindingsSaveError] = useState<string | null>(null)
  const [bindingsInvalidatedModalOpen, setBindingsInvalidatedModalOpen] = useState(false)
  const [isSubmittingDestructiveSave, setIsSubmittingDestructiveSave] = useState(false)
  const [bindingsInvalidatedModalError, setBindingsInvalidatedModalError] = useState<string | null>(null)
  const [dirtyState, setDirtyState] = useState<DirtyState>({ layoutDirty: false, bindingsDirty: false })
  const [error, setError] = useState<string | null>(null)
  const [layoutRecoveryNotice, setLayoutRecoveryNotice] = useState<string | null>(null)
  const [canOpenWithEmptyBindings, setCanOpenWithEmptyBindings] = useState(false)
  const [isEditingDiagramName, setIsEditingDiagramName] = useState(false)
  const [diagramNameDraft, setDiagramNameDraft] = useState('')
  const [isRenamingDiagram, setIsRenamingDiagram] = useState(false)
  const [diagramNameError, setDiagramNameError] = useState<string | null>(null)

  const saveFlow = useHostedLayoutSaveFlow({
    diagram,
    onDiagramChange: setDiagram,
    routePrefix: '/hub/editor',
  })

  const loadCatalogForMachine = useCallback(
    async (edgeServerId: string | null): Promise<EditorDeviceMetricCatalogEntry[]> => {
      if (!edgeServerId) {
        return []
      }

      const catalogRows = await getEdgeServerCatalog(edgeServerId)
      return mapCatalogRowsToDeviceMetricCatalog(edgeServerId, catalogRows)
    },
    [],
  )

  const hasPersistedBindingSets = useMemo(
    () => bindingSets.some((bindingSet) => bindingSet.widgetBindings.length > 0),
    [bindingSets],
  )
  const hasUnsavedChanges = hasUnsavedChangesFromDirtyState(dirtyState)
  useUnsavedChangesGuard({ hasUnsavedChanges })

  useEffect(() => {
    if (diagram && !isEditingDiagramName) {
      setDiagramNameDraft(diagram.name)
    }
  }, [diagram, isEditingDiagramName])

  useEffect(() => {
    if (!isEditingDiagramName || !diagramNameInputRef.current) {
      return
    }

    diagramNameInputRef.current.focus()
    diagramNameInputRef.current.select()
  }, [isEditingDiagramName])

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
    setIsEditingDiagramName(false)
    setIsRenamingDiagram(false)
    setDiagramNameError(null)
    setBindingsSaveError(null)
    setBindingsInvalidatedModalError(null)
    setBindingsInvalidatedModalOpen(false)
    setDirtyState({ layoutDirty: false, bindingsDirty: false })
    isSavingBindingsRef.current = false
    isForwardingLayoutSaveIntentRef.current = false

    try {
      const [loadedDiagram, trustedEdgeServers, loadedBindingSets] = await Promise.all([
        getDiagramById(id),
        getTrustedEdgeServers(),
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
      const nextMachines = mapTrustedEdgeServersToMachineOptions(trustedEdgeServers)
      const nextActiveEdgeServerId = nextMachines[0]?.edgeServerId ?? null
      const nextCatalog = await loadCatalogForMachine(nextActiveEdgeServerId)

      setDiagram({
        ...loadedDiagram,
        layout: normalizedLayout,
      })
      setMachines(nextMachines)
      setInitialActiveEdgeServerId(nextActiveEdgeServerId)
      setActiveEdgeServerId(nextActiveEdgeServerId)
      setDeviceCatalog(nextCatalog)
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
      setInitialActiveEdgeServerId(null)
      setActiveEdgeServerId(null)
      setDeviceCatalog([])
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
  }, [id, loadCatalogForMachine])

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
      await runtime.loadBindings(activeBindingSet?.widgetBindings ?? [])
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

      runtime.updateCatalog({
        machines,
        deviceCatalog,
      })
      void syncRuntimeForActiveMachine()
    },
    [deviceCatalog, machines, saveFlow, syncRuntimeForActiveMachine],
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
          runtime.updateCatalog({
            machines,
            deviceCatalog: nextCatalog,
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

  const handleSaveBindingsIntent = useCallback(() => {
    if (!diagram || !activeEdgeServerId || isSavingBindingsRef.current) {
      return
    }

    const runtime = runtimeRef.current
    if (!runtime) {
      setBindingsSaveError('Hosted constructor runtime is not ready yet.')
      return
    }

    isSavingBindingsRef.current = true
    setBindingsSaveError(null)

    void (async () => {
      try {
        const runtimeBindings = await runtime.getBindings()
        const serializedBindings = exportWidgetBindingsPayload(runtimeBindings)
        const savedBindingSet = await createBinding(diagram._id, {
          edgeServerId: activeEdgeServerId,
          widgetBindings: serializedBindings,
        })
        const normalizedSavedSet = importBindingSetsPayload([savedBindingSet])[0]

        setBindingSets((previous) => [
          ...previous.filter((bindingSet) => bindingSet.edgeServerId !== normalizedSavedSet.edgeServerId),
          normalizedSavedSet,
        ])
        setDirtyState((previous) => ({ ...previous, bindingsDirty: false }))
      } catch (saveError) {
        if (isBindingsPayloadError(saveError)) {
          setBindingsSaveError(`Invalid bindings payload: ${saveError.message}`)
          return
        }

        setBindingsSaveError(toErrorMessage(saveError, 'Failed to save binding set.'))
      } finally {
        isSavingBindingsRef.current = false
      }
    })()
  }, [activeEdgeServerId, diagram])

  const handleSaveLayoutIntent = useCallback(() => {
    if (isSubmittingDestructiveSave || isForwardingLayoutSaveIntentRef.current) {
      return
    }

    if (hasPersistedBindingSets) {
      setBindingsInvalidatedModalError(null)
      setBindingsInvalidatedModalOpen(true)
      return
    }

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
        setDiagram({
          ...latestDiagram,
          layout: latestLayout,
        })
        setBindingSets([])
        setDirtyState({ layoutDirty: false, bindingsDirty: false })
        setBindingsInvalidatedModalOpen(false)
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
        setIsSubmittingDestructiveSave(false)
      }
    })()
  }, [diagram, isSubmittingDestructiveSave])

  const startDiagramRename = useCallback(() => {
    if (!diagram || isRenamingDiagram) {
      return
    }

    setDiagramNameError(null)
    setDiagramNameDraft(diagram.name)
    setIsEditingDiagramName(true)
  }, [diagram, isRenamingDiagram])

  const cancelDiagramRename = useCallback(() => {
    if (!diagram || isRenamingDiagram) {
      return
    }

    setDiagramNameError(null)
    setDiagramNameDraft(diagram.name)
    setIsEditingDiagramName(false)
  }, [diagram, isRenamingDiagram])

  const commitDiagramRename = useCallback(async () => {
    if (!diagram || !isEditingDiagramName || isRenamingDiagram) {
      return
    }

    const trimmedName = diagramNameDraft.trim()
    if (trimmedName.length === 0) {
      setDiagramNameError('Diagram name cannot be empty.')
      return
    }

    if (trimmedName === diagram.name) {
      setDiagramNameError(null)
      setIsEditingDiagramName(false)
      return
    }

    setDiagramNameError(null)
    setIsRenamingDiagram(true)

    try {
      await updateDiagram(diagram._id, {
        name: trimmedName,
        __v: diagram.__v,
      })

      setDiagram((previous) => {
        if (!previous || previous._id !== diagram._id) {
          return previous
        }

        return {
          ...previous,
          name: trimmedName,
          __v: previous.__v + 1,
        }
      })
      setIsEditingDiagramName(false)
    } catch (renameError) {
      setDiagramNameError(toErrorMessage(renameError, 'Failed to rename diagram.'))
    } finally {
      setIsRenamingDiagram(false)
    }
  }, [diagram, diagramNameDraft, isEditingDiagramName, isRenamingDiagram])

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

      {phase === 'ready' && diagram && (
        <div className="px-4 pt-3">
          <div className="rounded-md border border-[var(--color-surface-border)] bg-[var(--color-surface-100)] px-3 py-2">
            <div className="flex items-center gap-2">
              {isEditingDiagramName ? (
                <input
                  ref={diagramNameInputRef}
                  type="text"
                  value={diagramNameDraft}
                  disabled={isRenamingDiagram}
                  onChange={(event) => setDiagramNameDraft(event.target.value)}
                  onBlur={() => {
                    void commitDiagramRename()
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      event.currentTarget.blur()
                      return
                    }

                    if (event.key === 'Escape') {
                      event.preventDefault()
                      cancelDiagramRename()
                    }
                  }}
                  className="h-8 min-w-0 flex-1 rounded-md border border-[var(--color-surface-border)] bg-[var(--color-surface-200)] px-2 text-sm font-semibold text-white outline-none focus:border-[var(--color-brand-500)]"
                  aria-label="Diagram name"
                />
              ) : (
                <h1 className="truncate text-sm font-semibold text-white">{diagram.name}</h1>
              )}

              {!isEditingDiagramName && (
                <button
                  type="button"
                  onClick={startDiagramRename}
                  disabled={isRenamingDiagram}
                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[var(--color-surface-border)] text-[#cbd5e1] hover:bg-[var(--color-surface-200)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
                  title="Rename diagram"
                  aria-label="Rename diagram"
                >
                  <Pencil size={12} />
                </button>
              )}
            </div>

            {diagramNameError && (
              <p className="mt-2 text-xs text-[var(--color-danger)]">{diagramNameError}</p>
            )}
          </div>
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
            activeEdgeServerId={initialActiveEdgeServerId}
            deviceCatalog={deviceCatalog}
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

          setBindingsInvalidatedModalError(null)
          setBindingsInvalidatedModalOpen(false)
        }}
      />
    </section>
  )
}
