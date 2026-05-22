import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  createDiagram,
  getDiagrams,
  getDiagramById,
  updateDiagram,
  type Diagram,
} from '@/shared/api/diagrams'
import { deleteBinding, getBindingsByDiagram } from '@/shared/api/bindings'
import { getAssignedEdgeServers } from '@/shared/api/edgeServers'
import {
  getEdgeAvailabilityLabel,
  type EdgeConsumerContextStatus,
} from '@/shared/edgePresentation'
import { useDiagramLimits } from '@/shared/hooks/useDiagramLimits'
import {
  DiagramCard,
  type DiagramCardModel,
  type TelemetryProfileEntry,
} from '@/features/user-hub/components/DiagramCard'
import {
  DISPATCH_DASHBOARD_TAB,
  getDispatchTabPath,
} from '@/features/dispatch/model/routes'
import { getErrorDisplayMessage } from '@/shared/api/errorMessages'

interface DiagramCardState extends DiagramCardModel {
  updatedAt: string
  version: number | null
}

function toUpdatedAt(diagram: Diagram): string {
  return diagram.updatedAt ?? diagram.createdAt ?? new Date(0).toISOString()
}

function toCardModel(diagram: Diagram, profiles: TelemetryProfileEntry[]): DiagramCardState {
  return {
    id: diagram._id,
    name: diagram.name,
    thumbnailUrl: undefined,
    telemetryProfiles: profiles,
    updatedAt: toUpdatedAt(diagram),
    version: typeof diagram.__v === 'number' ? diagram.__v : null,
  }
}

function toErrorMessage(error: unknown, fallback: string): string {
  return getErrorDisplayMessage(error, fallback)
}

