import { useEffect, useId } from 'react'

export interface SaveBindingsRequiresLayoutModalProps {
  open: boolean
  isSubmitting?: boolean
  onConfirm: () => void | Promise<void>
  onCancel: () => void
}

export function SaveBindingsRequiresLayoutModal({
  open,
  isSubmitting = false,
  onConfirm,
  onCancel,
}: SaveBindingsRequiresLayoutModalProps) {
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
  }, [isSubmitting, onCancel, open])

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
          Save layout before bindings?
        </h2>
        <p id={descriptionId} className="mt-1 text-sm text-[#94a3b8]">
          This diagram has unsaved layout changes. To keep bindings attached to the same diagram
          revision, the system will save the layout first and then save bindings.
        </p>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onConfirm}
            className="rounded-md bg-[var(--color-brand-600)] px-3 py-2 text-sm text-white hover:bg-[var(--color-brand-500)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? 'Saving...' : 'Save layout and bindings'}
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onCancel}
            className="rounded-md border border-[var(--color-surface-border)] px-3 py-2 text-sm text-white hover:bg-[var(--color-surface-200)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
