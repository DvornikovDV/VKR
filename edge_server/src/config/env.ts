import dotenv from 'dotenv'
import path from 'node:path'

dotenv.config({ path: path.resolve(__dirname, '../../.env') })

function optionalInt(key: string, fallback: number): number {
  const raw = process.env[key]
  if (raw === undefined) return fallback

  const parsed = Number.parseInt(raw, 10)
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be an integer, got "${raw}"`)
  }
  return parsed
}

function optionalPositiveInt(key: string, fallback: number): number {
  const parsed = optionalInt(key, fallback)
  if (parsed <= 0) {
    throw new Error(`Environment variable ${key} must be > 0, got "${parsed}"`)
  }
  return parsed
}

function optionalTrimmedString(key: string): string | undefined {
  const raw = process.env[key]
  if (raw === undefined) return undefined

  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function optionalNonEmptyString(key: string, fallback: string): string {
  const raw = process.env[key]
  if (raw === undefined) return fallback

  const trimmed = raw.trim()
  if (!trimmed) {
    throw new Error(`Environment variable ${key} must be a non-empty string`)
  }
  return trimmed
}

export const ENV = {
  NODE_ENV: process.env['NODE_ENV'] ?? 'development',
  CLOUD_SOCKET_URL: optionalNonEmptyString('CLOUD_SOCKET_URL', 'http://localhost:4000'),
  EDGE_SOCKET_NAMESPACE: optionalNonEmptyString('EDGE_SOCKET_NAMESPACE', '/edge'),
  EDGE_ID: optionalTrimmedString('EDGE_ID'),
  EDGE_ONBOARDING_SECRET: optionalTrimmedString('EDGE_ONBOARDING_SECRET'),

  EDGE_ONBOARDING_PACKAGE_TTL_HOURS: optionalPositiveInt('EDGE_ONBOARDING_PACKAGE_TTL_HOURS', 24),
  EDGE_ONBOARDING_SECRET_BYTES: optionalPositiveInt('EDGE_ONBOARDING_SECRET_BYTES', 32),
  EDGE_PERSISTENT_SECRET_BYTES: optionalPositiveInt('EDGE_PERSISTENT_SECRET_BYTES', 48),

  EDGE_RECONNECT_MAX_ATTEMPTS: optionalPositiveInt('EDGE_RECONNECT_MAX_ATTEMPTS', 10),
  EDGE_RECONNECT_BASE_DELAY_MS: optionalPositiveInt('EDGE_RECONNECT_BASE_DELAY_MS', 1_000),
  EDGE_RECONNECT_MAX_DELAY_MS: optionalPositiveInt('EDGE_RECONNECT_MAX_DELAY_MS', 30_000),
  EDGE_CONNECT_TIMEOUT_MS: optionalPositiveInt('EDGE_CONNECT_TIMEOUT_MS', 10_000),

  EDGE_PERSISTED_CREDENTIAL_PATH: optionalNonEmptyString(
    'EDGE_PERSISTED_CREDENTIAL_PATH',
    './.edge-credential.json',
  ),
} as const
