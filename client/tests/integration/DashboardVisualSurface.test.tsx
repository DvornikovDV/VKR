import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import {
  dashboardVisualCatalog,
  createDashboardVisualRestFixtures,
  dashboardVisualDiagram,
  dashboardVisualLayout,
} from '../fixtures/dashboardVisualLayout'
import { createDashboardApiHandlers } from '../mocks/handlers'
import { server } from '../mocks/server'
import {
  createDashboardTelemetryEventFixture,
  dashboardRuntimeSocketHarness as runtimeHarness,
} from './helpers/mockDashboardRuntimeSocket'
import { userHubRouteChildren } from '@/app/userHubRoutes'
import { DashboardVisualSurface } from '@/features/dashboard/components/DashboardVisualSurface'
import { normalizeDashboardRuntimeLayout } from '@/features/dashboard/model/runtimeLayout'
import { createDashboardInitialViewport } from '@/features/dashboard/model/viewport'
import type { DashboardRuntimeProjection } from '@/features/dashboard/model/types'
import { ProtectedRoute } from '@/shared/components/ProtectedRoute'
import { useAuthStore, type Session } from '@/shared/store/useAuthStore'

vi.mock('@/features/dashboard/services/cloudRuntimeClient', async () => {
  const actual = await vi.importActual<typeof import('@/features/dashboard/services/cloudRuntimeClient')>(
    '@/features/dashboard/services/cloudRuntimeClient',
  )
  const { dashboardRuntimeSocketHarness } = await import('./helpers/mockDashboardRuntimeSocket')

  return {
    ...actual,
    cloudRuntimeClient: actual.createCloudRuntimeClient(dashboardRuntimeSocketHarness.socketFactory),
  }
})

const userSession: Session = {
  id: 'user-visual-1',
  email: 'visual-user@example.com',
  role: 'USER',
  tier: 'PRO',
  accessToken: 'visual-user-token',
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
    ],
    { initialEntries: [path] },
  )

  render(<RouterProvider router={router} />)
  return router
}

beforeEach(() => {
  runtimeHarness.reset()
  server.use(
    ...createDashboardApiHandlers(createDashboardVisualRestFixtures()),
    http.get('/api/edge-servers/edge-visual-1/catalog', () =>
      HttpResponse.json({
        status: 'success',
        data: dashboardVisualCatalog,
      }),
    ),
    http.get('/api/edge-servers/edge-visual-1/alarm-incidents', () =>
      HttpResponse.json({
        status: 'success',
        data: {
          incidents: [],
          page: 1,
          limit: 50,
          total: 0,
          hasNextPage: false,
        },
      }),
    ),
  )
  act(() => {
    useAuthStore.setState({ session: null, isAuthenticated: false })
    useAuthStore.getState().setSession(userSession)
  })
})

