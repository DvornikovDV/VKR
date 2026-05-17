import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import {
  ackAlarmIncident,
  listAlarmIncidents,
  type AlarmIncidentProjection,
  type AlarmIncidentListResponse,
  type AlarmIncidentListState,
} from '@/shared/api/alarmIncidents'
import {
  createDispatchActionSlotContextKey,
  useRegisterDispatchActionSlot,
} from '@/features/dispatch/components/DispatchActionSlot'
import { DispatchAlarmJournalPagination } from '@/features/dispatch/components/DispatchAlarmJournalPagination'
import { DispatchAlarmJournalTable } from '@/features/dispatch/components/DispatchAlarmJournalTable'
import { DispatchAlarmJournalToolbar } from '@/features/dispatch/components/DispatchAlarmJournalToolbar'
import {
  DISPATCH_ALARM_JOURNAL_DEFAULT_QUERY,
  createDispatchAlarmJournalPaginationState,
  createDispatchAlarmJournalRequestDescriptor,
  createDispatchAlarmJournalRequestGuard,
  createDispatchAlarmJournalRequestKey,
  getDispatchAlarmJournalNextPage,
  getDispatchAlarmJournalPreviousPage,
  isDispatchAlarmJournalRequestCurrent,
  type DispatchAlarmJournalLoadState,
  type DispatchAlarmJournalPaginationState,
  type DispatchAlarmJournalRequestDescriptor,
  type DispatchAlarmJournalRequestGuard,
} from '@/features/dispatch/model/alarmJournal'
import { DISPATCH_ALARMS_TAB } from '@/features/dispatch/model/routes'
import type {
  DispatchActionSlotRegistration,
  DispatchWorkspaceContextSnapshot,
} from '@/features/dispatch/model/types'

interface DispatchAlarmJournalTabProps {
  workspaceContext: DispatchWorkspaceContextSnapshot
  className?: string
}

interface DispatchAlarmJournalAckState {
  edgeId: string
  incidentId: string
  requestId: number
  pending: boolean
  error: string | null
}

const DISPATCH_ALARM_JOURNAL_ACK_KEY_SEPARATOR = '\u001f'

function createDispatchAlarmJournalAckKey(edgeId: string, incidentId: string): string {
  return [edgeId, incidentId].join(DISPATCH_ALARM_JOURNAL_ACK_KEY_SEPARATOR)
}

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }

  return fallback
}

function createDefaultPaginationState(page: number): DispatchAlarmJournalPaginationState {
  return {
    page,
    limit: DISPATCH_ALARM_JOURNAL_DEFAULT_QUERY.limit,
    total: 0,
    hasNextPage: false,
  }
}

function isSelectedEdgeResponse(
  response: AlarmIncidentListResponse,
  edgeId: string,
): boolean {
  return response.incidents.every((incident) => incident.edgeId === edgeId)
}

