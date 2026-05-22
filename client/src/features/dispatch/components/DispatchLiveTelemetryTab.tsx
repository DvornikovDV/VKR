import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import type {
  DashboardEdgeAvailability,
  DashboardTransportStatus,
  DashboardTrustedEdgeServer,
} from '@/features/dashboard/model/types'
import { DispatchLiveTelemetryTable } from '@/features/dispatch/components/DispatchLiveTelemetryTable'
import { DispatchLiveTelemetryToolbar } from '@/features/dispatch/components/DispatchLiveTelemetryToolbar'
import { useDispatchLiveTelemetrySession } from '@/features/dispatch/hooks/useDispatchLiveTelemetrySession'
import {
  countDispatchLiveTelemetryWaitingRows,
  createDispatchLiveTelemetryContextKey,
  selectDispatchLiveTelemetryBindingPairs,
  type DispatchLiveTelemetryRow,
} from '@/features/dispatch/model/liveTelemetry'
import type { DispatchWorkspaceContextSnapshot } from '@/features/dispatch/model/types'

interface DispatchLiveTelemetryTabProps {
  workspaceContext: DispatchWorkspaceContextSnapshot
  className?: string
}

interface DispatchLiveTelemetryViewState {
  contextKey: string | null
  isPaused: boolean
  visibleRows: DispatchLiveTelemetryRow[]
  pausedSnapshotRows: DispatchLiveTelemetryRow[]
}

function getContextValue(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : null
}

function createViewState(contextKey: string | null): DispatchLiveTelemetryViewState {
  return {
    contextKey,
    isPaused: false,
    visibleRows: [],
    pausedSnapshotRows: [],
  }
}

function createTelemetryContextKey(
  diagramId: string | null,
  edgeId: string | null,
  bindingProfileId: string | null,
): string | null {
  if (!diagramId || !edgeId || !bindingProfileId) {
    return null
  }

  return createDispatchLiveTelemetryContextKey({
    diagramId,
    edgeId,
    bindingProfileId,
  })
}

function getSelectedEdgeAvailability(
  selectedEdge: DashboardTrustedEdgeServer | null,
): DashboardEdgeAvailability {
  if (!selectedEdge) {
    return 'unknown'
  }

  return selectedEdge.availability.online ? 'online' : 'offline'
}

function getValidationMessage(
  workspaceContext: DispatchWorkspaceContextSnapshot,
  relevantPairCount: number,
): string | null {
  if (workspaceContext.status === 'loading') {
    return 'Контекст диспетчеризации еще загружается.'
  }

  if (workspaceContext.errorMessage) {
    return workspaceContext.errorMessage
  }

  if (!getContextValue(workspaceContext.selection.diagramId)) {
    return 'Выберите мнемосхему перед запуском live-телеметрии.'
  }

  if (!getContextValue(workspaceContext.selection.edgeId)) {
    return 'Выберите объект перед запуском live-телеметрии.'
  }

  if (workspaceContext.status === 'ready' && !workspaceContext.selection.selectedEdge) {
    return 'Выберите доверенный объект перед запуском live-телеметрии.'
  }

  if (!workspaceContext.selection.selectedBindingProfile) {
    return 'Выберите сохраненный профиль привязок перед запуском live-телеметрии.'
  }

  if (relevantPairCount === 0) {
    return 'В выбранном профиле нет привязок виджетов к телеметрии.'
  }

  return null
}

