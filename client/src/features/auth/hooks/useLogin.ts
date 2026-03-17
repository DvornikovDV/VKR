// T011 [US1] — useLogin hook
// Calls POST /auth/login, persists session to useAuthStore, navigates to role hub.

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiClient } from '@/shared/api/client'
import { isApiError } from '@/shared/api/client'
import { useAuthStore } from '@/shared/store/useAuthStore'
import type { Session } from '@/shared/store/useAuthStore'

// ── Types ─────────────────────────────────────────────────────────────────

interface LoginCredentials {
    email: string
    password: string
}

interface LoginResponse {
    user: {
        _id: string
        email: string
        role: 'ADMIN' | 'USER'
        subscriptionTier: 'FREE' | 'PRO'
    }
    token: string
}

interface UseLoginReturn {
    login: (credentials: LoginCredentials) => Promise<void>
    loading: boolean
    error: string | null
}

const BANNED_ACCOUNT_MESSAGE = 'Your account has been suspended. Please contact support.'

function isBannedAccountError(message: string): boolean {
    const normalizedMessage = message.toLowerCase()
    return normalizedMessage.includes('suspend') || normalizedMessage.includes('bann')
}

// ── Hook ──────────────────────────────────────────────────────────────────

export function useLogin(): UseLoginReturn {
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const { setSession } = useAuthStore()
    const navigate = useNavigate()

    async function login({ email, password }: LoginCredentials): Promise<void> {
        setError(null)
        setLoading(true)

        try {
            const data = await apiClient.post<LoginResponse>(
                '/auth/login',
                { email, password },
                { skipAuth: true }, // login endpoint does not need JWT
            )

            const session: Session = {
                id: data.user._id,
                email: data.user.email,
                role: data.user.role,
                tier: data.user.subscriptionTier,
                accessToken: data.token,
            }

            setSession(session)

            // Redirect to role-appropriate hub
            navigate(session.role === 'ADMIN' ? '/admin' : '/hub', { replace: true })
        } catch (err) {
            if (isApiError(err)) {
                if (err.status === 401 || err.status === 403) {
                    setError(
                        isBannedAccountError(err.message)
                            ? BANNED_ACCOUNT_MESSAGE
                            : 'Invalid email or password.',
                    )
                } else if (err.status >= 500) {
                    setError('Server error. Please try again later.')
                } else {
                    setError(err.message)
                }
            } else {
                setError('Connection error. Please check your network.')
            }
        } finally {
            setLoading(false)
        }
    }

    return { login, loading, error }
}
