import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { server } from '../mocks/server'
import {
  createDashboardVisualRestFixtures,
  dashboardVisualBindingProfile,
  dashboardVisualDiagram,
  dashboardVisualLayout,
} from '../fixtures/dashboardVisualLayout'
import {
  createDashboardApiFixtures,
  createDashboardApiHandlers,
  type DashboardRestFixtures,
} from '../mocks/handlers'
import {
  createDashboardTelemetryEventFixture,
  dashboardRuntimeClientHarness as runtimeHarness,
} from './helpers/mockDashboardRuntimeSocket'
import { userHubRouteChildren } from '@/app/userHubRoutes'
import { ProtectedRoute } from '@/shared/components/ProtectedRoute'
import { useAuthStore, type Session } from '@/shared/store/useAuthStore'

vi.mock('@/features/dashboard/services/cloudRuntimeClient', async () => {
  const actual = await vi.importActual<typeof import('@/features/dashboard/services/cloudRuntimeClient')>(
    '@/features/dashboard/services/cloudRuntimeClient',
  )
  const { dashboardRuntimeClientHarness } = await import('./helpers/mockDashboardRuntimeSocket')

  return {
    ...actual,
    cloudRuntimeClient: {
      startSession: dashboardRuntimeClientHarness.startSession,
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

async function openDiagnosticsPanel(user = userEvent.setup()) {
  await user.click(screen.getByRole('button', { name: 'Open diagnostics' }))
  return screen.findByTestId('dashboard-diagnostics-panel')
}

async function openDiagnosticsTab(name: 'Status' | 'Telemetry' | 'Bindings' | 'Render issues') {
  const diagnosticsPanel = await screen.findByTestId('dashboard-diagnostics-panel')
  await userEvent.setup().click(within(diagnosticsPanel).getByRole('tab', { name }))
  return diagnosticsPanel
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

    expect(await screen.findByLabelText('Diagram')).toHaveValue('diagram-1')
    expect(screen.getByLabelText('Edge Server')).toHaveValue('edge-1')
  })

  it('keeps dashboard route and renders invalid-selection for edge-only query', async () => {
    setupDashboardApiFixtures()
    const router = mount('/hub/dashboard?edgeId=edge-1')

    expect(await screen.findByText('Invalid selection')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/hub/dashboard')
  })

  it('denies admin access before dashboard initialization', async () => {
    act(() => {
      useAuthStore.setState({ session: null, isAuthenticated: false })
      useAuthStore.getState().setSession(adminSession)
    })

    mount('/hub/dashboard')

    expect(await screen.findByTestId('admin-home')).toBeInTheDocument()
    expect(screen.queryByLabelText('Diagram')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Edge Server')).not.toBeInTheDocument()
  })

  it('synchronizes URL query when user changes diagram and edge selection', async () => {
    setupDashboardApiFixtures()
    const router = mount('/hub/dashboard')

    expect(await screen.findByLabelText('Diagram')).toBeInTheDocument()

    const user = userEvent.setup()
    await user.selectOptions(screen.getByLabelText('Diagram'), 'diagram-2')
    await waitFor(() => {
      expect(router.state.location.search).toContain('diagramId=diagram-2')
      expect(router.state.location.search).not.toContain('edgeId=')
    }, { timeout: 1000 })
    expect(screen.getByText('Select Diagram and Edge Server to start monitoring')).toBeInTheDocument()

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

    expect(await screen.findByLabelText('Diagram')).toHaveValue('diagram-1')
    await waitFor(() => {
      expect(runtimeHarness.startSession).toHaveBeenCalledWith(
        expect.objectContaining({ edgeId: 'edge-1' }),
      )
    })

    act(() => {
      runtimeHarness.emitTransportStatus('edge-1', 'connected')
      runtimeHarness.emitEdgeStatus({ edgeId: 'edge-1', online: true })
    })

    const diagnosticsPanel = await openDiagnosticsPanel()
    expect(within(diagnosticsPanel).getByText('Transport: Connected')).toBeInTheDocument()
    expect(within(diagnosticsPanel).getByText('Edge: Edge online')).toBeInTheDocument()
  })

  it('shows reconnect messaging and preserves last runtime values in place', async () => {
    setupDashboardApiFixtures()
    mount('/hub/dashboard?diagramId=diagram-1&edgeId=edge-1')

    expect(await screen.findByLabelText('Diagram')).toHaveValue('diagram-1')
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
    await openDiagnosticsPanel(user)
    let diagnosticsPanel = await openDiagnosticsTab('Telemetry')
    expect(within(diagnosticsPanel).getByText('pump-1::temperature')).toBeInTheDocument()
    expect(within(diagnosticsPanel).getByText('48.7')).toBeInTheDocument()

    act(() => {
      runtimeHarness.emitTransportStatus('edge-1', 'reconnecting')
    })

    diagnosticsPanel = await openDiagnosticsTab('Status')
    await waitFor(() => {
      expect(
        within(diagnosticsPanel).getByText('Transport reconnecting. Last rendered values are preserved.'),
      ).toBeInTheDocument()
    }, { timeout: 3000 })
    diagnosticsPanel = await openDiagnosticsTab('Telemetry')
    expect(within(diagnosticsPanel).getByText('48.7')).toBeInTheDocument()
  })

  it('distinguishes edge offline state from transport reconnecting state', async () => {
    setupDashboardApiFixtures()
    mount('/hub/dashboard?diagramId=diagram-1&edgeId=edge-1')

    expect(await screen.findByLabelText('Diagram')).toHaveValue('diagram-1')
    await waitFor(() => {
      expect(runtimeHarness.startSession).toHaveBeenCalledWith(
        expect.objectContaining({ edgeId: 'edge-1' }),
      )
    })

    act(() => {
      runtimeHarness.emitTransportStatus('edge-1', 'connected')
      runtimeHarness.emitEdgeStatus({ edgeId: 'edge-1', online: false })
    })

    const diagnosticsPanel = await openDiagnosticsPanel()
    expect(within(diagnosticsPanel).getByText('Transport: Connected')).toBeInTheDocument()
    expect(within(diagnosticsPanel).getByText('Edge: Edge offline')).toBeInTheDocument()
    expect(
      within(diagnosticsPanel).queryByText('Transport reconnecting. Last rendered values are preserved.'),
    ).not.toBeInTheDocument()

    act(() => {
      runtimeHarness.emitTransportStatus('edge-1', 'reconnecting')
    })

    await waitFor(() => {
      expect(within(diagnosticsPanel).getByText('Transport: Reconnecting')).toBeInTheDocument()
      expect(within(diagnosticsPanel).getByText('Edge: Edge offline')).toBeInTheDocument()
      expect(
        within(diagnosticsPanel).getByText('Transport reconnecting. Last rendered values are preserved.'),
      ).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('disposes the previous runtime session when monitoring context changes', async () => {
    setupDashboardApiFixtures()
    const router = mount('/hub/dashboard?diagramId=diagram-1&edgeId=edge-1')

    expect(await screen.findByLabelText('Diagram')).toHaveValue('diagram-1')
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

    expect(await screen.findByLabelText('Diagram')).toHaveValue('diagram-1')
    expect(screen.getByText('No saved binding profile for this Diagram + Edge pair')).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Open Details for more info' }))
    const diagnosticsPanel = await screen.findByTestId('dashboard-diagnostics-panel')
    expect(
      within(diagnosticsPanel).getByText('No saved binding profile for the selected Diagram + Edge pair.'),
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

    expect(await screen.findByLabelText('Diagram')).toHaveValue('diagram-1')
    expect(await screen.findByText('Saved binding profile references stale widget ids')).toBeInTheDocument()
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
            ...dashboardVisualDiagram,
            _id: 'diagram-1',
            name: 'Boiler',
            layout: dashboardVisualLayout,
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
              widgetBindings: dashboardVisualBindingProfile.widgetBindings,
            },
          ],
        }),
      ),
    )

    mount('/hub/dashboard?diagramId=diagram-1&edgeId=edge-1')

    expect(await screen.findByTestId('dashboard-visual-surface')).toBeInTheDocument()

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
              deviceId: 'boiler-1',
              metric: 'temperature',
              last: '48.5',
              ts: 1763895000000,
            },
            {
              deviceId: 'boiler-1',
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
    await openDiagnosticsPanel(user)
    const diagnosticsPanel = await openDiagnosticsTab('Bindings')
    expect(within(diagnosticsPanel).getByText('widget-temperature')).toBeInTheDocument()
    expect(within(diagnosticsPanel).getByText('widget-status')).toBeInTheDocument()
    expect(within(diagnosticsPanel).getByText('widget-alarm')).toBeInTheDocument()
    expect(screen.queryByText('widget-draft-only')).not.toBeInTheDocument()

    expect(within(diagnosticsPanel).getByText('Value: 48.5')).toBeInTheDocument()
    expect(within(diagnosticsPanel).getByText('Value: 15')).toBeInTheDocument()
    expect(within(diagnosticsPanel).getByText('Value: false')).toBeInTheDocument()
  })
})

describe('DashboardPage (US4)', () => {
  it('keeps command-capable widgets visible but non-operative in monitoring MVP', async () => {
    setupDashboardApiFixtures(createDashboardVisualRestFixtures())

    mount(`/hub/dashboard?diagramId=${dashboardVisualDiagram._id}&edgeId=edge-visual-1`)

    expect(await screen.findByTestId('dashboard-visual-surface')).toBeInTheDocument()
    await waitFor(() => {
      expect(runtimeHarness.startSession).toHaveBeenCalledWith(
        expect.objectContaining({ edgeId: 'edge-visual-1' }),
      )
    })

    act(() => {
      runtimeHarness.emitTransportStatus('edge-visual-1', 'connected')
      runtimeHarness.emitTelemetry(
        createDashboardTelemetryEventFixture({
          edgeId: 'edge-visual-1',
          readings: [
            {
              deviceId: 'boiler-1',
              metric: 'temperature',
              last: 49,
              ts: 1763895000000,
            },
          ],
        }),
      )
    })

    const user = userEvent.setup()
    await openDiagnosticsPanel(user)
    const diagnosticsPanel = await openDiagnosticsTab('Bindings')
    expect(within(diagnosticsPanel).getByText('widget-command')).toBeInTheDocument()
    expect(within(diagnosticsPanel).getByText('widget-temperature')).toBeInTheDocument()
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

    expect(await screen.findByTestId('dashboard-visual-surface')).toBeInTheDocument()
    expect(screen.queryByTestId('dashboard-diagnostics-panel')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Open diagnostics' }))

    const diagnosticsPanel = await screen.findByTestId('dashboard-diagnostics-panel')
    const scrollRegion = within(diagnosticsPanel).getByTestId('dashboard-diagnostics-scroll-region')

    expect(diagnosticsPanel).toBeInTheDocument()
    expect(scrollRegion).toHaveClass('max-h-80')
    expect(scrollRegion).toHaveClass('overflow-y-auto')
    expect(within(diagnosticsPanel).getByRole('tab', { name: 'Status' })).toHaveAttribute('aria-selected', 'true')
    expect(within(diagnosticsPanel).getByRole('tab', { name: 'Telemetry' })).toBeInTheDocument()
    expect(within(diagnosticsPanel).getByRole('tab', { name: 'Bindings' })).toBeInTheDocument()
    expect(within(diagnosticsPanel).getByRole('tab', { name: 'Render issues' })).toBeInTheDocument()
    expect(screen.getByTestId('dashboard-visual-surface')).toBeInTheDocument()
  })

  it('opens the same collapsed diagnostics state from the Details toolbar action', async () => {
    setupDashboardApiFixtures(createDashboardVisualRestFixtures())
    const user = userEvent.setup()

    mount(`/hub/dashboard?diagramId=${dashboardVisualDiagram._id}&edgeId=edge-visual-1`)

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

describe('DashboardPage visual render issue recovery (T052)', () => {
  it('surfaces blocking visual-rendering-error from normalized render issues without a text-only fallback', async () => {
    const fixtures = createDashboardVisualRestFixtures()
    setupDashboardApiFixtures({
      ...fixtures,
      diagramsById: {
        [dashboardVisualDiagram._id]: {
          ...dashboardVisualDiagram,
          layout: {
            images: [
              {
                imageId: 'image-broken',
                base64: 'not-a-data-image',
                x: 24,
                y: 24,
                width: 180,
                height: 120,
              },
            ],
            widgets: [
              {
                id: 'widget-temperature',
                type: 'number-display',
                imageId: 'image-broken',
                x: 48,
                y: 56,
                width: 112,
                height: 52,
              },
            ],
          },
        },
      },
      bindingProfilesByDiagramId: {
        [dashboardVisualDiagram._id]: [
          {
            _id: 'binding-visual-broken',
            diagramId: dashboardVisualDiagram._id,
            edgeServerId: 'edge-visual-1',
            widgetBindings: [
              { widgetId: 'widget-temperature', deviceId: 'boiler-1', metric: 'temperature' },
            ],
          },
        ],
      },
    })

    mount(`/hub/dashboard?diagramId=${dashboardVisualDiagram._id}&edgeId=edge-visual-1`)

    expect(await screen.findByText('Saved diagram visual layout cannot be rendered')).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Open Details for more info' }))
    const diagnosticsPanel = await openDiagnosticsTab('Render issues')
    expect(within(diagnosticsPanel).getByText('blocking: damaged-image-data')).toBeInTheDocument()
    expect(within(diagnosticsPanel).getByText('Element: image-broken')).toBeInTheDocument()
    expect(screen.queryByTestId('dashboard-visual-surface')).not.toBeInTheDocument()
    expect(screen.queryByTestId('dashboard-runtime-widget-widget-temperature')).not.toBeInTheDocument()
  })

  it('surfaces partial-visual-rendering from recoverable render issues while preserving the visual surface', async () => {
    setupDashboardApiFixtures(createDashboardVisualRestFixtures())

    mount(`/hub/dashboard?diagramId=${dashboardVisualDiagram._id}&edgeId=edge-visual-1`)

    expect(await screen.findByTestId('dashboard-visual-surface')).toBeInTheDocument()
    expect(screen.getByText('Visual rendering issues: 2 recoverable')).toBeInTheDocument()
    const diagnosticsPanel = await openDiagnosticsPanel()
    await userEvent.setup().click(within(diagnosticsPanel).getByRole('tab', { name: 'Render issues' }))
    expect(within(diagnosticsPanel).getByText('recoverable: missing-connection-point')).toBeInTheDocument()
    expect(within(diagnosticsPanel).getByText('recoverable: missing-widget-image')).toBeInTheDocument()
    expect(screen.queryByTestId('dashboard-runtime-widget-widget-temperature')).not.toBeInTheDocument()
  })
})
