import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { server } from '../mocks/server'
import {
  createDashboardVisualRestFixtures,
  dashboardVisualDiagram,
} from '../fixtures/dashboardVisualLayout'
import {
  createDashboardApiFixtures,
  createDashboardApiHandlers,
  type DashboardRestFixtures,
} from '../mocks/handlers'
import { createDashboardTelemetryEventFixture } from './helpers/mockDashboardRuntimeSocket'
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

function setupDashboardApiFixtures(overrides: Partial<DashboardRestFixtures> = {}) {
  const fixtures = createDashboardApiFixtures(overrides)
  server.use(...createDashboardApiHandlers(fixtures))
  return fixtures
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
    }, { timeout: 1000 })
    expect(screen.getByText('Select an edge server to start monitoring.')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Edge Server'), 'edge-2')
    await waitFor(() => {
      expect(router.state.location.search).toContain('diagramId=diagram-2')
      expect(router.state.location.search).toContain('edgeId=edge-2')
    }, { timeout: 1000 })
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
      runtimeHarness.emitTelemetry(
        createDashboardTelemetryEventFixture({
          readings: [
            {
              deviceId: 'pump-1',
              metric: 'temperature',
              last: 48.7,
              ts: 1763895000000,
            },
          ],
          serverTs: 1763895000500,
        }),
      )
    })

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Open diagnostics' }))
    const diagnosticsPanel = await screen.findByTestId('dashboard-diagnostics-panel')
    expect(within(diagnosticsPanel).getByText('pump-1::temperature')).toBeInTheDocument()
    expect(within(diagnosticsPanel).getByText('48.7')).toBeInTheDocument()

    act(() => {
      runtimeHarness.emitTransportStatus('edge-1', 'reconnecting')
    })

    await waitFor(() => {
      expect(
        screen.getByText('Transport reconnecting. Last rendered values are preserved.'),
      ).toBeInTheDocument()
    }, { timeout: 3000 })
    expect(within(diagnosticsPanel).getByText('48.7')).toBeInTheDocument()
  })

  it('distinguishes edge offline state from transport reconnecting state', async () => {
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
      runtimeHarness.emitEdgeStatus({ edgeId: 'edge-1', online: false })
    })

    expect(screen.getByText('Transport: Connected')).toBeInTheDocument()
    expect(screen.getByText('Edge: Edge offline')).toBeInTheDocument()
    expect(
      screen.queryByText('Transport reconnecting. Last rendered values are preserved.'),
    ).not.toBeInTheDocument()

    act(() => {
      runtimeHarness.emitTransportStatus('edge-1', 'reconnecting')
    })

    await waitFor(() => {
      expect(screen.getByText('Transport: Reconnecting')).toBeInTheDocument()
      expect(screen.getByText('Edge: Edge offline')).toBeInTheDocument()
      expect(
        screen.getByText('Transport reconnecting. Last rendered values are preserved.'),
      ).toBeInTheDocument()
    }, { timeout: 3000 })
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
    }, { timeout: 2000 })
  })
})

