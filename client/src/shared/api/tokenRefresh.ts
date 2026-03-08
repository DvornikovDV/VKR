// T005b — Token refresh interceptor
// 401 → silent token refresh → retry original request
// On refresh failure → show re-auth overlay (preserving page DOM / canvas state)
//
// Canvas preservation constraint:
//   The re-auth overlay MUST render as an overlay ABOVE the existing page DOM.
//   ConstructorWrapper MUST NOT be unmounted during re-auth flow.
//   We achieve this by rendering the overlay via a React portal into document.body,
//   NOT by unmounting the page. A Zustand flag `needsReAuth` triggers the portal.

import { useAuthStore } from '@/shared/store/useAuthStore'
import { isApiError } from './client'

// ── Re-auth state ──────────────────────────────────────────────────────────
// Exposed so the ReAuthOverlay component can subscribe and render itself as a portal.

import { create } from 'zustand'

interface ReAuthState {
    needsReAuth: boolean
    /** URL to preserve so user can continue after re-login */
    returnPath: string
    triggerReAuth: (returnPath: string) => void
    clearReAuth: () => void
}

export const useReAuthStore = create<ReAuthState>((set) => ({
    needsReAuth: false,
    returnPath: '/',
    triggerReAuth: (returnPath) => set({ needsReAuth: true, returnPath }),
    clearReAuth: () => set({ needsReAuth: false, returnPath: '/' }),
}))

// ── Refresh token request ──────────────────────────────────────────────────

let refreshPromise: Promise<string | null> | null = null

async function doRefresh(): Promise<string | null> {
    try {
        // POST /auth/refresh — uses httpOnly refresh cookie (server-side),
        // returns new access token in response body.
        const res = await fetch('/api/auth/refresh', {
            method: 'POST',
            credentials: 'include', // send refresh cookie
        })

        if (!res.ok) return null

        const data = (await res.json()) as { token?: string }
        return data.token ?? null
    } catch {
        return null
    }
}

// ── Interceptor wrapper ────────────────────────────────────────────────────
// Wrap a fetch-like call. On 401, attempt silent token refresh then retry once.

export async function withRefreshInterceptor<T>(
    call: () => Promise<T>,
): Promise<T> {
    try {
        return await call()
    } catch (err) {
        if (!isApiError(err) || err.status !== 401) {
            throw err
        }

        // Coalesce concurrent refresh attempts into a single request
        if (!refreshPromise) {
            refreshPromise = doRefresh().finally(() => {
                refreshPromise = null
            })
        }

        const newToken = await refreshPromise

        if (newToken) {
            // Persist new token into auth store
            const session = useAuthStore.getState().session
            if (session) {
                useAuthStore.getState().setSession({ ...session, accessToken: newToken })
            }

            // Retry original call once with updated token
            return await call()
        }

        // Refresh failed — trigger re-auth overlay WITHOUT unmounting the page
        const returnPath = window.location.pathname + window.location.search
        useAuthStore.getState().logout()
        useReAuthStore.getState().triggerReAuth(returnPath)

        throw err
    }
}
