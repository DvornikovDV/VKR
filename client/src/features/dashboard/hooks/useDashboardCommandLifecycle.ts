import { useCallback, useState } from 'react'
import type {
  DashboardCommandFailureKind,
  DashboardCommandLifecycleByWidgetId,
  DashboardCommandLifecycleState,
  DashboardCommandLifecycleStatus,
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

function selectFailureStatus(failureKind: DashboardCommandFailureKind): DashboardCommandLifecycleStatus {
  switch (failureKind) {
    case 'cloud_rpc_timeout':
    case 'edge_command_timeout':
      return 'timeout'
    case 'edge_unavailable':
      return 'unavailable'
    case 'edge_command_failed':
    case 'network_error':
    case 'unknown_error':
    default:
      return 'error'
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

  const markFailure = useCallback((
    widgetId: string,
    failureKind: DashboardCommandFailureKind,
    error: string,
  ) => {
    setLifecycleByWidgetId((previous) =>
      setLifecycleState(previous, widgetId, {
        status: selectFailureStatus(failureKind),
        error,
        failureKind,
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

  const clearAll = useCallback(() => {
    setLifecycleByWidgetId((previous) =>
      Object.keys(previous).length === 0 ? previous : {},
    )
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
    markFailure,
    clearLifecycle,
    clearAll,
    clearConfirmedWaitingTelemetryForUpdatedBindings,
  }
}
