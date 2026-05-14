import { apiClient, isApiError } from './client'

export type EdgeCommandType = 'set_bool' | 'set_number'

export type CommandAuditStatus =
    | 'accepted'
    | 'sent_to_edge'
    | 'confirmed'
    | 'timeout'
    | 'failed'

export interface EdgeCommandRequest {
    deviceId: string
    commandType: EdgeCommandType
    payload: {
        value: boolean | number
    }
}

export interface EdgeCommandSuccessResponse {
    requestId: string
    commandStatus: 'confirmed'
    completedAt: string
}

export type EdgeCommandFailureReason =
    | 'cloud_rpc_timeout'
    | 'edge_command_timeout'
    | 'edge_command_failed'
    | 'edge_unavailable'

export interface EdgeCommandErrorResponse {
    status: 'error'
    message: string
    requestId?: string
    commandStatus?: 'timeout' | 'failed'
    failureReason?: EdgeCommandFailureReason
    completedAt?: string
}

export interface CommandAuditProjection {
    requestId: string
    edgeId: string
    deviceId: string
    commandType: EdgeCommandType
    payload: EdgeCommandRequest['payload']
    requestedBy: string
    status: CommandAuditStatus
    requestedAt: string
    completedAt: string | null
    failureReason: EdgeCommandFailureReason | null
}

export interface ListCommandAuditQuery {
    page?: number
    limit?: number
    status?: CommandAuditStatus
}

export interface CommandAuditListResponse {
    audits: CommandAuditProjection[]
    page: number
    limit: number
    total: number
    hasNextPage: boolean
}

export const COMMAND_AUDIT_LIST_STATUSES = [
    'accepted',
    'sent_to_edge',
    'confirmed',
    'timeout',
    'failed',
] as const satisfies readonly CommandAuditStatus[]

export const DEFAULT_LIST_COMMAND_AUDIT_QUERY = {
    page: 1,
    limit: 50,
} as const satisfies Pick<Required<ListCommandAuditQuery>, 'page' | 'limit'>

export type NormalizedCommandOutcome =
    | 'confirmed'
    | EdgeCommandFailureReason
    | 'network_error'
    | 'unknown_error'

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null
}

function isEdgeCommandFailureReason(value: unknown): value is EdgeCommandFailureReason {
    return (
        value === 'cloud_rpc_timeout' ||
        value === 'edge_command_timeout' ||
        value === 'edge_command_failed' ||
        value === 'edge_unavailable'
    )
}

function readFailureReason(body: unknown): EdgeCommandFailureReason | null {
    if (!isRecord(body)) {
        return null
    }

    if (isEdgeCommandFailureReason(body.failureReason)) {
        return body.failureReason
    }

    if (isRecord(body.data) && isEdgeCommandFailureReason(body.data.failureReason)) {
        return body.data.failureReason
    }

    return null
}

function buildCommandAuditListQuery(query: ListCommandAuditQuery = {}): string {
    const mergedQuery = {
        ...DEFAULT_LIST_COMMAND_AUDIT_QUERY,
        ...query,
    }
    const params = new URLSearchParams()

    params.set('page', String(mergedQuery.page))
    params.set('limit', String(mergedQuery.limit))

    if (mergedQuery.status) {
        params.set('status', mergedQuery.status)
    }

    return params.toString()
}

export function listCommandAudit(
    edgeId: string,
    query?: ListCommandAuditQuery,
): Promise<CommandAuditListResponse> {
    const queryString = buildCommandAuditListQuery(query)

    return apiClient.get<CommandAuditListResponse>(
        `/edge-servers/${edgeId}/command-audit?${queryString}`,
    )
}

export async function executeEdgeServerCommand(
    edgeId: string,
    request: EdgeCommandRequest
): Promise<NormalizedCommandOutcome> {
    try {
        const response = await apiClient.post<EdgeCommandSuccessResponse>(
            `/edge-servers/${edgeId}/commands`,
            request
        )
        
        if (response && response.commandStatus === 'confirmed') {
            return 'confirmed'
        }
        
        return 'unknown_error'
    } catch (err) {
        if (isApiError(err)) {
            const failureReason = readFailureReason(err.body)

            if (err.status === 502 && failureReason === 'edge_command_timeout') {
                return 'edge_command_timeout'
            }
            if (err.status === 502 && failureReason === 'edge_command_failed') {
                return 'edge_command_failed'
            }
            if (err.status === 503 && failureReason === 'edge_unavailable') {
                return 'edge_unavailable'
            }
            if (err.status === 504 && failureReason === 'cloud_rpc_timeout') {
                return 'cloud_rpc_timeout'
            }
            
            return 'unknown_error'
        }
        
        if (err instanceof Error && err.name === 'TypeError') { // Typical network error from fetch
            return 'network_error'
        }

        return 'unknown_error'
    }
}
