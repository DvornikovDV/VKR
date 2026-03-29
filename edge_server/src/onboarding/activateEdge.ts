import { ENV } from '../config/env'
import {
  buildEdgeHandshakeAuth,
  buildOnboardingCredentialRecord,
  buildPersistedCredentialRecordFromActivation,
  isEdgeActivationEventPayload,
  type EdgeHandshakeAuthPayload,
} from '../transport/cloudSocketClient'
import {
  createPersistedCredentialStore,
  type PersistedCredentialRecord,
  type PersistedCredentialStore,
} from './persistedCredentialStore'

export type EdgeCredentialSource = 'persisted' | 'onboarding_env'

export interface EdgeActivationBootstrapResult {
  credentialSource: EdgeCredentialSource
  credentialRecord: PersistedCredentialRecord
  handshakeAuth: EdgeHandshakeAuthPayload
}

export interface BootstrapEdgeActivationInput {
  store?: PersistedCredentialStore
  edgeId?: string
  onboardingSecret?: string
  now?: () => Date
}

export interface PersistActivationEventInput {
  payload: unknown
  expectedEdgeId?: string
  store?: PersistedCredentialStore
}

function resolveNonEmpty(value: string | undefined, envKey: string): string {
  const trimmed = value?.trim()
  if (!trimmed) {
    throw new Error(`${envKey} is required when no persisted credential is available`)
  }
  return trimmed
}

function createDefaultStore(): PersistedCredentialStore {
  return createPersistedCredentialStore()
}

export async function bootstrapEdgeActivation(
  input: BootstrapEdgeActivationInput = {},
): Promise<EdgeActivationBootstrapResult> {
  const store = input.store ?? createDefaultStore()
  const persisted = await store.load()

  if (persisted) {
    return {
      credentialSource: 'persisted',
      credentialRecord: persisted,
      handshakeAuth: buildEdgeHandshakeAuth(persisted),
    }
  }

  const edgeId = resolveNonEmpty(input.edgeId ?? ENV.EDGE_ID, 'EDGE_ID')
  const onboardingSecret = resolveNonEmpty(
    input.onboardingSecret ?? ENV.EDGE_ONBOARDING_SECRET,
    'EDGE_ONBOARDING_SECRET',
  )
  const issuedAt = (input.now ?? (() => new Date()))().toISOString()
  const onboardingRecord = buildOnboardingCredentialRecord(edgeId, onboardingSecret, issuedAt)

  return {
    credentialSource: 'onboarding_env',
    credentialRecord: onboardingRecord,
    handshakeAuth: buildEdgeHandshakeAuth(onboardingRecord),
  }
}

export async function persistActivationCredentialFromEvent(
  input: PersistActivationEventInput,
): Promise<PersistedCredentialRecord> {
  if (!isEdgeActivationEventPayload(input.payload)) {
    throw new Error('Invalid edge_activation payload')
  }

  if (input.expectedEdgeId && input.payload.edgeId !== input.expectedEdgeId) {
    throw new Error('edge_activation payload edgeId does not match expected edgeId')
  }

  const store = input.store ?? createDefaultStore()
  const persistentRecord = buildPersistedCredentialRecordFromActivation(input.payload)

  await store.save(persistentRecord)
  return persistentRecord
}
