import { useCallback, useEffect, useMemo, useState } from 'react'
import { getEdgeServers, getTrustedEdgeServers } from '@/shared/api/edgeServers'
import { useTelemetryStore } from '@/shared/store/useTelemetryStore'

interface EdgeServerStatusDto {
  _id?: string
  id?: string
  edgeId?: string
  isOnline?: boolean
  online?: boolean
  availability?: {
    online?: boolean
    lastSeenAt?: string | null
  } | null
}

interface UseEdgeStatusOptions {
  edgeIds?: string[]
  fallbackPollMs?: number
}

interface UseEdgeStatusResult {
  edgeStatusById: Record<string, boolean>
  loading: boolean
  error: string | null
  isOnline: (edgeId: string) => boolean
  refresh: () => Promise<void>
}

function normalizeEdgeStatus(rows: EdgeServerStatusDto[]): Record<string, boolean> {
  const map: Record<string, boolean> = {}

  for (const row of rows) {
    const id = row._id ?? row.id ?? row.edgeId
    if (!id) {
      continue
    }

    const online =
      typeof row.availability?.online === 'boolean'
        ? row.availability.online
        : row.isOnline ?? row.online ?? false

    map[id] = Boolean(online)
  }

  return map
}

export function useEdgeStatus(options: UseEdgeStatusOptions = {}): UseEdgeStatusResult {
  const { edgeIds, fallbackPollMs = 5000 } = options
  const wsEdgeStatusById = useTelemetryStore((state) => state.edgeStatusById)
  const wsConnected = useTelemetryStore((state) => state.isConnected)

  const [restEdgeStatusById, setRestEdgeStatusById] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setError(null)

    try {
      const rows = await getEdgeServers()
      setRestEdgeStatusById(normalizeEdgeStatus(rows))
    } catch {
      try {
        const rows = await getTrustedEdgeServers()
        setRestEdgeStatusById(normalizeEdgeStatus(rows))
      } catch {
        setError('Failed to refresh edge status from REST fallback.')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
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

  const edgeStatusById = useMemo(() => {
    const merged = { ...restEdgeStatusById, ...wsEdgeStatusById }

    if (!edgeIds || edgeIds.length === 0) {
      return merged
    }

    const filtered: Record<string, boolean> = {}
    for (const edgeId of edgeIds) {
      filtered[edgeId] = Boolean(merged[edgeId])
    }

    return filtered
  }, [edgeIds, restEdgeStatusById, wsEdgeStatusById])

  const isOnline = useCallback(
    (edgeId: string): boolean => Boolean(edgeStatusById[edgeId]),
    [edgeStatusById],
  )

  return {
    edgeStatusById,
    loading,
    error,
    isOnline,
    refresh,
  }
}
