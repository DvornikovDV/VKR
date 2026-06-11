import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getDiagrams } from '@/shared/api/diagrams'
import { getAdminEdgeFleet } from '@/shared/api/edgeServers'
import { getUsers, type UserRow } from '@/shared/api/users'
import { SaveAsDialog } from '@/shared/components/SaveAsDialog'
import { useAdminDiagramCreation } from '@/features/admin-hub/useAdminDiagramCreation'

interface PlatformStats {
  usersTotal: number
  usersBanned: number
  usersFreeTier: number
  usersProTier: number
  edgeServersTotal: number
  diagramsOwned: number
}

function emptyStats(): PlatformStats {
  return {
    usersTotal: 0,
    usersBanned: 0,
    usersFreeTier: 0,
    usersProTier: 0,
    edgeServersTotal: 0,
    diagramsOwned: 0,
  }
}

function deriveUserStats(users: UserRow[]) {
  return {
    usersTotal: users.length,
    usersBanned: users.filter((user) => user.isBanned).length,
    usersFreeTier: users.filter((user) => user.subscriptionTier === 'FREE').length,
    usersProTier: users.filter((user) => user.subscriptionTier === 'PRO').length,
  }
}

export function OverviewPage() {
  const creation = useAdminDiagramCreation()
  const [stats, setStats] = useState<PlatformStats>(emptyStats)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    async function loadOverview() {
      setIsLoading(true)
      setError(null)

      try {
        const [users, edgeServers, diagrams] = await Promise.all([
          getUsers({ page: 1, limit: 100 }),
          getAdminEdgeFleet(),
          getDiagrams(),
        ])

        if (!mounted) {
          return
        }

        const userStats = deriveUserStats(users)
        setStats({
          ...userStats,
          edgeServersTotal: edgeServers.length,
          diagramsOwned: diagrams.length,
        })
      } catch {
        if (mounted) {
          setError('Не удалось загрузить сводку администрирования.')
        }
      } finally {
        if (mounted) {
          setIsLoading(false)
        }
      }
    }

    void loadOverview()

    return () => {
      mounted = false
    }
  }, [])

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-6">
      <header className="mb-6">
        <h1 className="text-xl font-semibold text-white">Обзор администрирования</h1>
        <p className="text-sm text-[#94a3b8]">
          Сводные показатели платформы и быстрые переходы к ежедневным операциям.
        </p>
      </header>

      {error && (
        <p className="mb-4 rounded-md border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 px-3 py-2 text-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}

      <section aria-label="Сводка платформы" className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <article className="rounded-lg border border-[var(--color-surface-border)] bg-[var(--color-surface-100)] p-4">
          <p className="text-xs uppercase tracking-wide text-[#94a3b8]">Пользователи</p>
          <p className="mt-2 text-2xl font-semibold text-white">{isLoading ? '-' : stats.usersTotal}</p>
        </article>

        <article className="rounded-lg border border-[var(--color-surface-border)] bg-[var(--color-surface-100)] p-4">
          <p className="text-xs uppercase tracking-wide text-[#94a3b8]">Объекты</p>
          <p className="mt-2 text-2xl font-semibold text-white">{isLoading ? '-' : stats.edgeServersTotal}</p>
        </article>

        <article className="rounded-lg border border-[var(--color-surface-border)] bg-[var(--color-surface-100)] p-4">
          <p className="text-xs uppercase tracking-wide text-[#94a3b8]">Мои мнемосхемы</p>
          <p className="mt-2 text-2xl font-semibold text-white">{isLoading ? '-' : stats.diagramsOwned}</p>
        </article>

        <article className="rounded-lg border border-[var(--color-surface-border)] bg-[var(--color-surface-100)] p-4">
          <p className="text-xs uppercase tracking-wide text-[#94a3b8]">Пользователи FREE</p>
          <p className="mt-2 text-2xl font-semibold text-white">{isLoading ? '-' : stats.usersFreeTier}</p>
        </article>

        <article className="rounded-lg border border-[var(--color-surface-border)] bg-[var(--color-surface-100)] p-4">
          <p className="text-xs uppercase tracking-wide text-[#94a3b8]">Пользователи PRO</p>
          <p className="mt-2 text-2xl font-semibold text-white">{isLoading ? '-' : stats.usersProTier}</p>
        </article>

        <article className="rounded-lg border border-[var(--color-surface-border)] bg-[var(--color-surface-100)] p-4">
          <p className="text-xs uppercase tracking-wide text-[#94a3b8]">Заблокированные пользователи</p>
          <p className="mt-2 text-2xl font-semibold text-white">{isLoading ? '-' : stats.usersBanned}</p>
        </article>
      </section>

      <section aria-label="Быстрые действия" className="rounded-lg border border-[var(--color-surface-border)] bg-[var(--color-surface-100)] p-4">
        <h2 className="text-base font-semibold text-white">Быстрые действия</h2>
        <p className="mt-1 text-sm text-[#94a3b8]">Переходите напрямую к частым административным операциям.</p>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <Link
            to="/admin/edge"
            className="rounded-md border border-[var(--color-surface-border)] px-3 py-2 text-sm text-white transition-colors hover:bg-[var(--color-surface-200)]"
          >
            Управлять объектами
          </Link>
          <Link
            to="/admin/users"
            className="rounded-md border border-[var(--color-surface-border)] px-3 py-2 text-sm text-white transition-colors hover:bg-[var(--color-surface-200)]"
          >
            Проверить пользователей
          </Link>
          <button
            type="button"
            onClick={creation.open}
            className="rounded-md border border-[var(--color-surface-border)] px-3 py-2 text-sm text-white transition-colors hover:bg-[var(--color-surface-200)]"
          >
            Создать мнемосхему
          </button>
          <Link
            to="/admin/edge"
            className="rounded-md border border-[var(--color-surface-border)] px-3 py-2 text-sm text-white transition-colors hover:bg-[var(--color-surface-200)]"
          >
            Зарегистрировать объект
          </Link>
        </div>
      </section>

      <SaveAsDialog
        open={creation.dialog.open}
        isSubmitting={creation.dialog.isSubmitting}
        error={creation.dialog.error}
        title="Создать мнемосхему"
        description="Введите имя новой пустой мнемосхемы."
        placeholder="Имя новой мнемосхемы"
        validationErrorMessage="Введите имя мнемосхемы перед созданием."
        confirmLabel="Создать"
        submittingLabel="Создание..."
        onSubmit={creation.dialog.onSubmit}
        onCancel={creation.dialog.onCancel}
      />
    </section>
  )
}
