import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  getDashboardAlarmIncidentRowTimeMs,
  upsertDashboardAlarmIncident,
} from '@/features/dashboard/model/alarmIncidents'
import {
  createDashboardBindingKey,
  mergeTelemetryReadingsByBindingKey,
} from '@/features/dashboard/model/selectors'
import type {
  DashboardAlarmAckErrorByIncidentId,
  DashboardAlarmAckPendingByIncidentId,
  DashboardAlarmIncidentList,
  DashboardAlarmIncidentProjection,
  DashboardAlarmJournalInitialLoadBlockedMarker,
  DashboardAlarmJournalLoadState,
  DashboardEdgeAvailability,
  DashboardMetricRevisionByBindingKey,
  DashboardMetricValueByBindingKey,
  DashboardRuntimeValue,
  DashboardTelemetryReading,
  DashboardTransportStatus,
} from '@/features/dashboard/model/types'
import {
  cloudRuntimeClient,
  type CloudRuntimeClient,
  type DashboardRuntimeSession,
} from '@/features/dashboard/services/cloudRuntimeClient'
import { ackAlarmIncident, listAlarmIncidents } from '@/shared/api/alarmIncidents'

export interface UseDashboardRuntimeSessionOptions {
  edgeId: string | null
  enabled?: boolean
  client?: CloudRuntimeClient
}

export interface DashboardRuntimeSessionState {
  activeEdgeId: string | null
  transportStatus: DashboardTransportStatus
  edgeAvailability: DashboardEdgeAvailability
  latestMetricValueByBindingKey: DashboardMetricValueByBindingKey
  metricRevisionByBindingKey: DashboardMetricRevisionByBindingKey
  alarmIncidents: DashboardAlarmIncidentList
  alarmJournalLoadState: DashboardAlarmJournalLoadState
  alarmJournalInitialLoadBlocked: DashboardAlarmJournalInitialLoadBlockedMarker | null
  alarmAckPendingByIncidentId: DashboardAlarmAckPendingByIncidentId
  alarmAckErrorByIncidentId: DashboardAlarmAckErrorByIncidentId
  lastServerTimestamp: number | null
  runtimeError: string | null
  acknowledgeAlarmIncident: (incidentId: string) => Promise<void>
}

export type UseDashboardRuntimeSessionResult = DashboardRuntimeSessionState

const idleAlarmJournalLoadState: DashboardAlarmJournalLoadState = {
  status: 'idle',
  error: null,
}

const loadingAlarmJournalLoadState: DashboardAlarmJournalLoadState = {
  status: 'loading',
  error: null,
}

const loadedAlarmJournalLoadState: DashboardAlarmJournalLoadState = {
  status: 'loaded',
  error: null,
}

function createIdleState(): DashboardRuntimeSessionState {
  return {
    activeEdgeId: null,
    transportStatus: 'idle',
    edgeAvailability: 'unknown',
    latestMetricValueByBindingKey: {},
    metricRevisionByBindingKey: {},
    alarmIncidents: [],
    alarmJournalLoadState: idleAlarmJournalLoadState,
    alarmJournalInitialLoadBlocked: null,
    alarmAckPendingByIncidentId: {},
    alarmAckErrorByIncidentId: {},
    lastServerTimestamp: null,
    runtimeError: null,
    acknowledgeAlarmIncident: async () => {
      throw new Error('Alarm incident acknowledgement is not implemented yet.')
    },
  }
}

function isSupportedRuntimeValue(value: unknown): value is DashboardRuntimeValue {
  return (
    value === null ||
    typeof value === 'number' ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  )
}

function mergeTelemetryRevisionsByBindingKey(
  previous: DashboardMetricRevisionByBindingKey,
  readings: DashboardTelemetryReading[],
): DashboardMetricRevisionByBindingKey {
  let next: DashboardMetricRevisionByBindingKey | null = null

  for (const reading of readings) {
    const deviceId = reading.deviceId.trim()
    const metric = reading.metric.trim()
    if (!deviceId || !metric || !isSupportedRuntimeValue(reading.last)) {
      continue
    }

    const bindingKey = createDashboardBindingKey(deviceId, metric)
    next ??= { ...previous }
    next[bindingKey] = (next[bindingKey] ?? 0) + 1
  }

  return next ?? previous
}

