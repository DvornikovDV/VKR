// T009 [US1] — Public Landing Page
// Product description, tier comparison, nav to Login.

import { Link } from 'react-router-dom'
import {
    Activity,
    Shield,
    Zap,
    BarChart3,
    Cpu,
    ArrowRight,
    Check,
} from 'lucide-react'

// ── Feature card ──────────────────────────────────────────────────────────

function FeatureCard({
    icon,
    title,
    desc,
}: {
    icon: React.ReactNode
    title: string
    desc: string
}) {
    return (
        <div className="rounded-[var(--radius-card)] border border-[var(--color-surface-border)] bg-[var(--color-surface-200)] p-6 transition-colors hover:bg-[var(--color-surface-400)]">
            <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-brand-600)]/15 text-[var(--color-brand-400)]">
                {icon}
            </div>
            <h3 className="mb-2 text-sm font-semibold text-white">{title}</h3>
            <p className="text-xs leading-relaxed text-[#64748b]">{desc}</p>
        </div>
    )
}

// ── Tier card ─────────────────────────────────────────────────────────────

function TierCard({
    name,
    price,
    features,
    highlight,
}: {
    name: string
    price: string
    features: string[]
    highlight?: boolean
}) {
    return (
        <div
            className={[
                'relative rounded-[var(--radius-card)] border p-6',
                highlight
                    ? 'border-[var(--color-brand-500)] bg-[var(--color-brand-950)]/60'
                    : 'border-[var(--color-surface-border)] bg-[var(--color-surface-200)]',
            ].join(' ')}
        >
            {highlight && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[var(--color-brand-600)] px-3 py-0.5 text-[0.6875rem] font-semibold text-white">
                    PRO
                </span>
            )}
            <p className="mb-1 text-xs font-medium uppercase tracking-widest text-[#64748b]">
                {name}
            </p>
            <p className="mb-5 text-2xl font-bold text-white">{price}</p>
            <ul className="space-y-2">
                {features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-xs text-[#94a3b8]">
                        <Check size={13} className="mt-0.5 shrink-0 text-[var(--color-success)]" />
                        {f}
                    </li>
                ))}
            </ul>
        </div>
    )
}

// ── Page ──────────────────────────────────────────────────────────────────

