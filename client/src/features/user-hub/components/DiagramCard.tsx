import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, ExternalLink, Pencil, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { deleteDiagram } from '@/shared/api/diagrams'
import {
  canOpenDashboardForEdgeContext,
  getDashboardHandoffNote,
  getEdgeAvailabilityBadgeClass,
  getEdgeAvailabilityDisplayLabel,
  getEdgeAvailabilityLabel,
  getEdgeLifecycleBadgeClass,
  getEdgeLifecycleDisplayLabel,
  type EdgeConsumerContextStatus,
} from '@/shared/edgePresentation'

export interface TelemetryProfileEntry {
  telemetryProfileId: string
  monitoredObjectId: string
  monitoredObjectName: string
  isOnline?: boolean
  edgeContextStatus?: EdgeConsumerContextStatus
  lifecycleState?: 'Active' | 'Blocked'
  availabilityLabel?: 'Online' | 'Offline' | 'Unknown'
  lastSeenAt?: string | null
}

export interface DiagramCardModel {
  id: string
  name: string
  thumbnailUrl?: string
  telemetryProfiles: TelemetryProfileEntry[]
}

interface DiagramCardProps {
  diagram: DiagramCardModel
  onOpenDashboard: (profile: TelemetryProfileEntry) => void
  onEditBindings: (profile: TelemetryProfileEntry) => void
  onDeleteTelemetryProfile: (profile: TelemetryProfileEntry) => void
  canEditDiagram?: (diagram: DiagramCardModel) => boolean
  onDiagramDeleted?: (diagramId: string) => void
  onRenameDiagram?: (diagramId: string, name: string) => Promise<void> | void
}

