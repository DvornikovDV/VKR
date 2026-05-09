import { vi } from 'vitest'
import type {
  DashboardSocketFactory,
  DashboardSocketLike,
} from '@/features/dashboard/services/cloudRuntimeClient'
import { dashboardVisualBindingProfile } from '../../fixtures/dashboardVisualLayout'
import type {
  DashboardAlarmIncidentChangedEvent,
  DashboardEdgeStatusEvent,
  DashboardTelemetryReading,
  DashboardTelemetryEvent,
  DashboardTransportStatus,
} from '@/features/dashboard/model/types'

type SocketEventHandler = (...args: unknown[]) => void

interface MockSocketState {
  listeners: Map<string, Set<SocketEventHandler>>
  lastSubscribePayload: { edgeId: string } | null
  emittedEvents: Array<{ event: string; payload: unknown }>
}

interface MockDashboardRuntimeClientSessionOptions {
  edgeId: string
  onTransportStatusChange?: (status: DashboardTransportStatus) => void
  onTelemetry?: (event: DashboardTelemetryEvent) => void
  onEdgeStatus?: (event: DashboardEdgeStatusEvent) => void
  onRuntimeError?: (error: Error) => void
}

export interface MockDashboardRuntimeClientHarness {
  startSession: ReturnType<typeof vi.fn>
  emitTransportStatus: (edgeId: string, status: DashboardTransportStatus) => void
  emitTelemetry: (event: DashboardTelemetryEvent) => void
  emitEdgeStatus: (event: DashboardEdgeStatusEvent) => void
  emitRuntimeError: (edgeId: string, error?: Error) => void
  getDisposeCount: (edgeId: string) => number
  reset: () => void
}

const defaultVisualTelemetryBinding =
  dashboardVisualBindingProfile.widgetBindings.find(
    (binding) => binding.widgetId === 'widget-temperature',
  ) ?? dashboardVisualBindingProfile.widgetBindings[0]

export interface MockDashboardRuntimeSocketHarness {
  socket: DashboardSocketLike
  socketFactory: DashboardSocketFactory
  spies: {
    connect: ReturnType<typeof vi.fn>
    disconnect: ReturnType<typeof vi.fn>
    emit: ReturnType<typeof vi.fn>
  }
  emitConnect: () => void
  emitDisconnect: (reason?: string) => void
  emitConnectError: (error?: unknown) => void
  emitTelemetry: (event: DashboardTelemetryEvent) => void
  emitEdgeStatus: (event: DashboardEdgeStatusEvent) => void
  emitAlarmIncidentChanged: (event: DashboardAlarmIncidentChangedEvent | unknown) => void
  getLastSubscribePayload: () => { edgeId: string } | null
  getEmittedEvents: () => Array<{ event: string; payload: unknown }>
  reset: () => void
}

function createState(): MockSocketState {
  return {
    listeners: new Map<string, Set<SocketEventHandler>>(),
    lastSubscribePayload: null,
    emittedEvents: [],
  }
}

function dispatchEvent(state: MockSocketState, eventName: string, ...args: unknown[]) {
  const handlers = state.listeners.get(eventName)
  if (!handlers) {
    return
  }

  for (const handler of handlers) {
    handler(...args)
  }
}

export function createDashboardTelemetryReadingFixture(
  overrides: Partial<DashboardTelemetryReading> = {},
): DashboardTelemetryReading {
  return {
    deviceId: overrides.deviceId ?? defaultVisualTelemetryBinding?.deviceId ?? 'pump-1',
    metric: overrides.metric ?? defaultVisualTelemetryBinding?.metric ?? 'temperature',
    last: overrides.last ?? 42.5,
    ts: overrides.ts ?? 1763895000000,
  }
}

export function createDashboardTelemetryEventFixture(
  overrides: Partial<DashboardTelemetryEvent> = {},
): DashboardTelemetryEvent {
  return {
    edgeId: overrides.edgeId ?? 'edge-1',
    readings: overrides.readings ?? [createDashboardTelemetryReadingFixture()],
    serverTs: overrides.serverTs ?? 1763895000200,
  }
}

export function createDashboardEdgeStatusEventFixture(
  overrides: Partial<DashboardEdgeStatusEvent> = {},
): DashboardEdgeStatusEvent {
  return {
    edgeId: overrides.edgeId ?? 'edge-1',
    online: overrides.online ?? true,
  }
}

export function createDashboardAlarmIncidentChangedEventFixture(
  overrides: Partial<DashboardAlarmIncidentChangedEvent> = {},
): DashboardAlarmIncidentChangedEvent {
  const edgeId = overrides.edgeId ?? 'edge-1'

  return {
    edgeId,
    incident: {
      incidentId: 'incident-1',
      edgeId,
      sourceId: 'source-1',
      deviceId: 'pump-1',
      metric: 'temperature',
      ruleId: 'rule-1',
      lifecycleState: 'active_unacknowledged',
      isActive: true,
      isAcknowledged: false,
      activatedAt: '2026-05-09T10:00:00.000Z',
      clearedAt: null,
      acknowledgedAt: null,
      acknowledgedBy: null,
      latestValue: 42.5,
      latestTs: 1778320800000,
      latestDetectedAt: 1778320800100,
      rule: {
        ruleId: 'rule-1',
        ruleRevision: 'rev-1',
        conditionType: 'high',
        triggerThreshold: 40,
        clearThreshold: 35,
        expectedValue: null,
        severity: 'warning',
        label: 'High temperature',
      },
      createdAt: '2026-05-09T10:00:00.000Z',
      updatedAt: '2026-05-09T10:00:00.000Z',
      ...overrides.incident,
    },
  }
}

