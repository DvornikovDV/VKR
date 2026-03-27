import { ENV } from '../config/env'
import type { EdgeCredentialMode, PersistedCredentialRecord } from '../onboarding/persistedCredentialStore'

export interface EdgeHandshakeAuthPayload {
  edgeId: string
  credentialMode: EdgeCredentialMode
  credentialSecret: string
}

export interface CloudSocketReconnectPolicy {
  enabled: boolean
  maxAttempts: number
  baseDelayMs: number
  maxDelayMs: number
}

export interface CloudSocketClientOptions {
  cloudUrl: string
  namespace: string
  connectTimeoutMs: number
  reconnect: CloudSocketReconnectPolicy
}

export interface EdgeActivationEventPayload {
  edgeId: string
  lifecycleState: 'Active'
  persistentCredential: {
    version: number
    secret: string
    issuedAt: string
  }
}

function assertPositiveInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`)
  }
  return value
}

function assertNonEmpty(value: string, label: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error(`${label} must be a non-empty string`)
  }
  return trimmed
}

export function buildEdgeHandshakeAuth(record: PersistedCredentialRecord): EdgeHandshakeAuthPayload {
  return {
    edgeId: assertNonEmpty(record.edgeId, 'edgeId'),
    credentialMode: record.credentialMode,
    credentialSecret: assertNonEmpty(record.credentialSecret, 'credentialSecret'),
  }
}

export function buildPersistedCredentialRecordFromActivation(
  payload: EdgeActivationEventPayload,
): PersistedCredentialRecord {
  return {
    edgeId: assertNonEmpty(payload.edgeId, 'edgeId'),
    credentialMode: 'persistent',
    credentialSecret: assertNonEmpty(payload.persistentCredential.secret, 'persistentCredential.secret'),
    version: assertPositiveInteger(payload.persistentCredential.version, 'persistentCredential.version'),
    issuedAt: assertNonEmpty(payload.persistentCredential.issuedAt, 'persistentCredential.issuedAt'),
    lifecycleState: payload.lifecycleState,
  }
}

export function buildCloudSocketClientOptions(
  overrides: Partial<CloudSocketClientOptions> = {},
): CloudSocketClientOptions {
  return {
    cloudUrl: overrides.cloudUrl ?? ENV.CLOUD_SOCKET_URL,
    namespace: overrides.namespace ?? ENV.EDGE_SOCKET_NAMESPACE,
    connectTimeoutMs: overrides.connectTimeoutMs ?? ENV.EDGE_CONNECT_TIMEOUT_MS,
    reconnect: {
      enabled: overrides.reconnect?.enabled ?? true,
      maxAttempts: overrides.reconnect?.maxAttempts ?? ENV.EDGE_RECONNECT_MAX_ATTEMPTS,
      baseDelayMs: overrides.reconnect?.baseDelayMs ?? ENV.EDGE_RECONNECT_BASE_DELAY_MS,
      maxDelayMs: overrides.reconnect?.maxDelayMs ?? ENV.EDGE_RECONNECT_MAX_DELAY_MS,
    },
  }
}

export function resolveCloudSocketEndpoint(options: CloudSocketClientOptions): string {
  const cloudUrl = assertNonEmpty(options.cloudUrl, 'cloudUrl').replace(/\/+$/, '')
  const namespace = assertNonEmpty(options.namespace, 'namespace')
  const normalizedNamespace = namespace.startsWith('/') ? namespace : `/${namespace}`

  return `${cloudUrl}${normalizedNamespace}`
}
