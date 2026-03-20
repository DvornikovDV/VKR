import { useEffect, useId, useRef, useState } from 'react'

const DEFAULT_TITLE = 'Save Diagram As'
const DEFAULT_DESCRIPTION = 'Enter a name for the new diagram copy.'
const DEFAULT_CONFIRM_LABEL = 'Create copy'
const DEFAULT_CANCEL_LABEL = 'Cancel'

export interface SaveAsDialogProps {
  open: boolean
  initialName?: string
  isSubmitting?: boolean
  title?: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  error?: string | null
  onSubmit: (name: string) => void | Promise<void>
  onCancel: () => void
}

function normalizeDiagramName(value: string): string {
  return value.trim()
}

export function SaveAsDialog({
  open,
  initialName = '',
  isSubmitting = false,
  title = DEFAULT_TITLE,
  description = DEFAULT_DESCRIPTION,
  confirmLabel = DEFAULT_CONFIRM_LABEL,
  cancelLabel = DEFAULT_CANCEL_LABEL,
  error = null,
  onSubmit,
  onCancel,
}: SaveAsDialogProps) {
  const [name, setName] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const titleId = useId()
  const descriptionId = useId()
  const nameFieldId = useId()

  useEffect(() => {
    if (!open) {
      return
    }

    setName(initialName)
    setValidationError(null)
  }, [open, initialName])

  useEffect(() => {
    if (!open) {
      return
    }

    const animationFrameHandle = window.requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })

    return () => {
      window.cancelAnimationFrame(animationFrameHandle)
    }
  }, [open])

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

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSubmitting) {
      return
    }

    const normalizedName = normalizeDiagramName(name)
    if (normalizedName.length === 0) {
      setValidationError('Enter a diagram name before creating a copy.')
      return
    }

    setValidationError(null)
    void onSubmit(normalizedName)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="w-full max-w-md rounded-lg border border-[var(--color-surface-border)] bg-[var(--color-surface-100)] p-5"
      >
        <h2 id={titleId} className="text-base font-semibold text-white">
          {title}
        </h2>
        <p id={descriptionId} className="mt-1 text-sm text-[#94a3b8]">
          {description}
        </p>

        <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
          <label htmlFor={nameFieldId} className="block text-sm text-[#cbd5e1]">
            Diagram name
          </label>
          <input
            id={nameFieldId}
            ref={inputRef}
            value={name}
            maxLength={120}
            disabled={isSubmitting}
            onChange={(event) => {
              setName(event.target.value)
              if (validationError) {
                setValidationError(null)
              }
            }}
            className="w-full rounded-md border border-[var(--color-surface-border)] bg-[var(--color-surface-200)] px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-brand-500)] focus:ring-2 focus:ring-[var(--color-brand-500)]/30 disabled:cursor-not-allowed disabled:opacity-70"
            placeholder="Diagram copy name"
          />

          {(validationError || error) && (
            <p className="rounded-md border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 px-3 py-2 text-xs text-[var(--color-danger)]">
              {validationError ?? error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onCancel}
              className="rounded-md border border-[var(--color-surface-border)] px-3 py-2 text-sm text-white hover:bg-[var(--color-surface-200)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {cancelLabel}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-md bg-[var(--color-brand-600)] px-3 py-2 text-sm text-white hover:bg-[var(--color-brand-500)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? 'Creating copy...' : confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

