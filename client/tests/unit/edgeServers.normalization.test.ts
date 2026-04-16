import { beforeEach, describe, expect, it, vi } from 'vitest'

const { apiGet, apiPost, apiDelete } = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiDelete: vi.fn(),
}))

vi.mock('@/shared/api/client', () => ({
  apiClient: {
    get: apiGet,
    post: apiPost,
    delete: apiDelete,
  },
}))

import {
  bindEdgeServer,
  getAdminEdgeFleet,
  getAssignedEdgeServers,
  getEdgeServerPingSnapshot,
  registerAdminEdgeServer,
  revokeEdgeServerAccess,
  rotateEdgeServerCredential,
  unblockEdgeServer,
} from '@/shared/api/edgeServers'

describe('edgeServers canonical normalization (T052)', () => {
  beforeEach(() => {
    apiGet.mockReset()
    apiPost.mockReset()
    apiDelete.mockReset()
  })

  it('keeps only canonical Active | Blocked rows for assigned edges', async () => {
    apiGet.mockResolvedValueOnce([
      {
        _id: 'edge-missing-lifecycle',
        name: 'Invalid Edge',
        availability: { online: true, lastSeenAt: null },
      },
      {
        _id: 'edge-active',
        name: 'Active Edge',
        lifecycleState: 'Active',
        availability: { online: true, lastSeenAt: '2026-04-15T12:00:00.000Z' },
      },
      {
        _id: 'edge-blocked',
        name: 'Blocked Edge',
        lifecycleState: 'Blocked',
        availability: { online: false, lastSeenAt: '2026-04-15T11:55:00.000Z' },
      },
    ])

    await expect(getAssignedEdgeServers()).resolves.toEqual([
      {
        _id: 'edge-active',
        name: 'Active Edge',
        lifecycleState: 'Active',
        availability: { online: true, lastSeenAt: '2026-04-15T12:00:00.000Z' },
      },
      {
        _id: 'edge-blocked',
        name: 'Blocked Edge',
        lifecycleState: 'Blocked',
        availability: { online: false, lastSeenAt: '2026-04-15T11:55:00.000Z' },
      },
    ])
  })

  it('drops non-canonical admin fleet payloads', async () => {
    apiGet.mockResolvedValueOnce([
      {
        _id: 'edge-invalid-admin',
        name: 'Invalid Admin Edge',
        lifecycleState: 'Pending First Connection',
        availability: { online: false, lastSeenAt: null },
      },
      {
        _id: 'edge-admin-active',
        name: 'Canonical Admin Edge',
        lifecycleState: 'Active',
        availability: { online: false, lastSeenAt: null },
        trustedUsers: [],
        createdBy: null,
        persistentCredentialVersion: 2,
        lastLifecycleEventAt: '2026-04-15T12:05:00.000Z',
      },
    ])

    await expect(getAdminEdgeFleet()).resolves.toEqual([
      {
        _id: 'edge-admin-active',
        name: 'Canonical Admin Edge',
        lifecycleState: 'Active',
        availability: { online: false, lastSeenAt: null },
        trustedUsers: [],
        createdBy: null,
        persistentCredentialVersion: 2,
        lastLifecycleEventAt: '2026-04-15T12:05:00.000Z',
      },
    ])
  })

  it('normalizes credential disclosure responses for register, rotate, and unblock', async () => {
    const disclosure = {
      edge: {
        _id: 'edge-1',
        name: 'Edge Alpha',
        lifecycleState: 'Active',
        availability: { online: false, lastSeenAt: null },
        trustedUsers: [],
        createdBy: { _id: 'admin-1', email: 'admin@example.com' },
        persistentCredentialVersion: 4,
        lastLifecycleEventAt: '2026-04-15T12:10:00.000Z',
      },
      persistentCredential: {
        edgeId: 'edge-1',
        credentialSecret: 'persistent-secret',
        version: 4,
        issuedAt: '2026-04-15T12:10:00.000Z',
        instructions: 'Use this secret as the edge runtime persistent credential.',
      },
    }

    apiPost.mockResolvedValueOnce(disclosure)
    apiPost.mockResolvedValueOnce(disclosure)
    apiPost.mockResolvedValueOnce(disclosure)

    await expect(registerAdminEdgeServer({ name: 'Edge Alpha' })).resolves.toEqual(disclosure)
    await expect(rotateEdgeServerCredential('edge-1')).resolves.toEqual(disclosure)
    await expect(unblockEdgeServer('edge-1')).resolves.toEqual(disclosure)
  })

  it('normalizes ping snapshots and assignment endpoints on canonical paths', async () => {
    apiGet.mockResolvedValueOnce({
      lifecycleState: 'Blocked',
      availability: { online: false, lastSeenAt: '2026-04-15T12:15:00.000Z' },
    })
    apiPost.mockResolvedValueOnce({
      _id: 'edge-1',
      name: 'Edge Alpha',
      lifecycleState: 'Active',
      availability: { online: true, lastSeenAt: '2026-04-15T12:15:00.000Z' },
      trustedUsers: [{ _id: 'user-1', email: 'user@example.com' }],
      createdBy: null,
      persistentCredentialVersion: 4,
      lastLifecycleEventAt: '2026-04-15T12:15:00.000Z',
    })
    apiDelete.mockResolvedValueOnce({
      _id: 'edge-1',
      name: 'Edge Alpha',
      lifecycleState: 'Active',
      availability: { online: true, lastSeenAt: '2026-04-15T12:15:00.000Z' },
      trustedUsers: [],
      createdBy: null,
      persistentCredentialVersion: 4,
      lastLifecycleEventAt: '2026-04-15T12:15:00.000Z',
    })

    await expect(getEdgeServerPingSnapshot('edge-1')).resolves.toEqual({
      lifecycleState: 'Blocked',
      availability: { online: false, lastSeenAt: '2026-04-15T12:15:00.000Z' },
    })
    await expect(bindEdgeServer('edge-1', { userId: 'user-1' })).resolves.toEqual({
      _id: 'edge-1',
      name: 'Edge Alpha',
      lifecycleState: 'Active',
      availability: { online: true, lastSeenAt: '2026-04-15T12:15:00.000Z' },
      trustedUsers: [{ _id: 'user-1', email: 'user@example.com' }],
      createdBy: null,
      persistentCredentialVersion: 4,
      lastLifecycleEventAt: '2026-04-15T12:15:00.000Z',
    })
    await expect(revokeEdgeServerAccess('edge-1', 'user-1')).resolves.toEqual({
      _id: 'edge-1',
      name: 'Edge Alpha',
      lifecycleState: 'Active',
      availability: { online: true, lastSeenAt: '2026-04-15T12:15:00.000Z' },
      trustedUsers: [],
      createdBy: null,
      persistentCredentialVersion: 4,
      lastLifecycleEventAt: '2026-04-15T12:15:00.000Z',
    })
  })
})
