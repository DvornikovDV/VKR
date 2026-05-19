import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import type { ComponentProps, ComponentType } from 'react'
import {
  dashboardVisualCatalog,
  dashboardVisualAlarmFixtureAnchor,
  createDashboardVisualRestFixtures,
  dashboardVisualDiagram,
  dashboardVisualLayout,
} from '../fixtures/dashboardVisualLayout'
import { createDashboardApiHandlers } from '../mocks/handlers'
import { server } from '../mocks/server'
import {
  createDashboardActiveUnacknowledgedAlarmIncidentProjectionFixture,
  createDashboardClosedAlarmIncidentProjectionFixture,
  createDashboardVisualDangerAlarmIncidentProjectionFixture,
  createDashboardVisualWarningAlarmIncidentProjectionFixture,
  createDashboardTelemetryEventFixture,
  dashboardRuntimeSocketHarness as runtimeHarness,
} from './helpers/mockDashboardRuntimeSocket'
import { userHubRouteChildren } from '@/app/userHubRoutes'
import {
  DASHBOARD_ALARM_VISUAL_BADGE_RADIUS,
  DASHBOARD_ALARM_VISUAL_COLORS,
  DASHBOARD_ALARM_VISUAL_IMAGE_BADGE_OFFSET,
  DASHBOARD_ALARM_VISUAL_OUTLINE_PADDING,
  DASHBOARD_ALARM_VISUAL_TEST_IDS,
  DashboardVisualSurface,
} from '@/features/dashboard/components/DashboardVisualSurface'
import { normalizeDashboardRuntimeLayout } from '@/features/dashboard/model/runtimeLayout'
import { createDashboardInitialViewport } from '@/features/dashboard/model/viewport'
import type {
  DashboardAlarmVisualState,
  DashboardRuntimeProjection,
} from '@/features/dashboard/model/types'
import { createDashboardBindingKey } from '@/features/dashboard/model/selectors'
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

