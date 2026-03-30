import { useEffect, useState } from 'react'
import {
  changePassword,
  getProfileSummary,
  type UserProfileSummary,
} from '@/shared/api/profile'
import { useAuthStore } from '@/shared/store/useAuthStore'

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
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }

  return fallback
}

function formatQuota(used: number, limit: number | null): string {
  return limit === null ? `${used} / Unlimited` : `${used} / ${limit}`
}

function describeTier(tier: UserProfileSummary['tier']): string {
  return tier === 'PRO'
    ? 'Unlimited diagrams and equipment assignments are enabled for your account.'
    : 'FREE tier keeps you within the starter limits for diagrams and assigned equipment.'
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
          setLoadError('Active session is required to load the profile page.')
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
          setLoadError(toErrorMessage(error, 'Failed to load profile details.'))
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
      setPasswordError('Current password is required.')
      return
    }

    if (passwordForm.newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters.')
      return
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('New passwords do not match.')
      return
    }

    setIsSubmittingPassword(true)

    try {
      await changePassword({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      })
      setPasswordForm(initialPasswordForm)
      setPasswordSuccess('Password updated successfully.')
    } catch (error) {
      setPasswordError(toErrorMessage(error, 'Failed to update password.'))
    } finally {
      setIsSubmittingPassword(false)
    }
  }

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-6">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Profile</h1>
          <p className="text-sm text-[#94a3b8]">
            Review your subscription limits and manage account password access.
          </p>
        </div>

        {session && (
          <div className="rounded-lg border border-[var(--color-surface-border)] bg-[var(--color-surface-100)] px-4 py-3 text-right">
            <p className="text-xs uppercase tracking-[0.2em] text-[#94a3b8]">Signed in as</p>
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
                    <p className="text-xs uppercase tracking-[0.2em] text-[#94a3b8]">Subscription tier</p>
                    <p className="mt-2 text-3xl font-semibold text-white">{profile.tier}</p>
                  </div>
                  <div className="rounded-full border border-[var(--color-brand-500)]/40 bg-[var(--color-brand-500)]/10 px-3 py-1 text-xs font-medium text-[var(--color-brand-400)]">
                    {profile.role}
                  </div>
                </div>

                <p className="mt-4 max-w-2xl text-sm text-[#cbd5e1]">{describeTier(profile.tier)}</p>

                {profile.tier === 'FREE' ? (
                  <div className="mt-5 rounded-xl border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 px-4 py-3 text-sm text-[var(--color-warning)]">
                    Upgrade to PRO to unlock unlimited diagrams and additional equipment slots.
                  </div>
                ) : (
                  <div className="mt-5 rounded-xl border border-[var(--color-online)]/30 bg-[var(--color-online)]/10 px-4 py-3 text-sm text-[var(--color-online)]">
                    PRO access is active. Your diagram and equipment limits are unlimited.
                  </div>
                )}
              </section>

              <section className="grid gap-4 md:grid-cols-2">
                <article
                  aria-label="profile-diagram-usage"
                  className="rounded-2xl border border-[var(--color-surface-border)] bg-[var(--color-surface-100)] p-5"
                >
                  <p className="text-xs uppercase tracking-[0.2em] text-[#94a3b8]">Diagram usage</p>
                  <p className="mt-3 text-3xl font-semibold text-white">
                    {formatQuota(profile.diagramsUsed, profile.diagramsLimit)}
                  </p>
                  <p className="mt-2 text-sm text-[#94a3b8]">
                    Saved diagrams currently owned by your account.
                  </p>
                </article>

                <article
                  aria-label="profile-equipment-usage"
                  className="rounded-2xl border border-[var(--color-surface-border)] bg-[var(--color-surface-100)] p-5"
                >
                  <p className="text-xs uppercase tracking-[0.2em] text-[#94a3b8]">Equipment quota</p>
                  <p className="mt-3 text-3xl font-semibold text-white">
                    {formatQuota(profile.equipmentUsed, profile.equipmentLimit)}
                  </p>
                  <p className="mt-2 text-sm text-[#94a3b8]">
                    Active edge assignments available for telemetry workflows.
                  </p>
                </article>
              </section>
            </>
          ) : (
            <section className="rounded-2xl border border-dashed border-[var(--color-surface-border)] bg-[var(--color-surface-100)]/60 p-5">
              <h2 className="text-base font-semibold text-white">Profile summary unavailable</h2>
              <p className="mt-2 text-sm text-[#94a3b8]">
                Subscription and quota details will appear here once the profile endpoints respond.
              </p>
            </section>
          )}
        </div>

        <section className="rounded-2xl border border-[var(--color-surface-border)] bg-[var(--color-surface-100)] p-5">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-white">Change password</h2>
            <p className="mt-1 text-sm text-[#94a3b8]">
              Use your current password to confirm the account update.
            </p>
          </div>

          <form className="space-y-4" onSubmit={(event) => void handlePasswordSubmit(event)}>
            <label className="block space-y-2 text-sm text-[#cbd5e1]">
              <span>Current password</span>
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
              <span>New password</span>
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
              <span>Confirm new password</span>
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
              {isSubmittingPassword ? 'Updating password...' : 'Update password'}
            </button>
          </form>
        </section>
      </div>
    </section>
  )
}
