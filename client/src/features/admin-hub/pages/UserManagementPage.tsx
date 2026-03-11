import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  getUsers,
  updateUserBan,
  updateUserTier,
  type SubscriptionTier,
  type UserRow,
} from '@/shared/api/users'

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const

function normalizeError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }

  return fallback
}

export function UserManagementPage() {
  const [rows, setRows] = useState<UserRow[]>([])
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState<number>(PAGE_SIZE_OPTIONS[0])
  const [isLoading, setIsLoading] = useState(true)
  const [isMutatingById, setIsMutatingById] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<string | null>(null)

  const loadUsers = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const data = await getUsers({
        search: searchQuery || undefined,
        page,
        limit,
      })
      setRows(data)
    } catch (fetchError) {
      setError(normalizeError(fetchError, 'Failed to load users.'))
    } finally {
      setIsLoading(false)
    }
  }, [limit, page, searchQuery])

  useEffect(() => {
    void loadUsers()
  }, [loadUsers])

  function handleSubmitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPage(1)
    setSearchQuery(searchInput.trim())
  }

  async function handleTierChange(user: UserRow, tier: SubscriptionTier) {
    if (user.subscriptionTier === tier || isMutatingById[user._id]) {
      return
    }

    setError(null)
    setIsMutatingById((prev) => ({ ...prev, [user._id]: true }))

    try {
      await updateUserTier(user._id, { tier })
      setRows((prev) =>
        prev.map((row) =>
          row._id === user._id
            ? {
                ...row,
                subscriptionTier: tier,
              }
            : row,
        ),
      )
    } catch (mutationError) {
      setError(normalizeError(mutationError, 'Failed to update subscription tier.'))
    } finally {
      setIsMutatingById((prev) => ({ ...prev, [user._id]: false }))
    }
  }

  async function handleBanToggle(user: UserRow) {
    if (isMutatingById[user._id]) {
      return
    }

    const nextIsBanned = !user.isBanned

    setError(null)
    setIsMutatingById((prev) => ({ ...prev, [user._id]: true }))

    try {
      await updateUserBan(user._id, { isBanned: nextIsBanned })
      setRows((prev) =>
        prev.map((row) =>
          row._id === user._id
            ? {
                ...row,
                isBanned: nextIsBanned,
              }
            : row,
        ),
      )
    } catch (mutationError) {
      setError(normalizeError(mutationError, 'Failed to update ban status.'))
    } finally {
      setIsMutatingById((prev) => ({ ...prev, [user._id]: false }))
    }
  }

  const hasRows = rows.length > 0
  const canGoPrev = page > 1 && !isLoading
  const canGoNext = rows.length >= limit && !isLoading

  const pageLabel = useMemo(() => {
    if (!hasRows && !isLoading) {
      return 'No users found'
    }

    return `Page ${page}`
  }, [hasRows, isLoading, page])

  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">User Management</h1>
          <p className="text-sm text-[#94a3b8]">
            Search users, update subscription tier, and ban or unban access.
          </p>
        </div>
      </header>

      <form className="mb-4 flex flex-wrap items-center gap-2" onSubmit={handleSubmitSearch}>
        <input
          type="search"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Search users"
          className="w-full max-w-xs rounded-md border border-[var(--color-surface-border)] bg-[var(--color-surface-200)] px-3 py-2 text-sm text-white outline-none ring-[var(--color-brand-500)] focus:ring-1"
        />

        <button
          type="submit"
          className="rounded-md bg-[var(--color-brand-600)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-brand-500)]"
        >
          Search
        </button>

        <label className="ml-auto flex items-center gap-2 text-sm text-[#94a3b8]">
          Rows
          <select
            value={limit}
            onChange={(event) => {
              setLimit(Number(event.target.value))
              setPage(1)
            }}
            className="rounded-md border border-[var(--color-surface-border)] bg-[var(--color-surface-200)] px-2 py-1.5 text-sm text-white"
          >
            {PAGE_SIZE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </form>

      {error && (
        <p className="mb-4 rounded-md border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 px-3 py-2 text-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-[var(--color-surface-border)] bg-[var(--color-surface-100)]">
        <table className="min-w-full text-left text-sm text-[#e2e8f0]">
          <thead className="bg-[var(--color-surface-200)] text-xs uppercase tracking-wide text-[#94a3b8]">
            <tr>
              <th className="px-3 py-3">Email</th>
              <th className="px-3 py-3">Role</th>
              <th className="px-3 py-3">Tier</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Created</th>
              <th className="px-3 py-3">Actions</th>
            </tr>
          </thead>

          <tbody>
            {isLoading ? (
              <tr>
                <td className="px-3 py-6 text-[#94a3b8]" colSpan={6}>
                  Loading users...
                </td>
              </tr>
            ) : !hasRows ? (
              <tr>
                <td className="px-3 py-6 text-[#94a3b8]" colSpan={6}>
                  No matching users found.
                </td>
              </tr>
            ) : (
              rows.map((user) => {
                const isMutating = Boolean(isMutatingById[user._id])

                return (
                  <tr key={user._id} className="border-t border-[var(--color-surface-border)]">
                    <td className="px-3 py-3 text-white">{user.email}</td>
                    <td className="px-3 py-3">{user.role}</td>
                    <td className="px-3 py-3">{user.subscriptionTier}</td>
                    <td className="px-3 py-3">
                      {user.isDeleted ? 'Deleted' : user.isBanned ? 'Banned' : 'Active'}
                    </td>
                    <td className="px-3 py-3 text-[#94a3b8]">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          value={user.subscriptionTier}
                          disabled={isMutating}
                          onChange={(event) =>
                            void handleTierChange(user, event.target.value as SubscriptionTier)
                          }
                          className="rounded-md border border-[var(--color-surface-border)] bg-[var(--color-surface-200)] px-2 py-1.5 text-xs text-white disabled:opacity-60"
                          aria-label={`Change tier for ${user.email}`}
                        >
                          <option value="FREE">FREE</option>
                          <option value="PRO">PRO</option>
                        </select>

                        <button
                          type="button"
                          disabled={isMutating}
                          onClick={() => void handleBanToggle(user)}
                          className="rounded-md border border-[var(--color-surface-border)] px-2 py-1.5 text-xs text-white hover:bg-[var(--color-surface-200)] disabled:opacity-60"
                        >
                          {user.isBanned ? 'Unban' : 'Ban'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      <footer className="mt-4 flex items-center justify-between text-sm text-[#94a3b8]">
        <span>{pageLabel}</span>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!canGoPrev}
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            className="rounded-md border border-[var(--color-surface-border)] px-3 py-1.5 text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={!canGoNext}
            onClick={() => setPage((prev) => prev + 1)}
            className="rounded-md border border-[var(--color-surface-border)] px-3 py-1.5 text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </footer>
    </section>
  )
}