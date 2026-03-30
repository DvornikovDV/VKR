import { mkdtemp, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('repro_task_T021', () => {
  it('prepares onboarding handshake and persists activation credential for reconnect', async () => {
    const edgeTransport = await import('../../../edge_server/src/transport/cloudSocketClient')
    const edgeStore = await import('../../../edge_server/src/onboarding/persistedCredentialStore')

    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'edge-t021-'))
    const persistedPath = path.join(tempDir, 'credential.json')
    const store = edgeStore.createPersistedCredentialStore(persistedPath)

    const bootstrap = await edgeTransport.prepareEdgeRuntimeHandshake({
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

    const persisted = await edgeTransport.applyEdgeActivationEvent({
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

    const reconnect = await edgeTransport.prepareEdgeRuntimeHandshake({
      store,
    })
    expect(reconnect.credentialSource).toBe('persisted')
    expect(reconnect.handshakeAuth).toMatchObject({
      edgeId: 'edge-t021',
      credentialMode: 'persistent',
      credentialSecret: 'persistent-secret-t021',
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
    const edgeTransport = await import('../../../edge_server/src/transport/cloudSocketClient')
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
      edgeTransport.prepareEdgeRuntimeHandshake({
        store,
        edgeId: 'edge-fallback',
        onboardingSecret: 'env-onboarding-secret',
        now: () => new Date('2026-03-26T14:00:00.000Z'),
      }),
    ).rejects.toThrow(`Invalid persisted credential format in ${persistedPath}`)
  })
})
