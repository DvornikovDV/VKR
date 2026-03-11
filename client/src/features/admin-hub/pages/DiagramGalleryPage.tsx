import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { isApiError } from '@/shared/api/client'
import {
  assignDiagramToUser,
  getDiagrams,
  type Diagram,
} from '@/shared/api/diagrams'
import { getUsers, type UserRow } from '@/shared/api/users'

const FREE_DIAGRAM_LIMIT = 3

interface AssignableUser extends UserRow {
  diagramCount?: number
}

function normalizeError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }

  return fallback
}

function getDiagramCount(user: AssignableUser): number | null {
  return typeof user.diagramCount === 'number' ? user.diagramCount : null
}

function canAcceptDiagram(user: AssignableUser): boolean {
  if (user.subscriptionTier === 'PRO') {
    return true
  }

  const diagramCount = getDiagramCount(user)
  if (diagramCount === null) {
    return true
  }

  return diagramCount < FREE_DIAGRAM_LIMIT
}

export function DiagramGalleryPage() {
  const [diagrams, setDiagrams] = useState<Diagram[]>([])
  const [users, setUsers] = useState<AssignableUser[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [assignOpen, setAssignOpen] = useState(false)
  const [selectedDiagramId, setSelectedDiagramId] = useState<string>('')
  const [selectedUserId, setSelectedUserId] = useState<string>('')
  const [isAssigning, setIsAssigning] = useState(false)

  const assignableUsers = useMemo(
    () => users.filter((user) => user.role === 'USER' && !user.isDeleted && !user.isBanned),
    [users],
  )

  const selectedUser = useMemo(
    () => assignableUsers.find((user) => user._id === selectedUserId) ?? null,
    [assignableUsers, selectedUserId],
  )

  const loadData = useCallback(async () => {
    setError(null)

    try {
      const [diagramResult, userResult] = await Promise.all([
        getDiagrams(),
        getUsers({ page: 1, limit: 100 }),
      ])
      setDiagrams(diagramResult)
      setUsers(userResult as AssignableUser[])
    } catch (loadError) {
      setError(normalizeError(loadError, 'Failed to load admin diagram gallery.'))
    }
  }, [])

  useEffect(() => {
    let mounted = true

    async function bootstrap() {
      setIsLoading(true)
      await loadData()
      if (mounted) {
        setIsLoading(false)
      }
    }

    void bootstrap()

    return () => {
      mounted = false
    }
  }, [loadData])

  function openAssignModal(diagramId: string) {
    setSelectedDiagramId(diagramId)
    setSelectedUserId('')
    setAssignOpen(true)
  }

  async function handleAssignSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!selectedDiagramId || !selectedUserId || isAssigning) {
      return
    }

    const targetUser = assignableUsers.find((user) => user._id === selectedUserId)
    if (!targetUser) {
      setError('Select a valid target user.')
      return
    }

    if (!canAcceptDiagram(targetUser)) {
      setError(
        'Assignment blocked: target user has no free diagram slots in FREE tier.',
      )
      return
    }

    setError(null)
    setIsAssigning(true)

    try {
      await assignDiagramToUser(selectedDiagramId, { targetUserId: selectedUserId })
      setDiagrams((prev) => prev.filter((diagram) => diagram._id !== selectedDiagramId))
      setAssignOpen(false)
      setSelectedDiagramId('')
      setSelectedUserId('')
    } catch (assignError) {
      if (isApiError(assignError) && assignError.status === 403) {
        setError(
          'Assignment blocked by server policy. Target user may not have free slots or diagram is not assignable.',
        )
      } else {
        setError(normalizeError(assignError, 'Failed to assign diagram to user.'))
      }
    } finally {
      setIsAssigning(false)
    }
  }

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-6">
      <header className="mb-6">
        <h1 className="text-xl font-semibold text-white">Admin Diagram Gallery</h1>
        <p className="text-sm text-[#94a3b8]">
          Manage your own diagrams and transfer ownership to users.
        </p>
      </header>

      {error && (
        <p className="mb-4 rounded-md border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 px-3 py-2 text-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}

      {isLoading ? (
        <p className="text-sm text-[#94a3b8]">Loading diagrams...</p>
      ) : diagrams.length === 0 ? (
        <p className="rounded-md border border-dashed border-[var(--color-surface-border)] p-6 text-sm text-[#94a3b8]">
          You do not own any diagrams yet.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {diagrams.map((diagram) => (
            <article
              key={diagram._id}
              className="rounded-xl border border-[var(--color-surface-border)] bg-[var(--color-surface-100)] p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-white">{diagram.name}</h2>
                  <p className="text-xs text-[#94a3b8]">ID: {diagram._id}</p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    to={`/admin/editor/${diagram._id}`}
                    className="rounded-md border border-[var(--color-surface-border)] px-2.5 py-1.5 text-xs text-white hover:bg-[var(--color-surface-200)]"
                  >
                    Edit
                  </Link>
                  <button
                    type="button"
                    onClick={() => openAssignModal(diagram._id)}
                    className="rounded-md bg-[var(--color-brand-600)] px-2.5 py-1.5 text-xs text-white hover:bg-[var(--color-brand-500)]"
                  >
                    Assign to User
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {assignOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-lg border border-[var(--color-surface-border)] bg-[var(--color-surface-100)] p-4">
            <h2 className="text-base font-semibold text-white">Assign Diagram</h2>
            <p className="mt-1 text-sm text-[#94a3b8]">
              Transfer ownership to a target user.
            </p>

            <form className="mt-4 space-y-3" onSubmit={(event) => void handleAssignSubmit(event)}>
              <label className="block text-sm text-[#cbd5e1]">
                Target user
                <select
                  value={selectedUserId}
                  required
                  onChange={(event) => setSelectedUserId(event.target.value)}
                  className="mt-1 w-full rounded-md border border-[var(--color-surface-border)] bg-[var(--color-surface-200)] px-3 py-2 text-sm text-white"
                >
                  <option value="">Select user</option>
                  {assignableUsers.map((user) => {
                    const diagramCount = getDiagramCount(user)
                    const slotInfo =
                      user.subscriptionTier === 'PRO'
                        ? 'slots: unlimited'
                        : diagramCount === null
                          ? 'slots: unknown'
                          : `slots: ${diagramCount}/${FREE_DIAGRAM_LIMIT}`

                    return (
                      <option key={user._id} value={user._id}>
                        {user.email} ({user.subscriptionTier}, {slotInfo})
                      </option>
                    )
                  })}
                </select>
              </label>

              {selectedUser && !canAcceptDiagram(selectedUser) && (
                <p className="rounded-md border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 px-3 py-2 text-xs text-[var(--color-warning)]">
                  Assignment is blocked for this user: FREE tier limit reached.
                </p>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setAssignOpen(false)
                    setSelectedDiagramId('')
                    setSelectedUserId('')
                  }}
                  className="rounded-md border border-[var(--color-surface-border)] px-3 py-2 text-sm text-white hover:bg-[var(--color-surface-200)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAssigning || !selectedUser || !canAcceptDiagram(selectedUser)}
                  className="rounded-md bg-[var(--color-brand-600)] px-3 py-2 text-sm text-white hover:bg-[var(--color-brand-500)] disabled:opacity-60"
                >
                  {isAssigning ? 'Assigning...' : 'Assign'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  )
}
