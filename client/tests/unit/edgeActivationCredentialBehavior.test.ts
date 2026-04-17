import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const TEST_FILE_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT_DIR = path.resolve(TEST_FILE_DIR, '../../..')

describe('edge activation credential behavior', () => {
  it('prepares onboarding handshake and persists activation credential for reconnect', async () => {
    const edgeBootstrap = await import('../../../edge_server/src/onboarding/activateEdge')
    const edgeStore = await import('../../../edge_server/src/onboarding/persistedCredentialStore')

    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'edge-t021-'))
    const persistedPath = path.join(tempDir, 'credential.json')
    const store = edgeStore.createPersistedCredentialStore(persistedPath)

    const bootstrap = await edgeBootstrap.bootstrapEdgeActivation({
      store,
      edgeId: 'edge-t021',
      onboardingSecret: 'onboarding-secret-t021',
      now: () => new Date('2026-03-26T10:00:00.000Z'),
    })

    expect(bootstrap.credentialSource).toBe('onboarding_env')
    expect(bootstrap.handshakeAuth).toMatchObject({
      edgeId: 'edge-t021',
      credentialMode: 'onboarding',
      credentialSecret: 'onboarding-secret-t021',
    })

    const persisted = await edgeBootstrap.persistActivationCredentialFromEvent({
      store,
      expectedEdgeId: 'edge-t021',
      payload: {
        edgeId: 'edge-t021',
        lifecycleState: 'Active',
        persistentCredential: {
          version: 3,
          secret: 'persistent-secret-t021',
          issuedAt: '2026-03-26T10:05:00.000Z',
        },
      },
    })

    expect(persisted.credentialMode).toBe('persistent')
    expect(persisted.version).toBe(3)

    const reconnect = await edgeBootstrap.bootstrapEdgeActivation({
      store,
    })
    expect(reconnect.credentialSource).toBe('persisted')
    expect(reconnect.handshakeAuth).toMatchObject({
      edgeId: 'edge-t021',
      credentialMode: 'persistent',
      credentialSecret: 'persistent-secret-t021',
    })
  })

  it('builds persisted reconnect credential records directly from activation payloads', async () => {
    const edgeTransport = await import('../../../edge_server/src/transport/cloudSocketClient')

    const record = edgeTransport.buildPersistedCredentialRecordFromActivation({
      edgeId: 'edge-activation-1',
      lifecycleState: 'Active',
      persistentCredential: {
        version: 2,
        secret: 'persistent-secret',
        issuedAt: '2026-03-26T10:00:00.000Z',
      },
    })

    expect(record).toEqual({
      edgeId: 'edge-activation-1',
      credentialMode: 'persistent',
      credentialSecret: 'persistent-secret',
      version: 2,
      issuedAt: '2026-03-26T10:00:00.000Z',
      lifecycleState: 'Active',
    })
  })

  it('rejects persisted credential without canonical lifecycleState', async () => {
    const edgeStore = await import('../../../edge_server/src/onboarding/persistedCredentialStore')

    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'edge-t021-legacy-'))
    const persistedPath = path.join(tempDir, 'credential.json')
    await writeFile(
      persistedPath,
      JSON.stringify(
        {
          edgeId: 'edge-legacy',
          credentialMode: 'persistent',
          credentialSecret: 'legacy-secret',
          version: 1,
          issuedAt: '2026-03-26T12:00:00.000Z',
        },
        null,
        2,
      ),
      'utf-8',
    )

    const store = edgeStore.createPersistedCredentialStore(persistedPath)
    await expect(store.load()).rejects.toThrow(
      `Invalid persisted credential format in ${persistedPath}`,
    )
  })

  it('fails bootstrap when persisted onboarding record is left on disk', async () => {
    const edgeBootstrap = await import('../../../edge_server/src/onboarding/activateEdge')
    const edgeStore = await import('../../../edge_server/src/onboarding/persistedCredentialStore')

    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'edge-t021-onboarding-legacy-'))
    const persistedPath = path.join(tempDir, 'credential.json')
    await writeFile(
      persistedPath,
      JSON.stringify(
        {
          edgeId: 'edge-legacy-onboarding',
          credentialMode: 'onboarding',
          credentialSecret: 'legacy-onboarding-secret',
          version: null,
          issuedAt: '2026-03-26T13:00:00.000Z',
        },
        null,
        2,
      ),
      'utf-8',
    )

    const store = edgeStore.createPersistedCredentialStore(persistedPath)
    await expect(
      edgeBootstrap.bootstrapEdgeActivation({
        store,
        edgeId: 'edge-fallback',
        onboardingSecret: 'env-onboarding-secret',
        now: () => new Date('2026-03-26T14:00:00.000Z'),
      }),
    ).rejects.toThrow(`Invalid persisted credential format in ${persistedPath}`)
  })

  it('keeps persisted credential fixture expectations aligned with runtime-state contract', async () => {
    const edgeStore = await import('../../../edge_server/src/onboarding/persistedCredentialStore')

    const runtimeStateContractPath = path.join(
      REPO_ROOT_DIR,
      'specs/001-edge-runtime/contracts/runtime-state-files.md',
    )
    const validCredentialFixturePath = path.join(
      REPO_ROOT_DIR,
      'edge_server/tests/fixtures/runtime/valid/credential.json',
    )
    const legacyCredentialFixturePath = path.join(
      REPO_ROOT_DIR,
      'edge_server/tests/fixtures/runtime/legacy-onboarding/credential.json',
    )

    const [runtimeStateContract, validCredentialRaw] = await Promise.all([
      readFile(runtimeStateContractPath, 'utf8'),
      readFile(validCredentialFixturePath, 'utf8'),
    ])
    const validCredentialFixture = JSON.parse(validCredentialRaw) as Record<string, unknown>

    expect(runtimeStateContract).toContain('credentialMode = persistent')
    expect(runtimeStateContract).toContain('lifecycleState = Active')

    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'edge-t021-contract-parity-'))
    const canonicalPath = path.join(tempDir, 'credential-canonical.json')
    await writeFile(canonicalPath, `${JSON.stringify(validCredentialFixture, null, 2)}\n`, 'utf-8')

    const canonicalStore = edgeStore.createPersistedCredentialStore(canonicalPath)
    await expect(canonicalStore.load()).resolves.toMatchObject({
      credentialMode: 'persistent',
      lifecycleState: 'Active',
    })

    const legacyRaw = await readFile(legacyCredentialFixturePath, 'utf8')
    const legacyFixture = JSON.parse(legacyRaw) as Record<string, unknown>
    const legacyPath = path.join(tempDir, 'credential-legacy.json')
    await writeFile(legacyPath, `${JSON.stringify(legacyFixture, null, 2)}\n`, 'utf-8')

    const legacyStore = edgeStore.createPersistedCredentialStore(legacyPath)
    await expect(legacyStore.load()).rejects.toThrow(`Invalid persisted credential format in ${legacyPath}`)
  })

  it('keeps TypeScript connect_error guards aligned with runtime contracts', async () => {
    const runtimeContractPath = path.join(
      REPO_ROOT_DIR,
      'specs/001-edge-runtime/contracts/cloud-runtime-contract.md',
    )
    const lifecycleContractPath = path.join(
      REPO_ROOT_DIR,
      'specs/004-edge-onboarding/contracts/edge-socket-contract.md',
    )

    const [runtimeContract, lifecycleContract] = await Promise.all([
      readFile(runtimeContractPath, 'utf8'),
      readFile(lifecycleContractPath, 'utf8'),
    ])

    const requiredConnectErrorCodes = [
      'edge_not_found',
      'blocked',
      'onboarding_not_allowed',
      'onboarding_package_missing',
      'onboarding_package_expired',
      'onboarding_package_reused',
      'invalid_credential',
      'persistent_credential_revoked',
      'edge_auth_internal_error',
    ] as const

    const edgeTransport = await import('../../../edge_server/src/transport/cloudSocketClient')

    for (const code of requiredConnectErrorCodes) {
      expect(runtimeContract).toContain(code)
      expect(lifecycleContract).toContain(code)
      expect(edgeTransport.isEdgeConnectErrorCode(code)).toBe(true)
    }

    expect(edgeTransport.isEdgeConnectErrorCode('unexpected_error_code')).toBe(false)
  })
})
