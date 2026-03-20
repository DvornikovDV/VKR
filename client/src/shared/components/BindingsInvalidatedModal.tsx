import { useEffect, useId } from 'react'

export interface BindingsInvalidatedModalProps {
  open: boolean
  isSubmitting?: boolean
  error?: string | null
  onSaveAsCopy: () => void | Promise<void>
  onContinueDestructiveSave: () => void | Promise<void>
  onCancel: () => void
}

export function BindingsInvalidatedModal({
  open,
  isSubmitting = false,
  error = null,
  onSaveAsCopy,
  onContinueDestructiveSave,
  onCancel,
}: BindingsInvalidatedModalProps) {
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    if (!open) {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSubmitting) {
        event.preventDefault()
        onCancel()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, isSubmitting, onCancel])

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
          Layout save will delete existing bindings.
        </h2>
        <p id={descriptionId} className="mt-1 text-sm text-[#94a3b8]">
          This diagram already has persisted binding sets. You can create a non-destructive copy or
          continue with in-place save that clears all existing binding sets for this diagram.
        </p>

        {error && (
          <p className="mt-3 rounded-md border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 px-3 py-2 text-xs text-[var(--color-danger)]">
            {error}
          </p>
        )}

        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onSaveAsCopy}
            className="rounded-md bg-[var(--color-brand-600)] px-3 py-2 text-sm text-white hover:bg-[var(--color-brand-500)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Save As copy
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onContinueDestructiveSave}
            className="rounded-md border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 px-3 py-2 text-sm text-[var(--color-danger)] hover:bg-[var(--color-danger)]/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? 'Saving...' : 'Continue destructive save'}
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onCancel}
            className="rounded-md border border-[var(--color-surface-border)] px-3 py-2 text-sm text-white hover:bg-[var(--color-surface-200)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Continue editing
          </button>
        </div>
      </div>
    </div>
  )
}

