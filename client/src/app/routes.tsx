// T012 [US1] — React Router v7: public routes + protected hub shells
// Route wiring order (per tasks.md):
//   T012 (public + hub shell) → T019 (user hub) → T026 (admin hub) →
//   T031 (editors) → T036 (dashboard) → T040 (profile/edge)
//
// DO NOT add routes here out of order. Each subsequent Task appends to this file.

import { createBrowserRouter, Navigate } from 'react-router-dom'
import { LandingPage } from '@/features/public/pages/LandingPage'
import { LoginPage } from '@/features/auth/pages/LoginPage'
import { RegisterPage } from '@/features/auth/pages/RegisterPage'
import { ProtectedRoute } from '@/shared/components/ProtectedRoute'

// ── Placeholder pages (replaced phase-by-phase) ───────────────────────────

function HubPlaceholder({ label }: { label: string }) {
    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100svh',
                gap: '0.75rem',
                fontFamily: 'Inter, sans-serif',
            }}
        >
            <span style={{ fontSize: '2rem' }}>🔧</span>
            <h2 style={{ margin: 0, fontSize: '1rem', color: '#e2e8f0' }}>{label}</h2>
            <p style={{ margin: 0, fontSize: '0.8125rem', color: '#64748b' }}>
                Wired in Phase 4–5 — coming soon
            </p>
        </div>
    )
}

// ── Router ────────────────────────────────────────────────────────────────

export const router = createBrowserRouter([
    // ── Public zone ─────────────────────────────────────────────────────
    {
        path: '/',
        element: <LandingPage />,
    },
    {
        path: '/login',
        element: <LoginPage />,
    },
    {
        path: '/register',
        element: <RegisterPage />,
    },

    // ── User Hub (/hub/*) ────────────────────────────────────────────────
    // requiredRole='USER': authenticated User → pass; ADMIN → redirect /admin; unauth → /login
    {
        path: '/hub',
        element: <ProtectedRoute requiredRole="USER" />,
        children: [
            // T019 will replace this placeholder with UserHubLayout + real sub-routes
            {
                index: true,
                element: <HubPlaceholder label="User Hub — Gallery (Phase 4)" />,
            },
            {
                path: '*',
                element: <HubPlaceholder label="User Hub — Page (Phase 4–8)" />,
            },
        ],
    },

    // ── Admin Hub (/admin/*) ──────────────────────────────────────────────
    // requiredRole='ADMIN': authenticated Admin → pass; USER → redirect /hub; unauth → /login
    {
        path: '/admin',
        element: <ProtectedRoute requiredRole="ADMIN" />,
        children: [
            // T026 will replace this placeholder with AdminHubLayout + real sub-routes
            {
                index: true,
                element: <HubPlaceholder label="Admin Hub — Overview (Phase 5)" />,
            },
            {
                path: '*',
                element: <HubPlaceholder label="Admin Hub — Page (Phase 5)" />,
            },
        ],
    },

    // ── Catch-all → Landing ───────────────────────────────────────────────
    {
        path: '*',
        element: <Navigate to="/" replace />,
    },
])
