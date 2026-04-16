import { beforeEach, describe, expect, it, vi } from 'vitest'

const { apiGet, apiPost } = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}))

vi.mock('@/shared/api/client', () => ({
  apiClient: {
    get: apiGet,
    post: apiPost,
  },
}))

describe('repro_task_T052 canonical edge contract', () => {
  beforeEach(() => {
    apiGet.mockReset()
    apiPost.mockReset()
  })

  it('supports canonical admin/user fleet fetchers, persistent credential disclosures, and ping snapshots', async () => {
    const edgeServersApi = await import('@/shared/api/edgeServers')

    expect(typeof edgeServersApi.getAdminEdgeFleet).toBe('function')
    expect(typeof edgeServersApi.getAssignedEdgeServers).toBe('function')
    expect(typeof edgeServersApi.rotateEdgeServerCredential).toBe('function')
    expect(typeof edgeServersApi.unblockEdgeServer).toBe('function')
    expect(typeof edgeServersApi.getEdgeServerPingSnapshot).toBe('function')
    expect('getEdgeServers' in edgeServersApi).toBe(false)
    expect('getTrustedEdgeServers' in edgeServersApi).toBe(false)
    expect('registerEdgeServer' in edgeServersApi).toBe(false)

    apiGet.mockResolvedValueOnce([
      {
        _id: 'edge-admin-1',
        name: 'Admin Edge',
        lifecycleState: 'Active',
        availability: { online: false, lastSeenAt: null },
        trustedUsers: [{ _id: 'user-1', email: 'user@example.com' }],
        createdBy: { _id: 'admin-1', email: 'admin@example.com' },
        persistentCredentialVersion: 3,
        lastLifecycleEventAt: '2026-04-15T12:00:00.000Z',
      },
    ])

    await expect(edgeServersApi.getAdminEdgeFleet()).resolves.toEqual([
      {
        _id: 'edge-admin-1',
        name: 'Admin Edge',
        lifecycleState: 'Active',
        availability: { online: false, lastSeenAt: null },
        trustedUsers: [{ _id: 'user-1', email: 'user@example.com' }],
        createdBy: { _id: 'admin-1', email: 'admin@example.com' },
        persistentCredentialVersion: 3,
        lastLifecycleEventAt: '2026-04-15T12:00:00.000Z',
      },
    ])

    apiGet.mockResolvedValueOnce([
      {
        _id: 'edge-user-1',
        name: 'Assigned Active Edge',
        lifecycleState: 'Active',
        availability: { online: true, lastSeenAt: '2026-04-15T12:05:00.000Z' },
      },
      {
        _id: 'edge-user-2',
        name: 'Assigned Blocked Edge',
        lifecycleState: 'Blocked',
        availability: { online: false, lastSeenAt: '2026-04-15T11:55:00.000Z' },
      },
    ])

    await expect(edgeServersApi.getAssignedEdgeServers()).resolves.toEqual([
      {
        _id: 'edge-user-1',
        name: 'Assigned Active Edge',
        lifecycleState: 'Active',
        availability: { online: true, lastSeenAt: '2026-04-15T12:05:00.000Z' },
      },
      {
        _id: 'edge-user-2',
        name: 'Assigned Blocked Edge',
        lifecycleState: 'Blocked',
        availability: { online: false, lastSeenAt: '2026-04-15T11:55:00.000Z' },
      },
    ])

    apiPost.mockResolvedValueOnce({
      edge: {
        _id: 'edge-register-1',
        name: 'Registered Edge',
        lifecycleState: 'Active',
        availability: { online: false, lastSeenAt: null },
        trustedUsers: [],
        createdBy: { _id: 'admin-1', email: 'admin@example.com' },
        persistentCredentialVersion: 1,
        lastLifecycleEventAt: '2026-04-15T12:10:00.000Z',
      },
      persistentCredential: {
        edgeId: 'edge-register-1',
        credentialSecret: 'persist-secret-1',
        version: 1,
        issuedAt: '2026-04-15T12:10:00.000Z',
        instructions:
          'Use this secret as the edge runtime persistent credential for trusted connects and reconnects.',
      },
    })

    await expect(edgeServersApi.registerAdminEdgeServer({ name: 'Registered Edge' })).resolves.toEqual({
      edge: {
        _id: 'edge-register-1',
        name: 'Registered Edge',
        lifecycleState: 'Active',
        availability: { online: false, lastSeenAt: null },
        trustedUsers: [],
        createdBy: { _id: 'admin-1', email: 'admin@example.com' },
        persistentCredentialVersion: 1,
        lastLifecycleEventAt: '2026-04-15T12:10:00.000Z',
      },
      persistentCredential: {
        edgeId: 'edge-register-1',
        credentialSecret: 'persist-secret-1',
        version: 1,
        issuedAt: '2026-04-15T12:10:00.000Z',
        instructions:
          'Use this secret as the edge runtime persistent credential for trusted connects and reconnects.',
      },
    })

    apiGet.mockResolvedValueOnce({
      lifecycleState: 'Blocked',
      availability: { online: false, lastSeenAt: '2026-04-15T12:11:00.000Z' },
    })

    await expect(edgeServersApi.getEdgeServerPingSnapshot('edge-register-1')).resolves.toEqual({
      lifecycleState: 'Blocked',
      availability: { online: false, lastSeenAt: '2026-04-15T12:11:00.000Z' },
    })
  })
})
