import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useTelemetryStore } from '@/shared/store/useTelemetryStore'

const {
  getAssignedEdgeServersMock,
  getEdgeServerPingSnapshotMock,
} = vi.hoisted(() => ({
  getAssignedEdgeServersMock: vi.fn(),
  getEdgeServerPingSnapshotMock: vi.fn(),
}))

vi.mock('@/shared/api/edgeServers', () => ({
  getAssignedEdgeServers: getAssignedEdgeServersMock,
  getEdgeServerPingSnapshot: getEdgeServerPingSnapshotMock,
}))

import { useEdgeStatus } from '@/shared/hooks/useEdgeStatus'

describe('repro_task_T053 canonical admin edge snapshots', () => {
  beforeEach(() => {
    getAssignedEdgeServersMock.mockReset()
    getEdgeServerPingSnapshotMock.mockReset()

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

  it('uses canonical ping snapshots for admin scope instead of fleet-level fallback heuristics', async () => {
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
})
