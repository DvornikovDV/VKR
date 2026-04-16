import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTelemetryStore } from '@/shared/store/useTelemetryStore'
import {
  loadCanonicalEdgeStatusRestSnapshots,
  type EdgeStatusScope,
} from '@/shared/hooks/edgeStatusRest'

interface UseEdgeStatusOptions {
  edgeIds?: string[]
  fallbackPollMs?: number
  scope?: EdgeStatusScope
}

export interface EdgeStatusSnapshot {
  online: boolean | null
  lastSeenAt: string | null
}

interface UseEdgeStatusResult {
  edgeStatusById: Record<string, boolean>
  edgeSnapshotById: Record<string, EdgeStatusSnapshot>
  loading: boolean
  error: string | null
  isOnline: (edgeId: string) => boolean
  getSnapshot: (edgeId: string) => EdgeStatusSnapshot
  refresh: () => Promise<void>
}

const UNKNOWN_SNAPSHOT: EdgeStatusSnapshot = {
  online: null,
  lastSeenAt: null,
}

export function useEdgeStatus(options: UseEdgeStatusOptions = {}): UseEdgeStatusResult {
  const { edgeIds, fallbackPollMs = 5000, scope = 'auto' } = options
  const wsEdgeStatusById = useTelemetryStore((state) => state.edgeStatusById)
  const wsConnected = useTelemetryStore((state) => state.isConnected)
  const edgeIdsKey = edgeIds?.join('|') ?? ''

  const [restEdgeSnapshotById, setRestEdgeSnapshotById] = useState<Record<string, EdgeStatusSnapshot>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchRestSnapshots = useCallback(async (): Promise<Record<string, EdgeStatusSnapshot>> => {
    return loadCanonicalEdgeStatusRestSnapshots({ edgeIds, scope })
  }, [edgeIdsKey, scope])

  const refresh = useCallback(async () => {
    setError(null)

    try {
      const snapshots = await fetchRestSnapshots()
      setRestEdgeSnapshotById(snapshots)
    } catch {
      const modeLabel =
        scope === 'admin'
          ? 'admin availability snapshots'
          : scope === 'trusted'
            ? 'assigned edge list'
            : 'REST fallback'
      setError(`Failed to refresh edge status from ${modeLabel}.`)
    } finally {
      setLoading(false)
    }
  }, [fetchRestSnapshots, scope])

  useEffect(() => {
    setLoading(true)
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (wsConnected) {
      return
    }

    const timer = setInterval(() => {
      void refresh()
    }, fallbackPollMs)

    return () => {
      clearInterval(timer)
    }
  }, [fallbackPollMs, refresh, wsConnected])

  const edgeSnapshotById = useMemo(() => {
    const merged: Record<string, EdgeStatusSnapshot> = {}

    for (const [edgeId, snapshot] of Object.entries(restEdgeSnapshotById)) {
      merged[edgeId] = {
        online: snapshot.online,
        lastSeenAt: snapshot.lastSeenAt,
      }
    }

    for (const [edgeId, online] of Object.entries(wsEdgeStatusById)) {
      const previous = merged[edgeId] ?? UNKNOWN_SNAPSHOT
      merged[edgeId] = {
        online,
        lastSeenAt: previous.lastSeenAt,
      }
    }

    if (!edgeIds || edgeIds.length === 0) {
      return merged
    }

    const filtered: Record<string, EdgeStatusSnapshot> = {}
    for (const edgeId of edgeIds) {
      filtered[edgeId] = merged[edgeId] ?? UNKNOWN_SNAPSHOT
    }

    return filtered
  }, [edgeIds, restEdgeSnapshotById, wsEdgeStatusById])

  const edgeStatusById = useMemo(() => {
    const legacy: Record<string, boolean> = {}
    for (const [edgeId, snapshot] of Object.entries(edgeSnapshotById)) {
      legacy[edgeId] = snapshot.online === true
    }
    return legacy
  }, [edgeSnapshotById])

  const getSnapshot = useCallback(
    (edgeId: string): EdgeStatusSnapshot => edgeSnapshotById[edgeId] ?? UNKNOWN_SNAPSHOT,
    [edgeSnapshotById],
  )

  const isOnline = useCallback(
    (edgeId: string): boolean => getSnapshot(edgeId).online === true,
    [getSnapshot],
  )

  return {
    edgeStatusById,
    edgeSnapshotById,
    loading,
    error,
    isOnline,
    getSnapshot,
    refresh,
  }
}
