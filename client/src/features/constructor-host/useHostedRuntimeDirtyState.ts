import { useCallback, useRef, useState } from 'react'
import type { DirtyState } from './types'

type DirtyStateUpdater = DirtyState | ((previous: DirtyState) => DirtyState)

const CLEAN_DIRTY_STATE: DirtyState = { layoutDirty: false, bindingsDirty: false }

function isCleanDirtyState(state: DirtyState): boolean {
  return state.layoutDirty === false && state.bindingsDirty === false
}

export function useHostedRuntimeDirtyState(initialDirtyState: DirtyState = CLEAN_DIRTY_STATE) {
  const [dirtyState, setDirtyStateState] = useState<DirtyState>(initialDirtyState)
  const dirtyStateRef = useRef<DirtyState>(initialDirtyState)
  const runtimeSyncDirtyStateRef = useRef<DirtyState | null>(null)
  const bindingsBaselineSyncRef = useRef(false)

  const setDirtyState = useCallback((nextDirtyState: DirtyStateUpdater) => {
    const previousDirtyState = dirtyStateRef.current
    const resolvedDirtyState =
      typeof nextDirtyState === 'function'
        ? nextDirtyState(previousDirtyState)
        : nextDirtyState

    dirtyStateRef.current = resolvedDirtyState
    setDirtyStateState(resolvedDirtyState)
  }, [])

  const getDirtyState = useCallback(() => dirtyStateRef.current, [])

  const handleRuntimeDirtyStateChange = useCallback(
    (nextDirtyState: DirtyState) => {
      setDirtyState((previous) => {
        const runtimeSyncDirtyState = runtimeSyncDirtyStateRef.current
        if (runtimeSyncDirtyState && isCleanDirtyState(nextDirtyState)) {
          return runtimeSyncDirtyState
        }

        if (bindingsBaselineSyncRef.current && isCleanDirtyState(nextDirtyState)) {
          return {
            layoutDirty: previous.layoutDirty,
            bindingsDirty: false,
          }
        }

        return nextDirtyState
      })
    },
    [setDirtyState],
  )

  const runRuntimeSync = useCallback(
    async <Result,>(
      dirtyStateDuringSync: DirtyState,
      operation: () => Promise<Result>,
    ): Promise<Result> => {
      runtimeSyncDirtyStateRef.current = dirtyStateDuringSync

      try {
        return await operation()
      } finally {
        runtimeSyncDirtyStateRef.current = null
      }
    },
    [],
  )

  const runBindingsBaselineSync = useCallback(async <Result,>(operation: () => Promise<Result>): Promise<Result> => {
    bindingsBaselineSyncRef.current = true

    try {
      return await operation()
    } finally {
      bindingsBaselineSyncRef.current = false
    }
  }, [])

  return {
    dirtyState,
    getDirtyState,
    setDirtyState,
    handleRuntimeDirtyStateChange,
    runRuntimeSync,
    runBindingsBaselineSync,
  }
}
