import { act, renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createDashboardSearchParams,
  isDashboardRouteStructurallyInvalid,
  parseDashboardRouteState,
  useDashboardRouteState,
} from '@/features/dashboard/hooks/useDashboardRouteState'
import { useDashboardRuntimeSession } from '@/features/dashboard/hooks/useDashboardRuntimeSession'
import { validateBindingProfileAgainstSavedWidgets } from '@/features/dashboard/model/bindingValidation'
import {
  createDashboardBindingKey,
  mergeTelemetryReadingsByBindingKey,
  selectWidgetValuesById,
} from '@/features/dashboard/model/selectors'
import { createCloudRuntimeClient } from '@/features/dashboard/services/cloudRuntimeClient'
import { useAuthStore, type Session } from '@/shared/store/useAuthStore'
import {
  createDashboardAlarmIncidentChangedEventFixture,
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

describe('Dashboard foundational helpers (T001-T009)', () => {
  it('tracks selectionSource for local route updates', async () => {
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(MemoryRouter, { initialEntries: ['/hub/dashboard'] }, children)

    const { result } = renderHook(() => useDashboardRouteState(), { wrapper })

    expect(result.current.routeState.selectionSource).toBe('route-prefill')

    act(() => {
      result.current.setRouteState(
        { diagramId: 'diagram-1' },
        { source: 'user-selection' },
      )
    })

    await waitFor(() => {
      expect(result.current.routeState.diagramId).toBe('diagram-1')
      expect(result.current.routeState.selectionSource).toBe('user-selection')
    })

    act(() => {
      result.current.clearRouteState({ source: 'recovery-reset' })
    })

    await waitFor(() => {
      expect(result.current.routeState.diagramId).toBeNull()
      expect(result.current.routeState.edgeId).toBeNull()
      expect(result.current.routeState.selectionSource).toBe('recovery-reset')
    })
  })

  it('parses and validates route state with edge-only query as invalid selection input', () => {
    const routeState = parseDashboardRouteState(new URLSearchParams('edgeId=edge-1'))

    expect(routeState.diagramId).toBeNull()
    expect(routeState.edgeId).toBe('edge-1')
    expect(isDashboardRouteStructurallyInvalid(routeState)).toBe(true)
  })

  it('normalizes dashboard query params by dropping edge when diagram is missing', () => {
    const params = createDashboardSearchParams({
      diagramId: null,
      edgeId: 'edge-1',
    })

    expect(params.toString()).toBe('')
  })

  it('detects stale binding profiles against saved widget ids', () => {
    const validation = validateBindingProfileAgainstSavedWidgets(
      {
        _id: 'profile-1',
        diagramId: 'diagram-1',
        edgeServerId: 'edge-1',
        widgetBindings: [
          { widgetId: 'widget-1', deviceId: 'pump-1', metric: 'temperature' },
          { widgetId: 'widget-missing', deviceId: 'pump-2', metric: 'pressure' },
        ],
        commandBindings: [],
      },
      {
        widgets: [{ id: 'widget-1', type: 'number-display' }],
      },
    )

    expect(validation.state).toBe('invalid-binding-profile')
    expect(validation.isValid).toBe(false)
    expect(validation.missingWidgetIds).toEqual(['widget-missing'])
  })

  it('maps telemetry to bound widget ids via binding keys', () => {
    const metricMap = mergeTelemetryReadingsByBindingKey(
      {},
      [
        {
          deviceId: 'pump-1',
          metric: 'temperature',
          last: 42.5,
          ts: 1763895000000,
        },
      ],
    )

    expect(metricMap[createDashboardBindingKey('pump-1', 'temperature')]).toBe(42.5)

    const widgetValues = selectWidgetValuesById(
      {
        _id: 'profile-1',
        diagramId: 'diagram-1',
        edgeServerId: 'edge-1',
        widgetBindings: [{ widgetId: 'widget-1', deviceId: 'pump-1', metric: 'temperature' }],
        commandBindings: [],
      },
      metricMap,
    )

    expect(widgetValues['widget-1']).toBe(42.5)
  })

  it('starts runtime session, subscribes by edge id, and keeps last values during reconnect', async () => {
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

    expect(socketHarness.getLastSubscribePayload()).toEqual({ edgeId: 'edge-1' })

    act(() => {
      socketHarness.emitTelemetry({
        edgeId: 'edge-1',
        readings: [
          {
            deviceId: 'pump-1',
            metric: 'temperature',
            last: 41,
            ts: 1763895000000,
          },
        ],
        serverTs: 1763895001000,
      })
    })

    await waitFor(() => {
      expect(
        result.current.latestMetricValueByBindingKey[
          createDashboardBindingKey('pump-1', 'temperature')
        ],
      ).toBe(41)
    })

    act(() => {
      socketHarness.emitDisconnect('transport close')
    })

    await waitFor(() => {
      expect(result.current.transportStatus).toBe('reconnecting')
    })

    expect(
      result.current.latestMetricValueByBindingKey[createDashboardBindingKey('pump-1', 'temperature')],
    ).toBe(41)

    rerender({ edgeId: 'edge-2' })

    await waitFor(() => {
      expect(result.current.activeEdgeId).toBe('edge-2')
      expect(result.current.transportStatus).toBe('connected')
    })

    expect(result.current.latestMetricValueByBindingKey).toEqual({})
  })

  it('parses alarm incident realtime events through an optional runtime callback', async () => {
    const socketHarness = createMockDashboardRuntimeSocketHarness()
    const runtimeClient = createCloudRuntimeClient(socketHarness.socketFactory)
    const receivedEvents: unknown[] = []

    const session = runtimeClient.startSession({
      edgeId: 'edge-1',
      onAlarmIncidentChanged: (event) => {
        receivedEvents.push(event)
      },
    })

    const event = createDashboardAlarmIncidentChangedEventFixture()

    act(() => {
      socketHarness.emitAlarmIncidentChanged(event)
      socketHarness.emitAlarmIncidentChanged(
        createDashboardAlarmIncidentChangedEventFixture({ edgeId: 'edge-2' }),
      )
      socketHarness.emitAlarmIncidentChanged({
        edgeId: 'edge-1',
        incident: {
          ...event.incident,
          rule: {
            ...event.incident.rule,
            severity: 'critical',
          },
        },
      })
    })

    expect(receivedEvents).toEqual([event])

    session.dispose()
  })
})
