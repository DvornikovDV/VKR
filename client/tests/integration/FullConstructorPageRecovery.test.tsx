import { act } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '../mocks/server'
import { FullConstructorPage } from '@/features/user-hub/pages/FullConstructorPage'
import { loadHostedConstructor } from '@/features/constructor-host/loadHostedConstructor'
import { createMockHostedConstructorHarness } from './helpers/mockHostedConstructor'
import { useAuthStore, type Session } from '@/shared/store/useAuthStore'

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

function renderFullPage(path: string) {
  const router = createMemoryRouter(
    [
      {
        path: '/hub/editor/:id',
        element: <FullConstructorPage />,
      },
      {
        path: '/elsewhere',
        element: <div>Elsewhere route</div>,
      },
    ],
    { initialEntries: [path] },
  )

  render(<RouterProvider router={router} />)
  return router
}

beforeEach(() => {
  mockedLoadHostedConstructor.mockReset()
  act(() => {
    useAuthStore.setState({ session: null, isAuthenticated: false })
    useAuthStore.getState().setSession(userSession)
  })
})

describe('FullConstructorPage recovery and retry flows', () => {
  it('allows opening page with empty bindings after invalid bindings payload recovery error', async () => {
    const user = userEvent.setup()
    const harness = createMockHostedConstructorHarness()
    mockedLoadHostedConstructor.mockResolvedValue(harness.module)

    server.use(
      http.get('/api/diagrams/:id', ({ params }) =>
        HttpResponse.json({
          status: 'success',
          data: {
            _id: String(params.id),
            name: 'Invalid bindings diagram',
            layout: { widgets: [] },
            __v: 1,
          },
        }),
      ),
      http.get('/api/edge-servers', () =>
        HttpResponse.json({
          status: 'success',
          data: [
            {
              _id: 'edge-1',
              name: 'Machine #1',
              lifecycleState: 'Active',
              availability: { online: true, lastSeenAt: null },
            },
          ],
        }),
      ),
      http.get('/api/edge-servers/:edgeId/catalog', () =>
        HttpResponse.json({
          status: 'success',
          data: [],
        }),
      ),
      http.get('/api/diagrams/:id/bindings', () =>
        HttpResponse.json({
          status: 'success',
          data: [
            {
              _id: 'broken-set',
              diagramId: 'diagram-invalid-bindings',
              edgeServerId: 'edge-1',
              widgetBindings: [{ widgetId: '', deviceId: 'device-1', metric: 'temperature' }],
            },
          ],
        }),
      ),
    )

    renderFullPage('/hub/editor/diagram-invalid-bindings')

    expect(await screen.findByText('Не удалось открыть страницу конструктора.')).toBeInTheDocument()
    expect(screen.getByText(/Некорректный payload привязок/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Открыть с пустыми привязками' })).toBeInTheDocument()
    expect(harness.createHostedConstructorMock).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Открыть с пустыми привязками' }))

    await waitFor(() => {
      expect(harness.createHostedConstructorMock).toHaveBeenCalledTimes(1)
    })
    expect(screen.queryByText('Не удалось открыть страницу конструктора.')).not.toBeInTheDocument()
  })

  it('retries diagram loading successfully after transient API failure', async () => {
    const user = userEvent.setup()
    const harness = createMockHostedConstructorHarness()
    mockedLoadHostedConstructor.mockResolvedValue(harness.module)

    let diagramRequestCount = 0

    server.use(
      http.get('/api/diagrams/:id', ({ params }) => {
        diagramRequestCount += 1
        if (diagramRequestCount === 1) {
          return HttpResponse.json(
            {
              status: 'error',
              message: 'Temporary upstream failure',
            },
            { status: 503 },
          )
        }

        return HttpResponse.json({
          status: 'success',
          data: {
            _id: String(params.id),
            name: 'Retry diagram',
            layout: { widgets: [] },
            __v: 2,
          },
        })
      }),
      http.get('/api/edge-servers', () =>
        HttpResponse.json({
          status: 'success',
          data: [
            {
              _id: 'edge-1',
              name: 'Machine #1',
              lifecycleState: 'Active',
              availability: { online: true, lastSeenAt: null },
            },
          ],
        }),
      ),
      http.get('/api/edge-servers/:edgeId/catalog', () =>
        HttpResponse.json({
          status: 'success',
          data: [],
        }),
      ),
      http.get('/api/diagrams/:id/bindings', () =>
        HttpResponse.json({
          status: 'success',
          data: [],
        }),
      ),
    )

    renderFullPage('/hub/editor/diagram-retry')

    expect(await screen.findByText('Не удалось открыть страницу конструктора.')).toBeInTheDocument()
    expect(screen.getByText('Ошибка сервера. Попробуйте позже.')).toBeInTheDocument()
    expect(harness.createHostedConstructorMock).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Повторить загрузку' }))

    await waitFor(() => {
      expect(diagramRequestCount).toBeGreaterThanOrEqual(2)
      expect(harness.createHostedConstructorMock).toHaveBeenCalledTimes(1)
    })
    expect(screen.queryByText('Не удалось открыть страницу конструктора.')).not.toBeInTheDocument()
  })

  it('saves non-destructive dirty layout and binding profile together without losing command bindings', async () => {
    const harness = createMockHostedConstructorHarness({ clearBindingsOnLayoutLoad: true })
    mockedLoadHostedConstructor.mockResolvedValue(harness.module)

    const callOrder: string[] = []
    let diagramVersion = 4
    let postedBindingPayload:
      | {
          edgeServerId: string
          widgetBindings: Array<{ widgetId: string; deviceId: string; metric: string }>
          commandBindings?: Array<{ widgetId: string; deviceId: string; commandType: 'set_bool' | 'set_number' }>
        }
      | null = null

    server.use(
      http.get('/api/diagrams/:id', ({ params }) =>
        HttpResponse.json({
          status: 'success',
          data: {
            _id: String(params.id),
            name: 'Chained save diagram',
            layout: { widgets: [{ id: 'widget-1' }, { id: 'toggle-1' }] },
            __v: diagramVersion,
          },
        }),
      ),
      http.get('/api/edge-servers', () =>
        HttpResponse.json({
          status: 'success',
          data: [
            {
              _id: 'edge-1',
              name: 'Machine #1',
              lifecycleState: 'Active',
              availability: { online: true, lastSeenAt: null },
            },
          ],
        }),
      ),
      http.get('/api/edge-servers/:edgeId/catalog', () =>
        HttpResponse.json({
          status: 'success',
          data: [],
        }),
      ),
      http.get('/api/diagrams/:id/bindings', () =>
        HttpResponse.json({
          status: 'success',
          data: [
            {
              _id: 'persisted-set',
              diagramId: 'diagram-chain-save',
              edgeServerId: 'edge-1',
              widgetBindings: [{ widgetId: 'widget-1', deviceId: 'device-1', metric: 'temperature' }],
              commandBindings: [{ widgetId: 'toggle-1', deviceId: 'pump_main', commandType: 'set_bool' }],
            },
          ],
        }),
      ),
      http.put('/api/diagrams/:id', async ({ request }) => {
        const payload = (await request.json()) as { __v: number; layout: unknown }
        expect(payload.__v).toBe(diagramVersion)
        callOrder.push('put')
        diagramVersion += 1

        return HttpResponse.json({
          status: 'success',
          data: {
            _id: 'diagram-chain-save',
            name: 'Chained save diagram',
            layout: payload.layout,
            __v: diagramVersion,
          },
        })
      }),
      http.post('/api/diagrams/:id/bindings', async ({ request, params }) => {
        const payload = (await request.json()) as {
          edgeServerId: string
          widgetBindings: Array<{ widgetId: string; deviceId: string; metric: string }>
          commandBindings?: Array<{ widgetId: string; deviceId: string; commandType: 'set_bool' | 'set_number' }>
        }
        postedBindingPayload = payload
        callOrder.push('post-bindings')

        return HttpResponse.json({
          status: 'success',
          data: {
            _id: 'saved-bindings-1',
            diagramId: String(params.id),
            edgeServerId: payload.edgeServerId,
            widgetBindings: payload.widgetBindings,
            commandBindings: payload.commandBindings ?? [],
          },
        })
      }),
    )

    renderFullPage('/hub/editor/diagram-chain-save?edgeId=edge-1')

    await waitFor(() => {
      expect(harness.createHostedConstructorMock).toHaveBeenCalledTimes(1)
    })

    await act(async () => {
      await harness.instance.loadLayout({
        widgets: [
          { id: 'widget-1', x: 40, y: 80 },
          { id: 'toggle-1', x: 120, y: 80 },
          { id: 'new-unbound', x: 180, y: 80 },
        ],
      })
      await harness.instance.loadBindingProfile({
        widgetBindings: [{ widgetId: 'widget-1', deviceId: 'device-1', metric: 'temperature' }],
        commandBindings: [{ widgetId: 'toggle-1', deviceId: 'pump_main', commandType: 'set_bool' }],
      })
    })

    act(() => {
      harness.emitDirtyStateChange({ layoutDirty: true, bindingsDirty: true })
    })

    await waitFor(() => {
      expect(harness.getLastConfig()?.activeEdgeServerId).toBe('edge-1')
    })

    act(() => {
      harness.emitSaveBindingsIntent()
    })

    await waitFor(() => {
      expect(callOrder).toEqual(['put', 'post-bindings'])
    })
    expect(harness.createHostedConstructorMock).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Сначала сохранить разметку?')).not.toBeInTheDocument()
    expect(screen.queryByText('Сохранение layout удалит существующие привязки.')).not.toBeInTheDocument()
    expect(postedBindingPayload).toEqual({
      edgeServerId: 'edge-1',
      widgetBindings: [{ widgetId: 'widget-1', deviceId: 'device-1', metric: 'temperature' }],
      commandBindings: [{ widgetId: 'toggle-1', deviceId: 'pump_main', commandType: 'set_bool' }],
    })
    expect(harness.instanceSpies.loadBindingProfileMock).toHaveBeenLastCalledWith({
      widgetBindings: [{ widgetId: 'widget-1', deviceId: 'device-1', metric: 'temperature' }],
      commandBindings: [{ widgetId: 'toggle-1', deviceId: 'pump_main', commandType: 'set_bool' }],
    })
  })

  it('keeps restored command bindings dirty when chained binding save fails after layout save', async () => {
    const harness = createMockHostedConstructorHarness({ clearBindingsOnLayoutLoad: true })
    mockedLoadHostedConstructor.mockResolvedValue(harness.module)

    const callOrder: string[] = []
    let diagramVersion = 5

    server.use(
      http.get('/api/diagrams/:id', ({ params }) =>
        HttpResponse.json({
          status: 'success',
          data: {
            _id: String(params.id),
            name: 'Partial chained save diagram',
            layout: { widgets: [{ id: 'widget-1' }, { id: 'toggle-1' }] },
            __v: diagramVersion,
          },
        }),
      ),
      http.get('/api/edge-servers', () =>
        HttpResponse.json({
          status: 'success',
          data: [
            {
              _id: 'edge-1',
              name: 'Machine #1',
              lifecycleState: 'Active',
              availability: { online: true, lastSeenAt: null },
            },
          ],
        }),
      ),
      http.get('/api/edge-servers/:edgeId/catalog', () =>
        HttpResponse.json({
          status: 'success',
          data: [],
        }),
      ),
      http.get('/api/diagrams/:id/bindings', () =>
        HttpResponse.json({
          status: 'success',
          data: [
            {
              _id: 'persisted-set',
              diagramId: 'diagram-partial-save',
              edgeServerId: 'edge-1',
              widgetBindings: [{ widgetId: 'widget-1', deviceId: 'device-1', metric: 'temperature' }],
              commandBindings: [{ widgetId: 'toggle-1', deviceId: 'pump_main', commandType: 'set_bool' }],
            },
          ],
        }),
      ),
      http.put('/api/diagrams/:id', async ({ request }) => {
        const payload = (await request.json()) as { __v: number; layout: unknown }
        expect(payload.__v).toBe(diagramVersion)
        callOrder.push('put')
        diagramVersion += 1

        return HttpResponse.json({
          status: 'success',
          data: {
            _id: 'diagram-partial-save',
            name: 'Partial chained save diagram',
            layout: payload.layout,
            __v: diagramVersion,
          },
        })
      }),
      http.post('/api/diagrams/:id/bindings', () => {
        callOrder.push('post-bindings')
        return HttpResponse.json(
          { status: 'error', message: 'Binding save failed' },
          { status: 500 },
        )
      }),
    )

    const router = renderFullPage('/hub/editor/diagram-partial-save?edgeId=edge-1')

    await waitFor(() => {
      expect(harness.createHostedConstructorMock).toHaveBeenCalledTimes(1)
    })

    await act(async () => {
      await harness.instance.loadLayout({
        widgets: [
          { id: 'widget-1', x: 40, y: 80 },
          { id: 'toggle-1', x: 120, y: 80 },
        ],
      })
      await harness.instance.loadBindingProfile({
        widgetBindings: [{ widgetId: 'widget-1', deviceId: 'device-1', metric: 'temperature' }],
        commandBindings: [{ widgetId: 'toggle-1', deviceId: 'pump_main', commandType: 'set_bool' }],
      })
    })

    act(() => {
      harness.emitDirtyStateChange({ layoutDirty: true, bindingsDirty: true })
    })

    await waitFor(() => {
      expect(harness.getLastConfig()?.activeEdgeServerId).toBe('edge-1')
    })

    act(() => {
      harness.emitSaveBindingsIntent()
    })

    await waitFor(() => {
      expect(callOrder).toEqual(['put', 'post-bindings'])
    })
    expect(harness.createHostedConstructorMock).toHaveBeenCalledTimes(1)
    expect(harness.getState().commandBindings).toEqual([
      { widgetId: 'toggle-1', deviceId: 'pump_main', commandType: 'set_bool' },
    ])
    expect(screen.getByText(/Ошибка сервера/i)).toBeInTheDocument()

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    await act(async () => {
      await router.navigate('/elsewhere')
    })

    await waitFor(() => {
      expect(confirmSpy).toHaveBeenCalledWith(expect.any(String))
    })
    expect(screen.queryByText('Elsewhere route')).not.toBeInTheDocument()
    confirmSpy.mockRestore()
  })

  it('saves non-destructive layout intent without opening destructive bindings cleanup', async () => {
    const harness = createMockHostedConstructorHarness({ clearBindingsOnLayoutLoad: true })
    mockedLoadHostedConstructor.mockResolvedValue(harness.module)

    const callOrder: string[] = []
    let diagramVersion = 11

    server.use(
      http.get('/api/diagrams/:id', ({ params }) =>
        HttpResponse.json({
          status: 'success',
          data: {
            _id: String(params.id),
            name: 'Non-destructive layout save diagram',
            layout: { widgets: [{ id: 'widget-1' }, { id: 'toggle-1' }] },
            __v: diagramVersion,
          },
        }),
      ),
      http.get('/api/edge-servers', () =>
        HttpResponse.json({
          status: 'success',
          data: [
            {
              _id: 'edge-1',
              name: 'Machine #1',
              lifecycleState: 'Active',
              availability: { online: true, lastSeenAt: null },
            },
          ],
        }),
      ),
      http.get('/api/edge-servers/:edgeId/catalog', () =>
        HttpResponse.json({
          status: 'success',
          data: [],
        }),
      ),
      http.get('/api/diagrams/:id/bindings', () =>
        HttpResponse.json({
          status: 'success',
          data: [
            {
              _id: 'persisted-set',
              diagramId: 'diagram-layout-save',
              edgeServerId: 'edge-1',
              widgetBindings: [{ widgetId: 'widget-1', deviceId: 'device-1', metric: 'temperature' }],
              commandBindings: [{ widgetId: 'toggle-1', deviceId: 'pump_main', commandType: 'set_bool' }],
            },
          ],
        }),
      ),
      http.put('/api/diagrams/:id', async ({ request }) => {
        const payload = (await request.json()) as { __v: number; layout: unknown }
        expect(payload.__v).toBe(diagramVersion)
        callOrder.push('put')
        diagramVersion += 1

        return HttpResponse.json({
          status: 'success',
          data: {
            _id: 'diagram-layout-save',
            name: 'Non-destructive layout save diagram',
            layout: payload.layout,
            __v: diagramVersion,
          },
        })
      }),
      http.delete('/api/diagrams/:id/bindings', () => {
        callOrder.push('delete-all')
        return new HttpResponse(null, { status: 204 })
      }),
    )

    renderFullPage('/hub/editor/diagram-layout-save?edgeId=edge-1')

    await waitFor(() => {
      expect(harness.createHostedConstructorMock).toHaveBeenCalledTimes(1)
    })

    await act(async () => {
      await harness.instance.loadLayout({
        widgets: [
          { id: 'widget-1', x: 64, y: 96 },
          { id: 'toggle-1', x: 160, y: 96 },
        ],
      })
      await harness.instance.loadBindingProfile({
        widgetBindings: [{ widgetId: 'widget-1', deviceId: 'device-1', metric: 'temperature' }],
        commandBindings: [{ widgetId: 'toggle-1', deviceId: 'pump_main', commandType: 'set_bool' }],
      })
    })

    act(() => {
      harness.emitDirtyStateChange({ layoutDirty: true, bindingsDirty: false })
      harness.emitSaveLayoutIntent()
    })

    await waitFor(() => {
      expect(callOrder).toEqual(['put'])
    })
    expect(screen.queryByText('Сохранение layout удалит существующие привязки.')).not.toBeInTheDocument()
    expect(harness.instanceSpies.loadBindingProfileMock).toHaveBeenLastCalledWith({
      widgetBindings: [{ widgetId: 'widget-1', deviceId: 'device-1', metric: 'temperature' }],
      commandBindings: [{ widgetId: 'toggle-1', deviceId: 'pump_main', commandType: 'set_bool' }],
    })
  })

  it('recreates the current binding set after destructive layout save when dirty layout blocks direct binding save', async () => {
    const user = userEvent.setup()
    const harness = createMockHostedConstructorHarness({ clearBindingsOnLayoutLoad: true })
    mockedLoadHostedConstructor.mockResolvedValue(harness.module)

    const callOrder: string[] = []
    let diagramVersion = 7
    let postedBindingPayload:
      | {
          edgeServerId: string
          widgetBindings: Array<{ widgetId: string; deviceId: string; metric: string }>
          commandBindings?: Array<{ widgetId: string; deviceId: string; commandType: 'set_bool' | 'set_number' }>
        }
      | null = null

    server.use(
      http.get('/api/diagrams/:id', ({ params }) =>
        HttpResponse.json({
          status: 'success',
          data: {
            _id: String(params.id),
            name: 'Destructive chained save diagram',
            layout: { widgets: [{ id: 'widget-1' }] },
            __v: diagramVersion,
          },
        }),
      ),
      http.get('/api/edge-servers', () =>
        HttpResponse.json({
          status: 'success',
          data: [
            {
              _id: 'edge-1',
              name: 'Machine #1',
              lifecycleState: 'Active',
              availability: { online: true, lastSeenAt: null },
            },
          ],
        }),
      ),
      http.get('/api/edge-servers/:edgeId/catalog', () =>
        HttpResponse.json({
          status: 'success',
          data: [],
        }),
      ),
      http.get('/api/diagrams/:id/bindings', () =>
        HttpResponse.json({
          status: 'success',
          data: [
            {
              _id: 'persisted-set',
              diagramId: 'diagram-destructive-chain',
              edgeServerId: 'edge-1',
              widgetBindings: [{ widgetId: 'widget-1', deviceId: 'device-1', metric: 'temperature' }],
              commandBindings: [],
            },
          ],
        }),
      ),
      http.put('/api/diagrams/:id', async ({ request }) => {
        const payload = (await request.json()) as { __v: number; layout: unknown }
        expect(payload.__v).toBe(diagramVersion)
        callOrder.push('put')
        diagramVersion += 1

        return HttpResponse.json({
          status: 'success',
          data: {
            _id: 'diagram-destructive-chain',
            name: 'Destructive chained save diagram',
            layout: payload.layout,
            __v: diagramVersion,
          },
        })
      }),
      http.delete('/api/diagrams/:id/bindings', () => {
        callOrder.push('delete-all')
        return new HttpResponse(null, { status: 204 })
      }),
      http.post('/api/diagrams/:id/bindings', async ({ request, params }) => {
        const payload = (await request.json()) as {
          edgeServerId: string
          widgetBindings: Array<{ widgetId: string; deviceId: string; metric: string }>
          commandBindings?: Array<{ widgetId: string; deviceId: string; commandType: 'set_bool' | 'set_number' }>
        }
        postedBindingPayload = payload
        callOrder.push('post-bindings')

        return HttpResponse.json({
          status: 'success',
          data: {
            _id: 'saved-bindings-2',
            diagramId: String(params.id),
            edgeServerId: payload.edgeServerId,
            widgetBindings: payload.widgetBindings,
            commandBindings: payload.commandBindings ?? [],
          },
        })
      }),
    )

    renderFullPage('/hub/editor/diagram-destructive-chain?edgeId=edge-1')

    await waitFor(() => {
      expect(harness.createHostedConstructorMock).toHaveBeenCalledTimes(1)
    })

    await act(async () => {
      await harness.instance.loadLayout({
        widgets: [{ id: 'widget-2' }, { id: 'toggle-1' }],
      })
      await harness.instance.loadBindingProfile({
        widgetBindings: [{ widgetId: 'widget-2', deviceId: 'device-2', metric: 'pressure' }],
        commandBindings: [{ widgetId: 'toggle-1', deviceId: 'pump_main', commandType: 'set_bool' }],
      })
    })

    act(() => {
      harness.emitDirtyStateChange({ layoutDirty: true, bindingsDirty: true })
    })

    await waitFor(() => {
      expect(harness.getLastConfig()?.activeEdgeServerId).toBe('edge-1')
    })

    act(() => {
      harness.emitSaveBindingsIntent()
    })

    expect(await screen.findByText('Сохранение layout удалит существующие привязки.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Продолжить с удалением' }))

    await waitFor(() => {
      expect(callOrder).toEqual(['put', 'delete-all', 'post-bindings'])
    })
    expect(postedBindingPayload).toEqual({
      edgeServerId: 'edge-1',
      widgetBindings: [{ widgetId: 'widget-2', deviceId: 'device-2', metric: 'pressure' }],
      commandBindings: [{ widgetId: 'toggle-1', deviceId: 'pump_main', commandType: 'set_bool' }],
    })
    expect(harness.instanceSpies.loadBindingProfileMock).toHaveBeenCalledWith({
      widgetBindings: [{ widgetId: 'widget-2', deviceId: 'device-2', metric: 'pressure' }],
      commandBindings: [{ widgetId: 'toggle-1', deviceId: 'pump_main', commandType: 'set_bool' }],
    })
  })
})
