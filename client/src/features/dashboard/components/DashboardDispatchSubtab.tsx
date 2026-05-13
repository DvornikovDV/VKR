import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Info, Maximize2 } from 'lucide-react'
import { executeEdgeServerCommand, type NormalizedCommandOutcome } from '@/shared/api/commands'
import { useDashboardCommandLifecycle } from '@/features/dashboard/hooks/useDashboardCommandLifecycle'
import { useDashboardRuntimeSession } from '@/features/dashboard/hooks/useDashboardRuntimeSession'
import { DashboardAlarmRedLightIndicator } from '@/features/dashboard/components/DashboardAlarmRedLightIndicator'
import { DashboardRuntimeSurface } from '@/features/dashboard/components/DashboardRuntimeSurface'
import { countDashboardUnclosedAlarmIncidents } from '@/features/dashboard/model/alarmIncidents'
import {
  createDashboardBindingKey,
  selectDashboardRuntimeProjection,
} from '@/features/dashboard/model/selectors'
import {
  createDispatchActionSlotContextKey,
  useRegisterDispatchActionSlot,
} from '@/features/dispatch/components/DispatchActionSlot'
import type {
  DashboardBindingProfile,
  DashboardCatalogLoadStatus,
  DashboardCommandCatalog,
  DashboardCommandType,
  DashboardDiagramDocument,
  DashboardRecoveryState,
} from '@/features/dashboard/model/types'

// Props supplied by the Dispatch workspace shell (shared context ownership)
export interface DashboardDispatchSubtabProps {
  // Shared context from Dispatch
  recoveryState: DashboardRecoveryState
  savedDiagram: DashboardDiagramDocument | null
  selectedEdgeId: string | null
  selectedBindingProfile: DashboardBindingProfile | null
  edgeCatalog: DashboardCommandCatalog | null
  edgeCatalogStatus: DashboardCatalogLoadStatus
  // Catalog-specific load error (distinct from aggregate context error)
  edgeCatalogError: string | null
  errorMessage: string | null
}

interface DashboardSubtabCommandCommit {
  widgetId: string
  deviceId: string
  commandType: DashboardCommandType
  value: boolean | number
}

function formatCommandOutcomeError(outcome: Exclude<NormalizedCommandOutcome, 'confirmed'>): string {
  switch (outcome) {
    case 'cloud_rpc_timeout':
      return 'Cloud RPC timeout'
    case 'edge_command_timeout':
      return 'Edge command timeout'
    case 'edge_command_failed':
      return 'Edge command failed'
    case 'edge_unavailable':
      return 'Edge unavailable'
    case 'network_error':
      return 'Network error'
    case 'unknown_error':
    default:
      return 'Command failed'
  }
}

/**
 * DashboardDispatchSubtab
 *
 * Receives shared context from the Dispatch workspace shell (diagram, edge,
 * binding profile, saved diagram, catalog, recovery state) via props.
 *
 * Retains full ownership of Dashboard-local runtime behavior:
 *   - Runtime socket session (useDashboardRuntimeSession)
 *   - Command lifecycle state (useDashboardCommandLifecycle)
 *   - Runtime projection (selectDashboardRuntimeProjection)
 *   - Diagnostics panel toggle state
 *   - Command commit handler
 *
 * This component MUST NOT call shared context loading APIs (diagrams,
 * assigned edges, binding profiles). Those are owned by useDispatchWorkspaceContext.
 */
