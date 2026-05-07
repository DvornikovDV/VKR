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
})