export function DiagramCard({
  diagram,
  onOpenDashboard,
  onEditBindings,
  onDeleteTelemetryProfile,
  canEditDiagram,
  onDiagramDeleted,
  onRenameDiagram,
}: DiagramCardProps) {
  const [profilesOpen, setProfilesOpen] = useState(false)
  const [isDeletingDiagram, setIsDeletingDiagram] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [isEditingName, setIsEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(diagram.name)
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameError, setRenameError] = useState<string | null>(null)
  const nameInputRef = useRef<HTMLInputElement | null>(null)
  const navigate = useNavigate()
  const canEdit = canEditDiagram ? canEditDiagram(diagram) : true

  useEffect(() => {
    if (!isEditingName) {
      setNameDraft(diagram.name)
    }
  }, [diagram.name, isEditingName])

  useEffect(() => {
    if (!isEditingName || !nameInputRef.current) {
      return
    }

    nameInputRef.current.focus()
    nameInputRef.current.select()
  }, [isEditingName])

  function handleEditLayout() {
    if (!canEdit) {
      return
    }

    navigate(`/hub/editor/${diagram.id}`)
  }

  async function handleDeleteDiagram() {
    if (isDeletingDiagram) {
      return
    }

    const isConfirmed = window.confirm(
      `Удалить мнемосхему "${diagram.name}" без возможности восстановления?`,
    )
    if (!isConfirmed) {
      return
    }

    setDeleteError(null)
    setIsDeletingDiagram(true)

    // Optimistic removal is delegated to parent list state.
    onDiagramDeleted?.(diagram.id)

    try {
      await deleteDiagram(diagram.id)
    } catch {
      setDeleteError('Не удалось удалить мнемосхему. Обновите страницу и попробуйте еще раз.')
    } finally {
      setIsDeletingDiagram(false)
    }
  }

  function startRename() {
    if (!canEdit || isDeletingDiagram || isRenaming) {
      return
    }

    setRenameError(null)
    setNameDraft(diagram.name)
    setIsEditingName(true)
  }

  function cancelRename() {
    if (isRenaming) {
      return
    }

    setRenameError(null)
    setNameDraft(diagram.name)
    setIsEditingName(false)
  }

  async function commitRename() {
    if (!isEditingName || isRenaming) {
      return
    }

    const nextName = nameDraft.trim()
    if (nextName.length === 0) {
      setRenameError('Название мнемосхемы не может быть пустым.')
      return
    }

    if (nextName === diagram.name) {
      setRenameError(null)
      setIsEditingName(false)
      return
    }

    if (!onRenameDiagram) {
      setIsEditingName(false)
      return
    }

    setRenameError(null)
    setIsRenaming(true)

    try {
      await onRenameDiagram(diagram.id, nextName)
      setIsEditingName(false)
    } catch {
      setRenameError('Не удалось переименовать мнемосхему. Попробуйте еще раз.')
    } finally {
      setIsRenaming(false)
    }
  }

  return (
    <article className="rounded-xl border border-[var(--color-surface-border)] bg-[var(--color-surface-100)] p-4">
      <div className="grid grid-cols-[6rem_minmax(0,1fr)] items-stretch gap-3">
        <div className="row-span-2 min-h-16 overflow-hidden rounded-md border border-[var(--color-surface-border)] bg-[var(--color-surface-200)]">
          {diagram.thumbnailUrl ? (
            <img
              src={diagram.thumbnailUrl}
              alt={`Миниатюра мнемосхемы ${diagram.name}`}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-[#94a3b8]">
              Нет превью
            </div>
          )}
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {isEditingName ? (
              <input
                ref={nameInputRef}
                type="text"
                value={nameDraft}
                disabled={isRenaming}
                onChange={(event) => setNameDraft(event.target.value)}
                onBlur={() => {
                  void commitRename()
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    event.currentTarget.blur()
                    return
                  }

                  if (event.key === 'Escape') {
                    event.preventDefault()
                    cancelRename()
                  }
                }}
                className="h-7 min-w-0 flex-1 rounded-md border border-[var(--color-surface-border)] bg-[var(--color-surface-200)] px-2 text-sm font-semibold text-white outline-none focus:border-[var(--color-brand-500)]"
                aria-label="Название мнемосхемы"
              />
            ) : (
              <h3 className="truncate text-base font-semibold text-white" title={diagram.name}>
                {diagram.name}
              </h3>
            )}

            {!isEditingName && (
              <button
                type="button"
                onClick={startRename}
                disabled={!canEdit || isDeletingDiagram}
                title={!canEdit ? 'Переименование недоступно из-за лимита мнемосхем' : 'Переименовать мнемосхему'}
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[var(--color-surface-border)] text-[#cbd5e1] hover:bg-[var(--color-surface-200)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
                aria-label="Переименовать мнемосхему"
              >
                <Pencil size={12} />
              </button>
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-wrap items-end justify-between gap-2">
          <p className="text-xs text-[#94a3b8]">
            Профили телеметрии: {diagram.telemetryProfiles.length}
          </p>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleEditLayout}
              disabled={!canEdit}
              title={!canEdit ? 'Редактирование недоступно из-за лимита мнемосхем' : undefined}
              className="inline-flex items-center gap-1 rounded-md border border-[var(--color-surface-border)] px-2.5 py-1.5 text-xs font-medium text-[#cbd5e1] hover:bg-[var(--color-surface-200)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
            >
              <Pencil size={12} />
              Редактировать схему
            </button>
            <button
              type="button"
              onClick={() => void handleDeleteDiagram()}
              disabled={isDeletingDiagram}
              className="inline-flex items-center gap-1 rounded-md border border-[var(--color-danger)]/40 px-2.5 py-1.5 text-xs font-medium text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Trash2 size={12} />
              {isDeletingDiagram ? 'Удаление...' : 'Удалить мнемосхему'}
            </button>
          </div>
        </div>
      </div>

      {deleteError && <p className="mt-2 text-xs text-[var(--color-danger)]">{deleteError}</p>}
      {renameError && <p className="mt-2 text-xs text-[var(--color-danger)]">{renameError}</p>}

      <div className="mt-4 rounded-lg border border-[var(--color-surface-border)] bg-[var(--color-surface-200)]">
        <button
          type="button"
          onClick={() => setProfilesOpen((open) => !open)}
          className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium text-white"
          aria-expanded={profilesOpen}
          aria-controls={`telemetry-profiles-${diagram.id}`}
        >
          <span>Профили телеметрии</span>
          {profilesOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {profilesOpen && (
          <div id={`telemetry-profiles-${diagram.id}`} className="border-t border-[var(--color-surface-border)] p-3">
            {diagram.telemetryProfiles.length === 0 ? (
              <p className="text-sm text-[#94a3b8]">
                Профилей телеметрии пока нет. Откройте конструктор, чтобы создать профиль.
              </p>
            ) : (
              <ul className="space-y-2">
                {diagram.telemetryProfiles.map((profile) => (
                  <li
                    key={profile.telemetryProfileId}
                    className="rounded-md border border-[var(--color-surface-border)] bg-[var(--color-surface-100)] p-3"
                  >
                    {(() => {
                      const availabilityLabel =
                        profile.availabilityLabel ?? getEdgeAvailabilityLabel(profile.isOnline)
                      const availabilityDisplayLabel = getEdgeAvailabilityDisplayLabel(availabilityLabel)
                      const dashboardDisabled = !canOpenDashboardForEdgeContext({
                        contextStatus: profile.edgeContextStatus,
                        lifecycleState: profile.lifecycleState,
                      })
                      const dashboardNote = getDashboardHandoffNote({
                        contextStatus: profile.edgeContextStatus,
                        lifecycleState: profile.lifecycleState,
                      })

                      return (
                        <>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-white">{profile.monitoredObjectName}</span>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {profile.lifecycleState && (
                          <span className={getEdgeLifecycleBadgeClass(profile.lifecycleState)}>
                            {getEdgeLifecycleDisplayLabel(profile.lifecycleState)}
                          </span>
                        )}
                        <span className={getEdgeAvailabilityBadgeClass(profile.isOnline ?? null)}>
                          {availabilityDisplayLabel}
                        </span>
                      </div>
                    </div>

                    {dashboardNote && (
                      <p className="mb-2 text-xs text-[var(--color-warning)]">
                        {dashboardNote}
                      </p>
                    )}

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (dashboardDisabled) {
                            return
                          }

                          onOpenDashboard(profile)
                        }}
                        disabled={dashboardDisabled}
                        title={dashboardDisabled ? dashboardNote ?? undefined : undefined}
                        className="inline-flex items-center gap-1 rounded-md bg-[var(--color-brand-600)] px-2.5 py-1.5 text-xs font-medium text-white hover:bg-[var(--color-brand-500)] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <ExternalLink size={12} />
                        Открыть диспетчеризацию
                      </button>
                      <button
                        type="button"
                        onClick={() => onEditBindings(profile)}
                        className="inline-flex items-center gap-1 rounded-md border border-[var(--color-surface-border)] px-2.5 py-1.5 text-xs font-medium text-[#cbd5e1] hover:bg-[var(--color-surface-200)]"
                      >
                        <Pencil size={12} />
                        Редактировать привязки
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteTelemetryProfile(profile)}
                        className="inline-flex items-center gap-1 rounded-md border border-[var(--color-danger)]/40 px-2.5 py-1.5 text-xs font-medium text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10"
                      >
                        <Trash2 size={12} />
                        Удалить профиль телеметрии
                      </button>
                    </div>
                        </>
                      )
                    })()}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </article>
  )
}
