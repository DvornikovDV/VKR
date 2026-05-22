import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  bindEdgeServer,
  blockAdminEdgeServer,
  getAdminEdgeFleet,
  registerAdminEdgeServer,
  revokeEdgeServerAccess,
  rotateEdgeServerCredential,
  unblockEdgeServer,
  type CanonicalAdminEdgeServer,
  type EdgeCredentialDisclosureResponse,
  type EdgeLifecycleState,
  type EdgeServerUserRef,
} from '@/shared/api/edgeServers'
import { getUsers, type UserRow } from '@/shared/api/users'
import { useEdgeStatus } from '@/shared/hooks/useEdgeStatus'
import { copyInstallerJsonToClipboard } from '@/features/admin-hub/model/edgeCredentialClipboard'
import { serializeEdgeCredentialInstallerPayload } from '@/features/admin-hub/model/edgeCredentialInstallerPayload'
import {
  getEdgeAvailabilityDisplayLabel,
  getEdgeLifecycleDisplayLabel,
} from '@/shared/edgePresentation'
import { getErrorDisplayMessage } from '@/shared/api/errorMessages'

interface RegisterFormState {
  name: string
}

type CredentialAction = 'rotate' | 'block' | 'unblock'

type CopyStatus = 'idle' | 'copied' | 'failed'

const INITIAL_REGISTER_FORM: RegisterFormState = {
  name: '',
}

function normalizeError(error: unknown, fallback: string): string {
  return getErrorDisplayMessage(error, fallback)
}

function toUserRef(value: string | EdgeServerUserRef | null | undefined):
  | { _id: string; email: string }
  | null {
  if (!value || typeof value === 'string') {
    return null
  }

  if (typeof value._id !== 'string' || typeof value.email !== 'string') {
    return null
  }

  return {
    _id: value._id,
    email: value.email,
  }
}

function getAssignedUsers(edgeServer: CanonicalAdminEdgeServer): Array<{ _id: string; email: string }> {
  if (!edgeServer.trustedUsers || edgeServer.trustedUsers.length === 0) {
    return []
  }

  return edgeServer.trustedUsers
    .map((item) => toUserRef(item))
    .filter((item): item is { _id: string; email: string } => item !== null)
}

function formatUtcTimestamp(value: string | null | undefined): string {
  if (!value) {
    return 'Нет данных'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return 'Нет данных'
  }

  return date.toISOString().replace('T', ' ').replace('.000Z', ' UTC')
}

function lifecycleBadgeClass(lifecycleState: EdgeLifecycleState): string {
  return lifecycleState === 'Active'
    ? 'rounded-full bg-[var(--color-online)]/10 px-2 py-1 text-xs text-[var(--color-online)]'
    : 'rounded-full bg-[var(--color-danger)]/10 px-2 py-1 text-xs text-[var(--color-danger)]'
}

function credentialActionPendingLabel(action: CredentialAction): string {
  switch (action) {
    case 'rotate':
      return 'Ротация...'
    case 'block':
      return 'Блокировка...'
    case 'unblock':
      return 'Разблокировка...'
  }
}

