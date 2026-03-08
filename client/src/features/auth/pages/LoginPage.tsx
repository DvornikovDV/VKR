// T010 [US1] — Login Page UI
// Email + password form, error state, redirects to role hub after login.

import { useState } from 'react'
import { Navigate, useLocation, Link } from 'react-router-dom'
import { Activity, Eye, EyeOff } from 'lucide-react'
import { clsx } from 'clsx'
import { useAuthStore } from '@/shared/store/useAuthStore'
import { useLogin } from '@/features/auth/hooks/useLogin'

// ── Location state type ────────────────────────────────────────────────────
interface LocationState {
    from?: { pathname: string }
}

// ── Page ──────────────────────────────────────────────────────────────────

export function LoginPage() {
    const { isAuthenticated, session } = useAuthStore()
    const location = useLocation()
    const state = location.state as LocationState | null

    // If already authenticated — redirect to appropriate hub
    if (isAuthenticated && session) {
        const dest = state?.from?.pathname
        if (dest && dest !== '/login') return <Navigate to={dest} replace />
        return <Navigate to={session.role === 'ADMIN' ? '/admin' : '/hub'} replace />
    }

    return <LoginForm />
}

// ── Login form (separated to avoid hook-in-condition issues) ──────────────

function LoginForm() {
    const { login, loading, error } = useLogin()
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        await login({ email, password })
    }

    return (
        <div className="flex min-h-svh items-center justify-center bg-[var(--color-surface-0)] px-4">
            {/* Ambient glow */}
            <div
                aria-hidden="true"
                className="pointer-events-none fixed inset-0"
                style={{
                    background:
                        'radial-gradient(ellipse 50% 40% at 50% 20%, rgba(99,102,241,0.12) 0%, transparent 70%)',
                }}
            />

            <div className="relative w-full max-w-sm">
                {/* Logo */}
                <div className="mb-8 flex flex-col items-center gap-2">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--color-brand-600)]">
                        <Activity size={22} className="text-white" />
                    </div>
                    <h1 className="text-lg font-bold text-white">VKR SCADA</h1>
                    <p className="text-sm text-[#64748b]">Sign in to your account</p>
                </div>

                {/* Card */}
                <div className="rounded-[var(--radius-modal)] border border-[var(--color-surface-border)] bg-[var(--color-surface-200)] p-7 shadow-[var(--shadow-modal)]">
                    <form id="login-form" onSubmit={(e) => { void handleSubmit(e) }} noValidate>

                        {/* Email */}
                        <div className="mb-4">
                            <label
                                htmlFor="login-email"
                                className="mb-1.5 block text-xs font-medium text-[#94a3b8]"
                            >
                                Email address
                            </label>
                            <input
                                id="login-email"
                                type="email"
                                autoComplete="email"
                                autoFocus
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="you@company.com"
                                className={clsx(
                                    'w-full rounded-lg border bg-[var(--color-surface-300)] px-3 py-2.5 text-sm text-white placeholder-[#475569]',
                                    'outline-none transition-colors',
                                    'focus:border-[var(--color-brand-500)] focus:ring-1 focus:ring-[var(--color-brand-500)]/30',
                                    error
                                        ? 'border-[var(--color-danger)]'
                                        : 'border-[var(--color-surface-border)]',
                                )}
                            />
                        </div>

                        {/* Password */}
                        <div className="mb-5">
                            <label
                                htmlFor="login-password"
                                className="mb-1.5 block text-xs font-medium text-[#94a3b8]"
                            >
                                Password
                            </label>
                            <div className="relative">
                                <input
                                    id="login-password"
                                    type={showPassword ? 'text' : 'password'}
                                    autoComplete="current-password"
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    className={clsx(
                                        'w-full rounded-lg border bg-[var(--color-surface-300)] py-2.5 pl-3 pr-10 text-sm text-white placeholder-[#475569]',
                                        'outline-none transition-colors',
                                        'focus:border-[var(--color-brand-500)] focus:ring-1 focus:ring-[var(--color-brand-500)]/30',
                                        error
                                            ? 'border-[var(--color-danger)]'
                                            : 'border-[var(--color-surface-border)]',
                                    )}
                                />
                                <button
                                    type="button"
                                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                                    onClick={() => setShowPassword((s) => !s)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#475569] hover:text-[#94a3b8] transition-colors"
                                >
                                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                                </button>
                            </div>
                        </div>

                        {/* Error */}
                        {error && (
                            <p
                                id="login-error"
                                role="alert"
                                className="mb-4 rounded-md bg-[var(--color-danger)]/10 px-3 py-2 text-xs text-[var(--color-danger)]"
                            >
                                {error}
                            </p>
                        )}

                        {/* Submit */}
                        <button
                            id="login-submit-btn"
                            type="submit"
                            disabled={loading || !email || !password}
                            className={clsx(
                                'w-full rounded-lg py-2.5 text-sm font-semibold text-white transition-all',
                                'bg-[var(--color-brand-600)] hover:bg-[var(--color-brand-500)]',
                                'disabled:cursor-not-allowed disabled:opacity-50',
                                loading && 'cursor-wait',
                            )}
                        >
                            {loading ? (
                                <span className="flex items-center justify-center gap-2">
                                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                                    </svg>
                                    Signing in…
                                </span>
                            ) : (
                                'Sign in'
                            )}
                        </button>
                    </form>
                </div>

                <p className="mt-5 text-center text-xs text-[#475569]">
                    Don't have an account?{' '}
                    <Link to="/register" className="text-[var(--color-brand-500)] hover:text-[var(--color-brand-400)] font-medium transition-colors">
                        Sign up
                    </Link>
                </p>
            </div>
        </div>
    )
}
