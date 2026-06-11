import { act } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { server } from '../mocks/server'
import { ProtectedRoute } from '@/shared/components/ProtectedRoute'
import { useAuthStore, type Session } from '@/shared/store/useAuthStore'
import { adminHubRouteChildren } from '@/app/adminHubRoutes'
import { createMockHostedConstructorHarness } from './helpers/mockHostedConstructor'
import { loadHostedConstructor } from '@/features/constructor-host/loadHostedConstructor'

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

const adminSession: Session = {
  id: 'admin-1',
  email: 'admin@example.com',
  role: 'ADMIN',
  tier: 'PRO',
  accessToken: 'admin-token',
}

function renderAdminRoutes(initialPath: string) {
  const router = createMemoryRouter(
    [
      {
        path: '/login',
        element: <div>Login</div>,
      },
      {
        path: '/admin',
        element: <ProtectedRoute requiredRole="ADMIN" />,
        children: adminHubRouteChildren,
      },
    ],
    { initialEntries: [initialPath] },
  )

  render(<RouterProvider router={router} />)
  return router
}

beforeEach(() => {
  mockedLoadHostedConstructor.mockReset()
  act(() => {
    useAuthStore.setState({ session: null, isAuthenticated: false })
    useAuthStore.getState().setSession(adminSession)
  })
})