describe('DashboardPage (US3)', () => {
  it('renders missing-binding-profile state when trusted edge has no saved profile for selected diagram', async () => {
    setupDashboardApiFixtures()
    mount('/hub/dashboard?diagramId=diagram-1&edgeId=edge-2')

    expect(await screen.findByRole('heading', { name: 'Dashboard Monitoring' })).toBeInTheDocument()
    expect(
      screen.getByText('No saved binding profile for the selected Diagram + Edge pair.'),
    ).toBeInTheDocument()
  })

  it('renders invalid-binding-profile state when saved binding references stale widget ids', async () => {
    setupDashboardApiFixtures()
    server.use(
      http.get('/api/diagrams/diagram-1/bindings', () =>
        HttpResponse.json({
          status: 'success',
          data: [
            {
              _id: 'binding-stale',
              diagramId: 'diagram-1',
              edgeServerId: 'edge-1',
              widgetBindings: [{ widgetId: 'widget-deleted', deviceId: 'pump-1', metric: 'temperature' }],
            },
          ],
        }),
      ),
    )

    mount('/hub/dashboard?diagramId=diagram-1&edgeId=edge-1')

    expect(await screen.findByRole('heading', { name: 'Dashboard Monitoring' })).toBeInTheDocument()
    expect(await screen.findByText('Saved binding profile references stale widget ids.')).toBeInTheDocument()
  })

  it('uses saved diagram snapshot for runtime rendering and applies bound values for supported widgets', async () => {
    setupDashboardApiFixtures()
    server.use(
      http.get('/api/diagrams', () =>
        HttpResponse.json({
          status: 'success',
          data: [
            {
              _id: 'diagram-1',
              name: 'Boiler',
              layout: {
                widgets: [{ id: 'widget-draft-only', type: 'text-display' }],
              },
            },
          ],
        }),
      ),
      http.get('/api/diagrams/diagram-1', () =>
        HttpResponse.json({
          status: 'success',
          data: {
            _id: 'diagram-1',
            name: 'Boiler',
            layout: {
              widgets: [
                { id: 'widget-number', type: 'number-display' },
                { id: 'widget-text', type: 'text-display' },
                { id: 'widget-led', type: 'led' },
              ],
            },
          },
        }),
      ),
      http.get('/api/diagrams/diagram-1/bindings', () =>
        HttpResponse.json({
          status: 'success',
          data: [
            {
              _id: 'binding-1',
              diagramId: 'diagram-1',
              edgeServerId: 'edge-1',
              widgetBindings: [
                { widgetId: 'widget-number', deviceId: 'pump-1', metric: 'temperature' },
                { widgetId: 'widget-text', deviceId: 'pump-1', metric: 'status' },
                { widgetId: 'widget-led', deviceId: 'pump-1', metric: 'alarm' },
              ],
            },
          ],
        }),
      ),
    )

    mount('/hub/dashboard?diagramId=diagram-1&edgeId=edge-1')

    expect(await screen.findByRole('heading', { name: 'Dashboard Monitoring' })).toBeInTheDocument()

    await waitFor(() => {
      expect(runtimeHarness.startSession).toHaveBeenCalledWith(
        expect.objectContaining({ edgeId: 'edge-1' }),
      )
    })

    act(() => {
      runtimeHarness.emitTransportStatus('edge-1', 'connected')
      runtimeHarness.emitTelemetry(
        createDashboardTelemetryEventFixture({
          readings: [
            {
              deviceId: 'pump-1',
              metric: 'temperature',
              last: '48.5',
              ts: 1763895000000,
            },
            {
              deviceId: 'pump-1',
              metric: 'status',
              last: 15,
              ts: 1763895000001,
            },
            {
              deviceId: 'pump-1',
              metric: 'alarm',
              last: 'false',
              ts: 1763895000002,
            },
          ],
          serverTs: 1763895000500,
        }),
      )
    })

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Open diagnostics' }))
    const diagnosticsPanel = await screen.findByTestId('dashboard-diagnostics-panel')
    expect(within(diagnosticsPanel).getByText('widget-number')).toBeInTheDocument()
    expect(within(diagnosticsPanel).getByText('widget-text')).toBeInTheDocument()
    expect(within(diagnosticsPanel).getByText('widget-led')).toBeInTheDocument()
    expect(screen.queryByText('widget-draft-only')).not.toBeInTheDocument()

    expect(within(diagnosticsPanel).getByText('Value: 48.5')).toBeInTheDocument()
    expect(within(diagnosticsPanel).getByText('Value: 15')).toBeInTheDocument()
    expect(within(diagnosticsPanel).getByText('Value: false')).toBeInTheDocument()
  })
})

