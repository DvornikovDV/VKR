import { io } from 'socket.io-client'
import { useAuthStore } from '@/shared/store/useAuthStore'
import type {
  DashboardEdgeStatusEvent,
  DashboardTelemetryEvent,
  DashboardTelemetryReading,
  DashboardTransportStatus,
  DashboardRuntimeValue,
} from '@/features/dashboard/model/types'

type DashboardSocketListener = (...args: unknown[]) => void

export interface DashboardSocketLike {
  connected: boolean
  on(event: string, listener: DashboardSocketListener): DashboardSocketLike
  off(event: string, listener: DashboardSocketListener): DashboardSocketLike
  emit(event: string, ...args: unknown[]): DashboardSocketLike
  connect(): DashboardSocketLike
  disconnect(): DashboardSocketLike
}

export type DashboardSocketFactory = (token: string) => DashboardSocketLike

export interface StartDashboardRuntimeSessionOptions {
  edgeId: string
  token?: string
  onTransportStatusChange?: (status: DashboardTransportStatus) => void
  onTelemetry?: (event: DashboardTelemetryEvent) => void
  onEdgeStatus?: (event: DashboardEdgeStatusEvent) => void
  onRuntimeError?: (error: Error) => void
}

export interface DashboardRuntimeSession {
  readonly edgeId: string
  dispose: () => void
  isConnected: () => boolean
}

export interface CloudRuntimeClient {
  startSession: (options: StartDashboardRuntimeSessionOptions) => DashboardRuntimeSession
}

const DEFAULT_SOCKET_PATH = '/socket.io'
const DASHBOARD_SUBSCRIBE_EVENT = 'subscribe'

function normalizeEdgeId(edgeId: string): string {
  return edgeId.trim()
}

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }

  return fallback
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function toRuntimeValue(value: unknown): DashboardRuntimeValue | null {
  if (
    value === null ||
    typeof value === 'number' ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return value
  }

  return null
}

function toFiniteNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  return fallback
}

function parseTelemetryReading(payload: unknown): DashboardTelemetryReading | null {
  if (!isRecord(payload)) {
    return null
  }

  const sourceId = toNonEmptyString(payload.sourceId) ?? 'unknown'
  const deviceId = toNonEmptyString(payload.deviceId)
  const metric = toNonEmptyString(payload.metric)
  const runtimeValue = toRuntimeValue(payload.last)

  if (!deviceId || !metric || runtimeValue === null) {
    return null
  }

  return {
    sourceId,
    deviceId,
    metric,
    last: runtimeValue,
    ts: toFiniteNumber(payload.ts, Date.now()),
  }
}

function parseTelemetryEvent(payload: unknown, expectedEdgeId: string): DashboardTelemetryEvent | null {
  if (!isRecord(payload)) {
    return null
  }

  const edgeId = toNonEmptyString(payload.edgeId)
  if (!edgeId || edgeId !== expectedEdgeId || !Array.isArray(payload.readings)) {
    return null
  }

  const readings = payload.readings
    .map((reading) => parseTelemetryReading(reading))
    .filter((reading): reading is DashboardTelemetryReading => reading !== null)

  return {
    edgeId,
    readings,
    serverTs: toFiniteNumber(payload.serverTs, Date.now()),
  }
}

function parseEdgeStatusEvent(payload: unknown, expectedEdgeId: string): DashboardEdgeStatusEvent | null {
  if (!isRecord(payload)) {
    return null
  }

  const edgeId = toNonEmptyString(payload.edgeId)
  if (!edgeId || edgeId !== expectedEdgeId || typeof payload.online !== 'boolean') {
    return null
  }

  return {
    edgeId,
    online: payload.online,
  }
}

function resolveSocketUrl(): string | undefined {
  const configured = import.meta.env.VITE_CLOUD_SOCKET_URL as string | undefined
  if (!configured) {
    return undefined
  }

  const trimmed = configured.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function resolveSocketPath(): string {
  const configured = import.meta.env.VITE_CLOUD_SOCKET_PATH as string | undefined
  if (!configured) {
    return DEFAULT_SOCKET_PATH
  }

  const trimmed = configured.trim()
  return trimmed.length > 0 ? trimmed : DEFAULT_SOCKET_PATH
}

function createDefaultSocket(token: string): DashboardSocketLike {
  return io(resolveSocketUrl(), {
    path: resolveSocketPath(),
    autoConnect: false,
    reconnection: true,
    auth: {
      token: `Bearer ${token}`,
    },
  }) as unknown as DashboardSocketLike
}

function emitDashboardSubscribeRequest(socket: DashboardSocketLike, edgeId: string): void {
  socket.emit(DASHBOARD_SUBSCRIBE_EVENT, { edgeId })
}

export function createCloudRuntimeClient(
  socketFactory: DashboardSocketFactory = createDefaultSocket,
): CloudRuntimeClient {
  return {
    startSession(options: StartDashboardRuntimeSessionOptions): DashboardRuntimeSession {
      const edgeId = normalizeEdgeId(options.edgeId)
      if (!edgeId) {
        throw new Error('Dashboard runtime session requires a non-empty edgeId.')
      }

      const token = options.token ?? useAuthStore.getState().session?.accessToken ?? ''
      if (!token) {
        throw new Error('Dashboard runtime session requires an authenticated token.')
      }

      const socket = socketFactory(token)
      let disposed = false

      const notifyTransportStatus = (status: DashboardTransportStatus) => {
        if (disposed) {
          return
        }

        options.onTransportStatusChange?.(status)
      }

      const handleConnect = () => {
        notifyTransportStatus('connected')
        emitDashboardSubscribeRequest(socket, edgeId)
      }

      const handleDisconnect = () => {
        notifyTransportStatus('reconnecting')
      }

      const handleConnectError = (error: unknown) => {
        notifyTransportStatus('reconnecting')
        options.onRuntimeError?.(
          new Error(toErrorMessage(error, 'Dashboard runtime transport connection failed.')),
        )
      }

      const handleTelemetry = (payload: unknown) => {
        const parsed = parseTelemetryEvent(payload, edgeId)
        if (!parsed) {
          return
        }

        options.onTelemetry?.(parsed)
      }

      const handleEdgeStatus = (payload: unknown) => {
        const parsed = parseEdgeStatusEvent(payload, edgeId)
        if (!parsed) {
          return
        }

        options.onEdgeStatus?.(parsed)
      }

      notifyTransportStatus('connecting')
      socket.on('connect', handleConnect)
      socket.on('disconnect', handleDisconnect)
      socket.on('connect_error', handleConnectError)
      socket.on('telemetry', handleTelemetry)
      socket.on('edge_status', handleEdgeStatus)
      socket.connect()

      return {
        edgeId,
        dispose: () => {
          if (disposed) {
            return
          }

          disposed = true
          socket.off('connect', handleConnect)
          socket.off('disconnect', handleDisconnect)
          socket.off('connect_error', handleConnectError)
          socket.off('telemetry', handleTelemetry)
          socket.off('edge_status', handleEdgeStatus)
          socket.disconnect()
        },
        isConnected: () => socket.connected,
      }
    },
  }
}

export const cloudRuntimeClient = createCloudRuntimeClient()
