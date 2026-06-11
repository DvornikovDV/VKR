import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createDiagram } from '@/shared/api/diagrams'
import { getErrorDisplayMessage } from '@/shared/api/errorMessages'

export function useAdminDiagramCreation() {
  const navigate = useNavigate()
  const submitInFlightRef = useRef(false)
  const [isOpen, setIsOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function open() {
    setError(null)
    setIsOpen(true)
  }

  function cancel() {
    if (isSubmitting) {
      return
    }

    setError(null)
    setIsOpen(false)
  }

  async function submit(name: string) {
    if (submitInFlightRef.current) {
      return
    }

    const normalizedName = name.trim()
    if (!normalizedName) {
      setError('Введите имя мнемосхемы перед созданием.')
      return
    }

    submitInFlightRef.current = true
    setError(null)
    setIsSubmitting(true)

    try {
      const diagram = await createDiagram({
        name: normalizedName,
        layout: {},
      })
      setIsOpen(false)
      navigate(`/admin/editor/${diagram._id}`)
    } catch (createError) {
      setError(
        getErrorDisplayMessage(
          createError,
          'Не удалось создать мнемосхему. Исправьте ошибку и повторите попытку.',
        ),
      )
    } finally {
      submitInFlightRef.current = false
      setIsSubmitting(false)
    }
  }

  return {
    dialog: {
      open: isOpen,
      isSubmitting,
      error,
      onSubmit: submit,
      onCancel: cancel,
    },
    open,
  }
}