describe('DashboardPage (US4)', () => {
  it('keeps command-capable widgets visible but non-operative in monitoring MVP', async () => {
    setupDashboardApiFixtures({
      diagramsById: {
        'diagram-1': {
          _id: 'diagram-1',
          name: 'Boiler',
          layout: {
            widgets: [
              { id: 'widget-supported', type: 'number-display' },
              { id: 'widget-command', type: 'button-control' },
            ],
          },
        },
      },
      bindingProfilesByDiagramId: {
        'diagram-1': [
          {
            _id: 'binding-1',
            diagramId: 'diagram-1',
            edgeServerId: 'edge-1',
            widgetBindings: [
              { widgetId: 'widget-supported', deviceId: 'pump-1', metric: 'temperature' },
              { widgetId: 'widget-command', deviceId: 'pump-1', metric: 'command-setpoint' },
            ],
          },
        ],
      },
    })

    mount('/hub/dashboard?diagramId=diagram-1&edgeId=edge-1')

    expect(await screen.findByRole('heading', { name: 'Dashboard Monitoring' })).toBeInTheDocument()
    await waitFor(() => {
      expect(runtimeHarness.startSession).toHaveBeenCalledWith(
        expect.objectContaining({ edgeId: 'edge-1' }),
      )
    })

    act(() => {
      runtimeHarness.emitTransportStatus('edge-1', 'connected')
      runtimeHarness.emitTelemetry(
        createDashboardTelemetryEventFixture({
          readings: [
            {
              deviceId: 'pump-1',
              metric: 'temperature',
              last: 49,
              ts: 1763895000000,
            },
            {
              deviceId: 'pump-1',
              metric: 'command-setpoint',
              last: 72,
              ts: 1763895000001,
            },
          ],
        }),
      )
    })

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Open diagnostics' }))
    const diagnosticsPanel = await screen.findByTestId('dashboard-diagnostics-panel')
    expect(within(diagnosticsPanel).getByText('widget-command')).toBeInTheDocument()
    expect(within(diagnosticsPanel).getByText('widget-supported')).toBeInTheDocument()
    expect(within(diagnosticsPanel).getByText('Value: 49')).toBeInTheDocument()
    expect(within(diagnosticsPanel).getByText('Visible only. Unsupported in monitoring MVP.')).toBeInTheDocument()

    const nonOperativeWidget = within(diagnosticsPanel).getByTestId('dashboard-runtime-widget-widget-command')
    expect(nonOperativeWidget).toHaveAttribute('aria-disabled', 'true')
    expect(nonOperativeWidget.className).toContain('pointer-events-none')
    expect(
      screen.queryByRole('button', { name: /widget-command/i }),
    ).not.toBeInTheDocument()
  })
})

describe('DashboardPage visual diagnostics (T051)', () => {
  it('opens collapsed diagnostics from the bottom handle without replacing the visual surface', async () => {
    setupDashboardApiFixtures(createDashboardVisualRestFixtures())
    const user = userEvent.setup()

    mount(`/hub/dashboard?diagramId=${dashboardVisualDiagram._id}&edgeId=edge-visual-1`)

    expect(await screen.findByRole('heading', { name: 'Dashboard Monitoring' })).toBeInTheDocument()
    expect(await screen.findByTestId('dashboard-visual-surface')).toBeInTheDocument()
    expect(screen.queryByTestId('dashboard-diagnostics-panel')).not.toBeInTheDocument()
    expect(screen.queryByText('Runtime diagnostics')).not.toBeInTheDocument()
    expect(screen.queryByText('Telemetry by binding key')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Open diagnostics' }))

    const diagnosticsPanel = await screen.findByTestId('dashboard-diagnostics-panel')
    const scrollRegion = within(diagnosticsPanel).getByTestId('dashboard-diagnostics-scroll-region')

    expect(diagnosticsPanel).toBeInTheDocument()
    expect(scrollRegion).toHaveClass('max-h-80')
    expect(scrollRegion).toHaveClass('overflow-y-auto')
    expect(within(diagnosticsPanel).getByRole('heading', { name: 'Telemetry' })).toBeInTheDocument()
    expect(within(diagnosticsPanel).getByRole('heading', { name: 'Bindings' })).toBeInTheDocument()
    expect(within(diagnosticsPanel).getByRole('heading', { name: 'Render issues' })).toBeInTheDocument()
    expect(screen.getByTestId('dashboard-visual-surface')).toBeInTheDocument()
  })

  it('opens the same collapsed diagnostics state from the Details toolbar action', async () => {
    setupDashboardApiFixtures(createDashboardVisualRestFixtures())
    const user = userEvent.setup()

    mount(`/hub/dashboard?diagramId=${dashboardVisualDiagram._id}&edgeId=edge-visual-1`)

    expect(await screen.findByRole('heading', { name: 'Dashboard Monitoring' })).toBeInTheDocument()
    expect(await screen.findByTestId('dashboard-visual-surface')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Details' }))

    expect(await screen.findByTestId('dashboard-diagnostics-panel')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close diagnostics' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    expect(screen.getByTestId('dashboard-visual-surface')).toBeInTheDocument()
  })
})
