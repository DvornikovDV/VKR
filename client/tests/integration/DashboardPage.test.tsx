import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { server } from '../mocks/server'
import { userHubRouteChildren } from '@/app/userHubRoutes'
import { ProtectedRoute } from '@/shared/components/ProtectedRoute'
import { useAuthStore, type Session } from '@/shared/store/useAuthStore'

const runtimeHarness = vi.hoisted(() => {
  type RuntimeCallbacks = {
    edgeId: string
    onTransportStatusChange?: (status: 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'failed') => void
    onTelemetry?: (event: {
      edgeId: string
      readings: Array<{
        sourceId: string
        deviceId: string
        metric: string
        last: number | string | boolean | null
        ts: number
      }>
      serverTs: number
    }) => void
    onEdgeStatus?: (event: { edgeId: string; online: boolean }) => void
    onRuntimeError?: (error: Error) => void
  }

  const activeCallbacksByEdge = new Map<string, RuntimeCallbacks>()
  const disposeCountByEdge = new Map<string, number>()
  const startSession = vi.fn((options: RuntimeCallbacks) => {
    activeCallbacksByEdge.set(options.edgeId, options)
    options.onTransportStatusChange?.('connecting')

    return {
      edgeId: options.edgeId,
      dispose: () => {
        activeCallbacksByEdge.delete(options.edgeId)
        disposeCountByEdge.set(options.edgeId, (disposeCountByEdge.get(options.edgeId) ?? 0) + 1)
      },
      isConnected: () => false,
    }
  })

  return {
    startSession,
    emitTransportStatus: (edgeId: string, status: 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'failed') => {
      activeCallbacksByEdge.get(edgeId)?.onTransportStatusChange?.(status)
    },
    emitTelemetry: (event: {
      edgeId: string
      readings: Array<{
        sourceId: string
        deviceId: string
        metric: string
        last: number | string | boolean | null
        ts: number
      }>
      serverTs: number
    }) => {
      activeCallbacksByEdge.get(event.edgeId)?.onTelemetry?.(event)
    },
    emitEdgeStatus: (event: { edgeId: string; online: boolean }) => {
      activeCallbacksByEdge.get(event.edgeId)?.onEdgeStatus?.(event)
    },
    getDisposeCount: (edgeId: string) => disposeCountByEdge.get(edgeId) ?? 0,
    reset: () => {
      activeCallbacksByEdge.clear()
      disposeCountByEdge.clear()
      startSession.mockClear()
    },
  }
})

vi.mock('@/features/dashboard/services/cloudRuntimeClient', async () => {
  const actual = await vi.importActual<typeof import('@/features/dashboard/services/cloudRuntimeClient')>(
    '@/features/dashboard/services/cloudRuntimeClient',
  )

  return {
    ...actual,
    cloudRuntimeClient: {
      startSession: runtimeHarness.startSession,
    },
  }
})

const userSession: Session = {
  id: 'user-1',
  email: 'user@example.com',
  role: 'USER',
  tier: 'PRO',
  accessToken: 'user-token',
}

const adminSession: Session = {
  id: 'admin-1',
  email: 'admin@example.com',
  role: 'ADMIN',
  tier: 'PRO',
  accessToken: 'admin-token',
}

function mount(path: string) {
  const router = createMemoryRouter(
    [
      {
        path: '/login',
        element: <div data-testid="login-page">Login</div>,
      },
      {
        path: '/hub',
        element: <ProtectedRoute requiredRole="USER" />,
        children: userHubRouteChildren,
      },
      {
        path: '/admin',
        element: <ProtectedRoute requiredRole="ADMIN" />,
        children: [{ index: true, element: <div data-testid="admin-home">Admin Home</div> }],
      },
    ],
    { initialEntries: [path] },
  )

  render(<RouterProvider router={router} />)
  return router
}

function setupDashboardApiFixtures() {
  server.use(
    http.get('/api/diagrams', () =>
      HttpResponse.json({
        status: 'success',
        data: [
          {
            _id: 'diagram-1',
            name: 'Boiler',
            layout: {
              widgets: [{ id: 'widget-1', type: 'number-display', x: 20, y: 20 }],
            },
          },
          {
            _id: 'diagram-2',
            name: 'Pump',
            layout: {
              widgets: [{ id: 'widget-2', type: 'number-display', x: 20, y: 20 }],
            },
          },
        ],
      }),
    ),
    http.get('/api/edge-servers', () =>
      HttpResponse.json({
        status: 'success',
        data: [
          { _id: 'edge-1', name: 'Edge A' },
          { _id: 'edge-2', name: 'Edge B' },
        ],
      }),
    ),
    http.get('/api/diagrams/:id/bindings', ({ params }) => {
      if (params.id === 'diagram-1') {
        return HttpResponse.json({
          status: 'success',
          data: [
            {
              _id: 'binding-1',
              diagramId: 'diagram-1',
              edgeServerId: 'edge-1',
              widgetBindings: [{ widgetId: 'widget-1', deviceId: 'pump-1', metric: 'temperature' }],
            },
          ],
        })
      }

      if (params.id === 'diagram-2') {
        return HttpResponse.json({
          status: 'success',
          data: [
            {
              _id: 'binding-2',
              diagramId: 'diagram-2',
              edgeServerId: 'edge-2',
              widgetBindings: [{ widgetId: 'widget-2', deviceId: 'pump-2', metric: 'flow' }],
            },
          ],
        })
      }

      return HttpResponse.json({ status: 'success', data: [] })
    }),
  )
}

