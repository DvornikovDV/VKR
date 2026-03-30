import { describe, expect, it, vi } from 'vitest'
import { server } from '../mocks/server'
import { createEdgeOnboardingApiFixtures, createEdgeOnboardingApiHandlers } from '../mocks/handlers'

const apiGet = vi.fn()
const apiPost = vi.fn()
const apiDelete = vi.fn()

vi.mock('@/shared/api/client', () => ({
  apiClient: {
    get: apiGet,
    post: apiPost,
    delete: apiDelete,
  },
}))

describe('repro_task_T010', () => {
  it('exposes lifecycle-aware shared client API methods', async () => {
    const edgeServersApi = await import('@/shared/api/edgeServers')
    const onboardingDisclosure = {
      edge: {
        _id: 'edge-1',
        name: 'Edge Alpha',
        trustedUsers: [],
        createdBy: null,
        lifecycleState: 'Pending First Connection',
        isTelemetryReady: false,
        availability: { online: false, lastSeenAt: null },
        currentOnboardingPackage: null,
        persistentCredentialVersion: null,
        lastLifecycleEventAt: '2026-03-26T10:00:00.000Z',
      },
      onboardingPackage: {
        edgeId: 'edge-1',
        onboardingSecret: 'first-connection-secret',
        issuedAt: '2026-03-26T10:00:00.000Z',
        expiresAt: '2026-03-27T10:00:00.000Z',
        instructions: 'Use this package once during first edge activation',
      },
    }
    const reonboardingEdge = {
      _id: 'edge-1',
      name: 'Edge Alpha',
      trustedUsers: [],
      createdBy: null,
      lifecycleState: 'Re-onboarding Required',
      isTelemetryReady: false,
      availability: { online: false, lastSeenAt: null },
      currentOnboardingPackage: null,
      persistentCredentialVersion: null,
      lastLifecycleEventAt: '2026-03-26T10:05:00.000Z',
    }
    const blockedEdge = {
      ...reonboardingEdge,
      lifecycleState: 'Blocked',
      lastLifecycleEventAt: '2026-03-26T10:06:00.000Z',
    }

    apiPost.mockResolvedValueOnce(onboardingDisclosure)
    apiPost.mockResolvedValueOnce(onboardingDisclosure)
    apiPost.mockResolvedValueOnce(reonboardingEdge)
    apiPost.mockResolvedValueOnce(blockedEdge)
    apiPost.mockResolvedValueOnce(reonboardingEdge)

    await (edgeServersApi as Record<string, (...args: unknown[]) => Promise<unknown>>)
      .registerEdgeServer({ name: 'Edge Alpha' })
    await (edgeServersApi as Record<string, (...args: unknown[]) => Promise<unknown>>)
      .resetEdgeOnboardingCredentials('edge-1')
    await (edgeServersApi as Record<string, (...args: unknown[]) => Promise<unknown>>)
      .revokeEdgeTrust('edge-1')
    await (edgeServersApi as Record<string, (...args: unknown[]) => Promise<unknown>>)
      .blockEdgeServer('edge-1')
    await (edgeServersApi as Record<string, (...args: unknown[]) => Promise<unknown>>)
      .reenableEdgeOnboarding('edge-1')

    expect(apiPost).toHaveBeenNthCalledWith(1, '/edge-servers', { name: 'Edge Alpha' })
    expect(apiPost).toHaveBeenNthCalledWith(2, '/edge-servers/edge-1/onboarding/reset')
    expect(apiPost).toHaveBeenNthCalledWith(3, '/edge-servers/edge-1/trust/revoke')
    expect(apiPost).toHaveBeenNthCalledWith(4, '/edge-servers/edge-1/block')
    expect(apiPost).toHaveBeenNthCalledWith(5, '/edge-servers/edge-1/re-enable-onboarding')
  })

  it('serves lifecycle action mocks via MSW handlers', async () => {
    const fixtures = createEdgeOnboardingApiFixtures()
    const handlers = createEdgeOnboardingApiHandlers(fixtures)
    server.use(...handlers)

    const resetResponse = await fetch('/api/edge-servers/edge-onboarding-1/onboarding/reset', {
      method: 'POST',
    })
    expect(resetResponse.status).toBe(200)

    const blockResponse = await fetch('/api/edge-servers/edge-onboarding-1/block', {
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
})
