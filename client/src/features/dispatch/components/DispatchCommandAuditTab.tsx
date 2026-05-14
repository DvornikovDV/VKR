import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ChevronLeft, ChevronRight, Loader2, RefreshCw } from 'lucide-react'
import {
  DEFAULT_LIST_COMMAND_AUDIT_QUERY,
  listCommandAudit,
  type CommandAuditListResponse,
  type CommandAuditStatus,
} from '@/shared/api/commands'
import { DispatchCommandAuditTable } from '@/features/dispatch/components/DispatchCommandAuditTable'
import {
  DISPATCH_COMMAND_AUDIT_STATUS_OPTIONS,
  createDispatchCommandAuditRequestGuard,
  createDispatchCommandAuditRequestKey,
  isDispatchCommandAuditRequestCurrent,
  type DispatchCommandAuditRequestDescriptor,
  type DispatchCommandAuditRequestGuard,
  type DispatchCommandAuditStatusFilter,
} from '@/features/dispatch/model/commandAudit'
import type { DispatchWorkspaceContextSnapshot } from '@/features/dispatch/model/types'

interface DispatchCommandAuditTabProps {
  workspaceContext: DispatchWorkspaceContextSnapshot
  className?: string
}

type AuditLoadState = 'idle' | 'loading' | 'ready' | 'empty' | 'error'

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }

  return fallback
}

function toQueryStatus(statusFilter: DispatchCommandAuditStatusFilter): CommandAuditStatus | undefined {
  return statusFilter === 'all' ? undefined : statusFilter
}

