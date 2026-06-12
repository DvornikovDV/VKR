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
import { ruUiText } from '@/shared/i18n'
import { SupportLink } from '@/shared/components/SupportLink'

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
                            {ruUiText.actions.signIn}
                        </Link>
                        <Link
                            id="landing-register-btn"
                            to="/register"
                            className="flex flex-row items-center gap-1.5 rounded-md bg-[var(--color-brand-600)] px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[var(--color-brand-700)]"
                        >
                            Начать <ArrowRight size={13} />
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
                        Облачная SCADA-платформа
                    </span>

                    <h1 className="mb-5 text-4xl font-extrabold leading-tight tracking-tight text-white sm:text-5xl">
                        Облачная диспетчеризация&nbsp;
                        <span className="bg-gradient-to-r from-[var(--color-brand-400)] to-[var(--color-info)] bg-clip-text text-transparent">
                            инженерных систем
                        </span>
                    </h1>

                    <p className="mb-8 text-base leading-relaxed text-[#94a3b8]">
                        VKR SCADA связывает локальные Edge-узлы с единой облачной платформой.
                        Создавайте мнемосхемы, привязывайте телеметрию к визуальным элементам
                        и наблюдайте за состоянием объектов прямо в браузере.
                    </p>

                    <div className="flex justify-center gap-4">
                        <Link
                            id="hero-cta-btn"
                            to="/register"
                            className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-brand-600)] px-6 py-3 text-sm font-semibold text-white shadow-lg transition-all hover:bg-[var(--color-brand-500)] hover:shadow-[var(--color-brand-600)]/25 hover:shadow-xl"
                        >
                            Начать бесплатно <ArrowRight size={15} />
                        </Link>
                        <Link
                            to="/login"
                            className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-surface-300)] px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[var(--color-surface-400)] border border-[var(--color-surface-border)]"
                        >
                            {ruUiText.actions.signIn}
                        </Link>
                    </div>
                </div>
            </section>

            {/* ── Features ─────────────────────────────────────────────────── */}
            <section className="mx-auto max-w-6xl px-4 py-16">
                <h2 className="mb-10 text-center text-xl font-bold text-white">
                    Все, что нужно для диспетчеризации объектов
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <FeatureCard
                        icon={<Activity size={20} />}
                        title="Живая телеметрия"
                        desc="Обновления в реальном времени по WebSocket. Значения виджетов меняются по мере поступления данных с объекта."
                    />
                    <FeatureCard
                        icon={<Cpu size={20} />}
                        title="Редактор мнемосхем"
                        desc="Визуальный конструктор для схем технологического процесса, приборов и операторских экранов."
                    />
                    <FeatureCard
                        icon={<BarChart3 size={20} />}
                        title="Профили телеметрии"
                        desc="Одна мнемосхема может работать с разными объектами. Профиль телеметрии связывает виджеты с метриками конкретного Edge-узла."
                    />
                    <FeatureCard
                        icon={<Shield size={20} />}
                        title="Доступ по ролям"
                        desc="Администрирование и кабинет пользователя разделены. Администратор управляет объектами и пользователями, пользователь работает со своими схемами."
                    />
                    <FeatureCard
                        icon={<Zap size={20} />}
                        title="Управление объектами"
                        desc="Регистрируйте Edge-узлы, выдавайте ключи доступа, назначайте объекты пользователям и быстро отзывайте доступ."
                    />
                    <FeatureCard
                        icon={<Activity size={20} />}
                        title="Восстановление связи"
                        desc="Интерфейс показывает потерю соединения и автоматически пытается восстановить обмен данными с облаком."
                    />
                </div>
            </section>

            {/* ── Tiers ────────────────────────────────────────────────────── */}
            <section className="mx-auto max-w-6xl px-4 py-16">
                <h2 className="mb-3 text-center text-xl font-bold text-white">
                    Простые тарифы для MVP
                </h2>
                <p className="mb-10 text-center text-sm text-[#64748b]">
                    Изменение тарифа выполняет администратор платформы.
                </p>
                <div className="mx-auto grid max-w-2xl gap-6 sm:grid-cols-2">
                    <TierCard
                        name="Free"
                        price="Бесплатно"
                        features={[
                            'До 3 мнемосхем',
                            '1 назначенный объект',
                            'Диспетчеризация в реальном времени',
                            'Экспорт схем',
                        ]}
                    />
                    <TierCard
                        name="Pro"
                        price="Через администратора"
                        highlight
                        features={[
                            'Безлимитные мнемосхемы',
                            'Безлимитные назначенные объекты',
                            'Диспетчеризация и история данных',
                            'Приоритетная поддержка',
                        ]}
                    />
                </div>
            </section>

            {/* ── Footer ───────────────────────────────────────────────────── */}
            <footer className="border-t border-[var(--color-surface-border)] px-4 py-8 text-xs text-[#475569]">
                <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-4 gap-y-2">
                    <span>© 2026 VKR SCADA Platform*</span>
                    <SupportLink className="text-[var(--color-brand-400)] hover:text-[var(--color-brand-300)]">
                        Связаться с поддержкой
                    </SupportLink>
                </div>
            </footer>
        </div>
    )
}
