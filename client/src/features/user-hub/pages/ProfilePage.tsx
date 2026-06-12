import { useEffect, useState } from 'react'
import {
  changePassword,
  getProfileSummary,
  type UserProfileSummary,
} from '@/shared/api/profile'
import { useAuthStore } from '@/shared/store/useAuthStore'
import { ruUiText } from '@/shared/i18n'
import { getErrorDisplayMessage } from '@/shared/api/errorMessages'
import { SupportLink } from '@/shared/components/SupportLink'

interface PasswordFormState {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}

const initialPasswordForm: PasswordFormState = {
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
}

function toErrorMessage(error: unknown, fallback: string): string {
  return getErrorDisplayMessage(error, fallback)
}

function formatQuota(used: number, limit: number | null): string {
  return limit === null ? `${used} / Безлимит` : `${used} / ${limit}`
}

function describeTier(tier: UserProfileSummary['tier']): string {
  return tier === 'PRO'
    ? 'Для аккаунта доступны безлимитные мнемосхемы и назначения объектов.'
    : 'Тариф Free ограничивает количество мнемосхем и назначенных объектов.'
}

export function ProfilePage() {
  const session = useAuthStore((state) => state.session)
  const [profile, setProfile] = useState<UserProfileSummary | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [passwordForm, setPasswordForm] = useState<PasswordFormState>(initialPasswordForm)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null)
  const [isSubmittingPassword, setIsSubmittingPassword] = useState(false)

  useEffect(() => {
    let active = true

    async function loadProfile() {
      if (!session) {
        if (active) {
          setProfile(null)
          setLoadError('Для загрузки профиля нужна активная сессия.')
          setIsLoading(false)
        }
        return
      }

      setIsLoading(true)
      setLoadError(null)

      try {
        const nextProfile = await getProfileSummary()

        if (active) {
          setProfile(nextProfile)
        }
      } catch (error) {
        if (active) {
          setProfile(null)
          setLoadError(toErrorMessage(error, 'Не удалось загрузить профиль.'))
        }
      } finally {
        if (active) {
          setIsLoading(false)
        }
      }
    }

    void loadProfile()

    return () => {
      active = false
    }
  }, [session])

  async function handlePasswordSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    setPasswordError(null)
    setPasswordSuccess(null)

    if (passwordForm.currentPassword.trim().length === 0) {
      setPasswordError('Введите текущий пароль.')
      return
    }

    if (passwordForm.newPassword.length < 8) {
      setPasswordError('Новый пароль должен содержать не менее 8 символов.')
      return
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('Новые пароли не совпадают.')
      return
    }

    setIsSubmittingPassword(true)

    try {
      await changePassword({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      })
      setPasswordForm(initialPasswordForm)
      setPasswordSuccess('Пароль успешно обновлен.')
    } catch (error) {
      setPasswordError(toErrorMessage(error, 'Не удалось обновить пароль.'))
    } finally {
      setIsSubmittingPassword(false)
    }
  }

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-6">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Профиль</h1>
          <p className="text-sm text-[#94a3b8]">
            Просматривайте лимиты тарифа и управляйте паролем аккаунта.
          </p>
        </div>

        {session && (
          <div className="rounded-lg border border-[var(--color-surface-border)] bg-[var(--color-surface-100)] px-4 py-3 text-right">
            <p className="text-xs uppercase tracking-[0.2em] text-[#94a3b8]">Вход выполнен как</p>
            <p className="text-sm font-medium text-white">{session.email}</p>
          </div>
        )}
      </header>

      {loadError && (
        <div className="mb-4 rounded-md border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 px-3 py-2 text-sm text-[var(--color-danger)]">
          {loadError}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(22rem,0.8fr)]">
        <div className="space-y-6">
          {isLoading ? (
            <p className="text-sm text-[#94a3b8]">Loading profile details...</p>
          ) : profile ? (
            <>
              <section
                aria-label="profile-subscription-tier"
                className="rounded-2xl border border-[var(--color-surface-border)] bg-[var(--color-surface-100)] p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-[#94a3b8]">Тариф</p>
                    <p className="mt-2 text-3xl font-semibold text-white">
                      {profile.tier === 'FREE' ? ruUiText.terms.freeTier : profile.tier}
                    </p>
                  </div>
                  <div className="rounded-full border border-[var(--color-brand-500)]/40 bg-[var(--color-brand-500)]/10 px-3 py-1 text-xs font-medium text-[var(--color-brand-400)]">
                    {profile.role === 'ADMIN' ? ruUiText.terms.admin : ruUiText.terms.user}
                  </div>
                </div>

                <p className="mt-4 max-w-2xl text-sm text-[#cbd5e1]">{describeTier(profile.tier)}</p>

                {profile.tier === 'FREE' ? (
                  <div className="mt-5 rounded-xl border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 px-4 py-3 text-sm text-[var(--color-warning)]">
                    Перейдите на PRO, чтобы снять лимит мнемосхем и назначенных объектов.
                  </div>
                ) : (
                  <div className="mt-5 rounded-xl border border-[var(--color-online)]/30 bg-[var(--color-online)]/10 px-4 py-3 text-sm text-[var(--color-online)]">
                    Доступ PRO активен. Лимиты мнемосхем и объектов не ограничены.
                  </div>
                )}
              </section>

              <section className="grid gap-4 md:grid-cols-2">
                <article
                  aria-label="profile-diagram-usage"
                  className="rounded-2xl border border-[var(--color-surface-border)] bg-[var(--color-surface-100)] p-5"
                >
                  <p className="text-xs uppercase tracking-[0.2em] text-[#94a3b8]">Мнемосхемы</p>
                  <p className="mt-3 text-3xl font-semibold text-white">
                    {formatQuota(profile.diagramsUsed, profile.diagramsLimit)}
                  </p>
                  <p className="mt-2 text-sm text-[#94a3b8]">
                    Сохраненные мнемосхемы вашего аккаунта.
                  </p>
                </article>

                <article
                  aria-label="profile-equipment-usage"
                  className="rounded-2xl border border-[var(--color-surface-border)] bg-[var(--color-surface-100)] p-5"
                >
                  <p className="text-xs uppercase tracking-[0.2em] text-[#94a3b8]">Объекты</p>
                  <p className="mt-3 text-3xl font-semibold text-white">
                    {formatQuota(profile.equipmentUsed, profile.equipmentLimit)}
                  </p>
                  <p className="mt-2 text-sm text-[#94a3b8]">
                    Назначенные объекты, доступные для профилей телеметрии.
                  </p>
                </article>
              </section>
            </>
          ) : (
            <section className="rounded-2xl border border-dashed border-[var(--color-surface-border)] bg-[var(--color-surface-100)]/60 p-5">
              <h2 className="text-base font-semibold text-white">Сводка профиля недоступна</h2>
              <p className="mt-2 text-sm text-[#94a3b8]">
                Информация о тарифе и лимитах появится после восстановления ответа API.
              </p>
            </section>
          )}
        </div>

        <section className="rounded-2xl border border-[var(--color-surface-border)] bg-[var(--color-surface-100)] p-5">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-white">Смена пароля</h2>
            <p className="mt-1 text-sm text-[#94a3b8]">
              Укажите текущий пароль, чтобы подтвердить изменение аккаунта.
            </p>
          </div>

          <form className="space-y-4" onSubmit={(event) => void handlePasswordSubmit(event)}>
            <label className="block space-y-2 text-sm text-[#cbd5e1]">
              <span>Текущий пароль</span>
              <input
                type="password"
                value={passwordForm.currentPassword}
                onChange={(event) =>
                  setPasswordForm((prev) => ({ ...prev, currentPassword: event.target.value }))
                }
                className="w-full rounded-lg border border-[var(--color-surface-border)] bg-[var(--color-surface-0)] px-3 py-2 text-white outline-none transition focus:border-[var(--color-brand-500)]"
                autoComplete="current-password"
              />
            </label>

            <label className="block space-y-2 text-sm text-[#cbd5e1]">
              <span>Новый пароль</span>
              <input
                type="password"
                value={passwordForm.newPassword}
                onChange={(event) =>
                  setPasswordForm((prev) => ({ ...prev, newPassword: event.target.value }))
                }
                className="w-full rounded-lg border border-[var(--color-surface-border)] bg-[var(--color-surface-0)] px-3 py-2 text-white outline-none transition focus:border-[var(--color-brand-500)]"
                autoComplete="new-password"
              />
            </label>

            <label className="block space-y-2 text-sm text-[#cbd5e1]">
              <span>Повторите новый пароль</span>
              <input
                type="password"
                value={passwordForm.confirmPassword}
                onChange={(event) =>
                  setPasswordForm((prev) => ({ ...prev, confirmPassword: event.target.value }))
                }
                className="w-full rounded-lg border border-[var(--color-surface-border)] bg-[var(--color-surface-0)] px-3 py-2 text-white outline-none transition focus:border-[var(--color-brand-500)]"
                autoComplete="new-password"
              />
            </label>

            {passwordError && (
              <div className="rounded-md border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 px-3 py-2 text-sm text-[var(--color-danger)]">
                {passwordError}
              </div>
            )}

            {passwordSuccess && (
              <div className="rounded-md border border-[var(--color-online)]/30 bg-[var(--color-online)]/10 px-3 py-2 text-sm text-[var(--color-online)]">
                {passwordSuccess}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmittingPassword}
              className="w-full rounded-lg bg-[var(--color-brand-600)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[var(--color-brand-500)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmittingPassword ? 'Обновление пароля...' : 'Обновить пароль'}
            </button>
          </form>
        </section>
      </div>

      <section className="mt-6 rounded-2xl border border-[var(--color-surface-border)] bg-[var(--color-surface-100)] p-5">
        <h2 className="text-lg font-semibold text-white">Поддержка</h2>
        <p className="mt-1 text-sm text-[#94a3b8]">
          Напишите в поддержку по общему вопросу или запросите готовую мнемосхему.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <SupportLink
            userEmail={session?.email}
            className="rounded-md border border-[var(--color-surface-border)] px-3 py-2 text-sm text-[#cbd5e1] hover:bg-[var(--color-surface-200)]"
          >
            Связаться с поддержкой
          </SupportLink>
          <SupportLink
            intent="diagram-request"
            userEmail={session?.email}
            className="rounded-md bg-[var(--color-brand-600)] px-3 py-2 text-sm text-white hover:bg-[var(--color-brand-500)]"
          >
            Запросить мнемосхему
          </SupportLink>
        </div>
      </section>
    </section>
  )
}
