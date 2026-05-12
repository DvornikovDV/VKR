import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { server } from '../mocks/server'
import {
  createDashboardVisualRestFixtures,
  dashboardVisualBindingProfile,
  dashboardVisualCatalog,
  dashboardVisualDiagram,
  dashboardVisualLayout,
} from '../fixtures/dashboardVisualLayout'
import {
  createDashboardApiFixtures,
  createDashboardApiHandlers,
  type DashboardRestFixtures,
} from '../mocks/handlers'
import {
  createDashboardActiveUnacknowledgedAlarmIncidentProjectionFixture,
  createDashboardAlarmIncidentChangedEventFixture,
  createDashboardClosedAlarmIncidentChangedEventFixture,
  createDashboardTelemetryEventFixture,
  createDashboardUnclosedAlarmIncidentChangedEventFixture,
  dashboardRuntimeClientHarness as runtimeHarness,
} from './helpers/mockDashboardRuntimeSocket'
import { userHubRouteChildren } from '@/app/userHubRoutes'
import {
  DISPATCH_DEFAULT_PATH,
  DISPATCH_LEGACY_DASHBOARD_PATH,
} from '@/features/dispatch/model/routes'
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

function dashboardPath(search = ''): string {
  return `${DISPATCH_DEFAULT_PATH}${search}`
}

function legacyDashboardPath(search = ''): string {
  return `${DISPATCH_LEGACY_DASHBOARD_PATH}${search}`
}

