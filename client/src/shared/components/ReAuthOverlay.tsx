// ReAuthOverlay — показывается поверх страницы через React portal когда токен истёк.
// Canvas constraint: ConstructorWrapper НЕ размонтируется, overlay рендерится ПОВЕРХ.

import { createPortal } from 'react-dom'
import { useState } from 'react'
import { useReAuthStore } from '@/shared/api/tokenRefresh'
import { useAuthStore } from '@/shared/store/useAuthStore'
import type { Session } from '@/shared/store/useAuthStore'

interface LoginResponse {
    user: {
        id: string
        email: string
        role: 'ADMIN' | 'USER'
        tier: 'FREE' | 'PRO'
    }
    token: string
}

export function ReAuthOverlay() {
    const { clearReAuth } = useReAuthStore()
    const { setSession } = useAuthStore()

    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setError(null)
        setLoading(true)

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            })

            const data = (await res.json()) as LoginResponse

            if (!res.ok) {
                setError('Invalid credentials. Please try again.')
                return
            }

            const session: Session = {
                id: data.user.id,
                email: data.user.email,
                role: data.user.role,
                tier: data.user.tier,
                accessToken: data.token,
            }
            setSession(session)
            clearReAuth()
        } catch {
            setError('Connection error. Please try again.')
        } finally {
            setLoading(false)
        }
    }

    return createPortal(
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="reauth-title"
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 9999,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(0,0,0,0.75)',
                backdropFilter: 'blur(4px)',
            }}
        >
            <div
                style={{
                    background: 'var(--color-surface-200, #1c2030)',
                    border: '1px solid var(--color-surface-border, #323852)',
                    borderRadius: '1rem',
                    padding: '2rem',
                    width: '100%',
                    maxWidth: '360px',
                    boxShadow: 'var(--shadow-modal)',
                }}
            >
                <h2
                    id="reauth-title"
                    style={{ margin: '0 0 0.5rem', color: '#e2e8f0', fontSize: '1.125rem' }}
                >
                    Session expired
                </h2>
                <p style={{ margin: '0 0 1.5rem', color: '#94a3b8', fontSize: '0.875rem' }}>
                    Your session has expired. Please sign in again to continue — your work
                    is preserved.
                </p>

                <form onSubmit={(e) => { void handleSubmit(e) }}>
                    <div style={{ marginBottom: '1rem' }}>
                        <label htmlFor="reauth-email" style={{ display: 'block', marginBottom: '0.25rem', color: '#94a3b8', fontSize: '0.75rem' }}>
                            Email
                        </label>
                        <input
                            id="reauth-email"
                            type="email"
                            autoComplete="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            style={{
                                width: '100%',
                                padding: '0.5rem 0.75rem',
                                background: 'var(--color-surface-300, #252a3a)',
                                border: '1px solid var(--color-surface-border, #323852)',
                                borderRadius: '0.5rem',
                                color: '#e2e8f0',
                                fontSize: '0.875rem',
                                outline: 'none',
                            }}
                        />
                    </div>

                    <div style={{ marginBottom: '1.25rem' }}>
                        <label htmlFor="reauth-password" style={{ display: 'block', marginBottom: '0.25rem', color: '#94a3b8', fontSize: '0.75rem' }}>
                            Password
                        </label>
                        <input
                            id="reauth-password"
                            type="password"
                            autoComplete="current-password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            style={{
                                width: '100%',
                                padding: '0.5rem 0.75rem',
                                background: 'var(--color-surface-300, #252a3a)',
                                border: '1px solid var(--color-surface-border, #323852)',
                                borderRadius: '0.5rem',
                                color: '#e2e8f0',
                                fontSize: '0.875rem',
                                outline: 'none',
                            }}
                        />
                    </div>

                    {error && (
                        <p style={{ color: 'var(--color-danger, #ef4444)', fontSize: '0.8125rem', marginBottom: '1rem' }}>
                            {error}
                        </p>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        style={{
                            width: '100%',
                            padding: '0.625rem',
                            background: 'var(--color-brand-600, #4f46e5)',
                            border: 'none',
                            borderRadius: '0.5rem',
                            color: '#fff',
                            fontSize: '0.875rem',
                            fontWeight: 600,
                            cursor: loading ? 'not-allowed' : 'pointer',
                            opacity: loading ? 0.7 : 1,
                        }}
                    >
                        {loading ? 'Signing in…' : 'Sign in'}
                    </button>
                </form>
            </div>
        </div>,
        document.body,
    )
}
