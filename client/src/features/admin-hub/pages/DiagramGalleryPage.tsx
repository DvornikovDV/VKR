import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { isApiError } from '@/shared/api/client'
import { getErrorDisplayMessage } from '@/shared/api/errorMessages'
import {
  assignDiagramToUser,
  getDiagrams,
  type Diagram,
} from '@/shared/api/diagrams'
import { getUsersPage, type UserRow } from '@/shared/api/users'
import { SaveAsDialog } from '@/shared/components/SaveAsDialog'
import { useAdminDiagramCreation } from '@/features/admin-hub/useAdminDiagramCreation'

const ASSIGNMENT_PAGE_SIZE = 20

function normalizeError(error: unknown, fallback: string): string {
  return getErrorDisplayMessage(error, fallback)
}

export function DiagramGalleryPage() {
  const creation = useAdminDiagramCreation()
  const [diagrams, setDiagrams] = useState<Diagram[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [assignOpen, setAssignOpen] = useState(false)
  const [selectedDiagramId, setSelectedDiagramId] = useState('')
  const [selectedUserId, setSelectedUserId] = useState('')
  const [candidateUsers, setCandidateUsers] = useState<UserRow[]>([])
  const [candidateSearchInput, setCandidateSearchInput] = useState('')
  const [candidateSearchQuery, setCandidateSearchQuery] = useState('')
  const [candidatePage, setCandidatePage] = useState(1)
  const [candidateTotal, setCandidateTotal] = useState(0)
  const [isLoadingCandidates, setIsLoadingCandidates] = useState(false)
  const [isAssigning, setIsAssigning] = useState(false)
  const [candidateError, setCandidateError] = useState<string | null>(null)
  const [assignmentError, setAssignmentError] = useState<string | null>(null)

  const selectedUser = useMemo(
    () => candidateUsers.find((user) => user._id === selectedUserId) ?? null,
    [candidateUsers, selectedUserId],
  )

  const loadData = useCallback(async () => {
    setError(null)

    try {
      setDiagrams(await getDiagrams())
    } catch (loadError) {
      setError(normalizeError(loadError, 'Не удалось загрузить галерею мнемосхем администратора.'))
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

  useEffect(() => {
    if (!assignOpen) {
      return
    }

    let cancelled = false

    async function loadCandidates() {
      setIsLoadingCandidates(true)
      setCandidateError(null)

      try {
        const result = await getUsersPage({
          search: candidateSearchQuery || undefined,
          page: candidatePage,
          limit: ASSIGNMENT_PAGE_SIZE,
          role: 'USER',
          activeOnly: true,
        })

        if (!cancelled) {
          setCandidateUsers(result.data)
          setCandidateTotal(result.total)
          setSelectedUserId('')
          setCandidateError(null)
        }
      } catch (loadError) {
        if (!cancelled) {
          setCandidateUsers([])
          setCandidateTotal(0)
          setCandidateError(normalizeError(loadError, 'Не удалось загрузить кандидатов для назначения.'))
        }
      } finally {
        if (!cancelled) {
          setIsLoadingCandidates(false)
        }
      }
    }

    void loadCandidates()

    return () => {
      cancelled = true
    }
  }, [assignOpen, candidatePage, candidateSearchQuery])

  function openAssignModal(diagramId: string) {
    setSelectedDiagramId(diagramId)
    setSelectedUserId('')
    setCandidateSearchInput('')
    setCandidateSearchQuery('')
    setCandidatePage(1)
    setCandidateError(null)
    setAssignmentError(null)
    setAssignOpen(true)
  }

  function closeAssignModal() {
    setAssignOpen(false)
    setSelectedDiagramId('')
    setSelectedUserId('')
    setCandidateError(null)
    setAssignmentError(null)
  }

  function submitCandidateSearch() {
    setAssignmentError(null)
    setCandidatePage(1)
    setCandidateSearchQuery(candidateSearchInput.trim())
  }

  async function handleAssignSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!selectedDiagramId || !selectedUserId || !selectedUser || isAssigning) {
      return
    }

    setAssignmentError(null)
    setIsAssigning(true)

    try {
      await assignDiagramToUser(selectedDiagramId, { targetUserId: selectedUserId })
      closeAssignModal()
    } catch (assignError) {
      if (isApiError(assignError) && assignError.status === 403) {
        setAssignmentError(
          'Назначение отклонено сервером. У пользователя может не быть свободной квоты или он больше не подходит для назначения.',
        )
      } else {
        setAssignmentError(normalizeError(assignError, 'Не удалось назначить мнемосхему пользователю.'))
      }
    } finally {
      setIsAssigning(false)
    }
  }

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-6">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Мнемосхемы администратора</h1>
          <p className="text-sm text-[#94a3b8]">
            Управляйте своими шаблонами мнемосхем и назначайте независимые копии пользователям.
          </p>
        </div>
        <button
          type="button"
          onClick={creation.open}
          className="rounded-md bg-[var(--color-brand-600)] px-3 py-2 text-sm text-white hover:bg-[var(--color-brand-500)]"
        >
          Создать мнемосхему
        </button>
      </header>

      {error && (
        <p className="mb-4 rounded-md border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 px-3 py-2 text-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}

      {isLoading ? (
        <p className="text-sm text-[#94a3b8]">Загрузка мнемосхем...</p>
      ) : diagrams.length === 0 ? (
        <p className="rounded-md border border-dashed border-[var(--color-surface-border)] p-6 text-sm text-[#94a3b8]">
          У вас пока нет мнемосхем.
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
                    Редактировать
                  </Link>
                  <button
                    type="button"
                    onClick={() => openAssignModal(diagram._id)}
                    className="rounded-md bg-[var(--color-brand-600)] px-2.5 py-1.5 text-xs text-white hover:bg-[var(--color-brand-500)]"
                  >
                    Назначить пользователю
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
            <h2 className="text-base font-semibold text-white">Назначить мнемосхему</h2>
            <p className="mt-1 text-sm text-[#94a3b8]">
              Cloud проверит актуальную доступность пользователя и квоту при назначении.
            </p>

            <form className="mt-4 space-y-3" onSubmit={(event) => void handleAssignSubmit(event)}>
              <div className="flex gap-2">
                <input
                  type="search"
                  value={candidateSearchInput}
                  onChange={(event) => setCandidateSearchInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      submitCandidateSearch()
                    }
                  }}
                  aria-label="Поиск пользователей для назначения"
                  placeholder="Поиск по email"
                  className="min-w-0 flex-1 rounded-md border border-[var(--color-surface-border)] bg-[var(--color-surface-200)] px-3 py-2 text-sm text-white"
                />
                <button
                  type="button"
                  onClick={submitCandidateSearch}
                  className="rounded-md border border-[var(--color-surface-border)] px-3 py-2 text-sm text-white hover:bg-[var(--color-surface-200)]"
                >
                  Найти
                </button>
              </div>

              <label className="block text-sm text-[#cbd5e1]">
                Пользователь
                <select
                  value={selectedUserId}
                  required
                  disabled={isLoadingCandidates}
                  onChange={(event) => {
                    setSelectedUserId(event.target.value)
                    setAssignmentError(null)
                  }}
                  className="mt-1 w-full rounded-md border border-[var(--color-surface-border)] bg-[var(--color-surface-200)] px-3 py-2 text-sm text-white"
                >
                  <option value="">Выберите пользователя</option>
                  {candidateUsers.map((user) => (
                    <option key={user._id} value={user._id}>
                      {user.email} ({user.subscriptionTier})
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex items-center justify-between text-xs text-[#94a3b8]">
                <span>{isLoadingCandidates ? 'Загрузка кандидатов...' : `Найдено: ${candidateTotal}`}</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={candidatePage <= 1 || isLoadingCandidates}
                    onClick={() => setCandidatePage((page) => Math.max(1, page - 1))}
                    className="rounded border border-[var(--color-surface-border)] px-2 py-1 text-white disabled:opacity-50"
                  >
                    Назад
                  </button>
                  <button
                    type="button"
                    disabled={candidatePage * ASSIGNMENT_PAGE_SIZE >= candidateTotal || isLoadingCandidates}
                    onClick={() => setCandidatePage((page) => page + 1)}
                    className="rounded border border-[var(--color-surface-border)] px-2 py-1 text-white disabled:opacity-50"
                  >
                    Вперед
                  </button>
                </div>
              </div>

              {candidateError && (
                <p className="rounded-md border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 px-3 py-2 text-sm text-[var(--color-danger)]">
                  {candidateError}
                </p>
              )}

              {assignmentError && (
                <p className="rounded-md border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 px-3 py-2 text-sm text-[var(--color-danger)]">
                  {assignmentError}
                </p>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeAssignModal}
                  className="rounded-md border border-[var(--color-surface-border)] px-3 py-2 text-sm text-white hover:bg-[var(--color-surface-200)]"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={isAssigning || !selectedUser}
                  className="rounded-md bg-[var(--color-brand-600)] px-3 py-2 text-sm text-white hover:bg-[var(--color-brand-500)] disabled:opacity-60"
                >
                  {isAssigning ? 'Назначение...' : 'Назначить'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
