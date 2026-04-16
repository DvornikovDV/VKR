import { useCallback, useEffect, useMemo, useState } from 'react'
import { getAssignedEdgeServers, type AssignedEdgeServer } from '@/shared/api/edgeServers'
import { useEdgeStatus } from '@/shared/hooks/useEdgeStatus'

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }

  return fallback
}

function formatUtcTimestamp(value: string | null | undefined): string {
  if (!value) {
    return 'No heartbeat yet'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return 'Unknown timestamp'
  }

  return `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`
}

export function MyEquipmentPage() {
  const [assignedEdges, setAssignedEdges] = useState<AssignedEdgeServer[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const edgeIds = useMemo(() => assignedEdges.map((edge) => edge._id), [assignedEdges])
  const {
    error: statusError,
    getSnapshot,
    refresh: refreshEdgeStatus,
  } = useEdgeStatus({ edgeIds, scope: 'trusted' })

  const loadAssignedEdges = useCallback(async () => {
    setError(null)

    try {
      const rows = await getAssignedEdgeServers()
      setAssignedEdges(rows)
    } catch (loadError) {
      setError(toErrorMessage(loadError, 'Failed to load assigned equipment.'))
    }
  }, [])

  useEffect(() => {
    let active = true

    async function bootstrap() {
      setIsLoading(true)
      await loadAssignedEdges()
      if (active) {
        setIsLoading(false)
      }
    }

    void bootstrap()

    return () => {
      active = false
    }
  }, [loadAssignedEdges])

  async function handleRefresh() {
    if (isRefreshing || isLoading) {
      return
    }

    setIsRefreshing(true)
    await Promise.all([loadAssignedEdges(), refreshEdgeStatus()])
    setIsRefreshing(false)
  }

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">My Equipment</h1>
          <p className="text-sm text-[#94a3b8]">
            Read-only list of assigned edge servers and current lifecycle / availability status.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void handleRefresh()}
          disabled={isRefreshing || isLoading}
          className="rounded-md border border-[var(--color-surface-border)] px-3 py-2 text-sm text-white hover:bg-[var(--color-surface-200)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isRefreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </header>

      {error && (
        <p className="mb-4 rounded-md border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 px-3 py-2 text-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}

      {!error && statusError && (
        <p className="mb-4 rounded-md border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 px-3 py-2 text-sm text-[var(--color-warning)]">
          {statusError}
        </p>
      )}

      {isLoading ? (
        <p className="text-sm text-[#94a3b8]">Loading assigned equipment...</p>
      ) : assignedEdges.length === 0 ? (
        <p className="rounded-md border border-dashed border-[var(--color-surface-border)] p-6 text-sm text-[#94a3b8]">
          No assigned edge servers yet.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {assignedEdges.map((edge) => {
            const snapshot = getSnapshot(edge._id)
            const online = snapshot.online
            return (
              <article
                key={edge._id}
                className="rounded-lg border border-[var(--color-surface-border)] bg-[var(--color-surface-100)] p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-base font-semibold text-white">{edge.name}</h2>
                  <span
                    className={
                      online === true
                        ? 'rounded-full bg-[var(--color-online)]/10 px-2 py-1 text-xs text-[var(--color-online)]'
                        : online === false
                          ? 'rounded-full bg-[var(--color-offline)]/10 px-2 py-1 text-xs text-[var(--color-offline)]'
                          : 'rounded-full bg-[#94a3b8]/10 px-2 py-1 text-xs text-[#94a3b8]'
                    }
                  >
                    {online === true ? 'Online' : online === false ? 'Offline' : 'Unknown'}
                  </span>
                </div>

                <dl className="mt-3 space-y-1 text-xs text-[#cbd5e1]">
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-[#94a3b8]">Lifecycle</dt>
                    <dd>{edge.lifecycleState}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-[#94a3b8]">Last seen</dt>
                    <dd>{formatUtcTimestamp(snapshot.lastSeenAt)}</dd>
                  </div>
                </dl>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
