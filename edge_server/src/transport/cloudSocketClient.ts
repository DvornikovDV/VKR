import { ENV } from '../config/env'
import type {
  EdgeCredentialMode,
  PersistedCredentialRecord,
} from '../onboarding/persistedCredentialStore'

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

export type EdgeConnectErrorCode =
  | 'edge_not_found'
  | 'blocked'
  | 'onboarding_not_allowed'
  | 'onboarding_package_missing'
  | 'onboarding_package_expired'
  | 'onboarding_package_reused'
  | 'invalid_credential'
  | 'persistent_credential_revoked'
  | 'edge_auth_internal_error'

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

function requireConfiguredString(value: string | undefined, envKey: string): string {
  const trimmed = value?.trim()
  if (!trimmed) {
    throw new Error(`${envKey} must be configured for edge runtime transport examples`)
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

export function buildOnboardingCredentialRecord(
  edgeId: string,
  onboardingSecret: string,
  issuedAt = new Date().toISOString(),
): PersistedCredentialRecord {
  return {
    edgeId: assertNonEmpty(edgeId, 'edgeId'),
    credentialMode: 'onboarding',
    credentialSecret: assertNonEmpty(onboardingSecret, 'onboardingSecret'),
    version: null,
    issuedAt: assertNonEmpty(issuedAt, 'issuedAt'),
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

export function isEdgeActivationEventPayload(value: unknown): value is EdgeActivationEventPayload {
  if (!value || typeof value !== 'object') return false

  const candidate = value as Record<string, unknown>
  if (candidate['lifecycleState'] !== 'Active') return false
  if (typeof candidate['edgeId'] !== 'string' || candidate['edgeId'].trim().length === 0) return false

  const persistentCredential = candidate['persistentCredential']
  if (!persistentCredential || typeof persistentCredential !== 'object') return false
  const credential = persistentCredential as Record<string, unknown>

  return (
    Number.isInteger(credential['version']) &&
    Number(credential['version']) > 0 &&
    typeof credential['secret'] === 'string' &&
    credential['secret'].trim().length > 0 &&
    typeof credential['issuedAt'] === 'string' &&
    credential['issuedAt'].trim().length > 0
  )
}

export function isEdgeConnectErrorCode(value: string): value is EdgeConnectErrorCode {
  return (
    value === 'edge_not_found' ||
    value === 'blocked' ||
    value === 'onboarding_not_allowed' ||
    value === 'onboarding_package_missing' ||
    value === 'onboarding_package_expired' ||
    value === 'onboarding_package_reused' ||
    value === 'invalid_credential' ||
    value === 'persistent_credential_revoked' ||
    value === 'edge_auth_internal_error'
  )
}

export function buildCloudSocketClientOptions(
  overrides: Partial<CloudSocketClientOptions> = {},
): CloudSocketClientOptions {
  return {
    cloudUrl: overrides.cloudUrl ?? requireConfiguredString(ENV.CLOUD_SOCKET_URL, 'CLOUD_SOCKET_URL'),
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