function normalizeEdgeId(value: string | null): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }

  return fallback
}

function omitRecordKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  const next = { ...record }
  delete next[key]
  return next
}

function shouldApplyAckResponseIncident(
  existingIncident: DashboardAlarmIncidentProjection | undefined,
  responseIncident: DashboardAlarmIncidentProjection,
): boolean {
  if (!responseIncident.isAcknowledged) {
    return false
  }

  if (
    existingIncident?.isAcknowledged &&
    getDashboardAlarmIncidentRowTimeMs(responseIncident) <
      getDashboardAlarmIncidentRowTimeMs(existingIncident)
  ) {
    return false
  }

  return true
}

function shouldApplyListResponseIncident(
  existingIncident: DashboardAlarmIncidentProjection | undefined,
  responseIncident: DashboardAlarmIncidentProjection,
): boolean {
  if (!existingIncident) {
    return true
  }

  return (
    getDashboardAlarmIncidentRowTimeMs(responseIncident) >=
    getDashboardAlarmIncidentRowTimeMs(existingIncident)
  )
}

function mergeDashboardAlarmIncidentList(
  existingIncidents: readonly DashboardAlarmIncidentProjection[],
  listIncidents: readonly DashboardAlarmIncidentProjection[],
  edgeId: string,
): DashboardAlarmIncidentProjection[] {
  return listIncidents.reduce<DashboardAlarmIncidentProjection[]>((nextIncidents, incident) => {
    if (incident.edgeId !== edgeId) {
      return nextIncidents
    }

    const existingIncident = nextIncidents.find(
      (candidate) => candidate.incidentId === incident.incidentId,
    )

    return shouldApplyListResponseIncident(existingIncident, incident)
      ? upsertDashboardAlarmIncident(nextIncidents, incident)
      : nextIncidents
  }, [...existingIncidents])
}

