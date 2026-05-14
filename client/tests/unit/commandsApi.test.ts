import { describe, it, expect, vi, beforeEach } from 'vitest'
import { executeEdgeServerCommand, listCommandAudit } from '@/shared/api/commands'
import { apiClient, createApiError } from '@/shared/api/client'

vi.mock('@/shared/api/client', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/shared/api/client')>()
    return {
        ...actual,
        apiClient: {
            get: vi.fn(),
            post: vi.fn(),
        },
    }
})

describe('commandsApi', () => {
    beforeEach(() => {
        vi.mocked(apiClient.get).mockReset()
        vi.mocked(apiClient.post).mockReset()
    })

    it('lists command audit rows through apiClient.get using the unwrapped Cloud list response', async () => {
        const response = {
            audits: [
                {
                    requestId: 'request-1',
                    edgeId: 'edge-1',
                    deviceId: 'pump-1',
                    commandType: 'set_bool' as const,
                    payload: { value: true },
                    requestedBy: 'user-1',
                    status: 'confirmed' as const,
                    requestedAt: '2026-05-14T08:00:00.000Z',
                    completedAt: '2026-05-14T08:00:02.000Z',
                    failureReason: null,
                },
            ],
            page: 2,
            limit: 25,
            total: 26,
            hasNextPage: true,
        }
        vi.mocked(apiClient.get).mockResolvedValue(response)

        await expect(
            listCommandAudit('edge-1', {
                page: 2,
                limit: 25,
                status: 'confirmed',
            }),
        ).resolves.toEqual(response)

        expect(apiClient.get).toHaveBeenCalledWith(
            '/edge-servers/edge-1/command-audit?page=2&limit=25&status=confirmed',
        )
        expect(apiClient.post).not.toHaveBeenCalled()
    })

    it('returns confirmed when the API returns commandStatus confirmed', async () => {
        vi.mocked(apiClient.post).mockResolvedValue({
            requestId: 'command-request-1',
            commandStatus: 'confirmed',
            completedAt: '2026-05-07T00:00:00.000Z',
        })
        
        const result = await executeEdgeServerCommand('edge-1', {
            deviceId: 'dev-1',
            commandType: 'set_bool',
            payload: { value: true }
        })
        
        expect(result).toBe('confirmed')
        expect(apiClient.post).toHaveBeenCalledWith('/edge-servers/edge-1/commands', {
            deviceId: 'dev-1',
            commandType: 'set_bool',
            payload: { value: true }
        })
    })

    it('returns edge_command_timeout on 502 with failureReason edge_command_timeout', async () => {
        vi.mocked(apiClient.post).mockRejectedValue(
            createApiError(502, 'Gateway Timeout', { failureReason: 'edge_command_timeout' })
        )
        const result = await executeEdgeServerCommand('edge-1', {
            deviceId: 'dev-1', commandType: 'set_bool', payload: { value: true }
        })
        expect(result).toBe('edge_command_timeout')
    })

    it('returns edge_command_failed on 502 with failureReason edge_command_failed', async () => {
        vi.mocked(apiClient.post).mockRejectedValue(
            createApiError(502, 'Bad Gateway', { failureReason: 'edge_command_failed' })
        )
        const result = await executeEdgeServerCommand('edge-1', {
            deviceId: 'dev-1', commandType: 'set_bool', payload: { value: true }
        })
        expect(result).toBe('edge_command_failed')
    })

    it('returns edge_unavailable on 503 with failureReason edge_unavailable', async () => {
        vi.mocked(apiClient.post).mockRejectedValue(
            createApiError(503, 'Service Unavailable', { failureReason: 'edge_unavailable' })
        )
        const result = await executeEdgeServerCommand('edge-1', {
            deviceId: 'dev-1', commandType: 'set_bool', payload: { value: true }
        })
        expect(result).toBe('edge_unavailable')
    })

    it('returns cloud_rpc_timeout on 504 with failureReason cloud_rpc_timeout', async () => {
        vi.mocked(apiClient.post).mockRejectedValue(
            createApiError(504, 'Gateway Timeout', { failureReason: 'cloud_rpc_timeout' })
        )
        const result = await executeEdgeServerCommand('edge-1', {
            deviceId: 'dev-1', commandType: 'set_bool', payload: { value: true }
        })
        expect(result).toBe('cloud_rpc_timeout')
    })

    it('returns unknown_error for generic 500 error', async () => {
        vi.mocked(apiClient.post).mockRejectedValue(
            createApiError(500, 'Internal Server Error', { message: 'boom' })
        )
        const result = await executeEdgeServerCommand('edge-1', {
            deviceId: 'dev-1', commandType: 'set_bool', payload: { value: true }
        })
        expect(result).toBe('unknown_error')
    })

    it('returns network_error for a fetch TypeError', async () => {
        vi.mocked(apiClient.post).mockRejectedValue(new TypeError('Failed to fetch'))
        const result = await executeEdgeServerCommand('edge-1', {
            deviceId: 'dev-1', commandType: 'set_bool', payload: { value: true }
        })
        expect(result).toBe('network_error')
    })
    
    it('returns unknown_error if api responds with an unexpected structure', async () => {
        vi.mocked(apiClient.post).mockResolvedValue({ somethingElse: 'ok' })
        const result = await executeEdgeServerCommand('edge-1', {
            deviceId: 'dev-1', commandType: 'set_bool', payload: { value: true }
        })
        expect(result).toBe('unknown_error')
    })
})