beforeEach(() => {
  runtimeHarness.reset()
  act(() => {
    useAuthStore.setState({ session: null, isAuthenticated: false })
    useAuthStore.getState().setSession(userSession)
  })
})

describe('DashboardPage (US1)', () => {
  it('supports valid route prefill with diagram and edge pair', async () => {
    setupDashboardApiFixtures()

    mount('/hub/dashboard?diagramId=diagram-1&edgeId=edge-1')

    expect(await screen.findByRole('heading', { name: 'Dashboard Monitoring' })).toBeInTheDocument()
    expect(screen.getByLabelText('Diagram')).toHaveValue('diagram-1')
    expect(screen.getByLabelText('Edge Server')).toHaveValue('edge-1')
  })

  it('keeps dashboard route and renders invalid-selection for edge-only query', async () => {
    setupDashboardApiFixtures()
    const router = mount('/hub/dashboard?edgeId=edge-1')

    expect(await screen.findByText('Invalid dashboard selection.')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/hub/dashboard')
  })

  it('denies admin access before dashboard initialization', async () => {
    act(() => {
      useAuthStore.setState({ session: null, isAuthenticated: false })
      useAuthStore.getState().setSession(adminSession)
    })

    mount('/hub/dashboard')

    expect(await screen.findByTestId('admin-home')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Dashboard Monitoring' })).not.toBeInTheDocument()
  })

  it('synchronizes URL query when user changes diagram and edge selection', async () => {
    setupDashboardApiFixtures()
    const router = mount('/hub/dashboard')

    expect(await screen.findByRole('heading', { name: 'Dashboard Monitoring' })).toBeInTheDocument()

    const user = userEvent.setup()
    await user.selectOptions(screen.getByLabelText('Diagram'), 'diagram-2')
    await waitFor(() => {
      expect(router.state.location.search).toContain('diagramId=diagram-2')
      expect(router.state.location.search).not.toContain('edgeId=')
    })
    expect(screen.getByText('Select an edge server to start monitoring.')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Edge Server'), 'edge-2')
    await waitFor(() => {
      expect(router.state.location.search).toContain('diagramId=diagram-2')
      expect(router.state.location.search).toContain('edgeId=edge-2')
    })
  })
})

describe('DashboardPage (US2)', () => {
  it('renders live transport and edge-availability status for active monitoring context', async () => {
    setupDashboardApiFixtures()
    mount('/hub/dashboard?diagramId=diagram-1&edgeId=edge-1')

    expect(await screen.findByRole('heading', { name: 'Dashboard Monitoring' })).toBeInTheDocument()
    await waitFor(() => {
      expect(runtimeHarness.startSession).toHaveBeenCalledWith(
        expect.objectContaining({ edgeId: 'edge-1' }),
      )
    })

    act(() => {
      runtimeHarness.emitTransportStatus('edge-1', 'connected')
      runtimeHarness.emitEdgeStatus({ edgeId: 'edge-1', online: true })
    })

    expect(screen.getByText('Transport: Connected')).toBeInTheDocument()
    expect(screen.getByText('Edge: Edge online')).toBeInTheDocument()
  })

  it('shows reconnect messaging and preserves last runtime values in place', async () => {
    setupDashboardApiFixtures()
    mount('/hub/dashboard?diagramId=diagram-1&edgeId=edge-1')

    expect(await screen.findByRole('heading', { name: 'Dashboard Monitoring' })).toBeInTheDocument()
    await waitFor(() => {
      expect(runtimeHarness.startSession).toHaveBeenCalledWith(
        expect.objectContaining({ edgeId: 'edge-1' }),
      )
    })

    act(() => {
      runtimeHarness.emitTransportStatus('edge-1', 'connected')
      runtimeHarness.emitTelemetry({
        edgeId: 'edge-1',
        readings: [
          {
            sourceId: 'source-1',
            deviceId: 'pump-1',
            metric: 'temperature',
            last: 48.7,
            ts: 1763895000000,
          },
        ],
        serverTs: 1763895000500,
      })
    })

    expect(screen.getByText('pump-1::temperature')).toBeInTheDocument()
    expect(screen.getByText('48.7')).toBeInTheDocument()

    act(() => {
      runtimeHarness.emitTransportStatus('edge-1', 'reconnecting')
    })

    expect(
      screen.getByText('Transport reconnecting. Last rendered values are preserved.'),
    ).toBeInTheDocument()
    expect(screen.getByText('48.7')).toBeInTheDocument()
  })

  it('disposes the previous runtime session when monitoring context changes', async () => {
    setupDashboardApiFixtures()
    const router = mount('/hub/dashboard?diagramId=diagram-1&edgeId=edge-1')

    expect(await screen.findByRole('heading', { name: 'Dashboard Monitoring' })).toBeInTheDocument()
    await waitFor(() => {
      expect(runtimeHarness.startSession).toHaveBeenCalledWith(
        expect.objectContaining({ edgeId: 'edge-1' }),
      )
    })

    const user = userEvent.setup()
    await user.selectOptions(screen.getByLabelText('Diagram'), 'diagram-2')
    await user.selectOptions(screen.getByLabelText('Edge Server'), 'edge-2')

    await waitFor(() => {
      expect(router.state.location.search).toContain('diagramId=diagram-2')
      expect(router.state.location.search).toContain('edgeId=edge-2')
      expect(runtimeHarness.startSession).toHaveBeenCalledWith(
        expect.objectContaining({ edgeId: 'edge-2' }),
      )
      expect(runtimeHarness.getDisposeCount('edge-1')).toBeGreaterThanOrEqual(1)
    })
  })
})
