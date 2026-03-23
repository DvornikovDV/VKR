import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { loadHostedConstructor } from '@/features/constructor-host/loadHostedConstructor'
import type {
  DirtyState,
  EditorDeviceMetricCatalogEntry,
  EditorMachineOption,
  EditorMode,
  HostedConstructorInstance,
  LayoutDocument,
  WidgetBindingRecord,
} from '@/features/constructor-host/types'
import { DEFAULT_MACHINE_SWITCH_MESSAGE } from '@/features/constructor-host/useUnsavedChangesGuard'

type HostPhase = 'loading' | 'ready' | 'error'

const HOSTED_RUNTIME_ROOT_SELECTOR = '[data-hosted-constructor-root="true"]'
const EMPTY_BINDINGS: WidgetBindingRecord[] = []
const EMPTY_MACHINES: EditorMachineOption[] = []
const EMPTY_CATALOG: EditorDeviceMetricCatalogEntry[] = []
const CLEAN_DIRTY_STATE: DirtyState = { layoutDirty: false, bindingsDirty: false }

export const MACHINE_SWITCH_UNSAVED_CHANGES_MESSAGE = DEFAULT_MACHINE_SWITCH_MESSAGE

export interface ConstructorHostProps {
  mode: EditorMode
  initialLayout: LayoutDocument
  initialBindings?: WidgetBindingRecord[]
  machines?: EditorMachineOption[]
  deviceCatalog?: EditorDeviceMetricCatalogEntry[]
  activeEdgeServerId?: string | null
  className?: string
  onReady?: (instance: HostedConstructorInstance) => void
  onDirtyStateChange?: (state: DirtyState) => void
  onSaveLayoutIntent?: () => void
  onSaveAsIntent?: () => void
  onSaveBindingsIntent?: () => void
  onMachineChange?: (edgeServerId: string | null) => void
  onFatalError?: (error: Error) => void
}

function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error
  }

  return new Error('Unknown hosted constructor runtime error.')
}

function createNoopCallbacks() {
  return {
    onDirtyStateChange: (_state: DirtyState) => undefined,
    onSaveLayoutIntent: () => undefined,
    onSaveAsIntent: () => undefined,
    onSaveBindingsIntent: () => undefined,
    onMachineChange: (_edgeServerId: string | null) => undefined,
    onFatalError: (_error: Error) => undefined,
  }
}

function normalizeDirtyState(state: DirtyState | undefined, mode: EditorMode): DirtyState {
  if (!state || typeof state !== 'object') {
    return CLEAN_DIRTY_STATE
  }

  return {
    layoutDirty: Boolean(state.layoutDirty),
    bindingsDirty: mode === 'full' ? Boolean(state.bindingsDirty) : false,
  }
}

function hasUnsavedChanges(state: DirtyState): boolean {
  return state.layoutDirty || state.bindingsDirty
}

function confirmBrowserNavigation(message: string): boolean {
  if (typeof window === 'undefined') {
    return true
  }

  return window.confirm(message)
}

function cleanupHostedRuntimeRoots(container: HTMLElement | null): void {
  if (!container) {
    return
  }

  const staleRoots = container.querySelectorAll(HOSTED_RUNTIME_ROOT_SELECTOR)
  staleRoots.forEach((rootNode) => {
    if (rootNode.parentNode) {
      rootNode.parentNode.removeChild(rootNode)
    }
  })
}

