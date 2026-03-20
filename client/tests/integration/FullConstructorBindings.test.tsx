import { useEffect, useState } from 'react'
import { act } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '../mocks/server'
import { useAuthStore, type Session } from '@/shared/store/useAuthStore'
import { ConstructorHost } from '@/features/constructor-host/ConstructorHost'
import type { HostedConstructorInstance, LayoutDocument, WidgetBindingRecord } from '@/features/constructor-host/types'
import { loadHostedConstructor } from '@/features/constructor-host/loadHostedConstructor'
import {
  exportWidgetBindingsPayload,
  findBindingSetForEdgeServer,
  importBindingSetsPayload,
  type DiagramBindingSetRecord,
} from '@/features/constructor-host/adapters/bindingsAdapter'
import { getBindingsByDiagram, createBinding } from '@/shared/api/bindings'
import { apiClient } from '@/shared/api/client'
import { cloneDiagram, updateDiagram } from '@/shared/api/diagrams'
import { createMockHostedConstructorHarness } from './helpers/mockHostedConstructor'

vi.mock('@/features/constructor-host/loadHostedConstructor', async () => {
  const actual = await vi.importActual<typeof import('@/features/constructor-host/loadHostedConstructor')>(
    '@/features/constructor-host/loadHostedConstructor',
  )

  return {
    ...actual,
    loadHostedConstructor: vi.fn(),
  }
})

const mockedLoadHostedConstructor = vi.mocked(loadHostedConstructor)

const userSession: Session = {
  id: 'user-1',
  email: 'user@example.com',
  role: 'USER',
  tier: 'FREE',
  accessToken: 'user-token',
}

const MACHINES = [
  { edgeServerId: 'edge-1', label: 'Machine #1' },
  { edgeServerId: 'edge-2', label: 'Machine #2' },
]

const BASE_LAYOUT: LayoutDocument = {
  widgets: [],
}

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }

  return fallback
}

function FullBindingsFlowHarness({ diagramId }: { diagramId: string }) {
  const [runtime, setRuntime] = useState<HostedConstructorInstance | null>(null)
  const [bindingSets, setBindingSets] = useState<DiagramBindingSetRecord[]>([])
  const [activeEdgeServerId, setActiveEdgeServerId] = useState<string | null>(MACHINES[0].edgeServerId)
  const [isPromptOpen, setIsPromptOpen] = useState(false)
  const [lastAction, setLastAction] = useState('none')
  const [diagramVersion, setDiagramVersion] = useState(3)
  const [isLoading, setIsLoading] = useState(true)
  const [flowError, setFlowError] = useState<string | null>(null)

  useEffect(() => {
    let isActive = true

    void (async () => {
      try {
        const loadedProfiles = await getBindingsByDiagram(diagramId)
        const normalized = importBindingSetsPayload(loadedProfiles)
        if (!isActive) {
          return
        }

        setBindingSets(normalized)
        setFlowError(null)
      } catch (error) {
        if (!isActive) {
          return
        }

        setBindingSets([])
        setLastAction('bindings-load-error')
        setFlowError(toErrorMessage(error, 'Failed to load persisted bindings.'))
      } finally {
        if (isActive) {
          setIsLoading(false)
        }
      }
    })()

    return () => {
      isActive = false
    }
  }, [diagramId])

  useEffect(() => {
    if (!runtime || !activeEdgeServerId) {
      return
    }

    const activeBindingSet = findBindingSetForEdgeServer(bindingSets, activeEdgeServerId)

    runtime.setActiveMachine(activeEdgeServerId)
    void runtime.loadBindings(activeBindingSet?.widgetBindings ?? []).catch((error) => {
      setLastAction('machine-switch-error')
      setFlowError(toErrorMessage(error, 'Failed to apply bindings for active machine.'))
    })
  }, [runtime, bindingSets, activeEdgeServerId])

  async function persistLayout(destructive: boolean) {
    if (!runtime) {
      return
    }

    try {
      const layoutSnapshot = await runtime.getLayout()
      await updateDiagram(diagramId, {
        layout: layoutSnapshot,
        __v: diagramVersion,
      })

      setDiagramVersion((version) => version + 1)
      setFlowError(null)

      if (destructive) {
        await apiClient.delete<void>(`/diagrams/${diagramId}/bindings`)
        setBindingSets([])
        setLastAction('destructive-save')
        return
      }

      setLastAction('layout-saved')
    } catch (error) {
      setLastAction(destructive ? 'destructive-save-error' : 'layout-save-error')
      setFlowError(toErrorMessage(error, 'Failed to persist layout snapshot.'))
    }
  }

  function handleSaveLayoutIntent() {
    const hasPersistedBindings = bindingSets.some((bindingSet) => bindingSet.widgetBindings.length > 0)
    if (hasPersistedBindings) {
      setIsPromptOpen(true)
      return
    }

    void persistLayout(false)
  }

  function handleSaveBindingsIntent() {
    if (!runtime || !activeEdgeServerId) {
      return
    }

    void (async () => {
      try {
        const runtimeBindings = await runtime.getBindings()
        const serializedBindings = exportWidgetBindingsPayload(runtimeBindings)
        const savedBindingSet = await createBinding(diagramId, {
          edgeServerId: activeEdgeServerId,
          widgetBindings: serializedBindings,
        })

        const [normalizedSavedSet] = importBindingSetsPayload([savedBindingSet])
        if (!normalizedSavedSet) {
          throw new Error('Saved binding set payload is empty.')
        }

        setBindingSets((previous) => [
          ...previous.filter((entry) => entry.edgeServerId !== normalizedSavedSet.edgeServerId),
          normalizedSavedSet,
        ])
        setFlowError(null)
        setLastAction('bindings-saved')
      } catch (error) {
        setLastAction('bindings-save-error')
        setFlowError(toErrorMessage(error, 'Failed to save bindings.'))
      }
    })()
  }

  function handleSaveAsCopy() {
    if (!runtime) {
      return
    }

    void (async () => {
      try {
        const layoutSnapshot = await runtime.getLayout()
        await cloneDiagram({
          name: 'Full-mode copy',
          layout: layoutSnapshot,
        })

        setIsPromptOpen(false)
        setFlowError(null)
        setLastAction('save-as')
      } catch (error) {
        setLastAction('save-as-error')
        setFlowError(toErrorMessage(error, 'Failed to create Save As copy.'))
      }
    })()
  }

  if (isLoading) {
    return <p>Loading bindings flow...</p>
  }

  return (
    <section>
      <ConstructorHost
        mode="full"
        initialLayout={BASE_LAYOUT}
        machines={MACHINES}
        activeEdgeServerId={activeEdgeServerId}
        onReady={setRuntime}
        onMachineChange={setActiveEdgeServerId}
        onSaveBindingsIntent={handleSaveBindingsIntent}
        onSaveLayoutIntent={handleSaveLayoutIntent}
      />

      {isPromptOpen && (
        <div role="dialog" aria-label="Bindings invalidated prompt">
          <p>Layout save will delete existing bindings.</p>
          <button type="button" onClick={handleSaveAsCopy}>
            Save As copy
          </button>
          <button
            type="button"
            onClick={() => {
              setIsPromptOpen(false)
              void persistLayout(true)
            }}
          >
            Continue destructive save
          </button>
        </div>
      )}

      <p data-testid="active-machine">{activeEdgeServerId ?? 'none'}</p>
      <p data-testid="binding-set-count">{bindingSets.length}</p>
      <p data-testid="last-action">{lastAction}</p>
      {flowError && <p data-testid="flow-error">{flowError}</p>}
    </section>
  )
}

