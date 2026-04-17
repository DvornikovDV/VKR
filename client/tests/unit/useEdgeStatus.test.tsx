import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useEdgeStatus } from '@/shared/hooks/useEdgeStatus'
import { useTelemetryStore } from '@/shared/store/useTelemetryStore'

const { getEdgeServerPingSnapshotMock, getAssignedEdgeServersMock } = vi.hoisted(() => ({
  getEdgeServerPingSnapshotMock: vi.fn(),
  getAssignedEdgeServersMock: vi.fn(),
}))

vi.mock('@/shared/api/edgeServers', () => ({
  getAssignedEdgeServers: getAssignedEdgeServersMock,
  getEdgeServerPingSnapshot: getEdgeServerPingSnapshotMock,
}))

describe('useEdgeStatus normalization (T034)', () => {
  beforeEach(() => {
    getEdgeServerPingSnapshotMock.mockReset()
    getAssignedEdgeServersMock.mockReset()
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

  it('falls back to assigned edge list when admin ping snapshots fail', async () => {
    getEdgeServerPingSnapshotMock.mockRejectedValueOnce(new Error('403 forbidden'))
    getAssignedEdgeServersMock.mockResolvedValueOnce([
      {
        _id: 'edge-1',
        name: 'Trusted One',
        lifecycleState: 'Active',
        availability: { online: true, lastSeenAt: null },
      },
    ])

    const { result } = renderHook(() => useEdgeStatus({ edgeIds: ['edge-1'] }))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.error).toBeNull()
    expect(result.current.isOnline('edge-1')).toBe(true)
    expect(result.current.getSnapshot('edge-1')).toEqual({
      online: true,
      lastSeenAt: null,
    })
  })

  it('prefers websocket edge status over REST fallback status', async () => {
    getEdgeServerPingSnapshotMock.mockResolvedValueOnce({
      lifecycleState: 'Active',
      availability: { online: true, lastSeenAt: null },
    })

    useTelemetryStore.setState({
      isConnected: true,
      edgeStatusById: { 'edge-2': false },
    })

    const { result } = renderHook(() => useEdgeStatus({ edgeIds: ['edge-2'] }))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.isOnline('edge-2')).toBe(false)
    expect(result.current.getSnapshot('edge-2')).toEqual({
      online: false,
      lastSeenAt: null,
    })
  })

  it('uses trusted scope without probing admin fleet endpoint', async () => {
    getAssignedEdgeServersMock.mockResolvedValueOnce([
      {
        _id: 'edge-3',
        name: 'Trusted Scope',
        lifecycleState: 'Active',
        availability: { online: true, lastSeenAt: '2026-03-29T08:00:00.000Z' },
      },
    ])

    const { result } = renderHook(() =>
      useEdgeStatus({ edgeIds: ['edge-3'], scope: 'trusted' }),
    )

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(getEdgeServerPingSnapshotMock).not.toHaveBeenCalled()
    expect(result.current.getSnapshot('edge-3')).toEqual({
      online: true,
      lastSeenAt: '2026-03-29T08:00:00.000Z',
    })
  })

  it('uses canonical admin ping snapshots instead of assigned edge fallback heuristics', async () => {
    getEdgeServerPingSnapshotMock.mockImplementation(async (edgeId: string) => {
      if (edgeId === 'edge-1') {
        return {
          lifecycleState: 'Active',
          availability: { online: true, lastSeenAt: '2026-04-15T12:20:00.000Z' },
        }
      }

      return {
        lifecycleState: 'Blocked',
        availability: { online: false, lastSeenAt: '2026-04-15T12:21:00.000Z' },
      }
    })

    const { result } = renderHook(() =>
      useEdgeStatus({ edgeIds: ['edge-1', 'edge-2'], scope: 'admin' }),
    )

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(getAssignedEdgeServersMock).not.toHaveBeenCalled()
    expect(getEdgeServerPingSnapshotMock).toHaveBeenCalledTimes(2)
    expect(result.current.getSnapshot('edge-1')).toEqual({
      online: true,
      lastSeenAt: '2026-04-15T12:20:00.000Z',
    })
    expect(result.current.getSnapshot('edge-2')).toEqual({
      online: false,
      lastSeenAt: '2026-04-15T12:21:00.000Z',
    })
  })

  it('returns unknown snapshot when both REST sources fail', async () => {
    getEdgeServerPingSnapshotMock.mockRejectedValueOnce(new Error('admin down'))
    getAssignedEdgeServersMock.mockRejectedValueOnce(new Error('trusted down'))

    const { result } = renderHook(() => useEdgeStatus({ edgeIds: ['edge-unknown'] }))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.error).toContain('Failed to refresh edge status')
    expect(result.current.getSnapshot('edge-unknown')).toEqual({
      online: null,
      lastSeenAt: null,
    })
    expect(result.current.isOnline('edge-unknown')).toBe(false)
  })
})