describe('Reduced constructor page integration coverage (T028)', () => {
  it('keeps reduced mode free from bindings/machine/catalog API flows (T028)', async () => {
    const harness = createMockHostedConstructorHarness()
    mockedLoadHostedConstructor.mockResolvedValue(harness.module)

    const calls = {
      edgeServers: 0,
      catalog: 0,
      loadBindings: 0,
      saveBindings: 0,
      deleteBindings: 0,
    }

    server.use(
      http.get('/api/diagrams/:id', ({ params }) =>
        HttpResponse.json({
          status: 'success',
          data: {
            _id: String(params.id),
            name: 'Reduced mode diagram',
            layout: { widgets: [] },
            __v: 5,
          },
        }),
      ),
      http.get('/api/edge-servers', () => {
        calls.edgeServers += 1
        return HttpResponse.json({ status: 'success', data: [] })
      }),
      http.get('/api/edge-servers/:edgeId/catalog', () => {
        calls.catalog += 1
        return HttpResponse.json({ status: 'success', data: [] })
      }),
      http.get('/api/diagrams/:id/bindings', () => {
        calls.loadBindings += 1
        return HttpResponse.json({ status: 'success', data: [] })
      }),
      http.post('/api/diagrams/:id/bindings', () => {
        calls.saveBindings += 1
        return HttpResponse.json({ status: 'success', data: [] })
      }),
      http.delete('/api/diagrams/:id/bindings', () => {
        calls.deleteBindings += 1
        return new HttpResponse(null, { status: 204 })
      }),
    )

    renderAdminRoutes('/admin/editor/diagram-1')

    expect(await screen.findByText(/Конструктор/)).toBeInTheDocument()

    await waitFor(() => {
      expect(harness.createHostedConstructorMock).toHaveBeenCalledTimes(1)
    })

    expect(harness.getLastConfig()?.mode).toBe('reduced')

    act(() => {
      harness.emitSaveBindingsIntent()
      harness.emitMachineChange('edge-should-not-apply')
    })

    await waitFor(() => {
      expect(calls.edgeServers).toBe(0)
      expect(calls.catalog).toBe(0)
      expect(calls.loadBindings).toBe(0)
      expect(calls.saveBindings).toBe(0)
      expect(calls.deleteBindings).toBe(0)
    })
  })

  it('saves and restores a newly created empty template through the reduced hosted page without bindings calls (T012)', async () => {
    const harness = createMockHostedConstructorHarness()
    mockedLoadHostedConstructor.mockResolvedValue(harness.module)

    const representativeLayout = {
      images: [
        {
          id: 'image-1',
          src: '/constructor/assets/backgrounds/boiler.png',
          x: 24,
          y: 36,
          width: 800,
          height: 460,
        },
      ],
      widgets: [
        {
          id: 'widget-1',
          widgetType: 'gauge',
          x: 320,
          y: 220,
          properties: {
            label: 'Boiler Pressure',
            color: '#22c55e',
          },
        },
      ],
      viewState: {
        zoom: 1.15,
        panX: -12,
        panY: 8,
      },
    }
    const calls = {
      diagramGet: 0,
      diagramPut: 0,
      loadBindings: 0,
      saveBindings: 0,
      deleteBindings: 0,
      edgeServers: 0,
      catalog: 0,
    }

    let storedVersion = 2
    let storedLayout: Record<string, unknown> = {}

    server.use(
      http.get('/api/diagrams/:id', ({ params }) => {
        calls.diagramGet += 1

        return HttpResponse.json({
          status: 'success',
          data: {
            _id: String(params.id),
            name: 'New Admin template',
            layout: storedLayout,
            __v: storedVersion,
          },
        })
      }),
      http.put('/api/diagrams/:id', async ({ request, params }) => {
        calls.diagramPut += 1
        const payload = (await request.json()) as {
          __v: number
          layout: Record<string, unknown>
        }

        expect(payload.__v).toBe(storedVersion)
        storedVersion += 1
        storedLayout = payload.layout

        return HttpResponse.json({
          status: 'success',
          data: {
            _id: String(params.id),
            name: 'New Admin template',
            layout: storedLayout,
            __v: storedVersion,
          },
          bindingsInvalidated: false,
        })
      }),
      http.get('/api/diagrams/:id/bindings', () => {
        calls.loadBindings += 1
        return HttpResponse.json({ status: 'success', data: [] })
      }),
      http.post('/api/diagrams/:id/bindings', () => {
        calls.saveBindings += 1
        return HttpResponse.json({ status: 'success', data: [] })
      }),
      http.delete('/api/diagrams/:id/bindings', () => {
        calls.deleteBindings += 1
        return new HttpResponse(null, { status: 204 })
      }),
      http.get('/api/edge-servers', () => {
        calls.edgeServers += 1
        return HttpResponse.json({ status: 'success', data: [] })
      }),
      http.get('/api/edge-servers/:edgeId/catalog', () => {
        calls.catalog += 1
        return HttpResponse.json({ status: 'success', data: [] })
      }),
    )

    const router = renderAdminRoutes('/admin/editor/diagram-2')

    await waitFor(() => {
      expect(harness.createHostedConstructorMock).toHaveBeenCalledTimes(1)
    })

    expect(harness.getLastConfig()?.mode).toBe('reduced')
    expect(harness.getLastConfig()?.initialLayout).toEqual({})

    await act(async () => {
      await harness.instance.loadLayout(representativeLayout)
    })

    act(() => {
      harness.emitSaveLayoutIntent()
      harness.emitSaveBindingsIntent()
    })

    await waitFor(() => {
      expect(calls.diagramPut).toBe(1)
      expect(calls.diagramGet).toBeGreaterThanOrEqual(2)
    })

    await act(async () => {
      await router.navigate('/login')
    })
    await waitFor(() => {
      expect(harness.instanceSpies.destroyMock).toHaveBeenCalledTimes(1)
    })

    await act(async () => {
      await router.navigate('/admin/editor/diagram-2')
    })
    await waitFor(() => {
      expect(harness.createHostedConstructorMock).toHaveBeenCalledTimes(2)
    })

    expect(harness.getLastConfig()?.mode).toBe('reduced')
    expect(harness.getLastConfig()?.initialLayout).toEqual(representativeLayout)
    expect(storedLayout).toEqual(representativeLayout)
    expect(storedVersion).toBe(3)
    expect(calls.loadBindings).toBe(0)
    expect(calls.saveBindings).toBe(0)
    expect(calls.deleteBindings).toBe(0)
    expect(calls.edgeServers).toBe(0)
    expect(calls.catalog).toBe(0)
    expect(harness.instanceSpies.getBindingsMock).not.toHaveBeenCalled()
    expect(harness.instanceSpies.loadBindingsMock).not.toHaveBeenCalled()
    expect(harness.instanceSpies.getBindingProfileMock).not.toHaveBeenCalled()
    expect(harness.instanceSpies.loadBindingProfileMock).not.toHaveBeenCalled()
  })

  it('offers recoverable empty-layout fallback for invalid payloads and runtime bootstrap failures (T031)', async () => {
    const runtimeHarness = createMockHostedConstructorHarness()
    const createHostedConstructorMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('Bootstrap failed at runtime.'))
      .mockImplementation(async (config) => runtimeHarness.module.createHostedConstructor(config))

    mockedLoadHostedConstructor.mockResolvedValue({
      createHostedConstructor: createHostedConstructorMock,
    })

    let requestCount = 0
    server.use(
      http.get('/api/diagrams/:id', ({ params }) => {
        requestCount += 1

        if (requestCount === 1) {
          return HttpResponse.json({
            status: 'success',
            data: {
              _id: String(params.id),
              name: 'Broken layout diagram',
              layout: null,
              __v: 1,
            },
          })
        }

        return HttpResponse.json({
          status: 'success',
          data: {
            _id: String(params.id),
            name: 'Broken layout diagram',
            layout: { widgets: [] },
            __v: 1,
          },
        })
      }),
    )

    const user = userEvent.setup()

    renderAdminRoutes('/admin/editor/diagram-3')

    expect(await screen.findByText('Не удалось открыть страницу конструктора.')).toBeInTheDocument()
    expect(screen.getByText(/Некорректный payload layout мнемосхемы/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Открыть с пустым layout' }))

    await waitFor(() => {
      expect(createHostedConstructorMock).toHaveBeenCalledTimes(1)
    })

    expect(await screen.findByText('Не удалось открыть страницу конструктора.')).toBeInTheDocument()
    expect(screen.getByText(/Не удалось запустить hosted runtime/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Повторить загрузку' }))

    await waitFor(() => {
      expect(createHostedConstructorMock).toHaveBeenCalledTimes(2)
    })

    expect(await screen.findByTestId('constructor-host-runtime')).toBeInTheDocument()
  })
})
