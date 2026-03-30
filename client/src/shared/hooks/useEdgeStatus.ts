import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  getEdgeServers,
  getTrustedEdgeServers,
  type AdminEdgeServer,
  type TrustedEdgeServer,
} from '@/shared/api/edgeServers'
import { useTelemetryStore } from '@/shared/store/useTelemetryStore'

export type EdgeStatusScope = 'auto' | 'admin' | 'trusted'

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

function normalizeEdgeSnapshots(
  rows: Array<AdminEdgeServer | TrustedEdgeServer>,
): Record<string, EdgeStatusSnapshot> {
  const map: Record<string, EdgeStatusSnapshot> = {}

  for (const row of rows) {
    map[row._id] = {
      online: Boolean(row.availability.online),
      lastSeenAt: row.availability.lastSeenAt,
    }
  }

  return map
}

export function useEdgeStatus(options: UseEdgeStatusOptions = {}): UseEdgeStatusResult {
  const { edgeIds, fallbackPollMs = 5000, scope = 'auto' } = options
  const wsEdgeStatusById = useTelemetryStore((state) => state.edgeStatusById)
  const wsConnected = useTelemetryStore((state) => state.isConnected)

  const [restEdgeSnapshotById, setRestEdgeSnapshotById] = useState<Record<string, EdgeStatusSnapshot>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchRestSnapshots = useCallback(async (): Promise<Record<string, EdgeStatusSnapshot>> => {
    if (scope === 'admin') {
      const rows = await getEdgeServers()
      return normalizeEdgeSnapshots(rows)
    }

    if (scope === 'trusted') {
      const rows = await getTrustedEdgeServers()
      return normalizeEdgeSnapshots(rows)
    }

    try {
      const rows = await getEdgeServers()
      return normalizeEdgeSnapshots(rows)
    } catch {
      const rows = await getTrustedEdgeServers()
      return normalizeEdgeSnapshots(rows)
    }
  }, [scope])

  const refresh = useCallback(async () => {
    setError(null)

    try {
      const snapshots = await fetchRestSnapshots()
      setRestEdgeSnapshotById(snapshots)
    } catch {
      const modeLabel =
        scope === 'admin'
          ? 'admin fleet'
          : scope === 'trusted'
            ? 'trusted edge list'
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
