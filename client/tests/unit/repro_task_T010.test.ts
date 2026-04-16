import { describe, expect, it, vi } from 'vitest'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { server } from '../mocks/server'
import { http, HttpResponse } from 'msw'

const apiGet = vi.fn()
const apiPost = vi.fn()
const apiDelete = vi.fn()
const TEST_FILE_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT_DIR = path.resolve(TEST_FILE_DIR, '../../..')

vi.mock('@/shared/api/client', () => ({
  apiClient: {
    get: apiGet,
    post: apiPost,
    delete: apiDelete,
  },
}))

describe('repro_task_T010', () => {
  it('exposes canonical shared client API methods', async () => {
    const edgeServersApi = await import('@/shared/api/edgeServers')
    const edgeServersApiFns = edgeServersApi as unknown as Record<
      string,
      (...args: unknown[]) => Promise<unknown>
    >

    const disclosure = {
      edge: {
        _id: 'edge-1',
        name: 'Edge Alpha',
        trustedUsers: [],
        createdBy: null,
        lifecycleState: 'Active',
        availability: { online: false, lastSeenAt: null },
        persistentCredentialVersion: 1,
        lastLifecycleEventAt: '2026-03-26T10:00:00.000Z',
      },
      persistentCredential: {
        edgeId: 'edge-1',
        credentialSecret: 'persistent-secret',
        version: 1,
        issuedAt: '2026-03-26T10:00:00.000Z',
        instructions: 'Use this secret as the edge runtime persistent credential.',
      },
    }
    const blockedEdge = {
      _id: 'edge-1',
      name: 'Edge Alpha',
      trustedUsers: [],
      createdBy: null,
      lifecycleState: 'Blocked',
      availability: { online: false, lastSeenAt: null },
      persistentCredentialVersion: 1,
      lastLifecycleEventAt: '2026-03-26T10:06:00.000Z',
    }

    apiPost.mockResolvedValueOnce(disclosure)
    apiPost.mockResolvedValueOnce(disclosure)
    apiPost.mockResolvedValueOnce(blockedEdge)
    apiPost.mockResolvedValueOnce(disclosure)

    await edgeServersApiFns.registerAdminEdgeServer({ name: 'Edge Alpha' })
    await edgeServersApiFns.rotateEdgeServerCredential('edge-1')
    await edgeServersApiFns.blockAdminEdgeServer('edge-1')
    await edgeServersApiFns.unblockEdgeServer('edge-1')

    expect(apiPost).toHaveBeenNthCalledWith(1, '/edge-servers', { name: 'Edge Alpha' })
    expect(apiPost).toHaveBeenNthCalledWith(2, '/edge-servers/edge-1/rotate-credential')
    expect(apiPost).toHaveBeenNthCalledWith(3, '/edge-servers/edge-1/block')
    expect(apiPost).toHaveBeenNthCalledWith(4, '/edge-servers/edge-1/unblock')
  })

  it('serves canonical lifecycle action mocks via MSW handlers', async () => {
    server.use(
      http.post('/api/edge-servers/:edgeId/rotate-credential', ({ params }) =>
        HttpResponse.json({
          status: 'success',
          data: {
            edge: {
              _id: String(params.edgeId),
              name: 'Edge Alpha',
              trustedUsers: [],
              createdBy: null,
              lifecycleState: 'Active',
              availability: { online: false, lastSeenAt: null },
              persistentCredentialVersion: 2,
              lastLifecycleEventAt: '2026-03-26T10:10:00.000Z',
            },
            persistentCredential: {
              edgeId: String(params.edgeId),
              credentialSecret: 'rotated-secret',
              version: 2,
              issuedAt: '2026-03-26T10:10:00.000Z',
              instructions: 'Use this secret as the edge runtime persistent credential.',
            },
          },
        }),
      ),
      http.post('/api/edge-servers/:edgeId/block', ({ params }) =>
        HttpResponse.json({
          status: 'success',
          data: {
            _id: String(params.edgeId),
            name: 'Edge Alpha',
            trustedUsers: [],
            createdBy: null,
            lifecycleState: 'Blocked',
            availability: { online: false, lastSeenAt: null },
            persistentCredentialVersion: 2,
            lastLifecycleEventAt: '2026-03-26T10:11:00.000Z',
          },
        }),
      ),
    )

    const rotateResponse = await fetch('/api/edge-servers/edge-1/rotate-credential', {
      method: 'POST',
    })
    expect(rotateResponse.status).toBe(200)

    const blockResponse = await fetch('/api/edge-servers/edge-1/block', {
      method: 'POST',
    })
    expect(blockResponse.status).toBe(200)
  })

  it('builds persisted reconnect credential record from activation payload', async () => {
    const edgeTransport = await import('../../../edge_server/src/transport/cloudSocketClient')

    const record = (edgeTransport as Record<string, (...args: unknown[]) => unknown>)
      .buildPersistedCredentialRecordFromActivation({
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

  it('keeps TypeScript connect_error guards aligned with contract authorities', async () => {
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
    const edgeTransportFns = edgeTransport as unknown as Record<string, (value: string) => boolean>

    for (const code of requiredConnectErrorCodes) {
      expect(runtimeContract).toContain(code)
      expect(lifecycleContract).toContain(code)
      expect(edgeTransportFns.isEdgeConnectErrorCode(code)).toBe(true)
    }

    expect(edgeTransportFns.isEdgeConnectErrorCode('unexpected_error_code')).toBe(false)
  })
})
