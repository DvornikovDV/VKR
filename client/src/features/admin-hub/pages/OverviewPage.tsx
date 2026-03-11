import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getDiagrams } from '@/shared/api/diagrams'
import { getEdgeServers } from '@/shared/api/edgeServers'
import { getUsers, type UserRow } from '@/shared/api/users'

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
          getEdgeServers(),
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
          setError('Failed to load overview statistics.')
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
        <h1 className="text-xl font-semibold text-white">Admin Overview</h1>
        <p className="text-sm text-[#94a3b8]">
          Platform stats and quick action shortcuts for daily operations.
        </p>
      </header>

      {error && (
        <p className="mb-4 rounded-md border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 px-3 py-2 text-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}

      <section aria-label="Platform stats" className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <article className="rounded-lg border border-[var(--color-surface-border)] bg-[var(--color-surface-100)] p-4">
          <p className="text-xs uppercase tracking-wide text-[#94a3b8]">Users total</p>
          <p className="mt-2 text-2xl font-semibold text-white">{isLoading ? '-' : stats.usersTotal}</p>
        </article>

        <article className="rounded-lg border border-[var(--color-surface-border)] bg-[var(--color-surface-100)] p-4">
          <p className="text-xs uppercase tracking-wide text-[#94a3b8]">Edge fleet</p>
          <p className="mt-2 text-2xl font-semibold text-white">{isLoading ? '-' : stats.edgeServersTotal}</p>
        </article>

        <article className="rounded-lg border border-[var(--color-surface-border)] bg-[var(--color-surface-100)] p-4">
          <p className="text-xs uppercase tracking-wide text-[#94a3b8]">My diagrams</p>
          <p className="mt-2 text-2xl font-semibold text-white">{isLoading ? '-' : stats.diagramsOwned}</p>
        </article>

        <article className="rounded-lg border border-[var(--color-surface-border)] bg-[var(--color-surface-100)] p-4">
          <p className="text-xs uppercase tracking-wide text-[#94a3b8]">FREE tier users</p>
          <p className="mt-2 text-2xl font-semibold text-white">{isLoading ? '-' : stats.usersFreeTier}</p>
        </article>

        <article className="rounded-lg border border-[var(--color-surface-border)] bg-[var(--color-surface-100)] p-4">
          <p className="text-xs uppercase tracking-wide text-[#94a3b8]">PRO tier users</p>
          <p className="mt-2 text-2xl font-semibold text-white">{isLoading ? '-' : stats.usersProTier}</p>
        </article>

        <article className="rounded-lg border border-[var(--color-surface-border)] bg-[var(--color-surface-100)] p-4">
          <p className="text-xs uppercase tracking-wide text-[#94a3b8]">Banned users</p>
          <p className="mt-2 text-2xl font-semibold text-white">{isLoading ? '-' : stats.usersBanned}</p>
        </article>
      </section>

      <section aria-label="Quick actions" className="rounded-lg border border-[var(--color-surface-border)] bg-[var(--color-surface-100)] p-4">
        <h2 className="text-base font-semibold text-white">Quick actions</h2>
        <p className="mt-1 text-sm text-[#94a3b8]">Navigate directly to frequent admin workflows.</p>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <Link
            to="/admin/edge"
            className="rounded-md border border-[var(--color-surface-border)] px-3 py-2 text-sm text-white transition-colors hover:bg-[var(--color-surface-200)]"
          >
            Manage edge fleet
          </Link>
          <Link
            to="/admin/users"
            className="rounded-md border border-[var(--color-surface-border)] px-3 py-2 text-sm text-white transition-colors hover:bg-[var(--color-surface-200)]"
          >
            Review users
          </Link>
          <Link
            to="/admin/diagrams"
            className="rounded-md border border-[var(--color-surface-border)] px-3 py-2 text-sm text-white transition-colors hover:bg-[var(--color-surface-200)]"
          >
            Open diagram gallery
          </Link>
          <Link
            to="/admin/edge"
            className="rounded-md border border-[var(--color-surface-border)] px-3 py-2 text-sm text-white transition-colors hover:bg-[var(--color-surface-200)]"
          >
            Register edge server
          </Link>
        </div>
      </section>
    </section>
  )
}