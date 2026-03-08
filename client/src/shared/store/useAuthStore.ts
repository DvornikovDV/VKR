// T006 — Auth Zustand store
// Stores session in memory-state only (no window.*, no localStorage by default).
// JWT token is accessed via session.accessToken — never exposed globally.

import { create } from 'zustand'

// ── Types ─────────────────────────────────────────────────────────────────

export type AppRole = 'ADMIN' | 'USER'
export type SubscriptionTier = 'FREE' | 'PRO'

export interface Session {
    id: string
    email: string
    role: AppRole
    tier: SubscriptionTier
    accessToken: string
}

interface AuthState {
    session: Session | null
    isAuthenticated: boolean
    setSession: (session: Session) => void
    logout: () => void
}

// ── Store ──────────────────────────────────────────────────────────────────

export const useAuthStore = create<AuthState>((set) => ({
    session: null,
    isAuthenticated: false,

    setSession: (session: Session) =>
        set({ session, isAuthenticated: true }),

    logout: () =>
        set({ session: null, isAuthenticated: false }),
}))
