import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useDashboardCommandLifecycle } from '@/features/dashboard/hooks/useDashboardCommandLifecycle'

describe('useDashboardCommandLifecycle (T011)', () => {
  it('stores command lifecycle per widget without storing physical widget values', () => {
    const { result } = renderHook(() => useDashboardCommandLifecycle())

    act(() => {
      result.current.markPending('toggle-running')
    })

    expect(result.current.lifecycleByWidgetId['toggle-running']).toEqual({
      status: 'pending',
      error: null,
    })

    act(() => {
      result.current.markConfirmedWaitingTelemetry('toggle-running')
      result.current.markError('slider-flow', 'edge_unavailable')
    })

    expect(result.current.lifecycleByWidgetId).toEqual({
      'toggle-running': {
        status: 'confirmed-waiting-telemetry',
        error: null,
      },
      'slider-flow': {
        status: 'error',
        error: 'edge_unavailable',
      },
    })
    expect(result.current.lifecycleByWidgetId['toggle-running']).not.toHaveProperty('value')

    act(() => {
      result.current.clearLifecycle('toggle-running')
    })

    expect(result.current.lifecycleByWidgetId['toggle-running']).toBeUndefined()
  })

  it('clears confirmed-waiting-telemetry only after the exact reported binding receives a newer telemetry revision', () => {
    const { result } = renderHook(() => useDashboardCommandLifecycle())

    act(() => {
      result.current.markPending('toggle-running')
      result.current.markConfirmedWaitingTelemetry('toggle-running', 'pump-1::running', 3)
    })

    expect(result.current.lifecycleByWidgetId['toggle-running']).toEqual({
      status: 'confirmed-waiting-telemetry',
      error: null,
      reportedBindingKey: 'pump-1::running',
      confirmedMetricRevision: 3,
    })

    act(() => {
      result.current.clearConfirmedWaitingTelemetryForUpdatedBindings({
        'boiler-1::status': 4,
        'pump-1::running': 3,
      })
    })

    expect(result.current.lifecycleByWidgetId['toggle-running']?.status).toBe(
      'confirmed-waiting-telemetry',
    )

    act(() => {
      result.current.clearConfirmedWaitingTelemetryForUpdatedBindings({
        'pump-1::running': 4,
      })
    })

    expect(result.current.lifecycleByWidgetId['toggle-running']).toBeUndefined()
  })

  it('maps command failures into stable local lifecycle states without physical values', () => {
    const { result } = renderHook(() => useDashboardCommandLifecycle())

    act(() => {
      result.current.markFailure('toggle-running', 'cloud_rpc_timeout', 'Cloud RPC timeout')
      result.current.markFailure('slider-flow', 'edge_unavailable', 'Edge unavailable')
      result.current.markFailure('toggle-failed', 'edge_command_failed', 'Edge command failed')
    })

    expect(result.current.lifecycleByWidgetId).toEqual({
      'toggle-running': {
        status: 'timeout',
        error: 'Cloud RPC timeout',
        failureKind: 'cloud_rpc_timeout',
      },
      'slider-flow': {
        status: 'unavailable',
        error: 'Edge unavailable',
        failureKind: 'edge_unavailable',
      },
      'toggle-failed': {
        status: 'error',
        error: 'Edge command failed',
        failureKind: 'edge_command_failed',
      },
    })
    expect(result.current.lifecycleByWidgetId['toggle-running']).not.toHaveProperty('value')
  })

  it('clears all command lifecycle state for runtime context changes', () => {
    const { result } = renderHook(() => useDashboardCommandLifecycle())

    act(() => {
      result.current.markPending('toggle-running')
      result.current.markFailure('slider-flow', 'edge_unavailable', 'Edge unavailable')
    })

    expect(Object.keys(result.current.lifecycleByWidgetId)).toHaveLength(2)

    act(() => {
      result.current.clearAll()
    })

    expect(result.current.lifecycleByWidgetId).toEqual({})
  })
})
