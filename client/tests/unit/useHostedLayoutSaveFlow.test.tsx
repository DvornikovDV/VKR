import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import type { HostedConstructorInstance, LayoutDocument } from '@/features/constructor-host/types'
import { useHostedLayoutSaveFlow } from '@/features/constructor-host/useHostedLayoutSaveFlow'
import { createApiError } from '@/shared/api/client'
import type { EditorRouteDiagram } from '@/shared/api/diagrams'
import { cloneDiagram, getDiagramById, updateDiagram } from '@/shared/api/diagrams'

vi.mock('@/shared/api/diagrams', () => ({
  cloneDiagram: vi.fn(),
  getDiagramById: vi.fn(),
  updateDiagram: vi.fn(),
}))

const mockedCloneDiagram = vi.mocked(cloneDiagram)
const mockedGetDiagramById = vi.mocked(getDiagramById)
const mockedUpdateDiagram = vi.mocked(updateDiagram)

function RouterWrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter initialEntries={['/hub/editor/diagram-1']}>{children}</MemoryRouter>
}

function createRuntimeMock(layout: LayoutDocument = { widgets: [] }) {
  const runtime: HostedConstructorInstance = {
    loadLayout: vi.fn(async () => undefined),
    getLayout: vi.fn(async () => layout),
    loadBindings: vi.fn(async () => undefined),
    getBindings: vi.fn(async () => []),
    updateCatalog: vi.fn(),
    setActiveMachine: vi.fn(),
    destroy: vi.fn(),
  }

  return runtime
}

const baseDiagram: EditorRouteDiagram = {
  _id: 'diagram-1',
  name: 'Main Diagram',
  layout: { widgets: [] },
  __v: 5,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedCloneDiagram.mockReset()
  mockedGetDiagramById.mockReset()
  mockedUpdateDiagram.mockReset()
})

describe('useHostedLayoutSaveFlow', () => {
  it('exposes runtime-not-ready error when Save As is submitted without registered runtime', async () => {
    const onDiagramChange = vi.fn()
    const { result } = renderHook(
      () =>
        useHostedLayoutSaveFlow({
          diagram: baseDiagram,
          onDiagramChange,
          routePrefix: '/hub/editor',
        }),
      { wrapper: RouterWrapper },
    )

    act(() => {
      result.current.onSaveAsIntent()
    })
    expect(result.current.saveAsDialog.open).toBe(true)

    await act(async () => {
      await result.current.saveAsDialog.onSubmit('Diagram copy')
    })

    expect(result.current.saveAsDialog.error).toBe('Hosted constructor runtime is not ready yet.')

    act(() => {
      result.current.saveAsDialog.onCancel()
    })
    expect(result.current.saveAsDialog.open).toBe(false)
    expect(result.current.saveAsDialog.error).toBeNull()
    expect(onDiagramChange).not.toHaveBeenCalled()
  })

  it('handles save-conflict flow with 409, recovery reload fallback, and continue-editing reset', async () => {
    const runtime = createRuntimeMock()
    const onDiagramChange = vi.fn()

    mockedUpdateDiagram.mockRejectedValueOnce(createApiError(409, 'Version conflict'))
    mockedGetDiagramById.mockRejectedValueOnce('transport-down')

    const { result } = renderHook(
      () =>
        useHostedLayoutSaveFlow({
          diagram: baseDiagram,
          onDiagramChange,
          routePrefix: '/hub/editor',
        }),
      { wrapper: RouterWrapper },
    )

    act(() => {
      result.current.registerRuntime(runtime)
      result.current.onSaveLayoutIntent()
    })

    await waitFor(() => {
      expect(result.current.saveConflictModal.open).toBe(true)
    })

    await act(async () => {
      await result.current.saveConflictModal.onReloadLatest()
    })
    expect(result.current.saveConflictModal.error).toBe('Failed to reload latest diagram version.')

    act(() => {
      result.current.saveConflictModal.onContinueEditing()
    })
    expect(result.current.saveConflictModal.open).toBe(false)
    expect(result.current.saveConflictModal.error).toBeNull()
    expect(onDiagramChange).not.toHaveBeenCalled()
  })

  it('prevents duplicate Save As submits while request is in-flight and keeps dialog open on blocked cancel', async () => {
    let resolveClone!: (value: EditorRouteDiagram) => void
    const clonePromise = new Promise<EditorRouteDiagram>((resolve) => {
      resolveClone = resolve
    })

    const runtime = createRuntimeMock({ widgets: [{ id: 'w-1' }] })
    mockedCloneDiagram.mockReturnValueOnce(clonePromise)

    const { result } = renderHook(
      () =>
        useHostedLayoutSaveFlow({
          diagram: baseDiagram,
          onDiagramChange: vi.fn(),
          routePrefix: '/hub/editor',
        }),
      { wrapper: RouterWrapper },
    )

    act(() => {
      result.current.registerRuntime(runtime)
      result.current.onSaveAsIntent()
    })

    let firstSubmit: Promise<void> | null = null
    await act(async () => {
      firstSubmit = result.current.saveAsDialog.onSubmit('Copy A')
    })

    act(() => {
      result.current.saveAsDialog.onCancel()
    })
    expect(result.current.saveAsDialog.open).toBe(true)

    await act(async () => {
      await result.current.saveAsDialog.onSubmit('Copy B')
    })
    expect(mockedCloneDiagram).toHaveBeenCalledTimes(1)

    if (!firstSubmit) {
      throw new Error('Expected in-flight Save As submit to be created.')
    }
    const submitPromise = firstSubmit

    await act(async () => {
      resolveClone({
        _id: 'diagram-copy-1',
        name: 'Copy A',
        layout: { widgets: [{ id: 'w-1' }] },
        __v: 0,
      })
      await submitPromise
    })

    await waitFor(() => {
      expect(result.current.saveAsDialog.open).toBe(false)
    })
    expect(result.current.saveAsDialog.error).toBeNull()
  })

  it('uses fallback Save As error text for non-Error failures and resets state on diagram change', async () => {
    const runtime = createRuntimeMock()
    const onDiagramChange = vi.fn()

    mockedCloneDiagram.mockRejectedValueOnce('clone-failed')

    const { result, rerender } = renderHook(
      ({ diagram }) =>
        useHostedLayoutSaveFlow({
          diagram,
          onDiagramChange,
          routePrefix: '/hub/editor',
        }),
      {
        wrapper: RouterWrapper,
        initialProps: { diagram: baseDiagram as EditorRouteDiagram | null },
      },
    )

    act(() => {
      result.current.registerRuntime(runtime)
      result.current.onSaveAsIntent()
    })

    await act(async () => {
      await result.current.saveAsDialog.onSubmit('Broken copy')
    })
    expect(result.current.saveAsDialog.error).toBe('Failed to create diagram copy.')
    expect(result.current.saveAsDialog.open).toBe(true)

    await act(async () => {
      await result.current.saveConflictModal.onSaveAs()
    })
    expect(result.current.saveAsDialog.open).toBe(true)

    rerender({
      diagram: {
        ...baseDiagram,
        _id: 'diagram-2',
      },
    })

    await waitFor(() => {
      expect(result.current.saveAsDialog.open).toBe(false)
      expect(result.current.saveAsDialog.error).toBeNull()
      expect(result.current.saveConflictModal.open).toBe(false)
      expect(result.current.saveConflictModal.error).toBeNull()
    })
    expect(onDiagramChange).not.toHaveBeenCalled()
  })
})
