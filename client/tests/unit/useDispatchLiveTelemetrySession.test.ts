import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useDispatchLiveTelemetrySession } from '@/features/dispatch/hooks/useDispatchLiveTelemetrySession'
import { createCloudRuntimeClient } from '@/features/dashboard/services/cloudRuntimeClient'
import { useAuthStore, type Session } from '@/shared/store/useAuthStore'
import {
  createMockDashboardRuntimeClientHarness,
  createMockDashboardRuntimeSocketHarness,
} from '../integration/helpers/mockDashboardRuntimeSocket'
import {
  createDispatchLiveTelemetryBindingProfileFixture,
  createDispatchLiveTelemetryEventFixture,
  createDispatchLiveTelemetrySecondaryBindingProfileFixture,
} from '../integration/helpers/dispatchWorkspaceHarness'

const userSession: Session = {
  id: 'dispatch-live-user-1',
  email: 'dispatch.live@example.com',
  role: 'USER',
  tier: 'PRO',
  accessToken: 'dispatch-live-token',
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

describe('dispatch live telemetry session', () => {
  it('starts a telemetry-only socket session with edge-only subscribe and active-edge telemetry parsing', async () => {
    const socketHarness = createMockDashboardRuntimeSocketHarness()
    const runtimeClient = createCloudRuntimeClient(socketHarness.socketFactory)
    const transportStatuses: string[] = []
    const receivedEvents: unknown[] = []

    const session = runtimeClient.startTelemetryOnlySession({
      edgeId: 'edge-visual-1',
      onTransportStatusChange: (status) => {
        transportStatuses.push(status)
      },
      onTelemetry: (event) => {
        receivedEvents.push(event)
      },
    })

    await waitFor(() => {
      expect(transportStatuses).toEqual(['connecting', 'connected'])
    })

    expect(socketHarness.getEmittedEvents()).toEqual([
      {
        event: 'subscribe',
        payload: { edgeId: 'edge-visual-1' },
      },
    ])
    expect(socketHarness.getLastSubscribePayload()).toEqual({ edgeId: 'edge-visual-1' })

    const activeEvent = createDispatchLiveTelemetryEventFixture({
      edgeId: 'edge-visual-1',
      readings: [{ deviceId: 'boiler-1', metric: 'temperature', last: 44.1, ts: 1779000000000 }],
    })

    act(() => {
      socketHarness.emitTelemetry(activeEvent)
      socketHarness.emitTelemetry(
        createDispatchLiveTelemetryEventFixture({
          edgeId: 'edge-visual-2',
          readings: [{ deviceId: 'pump-2', metric: 'pressure', last: 12, ts: 1779000000100 }],
        }),
      )
      socketHarness.emitDisconnect()
    })

    await waitFor(() => {
      expect(transportStatuses).toEqual(['connecting', 'connected', 'reconnecting'])
    })
    expect(receivedEvents).toEqual([activeEvent])

    session.dispose()

    act(() => {
      socketHarness.emitTelemetry(
        createDispatchLiveTelemetryEventFixture({
          edgeId: 'edge-visual-1',
          readings: [{ deviceId: 'boiler-1', metric: 'temperature', last: 45, ts: 1779000000200 }],
        }),
      )
    })

    expect(receivedEvents).toEqual([activeEvent])
  })

  it('uses telemetry-only client lifecycle, filters active binding rows, and disposes on edge changes and unmount', async () => {
    const clientHarness = createMockDashboardRuntimeClientHarness()
    const bindingProfile = createDispatchLiveTelemetryBindingProfileFixture()
    const secondBindingProfile = createDispatchLiveTelemetrySecondaryBindingProfileFixture()
    let now = 1779000001000

    const { result, rerender, unmount } = renderHook(
      ({
        edgeId,
        profile,
      }: {
        edgeId: string | null
        profile: typeof bindingProfile | null
      }) =>
        useDispatchLiveTelemetrySession({
          diagramId: 'diagram-visual-1',
          edgeId,
          bindingProfile: profile,
          client: clientHarness,
          now: () => now,
        }),
      {
        initialProps: { edgeId: 'edge-visual-1', profile: bindingProfile },
      },
    )

    await waitFor(() => {
      expect(result.current.transportStatus).toBe('connecting')
    })

    expect(clientHarness.startSession).not.toHaveBeenCalled()
    expect(clientHarness.startTelemetryOnlySession).toHaveBeenCalledTimes(1)
    expect(clientHarness.startTelemetryOnlySession).toHaveBeenCalledWith(
      expect.objectContaining({ edgeId: 'edge-visual-1' }),
    )

    act(() => {
      clientHarness.emitTelemetryOnlyTransportStatus('edge-visual-1', 'connected')
      clientHarness.emitTelemetryOnlyTelemetry(
        createDispatchLiveTelemetryEventFixture({
          edgeId: 'edge-visual-1',
          readings: [
            { deviceId: 'boiler-1', metric: 'temperature', last: 41.2, ts: 1779000000000 },
            { deviceId: 'pump-2', metric: 'pressure', last: 99, ts: 1779000000001 },
          ],
        }),
      )
      clientHarness.emitTelemetryOnlyTelemetry(
        createDispatchLiveTelemetryEventFixture({
          edgeId: 'edge-visual-2',
          readings: [{ deviceId: 'boiler-1', metric: 'temperature', last: 55, ts: 1779000000002 }],
        }),
      )
    })

    await waitFor(() => {
      expect(result.current.transportStatus).toBe('connected')
      expect(result.current.rows).toHaveLength(1)
    })
    expect(result.current.rows[0]).toEqual(
      expect.objectContaining({
        edgeId: 'edge-visual-1',
        deviceId: 'boiler-1',
        metric: 'temperature',
        value: 41.2,
      }),
    )

    rerender({ edgeId: 'edge-visual-2', profile: secondBindingProfile })

    await waitFor(() => {
      expect(result.current.activeEdgeId).toBe('edge-visual-2')
      expect(result.current.rows).toEqual([])
    })
    expect(clientHarness.getTelemetryOnlyDisposeCount('edge-visual-1')).toBe(1)

    now += 1000
    act(() => {
      clientHarness.emitTelemetryOnlyTelemetry(
        createDispatchLiveTelemetryEventFixture({
          edgeId: 'edge-visual-1',
          readings: [{ deviceId: 'boiler-1', metric: 'temperature', last: 42, ts: 1779000002000 }],
        }),
      )
      clientHarness.emitTelemetryOnlyTelemetry(
        createDispatchLiveTelemetryEventFixture({
          edgeId: 'edge-visual-2',
          readings: [{ deviceId: 'pump-2', metric: 'pressure', last: 12.3, ts: 1779000002001 }],
        }),
      )
    })

    await waitFor(() => {
      expect(result.current.rows).toHaveLength(1)
      expect(result.current.rows[0]).toEqual(
        expect.objectContaining({
          edgeId: 'edge-visual-2',
          deviceId: 'pump-2',
          metric: 'pressure',
          value: 12.3,
        }),
      )
    })

    unmount()
    expect(clientHarness.getTelemetryOnlyDisposeCount('edge-visual-2')).toBe(1)
  })
})
