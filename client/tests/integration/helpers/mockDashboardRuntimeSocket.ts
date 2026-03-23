import { vi } from 'vitest'
import type {
  DashboardSocketFactory,
  DashboardSocketLike,
} from '@/features/dashboard/services/cloudRuntimeClient'
import type {
  DashboardEdgeStatusEvent,
  DashboardTelemetryEvent,
} from '@/features/dashboard/model/types'

type SocketEventHandler = (...args: unknown[]) => void

interface MockSocketState {
  listeners: Map<string, Set<SocketEventHandler>>
  lastSubscribePayload: { edgeId: string } | null
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
  reset: () => void
}

function createState(): MockSocketState {
  return {
    listeners: new Map<string, Set<SocketEventHandler>>(),
    lastSubscribePayload: null,
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
    reset: () => {
      state.listeners.clear()
      state.lastSubscribePayload = null
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
