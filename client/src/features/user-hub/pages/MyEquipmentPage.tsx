import { useCallback, useEffect, useMemo, useState } from 'react'
import { getAssignedEdgeServers, type AssignedEdgeServer } from '@/shared/api/edgeServers'
import {
  getEdgeAvailabilityBadgeClass,
  getEdgeAvailabilityDisplayLabel,
  getEdgeAvailabilityLabel,
  getEdgeLifecycleBadgeClass,
  getEdgeLifecycleDisplayLabel,
} from '@/shared/edgePresentation'
import { useEdgeStatus } from '@/shared/hooks/useEdgeStatus'
import { getErrorDisplayMessage } from '@/shared/api/errorMessages'

function toErrorMessage(error: unknown, fallback: string): string {
  return getErrorDisplayMessage(error, fallback)
}

function formatUtcTimestamp(value: string | null | undefined): string {
  if (!value) {
    return 'Сигналов пока нет'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return 'Неизвестное время'
  }

  return `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`
}

function getEffectiveAvailability(
  edge: AssignedEdgeServer,
  snapshot: { online: boolean | null; lastSeenAt: string | null },
) {
  if (snapshot.online === null) {
    return edge.availability
  }

  return snapshot
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
      setError(toErrorMessage(loadError, 'Не удалось загрузить назначенные объекты.'))
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
          <h1 className="text-xl font-semibold text-white">Объекты</h1>
          <p className="text-sm text-[#94a3b8]">
            Список назначенных объектов и их текущий статус доступности.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void handleRefresh()}
          disabled={isRefreshing || isLoading}
          className="rounded-md border border-[var(--color-surface-border)] px-3 py-2 text-sm text-white hover:bg-[var(--color-surface-200)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isRefreshing ? 'Обновление...' : 'Обновить'}
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
        <p className="text-sm text-[#94a3b8]">Загрузка назначенных объектов...</p>
      ) : assignedEdges.length === 0 ? (
        <p className="rounded-md border border-dashed border-[var(--color-surface-border)] p-6 text-sm text-[#94a3b8]">
          Назначенных объектов пока нет.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {assignedEdges.map((edge) => {
            const snapshot = getSnapshot(edge._id)
            const availability = getEffectiveAvailability(edge, snapshot)
            const availabilityLabel = getEdgeAvailabilityLabel(availability.online)
            const availabilityDisplayLabel = getEdgeAvailabilityDisplayLabel(availabilityLabel)
            const lifecycleDisplayLabel = getEdgeLifecycleDisplayLabel(edge.lifecycleState)
            return (
              <article
                key={edge._id}
                className="rounded-lg border border-[var(--color-surface-border)] bg-[var(--color-surface-100)] p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-base font-semibold text-white">{edge.name}</h2>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={getEdgeLifecycleBadgeClass(edge.lifecycleState)}>{lifecycleDisplayLabel}</span>
                    <span className={getEdgeAvailabilityBadgeClass(availability.online)}>{availabilityDisplayLabel}</span>
                  </div>
                </div>

                <dl className="mt-3 space-y-1 text-xs text-[#cbd5e1]">
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-[#94a3b8]">Состояние</dt>
                    <dd>{lifecycleDisplayLabel}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-[#94a3b8]">Доступность</dt>
                    <dd>{availabilityDisplayLabel}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-[#94a3b8]">Последний сигнал</dt>
                    <dd>{formatUtcTimestamp(availability.lastSeenAt)}</dd>
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
