// T046 — Unit tests: useAuthStore
// Covers: setSession, logout, isAuthenticated transitions

import { describe, it, expect, beforeEach } from 'vitest'
import { act } from '@testing-library/react'
import { useAuthStore } from '@/shared/store/useAuthStore'
import type { Session } from '@/shared/store/useAuthStore'

// ── Fixtures ──────────────────────────────────────────────────────────────

const mockSession: Session = {
    id: 'user-123',
    email: 'user@test.com',
    role: 'USER',
    tier: 'FREE',
    accessToken: 'test-jwt-token',
}

const adminSession: Session = {
    id: 'admin-456',
    email: 'admin@test.com',
    role: 'ADMIN',
    tier: 'PRO',
    accessToken: 'admin-jwt-token',
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getState() {
    return useAuthStore.getState()
}

// Reset store before each test (Zustand stores persist between tests otherwise)
beforeEach(() => {
    act(() => {
        useAuthStore.setState({ session: null, isAuthenticated: false })
    })
})

// ── Tests ──────────────────────────────────────────────────────────────────

describe('useAuthStore', () => {
    describe('initial state', () => {
        it('starts unauthenticated with no session', () => {
            const { session, isAuthenticated } = getState()
            expect(session).toBeNull()
            expect(isAuthenticated).toBe(false)
        })
    })

    describe('setSession', () => {
        it('sets session and marks isAuthenticated = true', () => {
            act(() => { getState().setSession(mockSession) })

            const { session, isAuthenticated } = getState()
            expect(isAuthenticated).toBe(true)
            expect(session).toEqual(mockSession)
        })

        it('stores all session fields correctly', () => {
            act(() => { getState().setSession(mockSession) })

            const { session } = getState()
            expect(session?.id).toBe('user-123')
            expect(session?.email).toBe('user@test.com')
            expect(session?.role).toBe('USER')
            expect(session?.tier).toBe('FREE')
            expect(session?.accessToken).toBe('test-jwt-token')
        })

        it('replaces existing session on second setSession call', () => {
            act(() => { getState().setSession(mockSession) })
            act(() => { getState().setSession(adminSession) })

            const { session, isAuthenticated } = getState()
            expect(isAuthenticated).toBe(true)
            expect(session?.id).toBe('admin-456')
            expect(session?.role).toBe('ADMIN')
        })
    })

    describe('logout', () => {
        it('clears session and sets isAuthenticated = false', () => {
            act(() => { getState().setSession(mockSession) })
            act(() => { getState().logout() })

            const { session, isAuthenticated } = getState()
            expect(isAuthenticated).toBe(false)
            expect(session).toBeNull()
        })

        it('logout on already-unauthenticated state is safe (no throw)', () => {
            expect(() => {
                act(() => { getState().logout() })
            }).not.toThrow()

            expect(getState().isAuthenticated).toBe(false)
        })
    })

    describe('isAuthenticated transitions', () => {
        it('follows: false → setSession → true → logout → false', () => {
            expect(getState().isAuthenticated).toBe(false)

            act(() => { getState().setSession(mockSession) })
            expect(getState().isAuthenticated).toBe(true)

            act(() => { getState().logout() })
            expect(getState().isAuthenticated).toBe(false)
        })

        it('accessToken is preserved in store (not exposed to window)', () => {
            act(() => { getState().setSession(adminSession) })

            // Token should be in store, NOT on window
            expect(getState().session?.accessToken).toBe('admin-jwt-token')
            // @ts-expect-error — intentional global check
            expect((window as Record<string, unknown>)['accessToken']).toBeUndefined()
        })
    })
})
