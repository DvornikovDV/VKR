import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ConstructorHost } from '@/features/constructor-host/ConstructorHost'
import {
  importLayoutPayload,
  isLayoutPayloadError,
} from '@/features/constructor-host/adapters/layoutAdapter'
import { useHostedLayoutSaveFlow } from '@/features/constructor-host/useHostedLayoutSaveFlow'
import { SaveAsDialog } from '@/shared/components/SaveAsDialog'
import { SaveConflictModal } from '@/shared/components/SaveConflictModal'
import type { EditorRouteDiagram } from '@/shared/api/diagrams'
import { getDiagramById } from '@/shared/api/diagrams'

type PagePhase = 'loading' | 'ready' | 'error'

export function FullConstructorPage() {
  const { id } = useParams<{ id: string }>()
  const [phase, setPhase] = useState<PagePhase>('loading')
  const [diagram, setDiagram] = useState<EditorRouteDiagram | null>(null)
  const [error, setError] = useState<string | null>(null)

  const saveFlow = useHostedLayoutSaveFlow({
    diagram,
    onDiagramChange: setDiagram,
    routePrefix: '/hub/editor',
  })

  const loadDiagram = useCallback(async () => {
    if (!id) {
      setPhase('error')
      setError('Missing diagram id in route.')
      return
    }

    setPhase('loading')
    setError(null)

    try {
      const loadedDiagram = await getDiagramById(id)
      const normalizedLayout = importLayoutPayload(loadedDiagram.layout)

      setDiagram({
        ...loadedDiagram,
        layout: normalizedLayout,
      })
      setPhase('ready')
    } catch (loadError) {
      setDiagram(null)
      setPhase('error')

      if (isLayoutPayloadError(loadError)) {
        setError(`Invalid diagram layout payload: ${loadError.message}`)
        return
      }

      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Failed to load diagram for full constructor mode.',
      )
    }
  }, [id])

  useEffect(() => {
    void loadDiagram()
  }, [loadDiagram])

  return (
    <section className="mx-auto flex h-full min-h-[calc(100svh-3.5rem)] w-full max-w-[120rem] flex-col px-4 py-4">
      <header className="mb-3">
        <h1 className="text-lg font-semibold text-white">Hosted Constructor</h1>
        <p className="text-sm text-[#94a3b8]">Full mode editor for USER routes.</p>
      </header>

      {phase === 'loading' && (
        <div className="flex min-h-[18rem] flex-1 items-center justify-center rounded-lg border border-dashed border-[var(--color-surface-border)] text-sm text-[#94a3b8]">
          Loading diagram...
        </div>
      )}

      {phase === 'error' && (
        <div className="flex min-h-[18rem] flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 p-6 text-center">
          <p className="text-sm font-medium text-[var(--color-danger)]">
            Unable to open hosted constructor page.
          </p>
          {error && <p className="text-xs text-[var(--color-danger)]/90">{error}</p>}
          <button
            type="button"
            className="rounded-md border border-[var(--color-surface-border)] px-3 py-1.5 text-xs text-white hover:bg-[var(--color-surface-200)]"
            onClick={() => {
              void loadDiagram()
            }}
          >
            Retry loading
          </button>
        </div>
      )}

      {phase === 'ready' && diagram && (
        <div className="flex min-h-[18rem] flex-1 overflow-hidden rounded-lg border border-[var(--color-surface-border)] bg-[var(--color-surface-100)]">
          <ConstructorHost
            className="h-full w-full"
            mode="full"
            initialLayout={diagram.layout}
            onReady={saveFlow.registerRuntime}
            onSaveLayoutIntent={saveFlow.onSaveLayoutIntent}
            onSaveAsIntent={saveFlow.onSaveAsIntent}
          />
        </div>
      )}

      <SaveAsDialog
        open={saveFlow.saveAsDialog.open}
        initialName={saveFlow.saveAsDialog.initialName}
        isSubmitting={saveFlow.saveAsDialog.isSubmitting}
        error={saveFlow.saveAsDialog.error}
        onSubmit={saveFlow.saveAsDialog.onSubmit}
        onCancel={saveFlow.saveAsDialog.onCancel}
      />

      <SaveConflictModal
        open={saveFlow.saveConflictModal.open}
        isReloadingLatest={saveFlow.saveConflictModal.isReloadingLatest}
        isSavingAs={saveFlow.saveConflictModal.isSavingAs}
        error={saveFlow.saveConflictModal.error}
        onReloadLatest={saveFlow.saveConflictModal.onReloadLatest}
        onContinueEditing={saveFlow.saveConflictModal.onContinueEditing}
        onSaveAs={saveFlow.saveConflictModal.onSaveAs}
      />
    </section>
  )
}
