// T008 — AppShell: base layout with top nav bar + responsive sidebar
// Used by both Admin Hub and User Hub as their root layout wrapper.

import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { LogOut, Menu, X, LayoutDashboard } from 'lucide-react'
import { clsx } from 'clsx'
import { useAuthStore } from '@/shared/store/useAuthStore'

export interface NavItem {
    label: string
    to: string
    icon: React.ReactNode
}

interface AppShellProps {
    /** Hub title shown in sidebar header */
    hubTitle: string
    /** Navigation items for the sidebar */
    navItems: NavItem[]
}

export function AppShell({ hubTitle, navItems }: AppShellProps) {
    const [sidebarOpen, setSidebarOpen] = useState(false)
    const { session, logout } = useAuthStore()
    const navigate = useNavigate()

    function handleLogout() {
        logout()
        navigate('/login', { replace: true })
    }

    return (
        <div className="flex min-h-svh bg-[var(--color-surface-0)]">
            {/* ── Backdrop (mobile) ────────────────────────────────────────── */}
            {sidebarOpen && (
                <div
                    aria-hidden="true"
                    className="fixed inset-0 z-30 bg-black/50 lg:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* ── Sidebar ──────────────────────────────────────────────────── */}
            <aside
                id="app-sidebar"
                className={clsx(
                    'fixed top-0 left-0 z-40 flex h-full w-[var(--spacing-sidebar,15rem)] flex-col',
                    'bg-[var(--color-surface-200)] border-r border-[var(--color-surface-border)]',
                    'transition-transform duration-300 lg:translate-x-0',
                    sidebarOpen ? 'translate-x-0' : '-translate-x-full',
                )}
            >
                {/* Sidebar header */}
                <div className="flex h-14 items-center gap-2 px-4 border-b border-[var(--color-surface-border)]">
                    <LayoutDashboard size={18} className="text-[var(--color-brand-400)]" />
                    <span className="text-sm font-semibold text-white truncate">{hubTitle}</span>

                    {/* Close button (mobile) */}
                    <button
                        aria-label="Close sidebar"
                        className="ml-auto p-1 rounded text-[#64748b] hover:text-white lg:hidden"
                        onClick={() => setSidebarOpen(false)}
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Nav items */}
                <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
                    {navItems.map((item) => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            end={item.to.split('/').length <= 2}
                            onClick={() => setSidebarOpen(false)}
                            className={({ isActive }) =>
                                clsx(
                                    'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                                    isActive
                                        ? 'bg-[var(--color-brand-600)] text-white'
                                        : 'text-[#94a3b8] hover:bg-[var(--color-surface-400)] hover:text-white',
                                )
                            }
                        >
                            {item.icon}
                            {item.label}
                        </NavLink>
                    ))}
                </nav>

                {/* User info + logout */}
                <div className="border-t border-[var(--color-surface-border)] px-3 py-3">
                    {session && (
                        <>
                            <div className="mb-2 px-1">
                                <p className="text-xs font-medium text-white truncate">{session.email}</p>
                                <p className="text-[0.6875rem] text-[#64748b]">
                                    {session.role} · {session.tier}
                                </p>
                            </div>

                            <button
                                id="btn-logout"
                                onClick={handleLogout}
                                className={clsx(
                                    'flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm',
                                    'text-[#94a3b8] hover:bg-[var(--color-danger)]/10 hover:text-[var(--color-danger)]',
                                    'transition-colors',
                                )}
                            >
                                <LogOut size={14} />
                                Sign out
                            </button>
                        </>
                    )}
                </div>
            </aside>

            {/* ── Main content area ─────────────────────────────────────────── */}
            <div className="flex flex-1 flex-col lg:pl-[var(--spacing-sidebar,15rem)]">
                {/* Top nav bar */}
                <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-[var(--color-surface-border)] bg-[var(--color-surface-100)]/80 px-4 backdrop-blur-sm">
                    {/* Hamburger (mobile) */}
                    <button
                        id="btn-sidebar-toggle"
                        aria-label="Toggle sidebar"
                        aria-expanded={sidebarOpen}
                        aria-controls="app-sidebar"
                        className="rounded p-1.5 text-[#64748b] hover:text-white transition-colors lg:hidden"
                        onClick={() => setSidebarOpen((o) => !o)}
                    >
                        <Menu size={20} />
                    </button>

                    <span className="text-sm font-medium text-[#94a3b8]">{hubTitle}</span>

                    {/* Spacer */}
                    <div className="ml-auto" />

                    {/* Online badge placeholder — extended in later phases */}
                    <div className="h-2 w-2 rounded-full bg-[var(--color-online)] animate-pulse" title="Cloud connected" />
                </header>

                {/* Page content */}
                <main className="flex-1 overflow-auto">
                    <Outlet />
                </main>
            </div>
        </div>
    )
}
