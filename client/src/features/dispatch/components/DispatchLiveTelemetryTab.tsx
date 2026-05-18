import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { DispatchLiveTelemetryTable } from '@/features/dispatch/components/DispatchLiveTelemetryTable'
import { DispatchLiveTelemetryToolbar } from '@/features/dispatch/components/DispatchLiveTelemetryToolbar'
import { useDispatchLiveTelemetrySession } from '@/features/dispatch/hooks/useDispatchLiveTelemetrySession'
import {
  countDispatchLiveTelemetryWaitingRows,
  selectDispatchLiveTelemetryBindingPairs,
  type DispatchLiveTelemetryRow,
} from '@/features/dispatch/model/liveTelemetry'
import type { DispatchWorkspaceContextSnapshot } from '@/features/dispatch/model/types'

interface DispatchLiveTelemetryTabProps {
  workspaceContext: DispatchWorkspaceContextSnapshot
  className?: string
}

function getContextValue(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : null
}

function createLocalContextKey(
  diagramId: string | null,
  edgeId: string | null,
  bindingProfileId: string | null,
): string {
  return `${diagramId ?? 'no-diagram'}:${edgeId ?? 'no-edge'}:${bindingProfileId ?? 'no-profile'}`
}

function getValidationMessage(
  workspaceContext: DispatchWorkspaceContextSnapshot,
  relevantPairCount: number,
): string | null {
  if (workspaceContext.status === 'loading') {
    return 'Dispatch context is still loading.'
  }

  if (workspaceContext.errorMessage) {
    return workspaceContext.errorMessage
  }

  if (!getContextValue(workspaceContext.selection.diagramId)) {
    return 'Select a diagram before streaming live telemetry.'
  }

  if (!getContextValue(workspaceContext.selection.edgeId)) {
    return 'Select an Edge Server before streaming live telemetry.'
  }

  if (workspaceContext.status === 'ready' && !workspaceContext.selection.selectedEdge) {
    return 'Select a trusted Edge Server before streaming live telemetry.'
  }

  if (!workspaceContext.selection.selectedBindingProfile) {
    return 'Select a saved binding profile before streaming live telemetry.'
  }

  if (relevantPairCount === 0) {
    return 'Selected binding profile has no widget telemetry bindings.'
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
  const relevantPairs = useMemo(
    () => selectDispatchLiveTelemetryBindingPairs(selectedBindingProfile),
    [selectedBindingProfile],
  )
  const validationMessage = useMemo(
    () => getValidationMessage(workspaceContext, relevantPairs.size),
    [relevantPairs.size, workspaceContext],
  )
  const streamEnabled = validationMessage === null
  const localContextKey = useMemo(
    () => createLocalContextKey(selectedDiagramId, selectedEdgeId, selectedBindingProfileId),
    [selectedBindingProfileId, selectedDiagramId, selectedEdgeId],
  )
  const session = useDispatchLiveTelemetrySession({
    diagramId: selectedDiagramId,
    edgeId: selectedEdgeId,
    bindingProfile: selectedBindingProfile,
    enabled: streamEnabled,
  })
  const [isPaused, setIsPaused] = useState(false)
  const [visibleRows, setVisibleRows] = useState<DispatchLiveTelemetryRow[]>([])
  const [pausedSnapshotRows, setPausedSnapshotRows] = useState<DispatchLiveTelemetryRow[]>([])

  useEffect(() => {
    setIsPaused(false)
    setVisibleRows([])
    setPausedSnapshotRows([])
  }, [localContextKey])

  useEffect(() => {
    if (isPaused) {
      return
    }

    setVisibleRows(session.rows)
    setPausedSnapshotRows(session.rows)
  }, [isPaused, session.rows])

  const handleTogglePaused = useCallback(() => {
    setIsPaused((current) => {
      if (current) {
        setVisibleRows(session.rows)
        setPausedSnapshotRows(session.rows)
        return false
      }

      setPausedSnapshotRows(visibleRows)
      return true
    })
  }, [session.rows, visibleRows])

  const waitingCount = isPaused
    ? countDispatchLiveTelemetryWaitingRows(session.rows, pausedSnapshotRows)
    : 0
  const isContextLoading = workspaceContext.status === 'loading'
  const shouldShowLoading = streamEnabled && session.transportStatus === 'connecting' && visibleRows.length === 0

  return (
    <section
      aria-label="Dispatch live telemetry"
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
        transportStatus={session.transportStatus}
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

      {session.runtimeError ? (
        <div
          role="alert"
          data-testid="dispatch-live-telemetry-error"
          className="mx-3 mt-3 flex items-center gap-2 rounded-md border border-[var(--color-danger)] bg-[#190f16] p-3 text-sm text-[#fecdd3]"
        >
          <AlertTriangle size={16} aria-hidden="true" />
          <span>{session.runtimeError}</span>
        </div>
      ) : null}

      {shouldShowLoading ? (
        <div
          data-testid="dispatch-live-telemetry-loading"
          className="flex min-h-[12rem] flex-1 items-center justify-center gap-2 text-sm text-[#cbd5e1]"
        >
          <Loader2 className="animate-spin text-[#38bdf8]" size={18} aria-hidden="true" />
          <span>Connecting live telemetry...</span>
        </div>
      ) : streamEnabled ? (
        <div className="min-h-0 flex-1 overflow-auto p-3">
          <DispatchLiveTelemetryTable rows={visibleRows} />
        </div>
      ) : (
        <div className="flex min-h-[12rem] flex-1 items-center justify-center p-4 text-center text-sm text-[#94a3b8]">
          Live telemetry starts after the selected Dispatch context has a saved binding profile.
        </div>
      )}
    </section>
  )
}
