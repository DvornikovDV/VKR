import { act, renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useDashboardRuntimeSession } from '@/features/dashboard/hooks/useDashboardRuntimeSession'
import { createDashboardBindingKey } from '@/features/dashboard/model/selectors'
import { createCloudRuntimeClient } from '@/features/dashboard/services/cloudRuntimeClient'
import { useAuthStore, type Session } from '@/shared/store/useAuthStore'
import { server } from '../mocks/server'
import {
  createDashboardAlarmIncidentChangedEventFixture,
  createDashboardActiveUnacknowledgedAlarmIncidentProjectionFixture,
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

  server.use(
    http.get('/api/edge-servers/:edgeId/alarm-incidents', () =>
      HttpResponse.json({
        status: 'success',
        data: {
          incidents: [],
          page: 1,
          limit: 50,
          total: 0,
          hasNextPage: false,
        },
      }),
    ),
  )
})

afterEach(() => {
  act(() => {
    useAuthStore.setState({ session: null, isAuthenticated: false })
  })
})

describe('useDashboardRuntimeSession (T015)', () => {
  it('loads unclosed alarm incidents for the selected edge and reports success state', async () => {
    const socketHarness = createMockDashboardRuntimeSocketHarness()
    const runtimeClient = createCloudRuntimeClient(socketHarness.socketFactory)
    const loadedIncident = createDashboardActiveUnacknowledgedAlarmIncidentProjectionFixture({
      incidentId: 'incident-list-loaded',
      edgeId: 'edge-1',
      updatedAt: '2026-05-09T10:30:00.000Z',
    })
    const requestedUrls: URL[] = []
    let releaseListResponse: () => void = () => {}

    server.use(
      http.get('/api/edge-servers/:edgeId/alarm-incidents', ({ params, request }) => {
        requestedUrls.push(new URL(request.url))
        expect(params.edgeId).toBe('edge-1')

        return new Promise((resolve) => {
          releaseListResponse = () =>
            resolve(
              HttpResponse.json({
                status: 'success',
                data: {
                  incidents: [loadedIncident],
                  page: 1,
                  limit: 50,
                  total: 1,
                  hasNextPage: false,
                },
              }),
            )
        })
      }),
    )

    const { result } = renderHook(() =>
      useDashboardRuntimeSession({
        edgeId: 'edge-1',
        enabled: true,
        client: runtimeClient,
      }),
    )

    await waitFor(() => {
      expect(result.current.alarmJournalLoadState).toEqual({
        status: 'loading',
        error: null,
      })
    })

    const requestedUrl = requestedUrls[0]
    expect(requestedUrl?.searchParams.get('state')).toBe('unclosed')
    expect(requestedUrl?.searchParams.get('page')).toBe('1')
    expect(requestedUrl?.searchParams.get('limit')).toBe('50')
    expect(requestedUrl?.searchParams.get('sort')).toBe('latest')
    expect(requestedUrl?.searchParams.get('order')).toBe('desc')

    await act(async () => {
      releaseListResponse()
    })

    await waitFor(() => {
      expect(result.current.alarmJournalLoadState).toEqual({
        status: 'loaded',
        error: null,
      })
      expect(result.current.alarmIncidents.map((incident) => incident.incidentId)).toEqual([
        'incident-list-loaded',
      ])
    })
  })

  it('reports bounded alarm incident list load errors without claiming loaded-empty success', async () => {
    const socketHarness = createMockDashboardRuntimeSocketHarness()
    const runtimeClient = createCloudRuntimeClient(socketHarness.socketFactory)

    server.use(
      http.get('/api/edge-servers/:edgeId/alarm-incidents', () =>
        HttpResponse.json(
          { status: 'error', message: 'Alarm incident list unavailable' },
          { status: 503 },
        ),
      ),
    )

    const { result } = renderHook(() =>
      useDashboardRuntimeSession({
        edgeId: 'edge-1',
        enabled: true,
        client: runtimeClient,
      }),
    )

    await waitFor(() => {
      expect(result.current.alarmJournalLoadState.status).toBe('error')
    })

    expect(result.current.alarmJournalLoadState.error).toBe('Alarm incident list unavailable')
    expect(result.current.alarmIncidents).toEqual([])
  })

  it('merges REST list projections without replacing newer realtime rows or stale edge state', async () => {
    const socketHarness = createMockDashboardRuntimeSocketHarness()
    const runtimeClient = createCloudRuntimeClient(socketHarness.socketFactory)
    const staleListIncident = createDashboardActiveUnacknowledgedAlarmIncidentProjectionFixture({
      incidentId: 'incident-race',
      edgeId: 'edge-1',
      isAcknowledged: false,
      acknowledgedAt: null,
      updatedAt: '2026-05-09T10:00:00.000Z',
    })
    const edgeTwoIncident = createDashboardActiveUnacknowledgedAlarmIncidentProjectionFixture({
      incidentId: 'incident-edge-2',
      edgeId: 'edge-2',
      updatedAt: '2026-05-09T10:40:00.000Z',
    })
    let releaseEdgeOneList: () => void = () => {}
    let edgeOneListRequested = false

    server.use(
      http.get('/api/edge-servers/:edgeId/alarm-incidents', ({ params }) => {
        if (params.edgeId === 'edge-1') {
          edgeOneListRequested = true

          return new Promise((resolve) => {
            releaseEdgeOneList = () =>
              resolve(
                HttpResponse.json({
                  status: 'success',
                  data: {
                    incidents: [staleListIncident],
                    page: 1,
                    limit: 50,
                    total: 1,
                    hasNextPage: false,
                  },
                }),
              )
          })
        }

        return HttpResponse.json({
          status: 'success',
          data: {
            incidents: [edgeTwoIncident],
            page: 1,
            limit: 50,
            total: 1,
            hasNextPage: false,
          },
        })
      }),
    )

    const { result, rerender } = renderHook(
      ({ edgeId }: { edgeId: string }) =>
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
      expect(edgeOneListRequested).toBe(true)
      expect(result.current.alarmJournalLoadState.status).toBe('loading')
    })

    act(() => {
      socketHarness.emitAlarmIncidentChanged(
        createDashboardAlarmIncidentChangedEventFixture({
          edgeId: 'edge-1',
          incident: {
            incidentId: 'incident-race',
            edgeId: 'edge-1',
            isAcknowledged: true,
            acknowledgedAt: '2026-05-09T10:05:00.000Z',
            acknowledgedBy: 'user-1',
            updatedAt: '2026-05-09T10:05:00.000Z',
          },
        }),
      )
      socketHarness.emitAlarmIncidentChanged(
        createDashboardAlarmIncidentChangedEventFixture({
          edgeId: 'edge-1',
          incident: {
            incidentId: 'incident-realtime-extra',
            edgeId: 'edge-1',
            updatedAt: '2026-05-09T10:06:00.000Z',
          },
        }),
      )
    })

    await waitFor(() => {
      expect(result.current.alarmIncidents.map((incident) => incident.incidentId)).toEqual([
        'incident-realtime-extra',
        'incident-race',
      ])
    })

    await act(async () => {
      releaseEdgeOneList()
    })

    await waitFor(() => {
      expect(result.current.alarmJournalLoadState.status).toBe('loaded')
      expect(result.current.alarmIncidents.map((incident) => incident.incidentId)).toEqual([
        'incident-realtime-extra',
        'incident-race',
      ])
      expect(result.current.alarmIncidents.find((incident) => incident.incidentId === 'incident-race')).toEqual(
        expect.objectContaining({
          isAcknowledged: true,
          acknowledgedAt: '2026-05-09T10:05:00.000Z',
        }),
      )
    })

    server.use(
      http.get('/api/edge-servers/edge-1/alarm-incidents', () =>
        new Promise((resolve) => {
          releaseEdgeOneList = () =>
            resolve(
              HttpResponse.json({
                status: 'success',
                data: {
                  incidents: [staleListIncident],
                  page: 1,
                  limit: 50,
                  total: 1,
                  hasNextPage: false,
                },
              }),
            )
        }),
      ),
    )

    rerender({ edgeId: 'edge-2' })

    await waitFor(() => {
      expect(result.current.activeEdgeId).toBe('edge-2')
      expect(result.current.alarmJournalLoadState.status).toBe('loaded')
    })

    rerender({ edgeId: 'edge-1' })

    await waitFor(() => {
      expect(result.current.activeEdgeId).toBe('edge-1')
      expect(result.current.alarmJournalLoadState.status).toBe('loading')
    })

    rerender({ edgeId: 'edge-2' })

    await waitFor(() => {
      expect(result.current.activeEdgeId).toBe('edge-2')
      expect(result.current.alarmIncidents.map((incident) => incident.incidentId)).toEqual([
        'incident-edge-2',
      ])
      expect(result.current.alarmJournalLoadState).toEqual({
        status: 'loaded',
        error: null,
      })
    })

    await act(async () => {
      releaseEdgeOneList()
    })

    expect(result.current.activeEdgeId).toBe('edge-2')
    expect(result.current.alarmIncidents.map((incident) => incident.incidentId)).toEqual([
      'incident-edge-2',
    ])
  })

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
    expect(result.current.alarmJournalInitialLoadBlocked).toBeNull()
    expect(['loading', 'loaded']).toContain(result.current.alarmJournalLoadState.status)
    expect(result.current.alarmJournalLoadState.error).toBeNull()
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

  it('keeps realtime ACK confirmation when a later REST ACK response is stale', async () => {
    const socketHarness = createMockDashboardRuntimeSocketHarness()
    const runtimeClient = createCloudRuntimeClient(socketHarness.socketFactory)
    const staleAckIncident = createDashboardAlarmIncidentChangedEventFixture({
      edgeId: 'edge-1',
      incident: {
        incidentId: 'incident-ack-race',
        isActive: true,
        isAcknowledged: false,
        acknowledgedAt: null,
        acknowledgedBy: null,
        updatedAt: '2026-05-09T10:00:00.000Z',
      },
    }).incident
    let releaseAckResponse: () => void = () => {}

    server.use(
      http.post('/api/edge-servers/:edgeId/alarm-incidents/:incidentId/ack', () =>
        new Promise((resolve) => {
          releaseAckResponse = () =>
            resolve(
              HttpResponse.json({
                status: 'success',
                data: { incident: staleAckIncident },
              }),
            )
        }),
      ),
    )

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
      socketHarness.emitAlarmIncidentChanged(
        createDashboardAlarmIncidentChangedEventFixture({
          edgeId: 'edge-1',
          incident: {
            incidentId: 'incident-ack-race',
            isActive: true,
            isAcknowledged: false,
            acknowledgedAt: null,
            acknowledgedBy: null,
            updatedAt: '2026-05-09T10:00:00.000Z',
          },
        }),
      )
    })

    await waitFor(() => {
      expect(result.current.alarmIncidents[0]?.incidentId).toBe('incident-ack-race')
    })

    let acknowledgePromise: Promise<void> = Promise.resolve()
    act(() => {
      acknowledgePromise = result.current.acknowledgeAlarmIncident('incident-ack-race')
    })

    await waitFor(() => {
      expect(result.current.alarmAckPendingByIncidentId).toEqual({
        'incident-ack-race': true,
      })
      expect(result.current.alarmIncidents[0]?.isAcknowledged).toBe(false)
    })

    act(() => {
      socketHarness.emitAlarmIncidentChanged(
        createDashboardAlarmIncidentChangedEventFixture({
          edgeId: 'edge-1',
          incident: {
            incidentId: 'incident-ack-race',
            isActive: true,
            isAcknowledged: true,
            acknowledgedAt: '2026-05-09T10:05:00.000Z',
            acknowledgedBy: 'user-1',
            updatedAt: '2026-05-09T10:05:00.000Z',
          },
        }),
      )
    })

    await waitFor(() => {
      expect(result.current.alarmIncidents[0]?.isAcknowledged).toBe(true)
      expect(result.current.alarmAckPendingByIncidentId).toEqual({})
    })

    await act(async () => {
      releaseAckResponse()
      await acknowledgePromise
    })

    expect(result.current.alarmIncidents[0]).toEqual(
      expect.objectContaining({
        incidentId: 'incident-ack-race',
        isAcknowledged: true,
        acknowledgedAt: '2026-05-09T10:05:00.000Z',
      }),
    )
    expect(result.current.alarmAckPendingByIncidentId).toEqual({})
    expect(result.current.alarmAckErrorByIncidentId).toEqual({})
  })

  it('does not let stale ACK in-flight guards block a new edge generation', async () => {
    const socketHarness = createMockDashboardRuntimeSocketHarness()
    const runtimeClient = createCloudRuntimeClient(socketHarness.socketFactory)
    const ackResponseIncident = createDashboardAlarmIncidentChangedEventFixture({
      edgeId: 'edge-1',
      incident: {
        incidentId: 'incident-ack-reset',
        isActive: true,
        isAcknowledged: true,
        acknowledgedAt: '2026-05-09T10:15:00.000Z',
        acknowledgedBy: 'user-1',
        updatedAt: '2026-05-09T10:15:00.000Z',
      },
    }).incident
    const releaseAckResponses: Array<() => void> = []
    const acknowledgePromises: Array<Promise<void>> = []
    let ackRequestCount = 0

    server.use(
      http.post('/api/edge-servers/:edgeId/alarm-incidents/:incidentId/ack', () => {
        ackRequestCount += 1

        return new Promise((resolve) => {
          releaseAckResponses.push(() =>
            resolve(
              HttpResponse.json({
                status: 'success',
                data: { incident: ackResponseIncident },
              }),
            ),
          )
        })
      }),
    )

    const { result, rerender } = renderHook(
      ({ edgeId }: { edgeId: string }) =>
        useDashboardRuntimeSession({
          edgeId,
          enabled: true,
          client: runtimeClient,
        }),
      {
        initialProps: { edgeId: 'edge-1' },
      },
    )

    try {
      await waitFor(() => {
        expect(result.current.transportStatus).toBe('connected')
      })

      act(() => {
        socketHarness.emitAlarmIncidentChanged(
          createDashboardAlarmIncidentChangedEventFixture({
            edgeId: 'edge-1',
            incident: {
              incidentId: 'incident-ack-reset',
              isActive: true,
              isAcknowledged: false,
              updatedAt: '2026-05-09T10:10:00.000Z',
            },
          }),
        )
      })

      await waitFor(() => {
        expect(result.current.alarmIncidents[0]?.incidentId).toBe('incident-ack-reset')
      })

      act(() => {
        acknowledgePromises.push(result.current.acknowledgeAlarmIncident('incident-ack-reset'))
      })

      await waitFor(() => {
        expect(ackRequestCount).toBe(1)
        expect(result.current.alarmAckPendingByIncidentId).toEqual({
          'incident-ack-reset': true,
        })
      })

      rerender({ edgeId: 'edge-2' })

      await waitFor(() => {
        expect(result.current.activeEdgeId).toBe('edge-2')
        expect(result.current.alarmAckPendingByIncidentId).toEqual({})
      })

      rerender({ edgeId: 'edge-1' })

      await waitFor(() => {
        expect(result.current.activeEdgeId).toBe('edge-1')
        expect(result.current.alarmIncidents).toEqual([])
      })

      act(() => {
        socketHarness.emitAlarmIncidentChanged(
          createDashboardAlarmIncidentChangedEventFixture({
            edgeId: 'edge-1',
            incident: {
              incidentId: 'incident-ack-reset',
              isActive: true,
              isAcknowledged: false,
              updatedAt: '2026-05-09T10:12:00.000Z',
            },
          }),
        )
      })

      await waitFor(() => {
        expect(result.current.alarmIncidents[0]?.incidentId).toBe('incident-ack-reset')
      })

      act(() => {
        acknowledgePromises.push(result.current.acknowledgeAlarmIncident('incident-ack-reset'))
      })

      await waitFor(() => {
        expect(ackRequestCount).toBe(2)
        expect(result.current.alarmAckPendingByIncidentId).toEqual({
          'incident-ack-reset': true,
        })
      })
    } finally {
      await act(async () => {
        for (const releaseAckResponse of releaseAckResponses) {
          releaseAckResponse()
        }

        await Promise.allSettled(acknowledgePromises)
      })
    }
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