export function LandingPage() {
    return (
        <div className="min-h-svh bg-[var(--color-surface-0)] text-[#e2e8f0]">

            {/* ── Nav ──────────────────────────────────────────────────────── */}
            <header className="sticky top-0 z-50 border-b border-[var(--color-surface-border)] bg-[var(--color-surface-0)]/80 backdrop-blur-sm">
                <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
                    <div className="flex items-center gap-2">
                        <Activity size={18} className="text-[var(--color-brand-400)]" />
                        <span className="text-sm font-bold text-white">VKR SCADA</span>
                    </div>
                    <div className="flex gap-4 items-center">
                        <Link
                            id="landing-login-btn"
                            to="/login"
                            className="text-xs font-semibold text-[#94a3b8] hover:text-white transition-colors"
                        >
                            Sign in
                        </Link>
                        <Link
                            id="landing-register-btn"
                            to="/register"
                            className="flex flex-row items-center gap-1.5 rounded-md bg-[var(--color-brand-600)] px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[var(--color-brand-700)]"
                        >
                            Get started <ArrowRight size={13} />
                        </Link>
                    </div>
                </div>
            </header>

            {/* ── Hero ─────────────────────────────────────────────────────── */}
            <section className="relative overflow-hidden px-4 py-24 text-center">
                {/* Glow */}
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 top-0 h-[400px]"
                    style={{
                        background:
                            'radial-gradient(ellipse 60% 40% at 50% 0%, rgba(99,102,241,0.18) 0%, transparent 70%)',
                    }}
                />

                <div className="relative mx-auto max-w-3xl">
                    <span className="mb-4 inline-block rounded-full border border-[var(--color-brand-700)] bg-[var(--color-brand-950)] px-3 py-1 text-xs font-medium text-[var(--color-brand-300)]">
                        Industrial SCADA Platform
                    </span>

                    <h1 className="mb-5 text-4xl font-extrabold leading-tight tracking-tight text-white sm:text-5xl">
                        Monitor your&nbsp;
                        <span className="bg-gradient-to-r from-[var(--color-brand-400)] to-[var(--color-info)] bg-clip-text text-transparent">
                            industrial equipment
                        </span>
                        &nbsp;in&nbsp;real&nbsp;time
                    </h1>

                    <p className="mb-8 text-base leading-relaxed text-[#94a3b8]">
                        VKR SCADA connects your edge devices to a unified cloud dashboard.
                        Design mnemonic diagrams, bind telemetry metrics to visual widgets,
                        and watch live data flow — all from your browser.
                    </p>

                    <div className="flex justify-center gap-4">
                        <Link
                            id="hero-cta-btn"
                            to="/register"
                            className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-brand-600)] px-6 py-3 text-sm font-semibold text-white shadow-lg transition-all hover:bg-[var(--color-brand-500)] hover:shadow-[var(--color-brand-600)]/25 hover:shadow-xl"
                        >
                            Start for free <ArrowRight size={15} />
                        </Link>
                        <Link
                            to="/login"
                            className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-surface-300)] px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[var(--color-surface-400)] border border-[var(--color-surface-border)]"
                        >
                            Sign in
                        </Link>
                    </div>
                </div>
            </section>

            {/* ── Features ─────────────────────────────────────────────────── */}
            <section className="mx-auto max-w-6xl px-4 py-16">
                <h2 className="mb-10 text-center text-xl font-bold text-white">
                    Everything you need to operate at scale
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <FeatureCard
                        icon={<Activity size={20} />}
                        title="Live telemetry monitoring"
                        desc="WebSocket-powered real-time updates. Widget values refresh as data arrives from your edge hardware."
                    />
                    <FeatureCard
                        icon={<Cpu size={20} />}
                        title="Mnemonic diagram editor"
                        desc="Drag-and-drop visual editor (Constructor) for designing process schematics and instrument displays."
                    />
                    <FeatureCard
                        icon={<BarChart3 size={20} />}
                        title="Telemetry profiles"
                        desc="One diagram, multiple machines. Each Telemetry Profile binds widget metrics to a specific edge server."
                    />
                    <FeatureCard
                        icon={<Shield size={20} />}
                        title="Role-based access"
                        desc="Admin and User hubs are fully isolated. Admins manage fleet and users; Users monitor and configure."
                    />
                    <FeatureCard
                        icon={<Zap size={20} />}
                        title="Edge fleet management"
                        desc="Register edge servers, generate API keys, assign to users. Revoke access instantly when needed."
                    />
                    <FeatureCard
                        icon={<Activity size={20} />}
                        title="Reconnect resilience"
                        desc="Exponential-backoff reconnection. Disconnected indicator appears within 3 seconds of WS loss."
                    />
                </div>
            </section>

            {/* ── Tiers ────────────────────────────────────────────────────── */}
            <section className="mx-auto max-w-6xl px-4 py-16">
                <h2 className="mb-3 text-center text-xl font-bold text-white">
                    Simple, transparent plans
                </h2>
                <p className="mb-10 text-center text-sm text-[#64748b]">
                    Tier changes are managed by your platform Administrator.
                </p>
                <div className="mx-auto grid max-w-2xl gap-6 sm:grid-cols-2">
                    <TierCard
                        name="Free"
                        price="Free"
                        features={[
                            'Up to 3 mnemonic diagrams',
                            '1 edge server assignment',
                            'Real-time dashboard monitoring',
                            'Diagram export',
                        ]}
                    />
                    <TierCard
                        name="Pro"
                        price="Contact Admin"
                        highlight
                        features={[
                            'Unlimited mnemonic diagrams',
                            'Unlimited edge server assignments',
                            'Real-time + History dashboard',
                            'Priority support',
                        ]}
                    />
                </div>
            </section>

            {/* ── Footer ───────────────────────────────────────────────────── */}
            <footer className="border-t border-[var(--color-surface-border)] px-4 py-8 text-center text-xs text-[#475569]">
                © 2026 VKR SCADA Platform — All rights reserved
            </footer>
        </div>
    )
}