afterEach(() => {
  vi.useRealTimers()
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

  it('projects REST-loaded selected-edge incidents into widget and image alarm overlay anchors through DashboardRuntimeSurface', async () => {
    server.use(
      http.get('/api/edge-servers/edge-visual-1/alarm-incidents', () =>
        HttpResponse.json({
          status: 'success',
          data: {
            incidents: [
              createDashboardVisualWarningAlarmIncidentProjectionFixture(),
              createDashboardVisualDangerAlarmIncidentProjectionFixture(),
              createDashboardVisualDangerAlarmIncidentProjectionFixture({
                incidentId: 'incident-visual-off-edge-status',
                edgeId: 'edge-other-1',
              }),
            ],
            page: 1,
            limit: 50,
            total: 3,
            hasNextPage: false,
          },
        }),
      ),
    )

    mount(`/hub/dashboard?diagramId=${dashboardVisualDiagram._id}&edgeId=edge-visual-1`)

    await waitFor(() => {
      expect(runtimeHarness.getLastSubscribePayload()).toEqual({ edgeId: 'edge-visual-1' })
    })

    expect(await screen.findByTestId('dashboard-visual-surface')).toBeInTheDocument()

    const warningWidget = screen.getByTestId(
      `dashboard-visual-widget-${dashboardVisualAlarmFixtureAnchor.warningWidgetId}`,
    )
    const warningOutline = await screen.findByTestId(
      DASHBOARD_ALARM_VISUAL_TEST_IDS.widgetOutline(dashboardVisualAlarmFixtureAnchor.warningWidgetId),
    )
    expect(warningWidget).toContainElement(warningOutline)
    expect(
      screen.getByTestId(
        DASHBOARD_ALARM_VISUAL_TEST_IDS.widgetBadgeCount(dashboardVisualAlarmFixtureAnchor.warningWidgetId),
      ),
    ).toHaveTextContent('1')

    const dangerWidget = screen.getByTestId(
      `dashboard-visual-widget-${dashboardVisualAlarmFixtureAnchor.dangerWidgetId}`,
    )
    const dangerOutline = await screen.findByTestId(
      DASHBOARD_ALARM_VISUAL_TEST_IDS.widgetOutline(dashboardVisualAlarmFixtureAnchor.dangerWidgetId),
    )
    expect(dangerWidget).toContainElement(dangerOutline)
    expect(dangerOutline).toHaveAttribute('data-stroke', DASHBOARD_ALARM_VISUAL_COLORS.danger.outline)
    expect(
      screen.getByTestId(
        DASHBOARD_ALARM_VISUAL_TEST_IDS.widgetBadgeCount(dashboardVisualAlarmFixtureAnchor.dangerWidgetId),
      ),
    ).toHaveTextContent('1')

    const imageBadge = screen.getByTestId(
      DASHBOARD_ALARM_VISUAL_TEST_IDS.imageBadge(dashboardVisualAlarmFixtureAnchor.sharedImageId),
    )
    expect(screen.getByTestId('dashboard-visual-grid-layer')).toContainElement(imageBadge)
    expect(
      screen.getByTestId(
        DASHBOARD_ALARM_VISUAL_TEST_IDS.imageBadgeCount(dashboardVisualAlarmFixtureAnchor.sharedImageId),
      ),
    ).toHaveTextContent('2')
  })

  it('keeps closed and unmatched REST-loaded incidents out of diagram overlays while journal ACK stays wired separately', async () => {
    const closedMappedIncident = createDashboardClosedAlarmIncidentProjectionFixture({
      incidentId: 'incident-visual-closed-temperature',
      edgeId: dashboardVisualAlarmFixtureAnchor.edgeId,
      deviceId: dashboardVisualAlarmFixtureAnchor.warningDeviceId,
      metric: dashboardVisualAlarmFixtureAnchor.warningMetric,
      rule: {
        severity: 'warning',
        label: 'Closed visual temperature',
      },
    })
    const unmatchedIncident = createDashboardActiveUnacknowledgedAlarmIncidentProjectionFixture({
      incidentId: 'incident-visual-unmatched-pressure',
      edgeId: dashboardVisualAlarmFixtureAnchor.edgeId,
      deviceId: dashboardVisualAlarmFixtureAnchor.warningDeviceId,
      metric: 'pressure',
      ruleId: 'rule-visual-unmatched-pressure',
      rule: {
        ruleId: 'rule-visual-unmatched-pressure',
        severity: 'danger',
        label: 'Unmatched visual pressure',
      },
    })
    const ackRequests: Array<{ edgeId: string; incidentId: string }> = []

    server.use(
      http.get('/api/edge-servers/edge-visual-1/alarm-incidents', () =>
        HttpResponse.json({
          status: 'success',
          data: {
            incidents: [closedMappedIncident, unmatchedIncident],
            page: 1,
            limit: 50,
            total: 2,
            hasNextPage: false,
          },
        }),
      ),
      http.post('/api/edge-servers/:edgeId/alarm-incidents/:incidentId/ack', ({ params }) => {
        ackRequests.push({
          edgeId: String(params.edgeId),
          incidentId: String(params.incidentId),
        })

        return HttpResponse.json({
          status: 'success',
          data: {
            incident: {
              ...unmatchedIncident,
              lifecycleState: 'active_acknowledged',
              isAcknowledged: true,
              acknowledgedAt: '2026-05-09T10:12:00.000Z',
              acknowledgedBy: userSession.id,
              updatedAt: '2026-05-09T10:12:00.000Z',
            },
          },
        })
      }),
    )

    mount(`/hub/dashboard?diagramId=${dashboardVisualDiagram._id}&edgeId=edge-visual-1`)

    await waitFor(() => {
      expect(runtimeHarness.getLastSubscribePayload()).toEqual({ edgeId: 'edge-visual-1' })
    })

    expect(await screen.findByTestId('dashboard-visual-surface')).toBeInTheDocument()

    expect(
      screen.queryByTestId(
        DASHBOARD_ALARM_VISUAL_TEST_IDS.widgetOutline(dashboardVisualAlarmFixtureAnchor.warningWidgetId),
      ),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByTestId(
        DASHBOARD_ALARM_VISUAL_TEST_IDS.widgetBadge(dashboardVisualAlarmFixtureAnchor.warningWidgetId),
      ),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByTestId(
        DASHBOARD_ALARM_VISUAL_TEST_IDS.widgetOutline(dashboardVisualAlarmFixtureAnchor.dangerWidgetId),
      ),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByTestId(
        DASHBOARD_ALARM_VISUAL_TEST_IDS.imageBadge(dashboardVisualAlarmFixtureAnchor.sharedImageId),
      ),
    ).not.toBeInTheDocument()

    const unmatchedRow = await screen.findByTestId(
      'dashboard-alarm-incident-row-incident-visual-unmatched-pressure',
    )
    const ackButton = within(unmatchedRow).getByRole('button', {
      name: 'Acknowledge incident Unmatched visual pressure',
    })

    await userEvent.setup().click(ackButton)

    await waitFor(() => {
      expect(ackRequests).toEqual([
        {
          edgeId: dashboardVisualAlarmFixtureAnchor.edgeId,
          incidentId: unmatchedIncident.incidentId,
        },
      ])
    })
    expect(
      screen.queryByTestId(
        DASHBOARD_ALARM_VISUAL_TEST_IDS.imageBadge(dashboardVisualAlarmFixtureAnchor.sharedImageId),
      ),
    ).not.toBeInTheDocument()
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

describe('DashboardVisualSurface alarm overlay anchors', () => {
  const runtimeLayout = normalizeDashboardRuntimeLayout(dashboardVisualLayout)
  const viewportSize = { width: 960, height: 540 }
  const viewport = createDashboardInitialViewport(runtimeLayout.diagramBounds, viewportSize)
  type DashboardVisualSurfacePropsWithAlarm = ComponentProps<typeof DashboardVisualSurface> & {
    alarmVisualState?: DashboardAlarmVisualState
  }
  const AlarmCapableDashboardVisualSurface =
    DashboardVisualSurface as ComponentType<DashboardVisualSurfacePropsWithAlarm>

  const alarmVisualState = {
    widgetById: {
      [dashboardVisualAlarmFixtureAnchor.warningWidgetId]: {
        widgetId: dashboardVisualAlarmFixtureAnchor.warningWidgetId,
        count: 1,
        severity: 'warning',
        lifecycleMode: 'active_unacknowledged',
        incidents: [
          {
            incidentId: 'incident-temperature-warning-active',
            edgeId: dashboardVisualAlarmFixtureAnchor.edgeId,
            deviceId: dashboardVisualAlarmFixtureAnchor.warningDeviceId,
            metric: dashboardVisualAlarmFixtureAnchor.warningMetric,
            severity: 'warning',
            lifecycleMode: 'active_unacknowledged',
          },
        ],
      },
      [dashboardVisualAlarmFixtureAnchor.dangerWidgetId]: {
        widgetId: dashboardVisualAlarmFixtureAnchor.dangerWidgetId,
        count: 2,
        severity: 'danger',
        lifecycleMode: 'active_acknowledged',
        incidents: [
          {
            incidentId: 'incident-status-danger-acknowledged',
            edgeId: dashboardVisualAlarmFixtureAnchor.edgeId,
            deviceId: dashboardVisualAlarmFixtureAnchor.dangerDeviceId,
            metric: dashboardVisualAlarmFixtureAnchor.dangerMetric,
            severity: 'danger',
            lifecycleMode: 'active_acknowledged',
          },
          {
            incidentId: 'incident-status-warning-cleared',
            edgeId: dashboardVisualAlarmFixtureAnchor.edgeId,
            deviceId: dashboardVisualAlarmFixtureAnchor.dangerDeviceId,
            metric: dashboardVisualAlarmFixtureAnchor.dangerMetric,
            severity: 'warning',
            lifecycleMode: 'cleared_unacknowledged',
          },
        ],
      },
    },
    imageById: {
      [dashboardVisualAlarmFixtureAnchor.sharedImageId]: {
        imageId: dashboardVisualAlarmFixtureAnchor.sharedImageId,
        count: 3,
        severity: 'danger',
        lifecycleMode: 'active_unacknowledged',
        widgetIds: [
          dashboardVisualAlarmFixtureAnchor.warningWidgetId,
          dashboardVisualAlarmFixtureAnchor.dangerWidgetId,
        ],
        bindingKeys: [
          createDashboardBindingKey(
            dashboardVisualAlarmFixtureAnchor.warningDeviceId,
            dashboardVisualAlarmFixtureAnchor.warningMetric,
          ),
          createDashboardBindingKey(
            dashboardVisualAlarmFixtureAnchor.dangerDeviceId,
            dashboardVisualAlarmFixtureAnchor.dangerMetric,
          ),
        ],
        incidents: [
          {
            incidentId: 'incident-temperature-warning-active',
            edgeId: dashboardVisualAlarmFixtureAnchor.edgeId,
            deviceId: dashboardVisualAlarmFixtureAnchor.warningDeviceId,
            metric: dashboardVisualAlarmFixtureAnchor.warningMetric,
            severity: 'warning',
            lifecycleMode: 'active_unacknowledged',
          },
          {
            incidentId: 'incident-status-danger-acknowledged',
            edgeId: dashboardVisualAlarmFixtureAnchor.edgeId,
            deviceId: dashboardVisualAlarmFixtureAnchor.dangerDeviceId,
            metric: dashboardVisualAlarmFixtureAnchor.dangerMetric,
            severity: 'danger',
            lifecycleMode: 'active_acknowledged',
          },
          {
            incidentId: 'incident-status-warning-cleared',
            edgeId: dashboardVisualAlarmFixtureAnchor.edgeId,
            deviceId: dashboardVisualAlarmFixtureAnchor.dangerDeviceId,
            metric: dashboardVisualAlarmFixtureAnchor.dangerMetric,
            severity: 'warning',
            lifecycleMode: 'cleared_unacknowledged',
          },
        ],
      },
    },
  } satisfies DashboardAlarmVisualState

  function renderSurfaceWithAlarmState(nextAlarmVisualState: DashboardAlarmVisualState = alarmVisualState) {
    render(
      <AlarmCapableDashboardVisualSurface
        runtimeLayout={runtimeLayout}
        runtimeProjection={null}
        alarmVisualState={nextAlarmVisualState}
        viewport={viewport}
        viewportSize={viewportSize}
        onPanViewport={vi.fn()}
      />,
    )
  }

  it('renders stable widget alarm outline and compact badge anchors from supplied visual state', () => {
    vi.useFakeTimers()
    renderSurfaceWithAlarmState()

    const workspace = screen.getByTestId('dashboard-visual-workspace')
    expect(workspace).toHaveAttribute('data-scale-x', '1')
    expect(workspace).toHaveAttribute('data-scale-y', '1')

    const temperatureWidget = screen.getByTestId(
      `dashboard-visual-widget-${dashboardVisualAlarmFixtureAnchor.warningWidgetId}`,
    )
    const temperatureOutline = screen.getByTestId(
      DASHBOARD_ALARM_VISUAL_TEST_IDS.widgetOutline(dashboardVisualAlarmFixtureAnchor.warningWidgetId),
    )
    expect(temperatureWidget).toContainElement(temperatureOutline)
    expect(temperatureOutline).toHaveAttribute('data-x', String(96 - DASHBOARD_ALARM_VISUAL_OUTLINE_PADDING))
    expect(temperatureOutline).toHaveAttribute('data-y', String(92 - DASHBOARD_ALARM_VISUAL_OUTLINE_PADDING))
    expect(temperatureOutline).toHaveAttribute('data-width', String(112 + DASHBOARD_ALARM_VISUAL_OUTLINE_PADDING * 2))
    expect(temperatureOutline).toHaveAttribute('data-height', String(52 + DASHBOARD_ALARM_VISUAL_OUTLINE_PADDING * 2))
    expect(temperatureOutline).toHaveAttribute('data-stroke', DASHBOARD_ALARM_VISUAL_COLORS.warning.outline)
    expect(temperatureOutline).toHaveAttribute('data-opacity', '0.62')

    const temperatureBadge = screen.getByTestId(
      DASHBOARD_ALARM_VISUAL_TEST_IDS.widgetBadge(dashboardVisualAlarmFixtureAnchor.warningWidgetId),
    )
    expect(temperatureWidget).toContainElement(temperatureBadge)
    expect(temperatureBadge).toHaveAttribute('data-x', '197')
    expect(temperatureBadge).toHaveAttribute('data-y', '81')
    expect(temperatureBadge).toHaveAttribute('data-opacity', '0.62')
    expect(
      screen.getByTestId(
        DASHBOARD_ALARM_VISUAL_TEST_IDS.widgetBadgeCount(dashboardVisualAlarmFixtureAnchor.warningWidgetId),
      ),
    ).toHaveTextContent('1')

    const statusOutline = screen.getByTestId(
      DASHBOARD_ALARM_VISUAL_TEST_IDS.widgetOutline(dashboardVisualAlarmFixtureAnchor.dangerWidgetId),
    )
    expect(statusOutline).toHaveAttribute('data-opacity', '0.88')

    act(() => {
      vi.advanceTimersByTime(700)
    })

    expect(temperatureOutline).toHaveAttribute('data-opacity', '1')
    expect(temperatureBadge).toHaveAttribute('data-opacity', '1')
    expect(statusOutline).toHaveAttribute('data-opacity', '0.88')
  })

  it('keeps single image alarm aggregates hidden while widget badge remains visible', () => {
    const widgetAlarmState = alarmVisualState.widgetById[dashboardVisualAlarmFixtureAnchor.warningWidgetId]

    renderSurfaceWithAlarmState({
      widgetById: {
        [dashboardVisualAlarmFixtureAnchor.warningWidgetId]: widgetAlarmState,
      },
      imageById: {
        [dashboardVisualAlarmFixtureAnchor.sharedImageId]: {
          imageId: dashboardVisualAlarmFixtureAnchor.sharedImageId,
          count: 1,
          severity: 'warning',
          lifecycleMode: 'active_unacknowledged',
          widgetIds: [dashboardVisualAlarmFixtureAnchor.warningWidgetId],
          bindingKeys: [
            createDashboardBindingKey(
              dashboardVisualAlarmFixtureAnchor.warningDeviceId,
              dashboardVisualAlarmFixtureAnchor.warningMetric,
            ),
          ],
          incidents: widgetAlarmState.incidents,
        },
      },
    })

    expect(
      screen.getByTestId(
        DASHBOARD_ALARM_VISUAL_TEST_IDS.widgetBadgeCount(dashboardVisualAlarmFixtureAnchor.warningWidgetId),
      ),
    ).toHaveTextContent('1')
    expect(
      screen.queryByTestId(
        DASHBOARD_ALARM_VISUAL_TEST_IDS.imageBadge(dashboardVisualAlarmFixtureAnchor.sharedImageId),
      ),
    ).not.toBeInTheDocument()
  })

  it('keeps same-widget image alarm aggregates hidden while widget badge shows the full count', () => {
    const firstIncident =
      alarmVisualState.widgetById[dashboardVisualAlarmFixtureAnchor.warningWidgetId].incidents[0]
    const secondIncident = {
      ...firstIncident,
      incidentId: 'incident-temperature-warning-second-active',
    }

    renderSurfaceWithAlarmState({
      widgetById: {
        [dashboardVisualAlarmFixtureAnchor.warningWidgetId]: {
          widgetId: dashboardVisualAlarmFixtureAnchor.warningWidgetId,
          count: 2,
          severity: 'warning',
          lifecycleMode: 'active_unacknowledged',
          incidents: [firstIncident, secondIncident],
        },
      },
      imageById: {
        [dashboardVisualAlarmFixtureAnchor.sharedImageId]: {
          imageId: dashboardVisualAlarmFixtureAnchor.sharedImageId,
          count: 2,
          severity: 'warning',
          lifecycleMode: 'active_unacknowledged',
          widgetIds: [dashboardVisualAlarmFixtureAnchor.warningWidgetId],
          bindingKeys: [
            createDashboardBindingKey(
              dashboardVisualAlarmFixtureAnchor.warningDeviceId,
              dashboardVisualAlarmFixtureAnchor.warningMetric,
            ),
          ],
          incidents: [firstIncident, secondIncident],
        },
      },
    })

    expect(
      screen.getByTestId(
        DASHBOARD_ALARM_VISUAL_TEST_IDS.widgetBadgeCount(dashboardVisualAlarmFixtureAnchor.warningWidgetId),
      ),
    ).toHaveTextContent('2')
    expect(
      screen.queryByTestId(
        DASHBOARD_ALARM_VISUAL_TEST_IDS.imageBadge(dashboardVisualAlarmFixtureAnchor.sharedImageId),
      ),
    ).not.toBeInTheDocument()
  })

  it('renders stable aggregate image outside top-right badge anchors from supplied visual state', () => {
    vi.useFakeTimers()
    renderSurfaceWithAlarmState()

    const boilerImage = screen.getByTestId(
      `dashboard-visual-image-${dashboardVisualAlarmFixtureAnchor.sharedImageId}`,
    )
    const imageBadge = screen.getByTestId(
      DASHBOARD_ALARM_VISUAL_TEST_IDS.imageBadge(dashboardVisualAlarmFixtureAnchor.sharedImageId),
    )
    expect(screen.getByTestId('dashboard-visual-grid-layer')).toContainElement(imageBadge)
    expect(boilerImage).toBeInTheDocument()
    expect(imageBadge).toHaveAttribute('data-x', String(40 + 360 + DASHBOARD_ALARM_VISUAL_IMAGE_BADGE_OFFSET))
    expect(imageBadge).toHaveAttribute('data-y', String(32 - DASHBOARD_ALARM_VISUAL_BADGE_RADIUS))
    expect(imageBadge).toHaveAttribute('data-opacity', '0.62')
    expect(
      screen.getByTestId(
        DASHBOARD_ALARM_VISUAL_TEST_IDS.imageBadgeCount(dashboardVisualAlarmFixtureAnchor.sharedImageId),
      ),
    ).toHaveTextContent('3')

    act(() => {
      vi.advanceTimersByTime(700)
    })

    expect(imageBadge).toHaveAttribute('data-opacity', '1')
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
