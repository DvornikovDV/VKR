import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { mergeTelemetryReadingsByBindingKey } from '@/features/dashboard/model/selectors'
import type {
  DashboardEdgeAvailability,
  DashboardMetricValueByBindingKey,
  DashboardTransportStatus,
} from '@/features/dashboard/model/types'
import {
  cloudRuntimeClient,
  type CloudRuntimeClient,
  type DashboardRuntimeSession,
} from '@/features/dashboard/services/cloudRuntimeClient'

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
  lastServerTimestamp: number | null
  runtimeError: string | null
}

export type UseDashboardRuntimeSessionResult = DashboardRuntimeSessionState

function createIdleState(): DashboardRuntimeSessionState {
  return {
    activeEdgeId: null,
    transportStatus: 'idle',
    edgeAvailability: 'unknown',
    latestMetricValueByBindingKey: {},
    lastServerTimestamp: null,
    runtimeError: null,
  }
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

export function useDashboardRuntimeSession(
  options: UseDashboardRuntimeSessionOptions,
): UseDashboardRuntimeSessionResult {
  const { edgeId, enabled = true, client } = options
  const runtimeClient = useMemo(() => client ?? cloudRuntimeClient, [client])
  const normalizedEdgeId = useMemo(() => normalizeEdgeId(edgeId), [edgeId])

  const [state, setState] = useState<DashboardRuntimeSessionState>(createIdleState)
  const sessionRef = useRef<DashboardRuntimeSession | null>(null)
  const generationRef = useRef(0)

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
      lastServerTimestamp: null,
      runtimeError: null,
    })

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
            lastServerTimestamp: telemetryEvent.serverTs,
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
    } catch (error) {
      setState({
        activeEdgeId: normalizedEdgeId,
        transportStatus: 'failed',
        edgeAvailability: 'unknown',
        latestMetricValueByBindingKey: {},
        lastServerTimestamp: null,
        runtimeError: toErrorMessage(error, 'Dashboard runtime session failed to start.'),
      })
    }

    return () => {
      disposeSession()
    }
  }, [disposeSession, enabled, normalizedEdgeId, runtimeClient])

  return state
}