export function DashboardDispatchSubtab({
  recoveryState,
  savedDiagram,
  selectedEdgeId,
  selectedBindingProfile,
  edgeCatalog,
  edgeCatalogStatus,
  edgeCatalogError,
  errorMessage,
}: DashboardDispatchSubtabProps) {
  // Dashboard-local runtime state
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState(false)
  const [fitToViewAction, setFitToViewAction] = useState<(() => void) | null>(null)
  const commandLifecycle = useDashboardCommandLifecycle()

  const isRuntimeEnabled =
    (recoveryState === 'ready' || recoveryState === 'partial-visual-rendering') &&
    Boolean(selectedEdgeId && selectedBindingProfile)

  // Dashboard owns the socket session - telemetry, alarms, transport
  const runtimeSession = useDashboardRuntimeSession({
    edgeId: selectedEdgeId,
    enabled: isRuntimeEnabled,
  })

  const metricRevisionByBindingKeyRef = useRef(runtimeSession.metricRevisionByBindingKey)
  const commandContextGenerationRef = useRef(0)
  const actionSlotContextKey = createDispatchActionSlotContextKey({
    diagramId: selectedBindingProfile?.diagramId ?? null,
    edgeId: selectedEdgeId,
  })
  const commandContextKey = `${selectedEdgeId ?? 'no-edge'}:${selectedBindingProfile?._id ?? 'no-binding'}:${isRuntimeEnabled ? 'runtime' : 'idle'}`

  // Dashboard-local runtime projection from saved diagram + binding profile + live telemetry
  const runtimeProjection = useMemo(() => {
    if (!savedDiagram || !selectedBindingProfile) {
      return null
    }

    return selectDashboardRuntimeProjection(
      savedDiagram,
      selectedBindingProfile,
      runtimeSession.latestMetricValueByBindingKey,
      edgeCatalogStatus === 'loaded' ? edgeCatalog : null,
    )
  }, [
    edgeCatalog,
    edgeCatalogStatus,
    runtimeSession.latestMetricValueByBindingKey,
    selectedBindingProfile,
    savedDiagram,
  ])

  const activeEdgeAlarmIncidentCount = useMemo(() => {
    if (!isRuntimeEnabled || !selectedEdgeId) {
      return 0
    }

    return countDashboardUnclosedAlarmIncidents(
      runtimeSession.alarmIncidents.filter((incident) => incident.edgeId === selectedEdgeId),
    )
  }, [isRuntimeEnabled, runtimeSession.alarmIncidents, selectedEdgeId])

  // Keep metric revision ref current for command confirmation
  useEffect(() => {
    metricRevisionByBindingKeyRef.current = runtimeSession.metricRevisionByBindingKey
  }, [runtimeSession.metricRevisionByBindingKey])

  // Clear confirmed-waiting telemetry when new telemetry arrives for the binding
  useEffect(() => {
    commandLifecycle.clearConfirmedWaitingTelemetryForUpdatedBindings(
      runtimeSession.metricRevisionByBindingKey,
    )
  }, [commandLifecycle, runtimeSession.metricRevisionByBindingKey])

  useEffect(() => {
    commandContextGenerationRef.current += 1
    commandLifecycle.clearAll()
  }, [commandContextKey, commandLifecycle.clearAll])

  // Dashboard-local command commit handler
  const handleCommandCommit = useCallback(
    async (command: DashboardSubtabCommandCommit) => {
      if (!selectedEdgeId) {
        commandLifecycle.markError(command.widgetId, 'Edge server is not selected')
        return
      }

      const commandProjection = runtimeProjection?.commandAvailabilityByWidgetId[command.widgetId]
      if (
        !commandProjection?.isExecutable ||
        commandProjection.commandType !== command.commandType ||
        !commandProjection.commandBinding ||
        !commandProjection.reportedWidgetBinding
      ) {
        commandLifecycle.markError(command.widgetId, 'Command is unavailable')
        return
      }

      const reportedBindingKey = createDashboardBindingKey(
        commandProjection.reportedWidgetBinding.deviceId,
        commandProjection.reportedWidgetBinding.metric,
      )

      const commandGeneration = commandContextGenerationRef.current
      commandLifecycle.markPending(command.widgetId)
      const outcome = await executeEdgeServerCommand(selectedEdgeId, {
        deviceId: commandProjection.commandBinding.deviceId,
        commandType: commandProjection.commandBinding.commandType,
        payload: {
          value: command.value,
        },
      })

      if (commandGeneration !== commandContextGenerationRef.current) {
        return
      }

      if (outcome === 'confirmed') {
        const confirmedMetricRevision =
          metricRevisionByBindingKeyRef.current[reportedBindingKey] ?? 0

        commandLifecycle.markConfirmedWaitingTelemetry(
          command.widgetId,
          reportedBindingKey,
          confirmedMetricRevision,
        )
        return
      }

      commandLifecycle.markFailure(command.widgetId, outcome, formatCommandOutcomeError(outcome))
    },
    [commandLifecycle, runtimeProjection, selectedEdgeId],
  )

  const handleFitToViewActionChange = useCallback((action: (() => void) | null) => {
    setFitToViewAction(() => action)
  }, [])

  const handleToggleDiagnostics = useCallback(() => {
    setIsDiagnosticsOpen((isOpen) => !isOpen)
  }, [])

  const actionSlotRegistration = useMemo(() => {
    if (!isRuntimeEnabled) {
      return null
    }

    return {
      tabId: 'dashboard' as const,
      contextKey: actionSlotContextKey,
      controls: [
        ...(activeEdgeAlarmIncidentCount > 0
          ? [
              {
                id: 'dashboard.redLight' as const,
                label: 'Known unclosed alarm incidents',
                order: 10,
                content: <DashboardAlarmRedLightIndicator count={activeEdgeAlarmIncidentCount} />,
              },
            ]
          : []),
        ...(fitToViewAction
          ? [
              {
                id: 'dashboard.fitToView' as const,
                label: 'Fit to view',
                order: 20,
                content: (
                  <button
                    type="button"
                    aria-label="Fit to view"
                    title="Fit to view"
                    onClick={fitToViewAction}
                    className="inline-flex h-7 w-7 items-center justify-center rounded border border-[#334155] bg-[#0f172a] text-[#e2e8f0] transition-colors hover:bg-[#1e293b]"
                  >
                    <Maximize2 size={14} aria-hidden="true" />
                  </button>
                ),
              },
            ]
          : []),
        {
          id: 'dashboard.details' as const,
          label: 'Details',
          order: 30,
          content: (
            <button
              type="button"
              aria-expanded={isDiagnosticsOpen}
              onClick={handleToggleDiagnostics}
              className="inline-flex h-7 items-center gap-1.5 rounded border border-[#334155] bg-[#0f172a] px-2 text-xs font-medium text-white transition-colors hover:bg-[#1e293b]"
            >
              <Info aria-hidden="true" size={13} />
              Details
            </button>
          ),
        },
      ],
    }
  }, [
    actionSlotContextKey,
    activeEdgeAlarmIncidentCount,
    fitToViewAction,
    handleToggleDiagnostics,
    isDiagnosticsOpen,
    isRuntimeEnabled,
  ])

  useRegisterDispatchActionSlot(actionSlotRegistration)

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <DashboardRuntimeSurface
        isActiveContext={isRuntimeEnabled}
        recoveryState={recoveryState}
        savedDiagram={savedDiagram}
        runtimeProjection={runtimeProjection}
        commandLifecycleByWidgetId={commandLifecycle.lifecycleByWidgetId}
        onCommandCommit={handleCommandCommit}
        catalogStatus={edgeCatalogStatus}
        catalogError={edgeCatalogError}
        transportStatus={runtimeSession.transportStatus}
        edgeAvailability={runtimeSession.edgeAvailability}
        latestMetricValueByBindingKey={runtimeSession.latestMetricValueByBindingKey}
        lastServerTimestamp={runtimeSession.lastServerTimestamp}
        alarmIncidents={runtimeSession.alarmIncidents}
        alarmJournalLoadState={runtimeSession.alarmJournalLoadState}
        alarmJournalInitialLoadBlocked={runtimeSession.alarmJournalInitialLoadBlocked}
        alarmAckPendingByIncidentId={runtimeSession.alarmAckPendingByIncidentId}
        alarmAckErrorByIncidentId={runtimeSession.alarmAckErrorByIncidentId}
        onAcknowledgeAlarmIncident={runtimeSession.acknowledgeAlarmIncident}
        diagnosticsOpen={isDiagnosticsOpen}
        onToggleDiagnostics={handleToggleDiagnostics}
        onFitToViewActionChange={handleFitToViewActionChange}
        selectedEdgeId={selectedEdgeId}
        errorMessage={errorMessage ?? runtimeSession.runtimeError}
      />
    </div>
  )
}
