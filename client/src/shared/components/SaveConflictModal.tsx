import { useEffect, useId } from 'react'

export interface SaveConflictModalProps {
  open: boolean
  isReloadingLatest?: boolean
  isSavingAs?: boolean
  error?: string | null
  onReloadLatest: () => void | Promise<void>
  onContinueEditing: () => void
  onSaveAs: () => void | Promise<void>
}

export function SaveConflictModal({
  open,
  isReloadingLatest = false,
  isSavingAs = false,
  error = null,
  onReloadLatest,
  onContinueEditing,
  onSaveAs,
}: SaveConflictModalProps) {
  const titleId = useId()
  const descriptionId = useId()
  const isBusy = isReloadingLatest || isSavingAs

  useEffect(() => {
    if (!open) {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isBusy) {
        event.preventDefault()
        onContinueEditing()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, isBusy, onContinueEditing])

  if (!open) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="w-full max-w-lg rounded-lg border border-[var(--color-surface-border)] bg-[var(--color-surface-100)] p-5"
      >
        <h2 id={titleId} className="text-base font-semibold text-white">
          Save conflict detected
        </h2>
        <p id={descriptionId} className="mt-1 text-sm text-[#94a3b8]">
          A newer diagram version already exists. Your current in-memory edits are still preserved
          in this session. Choose how you want to recover.
        </p>

        {error && (
          <p className="mt-3 rounded-md border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 px-3 py-2 text-xs text-[var(--color-danger)]">
            {error}
          </p>
        )}

        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <button
            type="button"
            disabled={isBusy}
            onClick={onReloadLatest}
            className="rounded-md border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 px-3 py-2 text-sm text-[var(--color-warning)] hover:bg-[var(--color-warning)]/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isReloadingLatest ? 'Reloading...' : 'Reload latest'}
          </button>
          <button
            type="button"
            disabled={isBusy}
            onClick={onContinueEditing}
            className="rounded-md border border-[var(--color-surface-border)] px-3 py-2 text-sm text-white hover:bg-[var(--color-surface-200)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Continue editing
          </button>
          <button
            type="button"
            disabled={isBusy}
            onClick={onSaveAs}
            className="rounded-md bg-[var(--color-brand-600)] px-3 py-2 text-sm text-white hover:bg-[var(--color-brand-500)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSavingAs ? 'Saving copy...' : 'Save As copy'}
          </button>
        </div>
      </div>
    </div>
  )
}