export function ConstructorHost({
  mode,
  initialLayout,
  initialBindings,
  machines,
  deviceCatalog,
  activeEdgeServerId = null,
  className,
  onReady,
  onDirtyStateChange,
  onSaveLayoutIntent,
  onSaveAsIntent,
  onSaveBindingsIntent,
  onMachineChange,
  onFatalError,
}: ConstructorHostProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const instanceRef = useRef<HostedConstructorInstance | null>(null)
  const [phase, setPhase] = useState<HostPhase>('loading')
  const [error, setError] = useState<string | null>(null)
  const [retryKey, setRetryKey] = useState(0)
  const [, setDirtyState] = useState<DirtyState>(CLEAN_DIRTY_STATE)
  const dirtyStateRef = useRef<DirtyState>(CLEAN_DIRTY_STATE)
  const activeMachineRef = useRef<string | null>(activeEdgeServerId)
  const revertTargetMachineRef = useRef<string | null>(null)

  const callbacksRef = useRef({
    ...createNoopCallbacks(),
    onReady,
    onDirtyStateChange,
    onSaveLayoutIntent,
    onSaveAsIntent,
    onSaveBindingsIntent,
    onMachineChange,
    onFatalError,
  })

  useEffect(() => {
    callbacksRef.current = {
      ...createNoopCallbacks(),
      onReady,
      onDirtyStateChange,
      onSaveLayoutIntent,
      onSaveAsIntent,
      onSaveBindingsIntent,
      onMachineChange,
      onFatalError,
    }
  }, [
    onReady,
    onDirtyStateChange,
    onSaveLayoutIntent,
    onSaveAsIntent,
    onSaveBindingsIntent,
    onMachineChange,
    onFatalError,
  ])

  const resolvedBindings = initialBindings ?? EMPTY_BINDINGS
  const resolvedMachines = machines ?? EMPTY_MACHINES
  const resolvedCatalog = deviceCatalog ?? EMPTY_CATALOG

  const runtimeConfig = useMemo(
    () => ({
      mode,
      initialLayout,
      initialBindings: resolvedBindings,
      machines: resolvedMachines,
      deviceCatalog: resolvedCatalog,
      activeEdgeServerId,
    }),
    [mode, initialLayout, resolvedBindings, resolvedMachines, resolvedCatalog, activeEdgeServerId],
  )

  useEffect(() => {
    activeMachineRef.current = activeEdgeServerId
  }, [activeEdgeServerId])

  const reportFatalError = useCallback((runtimeError: unknown) => {
    const normalizedError = toError(runtimeError)
    const currentInstance = instanceRef.current
    instanceRef.current = null
    if (currentInstance) {
      void Promise.resolve(currentInstance.destroy())
    }

    callbacksRef.current.onFatalError?.(normalizedError)
    setError(normalizedError.message)
    setPhase('error')
  }, [])

  useEffect(() => {
    let isActive = true

    async function mountRuntime() {
      const container = containerRef.current
      if (!container) {
        return
      }

      cleanupHostedRuntimeRoots(container)

      setPhase('loading')
      setError(null)
      instanceRef.current = null
      dirtyStateRef.current = CLEAN_DIRTY_STATE
      setDirtyState(CLEAN_DIRTY_STATE)
      activeMachineRef.current = runtimeConfig.activeEdgeServerId

      try {
        const hostedModule = await loadHostedConstructor()
        if (!isActive) {
          return
        }

        const instance = await hostedModule.createHostedConstructor({
          container,
          mode: runtimeConfig.mode,
          initialLayout: runtimeConfig.initialLayout,
          initialBindings: runtimeConfig.initialBindings,
          machines: runtimeConfig.machines,
          deviceCatalog: runtimeConfig.deviceCatalog,
          activeEdgeServerId: runtimeConfig.activeEdgeServerId,
          callbacks: {
            onDirtyStateChange: (state) => {
              const normalizedState = normalizeDirtyState(state, runtimeConfig.mode)
              dirtyStateRef.current = normalizedState
              setDirtyState(normalizedState)
              callbacksRef.current.onDirtyStateChange?.(normalizedState)
            },
            onSaveLayoutIntent: () =>
              callbacksRef.current.onSaveLayoutIntent?.(),
            onSaveAsIntent: () =>
              callbacksRef.current.onSaveAsIntent?.(),
            onSaveBindingsIntent: () =>
              callbacksRef.current.onSaveBindingsIntent?.(),
            onMachineChange: (edgeServerId) => {
              const nextMachineId = edgeServerId ?? null

              if (
                revertTargetMachineRef.current !== null &&
                nextMachineId === revertTargetMachineRef.current
              ) {
                revertTargetMachineRef.current = null
                activeMachineRef.current = nextMachineId
                return
              }
              if (revertTargetMachineRef.current !== null) {
                revertTargetMachineRef.current = null
              }

              const shouldWarnBeforeMachineSwitch =
                runtimeConfig.mode === 'full' &&
                nextMachineId !== activeMachineRef.current &&
                hasUnsavedChanges(dirtyStateRef.current)

              if (
                shouldWarnBeforeMachineSwitch &&
                !confirmBrowserNavigation(MACHINE_SWITCH_UNSAVED_CHANGES_MESSAGE)
              ) {
                revertTargetMachineRef.current = activeMachineRef.current
                instanceRef.current?.setActiveMachine(activeMachineRef.current)
                return
              }

              activeMachineRef.current = nextMachineId
              callbacksRef.current.onMachineChange?.(nextMachineId)
            },
            onFatalError: (runtimeError) => {
              if (!isActive) {
                return
              }

              reportFatalError(runtimeError)
            },
          },
        })

        if (!isActive) {
          await Promise.resolve(instance.destroy())
          return
        }

        instanceRef.current = instance
        callbacksRef.current.onReady?.(instance)
        setPhase('ready')
      } catch (mountError) {
        if (!isActive) {
          return
        }

        reportFatalError(mountError)
      }
    }

    void mountRuntime()

    return () => {
      isActive = false

      const currentInstance = instanceRef.current
      instanceRef.current = null
      dirtyStateRef.current = CLEAN_DIRTY_STATE
      setDirtyState(CLEAN_DIRTY_STATE)
      if (currentInstance) {
        void Promise.resolve(currentInstance.destroy())
      }
      cleanupHostedRuntimeRoots(containerRef.current)
    }
  }, [reportFatalError, retryKey, runtimeConfig])

  return (
    <div className={className ?? ''}>
      <div ref={containerRef} className="h-full w-full" data-testid="constructor-host-runtime" />

      {phase === 'loading' && (
        <div className="flex h-full min-h-[16rem] items-center justify-center rounded-lg border border-dashed border-[var(--color-surface-border)] bg-[var(--color-surface-100)] text-sm text-[#94a3b8]">
          Loading hosted constructor runtime...
        </div>
      )}

      {phase === 'error' && (
        <div className="flex h-full min-h-[16rem] flex-col items-center justify-center gap-3 rounded-lg border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 p-6 text-center">
          <p className="text-sm font-medium text-[var(--color-danger)]">
            Failed to initialize hosted constructor runtime.
          </p>
          {error && <p className="text-xs text-[var(--color-danger)]/90">{error}</p>}
          <button
            type="button"
            className="rounded-md border border-[var(--color-surface-border)] px-3 py-1.5 text-xs text-white hover:bg-[var(--color-surface-200)]"
            onClick={() => {
              setRetryKey((value) => value + 1)
            }}
          >
            Retry runtime bootstrap
          </button>
        </div>
      )}
    </div>
  )
}