describe('Dashboard visual runtime surface (T040)', () => {
  it('renders the saved visual layout from GET /api/diagrams/:id as the primary monitoring surface', async () => {
    mount(`/hub/dashboard?diagramId=${dashboardVisualDiagram._id}&edgeId=edge-visual-1`)

    await waitFor(() => {
      expect(runtimeHarness.getLastSubscribePayload()).toEqual({ edgeId: 'edge-visual-1' })
    })

    expect(await screen.findByTestId('dashboard-visual-surface')).toBeInTheDocument()
    expect(screen.getByTestId('dashboard-visual-stage')).toBeInTheDocument()
    expect(screen.getByTestId('dashboard-visual-stage')).toHaveAttribute('data-konva-node')
    const gridLayer = screen.getByTestId('dashboard-visual-grid-layer')
    const workspace = screen.getByTestId('dashboard-visual-workspace')
    expect(gridLayer).toContainElement(workspace)
    expect(workspace).toHaveAttribute('data-draggable', 'true')
    expect(workspace).toHaveAttribute('data-scale-x', '1')
    expect(workspace).toHaveAttribute('data-scale-y', '1')
    const dragHitArea = screen.getByTestId('dashboard-visual-drag-hit-area')
    expect(workspace).toContainElement(dragHitArea)
    expect(dragHitArea).toHaveAttribute('data-listening', 'true')
    expect(dragHitArea).toHaveAttribute('data-opacity', '0.01')

    const boilerImage = screen.getByTestId('dashboard-visual-image-image-boiler')
    expect(boilerImage).toBeInTheDocument()
    expect(boilerImage).toHaveAttribute('data-x', '40')
    expect(boilerImage).toHaveAttribute('data-y', '32')
    expect(boilerImage).toHaveAttribute('data-width', '360')
    expect(boilerImage).toHaveAttribute('data-height', '220')
    expect(gridLayer).toContainElement(boilerImage)
    expect(screen.getByTestId('dashboard-visual-image-image-pump')).toBeInTheDocument()
    const savedConnection = screen.getByTestId('dashboard-visual-connection-connection-main-line-0')
    expect(savedConnection).toBeInTheDocument()
    expect(savedConnection).toHaveAttribute(
      'data-source',
      'saved-segment',
    )
    expect(savedConnection).toHaveAttribute('data-points', '400,131,470,131')
    const boilerOutPoint = screen.getByTestId('dashboard-visual-point-pin-boiler-out')
    expect(boilerOutPoint).toBeInTheDocument()
    expect(boilerOutPoint).toHaveAttribute('data-x', '400')
    expect(boilerOutPoint).toHaveAttribute('data-y', '131')
    expect(boilerOutPoint).toHaveAttribute('data-fill', '#000000')
    expect(screen.getByTestId('dashboard-visual-widget-widget-temperature')).toBeInTheDocument()
    const temperatureShell = screen.getByTestId('dashboard-visual-widget-shell-widget-temperature')
    expect(temperatureShell).toHaveAttribute('data-x', '96')
    expect(temperatureShell).toHaveAttribute('data-y', '92')
    expect(temperatureShell).toHaveAttribute('data-width', '112')
    expect(temperatureShell).toHaveAttribute('data-height', '52')
    expect(temperatureShell).toHaveAttribute('data-fill', '#0f172a')
    expect(temperatureShell).toHaveAttribute('data-stroke', '#38bdf8')
    expect(screen.getByTestId('dashboard-visual-widget-widget-command-toggle')).toBeInTheDocument()

    expect(screen.getByText('Visual rendering issues: 2 recoverable')).toBeInTheDocument()
    expect(screen.queryByText('Saved diagram snapshot')).not.toBeInTheDocument()
  })

  it('keeps the saved visual workspace mounted when fit-to-view is used', async () => {
    mount(`/hub/dashboard?diagramId=${dashboardVisualDiagram._id}&edgeId=edge-visual-1`)

    expect(await screen.findByTestId('dashboard-visual-surface')).toBeInTheDocument()
    expect(screen.getByTestId('dashboard-visual-stage')).toHaveAttribute('data-konva-node')

    const user = userEvent.setup()
    const workspace = screen.getByTestId('dashboard-visual-workspace')
    expect(screen.getByTestId('dashboard-visual-grid-layer')).toContainElement(workspace)
    expect(workspace).toContainElement(screen.getByTestId('dashboard-visual-image-image-boiler'))

    await waitFor(() => {
      expect(
        within(screen.getByTestId('dispatch-action-slot')).getByRole('button', {
          name: 'Fit to view',
        }),
      ).toBeInTheDocument()
    })
    await user.click(
      within(screen.getByTestId('dispatch-action-slot')).getByRole('button', {
        name: 'Fit to view',
      }),
    )
    expect(screen.getByTestId('dashboard-visual-workspace')).toContainElement(
      screen.getByTestId('dashboard-visual-image-image-boiler'),
    )
    expect(screen.getByTestId('dashboard-visual-image-image-pump')).toBeInTheDocument()
    expect(screen.getByTestId('dashboard-visual-widget-widget-temperature')).toBeInTheDocument()
  })

  it('reports incomplete saved widget geometry without rendering an invented widget shell', async () => {
    const fixtures = createDashboardVisualRestFixtures()
    server.use(
      ...createDashboardApiHandlers({
        ...fixtures,
        diagramsById: {
          [dashboardVisualDiagram._id]: {
            ...dashboardVisualDiagram,
            layout: {
              ...dashboardVisualLayout,
              widgets: [
                ...(dashboardVisualLayout.widgets ?? []),
                {
                  id: 'widget-incomplete-geometry',
                  type: 'number-display',
                  imageId: 'image-boiler',
                  width: 120,
                  height: 40,
                },
              ],
            },
          },
        },
      }),
    )

    mount(`/hub/dashboard?diagramId=${dashboardVisualDiagram._id}&edgeId=edge-visual-1`)

    expect(await screen.findByTestId('dashboard-visual-surface')).toBeInTheDocument()
    expect(screen.getByText('Visual rendering issues: 3 recoverable')).toBeInTheDocument()
    expect(screen.queryByTestId('dashboard-visual-widget-widget-incomplete-geometry')).not.toBeInTheDocument()
  })

  it('reports incomplete saved image geometry without rendering an invented image position', async () => {
    const fixtures = createDashboardVisualRestFixtures()
    server.use(
      ...createDashboardApiHandlers({
        ...fixtures,
        diagramsById: {
          [dashboardVisualDiagram._id]: {
            ...dashboardVisualDiagram,
            layout: {
              ...dashboardVisualLayout,
              images: [
                ...(dashboardVisualLayout.images ?? []),
                {
                  imageId: 'image-incomplete-geometry',
                  base64: dashboardVisualLayout.images?.[0]?.base64,
                  y: -120,
                  width: 240,
                  height: 80,
                },
              ],
            },
          },
        },
      }),
    )

    mount(`/hub/dashboard?diagramId=${dashboardVisualDiagram._id}&edgeId=edge-visual-1`)

    expect(await screen.findByTestId('dashboard-visual-surface')).toBeInTheDocument()
    expect(screen.getByText('Visual rendering issues: 3 recoverable')).toBeInTheDocument()
    expect(screen.queryByTestId('dashboard-visual-image-image-incomplete-geometry')).not.toBeInTheDocument()
  })

  it('reports incomplete saved connection point geometry without rendering an invented point', async () => {
    const fixtures = createDashboardVisualRestFixtures()
    server.use(
      ...createDashboardApiHandlers({
        ...fixtures,
        diagramsById: {
          [dashboardVisualDiagram._id]: {
            ...dashboardVisualDiagram,
            layout: {
              ...dashboardVisualLayout,
              connectionPoints: [
                ...(dashboardVisualLayout.connectionPoints ?? []),
                {
                  id: 'pin-incomplete-geometry',
                  imageId: 'image-boiler',
                },
              ],
              connections: [
                ...(dashboardVisualLayout.connections ?? []),
                {
                  id: 'connection-incomplete-point-derived',
                  fromPinId: 'pin-incomplete-geometry',
                  toPinId: 'pin-pump-in',
                  userModified: false,
                },
              ],
            },
          },
        },
      }),
    )

    mount(`/hub/dashboard?diagramId=${dashboardVisualDiagram._id}&edgeId=edge-visual-1`)

    expect(await screen.findByTestId('dashboard-visual-surface')).toBeInTheDocument()
    expect(screen.getByText('Visual rendering issues: 3 recoverable')).toBeInTheDocument()
    expect(screen.queryByTestId('dashboard-visual-point-pin-incomplete-geometry')).not.toBeInTheDocument()
    expect(screen.queryByTestId('dashboard-visual-connection-connection-incomplete-point-derived-0')).not.toBeInTheDocument()
  })

  it('renders live number and text telemetry inside the saved visual widgets and preserves it while reconnecting', async () => {
    mount(`/hub/dashboard?diagramId=${dashboardVisualDiagram._id}&edgeId=edge-visual-1`)

    await waitFor(() => {
      expect(runtimeHarness.getLastSubscribePayload()).toEqual({ edgeId: 'edge-visual-1' })
    })

    expect(await screen.findByTestId('dashboard-visual-surface')).toBeInTheDocument()
    const temperatureWidget = screen.getByTestId('dashboard-visual-widget-widget-temperature')
    const statusWidget = screen.getByTestId('dashboard-visual-widget-widget-status')
    const temperatureValue = within(temperatureWidget).getByText('0 C')
    const statusValue = within(statusWidget).getByText('Pending')
    expect(temperatureValue).toBeInTheDocument()
    expect(temperatureValue).toHaveAttribute('data-font-size', '24')
    expect(statusValue).toBeInTheDocument()
    expect(statusValue).toHaveAttribute('data-font-size', '16')

    act(() => {
      runtimeHarness.emitTelemetry(createDashboardTelemetryEventFixture({
        edgeId: 'edge-visual-1',
        readings: [
          {
            deviceId: 'boiler-1',
            metric: 'temperature',
            last: '72.4',
            ts: 1763895000000,
          },
          {
            deviceId: 'boiler-1',
            metric: 'status',
            last: 'Stable output',
            ts: 1763895000001,
          },
        ],
        serverTs: 1763895000500,
      }))
    })

    expect(within(temperatureWidget).getByText('72.4 C')).toBeInTheDocument()
    expect(within(statusWidget).getByText('Stable output')).toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Open diagnostics' }))
    const diagnosticsPanel = await screen.findByTestId('dashboard-diagnostics-panel')
    await user.click(within(diagnosticsPanel).getByRole('tab', { name: 'Bindings' }))
    expect(within(diagnosticsPanel).getByTestId('dashboard-runtime-widget-widget-temperature')).toHaveTextContent('Value: 72.4')
    expect(within(diagnosticsPanel).getByTestId('dashboard-runtime-widget-widget-status')).toHaveTextContent('Value: Stable output')

    act(() => {
      runtimeHarness.emitDisconnect()
    })

    await waitFor(() => {
      expect(
        screen.getByText('Transport reconnecting. Displaying last received values.'),
      ).toBeInTheDocument()
    })
    expect(within(temperatureWidget).getByText('72.4 C')).toBeInTheDocument()
    expect(within(statusWidget).getByText('Stable output')).toBeInTheDocument()
  })

  it('keeps led and unsupported future widgets visually present but non-operative through DashboardPage', async () => {
    mount(`/hub/dashboard?diagramId=${dashboardVisualDiagram._id}&edgeId=edge-visual-1`)

    await waitFor(() => {
      expect(runtimeHarness.getLastSubscribePayload()).toEqual({ edgeId: 'edge-visual-1' })
    })

    expect(await screen.findByTestId('dashboard-visual-surface')).toBeInTheDocument()

    const ledWidget = screen.getByTestId('dashboard-visual-widget-widget-alarm')
    const ledIndicator = screen.getByTestId('dashboard-visual-led-indicator-widget-alarm')
    const commandWidget = screen.getByTestId('dashboard-visual-widget-widget-command-toggle')
    const commandShell = screen.getByTestId('dashboard-visual-widget-shell-widget-command-toggle')

    expect(ledWidget).toHaveAttribute('data-listening', 'false')
    expect(ledIndicator).toHaveAttribute('data-x', '628')
    expect(ledIndicator).toHaveAttribute('data-y', '146')
    expect(ledIndicator).toHaveAttribute('data-radius', '18')
    expect(ledIndicator).toHaveAttribute('data-fill', '#64748b')
    expect(ledIndicator).toHaveAttribute('data-listening', 'false')

    expect(commandWidget).toHaveAttribute('data-listening', 'false')
    expect(commandShell).toHaveAttribute('data-x', '560')
    expect(commandShell).toHaveAttribute('data-y', '184')
    expect(commandShell).toHaveAttribute('data-width', '120')
    expect(commandShell).toHaveAttribute('data-height', '40')
    expect(commandShell).toHaveAttribute('data-listening', 'false')
    expect(screen.queryByRole('button', { name: 'Start Pump' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Command toggle widget-command-toggle' })).toBeDisabled()

    const emittedEventsBeforeInteraction = runtimeHarness.getEmittedEvents()
    expect(emittedEventsBeforeInteraction).toHaveLength(1)
    expect(emittedEventsBeforeInteraction[0]).toEqual({
      event: 'subscribe',
      payload: { edgeId: 'edge-visual-1' },
    })

    fireEvent.click(commandWidget)
    fireEvent.click(ledWidget)

    expect(runtimeHarness.getEmittedEvents()).toEqual(emittedEventsBeforeInteraction)
  })
})

describe('DashboardVisualSurface command suppression', () => {
  const runtimeLayout = normalizeDashboardRuntimeLayout({
    widgets: [
      {
        id: 'widget-slider-draft',
        type: 'slider',
        x: 24,
        y: 32,
        width: 160,
        height: 40,
      },
    ],
  })
  const viewportSize = { width: 320, height: 180 }
  const viewport = createDashboardInitialViewport(runtimeLayout.diagramBounds, viewportSize)

  function createSliderProjection(isExecutable: boolean): DashboardRuntimeProjection {
    return {
      metricValueByBindingKey: {
        'pump-1::flowRate': 50,
      },
      widgetValueById: {
        'widget-slider-draft': 50,
      },
      widgets: [
        {
          widgetId: 'widget-slider-draft',
          widgetType: 'slider',
          isBound: true,
          isSupported: true,
          value: 50,
          visualValue: '50',
          valueState: 'live',
          unitLabel: null,
        },
      ],
      commandAvailabilityByWidgetId: {
        'widget-slider-draft': {
          widgetId: 'widget-slider-draft',
          widgetType: 'slider',
          isExecutable,
          reason: isExecutable ? 'available' : 'missing-catalog-command',
          commandType: 'set_number',
          commandBinding: { widgetId: 'widget-slider-draft', deviceId: 'pump-1', commandType: 'set_number' },
          reportedWidgetBinding: isExecutable
            ? { widgetId: 'widget-slider-draft', deviceId: 'pump-1', metric: 'flowRate' }
            : null,
          catalogCommand: isExecutable
            ? {
              deviceId: 'pump-1',
              commandType: 'set_number',
              valueType: 'number',
              min: 0,
              max: 100,
              reportedMetric: 'flowRate',
              label: 'flowRate',
            }
            : null,
        },
      },
    }
  }

  it('drops slider draft values across unavailable and re-enabled command states', async () => {
    const onCommandCommit = vi.fn()
    const { rerender } = render(
      <DashboardVisualSurface
        runtimeLayout={runtimeLayout}
        runtimeProjection={createSliderProjection(true)}
        onCommandCommit={onCommandCommit}
        viewport={viewport}
        viewportSize={viewportSize}
        onPanViewport={vi.fn()}
      />,
    )

    const slider = screen.getByRole('slider', { name: 'Command slider widget-slider-draft' })
    expect(slider).toHaveValue('50')

    fireEvent.change(slider, { target: { value: '70' } })
    expect(slider).toHaveValue('70')

    rerender(
      <DashboardVisualSurface
        runtimeLayout={runtimeLayout}
        runtimeProjection={createSliderProjection(false)}
        onCommandCommit={onCommandCommit}
        viewport={viewport}
        viewportSize={viewportSize}
        onPanViewport={vi.fn()}
      />,
    )

    const unavailableSlider = screen.getByRole('slider', { name: 'Command slider widget-slider-draft' })
    expect(unavailableSlider).toBeDisabled()
    expect(unavailableSlider).toHaveValue('50')

    rerender(
      <DashboardVisualSurface
        runtimeLayout={runtimeLayout}
        runtimeProjection={createSliderProjection(true)}
        onCommandCommit={onCommandCommit}
        viewport={viewport}
        viewportSize={viewportSize}
        onPanViewport={vi.fn()}
      />,
    )

    const reenabledSlider = screen.getByRole('slider', { name: 'Command slider widget-slider-draft' })
    await waitFor(() => {
      expect(reenabledSlider).toHaveValue('50')
    })

    fireEvent.pointerUp(reenabledSlider)
    expect(onCommandCommit).not.toHaveBeenCalled()
  })
})