function setupDashboardApiFixtures(overrides: Partial<DashboardRestFixtures> = {}) {
  const fixtures = createDashboardApiFixtures(overrides)
  server.use(
    ...createDashboardApiHandlers(fixtures),
    http.get('/api/edge-servers/:edgeId/catalog', ({ params }) =>
      HttpResponse.json({
        status: 'success',
        data:
          String(params.edgeId) === dashboardVisualCatalog.edgeServerId
            ? dashboardVisualCatalog
            : { edgeServerId: String(params.edgeId), telemetry: [], commands: [] },
      }),
    ),
    http.get('/api/edge-servers/:edgeId/alarm-incidents', () =>
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

function getNumericDataAttribute(element: HTMLElement, name: string): number {
  const value = element.getAttribute(name)
  if (value === null) {
    throw new Error(`Missing ${name} attribute.`)
  }

  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ${name} attribute: ${value}`)
  }

  return parsed
}

beforeEach(() => {
  runtimeHarness.reset()
  act(() => {
    useAuthStore.setState({ session: null, isAuthenticated: false })
    useAuthStore.getState().setSession(userSession)
  })
})

describe('DashboardPage (US1)', () => {
  it('preserves legacy route prefill while reaching the Dispatch Dashboard route', async () => {
    setupDashboardApiFixtures()

    const router = mount(legacyDashboardPath('?diagramId=diagram-1&edgeId=edge-1'))

    expect(await screen.findByLabelText('Diagram')).toHaveValue('diagram-1')
    expect(screen.getByLabelText('Edge Server')).toHaveValue('edge-1')
    expect(router.state.location.pathname).toBe(DISPATCH_DEFAULT_PATH)
    expect(router.state.location.search).toBe('?diagramId=diagram-1&edgeId=edge-1')
  })

  it('renders a realtime alarm incident row and acknowledges it only after Cloud confirmation', async () => {
    setupDashboardApiFixtures(createDashboardVisualRestFixtures())
    const edgeId = 'edge-visual-1'
    const ackRequests: Array<{
      url: string
      method: string
      edgeId: string
      incidentId: string
      body: string
    }> = []
    let confirmAck: () => void = () => { }

    server.use(
      http.post('/api/edge-servers/:edgeId/alarm-incidents/:incidentId/ack', async ({ params, request }) => {
        ackRequests.push({
          url: new URL(request.url).pathname,
          method: request.method,
          edgeId: String(params.edgeId),
          incidentId: String(params.incidentId),
          body: await request.text(),
        })

        return new Promise((resolve) => {
          confirmAck = () =>
            resolve(
              HttpResponse.json({
                status: 'success',
                data: {
                  incident: {
                    incidentId: 'incident-pressure-1',
                    edgeId,
                    sourceId: 'source-1',
                    deviceId: 'compressor-7',
                    metric: 'pressure',
                    ruleId: 'rule-pressure-high',
                    lifecycleState: 'active_acknowledged',
                    isActive: true,
                    isAcknowledged: true,
                    activatedAt: '2026-05-09T09:25:00.000Z',
                    clearedAt: null,
                    acknowledgedAt: '2026-05-09T09:26:00.000Z',
                    acknowledgedBy: 'user-1',
                    latestValue: 42.5,
                    latestTs: 1778318730000,
                    latestDetectedAt: 1778318730000,
                    createdAt: '2026-05-09T09:25:00.000Z',
                    updatedAt: '2026-05-09T09:26:00.000Z',
                    rule: {
                      ruleId: 'rule-pressure-high',
                      ruleRevision: 'rev-1',
                      conditionType: 'high',
                      triggerThreshold: 40,
                      clearThreshold: 35,
                      expectedValue: null,
                      severity: 'danger',
                      label: 'Compressor pressure high',
                    },
                  },
                },
              }),
            )
        })
      }),
    )

    mount(dashboardPath(`?diagramId=${dashboardVisualDiagram._id}&edgeId=${edgeId}`))

    expect(await screen.findByTestId('dashboard-visual-surface')).toBeInTheDocument()
    await waitFor(() => {
      expect(runtimeHarness.startSession).toHaveBeenCalledWith(
        expect.objectContaining({ edgeId }),
      )
    })

    const journalPanel = screen.getByTestId('dashboard-alarm-journal-panel')
    await waitFor(() => {
      expect(within(journalPanel).getByText(/no unclosed alarm incidents/i)).toBeInTheDocument()
    })
    expect(within(journalPanel).queryByText(/no incidents/i)).not.toBeInTheDocument()
    expect(screen.getByTestId('dashboard-visual-surface')).toBeInTheDocument()

    act(() => {
      runtimeHarness.emitAlarmIncidentChanged(
        createDashboardAlarmIncidentChangedEventFixture({
          edgeId,
          incident: {
            incidentId: 'incident-pressure-1',
            edgeId,
            deviceId: 'compressor-7',
            metric: 'pressure',
            ruleId: 'rule-pressure-high',
            isActive: true,
            isAcknowledged: false,
            activatedAt: '2026-05-09T09:25:00.000Z',
            latestDetectedAt: 1778318730000,
            updatedAt: '2026-05-09T09:25:30.000Z',
            rule: {
              severity: 'danger',
              label: 'Compressor pressure high',
            },
          },
        }),
      )
      runtimeHarness.emitAlarmIncidentChanged(
        createDashboardAlarmIncidentChangedEventFixture({
          edgeId,
          incident: {
            incidentId: 'incident-temperature-2',
            edgeId,
            deviceId: 'compressor-7',
            metric: 'temperature',
            ruleId: 'rule-temperature-high',
            isActive: true,
            isAcknowledged: false,
            activatedAt: '2026-05-09T09:20:00.000Z',
            latestDetectedAt: 1778318400000,
            updatedAt: '2026-05-09T09:20:00.000Z',
            rule: {
              severity: 'warning',
              label: 'Compressor temperature high',
            },
          },
        }),
      )
    })

    const row = await screen.findByTestId('dashboard-alarm-incident-row-incident-pressure-1')
    const otherRow = await screen.findByTestId('dashboard-alarm-incident-row-incident-temperature-2')
    expect(within(row).getByText('danger')).toBeInTheDocument()
    expect(within(row).getByText('Active Unacknowledged')).toBeInTheDocument()
    expect(within(row).getByText('2026-05-09T09:25:30.000Z')).toBeInTheDocument()
    expect(within(row).getByText('Compressor pressure high')).toBeInTheDocument()
    const ackButton = within(row).getByRole('button', {
      name: 'Acknowledge incident Compressor pressure high',
    })
    expect(ackButton).toBeInTheDocument()
    expect(screen.getByTestId('dashboard-visual-surface')).toBeInTheDocument()

    await userEvent.setup().click(ackButton)

    await waitFor(() => {
      expect(ackRequests).toHaveLength(1)
    })
    expect(ackRequests[0]).toEqual({
      url: '/api/edge-servers/edge-visual-1/alarm-incidents/incident-pressure-1/ack',
      method: 'POST',
      edgeId,
      incidentId: 'incident-pressure-1',
      body: '',
    })
    expect(within(row).getByRole('button', { name: 'Acknowledge incident Compressor pressure high' })).toBeDisabled()
    expect(
      within(otherRow).getByRole('button', { name: 'Acknowledge incident Compressor temperature high' }),
    ).not.toBeDisabled()
    expect(within(row).getByText('Active Unacknowledged')).toBeInTheDocument()
    expect(within(row).queryByText('Active Acknowledged')).not.toBeInTheDocument()

    await act(async () => {
      confirmAck()
    })

    await waitFor(() => {
      expect(within(row).getByText('Active Acknowledged')).toBeInTheDocument()
    })
    expect(within(row).queryByRole('button', { name: 'Acknowledge incident Compressor pressure high' })).not.toBeInTheDocument()
    expect(within(otherRow).getByText('Active Unacknowledged')).toBeInTheDocument()
    expect(
      within(otherRow).getByRole('button', { name: 'Acknowledge incident Compressor temperature high' }),
    ).toBeInTheDocument()
  })

  it('renders REST-loaded incidents on dashboard reload and converges realtime and ACK updates on one enriched row', async () => {
    setupDashboardApiFixtures(createDashboardVisualRestFixtures())
    const edgeId = 'edge-visual-1'
    const incidentId = 'incident-pressure-restored'
    const restoredIncident = createDashboardActiveUnacknowledgedAlarmIncidentProjectionFixture({
      incidentId,
      edgeId,
      sourceId: 'source-pressure',
      deviceId: 'compressor-7',
      metric: 'pressure',
      ruleId: 'rule-pressure-high',
      activatedAt: '2026-05-09T09:25:00.000Z',
      latestValue: 42.5,
      latestTs: 1778318730000,
      latestDetectedAt: 1778318730000,
      updatedAt: '2026-05-09T09:25:30.000Z',
      rule: {
        ruleId: 'rule-pressure-high',
        ruleRevision: 'rev-1',
        conditionType: 'high',
        triggerThreshold: 40,
        clearThreshold: 35,
        expectedValue: null,
        severity: 'danger',
        label: 'Compressor pressure high',
      },
    })
    const listRequests: Array<{ edgeId: string; query: string }> = []
    const ackRequests: Array<{ edgeId: string; incidentId: string }> = []

    server.use(
      http.get('/api/edge-servers/:edgeId/alarm-incidents', ({ params, request }) => {
        listRequests.push({
          edgeId: String(params.edgeId),
          query: new URL(request.url).search,
        })

        return HttpResponse.json({
          status: 'success',
          data: {
            incidents: [restoredIncident],
            page: 1,
            limit: 50,
            total: 1,
            hasNextPage: false,
          },
        })
      }),
      http.post('/api/edge-servers/:edgeId/alarm-incidents/:incidentId/ack', ({ params }) => {
        ackRequests.push({
          edgeId: String(params.edgeId),
          incidentId: String(params.incidentId),
        })

        return HttpResponse.json({
          status: 'success',
          data: {
            incident: {
              ...restoredIncident,
              lifecycleState: 'active_acknowledged',
              isAcknowledged: true,
              acknowledgedAt: '2026-05-09T09:27:00.000Z',
              acknowledgedBy: 'user-1',
              updatedAt: '2026-05-09T09:27:00.000Z',
            },
          },
        })
      }),
    )

    mount(dashboardPath(`?diagramId=${dashboardVisualDiagram._id}&edgeId=${edgeId}`))

    expect(await screen.findByTestId('dashboard-visual-surface')).toBeInTheDocument()
    await waitFor(() => {
      expect(runtimeHarness.startSession).toHaveBeenCalledWith(
        expect.objectContaining({ edgeId }),
      )
      expect(listRequests).toEqual([
        {
          edgeId,
          query: '?state=unclosed&page=1&limit=50&sort=latest&order=desc',
        },
      ])
    })

    const row = await screen.findByTestId(`dashboard-alarm-incident-row-${incidentId}`)
    expect(within(row).getByText('Compressor pressure high')).toBeInTheDocument()
    expect(within(row).getByText('compressor-7 / pressure')).toBeInTheDocument()
    expect(
      within(row).getByText('High condition: latest 42.5; trigger 40; clear 35'),
    ).toBeInTheDocument()
    expect(within(row).getByText('danger')).toBeInTheDocument()
    expect(within(row).getByText('Active Unacknowledged')).toBeInTheDocument()
    expect(within(row).getByText('2026-05-09T09:25:00.000Z')).toBeInTheDocument()
    expect(within(row).getByText('2026-05-09T09:25:30.000Z')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByTestId('dashboard-alarm-red-light-count')).toHaveTextContent('1')
    })
    expect(screen.getAllByTestId(`dashboard-alarm-incident-row-${incidentId}`)).toHaveLength(1)

    act(() => {
      runtimeHarness.emitAlarmIncidentChanged(
        createDashboardAlarmIncidentChangedEventFixture({
          edgeId,
          incident: {
            ...restoredIncident,
            latestValue: 45,
            latestDetectedAt: 1778318760000,
            updatedAt: '2026-05-09T09:26:00.000Z',
          },
        }),
      )
    })

    await waitFor(() => {
      expect(screen.getAllByTestId(`dashboard-alarm-incident-row-${incidentId}`)).toHaveLength(1)
      expect(
        within(row).getByText('High condition: latest 45; trigger 40; clear 35'),
      ).toBeInTheDocument()
      expect(within(row).getByText('2026-05-09T09:26:00.000Z')).toBeInTheDocument()
    })

    await userEvent.setup().click(
      within(row).getByRole('button', {
        name: 'Acknowledge incident Compressor pressure high',
      }),
    )

    await waitFor(() => {
      expect(ackRequests).toEqual([{ edgeId, incidentId }])
      expect(screen.getAllByTestId(`dashboard-alarm-incident-row-${incidentId}`)).toHaveLength(1)
      expect(within(row).getByText('Active Acknowledged')).toBeInTheDocument()
      expect(
        within(row).getByText('High condition: latest 45; trigger 40; clear 35'),
      ).toBeInTheDocument()
      expect(
        within(row).queryByText('High condition: latest 42.5; trigger 40; clear 35'),
      ).not.toBeInTheDocument()
      expect(within(row).getAllByText('2026-05-09T09:27:00.000Z').length).toBeGreaterThan(0)
    })
    expect(
      within(row).queryByRole('button', {
        name: 'Acknowledge incident Compressor pressure high',
      }),
    ).not.toBeInTheDocument()
  })

  it('shows a bounded unavailable state when the initial incident list fails without claiming an empty journal', async () => {
    setupDashboardApiFixtures(createDashboardVisualRestFixtures())
    const edgeId = 'edge-visual-1'

    server.use(
      http.get('/api/edge-servers/:edgeId/alarm-incidents', () =>
        HttpResponse.json(
          { status: 'error', message: 'Incident list unavailable' },
          { status: 503 },
        ),
      ),
    )

    mount(dashboardPath(`?diagramId=${dashboardVisualDiagram._id}&edgeId=${edgeId}`))

    expect(await screen.findByTestId('dashboard-visual-surface')).toBeInTheDocument()
    await waitFor(() => {
      expect(runtimeHarness.startSession).toHaveBeenCalledWith(
        expect.objectContaining({ edgeId }),
      )
    })

    const journalPanel = screen.getByTestId('dashboard-alarm-journal-panel')
    const alert = await within(journalPanel).findByRole('alert')
    expect(alert).toHaveTextContent('Alarm incident list is unavailable.')
    expect(alert).toHaveTextContent('Incident list unavailable')
    expect(within(journalPanel).queryByText(/no unclosed alarm incidents/i)).not.toBeInTheDocument()
    expect(within(journalPanel).queryByText(/no incidents/i)).not.toBeInTheDocument()
    expect(within(journalPanel).queryByTestId(/dashboard-alarm-incident-row-/)).not.toBeInTheDocument()
    expect(screen.queryByTestId('dashboard-alarm-red-light-indicator')).not.toBeInTheDocument()
  })

  it('shows red-light and one toast for a newly known unclosed incident through the runtime path', async () => {
    setupDashboardApiFixtures(createDashboardVisualRestFixtures())
    const edgeId = 'edge-visual-1'
    const user = userEvent.setup()

    mount(dashboardPath(`?diagramId=${dashboardVisualDiagram._id}&edgeId=${edgeId}`))

    expect(await screen.findByTestId('dashboard-visual-surface')).toBeInTheDocument()
    await waitFor(() => {
      expect(runtimeHarness.startSession).toHaveBeenCalledWith(
        expect.objectContaining({ edgeId }),
      )
    })
    expect(screen.queryByTestId('dashboard-alarm-red-light-indicator')).not.toBeInTheDocument()
    expect(screen.queryByTestId('dashboard-alarm-toast-notice')).not.toBeInTheDocument()

    act(() => {
      runtimeHarness.emitAlarmIncidentChanged(
        createDashboardUnclosedAlarmIncidentChangedEventFixture({
          edgeId,
          incident: {
            incidentId: 'incident-pressure-toast',
            edgeId,
            deviceId: 'compressor-7',
            metric: 'pressure',
            ruleId: 'rule-pressure-high',
            updatedAt: '2026-05-09T09:25:30.000Z',
            rule: {
              severity: 'danger',
              label: 'Compressor pressure high',
            },
          },
        }),
      )
    })

    expect(await screen.findByTestId('dashboard-alarm-red-light-indicator')).toBeInTheDocument()
    expect(screen.getByTestId('dashboard-alarm-red-light-count')).toHaveTextContent('1')
    const toasts = await screen.findAllByTestId('dashboard-alarm-toast-notice')
    expect(toasts).toHaveLength(1)
    expect(toasts[0]).toHaveAttribute('data-incident-id', 'incident-pressure-toast')

    act(() => {
      runtimeHarness.emitAlarmIncidentChanged(
        createDashboardUnclosedAlarmIncidentChangedEventFixture({
          edgeId,
          incident: {
            incidentId: 'incident-pressure-toast',
            edgeId,
            latestValue: 45,
            updatedAt: '2026-05-09T09:26:00.000Z',
            rule: {
              severity: 'danger',
              label: 'Compressor pressure high',
            },
          },
        }),
      )
    })

    await waitFor(() => {
      expect(screen.getAllByTestId('dashboard-alarm-toast-notice')).toHaveLength(1)
      expect(screen.getByTestId('dashboard-alarm-red-light-count')).toHaveTextContent('1')
    })

    await user.click(
      screen.getByRole('button', {
        name: 'Dismiss alarm incident notice incident-pressure-toast',
      }),
    )

    await waitFor(() => {
      expect(screen.queryByTestId('dashboard-alarm-toast-notice')).not.toBeInTheDocument()
    })
    expect(screen.getByTestId('dashboard-alarm-red-light-count')).toHaveTextContent('1')
    expect(
      screen.getByTestId('dashboard-alarm-incident-row-incident-pressure-toast'),
    ).toHaveTextContent('Active Unacknowledged')

    act(() => {
      runtimeHarness.emitAlarmIncidentChanged(
        createDashboardClosedAlarmIncidentChangedEventFixture({
          edgeId,
          incident: {
            incidentId: 'incident-pressure-toast',
            edgeId,
            rule: {
              label: 'Compressor pressure high',
            },
          },
        }),
      )
    })

    await waitFor(() => {
      expect(screen.queryByTestId('dashboard-alarm-red-light-indicator')).not.toBeInTheDocument()
    })
    expect(
      screen.getByTestId('dashboard-alarm-incident-row-incident-pressure-toast'),
    ).toHaveTextContent('Closed')
  })

  it('does not activate red-light or toast for a closed-first runtime incident projection', async () => {
    setupDashboardApiFixtures(createDashboardVisualRestFixtures())
    const edgeId = 'edge-visual-1'

    mount(dashboardPath(`?diagramId=${dashboardVisualDiagram._id}&edgeId=${edgeId}`))

    expect(await screen.findByTestId('dashboard-visual-surface')).toBeInTheDocument()
    await waitFor(() => {
      expect(runtimeHarness.startSession).toHaveBeenCalledWith(
        expect.objectContaining({ edgeId }),
      )
    })
    expect(screen.queryByTestId('dashboard-alarm-red-light-indicator')).not.toBeInTheDocument()
    expect(screen.queryByTestId('dashboard-alarm-toast-notice')).not.toBeInTheDocument()

    act(() => {
      runtimeHarness.emitAlarmIncidentChanged(
        createDashboardClosedAlarmIncidentChangedEventFixture({
          edgeId,
          incident: {
            incidentId: 'incident-closed-first',
            edgeId,
            rule: {
              label: 'Closed first pressure',
            },
          },
        }),
      )
    })

    await screen.findByTestId('dashboard-alarm-incident-row-incident-closed-first')
    expect(screen.queryByTestId('dashboard-alarm-red-light-indicator')).not.toBeInTheDocument()
    expect(screen.queryByTestId('dashboard-alarm-toast-notice')).not.toBeInTheDocument()
  })

  it('keeps a failed ACK incident unacknowledged and open with a bounded row error', async () => {
    setupDashboardApiFixtures(createDashboardVisualRestFixtures())
    const edgeId = 'edge-visual-1'
    const ackRequests: Array<{ edgeId: string; incidentId: string }> = []

    server.use(
      http.post('/api/edge-servers/:edgeId/alarm-incidents/:incidentId/ack', ({ params }) => {
        ackRequests.push({
          edgeId: String(params.edgeId),
          incidentId: String(params.incidentId),
        })

        return HttpResponse.json(
          { status: 'error', message: 'ACK unavailable' },
          { status: 503 },
        )
      }),
    )

    mount(dashboardPath(`?diagramId=${dashboardVisualDiagram._id}&edgeId=${edgeId}`))

    expect(await screen.findByTestId('dashboard-visual-surface')).toBeInTheDocument()
    await waitFor(() => {
      expect(runtimeHarness.startSession).toHaveBeenCalledWith(
        expect.objectContaining({ edgeId }),
      )
    })

    act(() => {
      runtimeHarness.emitAlarmIncidentChanged(
        createDashboardAlarmIncidentChangedEventFixture({
          edgeId,
          incident: {
            incidentId: 'incident-pressure-failure',
            edgeId,
            deviceId: 'compressor-7',
            metric: 'pressure',
            ruleId: 'rule-pressure-high',
            isActive: true,
            isAcknowledged: false,
            activatedAt: '2026-05-09T09:25:00.000Z',
            latestDetectedAt: 1778318730000,
            updatedAt: '2026-05-09T09:25:30.000Z',
            rule: {
              severity: 'danger',
              label: 'Compressor pressure high',
            },
          },
        }),
      )
    })

    const row = await screen.findByTestId(
      'dashboard-alarm-incident-row-incident-pressure-failure',
    )
    const ackButton = within(row).getByRole('button', {
      name: 'Acknowledge incident Compressor pressure high',
    })

    await userEvent.setup().click(ackButton)

    await waitFor(() => {
      expect(ackRequests).toEqual([
        { edgeId, incidentId: 'incident-pressure-failure' },
      ])
      expect(
        within(row).getByRole('button', {
          name: 'Acknowledge incident Compressor pressure high',
        }),
      ).not.toBeDisabled()
    })

    expect(row).toBeInTheDocument()
    expect(within(row).getByText('Active Unacknowledged')).toBeInTheDocument()
    expect(within(row).queryByText('Active Acknowledged')).not.toBeInTheDocument()
    expect(within(row).queryByText('Closed')).not.toBeInTheDocument()
    expect(within(row).getByRole('alert')).toHaveTextContent('ACK unavailable')
    expect(
      within(row).getByRole('button', {
        name: 'Acknowledge incident Compressor pressure high',
      }),
    ).toBeInTheDocument()
  })

  it('renders invalid-selection for edge-only query on the canonical Dispatch Dashboard route', async () => {
    setupDashboardApiFixtures()
    const router = mount(dashboardPath('?edgeId=edge-1'))

    expect(await screen.findByText('Invalid selection')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe(DISPATCH_DEFAULT_PATH)
  })

  it('denies admin access before dashboard initialization', async () => {
    act(() => {
      useAuthStore.setState({ session: null, isAuthenticated: false })
      useAuthStore.getState().setSession(adminSession)
    })

    mount(dashboardPath())

    expect(await screen.findByTestId('admin-home')).toBeInTheDocument()
    expect(screen.queryByLabelText('Diagram')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Edge Server')).not.toBeInTheDocument()
  })

  it('synchronizes URL query when user changes diagram and edge selection', async () => {
    setupDashboardApiFixtures()
    const router = mount(dashboardPath())

    await screen.findByLabelText('Diagram')
    await waitFor(() => {
      expect(screen.getByLabelText('Diagram')).not.toBeDisabled()
      expect(screen.getByRole('option', { name: 'Pump' })).toBeInTheDocument()
    })

    const user = userEvent.setup()
    await user.selectOptions(screen.getByLabelText('Diagram'), 'diagram-2')
    await waitFor(() => {
      expect(router.state.location.search).toContain('diagramId=diagram-2')
      expect(router.state.location.search).not.toContain('edgeId=')
    }, { timeout: 1000 })
    expect(screen.getByText('Select Diagram and Edge Server to start monitoring')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Edge B' })).toBeInTheDocument()
      expect(screen.getByLabelText('Edge Server')).not.toBeDisabled()
    })
    await user.selectOptions(screen.getByLabelText('Edge Server'), 'edge-2')
    await waitFor(() => {
      expect(router.state.location.search).toContain('diagramId=diagram-2')
      expect(router.state.location.search).toContain('edgeId=edge-2')
    }, { timeout: 1000 })
  })
})

describe('DashboardPage (US2)', () => {
  it('sends one toggle set_bool command from compatible saved bindings and waits for reported telemetry before changing actual state', async () => {
    setupDashboardApiFixtures(createDashboardVisualRestFixtures())
    const commandRequests: Array<{ edgeId: string; body: unknown }> = []
    let confirmCommand = () => { }

    server.use(
      http.post('/api/edge-servers/:edgeId/commands', async ({ params, request }) => {
        commandRequests.push({
          edgeId: String(params.edgeId),
          body: await request.json(),
        })

        return new Promise((resolve) => {
          confirmCommand = () =>
            resolve(
              HttpResponse.json({
                status: 'success',
                data: {
                  requestId: 'command-toggle-1',
                  commandStatus: 'confirmed',
                  completedAt: '2026-05-07T02:00:00.000Z',
                },
              }),
            )
        })
      }),
    )

    mount(dashboardPath(`?diagramId=${dashboardVisualDiagram._id}&edgeId=edge-visual-1`))

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
              deviceId: 'pump-1',
              metric: 'running',
              last: false,
              ts: 1763895000004,
            },
          ],
          serverTs: 1763895000500,
        }),
      )
    })

    expect(screen.getByTestId('dashboard-visual-widget-value-widget-command-toggle')).toHaveTextContent(
      'false',
    )
    expect(screen.getByTestId('dashboard-visual-toggle-track-widget-command-toggle')).toHaveAttribute(
      'data-fill',
      '#475569',
    )

    await userEvent.setup().click(
      await screen.findByRole('button', { name: 'Command toggle widget-command-toggle' }),
    )

    await waitFor(() => {
      expect(commandRequests).toHaveLength(1)
    })
    expect(commandRequests[0]).toEqual({
      edgeId: 'edge-visual-1',
      body: {
        deviceId: 'pump-1',
        commandType: 'set_bool',
        payload: { value: true },
      },
    })
    expect(screen.getByTestId('dashboard-command-state-widget-command-toggle')).toHaveTextContent(
      'pending',
    )
    expect(screen.getByTestId('dashboard-visual-widget-value-widget-command-toggle')).toHaveTextContent(
      'false',
    )
    expect(screen.getByTestId('dashboard-visual-toggle-track-widget-command-toggle')).toHaveAttribute(
      'data-fill',
      '#475569',
    )

    act(() => {
      runtimeHarness.emitTelemetry(
        createDashboardTelemetryEventFixture({
          edgeId: 'edge-visual-1',
          readings: [
            {
              deviceId: 'pump-1',
              metric: 'running',
              last: true,
              ts: 1763895000009,
            },
          ],
          serverTs: 1763895000550,
        }),
      )
    })

    await waitFor(() => {
      expect(screen.getByTestId('dashboard-command-state-widget-command-toggle')).toHaveTextContent(
        'pending',
      )
      expect(screen.getByTestId('dashboard-visual-widget-value-widget-command-toggle')).toHaveTextContent(
        'true',
      )
      expect(screen.getByTestId('dashboard-visual-toggle-track-widget-command-toggle')).toHaveAttribute(
        'data-fill',
        '#16a34a',
      )
    })

    await act(async () => {
      confirmCommand()
    })

    await waitFor(() => {
      expect(screen.getByTestId('dashboard-command-state-widget-command-toggle')).toHaveTextContent(
        'confirmed-waiting-telemetry',
      )
    })
    expect(screen.getByTestId('dashboard-visual-widget-value-widget-command-toggle')).toHaveTextContent(
      'true',
    )
    expect(screen.getByTestId('dashboard-visual-toggle-track-widget-command-toggle')).toHaveAttribute(
      'data-fill',
      '#16a34a',
    )

    act(() => {
      runtimeHarness.emitTelemetry(
        createDashboardTelemetryEventFixture({
          edgeId: 'edge-visual-1',
          readings: [
            {
              deviceId: 'boiler-1',
              metric: 'status',
              last: 'stable',
              ts: 1763895000010,
            },
          ],
          serverTs: 1763895000600,
        }),
      )
    })

    expect(screen.getByTestId('dashboard-command-state-widget-command-toggle')).toHaveTextContent(
      'confirmed-waiting-telemetry',
    )
    expect(screen.getByTestId('dashboard-visual-widget-value-widget-command-toggle')).toHaveTextContent(
      'true',
    )

    act(() => {
      runtimeHarness.emitTelemetry(
        createDashboardTelemetryEventFixture({
          edgeId: 'edge-visual-1',
          readings: [
            {
              deviceId: 'pump-1',
              metric: 'running',
              last: true,
              ts: 1763895000011,
            },
          ],
          serverTs: 1763895000700,
        }),
      )
    })

    await waitFor(() => {
      expect(screen.queryByTestId('dashboard-command-state-widget-command-toggle')).not.toBeInTheDocument()
      expect(screen.getByTestId('dashboard-visual-widget-value-widget-command-toggle')).toHaveTextContent(
        'true',
      )
      expect(screen.getByTestId('dashboard-visual-toggle-track-widget-command-toggle')).toHaveAttribute(
        'data-fill',
        '#16a34a',
      )
    })
  })

  it('keeps command lifecycle state visible when a command-capable widget is near the top of the visual surface', async () => {
    const fixtures = createDashboardVisualRestFixtures()
    setupDashboardApiFixtures({
      ...fixtures,
      diagramsById: {
        [dashboardVisualDiagram._id]: {
          ...dashboardVisualDiagram,
          layout: {
            ...dashboardVisualLayout,
            widgets: dashboardVisualLayout.widgets?.map((widget) =>
              widget.id === 'widget-command-toggle' ? { ...widget, y: 4 } : widget,
            ),
          },
        },
      },
    })
    let confirmCommand = () => { }

    server.use(
      http.post('/api/edge-servers/:edgeId/commands', () =>
        new Promise((resolve) => {
          confirmCommand = () =>
            resolve(
              HttpResponse.json({
                status: 'success',
                data: {
                  requestId: 'command-toggle-top-1',
                  commandStatus: 'confirmed',
                  completedAt: '2026-05-07T02:00:00.000Z',
                },
              }),
            )
        }),
      ),
    )

    mount(dashboardPath(`?diagramId=${dashboardVisualDiagram._id}&edgeId=edge-visual-1`))

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
              deviceId: 'pump-1',
              metric: 'running',
              last: false,
              ts: 1763895000004,
            },
          ],
        }),
      )
    })

    await userEvent.setup().click(
      await screen.findByRole('button', { name: 'Command toggle widget-command-toggle' }),
    )

    const commandState = await screen.findByTestId('dashboard-command-state-widget-command-toggle')
    expect(commandState).toHaveTextContent('pending')
    expect(parseFloat(commandState.style.top)).toBeGreaterThanOrEqual(0)

    await act(async () => {
      confirmCommand()
    })
  })

  it('sends one slider set_number command only on commit while preserving telemetry-rendered state', async () => {
    setupDashboardApiFixtures(createDashboardVisualRestFixtures())
    const commandRequests: Array<{ edgeId: string; body: unknown }> = []

    server.use(
      http.get('/api/edge-servers/:edgeId/catalog', ({ params }) =>
        HttpResponse.json({
          status: 'success',
          data: {
            ...dashboardVisualCatalog,
            edgeServerId: String(params.edgeId),
            commands: dashboardVisualCatalog.commands.map((command) =>
              command.commandType === 'set_number'
                ? { ...command, min: 40, max: 80 }
                : command,
            ),
          },
        }),
      ),
      http.post('/api/edge-servers/:edgeId/commands', async ({ params, request }) => {
        commandRequests.push({
          edgeId: String(params.edgeId),
          body: await request.json(),
        })

        return HttpResponse.json({
          status: 'success',
          data: {
            requestId: 'command-slider-1',
            commandStatus: 'confirmed',
            completedAt: '2026-05-07T02:00:00.000Z',
          },
        })
      }),
    )

    mount(dashboardPath(`?diagramId=${dashboardVisualDiagram._id}&edgeId=edge-visual-1`))

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
              metric: 'flowRate',
              last: 68,
              ts: 1763895000004,
            },
          ],
        }),
      )
    })

    const sliderCommand = await screen.findByRole('slider', {
      name: 'Command slider widget-command-slider',
    })
    expect(sliderCommand).toHaveValue('68')
    expect(sliderCommand).toHaveAttribute('min', '40')
    expect(sliderCommand).toHaveAttribute('max', '80')
    expect(screen.getByTestId('dashboard-visual-widget-value-widget-command-slider')).toHaveTextContent(
      '68',
    )

    fireEvent.change(sliderCommand, { target: { value: '72' } })
    fireEvent.change(sliderCommand, { target: { value: '74' } })
    fireEvent.change(sliderCommand, { target: { value: '76' } })
    expect(commandRequests).toEqual([])
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 500))
    })
    expect(commandRequests).toEqual([])

    fireEvent.pointerUp(sliderCommand)

    await waitFor(() => {
      expect(commandRequests).toHaveLength(1)
    })
    expect(commandRequests[0]).toEqual({
      edgeId: 'edge-visual-1',
      body: {
        deviceId: 'boiler-1',
        commandType: 'set_number',
        payload: { value: 76 },
      },
    })
    expect(screen.getByTestId('dashboard-visual-widget-value-widget-command-slider')).toHaveTextContent(
      '68',
    )
    expect(
      getNumericDataAttribute(screen.getByTestId('dashboard-visual-slider-fill-widget-command-slider'), 'data-width'),
    ).toBeCloseTo(85.68)

    act(() => {
      runtimeHarness.emitTelemetry(
        createDashboardTelemetryEventFixture({
          edgeId: 'edge-visual-1',
          readings: [
            {
              deviceId: 'boiler-1',
              metric: 'flowRate',
              last: 70,
              ts: 1763895000010,
            },
          ],
        }),
      )
    })

    await waitFor(() => {
      expect(sliderCommand).toHaveValue('70')
      expect(screen.getByTestId('dashboard-visual-widget-value-widget-command-slider')).toHaveTextContent(
        '70',
      )
    })

    fireEvent.pointerUp(sliderCommand)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100))
    })
    expect(commandRequests).toHaveLength(1)
  })

  it('renders live transport and edge-availability status for active monitoring context', async () => {
    setupDashboardApiFixtures()
    mount(dashboardPath('?diagramId=diagram-1&edgeId=edge-1'))

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
    mount(dashboardPath('?diagramId=diagram-1&edgeId=edge-1'))

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
    mount(dashboardPath('?diagramId=diagram-1&edgeId=edge-1'))

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
    const router = mount(dashboardPath('?diagramId=diagram-1&edgeId=edge-1'))

    expect(await screen.findByLabelText('Diagram')).toHaveValue('diagram-1')
    await waitFor(() => {
      expect(runtimeHarness.startSession).toHaveBeenCalledWith(
        expect.objectContaining({ edgeId: 'edge-1' }),
      )
    })

    const user = userEvent.setup()
    await user.selectOptions(screen.getByLabelText('Diagram'), 'diagram-2')
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Edge B' })).toBeInTheDocument()
      expect(screen.getByLabelText('Edge Server')).not.toBeDisabled()
    })
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
  it('clears pending and keeps actual visuals telemetry-driven for command failures and reconnect', async () => {
    setupDashboardApiFixtures(createDashboardVisualRestFixtures())
    const commandRequests: Array<{ edgeId: string; body: unknown }> = []
    const failureCases = [
      {
        response: HttpResponse.json(
          {
            status: 'error',
            message: 'Cloud RPC timeout',
            failureReason: 'cloud_rpc_timeout',
          },
          { status: 504 },
        ),
        expectedState: 'timeout',
        expectedFailure: 'cloud_rpc_timeout',
        expectedError: 'Cloud RPC timeout',
      },
      {
        response: HttpResponse.json(
          {
            status: 'error',
            message: 'Edge command timeout',
            failureReason: 'edge_command_timeout',
          },
          { status: 502 },
        ),
        expectedState: 'timeout',
        expectedFailure: 'edge_command_timeout',
        expectedError: 'Edge command timeout',
      },
      {
        response: HttpResponse.json(
          {
            status: 'error',
            message: 'Edge command failed',
            failureReason: 'edge_command_failed',
          },
          { status: 502 },
        ),
        expectedState: 'error',
        expectedFailure: 'edge_command_failed',
        expectedError: 'Edge command failed',
      },
      {
        response: HttpResponse.json(
          {
            status: 'error',
            message: 'Edge unavailable',
            failureReason: 'edge_unavailable',
          },
          { status: 503 },
        ),
        expectedState: 'unavailable',
        expectedFailure: 'edge_unavailable',
        expectedError: 'Edge unavailable',
      },
      {
        response: HttpResponse.json(
          {
            status: 'error',
            message: 'Unexpected command failure',
          },
          { status: 500 },
        ),
        expectedState: 'error',
        expectedFailure: 'unknown_error',
        expectedError: 'Command failed',
      },
      {
        response: HttpResponse.error(),
        expectedState: 'error',
        expectedFailure: 'network_error',
        expectedError: 'Network error',
      },
    ]
    let activeResponse: Response | null = null
    let releaseCommand = () => { }

    server.use(
      http.post('/api/edge-servers/:edgeId/commands', async ({ params, request }) => {
        commandRequests.push({
          edgeId: String(params.edgeId),
          body: await request.json(),
        })

        return new Promise((resolve) => {
          releaseCommand = () => {
            if (!activeResponse) {
              throw new Error('Missing active command response.')
            }
            resolve(activeResponse)
          }
        })
      }),
    )

    mount(dashboardPath(`?diagramId=${dashboardVisualDiagram._id}&edgeId=edge-visual-1`))

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
              deviceId: 'pump-1',
              metric: 'running',
              last: false,
              ts: 1763895000004,
            },
          ],
          serverTs: 1763895000500,
        }),
      )
    })

    expect(screen.getByTestId('dashboard-visual-widget-value-widget-command-toggle')).toHaveTextContent(
      'false',
    )
    expect(
      await screen.findByRole('button', { name: 'Command toggle widget-command-toggle' }),
    ).toHaveAttribute('aria-pressed', 'false')

    const user = userEvent.setup()
    await openDiagnosticsPanel(user)
    let diagnosticsPanel = await openDiagnosticsTab('Bindings')
    const toggleDiagnostics = within(diagnosticsPanel).getByTestId(
      'dashboard-runtime-widget-widget-command-toggle',
    )
    expect(within(toggleDiagnostics).queryByTestId(
      'dashboard-diagnostics-command-lifecycle-widget-command-toggle',
    )).not.toBeInTheDocument()

    for (const [failureIndex, failureCase] of failureCases.entries()) {
      activeResponse = failureCase.response
      await user.click(
        await screen.findByRole('button', { name: 'Command toggle widget-command-toggle' }),
      )

      await waitFor(() => {
        expect(commandRequests).toHaveLength(failureIndex + 1)
      })
      expect(screen.getByTestId('dashboard-command-state-widget-command-toggle')).toHaveTextContent(
        'pending',
      )
      expect(screen.getByTestId('dashboard-visual-widget-value-widget-command-toggle')).toHaveTextContent(
        'false',
      )
      expect(
        screen.getByRole('button', { name: 'Command toggle widget-command-toggle' }),
      ).toHaveAttribute('aria-pressed', 'false')

      diagnosticsPanel = await openDiagnosticsTab('Bindings')
      expect(
        within(diagnosticsPanel).getByTestId(
          'dashboard-diagnostics-command-lifecycle-widget-command-toggle',
        ),
      ).toHaveTextContent('Command lifecycle: pending')

      await act(async () => {
        releaseCommand()
      })

      await waitFor(() => {
        expect(screen.getByTestId('dashboard-command-state-widget-command-toggle')).toHaveTextContent(
          failureCase.expectedState,
        )
      }, { timeout: 3000 })
      expect(screen.getByTestId('dashboard-visual-widget-value-widget-command-toggle')).toHaveTextContent(
        'false',
      )
      expect(
        screen.getByRole('button', { name: 'Command toggle widget-command-toggle' }),
      ).toHaveAttribute('aria-pressed', 'false')

      diagnosticsPanel = await openDiagnosticsTab('Bindings')
      expect(
        within(diagnosticsPanel).getByTestId(
          'dashboard-diagnostics-command-lifecycle-widget-command-toggle',
        ),
      ).toHaveTextContent(`Command lifecycle: ${failureCase.expectedState}`)
      expect(
        within(diagnosticsPanel).getByTestId(
          'dashboard-diagnostics-command-failure-widget-command-toggle',
        ),
      ).toHaveTextContent(`Failure: ${failureCase.expectedFailure}`)
      expect(
        within(diagnosticsPanel).getByTestId(
          'dashboard-diagnostics-command-last-error-widget-command-toggle',
        ),
      ).toHaveTextContent(`Last error: ${failureCase.expectedError}`)

      act(() => {
        runtimeHarness.emitTransportStatus('edge-visual-1', 'reconnecting')
      })

      diagnosticsPanel = await openDiagnosticsTab('Status')
      await waitFor(() => {
        expect(within(diagnosticsPanel).getByText('Transport: Reconnecting')).toBeInTheDocument()
      })
      expect(screen.getByTestId('dashboard-visual-widget-value-widget-command-toggle')).toHaveTextContent(
        'false',
      )
      expect(
        screen.getByRole('button', { name: 'Command toggle widget-command-toggle' }),
      ).toHaveAttribute('aria-pressed', 'false')
      expect(screen.queryByText('Failed to load dashboard context')).not.toBeInTheDocument()

      act(() => {
        runtimeHarness.emitTransportStatus('edge-visual-1', 'connected')
      })
      diagnosticsPanel = await openDiagnosticsTab('Bindings')
      expect(
        within(diagnosticsPanel).getByTestId(
          'dashboard-diagnostics-command-lifecycle-widget-command-toggle',
        ),
      ).toHaveTextContent(`Command lifecycle: ${failureCase.expectedState}`)
      expect(
        within(diagnosticsPanel).getByTestId(
          'dashboard-diagnostics-command-failure-widget-command-toggle',
        ),
      ).toHaveTextContent(`Failure: ${failureCase.expectedFailure}`)

      activeResponse = null
    }
  }, 15000)

  it('keeps unsupported widgets and invalid command bindings non-executable without sending Cloud commands', async () => {
    const diagramId = 'diagram-non-executable-commands'
    const edgeId = 'edge-non-executable-1'
    const commandRequests: Array<{ edgeId: string; body: unknown }> = []
    const nonExecutableLayout = {
      ...dashboardVisualLayout,
      widgets: [
        {
          id: 'widget-display-command',
          type: 'number-display',
          imageId: 'image-boiler',
          x: 80,
          y: 72,
          width: 128,
          height: 44,
        },
        {
          id: 'widget-led-command',
          type: 'led',
          imageId: 'image-boiler',
          x: 236,
          y: 76,
          width: 36,
          height: 36,
        },
        {
          id: 'widget-button-command',
          type: 'button',
          imageId: 'image-boiler',
          x: 300,
          y: 72,
          width: 120,
          height: 44,
          label: 'Manual Button',
        },
        {
          id: 'widget-toggle-missing-command',
          type: 'toggle',
          imageId: 'image-pump',
          x: 540,
          y: 120,
          width: 120,
          height: 40,
        },
        {
          id: 'widget-toggle-reported-mismatch',
          type: 'toggle',
          imageId: 'image-pump',
          x: 540,
          y: 176,
          width: 120,
          height: 40,
        },
        {
          id: 'widget-slider-stale-catalog',
          type: 'slider',
          imageId: 'image-boiler',
          x: 96,
          y: 172,
          width: 150,
          height: 40,
        },
      ],
    }

    setupDashboardApiFixtures({
      diagramsById: {
        [diagramId]: {
          ...dashboardVisualDiagram,
          _id: diagramId,
          name: 'Non-executable commands',
          layout: nonExecutableLayout,
        },
      },
      trustedEdges: [
        {
          _id: edgeId,
          name: 'Non-executable Edge',
          lifecycleState: 'Active',
          availability: { online: true, lastSeenAt: '2026-05-07T02:00:00.000Z' },
        },
      ],
      bindingProfilesByDiagramId: {
        [diagramId]: [
          {
            _id: 'binding-non-executable',
            diagramId,
            edgeServerId: edgeId,
            widgetBindings: [
              { widgetId: 'widget-display-command', deviceId: 'pump-1', metric: 'running' },
              { widgetId: 'widget-led-command', deviceId: 'pump-1', metric: 'running' },
              { widgetId: 'widget-button-command', deviceId: 'pump-1', metric: 'running' },
              { widgetId: 'widget-toggle-missing-command', deviceId: 'pump-1', metric: 'running' },
              { widgetId: 'widget-toggle-reported-mismatch', deviceId: 'pump-1', metric: 'notRunning' },
              { widgetId: 'widget-slider-stale-catalog', deviceId: 'boiler-1', metric: 'flowRate' },
            ],
            commandBindings: [
              { widgetId: 'widget-display-command', deviceId: 'pump-1', commandType: 'set_bool' },
              { widgetId: 'widget-led-command', deviceId: 'pump-1', commandType: 'set_bool' },
              { widgetId: 'widget-button-command', deviceId: 'pump-1', commandType: 'set_bool' },
              { widgetId: 'widget-toggle-reported-mismatch', deviceId: 'pump-1', commandType: 'set_bool' },
              { widgetId: 'widget-slider-stale-catalog', deviceId: 'boiler-1', commandType: 'set_number' },
            ],
          },
        ],
      },
    })

    server.use(
      http.get('/api/edge-servers/:edgeId/catalog', ({ params }) =>
        HttpResponse.json({
          status: 'success',
          data: {
            edgeServerId: String(params.edgeId),
            telemetry: [
              { deviceId: 'pump-1', metric: 'running', valueType: 'boolean', label: 'running' },
              { deviceId: 'pump-1', metric: 'notRunning', valueType: 'boolean', label: 'notRunning' },
              { deviceId: 'boiler-1', metric: 'flowRate', valueType: 'number', label: 'flowRate' },
            ],
            commands: [
              {
                deviceId: 'pump-1',
                commandType: 'set_bool',
                valueType: 'boolean',
                reportedMetric: 'running',
                label: 'set running',
              },
            ],
          },
        }),
      ),
      http.post('/api/edge-servers/:edgeId/commands', async ({ params, request }) => {
        commandRequests.push({
          edgeId: String(params.edgeId),
          body: await request.json(),
        })

        return HttpResponse.json({
          status: 'success',
          data: { commandStatus: 'confirmed' },
        })
      }),
    )

    mount(dashboardPath(`?diagramId=${diagramId}&edgeId=${edgeId}`))

    expect(await screen.findByTestId('dashboard-visual-surface')).toBeInTheDocument()
    await waitFor(() => {
      expect(runtimeHarness.startSession).toHaveBeenCalledWith(
        expect.objectContaining({ edgeId }),
      )
    })

    act(() => {
      runtimeHarness.emitTransportStatus(edgeId, 'connected')
      runtimeHarness.emitTelemetry(
        createDashboardTelemetryEventFixture({
          edgeId,
          readings: [
            { deviceId: 'pump-1', metric: 'running', last: false, ts: 1763895000000 },
            { deviceId: 'pump-1', metric: 'notRunning', last: true, ts: 1763895000001 },
            { deviceId: 'boiler-1', metric: 'flowRate', last: 55, ts: 1763895000002 },
          ],
        }),
      )
    })

    expect(screen.queryByRole('button', { name: /widget-display-command/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /widget-led-command/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /widget-button-command/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('slider', { name: /widget-display-command/ })).not.toBeInTheDocument()
    expect(screen.getByTestId('dashboard-visual-widget-widget-button-command')).toHaveAttribute(
      'data-listening',
      'false',
    )
    expect(screen.getByTestId('dashboard-visual-led-indicator-widget-led-command')).toHaveAttribute(
      'data-listening',
      'false',
    )

    const missingCommandToggle = screen.getByRole('button', {
      name: 'Command toggle widget-toggle-missing-command',
    })
    const reportedMismatchToggle = screen.getByRole('button', {
      name: 'Command toggle widget-toggle-reported-mismatch',
    })
    const staleCatalogSlider = screen.getByRole('slider', {
      name: 'Command slider widget-slider-stale-catalog',
    })

    expect(missingCommandToggle).toBeDisabled()
    expect(missingCommandToggle).toHaveAttribute('data-command-executable', 'false')
    expect(missingCommandToggle).toHaveAttribute('data-command-availability', 'missing-command-binding')
    expect(reportedMismatchToggle).toBeDisabled()
    expect(reportedMismatchToggle).toHaveAttribute('data-command-executable', 'false')
    expect(reportedMismatchToggle).toHaveAttribute(
      'data-command-availability',
      'missing-reported-widget-binding',
    )
    expect(staleCatalogSlider).toBeDisabled()
    expect(staleCatalogSlider).toHaveAttribute('data-command-executable', 'false')
    expect(staleCatalogSlider).toHaveAttribute('data-command-availability', 'missing-catalog-command')

    fireEvent.click(screen.getByTestId('dashboard-visual-widget-widget-button-command'))
    fireEvent.click(missingCommandToggle)
    fireEvent.keyUp(missingCommandToggle, { key: 'Enter' })
    fireEvent.click(reportedMismatchToggle)
    fireEvent.keyUp(reportedMismatchToggle, { key: ' ' })
    fireEvent.change(staleCatalogSlider, { target: { value: '70' } })
    fireEvent.pointerUp(staleCatalogSlider)
    fireEvent.keyUp(staleCatalogSlider, { key: 'Enter' })

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })
    expect(commandRequests).toEqual([])
  })

  it('renders missing-binding-profile state when trusted edge has no saved profile for selected diagram', async () => {
    setupDashboardApiFixtures()
    mount(dashboardPath('?diagramId=diagram-1&edgeId=edge-2'))

    expect(await screen.findByLabelText('Diagram')).toHaveValue('diagram-1')
    expect(
      await screen.findByText('No saved binding profile for this Diagram + Edge pair'),
    ).toBeInTheDocument()
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

    mount(dashboardPath('?diagramId=diagram-1&edgeId=edge-1'))

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

    mount(dashboardPath('?diagramId=diagram-1&edgeId=edge-1'))

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
  it('retries catalog loading after leaving an in-flight selected Edge context', async () => {
    setupDashboardApiFixtures()
    const catalogRequests: string[] = []
    let releaseFirstEdgeCatalog = () => { }
    let edgeOneRequestCount = 0

    server.use(
      http.get('/api/edge-servers/:edgeId/catalog', ({ params }) => {
        const edgeId = String(params.edgeId)
        catalogRequests.push(edgeId)

        if (edgeId === 'edge-1') {
          edgeOneRequestCount += 1
          if (edgeOneRequestCount === 1) {
            return new Promise((resolve) => {
              releaseFirstEdgeCatalog = () =>
                resolve(
                  HttpResponse.json({
                    status: 'success',
                    data: { edgeServerId: edgeId, telemetry: [], commands: [] },
                  }),
                )
            })
          }
        }

        return HttpResponse.json({
          status: 'success',
          data: { edgeServerId: edgeId, telemetry: [], commands: [] },
        })
      }),
    )

    mount(dashboardPath('?diagramId=diagram-1&edgeId=edge-1'))

    await waitFor(() => {
      expect(catalogRequests).toEqual(['edge-1'])
    })

    const user = userEvent.setup()
    await user.selectOptions(screen.getByLabelText('Diagram'), 'diagram-2')
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Edge B' })).toBeInTheDocument()
      expect(screen.getByLabelText('Edge Server')).not.toBeDisabled()
    })
    await user.selectOptions(screen.getByLabelText('Edge Server'), 'edge-2')

    await waitFor(() => {
      expect(catalogRequests).toContain('edge-2')
    })

    await user.selectOptions(screen.getByLabelText('Diagram'), 'diagram-1')
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Edge A' })).toBeInTheDocument()
      expect(screen.getByLabelText('Edge Server')).not.toBeDisabled()
    })
    await user.selectOptions(screen.getByLabelText('Edge Server'), 'edge-1')

    await waitFor(() => {
      expect(catalogRequests.filter((edgeId) => edgeId === 'edge-1')).toHaveLength(2)
    })

    releaseFirstEdgeCatalog?.()
  })

  it('keeps catalog failure separate while rendering telemetry-bound visual state for runtime widgets', async () => {
    setupDashboardApiFixtures(createDashboardVisualRestFixtures())
    const catalogRequests: string[] = []
    server.use(
      http.get('/api/edge-servers/:edgeId/catalog', ({ params }) => {
        catalogRequests.push(String(params.edgeId))
        return HttpResponse.json({ status: 'error', message: 'Catalog unavailable' }, { status: 503 })
      }),
    )

    mount(dashboardPath(`?diagramId=${dashboardVisualDiagram._id}&edgeId=edge-visual-1`))

    expect(await screen.findByTestId('dashboard-visual-surface')).toBeInTheDocument()
    await waitFor(() => {
      expect(runtimeHarness.startSession).toHaveBeenCalledWith(
        expect.objectContaining({ edgeId: 'edge-visual-1' }),
      )
      expect(catalogRequests).toEqual(['edge-visual-1'])
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
            {
              deviceId: 'boiler-1',
              metric: 'status',
              last: 'stable',
              ts: 1763895000001,
            },
            {
              deviceId: 'pump-1',
              metric: 'alarm',
              last: true,
              ts: 1763895000002,
            },
            {
              deviceId: 'pump-1',
              metric: 'running',
              last: false,
              ts: 1763895000003,
            },
            {
              deviceId: 'boiler-1',
              metric: 'flowRate',
              last: 68,
              ts: 1763895000004,
            },
          ],
        }),
      )
    })

    expect(await screen.findByTestId('dashboard-visual-widget-value-widget-temperature')).toHaveTextContent(
      '49 C',
    )
    expect(screen.getByTestId('dashboard-visual-widget-value-widget-status')).toHaveTextContent(
      'stable',
    )
    expect(screen.getByTestId('dashboard-visual-widget-value-widget-alarm')).toHaveTextContent(
      'true',
    )
    expect(screen.getByTestId('dashboard-visual-widget-value-widget-command-toggle')).toHaveTextContent(
      'false',
    )
    expect(screen.getByTestId('dashboard-visual-widget-value-widget-command-slider')).toHaveTextContent(
      '68',
    )
    expect(screen.getByTestId('dashboard-visual-led-indicator-widget-alarm')).toHaveAttribute(
      'data-fill',
      '#22c55e',
    )
    expect(screen.getByTestId('dashboard-visual-toggle-track-widget-command-toggle')).toHaveAttribute(
      'data-fill',
      '#475569',
    )
    expect(screen.getByTestId('dashboard-visual-toggle-knob-widget-command-toggle')).toHaveAttribute(
      'data-x',
      '578',
    )
    expect(
      getNumericDataAttribute(screen.getByTestId('dashboard-visual-slider-fill-widget-command-slider'), 'data-width'),
    ).toBeCloseTo(85.68)

    const user = userEvent.setup()
    await openDiagnosticsPanel(user)
    const diagnosticsPanel = await openDiagnosticsTab('Bindings')
    expect(within(diagnosticsPanel).getByText('widget-command-toggle')).toBeInTheDocument()
    expect(within(diagnosticsPanel).getByText('widget-command-slider')).toBeInTheDocument()
    expect(within(diagnosticsPanel).getByText('widget-temperature')).toBeInTheDocument()
    expect(within(diagnosticsPanel).getByText('Value: 49')).toBeInTheDocument()
    expect(within(diagnosticsPanel).getByText('Value: false')).toBeInTheDocument()
    expect(within(diagnosticsPanel).getByText('Value: 68')).toBeInTheDocument()
    expect(
      within(diagnosticsPanel).getAllByText('Command: unavailable (missing-catalog-command)')[0],
    ).toBeInTheDocument()

    const nonOperativeWidget = within(diagnosticsPanel).getByTestId('dashboard-runtime-widget-widget-command-toggle')
    expect(nonOperativeWidget).not.toHaveAttribute('aria-disabled', 'true')
    const unavailableToggle = screen.getByRole('button', {
      name: 'Command toggle widget-command-toggle',
    })
    expect(unavailableToggle).toBeDisabled()
    expect(unavailableToggle).toHaveAttribute('data-command-executable', 'false')
    expect(unavailableToggle).toHaveAttribute('data-command-availability', 'missing-catalog-command')
  })
})

describe('DashboardPage visual diagnostics (T051)', () => {
  it('opens collapsed diagnostics from the bottom handle without replacing the visual surface', async () => {
    setupDashboardApiFixtures(createDashboardVisualRestFixtures())
    const user = userEvent.setup()

    mount(dashboardPath(`?diagramId=${dashboardVisualDiagram._id}&edgeId=edge-visual-1`))

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

  it('opens the same collapsed diagnostics state from the Details action slot control', async () => {
    setupDashboardApiFixtures(createDashboardVisualRestFixtures())

    mount(dashboardPath(`?diagramId=${dashboardVisualDiagram._id}&edgeId=edge-visual-1`))

    expect(await screen.findByTestId('dashboard-visual-surface')).toBeInTheDocument()

    const actionSlot = await screen.findByTestId('dispatch-action-slot')
    fireEvent.click(within(actionSlot).getByRole('button', { name: 'Details' }))

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

    mount(dashboardPath(`?diagramId=${dashboardVisualDiagram._id}&edgeId=edge-visual-1`))

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

    mount(dashboardPath(`?diagramId=${dashboardVisualDiagram._id}&edgeId=edge-visual-1`))

    expect(await screen.findByTestId('dashboard-visual-surface')).toBeInTheDocument()
    expect(screen.getByText('Visual rendering issues: 2 recoverable')).toBeInTheDocument()
    const diagnosticsPanel = await openDiagnosticsPanel()
    await userEvent.setup().click(within(diagnosticsPanel).getByRole('tab', { name: 'Render issues' }))
    expect(within(diagnosticsPanel).getByText('recoverable: missing-connection-point')).toBeInTheDocument()
    expect(within(diagnosticsPanel).getByText('recoverable: missing-widget-image')).toBeInTheDocument()
    expect(screen.queryByTestId('dashboard-runtime-widget-widget-temperature')).not.toBeInTheDocument()
  })
})
