import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  bindEdgeServer,
  getEdgeServers,
  registerEdgeServer,
  revokeEdgeServerAccess,
  type EdgeServer,
} from '@/shared/api/edgeServers'
import { getUsers, type UserRow } from '@/shared/api/users'
import { useEdgeStatus } from '@/shared/hooks/useEdgeStatus'

interface RegisterFormState {
  name: string
  apiKeyHash: string
}

const INITIAL_REGISTER_FORM: RegisterFormState = {
  name: '',
  apiKeyHash: '',
}

function normalizeError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }

  return fallback
}

function toUserRef(value: string | { _id?: string; email?: string } | null | undefined):
  | { _id: string; email: string }
  | null {
  if (!value || typeof value === 'string') {
    return null
  }

  if (!value || typeof value._id !== 'string' || typeof value.email !== 'string') {
    return null
  }

  return {
    _id: value._id,
    email: value.email,
  }
}

function getAssignedUsers(edgeServer: EdgeServer): Array<{ _id: string; email: string }> {
  if (!edgeServer.trustedUsers || edgeServer.trustedUsers.length === 0) {
    return []
  }

  return edgeServer.trustedUsers
    .map((item) => toUserRef(item))
    .filter((item): item is { _id: string; email: string } => item !== null)
}

export function EdgeFleetPage() {
  const [edgeServers, setEdgeServers] = useState<EdgeServer[]>([])
  const [users, setUsers] = useState<UserRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [registerOpen, setRegisterOpen] = useState(false)
  const [registerForm, setRegisterForm] = useState<RegisterFormState>(INITIAL_REGISTER_FORM)
  const [isRegistering, setIsRegistering] = useState(false)

  const [assignOpen, setAssignOpen] = useState(false)
  const [assignEdgeId, setAssignEdgeId] = useState<string>('')
  const [assignUserId, setAssignUserId] = useState<string>('')
  const [isAssigning, setIsAssigning] = useState(false)

  const [revokeOpen, setRevokeOpen] = useState(false)
  const [revokeEdgeId, setRevokeEdgeId] = useState<string>('')
  const [revokeUserId, setRevokeUserId] = useState<string>('')
  const [isRevoking, setIsRevoking] = useState(false)

  const edgeIds = useMemo(() => edgeServers.map((edge) => edge._id), [edgeServers])
  const { isOnline, refresh: refreshEdgeStatus } = useEdgeStatus({ edgeIds })

  const assignableUsers = useMemo(
    () => users.filter((user) => user.role === 'USER' && !user.isBanned && !user.isDeleted),
    [users],
  )

  const loadData = useCallback(async () => {
    setError(null)

    try {
      const [edgeResult, userResult] = await Promise.all([
        getEdgeServers(),
        getUsers({ page: 1, limit: 100 }),
      ])

      setEdgeServers(edgeResult)
      setUsers(userResult)
    } catch (loadError) {
      setError(normalizeError(loadError, 'Failed to load edge fleet data.'))
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

  async function handleRefresh() {
    if (isRefreshing || isLoading) {
      return
    }

    setIsRefreshing(true)
    await Promise.all([loadData(), refreshEdgeStatus()])
    setIsRefreshing(false)
  }

  async function handleRegisterSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isRegistering) {
      return
    }

    setError(null)
    setIsRegistering(true)

    try {
      const created = await registerEdgeServer({
        name: registerForm.name.trim(),
        apiKeyHash: registerForm.apiKeyHash.trim(),
      })
      setEdgeServers((prev) => [created, ...prev])
      setRegisterForm(INITIAL_REGISTER_FORM)
      setRegisterOpen(false)
    } catch (registerError) {
      setError(normalizeError(registerError, 'Failed to register edge server.'))
    } finally {
      setIsRegistering(false)
    }
  }

  function openAssignModal(edgeId: string) {
    setAssignEdgeId(edgeId)
    setAssignUserId('')
    setAssignOpen(true)
  }

  async function handleAssignSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (isAssigning || !assignEdgeId || !assignUserId) {
      return
    }

    setError(null)
    setIsAssigning(true)

    try {
      const updated = await bindEdgeServer(assignEdgeId, { userId: assignUserId })
      setEdgeServers((prev) => prev.map((edge) => (edge._id === assignEdgeId ? updated : edge)))
      setAssignOpen(false)
      setAssignEdgeId('')
      setAssignUserId('')
    } catch (assignError) {
      setError(normalizeError(assignError, 'Failed to assign user to edge server.'))
    } finally {
      setIsAssigning(false)
    }
  }

  function openRevokeModal(edgeServer: EdgeServer) {
    const assignedUsers = getAssignedUsers(edgeServer)
    if (assignedUsers.length === 0) {
      return
    }

    setRevokeEdgeId(edgeServer._id)
    setRevokeUserId(assignedUsers[0]._id)
    setRevokeOpen(true)
  }

  async function handleRevokeSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (isRevoking || !revokeEdgeId || !revokeUserId) {
      return
    }

    setError(null)
    setIsRevoking(true)

    try {
      const updated = await revokeEdgeServerAccess(revokeEdgeId, revokeUserId)
      setEdgeServers((prev) => prev.map((edge) => (edge._id === revokeEdgeId ? updated : edge)))
      setRevokeOpen(false)
      setRevokeEdgeId('')
      setRevokeUserId('')
    } catch (revokeError) {
      setError(normalizeError(revokeError, 'Failed to revoke API key access.'))
    } finally {
      setIsRevoking(false)
    }
  }

  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Edge Fleet</h1>
          <p className="text-sm text-[#94a3b8]">
            Register servers, assign users, and revoke API key access.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void handleRefresh()}
            disabled={isRefreshing || isLoading}
            className="rounded-md border border-[var(--color-surface-border)] px-3 py-2 text-sm text-white hover:bg-[var(--color-surface-200)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </button>
          <button
            type="button"
            onClick={() => setRegisterOpen(true)}
            className="rounded-md bg-[var(--color-brand-600)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-brand-500)]"
          >
            Register Edge Server
          </button>
        </div>
      </header>

      {error && (
        <p className="mb-4 rounded-md border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 px-3 py-2 text-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-[var(--color-surface-border)] bg-[var(--color-surface-100)]">
        <table className="min-w-full text-left text-sm text-[#e2e8f0]">
          <thead className="bg-[var(--color-surface-200)] text-xs uppercase tracking-wide text-[#94a3b8]">
            <tr>
              <th className="px-3 py-3">Name</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Assigned Users</th>
              <th className="px-3 py-3">Registered By</th>
              <th className="px-3 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td className="px-3 py-6 text-[#94a3b8]" colSpan={5}>
                  Loading edge fleet...
                </td>
              </tr>
            ) : edgeServers.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-[#94a3b8]" colSpan={5}>
                  No edge servers registered yet.
                </td>
              </tr>
            ) : (
              edgeServers.map((edge) => {
                const assignedUsers = getAssignedUsers(edge)
                const createdByEmail =
                  typeof edge.createdBy === 'object' && edge.createdBy && 'email' in edge.createdBy
                    ? edge.createdBy.email
                    : 'Unknown'

                return (
                  <tr key={edge._id} className="border-t border-[var(--color-surface-border)]">
                    <td className="px-3 py-3 text-white">{edge.name}</td>
                    <td className="px-3 py-3">
                      <span
                        className={
                          isOnline(edge._id)
                            ? 'rounded-full bg-[var(--color-online)]/10 px-2 py-1 text-xs text-[var(--color-online)]'
                            : 'rounded-full bg-[var(--color-offline)]/10 px-2 py-1 text-xs text-[var(--color-offline)]'
                        }
                      >
                        {isOnline(edge._id) ? 'Online' : 'Offline'}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-[#cbd5e1]">
                      {assignedUsers.length === 0
                        ? 'Not assigned'
                        : assignedUsers.map((user) => user.email).join(', ')}
                    </td>
                    <td className="px-3 py-3 text-[#94a3b8]">{createdByEmail}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openAssignModal(edge._id)}
                          className="rounded-md border border-[var(--color-surface-border)] px-2 py-1.5 text-xs text-white hover:bg-[var(--color-surface-200)]"
                        >
                          Assign to User
                        </button>
                        <button
                          type="button"
                          disabled={assignedUsers.length === 0}
                          onClick={() => openRevokeModal(edge)}
                          className="rounded-md border border-[var(--color-danger)]/40 px-2 py-1.5 text-xs text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Revoke API key
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

      {registerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-lg border border-[var(--color-surface-border)] bg-[var(--color-surface-100)] p-4">
            <h2 className="text-base font-semibold text-white">Register Edge Server</h2>
            <p className="mt-1 text-sm text-[#94a3b8]">Create a new edge entry for the fleet.</p>

            <form className="mt-4 space-y-3" onSubmit={(event) => void handleRegisterSubmit(event)}>
              <label className="block text-sm text-[#cbd5e1]">
                Name
                <input
                  type="text"
                  value={registerForm.name}
                  required
                  onChange={(event) =>
                    setRegisterForm((prev) => ({ ...prev, name: event.target.value }))
                  }
                  className="mt-1 w-full rounded-md border border-[var(--color-surface-border)] bg-[var(--color-surface-200)] px-3 py-2 text-sm text-white"
                />
              </label>

              <label className="block text-sm text-[#cbd5e1]">
                API key hash
                <input
                  type="text"
                  value={registerForm.apiKeyHash}
                  required
                  onChange={(event) =>
                    setRegisterForm((prev) => ({ ...prev, apiKeyHash: event.target.value }))
                  }
                  className="mt-1 w-full rounded-md border border-[var(--color-surface-border)] bg-[var(--color-surface-200)] px-3 py-2 text-sm text-white"
                />
              </label>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setRegisterOpen(false)
                    setRegisterForm(INITIAL_REGISTER_FORM)
                  }}
                  className="rounded-md border border-[var(--color-surface-border)] px-3 py-2 text-sm text-white hover:bg-[var(--color-surface-200)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isRegistering}
                  className="rounded-md bg-[var(--color-brand-600)] px-3 py-2 text-sm text-white hover:bg-[var(--color-brand-500)] disabled:opacity-60"
                >
                  {isRegistering ? 'Registering...' : 'Register'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {assignOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-lg border border-[var(--color-surface-border)] bg-[var(--color-surface-100)] p-4">
            <h2 className="text-base font-semibold text-white">Assign Edge Server</h2>
            <p className="mt-1 text-sm text-[#94a3b8]">Grant user access to this edge server.</p>

            <form className="mt-4 space-y-3" onSubmit={(event) => void handleAssignSubmit(event)}>
              <label className="block text-sm text-[#cbd5e1]">
                User
                <select
                  value={assignUserId}
                  required
                  onChange={(event) => setAssignUserId(event.target.value)}
                  className="mt-1 w-full rounded-md border border-[var(--color-surface-border)] bg-[var(--color-surface-200)] px-3 py-2 text-sm text-white"
                >
                  <option value="">Select user</option>
                  {assignableUsers.map((user) => (
                    <option key={user._id} value={user._id}>
                      {user.email}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setAssignOpen(false)
                    setAssignEdgeId('')
                    setAssignUserId('')
                  }}
                  className="rounded-md border border-[var(--color-surface-border)] px-3 py-2 text-sm text-white hover:bg-[var(--color-surface-200)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAssigning || !assignUserId}
                  className="rounded-md bg-[var(--color-brand-600)] px-3 py-2 text-sm text-white hover:bg-[var(--color-brand-500)] disabled:opacity-60"
                >
                  {isAssigning ? 'Assigning...' : 'Assign'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {revokeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-lg border border-[var(--color-surface-border)] bg-[var(--color-surface-100)] p-4">
            <h2 className="text-base font-semibold text-white">Revoke API Key Access</h2>
            <p className="mt-1 text-sm text-[#94a3b8]">
              Remove a user from this edge server and revoke their access.
            </p>

            <form className="mt-4 space-y-3" onSubmit={(event) => void handleRevokeSubmit(event)}>
              <label className="block text-sm text-[#cbd5e1]">
                Assigned user
                <select
                  value={revokeUserId}
                  required
                  onChange={(event) => setRevokeUserId(event.target.value)}
                  className="mt-1 w-full rounded-md border border-[var(--color-surface-border)] bg-[var(--color-surface-200)] px-3 py-2 text-sm text-white"
                >
                  {edgeServers
                    .find((edge) => edge._id === revokeEdgeId)
                    ?.trustedUsers?.map((entry) => toUserRef(entry))
                    .filter((entry): entry is { _id: string; email: string } => entry !== null)
                    .map((user) => (
                      <option key={user._id} value={user._id}>
                        {user.email}
                      </option>
                    ))}
                </select>
              </label>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setRevokeOpen(false)
                    setRevokeEdgeId('')
                    setRevokeUserId('')
                  }}
                  className="rounded-md border border-[var(--color-surface-border)] px-3 py-2 text-sm text-white hover:bg-[var(--color-surface-200)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isRevoking || !revokeUserId}
                  className="rounded-md border border-[var(--color-danger)]/40 px-3 py-2 text-sm text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 disabled:opacity-60"
                >
                  {isRevoking ? 'Revoking...' : 'Revoke'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  )
}
