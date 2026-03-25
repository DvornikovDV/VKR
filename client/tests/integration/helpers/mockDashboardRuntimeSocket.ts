import { vi } from 'vitest'
import type {
  DashboardSocketFactory,
  DashboardSocketLike,
} from '@/features/dashboard/services/cloudRuntimeClient'
import type {
  DashboardEdgeStatusEvent,
  DashboardTelemetryReading,
  DashboardTelemetryEvent,
} from '@/features/dashboard/model/types'

type SocketEventHandler = (...args: unknown[]) => void

interface MockSocketState {
  listeners: Map<string, Set<SocketEventHandler>>
  lastSubscribePayload: { edgeId: string } | null
  emittedEvents: Array<{ event: string; payload: unknown }>
}

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
    sourceId: overrides.sourceId ?? 'source-1',
    deviceId: overrides.deviceId ?? 'pump-1',
    metric: overrides.metric ?? 'temperature',
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
