// T007 — ProtectedRoute component
// Role-based route guard:
//   - Unauthenticated → /login
//   - ADMIN on /hub/* → /admin
//   - USER on /admin/* → /hub
//
// Usage: wrap route elements in <ProtectedRoute requiredRole="ADMIN" />

import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/shared/store/useAuthStore'
import type { AppRole } from '@/shared/store/useAuthStore'

// ── Re-auth overlay portal ─────────────────────────────────────────────────
import { useReAuthStore } from '@/shared/api/tokenRefresh'
import { ReAuthOverlay } from '@/shared/components/ReAuthOverlay'

interface ProtectedRouteProps {
    /** Which role is allowed in this sub-tree */
    requiredRole: AppRole
}

export function ProtectedRoute({ requiredRole }: ProtectedRouteProps) {
    const { isAuthenticated, session } = useAuthStore()
    const needsReAuth = useReAuthStore((s) => s.needsReAuth)
    const location = useLocation()

    // Not logged in → redirect to /login, preserve intended destination
    if (!isAuthenticated || !session) {
        return <Navigate to="/login" state={{ from: location }} replace />
    }

    // Cross-hub redirect: ADMIN trying to access /hub/* → /admin
    if (session.role === 'ADMIN' && requiredRole === 'USER') {
        return <Navigate to="/admin" replace />
    }

    // Cross-hub redirect: USER trying to access /admin/* → /hub
    if (session.role === 'USER' && requiredRole === 'ADMIN') {
        return <Navigate to="/hub" replace />
    }

    // Token expired mid-session → show overlay above current page (canvas preserved)
    if (needsReAuth) {
        return (
            <>
                <Outlet />
                <ReAuthOverlay />
            </>
        )
    }

    return <Outlet />
}
