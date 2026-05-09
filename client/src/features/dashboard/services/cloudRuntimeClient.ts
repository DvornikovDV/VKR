import { io } from 'socket.io-client'
import { useAuthStore } from '@/shared/store/useAuthStore'
import type {
  DashboardAlarmConditionType,
  DashboardAlarmIncidentChangedEvent,
  DashboardAlarmIncidentLifecycleState,
  DashboardAlarmObservedValue,
  DashboardAlarmSeverity,
  DashboardEdgeStatusEvent,
  DashboardTelemetryEvent,
  DashboardTelemetryReading,
  DashboardTransportStatus,
  DashboardRuntimeValue,
} from '@/features/dashboard/model/types'
import {
  DASHBOARD_ALARM_CONDITION_TYPES,
  DASHBOARD_ALARM_INCIDENT_CHANGED_EVENT,
  DASHBOARD_ALARM_INCIDENT_LIFECYCLE_STATES,
  DASHBOARD_ALARM_SEVERITIES,
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
  onAlarmIncidentChanged?: (event: DashboardAlarmIncidentChangedEvent) => void
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

function toNullableNumber(value: unknown): number | null | undefined {
  if (value === null) {
    return null
  }

  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function toObservedValue(value: unknown): DashboardAlarmObservedValue | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'boolean') {
    return value
  }

  return null
}

function toNullableObservedValue(value: unknown): DashboardAlarmObservedValue | null {
  if (value === null) {
    return null
  }

  return toObservedValue(value)
}

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && allowed.includes(value as T)
}

function toOptionalString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
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

  const deviceId = toNonEmptyString(payload.deviceId)
  const metric = toNonEmptyString(payload.metric)
  const runtimeValue = toRuntimeValue(payload.last)

  if (!deviceId || !metric || runtimeValue === null) {
    return null
  }

  return {
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

function parseAlarmIncidentChangedEvent(
  payload: unknown,
  expectedEdgeId: string,
): DashboardAlarmIncidentChangedEvent | null {
  if (!isRecord(payload)) {
    return null
  }

  const edgeId = toNonEmptyString(payload.edgeId)
  if (!edgeId || edgeId !== expectedEdgeId || !isRecord(payload.incident)) {
    return null
  }

  const incident = payload.incident
  const incidentEdgeId = toNonEmptyString(incident.edgeId)
  const rule = isRecord(incident.rule) ? incident.rule : null
  if (!incidentEdgeId || incidentEdgeId !== expectedEdgeId || !rule) {
    return null
  }

  const incidentId = toNonEmptyString(incident.incidentId)
  const sourceId = toNonEmptyString(incident.sourceId)
  const deviceId = toNonEmptyString(incident.deviceId)
  const metric = toNonEmptyString(incident.metric)
  const ruleId = toNonEmptyString(incident.ruleId)
  const lifecycleState = isOneOf(
    incident.lifecycleState,
    DASHBOARD_ALARM_INCIDENT_LIFECYCLE_STATES,
  )
    ? incident.lifecycleState
    : null
  const activatedAt = toNonEmptyString(incident.activatedAt)
  const clearedAt = toOptionalString(incident.clearedAt)
  const acknowledgedAt = toOptionalString(incident.acknowledgedAt)
  const acknowledgedBy = toOptionalString(incident.acknowledgedBy)
  const latestValue = toObservedValue(incident.latestValue)
  const latestTs = toNullableNumber(incident.latestTs)
  const latestDetectedAt = toNullableNumber(incident.latestDetectedAt)
  const createdAt = toNonEmptyString(incident.createdAt)
  const updatedAt = toNonEmptyString(incident.updatedAt)

  const snapshotRuleId = toNonEmptyString(rule.ruleId)
  const ruleRevision = toNonEmptyString(rule.ruleRevision)
  const conditionType = isOneOf(rule.conditionType, DASHBOARD_ALARM_CONDITION_TYPES)
    ? rule.conditionType
    : null
  const triggerThreshold = toNullableNumber(rule.triggerThreshold)
  const clearThreshold = toNullableNumber(rule.clearThreshold)
  const expectedValue = toNullableObservedValue(rule.expectedValue)
  const severity = isOneOf(rule.severity, DASHBOARD_ALARM_SEVERITIES) ? rule.severity : null
  const label = toNonEmptyString(rule.label)

  if (
    !incidentId ||
    !sourceId ||
    !deviceId ||
    !metric ||
    !ruleId ||
    !lifecycleState ||
    typeof incident.isActive !== 'boolean' ||
    typeof incident.isAcknowledged !== 'boolean' ||
    !activatedAt ||
    (clearedAt === null && incident.clearedAt !== null) ||
    (acknowledgedAt === null && incident.acknowledgedAt !== null) ||
    (acknowledgedBy === null && incident.acknowledgedBy !== null) ||
    latestValue === null ||
    latestTs === null ||
    latestTs === undefined ||
    latestDetectedAt === null ||
    latestDetectedAt === undefined ||
    !snapshotRuleId ||
    !ruleRevision ||
    !conditionType ||
    triggerThreshold === undefined ||
    clearThreshold === undefined ||
    (expectedValue === null && rule.expectedValue !== null) ||
    !severity ||
    !label ||
    !createdAt ||
    !updatedAt
  ) {
    return null
  }

  return {
    edgeId,
    incident: {
      incidentId,
      edgeId: incidentEdgeId,
      sourceId,
      deviceId,
      metric,
      ruleId,
      lifecycleState: lifecycleState as DashboardAlarmIncidentLifecycleState,
      isActive: incident.isActive,
      isAcknowledged: incident.isAcknowledged,
      activatedAt,
      clearedAt,
      acknowledgedAt,
      acknowledgedBy,
      latestValue,
      latestTs,
      latestDetectedAt,
      rule: {
        ruleId: snapshotRuleId,
        ruleRevision,
        conditionType: conditionType as DashboardAlarmConditionType,
        triggerThreshold,
        clearThreshold,
        expectedValue,
        severity: severity as DashboardAlarmSeverity,
        label,
      },
      createdAt,
      updatedAt,
    },
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

      const handleAlarmIncidentChanged = (payload: unknown) => {
        const parsed = parseAlarmIncidentChangedEvent(payload, edgeId)
        if (!parsed) {
          return
        }

        options.onAlarmIncidentChanged?.(parsed)
      }

      notifyTransportStatus('connecting')
      socket.on('connect', handleConnect)
      socket.on('disconnect', handleDisconnect)
      socket.on('connect_error', handleConnectError)
      socket.on('telemetry', handleTelemetry)
      socket.on('edge_status', handleEdgeStatus)
      socket.on(DASHBOARD_ALARM_INCIDENT_CHANGED_EVENT, handleAlarmIncidentChanged)
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
          socket.off(DASHBOARD_ALARM_INCIDENT_CHANGED_EVENT, handleAlarmIncidentChanged)
          socket.disconnect()
        },
        isConnected: () => socket.connected,
      }
    },
  }
}

export const cloudRuntimeClient = createCloudRuntimeClient()