export function createMockDashboardRuntimeClientHarness(): MockDashboardRuntimeClientHarness {
  const activeCallbacksByEdge = new Map<string, MockDashboardRuntimeClientSessionOptions>()
  const disposeCountByEdge = new Map<string, number>()
  const startSession = vi.fn((options: MockDashboardRuntimeClientSessionOptions) => {
    activeCallbacksByEdge.set(options.edgeId, options)
    options.onTransportStatusChange?.('connecting')

    return {
      edgeId: options.edgeId,
      dispose: () => {
        activeCallbacksByEdge.delete(options.edgeId)
        disposeCountByEdge.set(options.edgeId, (disposeCountByEdge.get(options.edgeId) ?? 0) + 1)
      },
      isConnected: () => false,
    }
  })

  return {
    startSession,
    emitTransportStatus: (edgeId, status) => {
      activeCallbacksByEdge.get(edgeId)?.onTransportStatusChange?.(status)
    },
    emitTelemetry: (event) => {
      activeCallbacksByEdge.get(event.edgeId)?.onTelemetry?.(event)
    },
    emitEdgeStatus: (event) => {
      activeCallbacksByEdge.get(event.edgeId)?.onEdgeStatus?.(event)
    },
    emitRuntimeError: (edgeId, error = new Error('Mock runtime error')) => {
      activeCallbacksByEdge.get(edgeId)?.onRuntimeError?.(error)
    },
    getDisposeCount: (edgeId) => disposeCountByEdge.get(edgeId) ?? 0,
    reset: () => {
      activeCallbacksByEdge.clear()
      disposeCountByEdge.clear()
      startSession.mockClear()
    },
  }
}

export const dashboardRuntimeClientHarness = createMockDashboardRuntimeClientHarness()
export const dashboardRuntimeSocketHarness = createMockDashboardRuntimeSocketHarness()

export function createMockDashboardRuntimeSocketHarness(): MockDashboardRuntimeSocketHarness {
  const state = createState()
  const socket: DashboardSocketLike = {
    connected: false,
    on: vi.fn((event: string, listener: SocketEventHandler) => {
      const handlers = state.listeners.get(event) ?? new Set<SocketEventHandler>()
      handlers.add(listener)
      state.listeners.set(event, handlers)
      return socket
    }),
    off: vi.fn((event: string, listener: SocketEventHandler) => {
      const handlers = state.listeners.get(event)
      if (!handlers) {
        return socket
      }

      handlers.delete(listener)
      if (handlers.size === 0) {
        state.listeners.delete(event)
      }

      return socket
    }),
    emit: vi.fn((event: string, payload?: unknown) => {
      state.emittedEvents.push({ event, payload: payload ?? null })

      if (event === 'subscribe' && payload && typeof payload === 'object' && 'edgeId' in payload) {
        state.lastSubscribePayload = { edgeId: String((payload as { edgeId: unknown }).edgeId) }
      }

      return socket
    }),
    connect: vi.fn(() => {
      socket.connected = true
      dispatchEvent(state, 'connect')
      return socket
    }),
    disconnect: vi.fn(() => {
      socket.connected = false
      dispatchEvent(state, 'disconnect', 'io client disconnect')
      return socket
    }),
  }

  const socketFactory: DashboardSocketFactory = vi.fn(() => socket)

  return {
    socket,
    socketFactory,
    spies: {
      connect: socket.connect as ReturnType<typeof vi.fn>,
      disconnect: socket.disconnect as ReturnType<typeof vi.fn>,
      emit: socket.emit as ReturnType<typeof vi.fn>,
    },
    emitConnect: () => {
      socket.connected = true
      dispatchEvent(state, 'connect')
    },
    emitDisconnect: (reason = 'transport close') => {
      socket.connected = false
      dispatchEvent(state, 'disconnect', reason)
    },
    emitConnectError: (error = new Error('Mock connect error')) => {
      dispatchEvent(state, 'connect_error', error)
    },
    emitTelemetry: (event) => {
      dispatchEvent(state, 'telemetry', event)
    },
    emitEdgeStatus: (event) => {
      dispatchEvent(state, 'edge_status', event)
    },
    emitAlarmIncidentChanged: (event) => {
      dispatchEvent(state, 'alarm_incident_changed', event)
    },
    getLastSubscribePayload: () => state.lastSubscribePayload,
    getEmittedEvents: () => [...state.emittedEvents],
    reset: () => {
      state.listeners.clear()
      state.lastSubscribePayload = null
      state.emittedEvents = []
      socket.connected = false
      ;(socket.connect as ReturnType<typeof vi.fn>).mockClear()
      ;(socket.disconnect as ReturnType<typeof vi.fn>).mockClear()
      ;(socket.emit as ReturnType<typeof vi.fn>).mockClear()
      ;(socket.on as ReturnType<typeof vi.fn>).mockClear()
      ;(socket.off as ReturnType<typeof vi.fn>).mockClear()
      ;(socketFactory as unknown as ReturnType<typeof vi.fn>).mockClear()
    },
  }
}
