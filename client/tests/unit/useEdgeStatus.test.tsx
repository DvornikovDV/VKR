import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useEdgeStatus } from '@/shared/hooks/useEdgeStatus'
import { useTelemetryStore } from '@/shared/store/useTelemetryStore'

const { getEdgeServersMock, getTrustedEdgeServersMock } = vi.hoisted(() => ({
  getEdgeServersMock: vi.fn(),
  getTrustedEdgeServersMock: vi.fn(),
}))

vi.mock('@/shared/api/edgeServers', () => ({
  getEdgeServers: getEdgeServersMock,
  getTrustedEdgeServers: getTrustedEdgeServersMock,
}))

describe('useEdgeStatus normalization (T034)', () => {
  beforeEach(() => {
    getEdgeServersMock.mockReset()
    getTrustedEdgeServersMock.mockReset()
    useTelemetryStore.setState({
      isConnected: false,
      edgeStatusById: {},
      latestValues: {},
      subscribedEdgeId: null,
      subscribedDiagramId: null,
      reconnectAttempt: 0,
      nextRetryDelayMs: null,
    })
  })

  it('falls back to trusted edge list when admin fleet endpoint fails', async () => {
    getEdgeServersMock.mockRejectedValueOnce(new Error('403 forbidden'))
    getTrustedEdgeServersMock.mockResolvedValueOnce([
      {
        _id: 'edge-1',
        name: 'Trusted One',
        lifecycleState: 'Active',
        isTelemetryReady: true,
        availability: { online: true, lastSeenAt: null },
      },
    ])

    const { result } = renderHook(() => useEdgeStatus({ edgeIds: ['edge-1'] }))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.error).toBeNull()
    expect(result.current.isOnline('edge-1')).toBe(true)
  })

  it('prefers websocket edge status over REST fallback status', async () => {
    getEdgeServersMock.mockResolvedValueOnce([
      {
        _id: 'edge-2',
        name: 'REST Online',
        lifecycleState: 'Active',
        isTelemetryReady: true,
        availability: { online: true, lastSeenAt: null },
        trustedUsers: [],
        createdBy: null,
        currentOnboardingPackage: null,
        persistentCredentialVersion: null,
        lastLifecycleEventAt: null,
      },
    ])

    useTelemetryStore.setState({
      isConnected: true,
      edgeStatusById: { 'edge-2': false },
    })

    const { result } = renderHook(() => useEdgeStatus({ edgeIds: ['edge-2'] }))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.isOnline('edge-2')).toBe(false)
  })
})