export function EdgeFleetPage() {
  const [edgeServers, setEdgeServers] = useState<CanonicalAdminEdgeServer[]>([])
  const [users, setUsers] = useState<UserRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [registerOpen, setRegisterOpen] = useState(false)
  const [registerForm, setRegisterForm] = useState<RegisterFormState>(INITIAL_REGISTER_FORM)
  const [isRegistering, setIsRegistering] = useState(false)
  const [latestDisclosure, setLatestDisclosure] = useState<EdgeCredentialDisclosureResponse | null>(null)
  const [installerJsonCopyStatus, setInstallerJsonCopyStatus] = useState<CopyStatus>('idle')
  const [credentialActionEdgeId, setCredentialActionEdgeId] = useState<string | null>(null)
  const [credentialAction, setCredentialAction] = useState<CredentialAction | null>(null)

  const [assignOpen, setAssignOpen] = useState(false)
  const [assignEdgeId, setAssignEdgeId] = useState<string>('')
  const [assignUserId, setAssignUserId] = useState<string>('')
  const [isAssigning, setIsAssigning] = useState(false)

  const [revokeOpen, setRevokeOpen] = useState(false)
  const [revokeEdgeId, setRevokeEdgeId] = useState<string>('')
  const [revokeUserId, setRevokeUserId] = useState<string>('')
  const [isRevoking, setIsRevoking] = useState(false)

  const edgeIds = useMemo(() => edgeServers.map((edge) => edge._id), [edgeServers])
  const { getSnapshot, refresh: refreshEdgeStatus } = useEdgeStatus({ edgeIds, scope: 'admin' })
  const installerJson = useMemo(
    () => (latestDisclosure ? serializeEdgeCredentialInstallerPayload(latestDisclosure) : ''),
    [latestDisclosure],
  )

  const assignableUsers = useMemo(
    () => users.filter((user) => user.role === 'USER' && !user.isBanned && !user.isDeleted),
    [users],
  )

  const loadData = useCallback(async () => {
    setError(null)

    try {
      const [edgeResult, userResult] = await Promise.all([
        getAdminEdgeFleet(),
        getUsers({ page: 1, limit: 100 }),
      ])

      setEdgeServers(edgeResult)
      setUsers(userResult)
    } catch (loadError) {
      setError(normalizeError(loadError, 'Не удалось загрузить данные объектов.'))
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

    setLatestDisclosure(null)
    setInstallerJsonCopyStatus('idle')
    setIsRefreshing(true)
    await Promise.all([loadData(), refreshEdgeStatus()])
    setIsRefreshing(false)
  }

  function discloseCredential(disclosure: EdgeCredentialDisclosureResponse) {
    setInstallerJsonCopyStatus('idle')
    setLatestDisclosure(disclosure)
  }

  function hideLatestDisclosure() {
    setLatestDisclosure(null)
    setInstallerJsonCopyStatus('idle')
  }

  async function handleCopyInstallerJson() {
    if (!installerJson) {
      return
    }

    try {
      await copyInstallerJsonToClipboard(installerJson)
      setInstallerJsonCopyStatus('copied')
    } catch {
      setInstallerJsonCopyStatus('failed')
    }
  }

  async function handleRegisterSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isRegistering) {
      return
    }

    setError(null)
    setIsRegistering(true)

    try {
      const disclosure = await registerAdminEdgeServer({
        name: registerForm.name.trim(),
      })
      setEdgeServers((prev) => [disclosure.edge, ...prev])
      discloseCredential(disclosure)
      setRegisterForm(INITIAL_REGISTER_FORM)
      setRegisterOpen(false)
    } catch (registerError) {
      setError(normalizeError(registerError, 'Не удалось зарегистрировать объект.'))
    } finally {
      setIsRegistering(false)
    }
  }

  async function handleCredentialAction(edgeId: string, action: CredentialAction) {
    if (credentialActionEdgeId) {
      return
    }

    setError(null)
    setCredentialActionEdgeId(edgeId)
    setCredentialAction(action)

    try {
      if (action === 'rotate') {
        const disclosure = await rotateEdgeServerCredential(edgeId)
        setEdgeServers((prev) => prev.map((edge) => (edge._id === edgeId ? disclosure.edge : edge)))
        discloseCredential(disclosure)
      } else if (action === 'block') {
        const updated = await blockAdminEdgeServer(edgeId)
        setEdgeServers((prev) => prev.map((edge) => (edge._id === edgeId ? updated : edge)))
        hideLatestDisclosure()
      } else {
        const disclosure = await unblockEdgeServer(edgeId)
        setEdgeServers((prev) => prev.map((edge) => (edge._id === edgeId ? disclosure.edge : edge)))
        discloseCredential(disclosure)
      }

      await refreshEdgeStatus()
    } catch (actionError) {
      const fallback =
        action === 'rotate'
          ? 'Не удалось ротировать ключ объекта.'
          : action === 'block'
            ? 'Не удалось заблокировать объект.'
            : 'Не удалось разблокировать объект.'
      setError(normalizeError(actionError, fallback))
    } finally {
      setCredentialActionEdgeId(null)
      setCredentialAction(null)
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
      setError(normalizeError(assignError, 'Не удалось назначить пользователя объекту.'))
    } finally {
      setIsAssigning(false)
    }
  }

  function openRevokeModal(edgeServer: CanonicalAdminEdgeServer) {
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
      setError(normalizeError(revokeError, 'Не удалось отозвать доступ пользователя.'))
    } finally {
      setIsRevoking(false)
    }
  }

  function getEdgeAvailabilitySnapshot(edge: CanonicalAdminEdgeServer) {
    const snapshot = getSnapshot(edge._id)
    if (snapshot.online === null) {
      return edge.availability
    }

    return snapshot
  }

  function isEdgeOnline(edge: CanonicalAdminEdgeServer): boolean {
    const availability = getEdgeAvailabilitySnapshot(edge)
    return availability.online === true
  }

  function getEdgeLastSeenAt(edge: CanonicalAdminEdgeServer): string | null {
    const availability = getEdgeAvailabilitySnapshot(edge)
    return availability.lastSeenAt
  }

  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Объекты</h1>
          <p className="text-sm text-[#94a3b8]">
            Регистрируйте объекты, ротируйте ключи, блокируйте доступ и управляйте назначениями пользователей.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void handleRefresh()}
            disabled={isRefreshing || isLoading}
            className="rounded-md border border-[var(--color-surface-border)] px-3 py-2 text-sm text-white hover:bg-[var(--color-surface-200)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isRefreshing ? 'Обновление...' : 'Обновить'}
          </button>
          <button
            type="button"
            onClick={() => setRegisterOpen(true)}
            className="rounded-md bg-[var(--color-brand-600)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-brand-500)]"
          >
            Зарегистрировать объект
          </button>
        </div>
      </header>

      {error && (
        <p className="mb-4 rounded-md border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 px-3 py-2 text-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}

      {latestDisclosure && (
        <section className="mb-4 rounded-lg border border-[var(--color-brand-600)]/40 bg-[var(--color-brand-600)]/10 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-white">Одноразовый постоянный ключ</h2>
              <p className="mt-1 text-xs text-[#cbd5e1]">
                Сохраните секрет сейчас. Он показывается только после регистрации, ротации или разблокировки.
              </p>
            </div>
            <button
              type="button"
              onClick={hideLatestDisclosure}
              className="rounded-md border border-[var(--color-surface-border)] px-2 py-1 text-xs text-white hover:bg-[var(--color-surface-200)]"
            >
              Скрыть секрет
            </button>
          </div>

          <dl className="mt-3 grid gap-2 text-xs text-[#e2e8f0] sm:grid-cols-2">
            <div>
              <dt className="text-[#94a3b8]">ID объекта</dt>
              <dd className="font-mono">{latestDisclosure.persistentCredential.edgeId}</dd>
            </div>
            <div>
              <dt className="text-[#94a3b8]">Версия</dt>
              <dd>v{latestDisclosure.persistentCredential.version}</dd>
            </div>
            <div>
              <dt className="text-[#94a3b8]">Выпущен</dt>
              <dd>{formatUtcTimestamp(latestDisclosure.persistentCredential.issuedAt)}</dd>
            </div>
            <div>
              <dt className="text-[#94a3b8]">Состояние</dt>
              <dd>{getEdgeLifecycleDisplayLabel(latestDisclosure.edge.lifecycleState)}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-[#94a3b8]">Секрет ключа</dt>
              <dd className="mt-1 rounded-md bg-black/30 px-2 py-2 font-mono">
                {latestDisclosure.persistentCredential.credentialSecret}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-[#94a3b8]">Инструкции</dt>
              <dd>{latestDisclosure.persistentCredential.instructions}</dd>
            </div>
          </dl>

          <div className="mt-3 space-y-2 text-xs text-[#e2e8f0]">
            <label className="block text-[#94a3b8]" htmlFor="edge-installer-json">
              JSON установщика
            </label>
            <textarea
              id="edge-installer-json"
              aria-label="JSON установщика"
              readOnly
              value={installerJson}
              rows={12}
              className="w-full resize-y rounded-md border border-[var(--color-surface-border)] bg-black/30 px-2 py-2 font-mono text-xs text-[#e2e8f0]"
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleCopyInstallerJson}
                className="rounded-md border border-[var(--color-brand-600)]/50 px-2 py-1.5 text-xs text-[var(--color-brand-300)] hover:bg-[var(--color-brand-600)]/10"
              >
                Скопировать JSON установщика
              </button>
              {installerJsonCopyStatus === 'copied' && (
                <span className="text-xs text-[var(--color-online)]">JSON установщика скопирован.</span>
              )}
              {installerJsonCopyStatus === 'failed' && (
                <span className="text-xs text-[var(--color-danger)]">
                  Не удалось скопировать. Выделите и скопируйте JSON установщика вручную.
                </span>
              )}
            </div>
          </div>
        </section>
      )}

      <div className="overflow-x-auto rounded-lg border border-[var(--color-surface-border)] bg-[var(--color-surface-100)]">
        <table className="min-w-full text-left text-sm text-[#e2e8f0]">
          <thead className="bg-[var(--color-surface-200)] text-xs uppercase tracking-wide text-[#94a3b8]">
            <tr>
              <th className="px-3 py-3">Название</th>
              <th className="px-3 py-3">Состояние</th>
              <th className="px-3 py-3">Доступность</th>
              <th className="px-3 py-3">Постоянный ключ</th>
              <th className="px-3 py-3">Назначенные пользователи</th>
              <th className="px-3 py-3">Зарегистрировал</th>
              <th className="px-3 py-3">Действия</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td className="px-3 py-6 text-[#94a3b8]" colSpan={7}>
                  Загрузка объектов...
                </td>
              </tr>
            ) : edgeServers.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-[#94a3b8]" colSpan={7}>
                  Объекты пока не зарегистрированы.
                </td>
              </tr>
            ) : (
              edgeServers.map((edge) => {
                const assignedUsers = getAssignedUsers(edge)
                const online = isEdgeOnline(edge)
                const createdByEmail =
                  typeof edge.createdBy === 'object' && edge.createdBy && 'email' in edge.createdBy
                    ? edge.createdBy.email
                    : 'Неизвестно'
                const isCredentialActionInProgress = credentialActionEdgeId === edge._id
                const canRotateCredential = edge.lifecycleState === 'Active'
                const canBlockEdge = edge.lifecycleState === 'Active'
                const canUnblockEdge = edge.lifecycleState === 'Blocked'

                return (
                  <tr key={edge._id} className="border-t border-[var(--color-surface-border)]">
                    <td className="px-3 py-3 text-white">{edge.name}</td>
                    <td className="px-3 py-3">
                      <span className={lifecycleBadgeClass(edge.lifecycleState)}>
                        {getEdgeLifecycleDisplayLabel(edge.lifecycleState)}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="space-y-1">
                        <span
                          className={
                            online
                              ? 'rounded-full bg-[var(--color-online)]/10 px-2 py-1 text-xs text-[var(--color-online)]'
                              : 'rounded-full bg-[var(--color-offline)]/10 px-2 py-1 text-xs text-[var(--color-offline)]'
                          }
                        >
                          {getEdgeAvailabilityDisplayLabel(online ? 'Online' : 'Offline')}
                        </span>
                        <p className="text-xs text-[#94a3b8]">
                          Последний сигнал: {formatUtcTimestamp(getEdgeLastSeenAt(edge))}
                        </p>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs text-[#cbd5e1]">
                      {typeof edge.persistentCredentialVersion === 'number' ? (
                        <span>v{edge.persistentCredentialVersion}</span>
                      ) : (
                        <span className="text-[#94a3b8]">Не выпущен</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-[#cbd5e1]">
                      {assignedUsers.length === 0
                        ? 'Не назначены'
                        : assignedUsers.map((user) => user.email).join(', ')}
                    </td>
                    <td className="px-3 py-3 text-[#94a3b8]">{createdByEmail}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {canRotateCredential ? (
                          <button
                            type="button"
                            onClick={() => void handleCredentialAction(edge._id, 'rotate')}
                            disabled={Boolean(credentialActionEdgeId)}
                            className="rounded-md border border-[var(--color-brand-600)]/50 px-2 py-1.5 text-xs text-[var(--color-brand-300)] hover:bg-[var(--color-brand-600)]/10 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {isCredentialActionInProgress && credentialAction === 'rotate'
                              ? credentialActionPendingLabel('rotate')
                              : 'Ротировать ключ'}
                          </button>
                        ) : null}
                        {canBlockEdge ? (
                          <button
                            type="button"
                            onClick={() => void handleCredentialAction(edge._id, 'block')}
                            disabled={Boolean(credentialActionEdgeId)}
                            className="rounded-md border border-[var(--color-danger)]/40 px-2 py-1.5 text-xs text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {isCredentialActionInProgress && credentialAction === 'block'
                              ? credentialActionPendingLabel('block')
                              : 'Заблокировать объект'}
                          </button>
                        ) : null}
                        {canUnblockEdge ? (
                          <button
                            type="button"
                            onClick={() => void handleCredentialAction(edge._id, 'unblock')}
                            disabled={Boolean(credentialActionEdgeId)}
                            className="rounded-md border border-[var(--color-brand-600)]/50 px-2 py-1.5 text-xs text-[var(--color-brand-300)] hover:bg-[var(--color-brand-600)]/10 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {isCredentialActionInProgress && credentialAction === 'unblock'
                              ? credentialActionPendingLabel('unblock')
                              : 'Разблокировать объект'}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => openAssignModal(edge._id)}
                          disabled={Boolean(credentialActionEdgeId)}
                          className="rounded-md border border-[var(--color-surface-border)] px-2 py-1.5 text-xs text-white hover:bg-[var(--color-surface-200)]"
                        >
                          Назначить пользователю
                        </button>
                        <button
                          type="button"
                          disabled={assignedUsers.length === 0 || Boolean(credentialActionEdgeId)}
                          onClick={() => openRevokeModal(edge)}
                          className="rounded-md border border-[var(--color-danger)]/40 px-2 py-1.5 text-xs text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Удалить доступ пользователя
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
            <h2 className="text-base font-semibold text-white">Зарегистрировать объект</h2>
            <p className="mt-1 text-sm text-[#94a3b8]">
              Создайте новый объект и получите одноразовый постоянный ключ.
            </p>

            <form className="mt-4 space-y-3" onSubmit={(event) => void handleRegisterSubmit(event)}>
              <label className="block text-sm text-[#cbd5e1]">
                Название
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

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setRegisterOpen(false)
                    setRegisterForm(INITIAL_REGISTER_FORM)
                  }}
                  className="rounded-md border border-[var(--color-surface-border)] px-3 py-2 text-sm text-white hover:bg-[var(--color-surface-200)]"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={isRegistering}
                  className="rounded-md bg-[var(--color-brand-600)] px-3 py-2 text-sm text-white hover:bg-[var(--color-brand-500)] disabled:opacity-60"
                >
                  {isRegistering ? 'Регистрация...' : 'Зарегистрировать'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {assignOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-lg border border-[var(--color-surface-border)] bg-[var(--color-surface-100)] p-4">
            <h2 className="text-base font-semibold text-white">Назначить объект</h2>
            <p className="mt-1 text-sm text-[#94a3b8]">Предоставьте пользователю доступ к этому объекту.</p>

            <form className="mt-4 space-y-3" onSubmit={(event) => void handleAssignSubmit(event)}>
              <label className="block text-sm text-[#cbd5e1]">
                Пользователь
                <select
                  value={assignUserId}
                  required
                  onChange={(event) => setAssignUserId(event.target.value)}
                  className="mt-1 w-full rounded-md border border-[var(--color-surface-border)] bg-[var(--color-surface-200)] px-3 py-2 text-sm text-white"
                >
                  <option value="">Выберите пользователя</option>
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
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={isAssigning || !assignUserId}
                  className="rounded-md bg-[var(--color-brand-600)] px-3 py-2 text-sm text-white hover:bg-[var(--color-brand-500)] disabled:opacity-60"
                >
                  {isAssigning ? 'Назначение...' : 'Назначить'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {revokeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-lg border border-[var(--color-surface-border)] bg-[var(--color-surface-100)] p-4">
            <h2 className="text-base font-semibold text-white">Удалить доступ пользователя</h2>
            <p className="mt-1 text-sm text-[#94a3b8]">
              Удалите пользователя из этого объекта и отзовите его доступ.
            </p>

            <form className="mt-4 space-y-3" onSubmit={(event) => void handleRevokeSubmit(event)}>
              <label className="block text-sm text-[#cbd5e1]">
                Назначенный пользователь
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
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={isRevoking || !revokeUserId}
                  className="rounded-md border border-[var(--color-danger)]/40 px-3 py-2 text-sm text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 disabled:opacity-60"
                >
                  {isRevoking ? 'Отзыв...' : 'Отозвать'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  )
}
