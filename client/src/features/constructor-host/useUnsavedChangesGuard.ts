import { useBeforeUnload, useBlocker } from 'react-router-dom'
import { useCallback, useEffect, useRef } from 'react'

export const DEFAULT_UNSAVED_CHANGES_MESSAGE = 'You have unsaved changes. Leave this page?'

export type ConfirmNavigationHandler = (message: string) => boolean

export interface UseUnsavedChangesGuardOptions {
  hasUnsavedChanges: boolean
  enabled?: boolean
  message?: string
  confirmNavigation?: ConfirmNavigationHandler
}

function defaultConfirmNavigation(message: string): boolean {
  if (typeof window === 'undefined') {
    return true
  }

  return window.confirm(message)
}

export function useUnsavedChangesGuard({
  hasUnsavedChanges,
  enabled = true,
  message = DEFAULT_UNSAVED_CHANGES_MESSAGE,
  confirmNavigation = defaultConfirmNavigation,
}: UseUnsavedChangesGuardOptions) {
  const shouldBlock = enabled && hasUnsavedChanges
  const handledLocationKeyRef = useRef<string | null>(null)

  useBeforeUnload(
    useCallback(
      (event) => {
        if (!shouldBlock) {
          return
        }

        event.preventDefault()
        event.returnValue = message
      },
      [message, shouldBlock],
    ),
  )

  const blocker = useBlocker(shouldBlock)

  useEffect(() => {
    if (blocker.state !== 'blocked') {
      handledLocationKeyRef.current = null
      return
    }

    const nextLocationKey =
      blocker.location.key ??
      `${blocker.location.pathname}${blocker.location.search}${blocker.location.hash}`

    if (handledLocationKeyRef.current === nextLocationKey) {
      return
    }
    handledLocationKeyRef.current = nextLocationKey

    if (confirmNavigation(message)) {
      blocker.proceed()
      return
    }

    blocker.reset()
  }, [blocker, confirmNavigation, message])

  return blocker
}
