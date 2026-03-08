// T049 — Integration tests: ProtectedRoute
// Covers the role-redirect matrix per spec US1:
//   - Unauthenticated → any protected route → /login
//   - USER on /admin/* → /hub
//   - ADMIN on /hub/* → /admin

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
    createMemoryRouter,
    RouterProvider,
} from 'react-router-dom'
import { act } from '@testing-library/react'
import { useAuthStore } from '@/shared/store/useAuthStore'
import { ProtectedRoute } from '@/shared/components/ProtectedRoute'
import type { Session } from '@/shared/store/useAuthStore'

// ── Fixtures ──────────────────────────────────────────────────────────────

const userSession: Session = {
    id: 'u1',
    email: 'user@test.com',
    role: 'USER',
    tier: 'FREE',
    accessToken: 'tok-user',
}

const adminSession: Session = {
    id: 'a1',
    email: 'admin@test.com',
    role: 'ADMIN',
    tier: 'PRO',
    accessToken: 'tok-admin',
}

// ── Router factory ────────────────────────────────────────────────────────
// Creates a minimal in-memory router that mirrors the real route structure.

function makeRouter(initialPath: string) {
    return createMemoryRouter(
        [
            { path: '/login', element: <div data-testid="login-page">Login</div> },
            { path: '/', element: <div data-testid="landing-page">Landing</div> },

            // User hub — requires USER role
            {
                path: '/hub',
                element: <ProtectedRoute requiredRole="USER" />,
                children: [
                    {
                        index: true,
                        element: <div data-testid="hub-page">Hub</div>,
                    },
                    {
                        path: 'dashboard',
                        element: <div data-testid="hub-dashboard">Dashboard</div>,
                    },
                ],
            },

            // Admin hub — requires ADMIN role
            {
                path: '/admin',
                element: <ProtectedRoute requiredRole="ADMIN" />,
                children: [
                    {
                        index: true,
                        element: <div data-testid="admin-page">Admin</div>,
                    },
                    {
                        path: 'users',
                        element: <div data-testid="admin-users">Users</div>,
                    },
                ],
            },
        ],
        { initialEntries: [initialPath] },
    )
}

// ── Helpers ────────────────────────────────────────────────────────────────

function renderRouter(path: string) {
    const r = makeRouter(path)
    render(<RouterProvider router={r} />)
    return r
}

// Reset auth store before each test
beforeEach(() => {
    act(() => {
        useAuthStore.setState({ session: null, isAuthenticated: false })
    })
})
afterEach(() => {
    act(() => {
        useAuthStore.setState({ session: null, isAuthenticated: false })
    })
})

// ── Tests ──────────────────────────────────────────────────────────────────

describe('ProtectedRoute — role-redirect matrix', () => {

    describe('Unauthenticated access', () => {
        it('redirects unauthenticated user from /hub to /login', () => {
            renderRouter('/hub')
            expect(screen.getByTestId('login-page')).toBeInTheDocument()
            expect(screen.queryByTestId('hub-page')).not.toBeInTheDocument()
        })

        it('redirects unauthenticated user from /admin to /login', () => {
            renderRouter('/admin')
            expect(screen.getByTestId('login-page')).toBeInTheDocument()
            expect(screen.queryByTestId('admin-page')).not.toBeInTheDocument()
        })

        it('redirects unauthenticated user from /hub/dashboard to /login', () => {
            renderRouter('/hub/dashboard')
            expect(screen.getByTestId('login-page')).toBeInTheDocument()
        })

        it('redirects unauthenticated user from /admin/users to /login', () => {
            renderRouter('/admin/users')
            expect(screen.getByTestId('login-page')).toBeInTheDocument()
        })
    })

    describe('USER role access', () => {
        beforeEach(() => {
            act(() => { useAuthStore.getState().setSession(userSession) })
        })

        it('allows USER to access /hub', () => {
            renderRouter('/hub')
            expect(screen.getByTestId('hub-page')).toBeInTheDocument()
            expect(screen.queryByTestId('login-page')).not.toBeInTheDocument()
        })

        it('allows USER to access /hub/dashboard', () => {
            renderRouter('/hub/dashboard')
            expect(screen.getByTestId('hub-dashboard')).toBeInTheDocument()
        })

        it('redirects USER from /admin to /hub', () => {
            renderRouter('/admin')
            expect(screen.getByTestId('hub-page')).toBeInTheDocument()
            expect(screen.queryByTestId('admin-page')).not.toBeInTheDocument()
        })

        it('redirects USER from /admin/users to /hub', () => {
            renderRouter('/admin/users')
            expect(screen.getByTestId('hub-page')).toBeInTheDocument()
            expect(screen.queryByTestId('admin-users')).not.toBeInTheDocument()
        })
    })

    describe('ADMIN role access', () => {
        beforeEach(() => {
            act(() => { useAuthStore.getState().setSession(adminSession) })
        })

        it('allows ADMIN to access /admin', () => {
            renderRouter('/admin')
            expect(screen.getByTestId('admin-page')).toBeInTheDocument()
            expect(screen.queryByTestId('login-page')).not.toBeInTheDocument()
        })

        it('allows ADMIN to access /admin/users', () => {
            renderRouter('/admin/users')
            expect(screen.getByTestId('admin-users')).toBeInTheDocument()
        })

        it('redirects ADMIN from /hub to /admin', () => {
            renderRouter('/hub')
            expect(screen.getByTestId('admin-page')).toBeInTheDocument()
            expect(screen.queryByTestId('hub-page')).not.toBeInTheDocument()
        })

        it('redirects ADMIN from /hub/dashboard to /admin', () => {
            renderRouter('/hub/dashboard')
            expect(screen.getByTestId('admin-page')).toBeInTheDocument()
            expect(screen.queryByTestId('hub-dashboard')).not.toBeInTheDocument()
        })
    })
})