export function useDashboardRuntimeSession(
  options: UseDashboardRuntimeSessionOptions,
): UseDashboardRuntimeSessionResult {
  const { edgeId, enabled = true, client } = options
  const runtimeClient = useMemo(() => client ?? cloudRuntimeClient, [client])
  const normalizedEdgeId = useMemo(() => normalizeEdgeId(edgeId), [edgeId])

  const [state, setState] = useState<DashboardRuntimeSessionState>(createIdleState)
  const stateRef = useRef(state)
  const sessionRef = useRef<DashboardRuntimeSession | null>(null)
  const generationRef = useRef(0)
  const ackRequestInFlightRef = useRef(new Map<string, number>())
  const listRequestInFlightRef = useRef(0)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  const acknowledgeAlarmIncident = useCallback(async (incidentId: string) => {
    const normalizedIncidentId = incidentId.trim()
    if (!enabled || !normalizedEdgeId || normalizedIncidentId.length === 0) {
      return
    }

    const currentState = stateRef.current
    const currentIncident = currentState.alarmIncidents.find(
      (incident) =>
        incident.incidentId === normalizedIncidentId &&
        incident.edgeId === normalizedEdgeId,
    )

    if (
      currentState.activeEdgeId !== normalizedEdgeId ||
      !currentIncident ||
      currentIncident.isAcknowledged
    ) {
      return
    }

    const requestKey = `${normalizedEdgeId}:${normalizedIncidentId}`
    const generation = generationRef.current
    if (ackRequestInFlightRef.current.get(requestKey) === generation) {
      return
    }

    ackRequestInFlightRef.current.set(requestKey, generation)

    setState((previous) => {
      if (previous.activeEdgeId !== normalizedEdgeId) {
        return previous
      }

      return {
        ...previous,
        alarmAckPendingByIncidentId: {
          ...previous.alarmAckPendingByIncidentId,
          [normalizedIncidentId]: true,
        },
        alarmAckErrorByIncidentId: omitRecordKey(
          previous.alarmAckErrorByIncidentId,
          normalizedIncidentId,
        ),
      }
    })

    try {
      const incident = await ackAlarmIncident(normalizedEdgeId, normalizedIncidentId)

      if (generation !== generationRef.current) {
        return
      }

      setState((previous) => {
        if (previous.activeEdgeId !== normalizedEdgeId) {
          return previous
        }

        const matchesRequestedIncident =
          incident.edgeId === normalizedEdgeId && incident.incidentId === normalizedIncidentId
        const existingIncident = previous.alarmIncidents.find(
          (candidate) => candidate.incidentId === normalizedIncidentId,
        )
        const shouldApplyIncident =
          matchesRequestedIncident && shouldApplyAckResponseIncident(existingIncident, incident)
        const hasAcknowledgedProjection =
          shouldApplyIncident || Boolean(existingIncident?.isAcknowledged)

        return {
          ...previous,
          alarmIncidents: shouldApplyIncident
            ? upsertDashboardAlarmIncident(previous.alarmIncidents, incident)
            : previous.alarmIncidents,
          alarmAckPendingByIncidentId: omitRecordKey(
            previous.alarmAckPendingByIncidentId,
            normalizedIncidentId,
          ),
          alarmAckErrorByIncidentId: hasAcknowledgedProjection
            ? omitRecordKey(previous.alarmAckErrorByIncidentId, normalizedIncidentId)
            : {
                ...previous.alarmAckErrorByIncidentId,
                [normalizedIncidentId]: 'Alarm incident acknowledgement was not confirmed by Cloud.',
              },
        }
      })
    } catch (error) {
      if (generation !== generationRef.current) {
        return
      }

      setState((previous) => {
        if (previous.activeEdgeId !== normalizedEdgeId) {
          return previous
        }

        return {
          ...previous,
          alarmAckPendingByIncidentId: omitRecordKey(
            previous.alarmAckPendingByIncidentId,
            normalizedIncidentId,
          ),
          alarmAckErrorByIncidentId: {
            ...previous.alarmAckErrorByIncidentId,
            [normalizedIncidentId]: toErrorMessage(error, 'Alarm incident acknowledgement failed.'),
          },
        }
      })
    } finally {
      if (ackRequestInFlightRef.current.get(requestKey) === generation) {
        ackRequestInFlightRef.current.delete(requestKey)
      }
    }
  }, [enabled, normalizedEdgeId])

  const disposeSession = useCallback(() => {
    if (!sessionRef.current) {
      return
    }

    sessionRef.current.dispose()
    sessionRef.current = null
  }, [])

  useEffect(
    () => () => {
      disposeSession()
    },
    [disposeSession],
  )

  useEffect(() => {
    generationRef.current += 1
    const generation = generationRef.current
    ackRequestInFlightRef.current.clear()
    listRequestInFlightRef.current += 1

    disposeSession()

    if (!enabled || !normalizedEdgeId) {
      setState(createIdleState())
      return
    }

    setState({
      activeEdgeId: normalizedEdgeId,
      transportStatus: 'connecting',
      edgeAvailability: 'unknown',
      latestMetricValueByBindingKey: {},
      metricRevisionByBindingKey: {},
      alarmIncidents: [],
      alarmJournalLoadState: loadingAlarmJournalLoadState,
      alarmJournalInitialLoadBlocked: null,
      alarmAckPendingByIncidentId: {},
      alarmAckErrorByIncidentId: {},
      lastServerTimestamp: null,
      runtimeError: null,
      acknowledgeAlarmIncident,
    })

    const listRequestId = listRequestInFlightRef.current + 1
    listRequestInFlightRef.current = listRequestId

    try {
      const session = runtimeClient.startSession({
        edgeId: normalizedEdgeId,
        onTransportStatusChange: (transportStatus) => {
          if (generation !== generationRef.current) {
            return
          }

          setState((previous) => ({
            ...previous,
            transportStatus,
          }))
        },
        onEdgeStatus: (edgeStatus) => {
          if (generation !== generationRef.current || edgeStatus.edgeId !== normalizedEdgeId) {
            return
          }

          setState((previous) => ({
            ...previous,
            edgeAvailability: edgeStatus.online ? 'online' : 'offline',
          }))
        },
        onTelemetry: (telemetryEvent) => {
          if (generation !== generationRef.current || telemetryEvent.edgeId !== normalizedEdgeId) {
            return
          }

          setState((previous) => ({
            ...previous,
            latestMetricValueByBindingKey: mergeTelemetryReadingsByBindingKey(
              previous.latestMetricValueByBindingKey,
              telemetryEvent.readings,
            ),
            metricRevisionByBindingKey: mergeTelemetryRevisionsByBindingKey(
              previous.metricRevisionByBindingKey,
              telemetryEvent.readings,
            ),
            lastServerTimestamp: telemetryEvent.serverTs,
          }))
        },
        onAlarmIncidentChanged: (alarmIncidentEvent) => {
          if (
            generation !== generationRef.current ||
            alarmIncidentEvent.edgeId !== normalizedEdgeId ||
            alarmIncidentEvent.incident.edgeId !== normalizedEdgeId
          ) {
            return
          }

          setState((previous) => ({
            ...previous,
            alarmIncidents: upsertDashboardAlarmIncident(
              previous.alarmIncidents,
              alarmIncidentEvent.incident,
            ),
            alarmAckPendingByIncidentId: alarmIncidentEvent.incident.isAcknowledged
              ? omitRecordKey(
                  previous.alarmAckPendingByIncidentId,
                  alarmIncidentEvent.incident.incidentId,
                )
              : previous.alarmAckPendingByIncidentId,
            alarmAckErrorByIncidentId: alarmIncidentEvent.incident.isAcknowledged
              ? omitRecordKey(
                  previous.alarmAckErrorByIncidentId,
                  alarmIncidentEvent.incident.incidentId,
                )
              : previous.alarmAckErrorByIncidentId,
          }))
        },
        onRuntimeError: (runtimeError) => {
          if (generation !== generationRef.current) {
            return
          }

          setState((previous) => ({
            ...previous,
            runtimeError: toErrorMessage(runtimeError, 'Dashboard runtime session failed.'),
          }))
        },
      })

      sessionRef.current = session

      void listAlarmIncidents(normalizedEdgeId, {
        state: 'unclosed',
        page: 1,
        limit: 50,
        sort: 'latest',
        order: 'desc',
      })
        .then((response) => {
          if (
            generation !== generationRef.current ||
            listRequestId !== listRequestInFlightRef.current
          ) {
            return
          }

          setState((previous) => {
            if (previous.activeEdgeId !== normalizedEdgeId) {
              return previous
            }

            return {
              ...previous,
              alarmIncidents: mergeDashboardAlarmIncidentList(
                previous.alarmIncidents,
                response.incidents,
                normalizedEdgeId,
              ),
              alarmJournalLoadState: loadedAlarmJournalLoadState,
            }
          })
        })
        .catch((error) => {
          if (
            generation !== generationRef.current ||
            listRequestId !== listRequestInFlightRef.current
          ) {
            return
          }

          setState((previous) => {
            if (previous.activeEdgeId !== normalizedEdgeId) {
              return previous
            }

            return {
              ...previous,
              alarmJournalLoadState: {
                status: 'error',
                error: toErrorMessage(error, 'Alarm incident list is unavailable.'),
              },
            }
          })
        })
    } catch (error) {
      setState({
        activeEdgeId: normalizedEdgeId,
        transportStatus: 'failed',
        edgeAvailability: 'unknown',
        latestMetricValueByBindingKey: {},
        metricRevisionByBindingKey: {},
        alarmIncidents: [],
        alarmJournalLoadState: idleAlarmJournalLoadState,
        alarmJournalInitialLoadBlocked: null,
        alarmAckPendingByIncidentId: {},
        alarmAckErrorByIncidentId: {},
        lastServerTimestamp: null,
        runtimeError: toErrorMessage(error, 'Dashboard runtime session failed to start.'),
        acknowledgeAlarmIncident,
      })
    }

    return () => {
      disposeSession()
    }
  }, [acknowledgeAlarmIncident, disposeSession, enabled, normalizedEdgeId, runtimeClient])

  return {
    ...state,
    acknowledgeAlarmIncident,
  }
}
