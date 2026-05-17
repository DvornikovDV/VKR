import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  DashboardBindingProfile,
  DashboardTransportStatus,
} from '@/features/dashboard/model/types'
import {
  cloudRuntimeClient,
  type CloudRuntimeClient,
  type DashboardRuntimeSession,
} from '@/features/dashboard/services/cloudRuntimeClient'
import {
  appendDispatchLiveTelemetryRows,
  createDispatchLiveTelemetryContextKey,
  normalizeDispatchLiveTelemetryRows,
  selectDispatchLiveTelemetryBindingPairs,
  type DispatchLiveTelemetryRow,
} from '@/features/dispatch/model/liveTelemetry'

export interface UseDispatchLiveTelemetrySessionOptions {
  diagramId: string | null
  edgeId: string | null
  bindingProfile: DashboardBindingProfile | null
  enabled?: boolean
  client?: CloudRuntimeClient
  now?: () => number
}

export interface DispatchLiveTelemetrySessionState {
  activeContextKey: string | null
  activeEdgeId: string | null
  transportStatus: DashboardTransportStatus
  rows: DispatchLiveTelemetryRow[]
  runtimeError: string | null
}

export type UseDispatchLiveTelemetrySessionResult = DispatchLiveTelemetrySessionState

function normalizeOptionalId(value: string | null | undefined): string | null {
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

function sortNewestFirst(rows: DispatchLiveTelemetryRow[]): DispatchLiveTelemetryRow[] {
  return [...rows].sort((left, right) => right.receivedAt - left.receivedAt)
}

function createIdleState(): DispatchLiveTelemetrySessionState {
  return {
    activeContextKey: null,
    activeEdgeId: null,
    transportStatus: 'idle',
    rows: [],
    runtimeError: null,
  }
}

export function useDispatchLiveTelemetrySession(
  options: UseDispatchLiveTelemetrySessionOptions,
): UseDispatchLiveTelemetrySessionResult {
  const {
    diagramId,
    edgeId,
    bindingProfile,
    enabled = true,
    client,
    now = Date.now,
  } = options
  const runtimeClient = useMemo(() => client ?? cloudRuntimeClient, [client])
  const normalizedDiagramId = useMemo(() => normalizeOptionalId(diagramId), [diagramId])
  const normalizedEdgeId = useMemo(() => normalizeOptionalId(edgeId), [edgeId])
  const bindingProfileId = useMemo(
    () => normalizeOptionalId(bindingProfile?._id),
    [bindingProfile?._id],
  )
  const contextKey = useMemo(() => {
    if (!normalizedDiagramId || !normalizedEdgeId || !bindingProfileId) {
      return null
    }

    return createDispatchLiveTelemetryContextKey({
      diagramId: normalizedDiagramId,
      edgeId: normalizedEdgeId,
      bindingProfileId,
    })
  }, [bindingProfileId, normalizedDiagramId, normalizedEdgeId])
  const relevantPairs = useMemo(
    () => selectDispatchLiveTelemetryBindingPairs(bindingProfile),
    [bindingProfile],
  )

  const [state, setState] = useState<DispatchLiveTelemetrySessionState>(createIdleState)
  const sessionRef = useRef<DashboardRuntimeSession | null>(null)
  const generationRef = useRef(0)
  const rowSequenceRef = useRef(0)
  const nowRef = useRef(now)

  useEffect(() => {
    nowRef.current = now
  }, [now])

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
    rowSequenceRef.current = 0
    disposeSession()

    if (!enabled || !contextKey || !normalizedEdgeId || !bindingProfile) {
      setState(createIdleState())
      return
    }

    setState({
      activeContextKey: contextKey,
      activeEdgeId: normalizedEdgeId,
      transportStatus: 'connecting',
      rows: [],
      runtimeError: null,
    })

    try {
      const session = runtimeClient.startTelemetryOnlySession({
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
        onTelemetry: (telemetryEvent) => {
          if (
            generation !== generationRef.current ||
            telemetryEvent.edgeId !== normalizedEdgeId
          ) {
            return
          }

          const receivedAt = nowRef.current()
          const nextRows = normalizeDispatchLiveTelemetryRows(telemetryEvent, {
            contextKey,
            relevantPairs,
            receivedAt,
            sequenceStart: rowSequenceRef.current,
          })

          if (nextRows.length === 0) {
            return
          }

          rowSequenceRef.current += nextRows.length

          setState((previous) => {
            if (
              previous.activeContextKey !== contextKey ||
              previous.activeEdgeId !== normalizedEdgeId
            ) {
              return previous
            }

            return {
              ...previous,
              rows: sortNewestFirst(
                appendDispatchLiveTelemetryRows(previous.rows, nextRows, receivedAt),
              ),
            }
          })
        },
        onRuntimeError: (runtimeError) => {
          if (generation !== generationRef.current) {
            return
          }

          setState((previous) => ({
            ...previous,
            runtimeError: toErrorMessage(runtimeError, 'Dispatch live telemetry session failed.'),
          }))
        },
      })

      sessionRef.current = session
    } catch (error) {
      setState({
        activeContextKey: contextKey,
        activeEdgeId: normalizedEdgeId,
        transportStatus: 'failed',
        rows: [],
        runtimeError: toErrorMessage(error, 'Dispatch live telemetry session failed to start.'),
      })
    }

    return () => {
      disposeSession()
    }
  }, [
    bindingProfile,
    contextKey,
    disposeSession,
    enabled,
    normalizedEdgeId,
    relevantPairs,
    runtimeClient,
  ])

  return state
}
