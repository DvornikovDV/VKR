import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as edgeServersApi from '@/shared/api/edgeServers'

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
  blockAdminEdgeServer,
  getAdminEdgeFleet,
  getAssignedEdgeServers,
  getEdgeServerCatalog,
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

  it('exposes only canonical edge API exports and calls canonical lifecycle endpoints', async () => {
    const disclosure = {
      edge: {
        _id: 'edge-1',
        name: 'Edge Alpha',
        lifecycleState: 'Active' as const,
        availability: { online: false, lastSeenAt: null },
        trustedUsers: [],
        createdBy: null,
        persistentCredentialVersion: 1,
        lastLifecycleEventAt: '2026-04-15T12:10:00.000Z',
      },
      persistentCredential: {
        edgeId: 'edge-1',
        credentialSecret: 'persistent-secret',
        version: 1,
        issuedAt: '2026-04-15T12:10:00.000Z',
        instructions: 'Use this secret as the edge runtime persistent credential.',
      },
    }
    const blockedEdge = {
      _id: 'edge-1',
      name: 'Edge Alpha',
      lifecycleState: 'Blocked' as const,
      availability: { online: false, lastSeenAt: null },
      trustedUsers: [],
      createdBy: null,
      persistentCredentialVersion: 1,
      lastLifecycleEventAt: '2026-04-15T12:11:00.000Z',
    }
    const blockedResponse = {
      edge: blockedEdge,
    }

    expect(typeof edgeServersApi.getAdminEdgeFleet).toBe('function')
    expect(typeof edgeServersApi.getAssignedEdgeServers).toBe('function')
    expect(typeof edgeServersApi.registerAdminEdgeServer).toBe('function')
    expect(typeof edgeServersApi.rotateEdgeServerCredential).toBe('function')
    expect(typeof edgeServersApi.blockAdminEdgeServer).toBe('function')
    expect(typeof edgeServersApi.unblockEdgeServer).toBe('function')
    expect(typeof edgeServersApi.getEdgeServerPingSnapshot).toBe('function')
    expect('getEdgeServers' in edgeServersApi).toBe(false)
    expect('getTrustedEdgeServers' in edgeServersApi).toBe(false)
    expect('registerEdgeServer' in edgeServersApi).toBe(false)

    apiPost.mockResolvedValueOnce(disclosure)
    apiPost.mockResolvedValueOnce(disclosure)
    apiPost.mockResolvedValueOnce(blockedResponse)
    apiPost.mockResolvedValueOnce(disclosure)

    await registerAdminEdgeServer({ name: 'Edge Alpha' })
    await rotateEdgeServerCredential('edge-1')
    await expect(blockAdminEdgeServer('edge-1')).resolves.toEqual(blockedEdge)
    await unblockEdgeServer('edge-1')

    expect(apiPost).toHaveBeenNthCalledWith(1, '/edge-servers', { name: 'Edge Alpha' })
    expect(apiPost).toHaveBeenNthCalledWith(2, '/edge-servers/edge-1/rotate-credential')
    expect(apiPost).toHaveBeenNthCalledWith(3, '/edge-servers/edge-1/block')
    expect(apiPost).toHaveBeenNthCalledWith(4, '/edge-servers/edge-1/unblock')
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

  it('normalizes edge catalog snapshot object with telemetry and commands (T022)', async () => {
    apiGet.mockResolvedValueOnce({
      edgeServerId: 'edge-1',
      telemetry: [
        {
          deviceId: 'boiler-1',
          metric: 'temperature',
          valueType: 'number',
          label: 'Boiler temperature',
        },
      ],
      commands: [
        {
          deviceId: 'boiler-1',
          commandType: 'set_number',
          valueType: 'number',
          min: 20,
          max: 80,
          reportedMetric: 'temperature',
          label: 'Set boiler temperature',
        },
      ],
    })

    await expect(getEdgeServerCatalog('edge-1')).resolves.toEqual({
      edgeServerId: 'edge-1',
      telemetry: [
        {
          deviceId: 'boiler-1',
          metric: 'temperature',
          valueType: 'number',
          label: 'Boiler temperature',
        },
      ],
      commands: [
        {
          deviceId: 'boiler-1',
          commandType: 'set_number',
          valueType: 'number',
          min: 20,
          max: 80,
          reportedMetric: 'temperature',
          label: 'Set boiler temperature',
        },
      ],
    })
  })

  it('maps legacy row-array catalog only into telemetry and empty commands during rollout', async () => {
    apiGet.mockResolvedValueOnce([
      {
        edgeServerId: 'edge-legacy',
        deviceId: 'boiler-1',
        metric: 'temperature',
        label: 'Boiler temperature',
      },
      {
        edgeServerId: 'edge-legacy',
        deviceId: 'boiler-2',
        metric: 'pressure',
        label: '',
      },
    ])

    await expect(getEdgeServerCatalog('edge-fallback')).resolves.toEqual({
      edgeServerId: 'edge-legacy',
      telemetry: [
        {
          deviceId: 'boiler-1',
          metric: 'temperature',
          label: 'Boiler temperature',
        },
        {
          deviceId: 'boiler-2',
          metric: 'pressure',
          label: 'boiler-2 / pressure',
        },
      ],
      commands: [],
    })
  })
})