beforeEach(() => {
  mockedLoadHostedConstructor.mockReset()
  act(() => {
    useAuthStore.setState({ session: null, isAuthenticated: false })
    useAuthStore.getState().setSession(userSession)
  })
})

describe('Full-mode bindings integration coverage (T022)', () => {
  it('loads machine-scoped bindings and switches active machine context', async () => {
    const harness = createMockHostedConstructorHarness()
    mockedLoadHostedConstructor.mockResolvedValue(harness.module)

    server.use(
      http.get('/api/diagrams/:id/bindings', () =>
        HttpResponse.json({
          status: 'success',
          data: [
            {
              _id: 'set-edge-1',
              diagramId: 'diagram-42',
              edgeServerId: 'edge-1',
              widgetBindings: [{ widgetId: 'widget-1', deviceId: 'device-1', metric: 'temperature' }],
            },
            {
              _id: 'set-edge-2',
              diagramId: 'diagram-42',
              edgeServerId: 'edge-2',
              widgetBindings: [{ widgetId: 'widget-2', deviceId: 'device-2', metric: 'pressure' }],
            },
          ],
        }),
      ),
    )

    render(<FullBindingsFlowHarness diagramId="diagram-42" />)

    await waitFor(() => {
      expect(harness.createHostedConstructorMock).toHaveBeenCalledTimes(1)
    })

    await waitFor(() => {
      expect(harness.instanceSpies.setActiveMachineMock).toHaveBeenLastCalledWith('edge-1')
      expect(harness.instanceSpies.loadBindingsMock).toHaveBeenLastCalledWith([
        { widgetId: 'widget-1', deviceId: 'device-1', metric: 'temperature' },
      ])
    })

    act(() => {
      harness.emitMachineChange('edge-2')
    })

    await waitFor(() => {
      expect(harness.instanceSpies.setActiveMachineMock).toHaveBeenLastCalledWith('edge-2')
      expect(harness.instanceSpies.loadBindingsMock).toHaveBeenLastCalledWith([
        { widgetId: 'widget-2', deviceId: 'device-2', metric: 'pressure' },
      ])
      expect(screen.getByTestId('active-machine')).toHaveTextContent('edge-2')
    })
  })

  it('round-trips runtime bindings through upsert payload as widgetId+deviceId+metric', async () => {
    const harness = createMockHostedConstructorHarness({
      initialBindings: [{ widgetId: 'widget-10', deviceId: 'device-10', metric: 'flow' }],
    })
    mockedLoadHostedConstructor.mockResolvedValue(harness.module)

    const postedPayloadRef: {
      current: {
        edgeServerId: string
        widgetBindings: WidgetBindingRecord[]
      } | null
    } = {
      current: null,
    }

    server.use(
      http.get('/api/diagrams/:id/bindings', () =>
        HttpResponse.json({
          status: 'success',
          data: [
            {
              _id: 'set-edge-1',
              diagramId: 'diagram-55',
              edgeServerId: 'edge-1',
              widgetBindings: [{ widgetId: 'widget-10', deviceId: 'device-10', metric: 'flow' }],
            },
          ],
        }),
      ),
      http.post('/api/diagrams/:id/bindings', async ({ request, params }) => {
        const payload = (await request.json()) as {
          edgeServerId: string
          widgetBindings: WidgetBindingRecord[]
        }
        postedPayloadRef.current = payload

        return HttpResponse.json({
          status: 'success',
          data: {
            _id: 'saved-set-1',
            diagramId: String(params.id),
            edgeServerId: payload.edgeServerId,
            widgetBindings: payload.widgetBindings,
          },
        })
      }),
    )

    render(<FullBindingsFlowHarness diagramId="diagram-55" />)

    await waitFor(() => {
      expect(harness.createHostedConstructorMock).toHaveBeenCalledTimes(1)
    })

    act(() => {
      harness.emitSaveBindingsIntent()
    })

    await waitFor(() => {
      expect(postedPayloadRef.current).not.toBeNull()
    })
    const postedPayload = postedPayloadRef.current
    if (!postedPayload) {
      throw new Error('Expected bindings POST payload to be captured.')
    }

    expect(postedPayload.edgeServerId).toBe('edge-1')
    expect(postedPayload.widgetBindings).toEqual([
      { widgetId: 'widget-10', deviceId: 'device-10', metric: 'flow' },
    ])
    expect(screen.getByTestId('binding-set-count')).toHaveTextContent('1')
    expect(screen.getByTestId('last-action')).toHaveTextContent('bindings-saved')
  })

  it('enforces destructive-save decision path: Save As copy or delete-all after successful PUT', async () => {
    const user = userEvent.setup()
    const harness = createMockHostedConstructorHarness({
      initialLayout: {
        widgets: [{ id: 'widget-1', label: 'draft' }],
      },
    })
    mockedLoadHostedConstructor.mockResolvedValue(harness.module)

    const callOrder: string[] = []

    server.use(
      http.get('/api/diagrams/:id/bindings', () =>
        HttpResponse.json({
          status: 'success',
          data: [
            {
              _id: 'set-edge-1',
              diagramId: 'diagram-77',
              edgeServerId: 'edge-1',
              widgetBindings: [{ widgetId: 'widget-1', deviceId: 'device-1', metric: 'temperature' }],
            },
          ],
        }),
      ),
      http.post('/api/diagrams', () => {
        callOrder.push('save-as')
        return HttpResponse.json({
          status: 'success',
          data: {
            _id: 'diagram-copy-77',
            name: 'Full-mode copy',
            layout: { widgets: [] },
            __v: 0,
          },
        })
      }),
      http.put('/api/diagrams/:id', () => {
        callOrder.push('put')
        return HttpResponse.json({
          bindingsInvalidated: true,
        })
      }),
      http.delete('/api/diagrams/:id/bindings', () => {
        callOrder.push('delete-all')
        return new HttpResponse(null, { status: 204 })
      }),
    )

    render(<FullBindingsFlowHarness diagramId="diagram-77" />)

    await waitFor(() => {
      expect(harness.createHostedConstructorMock).toHaveBeenCalledTimes(1)
    })

    act(() => {
      harness.emitSaveLayoutIntent()
    })

    expect(await screen.findByText('Layout save will delete existing bindings.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Save As copy' }))

    await waitFor(() => {
      expect(screen.getByTestId('last-action')).toHaveTextContent('save-as')
    })
    expect(callOrder).toEqual(['save-as'])

    act(() => {
      harness.emitSaveLayoutIntent()
    })

    expect(await screen.findByText('Layout save will delete existing bindings.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Continue destructive save' }))

    await waitFor(() => {
      expect(screen.getByTestId('last-action')).toHaveTextContent('destructive-save')
      expect(screen.getByTestId('binding-set-count')).toHaveTextContent('0')
    })

    expect(callOrder).toEqual(['save-as', 'put', 'delete-all'])
  })
})
