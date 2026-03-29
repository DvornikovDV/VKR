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
  getDashboardTrustedEdgeServers,
  getEdgeServers,
  getTrustedEdgeServers,
  registerEdgeServer,
} from '@/shared/api/edgeServers'

describe('edgeServers normalization (T034)', () => {
  beforeEach(() => {
    apiGet.mockReset()
    apiPost.mockReset()
    apiDelete.mockReset()
  })

  it('filters trusted edges strictly by canonical Active lifecycle state', async () => {
    apiGet.mockResolvedValueOnce([
      {
        _id: 'edge-legacy',
        name: 'Legacy Active Flag',
        isActive: true,
        availability: { online: true, lastSeenAt: null },
      },
      {
        _id: 'edge-blocked',
        name: 'Blocked Edge',
        lifecycleState: 'Blocked',
        availability: { online: true, lastSeenAt: null },
      },
      {
        _id: 'edge-active',
        name: 'Active Edge',
        lifecycleState: 'Active',
        availability: { online: false, lastSeenAt: '2026-03-29T00:00:00.000Z' },
      },
    ])

    const trusted = await getTrustedEdgeServers()

    expect(trusted).toEqual([
      {
        _id: 'edge-active',
        name: 'Active Edge',
        lifecycleState: 'Active',
        isTelemetryReady: true,
        availability: { online: false, lastSeenAt: '2026-03-29T00:00:00.000Z' },
        isActive: true,
        lastSeen: '2026-03-29T00:00:00.000Z',
      },
    ])
  })

  it('applies the same strict Active-only filtering for dashboard trusted edges', async () => {
    apiGet.mockResolvedValueOnce([
      {
        _id: 'edge-pending',
        name: 'Pending Edge',
        lifecycleState: 'Pending First Connection',
        availability: { online: false, lastSeenAt: null },
      },
      {
        _id: 'edge-active-dashboard',
        name: 'Dashboard Active Edge',
        lifecycleState: 'Active',
        availability: { online: true, lastSeenAt: '2026-03-29T00:30:00.000Z' },
      },
    ])

    const trusted = await getDashboardTrustedEdgeServers()

    expect(trusted).toEqual([
      {
        _id: 'edge-active-dashboard',
        name: 'Dashboard Active Edge',
        lifecycleState: 'Active',
        isTelemetryReady: true,
        availability: { online: true, lastSeenAt: '2026-03-29T00:30:00.000Z' },
        isActive: true,
        lastSeen: '2026-03-29T00:30:00.000Z',
      },
    ])
  })

  it('normalizes mixed admin payloads into lifecycle-aware DTOs', async () => {
    apiGet.mockResolvedValueOnce([
      {
        _id: 'edge-legacy-admin',
        name: 'Legacy Admin Edge',
        isActive: true,
        availability: { online: true, lastSeenAt: '2026-03-29T01:00:00.000Z' },
      },
      {
        _id: 'edge-canonical-admin',
        name: 'Canonical Admin Edge',
        lifecycleState: 'Re-onboarding Required',
        isTelemetryReady: false,
        availability: { online: false, lastSeenAt: null },
        trustedUsers: [],
        createdBy: null,
        currentOnboardingPackage: null,
        persistentCredentialVersion: 2,
        lastLifecycleEventAt: '2026-03-29T01:05:00.000Z',
      },
    ])

    const adminFleet = await getEdgeServers()

    expect(adminFleet[0]).toMatchObject({
      _id: 'edge-legacy-admin',
      lifecycleState: 'Active',
      isTelemetryReady: true,
      isActive: true,
      lastSeen: '2026-03-29T01:00:00.000Z',
      trustedUsers: [],
      createdBy: null,
      currentOnboardingPackage: null,
      persistentCredentialVersion: null,
      lastLifecycleEventAt: null,
    })

    expect(adminFleet[1]).toMatchObject({
      _id: 'edge-canonical-admin',
      lifecycleState: 'Re-onboarding Required',
      isTelemetryReady: false,
      persistentCredentialVersion: 2,
    })
  })

  it('normalizes disclosure response edge into strict AdminEdgeServer shape', async () => {
    apiPost.mockResolvedValueOnce({
      edge: {
        _id: 'edge-register-1',
        name: 'Register Edge',
        lifecycleState: 'Pending First Connection',
        isTelemetryReady: false,
        availability: { online: false, lastSeenAt: null },
      },
      onboardingPackage: {
        edgeId: 'edge-register-1',
        onboardingSecret: 'secret',
        issuedAt: '2026-03-29T02:00:00.000Z',
        expiresAt: '2026-03-30T02:00:00.000Z',
        instructions: 'Use once',
      },
    })

    const disclosure = await registerEdgeServer({ name: 'Register Edge' })

    expect(disclosure.edge).toMatchObject({
      _id: 'edge-register-1',
      lifecycleState: 'Pending First Connection',
      isTelemetryReady: false,
      isActive: false,
      trustedUsers: [],
      createdBy: null,
      currentOnboardingPackage: null,
      persistentCredentialVersion: null,
      lastLifecycleEventAt: null,
    })
  })
})