export function DispatchCommandAuditTab({
  workspaceContext,
  className,
}: DispatchCommandAuditTabProps) {
  const selectedEdgeId = workspaceContext.selection.edgeId
  const [statusFilter, setStatusFilter] = useState<DispatchCommandAuditStatusFilter>('all')
  const [page, setPage] = useState<number>(DEFAULT_LIST_COMMAND_AUDIT_QUERY.page)
  const [limit] = useState<number>(DEFAULT_LIST_COMMAND_AUDIT_QUERY.limit)
  const [auditState, setAuditState] = useState<AuditLoadState>('idle')
  const [auditError, setAuditError] = useState<string | null>(null)
  const [auditResponse, setAuditResponse] = useState<CommandAuditListResponse | null>(null)
  const requestIdRef = useRef(0)
  const activeGuardRef = useRef<DispatchCommandAuditRequestGuard | null>(null)
  const currentDescriptorKeyRef = useRef<string | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true

    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    setPage(DEFAULT_LIST_COMMAND_AUDIT_QUERY.page)
    setAuditResponse(null)
    setAuditError(null)
    setAuditState('idle')
    activeGuardRef.current = null
    currentDescriptorKeyRef.current = null
    requestIdRef.current += 1
  }, [selectedEdgeId])

  const validationMessage = useMemo(() => {
    if (workspaceContext.status === 'loading') {
      return 'Dispatch context is still loading.'
    }

    if (workspaceContext.errorMessage) {
      return workspaceContext.errorMessage
    }

    if (!selectedEdgeId) {
      return 'Select an Edge Server before loading command audit.'
    }

    return null
  }, [selectedEdgeId, workspaceContext.errorMessage, workspaceContext.status])

  const requestDescriptor = useMemo<DispatchCommandAuditRequestDescriptor | null>(() => {
    if (!selectedEdgeId || validationMessage) {
      return null
    }

    return {
      edgeId: selectedEdgeId,
      page,
      limit,
      status: toQueryStatus(statusFilter),
    }
  }, [limit, page, selectedEdgeId, statusFilter, validationMessage])

  const requestDescriptorKey = useMemo(
    () => (requestDescriptor ? createDispatchCommandAuditRequestKey(requestDescriptor) : null),
    [requestDescriptor],
  )

  const loadAudits = useCallback(async (descriptor: DispatchCommandAuditRequestDescriptor) => {
    const requestId = ++requestIdRef.current
    const requestGuard = createDispatchCommandAuditRequestGuard(requestId, descriptor)
    activeGuardRef.current = requestGuard
    currentDescriptorKeyRef.current = requestGuard.key
    setAuditState('loading')
    setAuditError(null)

    try {
      const response = await listCommandAudit(descriptor.edgeId, {
        page: descriptor.page,
        limit: descriptor.limit,
        status: descriptor.status,
      })
      const currentGuard = activeGuardRef.current
      const responseGuardIsCurrent =
        currentDescriptorKeyRef.current === requestGuard.key
        && isDispatchCommandAuditRequestCurrent(currentGuard, requestGuard)

      if (!mountedRef.current || !responseGuardIsCurrent) {
        return
      }

      if (response.audits.some((audit) => audit.edgeId !== descriptor.edgeId)) {
        setAuditResponse(null)
        setAuditError('Command audit response did not match the selected Edge Server.')
        setAuditState('error')
        return
      }

      setAuditResponse(response)
      setAuditState(response.audits.length > 0 ? 'ready' : 'empty')
    } catch (error) {
      const currentGuard = activeGuardRef.current
      const responseGuardIsCurrent =
        currentDescriptorKeyRef.current === requestGuard.key
        && isDispatchCommandAuditRequestCurrent(currentGuard, requestGuard)

      if (!mountedRef.current || !responseGuardIsCurrent) {
        return
      }

      setAuditResponse(null)
      setAuditError(toErrorMessage(error, 'Failed to load command audit.'))
      setAuditState('error')
    }
  }, [])

  useEffect(() => {
    currentDescriptorKeyRef.current = requestDescriptorKey

    if (!requestDescriptor) {
      activeGuardRef.current = null
      return
    }

    void loadAudits(requestDescriptor)
  }, [loadAudits, requestDescriptor, requestDescriptorKey])

  function handleStatusFilterChange(value: string) {
    setStatusFilter(value as DispatchCommandAuditStatusFilter)
    setPage(DEFAULT_LIST_COMMAND_AUDIT_QUERY.page)
  }

  function handleRefresh() {
    if (!requestDescriptor) {
      return
    }

    void loadAudits(requestDescriptor)
  }

  function handlePreviousPage() {
    setPage((current) => Math.max(1, current - 1))
  }

  function handleNextPage() {
    if (!auditResponse?.hasNextPage) {
      return
    }

    setPage((current) => current + 1)
  }

  const isLoading = auditState === 'loading'
  const canPageBackward = page > 1 && !isLoading
  const canPageForward = Boolean(auditResponse?.hasNextPage) && !isLoading
  const total = auditResponse?.total ?? 0
  const rowCount = auditResponse?.audits.length ?? 0

  return (
    <section
      aria-label="Dispatch command audit"
      data-testid="dispatch-command-audit-tab"
      data-edge-id={selectedEdgeId ?? ''}
      className={className ?? 'flex min-h-0 flex-1 flex-col bg-[#08111f]'}
    >
      <form
        aria-label="Command audit filters"
        className="grid flex-shrink-0 gap-2 border-b border-[#1f2a3d] bg-[#0a1220] p-3 text-sm text-[#cbd5e1] md:grid-cols-[minmax(12rem,16rem)_1fr_auto_auto] md:items-end"
        onSubmit={(event) => {
          event.preventDefault()
          handleRefresh()
        }}
      >
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-[#94a3b8]">
            Status
          </span>
          <select
            aria-label="Command status"
            value={statusFilter}
            disabled={!requestDescriptor || isLoading}
            onChange={(event) => handleStatusFilterChange(event.target.value)}
            className="min-h-9 rounded border border-[#334155] bg-[#0f1929] px-2 py-1 text-sm text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {DISPATCH_COMMAND_AUDIT_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <p
          data-testid="dispatch-command-audit-summary"
          className="min-w-0 text-xs text-[#94a3b8] md:pb-2"
        >
          Page {page} | {rowCount} rows visible | {total} total
        </p>

        <div className="flex min-w-0 items-center gap-1">
          <button
            type="button"
            aria-label="Previous command audit page"
            disabled={!canPageBackward}
            onClick={handlePreviousPage}
            className="inline-flex min-h-9 min-w-9 items-center justify-center rounded border border-[#334155] bg-[#0f172a] text-[#cbd5e1] disabled:cursor-not-allowed disabled:text-[#64748b]"
          >
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Next command audit page"
            disabled={!canPageForward}
            onClick={handleNextPage}
            className="inline-flex min-h-9 min-w-9 items-center justify-center rounded border border-[#334155] bg-[#0f172a] text-[#cbd5e1] disabled:cursor-not-allowed disabled:text-[#64748b]"
          >
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>

        <button
          type="submit"
          data-testid="dispatch-command-audit-refresh"
          disabled={!requestDescriptor || isLoading}
          className="inline-flex min-h-9 items-center justify-center gap-2 rounded border border-[#38bdf8] bg-[#0f172a] px-3 py-1.5 text-sm font-semibold text-[#e0f2fe] transition hover:bg-[#123049] disabled:cursor-not-allowed disabled:border-[#334155] disabled:text-[#64748b]"
        >
          <RefreshCw
            size={16}
            className={isLoading ? 'animate-spin' : undefined}
            aria-hidden="true"
          />
          <span>{isLoading ? 'Loading...' : 'Refresh'}</span>
        </button>

        {validationMessage ? (
          <p role="alert" className="text-xs text-[var(--color-danger)] md:col-span-4">
            {validationMessage}
          </p>
        ) : null}
      </form>

      {auditError ? (
        <div
          role="alert"
          className="mx-3 mt-3 flex items-center gap-2 rounded-md border border-[var(--color-danger)] bg-[#190f16] p-3 text-sm text-[#fecdd3]"
        >
          <AlertTriangle size={16} aria-hidden="true" />
          <span>{auditError}</span>
        </div>
      ) : null}

      {isLoading ? (
        <div className="flex min-h-[12rem] flex-1 items-center justify-center gap-2 text-sm text-[#cbd5e1]">
          <Loader2 className="animate-spin text-[#38bdf8]" size={18} aria-hidden="true" />
          <span>Loading command audit...</span>
        </div>
      ) : auditState === 'empty' ? (
        <div
          data-testid="dispatch-command-audit-empty"
          className="flex min-h-[12rem] flex-1 items-center justify-center p-4 text-center text-sm text-[#94a3b8]"
        >
          No command audit rows were returned for the selected Edge Server.
        </div>
      ) : auditResponse && auditResponse.audits.length > 0 ? (
        <div className="min-h-0 flex-1 overflow-auto p-3">
          <DispatchCommandAuditTable audits={auditResponse.audits} />
        </div>
      ) : (
        <div className="flex min-h-[12rem] flex-1 items-center justify-center p-4 text-center text-sm text-[#94a3b8]">
          Select an Edge Server to load command audit rows.
        </div>
      )}
    </section>
  )
}
