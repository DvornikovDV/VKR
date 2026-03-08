// T011b [US1] — useRegister hook
// Calls POST /auth/register, auto-logs in by persisting token to useAuthStore.
// On success navigates to /hub (new users are always USER role).

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiClient } from '@/shared/api/client'
import { isApiError } from '@/shared/api/client'
import { useAuthStore } from '@/shared/store/useAuthStore'
import type { Session } from '@/shared/store/useAuthStore'

// ── Types ─────────────────────────────────────────────────────────────────

interface RegisterCredentials {
    email: string
    password: string
}

interface RegisterResponse {
    user: {
        _id: string
        email: string
        role: 'ADMIN' | 'USER'
        subscriptionTier: 'FREE' | 'PRO'
    }
    token: string
}

// API client now globally unwraps { status, data } envelopes

interface UseRegisterReturn {
    register: (credentials: RegisterCredentials) => Promise<void>
    loading: boolean
    error: string | null
}

// ── Hook ──────────────────────────────────────────────────────────────────

export function useRegister(): UseRegisterReturn {
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const { setSession } = useAuthStore()
    const navigate = useNavigate()

    async function register({ email, password }: RegisterCredentials): Promise<void> {
        setError(null)
        setLoading(true)

        try {
            const data = await apiClient.post<RegisterResponse>(
                '/auth/register',
                { email, password },
                { skipAuth: true }, // register endpoint does not need JWT
            )

            const session: Session = {
                id: data.user._id,
                email: data.user.email,
                role: data.user.role,
                tier: data.user.subscriptionTier,
                accessToken: data.token,
            }

            setSession(session)

            // New users are always USER role — redirect to user hub
            navigate('/hub', { replace: true })
        } catch (err) {
            if (isApiError(err)) {
                if (err.status === 409) {
                    setError('An account with this email already exists.')
                } else if (err.status === 400) {
                    setError(err.message || 'Invalid registration data.')
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

    return { register, loading, error }
}