export function DispatchLiveTelemetryTab({
  workspaceContext,
  className,
}: DispatchLiveTelemetryTabProps) {
  const selectedDiagramId = getContextValue(workspaceContext.selection.diagramId)
  const selectedEdgeId = getContextValue(workspaceContext.selection.edgeId)
  const selectedBindingProfile = workspaceContext.selection.selectedBindingProfile
  const selectedBindingProfileId = getContextValue(selectedBindingProfile?._id)
  const selectedEdgeAvailability = getSelectedEdgeAvailability(
    workspaceContext.selection.selectedEdge,
  )
  const relevantPairs = useMemo(
    () => selectDispatchLiveTelemetryBindingPairs(selectedBindingProfile),
    [selectedBindingProfile],
  )
  const validationMessage = useMemo(
    () => getValidationMessage(workspaceContext, relevantPairs.size),
    [relevantPairs.size, workspaceContext],
  )
  const streamEnabled = validationMessage === null
  const telemetryContextKey = useMemo(
    () => createTelemetryContextKey(selectedDiagramId, selectedEdgeId, selectedBindingProfileId),
    [selectedBindingProfileId, selectedDiagramId, selectedEdgeId],
  )
  const session = useDispatchLiveTelemetrySession({
    diagramId: selectedDiagramId,
    edgeId: selectedEdgeId,
    bindingProfile: selectedBindingProfile,
    enabled: streamEnabled,
  })
  const [viewState, setViewState] = useState<DispatchLiveTelemetryViewState>(() =>
    createViewState(telemetryContextKey),
  )
  const isActiveSessionContext =
    telemetryContextKey !== null && session.activeContextKey === telemetryContextKey
  const activeSessionRows = useMemo(
    () =>
      isActiveSessionContext
        ? session.rows
        : [],
    [isActiveSessionContext, session.rows],
  )
  const isViewStateCurrent = viewState.contextKey === telemetryContextKey
  const isPaused = isViewStateCurrent ? viewState.isPaused : false
  const visibleRows = isViewStateCurrent ? viewState.visibleRows : []
  const pausedSnapshotRows = isViewStateCurrent ? viewState.pausedSnapshotRows : []
  const activeRuntimeError = isActiveSessionContext ? session.runtimeError : null
  const transportStatus: DashboardTransportStatus = streamEnabled
    ? isActiveSessionContext
      ? session.transportStatus
      : 'connecting'
    : 'idle'

  useEffect(() => {
    setViewState(createViewState(telemetryContextKey))
  }, [telemetryContextKey])

  useEffect(() => {
    if (isPaused) {
      return
    }

    setViewState(() => ({
      contextKey: telemetryContextKey,
      isPaused: false,
      visibleRows: activeSessionRows,
      pausedSnapshotRows: activeSessionRows,
    }))
  }, [activeSessionRows, isPaused, telemetryContextKey])

  const handleTogglePaused = useCallback(() => {
    setViewState((current) => {
      const activeViewState =
        current.contextKey === telemetryContextKey
          ? current
          : createViewState(telemetryContextKey)

      if (activeViewState.isPaused) {
        return {
          contextKey: telemetryContextKey,
          isPaused: false,
          visibleRows: activeSessionRows,
          pausedSnapshotRows: activeSessionRows,
        }
      }

      return {
        ...activeViewState,
        isPaused: true,
        pausedSnapshotRows: activeViewState.visibleRows,
      }
    })
  }, [activeSessionRows, telemetryContextKey])

  const waitingCount = isPaused
    ? countDispatchLiveTelemetryWaitingRows(activeSessionRows, pausedSnapshotRows)
    : 0
  const isContextLoading = workspaceContext.status === 'loading'
  const shouldShowLoading = streamEnabled && transportStatus === 'connecting' && visibleRows.length === 0

  return (
    <section
      aria-label="Live-телеметрия диспетчеризации"
      data-testid="dispatch-live-telemetry-tab"
      data-diagram-id={selectedDiagramId ?? ''}
      data-edge-id={selectedEdgeId ?? ''}
      data-binding-profile-id={selectedBindingProfileId ?? ''}
      className={className ?? 'flex min-h-0 flex-1 flex-col bg-[#08111f]'}
    >
      <DispatchLiveTelemetryToolbar
        isPaused={isPaused}
        onTogglePaused={handleTogglePaused}
        disabled={!streamEnabled}
        visibleCount={visibleRows.length}
        waitingCount={waitingCount}
        transportStatus={transportStatus}
        edgeAvailability={selectedEdgeAvailability}
      />

      {validationMessage ? (
        <div
          data-testid={
            selectedDiagramId && selectedEdgeId
              ? 'dispatch-live-telemetry-empty-context'
              : 'dispatch-live-telemetry-no-selected-context'
          }
          role={isContextLoading ? undefined : 'alert'}
          className="mx-3 mt-3 rounded-md border border-[#334155] bg-[#0f172a] p-4 text-sm text-[#cbd5e1]"
        >
          {validationMessage}
        </div>
      ) : null}

      {activeRuntimeError ? (
        <div
          role="alert"
          data-testid="dispatch-live-telemetry-error"
          className="mx-3 mt-3 flex items-center gap-2 rounded-md border border-[var(--color-danger)] bg-[#190f16] p-3 text-sm text-[#fecdd3]"
        >
          <AlertTriangle size={16} aria-hidden="true" />
          <span>{activeRuntimeError}</span>
        </div>
      ) : null}

      {shouldShowLoading ? (
        <div
          data-testid="dispatch-live-telemetry-loading"
          className="flex min-h-[12rem] flex-1 items-center justify-center gap-2 text-sm text-[#cbd5e1]"
        >
          <Loader2 className="animate-spin text-[#38bdf8]" size={18} aria-hidden="true" />
          <span>Подключение live-телеметрии...</span>
        </div>
      ) : streamEnabled ? (
        <div className="min-h-0 flex-1 overflow-auto p-3">
          <DispatchLiveTelemetryTable rows={visibleRows} />
        </div>
      ) : (
        <div className="flex min-h-[12rem] flex-1 items-center justify-center p-4 text-center text-sm text-[#94a3b8]">
          Live-телеметрия запустится после выбора контекста диспетчеризации с сохраненным профилем привязок.
        </div>
      )}
    </section>
  )
}
