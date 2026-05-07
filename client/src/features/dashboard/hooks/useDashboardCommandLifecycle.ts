import { useCallback, useState } from 'react'
import type {
  DashboardCommandLifecycleByWidgetId,
  DashboardCommandLifecycleState,
  DashboardMetricRevisionByBindingKey,
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

  const markConfirmedWaitingTelemetry = useCallback((
    widgetId: string,
    reportedBindingKey?: string | null,
    confirmedMetricRevision?: number,
  ) => {
    const normalizedReportedBindingKey = reportedBindingKey?.trim()
    const revision =
      typeof confirmedMetricRevision === 'number' && Number.isFinite(confirmedMetricRevision)
        ? confirmedMetricRevision
        : undefined

    setLifecycleByWidgetId((previous) =>
      setLifecycleState(previous, widgetId, {
        status: 'confirmed-waiting-telemetry',
        error: null,
        ...(normalizedReportedBindingKey
          ? {
              reportedBindingKey: normalizedReportedBindingKey,
              confirmedMetricRevision: revision ?? 0,
            }
          : {}),
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

  const clearConfirmedWaitingTelemetryForUpdatedBindings = useCallback(
    (metricRevisionByBindingKey: DashboardMetricRevisionByBindingKey) => {
      setLifecycleByWidgetId((previous) => {
        let next: DashboardCommandLifecycleByWidgetId | null = null

        for (const [widgetId, lifecycle] of Object.entries(previous)) {
          if (
            lifecycle.status !== 'confirmed-waiting-telemetry' ||
            !lifecycle.reportedBindingKey
          ) {
            continue
          }

          const latestRevision = metricRevisionByBindingKey[lifecycle.reportedBindingKey]
          const confirmedRevision = lifecycle.confirmedMetricRevision ?? 0
          if (typeof latestRevision !== 'number' || latestRevision <= confirmedRevision) {
            continue
          }

          next ??= { ...previous }
          delete next[widgetId]
        }

        return next ?? previous
      })
    },
    [],
  )

  return {
    lifecycleByWidgetId,
    markPending,
    markConfirmedWaitingTelemetry,
    markError,
    clearLifecycle,
    clearConfirmedWaitingTelemetryForUpdatedBindings,
  }
}
