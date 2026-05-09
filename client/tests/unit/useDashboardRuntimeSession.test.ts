import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useDashboardRuntimeSession } from '@/features/dashboard/hooks/useDashboardRuntimeSession'
import { createDashboardBindingKey } from '@/features/dashboard/model/selectors'
import { createCloudRuntimeClient } from '@/features/dashboard/services/cloudRuntimeClient'
import { useAuthStore, type Session } from '@/shared/store/useAuthStore'
import {
  createDashboardAlarmIncidentChangedEventFixture,
  createDashboardEdgeStatusEventFixture,
  createDashboardTelemetryEventFixture,
  createMockDashboardRuntimeSocketHarness,
} from '../integration/helpers/mockDashboardRuntimeSocket'

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
    expect(socketHarness.getEmittedEvents()).toEqual([
      {
        event: 'subscribe',
        payload: { edgeId: 'edge-1' },
      },
    ])
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
      socketHarness.emitTelemetry(
        createDashboardTelemetryEventFixture({
          edgeId: 'edge-1',
          readings: [
            {
              deviceId: 'pump-1',
              metric: 'temperature',
              last: 41.2,
              ts: 1763895000000,
            },
          ],
          serverTs: 1763895001000,
        }),
      )
      socketHarness.emitTelemetry(
        createDashboardTelemetryEventFixture({
          edgeId: 'edge-2',
          readings: [
            {
              deviceId: 'pump-2',
              metric: 'pressure',
              last: 12,
              ts: 1763895000001,
            },
          ],
          serverTs: 1763895001001,
        }),
      )
      socketHarness.emitEdgeStatus(createDashboardEdgeStatusEventFixture({ edgeId: 'edge-1', online: false }))
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
    expect(
      result.current.metricRevisionByBindingKey[createDashboardBindingKey('pump-1', 'temperature')],
    ).toBe(1)
    expect(result.current.metricRevisionByBindingKey).not.toHaveProperty(
      createDashboardBindingKey('pump-2', 'pressure'),
    )
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
      socketHarness.emitTelemetry(
        createDashboardTelemetryEventFixture({
          readings: [
            {
              deviceId: 'pump-1',
              metric: 'temperature',
              last: 55,
              ts: 1763895002000,
            },
          ],
          serverTs: 1763895003000,
        }),
      )
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

  it('scopes realtime alarm incidents to the active edge and preserves them across reconnect', async () => {
    const socketHarness = createMockDashboardRuntimeSocketHarness()
    const runtimeClient = createCloudRuntimeClient(socketHarness.socketFactory)

    const { result, rerender } = renderHook(
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

    expect(result.current.alarmIncidents).toEqual([])
    expect(result.current.alarmJournalInitialLoadBlocked).toEqual({
      blocked: true,
      reason: 'missing-cloud-incident-list-endpoint',
    })
    expect(result.current.alarmAckPendingByIncidentId).toEqual({})
    expect(result.current.alarmAckErrorByIncidentId).toEqual({})
    expect(typeof result.current.acknowledgeAlarmIncident).toBe('function')

    act(() => {
      socketHarness.emitAlarmIncidentChanged(
        createDashboardAlarmIncidentChangedEventFixture({
          incident: {
            incidentId: 'incident-1',
            isAcknowledged: false,
            updatedAt: '2026-05-09T10:00:00.000Z',
          },
        }),
      )
    })

    await waitFor(() => {
      expect(result.current.alarmIncidents.map((incident) => incident.incidentId)).toEqual([
        'incident-1',
      ])
    })
    expect(result.current.alarmIncidents[0]?.isAcknowledged).toBe(false)

    act(() => {
      socketHarness.emitAlarmIncidentChanged(
        createDashboardAlarmIncidentChangedEventFixture({
          incident: {
            incidentId: 'incident-1',
            isAcknowledged: true,
            acknowledgedAt: '2026-05-09T10:05:00.000Z',
            updatedAt: '2026-05-09T10:05:00.000Z',
          },
        }),
      )
      socketHarness.emitAlarmIncidentChanged(
        createDashboardAlarmIncidentChangedEventFixture({
          edgeId: 'edge-2',
          incident: {
            incidentId: 'incident-other-edge',
            updatedAt: '2026-05-09T10:10:00.000Z',
          },
        }),
      )
    })

    await waitFor(() => {
      expect(result.current.alarmIncidents).toHaveLength(1)
      expect(result.current.alarmIncidents[0]?.isAcknowledged).toBe(true)
    })

    act(() => {
      socketHarness.emitDisconnect()
    })

    await waitFor(() => {
      expect(result.current.transportStatus).toBe('reconnecting')
    })
    expect(result.current.alarmIncidents.map((incident) => incident.incidentId)).toEqual([
      'incident-1',
    ])

    act(() => {
      socketHarness.emitConnect()
    })

    await waitFor(() => {
      expect(result.current.transportStatus).toBe('connected')
    })
    expect(result.current.alarmIncidents.map((incident) => incident.incidentId)).toEqual([
      'incident-1',
    ])

    rerender({ edgeId: 'edge-2' })

    await waitFor(() => {
      expect(result.current.activeEdgeId).toBe('edge-2')
      expect(result.current.transportStatus).toBe('connected')
    })

    expect(result.current.alarmIncidents).toEqual([])
    expect(result.current.alarmAckPendingByIncidentId).toEqual({})
    expect(result.current.alarmAckErrorByIncidentId).toEqual({})

    act(() => {
      socketHarness.emitAlarmIncidentChanged(
        createDashboardAlarmIncidentChangedEventFixture({
          edgeId: 'edge-1',
          incident: {
            incidentId: 'incident-stale-edge',
            updatedAt: '2026-05-09T10:20:00.000Z',
          },
        }),
      )
    })

    expect(result.current.alarmIncidents).toEqual([])
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
