import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { HostedConstructorInstance, LayoutDocument } from '@/features/constructor-host/types'
import { exportLayoutPayload, importLayoutPayload } from '@/features/constructor-host/adapters/layoutAdapter'
import { isApiError } from '@/shared/api/client'
import {
  cloneDiagram,
  getDiagramById,
  updateDiagram,
  type EditorRouteDiagram,
} from '@/shared/api/diagrams'

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }

  return fallback
}

export interface UseHostedLayoutSaveFlowOptions {
  diagram: EditorRouteDiagram | null
  onDiagramChange: (diagram: EditorRouteDiagram) => void
  routePrefix: string
}

export interface HostedLayoutSaveFlow {
  registerRuntime: (instance: HostedConstructorInstance) => void
  saveLayoutNow: () => Promise<boolean>
  onSaveLayoutIntent: () => void
  onSaveAsIntent: () => void
  saveAsDialog: {
    open: boolean
    initialName: string
    isSubmitting: boolean
    error: string | null
    onSubmit: (name: string) => Promise<void>
    onCancel: () => void
  }
  saveConflictModal: {
    open: boolean
    isReloadingLatest: boolean
    isSavingAs: boolean
    error: string | null
    onReloadLatest: () => Promise<void>
    onContinueEditing: () => void
    onSaveAs: () => Promise<void>
  }
}

export function useHostedLayoutSaveFlow({
  diagram,
  onDiagramChange,
  routePrefix,
}: UseHostedLayoutSaveFlowOptions): HostedLayoutSaveFlow {
  const navigate = useNavigate()
  const runtimeRef = useRef<HostedConstructorInstance | null>(null)

  const [isSavingLayout, setIsSavingLayout] = useState(false)
  const [isSaveAsOpen, setIsSaveAsOpen] = useState(false)
  const [isSavingAs, setIsSavingAs] = useState(false)
  const [saveAsError, setSaveAsError] = useState<string | null>(null)

  const [isSaveConflictOpen, setIsSaveConflictOpen] = useState(false)
  const [isReloadingLatest, setIsReloadingLatest] = useState(false)
  const [saveConflictError, setSaveConflictError] = useState<string | null>(null)

  useEffect(() => {
    setIsSavingLayout(false)
    setIsSaveAsOpen(false)
    setIsSavingAs(false)
    setSaveAsError(null)
    setIsSaveConflictOpen(false)
    setIsReloadingLatest(false)
    setSaveConflictError(null)
  }, [diagram?._id])

  const initialSaveAsName = useMemo(() => {
    const sourceName = diagram?.name?.trim() ?? ''
    if (!sourceName) {
      return ''
    }

    return `${sourceName} Copy`
  }, [diagram?.name])

  const registerRuntime = useCallback((instance: HostedConstructorInstance) => {
    runtimeRef.current = instance
  }, [])

  const getRuntimeLayoutSnapshot = useCallback(async (): Promise<LayoutDocument> => {
    const runtime = runtimeRef.current
    if (!runtime) {
      throw new Error('Hosted constructor runtime is not ready yet.')
    }

    const runtimeLayout = await runtime.getLayout()
    return exportLayoutPayload(runtimeLayout)
  }, [])

  const reloadLatestLayout = useCallback(async () => {
    if (!diagram) {
      return
    }

    const runtime = runtimeRef.current
    if (!runtime) {
      return
    }

    setIsReloadingLatest(true)
    setSaveConflictError(null)

    try {
      const latestDiagram = await getDiagramById(diagram._id)
      const latestLayout = importLayoutPayload(latestDiagram.layout)

      await runtime.loadLayout(latestLayout)
      onDiagramChange({
        ...latestDiagram,
        layout: latestLayout,
      })
      setIsSaveConflictOpen(false)
    } catch (error) {
      setSaveConflictError(toErrorMessage(error, 'Failed to reload latest diagram version.'))
    } finally {
      setIsReloadingLatest(false)
    }
  }, [diagram, onDiagramChange])

  const saveLayoutNow = useCallback(async (): Promise<boolean> => {
    if (!diagram || isSavingLayout) {
      return false
    }

    setIsSavingLayout(true)
    setSaveConflictError(null)

    try {
      const serializedLayout = await getRuntimeLayoutSnapshot()
      await updateDiagram(diagram._id, {
        layout: serializedLayout,
        __v: diagram.__v,
      })

      await reloadLatestLayout()
      return true
    } catch (error) {
      if (isApiError(error) && error.status === 409) {
        setIsSaveConflictOpen(true)
        return false
      }

      setSaveConflictError(toErrorMessage(error, 'Failed to save diagram layout.'))
      return false
    } finally {
      setIsSavingLayout(false)
    }
  }, [diagram, getRuntimeLayoutSnapshot, isSavingLayout, reloadLatestLayout])

  const onSaveLayoutIntent = useCallback(() => {
    void saveLayoutNow()
  }, [saveLayoutNow])

  const openSaveAsDialog = useCallback(() => {
    setSaveAsError(null)
    setIsSaveAsOpen(true)
  }, [])

  const onSaveAsIntent = useCallback(() => {
    openSaveAsDialog()
  }, [openSaveAsDialog])

  const submitSaveAs = useCallback(
    async (name: string) => {
      if (isSavingAs) {
        return
      }

      setIsSavingAs(true)
      setSaveAsError(null)

      try {
        const serializedLayout = await getRuntimeLayoutSnapshot()
        const createdDiagram = await cloneDiagram({
          name,
          layout: serializedLayout,
        })

        setIsSaveAsOpen(false)
        setIsSaveConflictOpen(false)
        await navigate(`${routePrefix}/${createdDiagram._id}`)
      } catch (error) {
        setSaveAsError(toErrorMessage(error, 'Failed to create diagram copy.'))
      } finally {
        setIsSavingAs(false)
      }
    },
    [getRuntimeLayoutSnapshot, isSavingAs, navigate, routePrefix],
  )

  const continueEditing = useCallback(() => {
    setSaveConflictError(null)
    setIsSaveConflictOpen(false)
  }, [])

  const conflictSaveAs = useCallback(async () => {
    openSaveAsDialog()
  }, [openSaveAsDialog])

  return {
    registerRuntime,
    saveLayoutNow,
    onSaveLayoutIntent,
    onSaveAsIntent,
    saveAsDialog: {
      open: isSaveAsOpen,
      initialName: initialSaveAsName,
      isSubmitting: isSavingAs,
      error: saveAsError,
      onSubmit: submitSaveAs,
      onCancel: () => {
        if (isSavingAs) {
          return
        }

        setSaveAsError(null)
        setIsSaveAsOpen(false)
      },
    },
    saveConflictModal: {
      open: isSaveConflictOpen,
      isReloadingLatest,
      isSavingAs,
      error: saveConflictError,
      onReloadLatest: reloadLatestLayout,
      onContinueEditing: continueEditing,
      onSaveAs: conflictSaveAs,
    },
  }
}
