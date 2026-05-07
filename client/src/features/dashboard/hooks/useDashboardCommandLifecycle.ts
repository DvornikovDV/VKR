import { useCallback, useState } from 'react'
import type {
  DashboardCommandLifecycleByWidgetId,
  DashboardCommandLifecycleState,
} from '@/features/dashboard/model/types'

function normalizeWidgetId(widgetId: string): string | null {
  const trimmed = widgetId.trim()
  return trimmed.length > 0 ? trimmed : null
}

function setLifecycleState(
  previous: DashboardCommandLifecycleByWidgetId,
  widgetId: string,
  state: DashboardCommandLifecycleState,
): DashboardCommandLifecycleByWidgetId {
  const normalizedWidgetId = normalizeWidgetId(widgetId)
  if (!normalizedWidgetId) {
    return previous
  }

  return {
    ...previous,
    [normalizedWidgetId]: state,
  }
}

export function useDashboardCommandLifecycle() {
  const [lifecycleByWidgetId, setLifecycleByWidgetId] =
    useState<DashboardCommandLifecycleByWidgetId>({})

  const markPending = useCallback((widgetId: string) => {
    setLifecycleByWidgetId((previous) =>
      setLifecycleState(previous, widgetId, {
        status: 'pending',
        error: null,
      }),
    )
  }, [])

  const markConfirmedWaitingTelemetry = useCallback((widgetId: string) => {
    setLifecycleByWidgetId((previous) =>
      setLifecycleState(previous, widgetId, {
        status: 'confirmed-waiting-telemetry',
        error: null,
      }),
    )
  }, [])

  const markError = useCallback((widgetId: string, error: string) => {
    setLifecycleByWidgetId((previous) =>
      setLifecycleState(previous, widgetId, {
        status: 'error',
        error,
      }),
    )
  }, [])

  const clearLifecycle = useCallback((widgetId: string) => {
    const normalizedWidgetId = normalizeWidgetId(widgetId)
    if (!normalizedWidgetId) {
      return
    }

    setLifecycleByWidgetId((previous) => {
      if (!Object.prototype.hasOwnProperty.call(previous, normalizedWidgetId)) {
        return previous
      }

      const next = { ...previous }
      delete next[normalizedWidgetId]
      return next
    })
  }, [])

  return {
    lifecycleByWidgetId,
    markPending,
    markConfirmedWaitingTelemetry,
    markError,
    clearLifecycle,
  }
}
