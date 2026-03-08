// T005 — Typed REST API client with JWT Bearer injection
// All requests go through this client — no fetch() calls scattered across components.

import { useAuthStore } from '@/shared/store/useAuthStore'

// ── ApiError ───────────────────────────────────────────────────────────────
// Note: using plain Error + branded tag instead of class extends (erasableSyntaxOnly).

export interface ApiError extends Error {
    readonly _tag: 'ApiError'
    readonly status: number
    readonly body: unknown
}

export function createApiError(status: number, message: string, body?: unknown): ApiError {
    const err = new Error(message) as ApiError
    Object.assign(err, { _tag: 'ApiError' as const, status, body: body ?? null })
    err.name = 'ApiError'
    return err
}

export function isApiError(err: unknown): err is ApiError {
    return err instanceof Error && (err as ApiError)._tag === 'ApiError'
}

// ── Types ─────────────────────────────────────────────────────────────────

type RequestOptions = Omit<RequestInit, 'headers'> & {
    headers?: Record<string, string>
    /** Skip JWT injection (e.g. for /auth/login) */
    skipAuth?: boolean
}

// ── Core fetch wrapper ─────────────────────────────────────────────────────

async function request<T>(
    endpoint: string,
    options: RequestOptions = {},
): Promise<T> {
    const { skipAuth = false, headers: extraHeaders = {}, ...init } = options

    // Build Authorization header
    const authHeaders: Record<string, string> = {}
    if (!skipAuth) {
        const token = useAuthStore.getState().session?.accessToken
        if (token) {
            authHeaders['Authorization'] = `Bearer ${token}`
        }
    }

    const response = await fetch(`/api${endpoint}`, {
        ...init,
        headers: {
            'Content-Type': 'application/json',
            ...authHeaders,
            ...extraHeaders,
        },
    })

    // Empty body (204 No Content)
    if (response.status === 204) {
        return undefined as T
    }

    let body: unknown
    try {
        body = await response.json()
    } catch {
        body = null
    }

    if (!response.ok) {
        throw createApiError(
            response.status,
            (body as { message?: string })?.message ?? `HTTP ${response.status}`,
            body,
        )
    }

    // Unwrap JSend { status: 'success', data: ... } envelope if present,
    // otherwise return body as is (for endpoints that don't use the envelope yet)
    const jsendBody = body as { status?: string; data?: T }
    if (jsendBody && typeof jsendBody === 'object' && 'data' in jsendBody) {
        return jsendBody.data as T
    }

    return body as T
}

// ── Public API ─────────────────────────────────────────────────────────────

export const apiClient = {
    get: <T>(endpoint: string, options?: RequestOptions) =>
        request<T>(endpoint, { method: 'GET', ...options }),

    post: <T>(endpoint: string, data?: unknown, options?: RequestOptions) =>
        request<T>(endpoint, {
            method: 'POST',
            body: data !== undefined ? JSON.stringify(data) : undefined,
            ...options,
        }),

    put: <T>(endpoint: string, data?: unknown, options?: RequestOptions) =>
        request<T>(endpoint, {
            method: 'PUT',
            body: data !== undefined ? JSON.stringify(data) : undefined,
            ...options,
        }),

    patch: <T>(endpoint: string, data?: unknown, options?: RequestOptions) =>
        request<T>(endpoint, {
            method: 'PATCH',
            body: data !== undefined ? JSON.stringify(data) : undefined,
            ...options,
        }),

    delete: <T>(endpoint: string, options?: RequestOptions) =>
        request<T>(endpoint, { method: 'DELETE', ...options }),
}