export function DispatchAlarmJournalTab({
  workspaceContext,
  className,
}: DispatchAlarmJournalTabProps) {
  const selectedEdgeId = workspaceContext.selection.edgeId?.trim() || null
  const [stateFilter, setStateFilter] = useState<AlarmIncidentListState>(
    DISPATCH_ALARM_JOURNAL_DEFAULT_QUERY.state,
  )
  const [page, setPage] = useState<number>(DISPATCH_ALARM_JOURNAL_DEFAULT_QUERY.page)
  const [journalLoadState, setJournalLoadState] = useState<DispatchAlarmJournalLoadState>({
    status: 'idle',
    error: null,
  })
  const [journalResponse, setJournalResponse] = useState<AlarmIncidentListResponse | null>(null)
  const [ackStateByKey, setAckStateByKey] = useState<
    Record<string, DispatchAlarmJournalAckState>
  >({})
  const requestIdRef = useRef(0)
  const ackRequestIdRef = useRef(0)
  const activeGuardRef = useRef<DispatchAlarmJournalRequestGuard | null>(null)
  const currentDescriptorKeyRef = useRef<string | null>(null)
  const activeAckRequestByKeyRef = useRef<Record<string, number>>({})
  const selectedEdgeIdRef = useRef<string | null>(selectedEdgeId)
  const mountedRef = useRef(true)

  useEffect(() => {
    selectedEdgeIdRef.current = selectedEdgeId
  }, [selectedEdgeId])

  useEffect(() => {
    mountedRef.current = true

    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    setPage(DISPATCH_ALARM_JOURNAL_DEFAULT_QUERY.page)
    setJournalResponse(null)
    setJournalLoadState({ status: 'idle', error: null })
    setAckStateByKey({})
    activeGuardRef.current = null
    currentDescriptorKeyRef.current = null
    activeAckRequestByKeyRef.current = {}
    requestIdRef.current += 1
    ackRequestIdRef.current += 1
  }, [selectedEdgeId])

  const validationMessage = useMemo(() => {
    if (workspaceContext.status === 'loading') {
      return 'Dispatch context is still loading.'
    }

    if (workspaceContext.errorMessage) {
      return workspaceContext.errorMessage
    }

    if (!selectedEdgeId) {
      return 'Select an Edge Server before loading alarm incidents.'
    }

    if (workspaceContext.status === 'ready' && !workspaceContext.selection.selectedEdge) {
      return 'Select a trusted Edge Server before loading alarm incidents.'
    }

    return null
  }, [
    selectedEdgeId,
    workspaceContext.errorMessage,
    workspaceContext.selection.selectedEdge,
    workspaceContext.status,
  ])

  const requestDescriptor = useMemo<DispatchAlarmJournalRequestDescriptor | null>(() => {
    if (!selectedEdgeId || validationMessage) {
      return null
    }

    return createDispatchAlarmJournalRequestDescriptor(selectedEdgeId, {
      state: stateFilter,
      page,
    })
  }, [page, selectedEdgeId, stateFilter, validationMessage])

  const requestDescriptorKey = useMemo(
    () => (requestDescriptor ? createDispatchAlarmJournalRequestKey(requestDescriptor) : null),
    [requestDescriptor],
  )

  const loadAlarmIncidents = useCallback(async (descriptor: DispatchAlarmJournalRequestDescriptor) => {
    const requestId = ++requestIdRef.current
    const requestGuard = createDispatchAlarmJournalRequestGuard(requestId, descriptor)
    activeGuardRef.current = requestGuard
    currentDescriptorKeyRef.current = requestGuard.key
    setJournalLoadState({ status: 'loading', error: null })

    try {
      const response = await listAlarmIncidents(descriptor.edgeId, {
        state: descriptor.state,
        page: descriptor.page,
        limit: descriptor.limit,
        sort: descriptor.sort,
        order: descriptor.order,
      })
      const responseGuardIsCurrent =
        currentDescriptorKeyRef.current === requestGuard.key
        && isDispatchAlarmJournalRequestCurrent(activeGuardRef.current, requestGuard)

      if (!mountedRef.current || !responseGuardIsCurrent) {
        return
      }

      if (!isSelectedEdgeResponse(response, descriptor.edgeId)) {
        setJournalResponse(null)
        setJournalLoadState({
          status: 'error',
          error: 'Alarm incident response did not match the selected Edge Server.',
        })
        return
      }

      setJournalResponse(response)
      setJournalLoadState({
        status: response.incidents.length > 0 ? 'ready' : 'empty',
        error: null,
      })
    } catch (error) {
      const responseGuardIsCurrent =
        currentDescriptorKeyRef.current === requestGuard.key
        && isDispatchAlarmJournalRequestCurrent(activeGuardRef.current, requestGuard)

      if (!mountedRef.current || !responseGuardIsCurrent) {
        return
      }

      setJournalResponse(null)
      setJournalLoadState({
        status: 'error',
        error: toErrorMessage(error, 'Failed to load alarm incidents.'),
      })
    }
  }, [])

  useEffect(() => {
    currentDescriptorKeyRef.current = requestDescriptorKey

    if (!requestDescriptor) {
      activeGuardRef.current = null
      return
    }

    void loadAlarmIncidents(requestDescriptor)
  }, [loadAlarmIncidents, requestDescriptor, requestDescriptorKey])

  const pagination = useMemo(
    () =>
      journalResponse
        ? createDispatchAlarmJournalPaginationState(journalResponse)
        : createDefaultPaginationState(page),
    [journalResponse, page],
  )
  const incidents = journalResponse?.incidents ?? []
  const visibleCount = incidents.length
  const total = journalResponse?.total ?? 0
  const isLoading = journalLoadState.status === 'loading'
  const canUseControls = Boolean(requestDescriptor)
  const ackPendingIncidentIds = useMemo(() => {
    const pendingIncidentIds = new Set<string>()

    if (!selectedEdgeId) {
      return pendingIncidentIds
    }

    Object.values(ackStateByKey).forEach((ackState) => {
      if (ackState.edgeId === selectedEdgeId && ackState.pending) {
        pendingIncidentIds.add(ackState.incidentId)
      }
    })

    return pendingIncidentIds
  }, [ackStateByKey, selectedEdgeId])
  const ackErrorsByIncidentId = useMemo(() => {
    const errorsByIncidentId: Record<string, string> = {}

    if (!selectedEdgeId) {
      return errorsByIncidentId
    }

    Object.values(ackStateByKey).forEach((ackState) => {
      if (ackState.edgeId === selectedEdgeId && ackState.error) {
        errorsByIncidentId[ackState.incidentId] = ackState.error
      }
    })

    return errorsByIncidentId
  }, [ackStateByKey, selectedEdgeId])

  const handleStateChange = useCallback((nextState: AlarmIncidentListState) => {
    setStateFilter(nextState)
    setPage(DISPATCH_ALARM_JOURNAL_DEFAULT_QUERY.page)
  }, [])

  const handleRefresh = useCallback(() => {
    if (!requestDescriptor) {
      return
    }

    void loadAlarmIncidents(requestDescriptor)
  }, [loadAlarmIncidents, requestDescriptor])

  const handlePreviousPage = useCallback(() => {
    setPage((currentPage) =>
      getDispatchAlarmJournalPreviousPage({
        page: currentPage,
      }),
    )
  }, [])

  const handleNextPage = useCallback(() => {
    setPage((currentPage) =>
      getDispatchAlarmJournalNextPage({
        page: currentPage,
        hasNextPage: pagination.hasNextPage,
      }),
    )
  }, [pagination.hasNextPage])

  const handleAcknowledgeIncident = useCallback(async (incident: AlarmIncidentProjection) => {
    const edgeId = selectedEdgeIdRef.current
    const incidentId = incident.incidentId

    if (!edgeId || incident.edgeId !== edgeId || incident.isAcknowledged) {
      return
    }

    const ackKey = createDispatchAlarmJournalAckKey(edgeId, incidentId)
    const requestId = ++ackRequestIdRef.current
    activeAckRequestByKeyRef.current = {
      ...activeAckRequestByKeyRef.current,
      [ackKey]: requestId,
    }
    setAckStateByKey((previous) => ({
      ...previous,
      [ackKey]: {
        edgeId,
        incidentId,
        requestId,
        pending: true,
        error: null,
      },
    }))

    try {
      const confirmedIncident = await ackAlarmIncident(edgeId, incidentId)
      const requestIsCurrent =
        mountedRef.current
        && selectedEdgeIdRef.current === edgeId
        && activeAckRequestByKeyRef.current[ackKey] === requestId

      if (!requestIsCurrent) {
        return
      }

      if (confirmedIncident.edgeId !== edgeId || confirmedIncident.incidentId !== incidentId) {
        setAckStateByKey((previous) => {
          const currentAckState = previous[ackKey]
          if (!currentAckState || currentAckState.requestId !== requestId) {
            return previous
          }

          return {
            ...previous,
            [ackKey]: {
              ...currentAckState,
              pending: false,
              error: 'ACK response did not match the selected incident.',
            },
          }
        })
        return
      }

      setJournalResponse((previous) => {
        if (
          !previous
          || selectedEdgeIdRef.current !== edgeId
          || activeAckRequestByKeyRef.current[ackKey] !== requestId
        ) {
          return previous
        }

        let didUpdate = false
        const incidents = previous.incidents.map((currentIncident) => {
          if (currentIncident.edgeId !== edgeId || currentIncident.incidentId !== incidentId) {
            return currentIncident
          }

          didUpdate = true
          return confirmedIncident
        })

        return didUpdate ? { ...previous, incidents } : previous
      })
      setAckStateByKey((previous) => {
        const currentAckState = previous[ackKey]
        if (!currentAckState || currentAckState.requestId !== requestId) {
          return previous
        }

        const { [ackKey]: _completedAckState, ...nextAckStateByKey } = previous
        return nextAckStateByKey
      })
    } catch (error) {
      const requestIsCurrent =
        mountedRef.current
        && selectedEdgeIdRef.current === edgeId
        && activeAckRequestByKeyRef.current[ackKey] === requestId

      if (!requestIsCurrent) {
        return
      }

      setAckStateByKey((previous) => {
        const currentAckState = previous[ackKey]
        if (!currentAckState || currentAckState.requestId !== requestId) {
          return previous
        }

        return {
          ...previous,
          [ackKey]: {
            ...currentAckState,
            pending: false,
            error: toErrorMessage(error, 'Failed to acknowledge alarm incident.'),
          },
        }
      })
    }
  }, [])

  const actionSlotContextKey = useMemo(
    () => createDispatchActionSlotContextKey(workspaceContext.selection),
    [workspaceContext.selection],
  )

  const actionSlotToolbar = useMemo(
    () => (
      <DispatchAlarmJournalToolbar
        state={stateFilter}
        onStateChange={handleStateChange}
        onRefresh={handleRefresh}
        isLoading={isLoading}
        isDisabled={!canUseControls}
        visibleCount={visibleCount}
        total={total}
        layout="slot"
      />
    ),
    [
      canUseControls,
      handleRefresh,
      handleStateChange,
      isLoading,
      stateFilter,
      total,
      visibleCount,
    ],
  )

  const actionSlotRegistration = useMemo<DispatchActionSlotRegistration>(
    () => ({
      tabId: DISPATCH_ALARMS_TAB,
      contextKey: actionSlotContextKey,
      controls: [
        {
          id: 'alarms.journalControls',
          label: 'Alarm journal controls',
          content: actionSlotToolbar,
          order: 10,
          disabled: !canUseControls,
        },
      ],
    }),
    [actionSlotContextKey, actionSlotToolbar, canUseControls],
  )
  useRegisterDispatchActionSlot(actionSlotRegistration)

  return (
    <section
      aria-label="Dispatch alarm journal"
      data-testid="dispatch-alarm-journal-tab"
      data-edge-id={selectedEdgeId ?? ''}
      className={className ?? 'flex min-h-0 flex-1 flex-col bg-[#08111f]'}
    >
      <DispatchAlarmJournalToolbar
        state={stateFilter}
        onStateChange={handleStateChange}
        onRefresh={handleRefresh}
        isLoading={isLoading}
        isDisabled={!canUseControls}
        visibleCount={visibleCount}
        total={total}
      />

      {validationMessage ? (
        <div
          data-testid={!selectedEdgeId ? 'dispatch-alarm-journal-no-edge' : undefined}
          role={selectedEdgeId ? 'alert' : undefined}
          className="mx-3 mt-3 rounded-md border border-[#334155] bg-[#0f172a] p-4 text-sm text-[#cbd5e1]"
        >
          {validationMessage}
        </div>
      ) : null}

      {journalLoadState.error ? (
        <div
          role="alert"
          className="mx-3 mt-3 flex items-center gap-2 rounded-md border border-[var(--color-danger)] bg-[#190f16] p-3 text-sm text-[#fecdd3]"
        >
          <AlertTriangle size={16} aria-hidden="true" />
          <span>{journalLoadState.error}</span>
        </div>
      ) : null}

      {isLoading ? (
        <div className="flex min-h-[12rem] flex-1 items-center justify-center gap-2 text-sm text-[#cbd5e1]">
          <Loader2 className="animate-spin text-[#38bdf8]" size={18} aria-hidden="true" />
          <span>Loading alarm incidents...</span>
        </div>
      ) : journalResponse ? (
        <>
          <div className="min-h-0 flex-1 overflow-auto p-3">
            <DispatchAlarmJournalTable
              incidents={incidents}
              ackPendingIncidentIds={ackPendingIncidentIds}
              ackErrorsByIncidentId={ackErrorsByIncidentId}
              isAckDisabled={!canUseControls}
              onAcknowledgeIncident={handleAcknowledgeIncident}
              emptyMessage="No alarm incidents were returned for the selected Edge Server."
            />
          </div>
          <DispatchAlarmJournalPagination
            pagination={pagination}
            visibleCount={visibleCount}
            isDisabled={!canUseControls || isLoading}
            onPreviousPage={handlePreviousPage}
            onNextPage={handleNextPage}
          />
        </>
      ) : (
        <div className="flex min-h-[12rem] flex-1 items-center justify-center p-4 text-center text-sm text-[#94a3b8]">
          Select an Edge Server to load alarm incidents.
        </div>
      )}
    </section>
  )
}
