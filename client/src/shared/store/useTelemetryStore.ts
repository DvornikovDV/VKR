import { create } from 'zustand'

export const RECONNECT_BASE_DELAY_MS = 1000
export const RECONNECT_MAX_DELAY_MS = 30_000

type TelemetryValue = number | string | boolean | null

interface TelemetryUpdateEnvelope {
  event?: string
  type?: string
  data?: unknown
  payload?: unknown
}

interface EdgeStatusPayload {
  edgeId: string
  isOnline: boolean
}

interface SubscribePayload {
  edgeId: string
  diagramId?: string
}

interface TelemetryState {
  isConnected: boolean
  subscribedEdgeId: string | null
  subscribedDiagramId: string | null
  latestValues: Record<string, TelemetryValue>
  edgeStatusById: Record<string, boolean>
  reconnectAttempt: number
  nextRetryDelayMs: number | null
  subscribe: (payload: SubscribePayload) => void
  unsubscribe: () => void
}

let socket: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let isManualUnsubscribe = false

const clearReconnectTimer = (): void => {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
}

const getEventName = (envelope: TelemetryUpdateEnvelope): string | undefined =>
  envelope.event ?? envelope.type

const getPayload = (envelope: TelemetryUpdateEnvelope): unknown =>
  envelope.data ?? envelope.payload

const getWebSocketUrl = (): string => {
  const explicitUrl = import.meta.env.VITE_TELEMETRY_WS_URL as string | undefined

  if (explicitUrl && explicitUrl.length > 0) {
    return explicitUrl
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/telemetry`
}

const sendSubscribeMessage = (edgeId: string, diagramId: string | null): void => {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return
  }

  socket.send(
    JSON.stringify({
      event: 'subscribe',
      data: { edgeId, diagramId },
    }),
  )
}

const handleIncomingMessage = (
  rawData: unknown,
  set: (partial: Partial<TelemetryState>) => void,
): void => {
  if (typeof rawData !== 'string') {
    return
  }

  let parsed: TelemetryUpdateEnvelope

  try {
    parsed = JSON.parse(rawData) as TelemetryUpdateEnvelope
  } catch {
    return
  }

  const eventName = getEventName(parsed)
  const payload = getPayload(parsed)

  if (
    eventName === 'telemetry-update' &&
    payload &&
    typeof payload === 'object' &&
    !Array.isArray(payload)
  ) {
    set({
      latestValues: {
        ...((useTelemetryStore.getState().latestValues as Record<string, TelemetryValue>) ?? {}),
        ...(payload as Record<string, TelemetryValue>),
      },
    })
    return
  }

  if (
    eventName === 'edge-status' &&
    payload &&
    typeof payload === 'object' &&
    'edgeId' in payload &&
    'isOnline' in payload
  ) {
    const edgeStatus = payload as EdgeStatusPayload
    set({
      edgeStatusById: {
        ...useTelemetryStore.getState().edgeStatusById,
        [edgeStatus.edgeId]: Boolean(edgeStatus.isOnline),
      },
    })
  }
}

const scheduleReconnect = (
  set: (partial: Partial<TelemetryState>) => void,
): void => {
  const { subscribedEdgeId, reconnectAttempt } = useTelemetryStore.getState()

  if (isManualUnsubscribe || !subscribedEdgeId) {
    return
  }

  const nextAttempt = reconnectAttempt + 1
  const nextDelay = Math.min(
    RECONNECT_BASE_DELAY_MS * 2 ** (nextAttempt - 1),
    RECONNECT_MAX_DELAY_MS,
  )

  set({
    reconnectAttempt: nextAttempt,
    nextRetryDelayMs: nextDelay,
  })

  clearReconnectTimer()
  reconnectTimer = setTimeout(() => {
    if (isManualUnsubscribe) {
      return
    }

    connect(set)
  }, nextDelay)
}

const closeSocket = (): void => {
  if (!socket) {
    return
  }

  socket.onopen = null
  socket.onclose = null
  socket.onmessage = null
  socket.onerror = null
  socket.close()
  socket = null
}

const connect = (set: (partial: Partial<TelemetryState>) => void): void => {
  const { subscribedEdgeId, subscribedDiagramId } = useTelemetryStore.getState()

  if (!subscribedEdgeId) {
    return
  }

  closeSocket()

  socket = new WebSocket(getWebSocketUrl())

  socket.onopen = () => {
    set({
      isConnected: true,
      reconnectAttempt: 0,
      nextRetryDelayMs: null,
    })
    sendSubscribeMessage(subscribedEdgeId, subscribedDiagramId)
  }

  socket.onmessage = (event) => {
    handleIncomingMessage(event.data, set)
  }

  socket.onclose = () => {
    set({ isConnected: false })
    socket = null
    scheduleReconnect(set)
  }

  socket.onerror = () => {
    // onclose handles reconnect scheduling
  }
}

export const useTelemetryStore = create<TelemetryState>((set) => ({
  isConnected: false,
  subscribedEdgeId: null,
  subscribedDiagramId: null,
  latestValues: {},
  edgeStatusById: {},
  reconnectAttempt: 0,
  nextRetryDelayMs: null,

  subscribe: ({ edgeId, diagramId }) => {
    isManualUnsubscribe = false
    clearReconnectTimer()

    set({
      subscribedEdgeId: edgeId,
      subscribedDiagramId: diagramId ?? null,
      latestValues: {},
      reconnectAttempt: 0,
      nextRetryDelayMs: null,
    })

    connect(set)
  },

  unsubscribe: () => {
    isManualUnsubscribe = true
    clearReconnectTimer()
    closeSocket()

    set({
      isConnected: false,
      subscribedEdgeId: null,
      subscribedDiagramId: null,
      reconnectAttempt: 0,
      nextRetryDelayMs: null,
    })
  },
}))
