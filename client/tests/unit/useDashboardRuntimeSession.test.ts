import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useDashboardRuntimeSession } from '@/features/dashboard/hooks/useDashboardRuntimeSession'
import { createDashboardBindingKey } from '@/features/dashboard/model/selectors'
import { createCloudRuntimeClient } from '@/features/dashboard/services/cloudRuntimeClient'
import { useAuthStore, type Session } from '@/shared/store/useAuthStore'
import { createMockDashboardRuntimeSocketHarness } from '../integration/helpers/mockDashboardRuntimeSocket'

const userSession: Session = {
  id: 'user-1',
  email: 'user@example.com',
  role: 'USER',
  tier: 'PRO',
  accessToken: 'test-token',
}

beforeEach(() => {
  act(() => {
    useAuthStore.setState({ session: null, isAuthenticated: false })
    useAuthStore.getState().setSession(userSession)
  })
})

afterEach(() => {
  act(() => {
    useAuthStore.setState({ session: null, isAuthenticated: false })
  })
})

describe('useDashboardRuntimeSession (T015)', () => {
  it('connects and subscribes to the selected edge session', async () => {
    const socketHarness = createMockDashboardRuntimeSocketHarness()
    const runtimeClient = createCloudRuntimeClient(socketHarness.socketFactory)

    const { result } = renderHook(() =>
      useDashboardRuntimeSession({
        edgeId: 'edge-1',
        enabled: true,
        client: runtimeClient,
      }),
    )

    await waitFor(() => {
      expect(result.current.transportStatus).toBe('connected')
    })

    expect(result.current.activeEdgeId).toBe('edge-1')
    expect(socketHarness.getLastSubscribePayload()).toEqual({ edgeId: 'edge-1' })
  })

  it('applies telemetry for active edge and tracks edge availability', async () => {
    const socketHarness = createMockDashboardRuntimeSocketHarness()
    const runtimeClient = createCloudRuntimeClient(socketHarness.socketFactory)

    const { result } = renderHook(() =>
      useDashboardRuntimeSession({
        edgeId: 'edge-1',
        enabled: true,
        client: runtimeClient,
      }),
    )

    await waitFor(() => {
      expect(result.current.transportStatus).toBe('connected')
    })

    act(() => {
      socketHarness.emitTelemetry({
        edgeId: 'edge-1',
        readings: [
          {
            sourceId: 'source-1',
            deviceId: 'pump-1',
            metric: 'temperature',
            last: 41.2,
            ts: 1763895000000,
          },
        ],
        serverTs: 1763895001000,
      })
      socketHarness.emitTelemetry({
        edgeId: 'edge-2',
        readings: [
          {
            sourceId: 'source-2',
            deviceId: 'pump-2',
            metric: 'pressure',
            last: 12,
            ts: 1763895000001,
          },
        ],
        serverTs: 1763895001001,
      })
      socketHarness.emitEdgeStatus({ edgeId: 'edge-1', online: false })
    })

    await waitFor(() => {
      expect(
        result.current.latestMetricValueByBindingKey[
          createDashboardBindingKey('pump-1', 'temperature')
        ],
      ).toBe(41.2)
    })

    expect(result.current.latestMetricValueByBindingKey).not.toHaveProperty(
      createDashboardBindingKey('pump-2', 'pressure'),
    )
    expect(result.current.edgeAvailability).toBe('offline')
    expect(result.current.lastServerTimestamp).toBe(1763895001000)
  })

  it('keeps last values while reconnecting', async () => {
    const socketHarness = createMockDashboardRuntimeSocketHarness()
    const runtimeClient = createCloudRuntimeClient(socketHarness.socketFactory)

    const { result } = renderHook(() =>
      useDashboardRuntimeSession({
        edgeId: 'edge-1',
        enabled: true,
        client: runtimeClient,
      }),
    )

    await waitFor(() => {
      expect(result.current.transportStatus).toBe('connected')
    })

    act(() => {
      socketHarness.emitTelemetry({
        edgeId: 'edge-1',
        readings: [
          {
            sourceId: 'source-1',
            deviceId: 'pump-1',
            metric: 'temperature',
            last: 55,
            ts: 1763895002000,
          },
        ],
        serverTs: 1763895003000,
      })
    })

    await waitFor(() => {
      expect(
        result.current.latestMetricValueByBindingKey[
          createDashboardBindingKey('pump-1', 'temperature')
        ],
      ).toBe(55)
    })

    act(() => {
      socketHarness.emitDisconnect()
    })

    await waitFor(() => {
      expect(result.current.transportStatus).toBe('reconnecting')
    })

    expect(
      result.current.latestMetricValueByBindingKey[createDashboardBindingKey('pump-1', 'temperature')],
    ).toBe(55)
  })

  it('disposes active session on edge switch and unmount cleanup', async () => {
    const socketHarness = createMockDashboardRuntimeSocketHarness()
    const runtimeClient = createCloudRuntimeClient(socketHarness.socketFactory)

    const { result, rerender, unmount } = renderHook(
      ({ edgeId }: { edgeId: string | null }) =>
        useDashboardRuntimeSession({
          edgeId,
          enabled: true,
          client: runtimeClient,
        }),
      {
        initialProps: { edgeId: 'edge-1' },
      },
    )

    await waitFor(() => {
      expect(result.current.transportStatus).toBe('connected')
    })

    rerender({ edgeId: 'edge-2' })

    await waitFor(() => {
      expect(result.current.activeEdgeId).toBe('edge-2')
      expect(result.current.transportStatus).toBe('connected')
    })

    expect(socketHarness.spies.disconnect).toHaveBeenCalledTimes(1)

    unmount()
    expect(socketHarness.spies.disconnect).toHaveBeenCalledTimes(2)
  })
})