export function GalleryPage() {
  const navigate = useNavigate()
  const [cards, setCards] = useState<DiagramCardState[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)

  const diagramLimitSource = useMemo(
    () => cards.map((card) => ({ id: card.id, updatedAt: card.updatedAt })),
    [cards],
  )
  const { canCreate, canEdit } = useDiagramLimits(diagramLimitSource)

  const loadGallery = useCallback(async () => {
    setError(null)
    setIsLoading(true)

    try {
      const [diagrams, trustedEdges] = await Promise.all([
        getDiagrams(),
        getAssignedEdgeServers()
          .then((rows) => rows)
          .catch(() => null),
      ])
      const trustedEdgeMap = new Map(
        (trustedEdges ?? []).map((edge) => [
          edge._id,
          {
            name: edge.name,
            isOnline: edge.availability.online,
            lifecycleState: edge.lifecycleState,
            availabilityLabel: getEdgeAvailabilityLabel(edge.availability.online),
            lastSeenAt: edge.availability.lastSeenAt,
          },
        ]),
      )

      const cardsWithProfiles = await Promise.all(
        diagrams.map(async (diagram) => {
          try {
            const bindings = await getBindingsByDiagram(diagram._id)
            const telemetryProfiles: TelemetryProfileEntry[] = bindings.map((binding) => {
              const edgeContext = trustedEdgeMap.get(binding.edgeServerId)
              const edgeContextStatus: EdgeConsumerContextStatus = edgeContext
                ? 'resolved'
                : 'unresolved'

              return {
                telemetryProfileId: binding._id,
                monitoredObjectId: binding.edgeServerId,
                monitoredObjectName: edgeContext?.name ?? binding.edgeServerId,
                edgeContextStatus,
                isOnline: edgeContext?.isOnline,
                lifecycleState: edgeContext?.lifecycleState,
                availabilityLabel: edgeContext?.availabilityLabel ?? 'Unknown',
                lastSeenAt: edgeContext?.lastSeenAt ?? null,
              }
            })
            return toCardModel(diagram, telemetryProfiles)
          } catch {
            return toCardModel(diagram, [])
          }
        }),
      )

      setCards(cardsWithProfiles)
    } catch {
      setError('Не удалось загрузить галерею мнемосхем. Обновите страницу.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadGallery()
  }, [loadGallery])

  async function handleCreateDiagram() {
    if (!canCreate() || isCreating) {
      return
    }

    setCreateError(null)
    setIsCreating(true)

    try {
      const created = await createDiagram({
        name: `Новая мнемосхема ${cards.length + 1}`,
        layout: {},
      })

      setCards((prev) => [toCardModel(created, []), ...prev])
    } catch {
      setCreateError('Не удалось создать мнемосхему. Попробуйте еще раз.')
    } finally {
      setIsCreating(false)
    }
  }

  async function handleDeleteTelemetryProfile(
    diagramId: string,
    profile: TelemetryProfileEntry,
  ) {
    const confirmed = window.confirm(
      `Удалить профиль телеметрии для "${profile.monitoredObjectName}"?`,
    )

    if (!confirmed) {
      return
    }

    try {
      await deleteBinding(diagramId, profile.monitoredObjectId)
      setCards((prev) =>
        prev.map((card) =>
          card.id === diagramId
            ? {
                ...card,
                telemetryProfiles: card.telemetryProfiles.filter(
                  (item) => item.telemetryProfileId !== profile.telemetryProfileId,
                ),
              }
            : card,
        ),
      )
    } catch {
      setError('Не удалось удалить профиль телеметрии.')
    }
  }

  async function handleRenameDiagram(diagramId: string, nextName: string) {
    const trimmedName = nextName.trim()
    if (trimmedName.length === 0) {
      throw new Error('Название мнемосхемы не может быть пустым.')
    }

    const card = cards.find((item) => item.id === diagramId)
    if (!card) {
      throw new Error('Карточка мнемосхемы не найдена.')
    }

    let version = card.version
    if (version === null) {
      const latest = await getDiagramById(diagramId)
      version = latest.__v
    }

    try {
      await updateDiagram(diagramId, {
        name: trimmedName,
        __v: version,
      })
    } catch (renameError) {
      throw new Error(toErrorMessage(renameError, 'Не удалось переименовать мнемосхему.'))
    }

    const refreshed = await getDiagramById(diagramId)
    setCards((prev) =>
      prev.map((item) =>
        item.id === diagramId
          ? {
              ...item,
              name: refreshed.name,
              updatedAt: toUpdatedAt(refreshed),
              version: refreshed.__v,
            }
          : item,
      ),
    )
  }

  const isCreateDisabled = !canCreate() || isCreating

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Мнемосхемы</h1>
          <p className="text-sm text-[#94a3b8]">
            Управляйте мнемосхемами и профилями телеметрии.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void handleCreateDiagram()}
          disabled={isCreateDisabled}
          className="rounded-md bg-[var(--color-brand-600)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-brand-500)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isCreating ? 'Создание...' : 'Создать мнемосхему'}
        </button>
      </div>

      {!canCreate() && (
        <div className="mb-4 rounded-md border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 px-3 py-2 text-sm text-[var(--color-warning)]">
          Достигнут лимит тарифа Free: максимум 3 мнемосхемы.
        </div>
      )}

      {createError && (
        <div className="mb-4 rounded-md border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 px-3 py-2 text-sm text-[var(--color-danger)]">
          {createError}
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-md border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 px-3 py-2 text-sm text-[var(--color-danger)]">
          {error}
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-[#94a3b8]">Загрузка мнемосхем...</p>
      ) : cards.length === 0 ? (
        <p className="rounded-md border border-dashed border-[var(--color-surface-border)] p-6 text-sm text-[#94a3b8]">
          Мнемосхем пока нет. Создайте первую мнемосхему, чтобы начать работу.
        </p>
      ) : (
        <div className="grid items-start gap-4 md:grid-cols-2">
          {cards.map((diagram) => (
            <DiagramCard
              key={diagram.id}
              diagram={diagram}
              canEditDiagram={(item) => canEdit({ id: item.id, updatedAt: diagram.updatedAt })}
              onDiagramDeleted={(diagramId) =>
                setCards((prev) => prev.filter((item) => item.id !== diagramId))
              }
              onOpenDashboard={(profile) =>
                navigate(
                  `${getDispatchTabPath(DISPATCH_DASHBOARD_TAB)}?${new URLSearchParams({
                    diagramId: diagram.id,
                    edgeId: profile.monitoredObjectId,
                  }).toString()}`,
                )
              }
              onEditBindings={(profile) =>
                navigate(`/hub/editor/${diagram.id}?edgeId=${profile.monitoredObjectId}`)
              }
              onDeleteTelemetryProfile={(profile) =>
                void handleDeleteTelemetryProfile(diagram.id, profile)
              }
              onRenameDiagram={(diagramId, name) => handleRenameDiagram(diagramId, name)}
            />
          ))}
        </div>
      )}
    </section>
  )
}
