import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createDashboardVisualRestFixtures,
  dashboardVisualBindingProfile,
  dashboardVisualCatalog,
  dashboardVisualDiagram,
} from '../fixtures/dashboardVisualLayout'
import { useAuthStore } from '@/shared/store/useAuthStore'
import {
  authenticateDispatchWorkspaceUser,
  createDispatchUnclosedAlarmIncidentChangedEventFixture,
  dispatchWorkspaceRuntimeHarness,
  renderDispatchWorkspaceRoute,
  setupDispatchWorkspaceRestFixtures,
} from './helpers/dispatchWorkspaceHarness'

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

beforeEach(() => {
  dispatchWorkspaceRuntimeHarness.reset()
  authenticateDispatchWorkspaceUser()
})

afterEach(() => {
  act(() => {
    useAuthStore.setState({ session: null, isAuthenticated: false })
  })
})

describe('DispatchWorkspacePage routing', () => {
  it('proves Dispatch routing, query preservation, sidebar tabs, and legacy one-session compatibility through User Hub routes', async () => {
    setupDispatchWorkspaceRestFixtures({
      dashboard: createDashboardVisualRestFixtures(),
    })

    const defaultRoute = renderDispatchWorkspaceRoute('/hub/dispatch')

    await waitFor(() => {
      expect(defaultRoute.router.state.location.pathname).toBe('/hub/dispatch/dashboard')
    })
    expect(screen.getByRole('link', { name: 'Dispatch' })).toHaveAttribute('href', '/hub/dispatch')

    const tablist = await screen.findByRole('tablist', { name: 'Dispatch tabs' })
    expect(within(tablist).getByRole('tab', { name: 'Dashboard' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(within(tablist).getByRole('tab', { name: 'Telemetry' })).toBeInTheDocument()
    expect(within(tablist).getByRole('tab', { name: 'Commands' })).toBeInTheDocument()
    expect(within(tablist).getByRole('tab', { name: 'Trends' })).toBeInTheDocument()
    expect(within(tablist).getByRole('tab', { name: 'Alarms' })).toBeInTheDocument()
    expect(dispatchWorkspaceRuntimeHarness.startSession).not.toHaveBeenCalled()
    defaultRoute.renderResult.unmount()

    dispatchWorkspaceRuntimeHarness.reset()
    const canonicalRoute = renderDispatchWorkspaceRoute(
      `/hub/dispatch/dashboard?diagramId=${dashboardVisualDiagram._id}&edgeId=edge-visual-1`,
    )

    await waitFor(() => {
      expect(canonicalRoute.router.state.location.pathname).toBe('/hub/dispatch/dashboard')
    })
    const canonicalSearchParams = new URLSearchParams(canonicalRoute.router.state.location.search)
    expect(canonicalSearchParams.get('diagramId')).toBe(dashboardVisualDiagram._id)
    expect(canonicalSearchParams.get('edgeId')).toBe('edge-visual-1')
    const dispatchContext = screen.getByRole('region', { name: 'Dispatch context' })
    const diagramSelectors = screen.getAllByRole('combobox', { name: 'Diagram' })
    const edgeSelectors = screen.getAllByRole('combobox', { name: 'Edge Server' })
    expect(diagramSelectors).toHaveLength(1)
    expect(edgeSelectors).toHaveLength(1)
    expect(within(dispatchContext).getByRole('combobox', { name: 'Diagram' })).toHaveValue(
      dashboardVisualDiagram._id,
    )
    expect(within(dispatchContext).getByRole('combobox', { name: 'Edge Server' })).toHaveValue(
      'edge-visual-1',
    )
    expect(screen.getByTestId('dispatch-selected-context')).toHaveTextContent(
      'Visual Boiler Runtime / Visual Edge',
    )

    const visualSurface = await screen.findByTestId('dashboard-visual-surface')
    expect(visualSurface).toBeInTheDocument()
    expect(within(visualSurface).queryByRole('combobox', { name: 'Diagram' })).not.toBeInTheDocument()
    expect(within(visualSurface).queryByRole('combobox', { name: 'Edge Server' })).not.toBeInTheDocument()
    expect(screen.getByTestId('dashboard-visual-stage')).toBeInTheDocument()
    expect(screen.getByTestId('dashboard-visual-image-image-boiler')).toBeInTheDocument()
    expect(screen.getByTestId('dashboard-visual-widget-widget-temperature')).toBeInTheDocument()
    expect(screen.getByTestId('dashboard-visual-connection-connection-main-line-0')).toBeInTheDocument()

    await waitFor(() => {
      expect(dispatchWorkspaceRuntimeHarness.startSession).toHaveBeenCalledTimes(1)
    })
    expect(dispatchWorkspaceRuntimeHarness.startSession).toHaveBeenCalledWith(
      expect.objectContaining({ edgeId: 'edge-visual-1' }),
    )

    const user = userEvent.setup()
    await waitFor(() => {
      expect(
        within(screen.getByTestId('dispatch-action-slot')).getByRole('button', { name: 'Fit to view' }),
      ).toBeInTheDocument()
    })
    expect(within(screen.getByTestId('dispatch-action-slot')).getByRole('button', { name: 'Details' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
    expect(within(visualSurface).queryByRole('button', { name: 'Fit to view' })).not.toBeInTheDocument()
    expect(within(visualSurface).queryByRole('button', { name: 'Details' })).not.toBeInTheDocument()

    await user.click(within(screen.getByTestId('dispatch-action-slot')).getByRole('button', { name: 'Fit to view' }))
    expect(screen.getByTestId('dashboard-visual-stage')).toBeInTheDocument()

    await user.click(within(screen.getByTestId('dispatch-action-slot')).getByRole('button', { name: 'Details' }))
    expect(await screen.findByTestId('dashboard-diagnostics-panel')).toBeInTheDocument()
    expect(within(screen.getByTestId('dispatch-action-slot')).getByRole('button', { name: 'Details' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )

    act(() => {
      dispatchWorkspaceRuntimeHarness.emitAlarmIncidentChanged(
        createDispatchUnclosedAlarmIncidentChangedEventFixture({
          edgeId: 'edge-visual-1',
          incident: { incidentId: 'dispatch-incident-1', edgeId: 'edge-visual-1' },
        }),
      )
    })

    await waitFor(() => {
      expect(
        within(screen.getByTestId('dispatch-action-slot')).getByTestId('dashboard-alarm-red-light-count'),
      ).toHaveTextContent('1')
    })

    await user.click(within(screen.getByRole('tablist', { name: 'Dispatch tabs' })).getByRole('tab', { name: 'Telemetry' }))
    await waitFor(() => {
      expect(canonicalRoute.router.state.location.pathname).toBe('/hub/dispatch/telemetry')
    })
    const telemetrySearchParams = new URLSearchParams(canonicalRoute.router.state.location.search)
    expect(telemetrySearchParams.get('diagramId')).toBe(dashboardVisualDiagram._id)
    expect(telemetrySearchParams.get('edgeId')).toBe('edge-visual-1')
    expect(
      within(screen.getByRole('tablist', { name: 'Dispatch tabs' })).getByRole('tab', {
        name: 'Telemetry',
      }),
    ).toHaveAttribute('aria-selected', 'true')
    expect(await screen.findByRole('heading', { name: 'Telemetry placeholder' })).toBeInTheDocument()
    expect(within(screen.getByTestId('dispatch-action-slot')).queryByRole('button', { name: 'Fit to view' })).not.toBeInTheDocument()
    expect(within(screen.getByTestId('dispatch-action-slot')).queryByRole('button', { name: 'Details' })).not.toBeInTheDocument()
    expect(within(screen.getByTestId('dispatch-action-slot')).queryByTestId('dashboard-alarm-red-light-indicator')).not.toBeInTheDocument()
    expect(dispatchWorkspaceRuntimeHarness.startSession).toHaveBeenCalledTimes(1)
    canonicalRoute.renderResult.unmount()

    dispatchWorkspaceRuntimeHarness.reset()
    const legacyRoute = renderDispatchWorkspaceRoute(
      `/hub/dashboard?diagramId=${dashboardVisualDiagram._id}&edgeId=edge-visual-1`,
    )

    await waitFor(() => {
      expect(legacyRoute.router.state.location.pathname).toBe('/hub/dispatch/dashboard')
    })
    const legacySearchParams = new URLSearchParams(legacyRoute.router.state.location.search)
    expect(legacySearchParams.get('diagramId')).toBe(dashboardVisualDiagram._id)
    expect(legacySearchParams.get('edgeId')).toBe('edge-visual-1')

    expect(await screen.findByRole('tab', { name: 'Dashboard' })).toHaveAttribute(
      'aria-selected',
      'true',
    )

    await waitFor(() => {
      expect(dispatchWorkspaceRuntimeHarness.startSession).toHaveBeenCalledTimes(1)
    })
    expect(dispatchWorkspaceRuntimeHarness.startSession).toHaveBeenCalledWith(
      expect.objectContaining({ edgeId: 'edge-visual-1' }),
    )
  })

  it('proves Edge switch isolation, placeholder action cleanup, and Dashboard action restoration in one flow', async () => {
    setupDispatchWorkspaceRestFixtures({
      dashboard: {
        ...createDashboardVisualRestFixtures(),
        trustedEdges: [
          {
            _id: 'edge-visual-1',
            name: 'Visual Edge',
            lifecycleState: 'Active',
            availability: {
              online: true,
              lastSeenAt: '2026-04-24T08:14:30.000Z',
            },
          },
          {
            _id: 'edge-visual-2',
            name: 'Backup Visual Edge',
            lifecycleState: 'Active',
            availability: {
              online: true,
              lastSeenAt: '2026-04-24T08:15:30.000Z',
            },
          },
        ],
        bindingProfilesByDiagramId: {
          [dashboardVisualDiagram._id]: [
            dashboardVisualBindingProfile,
            {
              ...dashboardVisualBindingProfile,
              _id: 'binding-visual-2',
              edgeServerId: 'edge-visual-2',
            },
          ],
        },
      },
      userEdge: {
        catalogByEdgeId: {
          'edge-visual-2': {
            ...dashboardVisualCatalog,
            edgeServerId: 'edge-visual-2',
          },
        },
      },
    })

    const route = renderDispatchWorkspaceRoute(
      `/hub/dispatch/dashboard?diagramId=${dashboardVisualDiagram._id}&edgeId=edge-visual-1`,
    )
    const user = userEvent.setup()

    await waitFor(() => {
      expect(dispatchWorkspaceRuntimeHarness.startSession).toHaveBeenCalledWith(
        expect.objectContaining({ edgeId: 'edge-visual-1' }),
      )
    })
    await waitFor(() => {
      expect(
        within(screen.getByTestId('dispatch-action-slot')).getByRole('button', {
          name: 'Fit to view',
        }),
      ).toBeInTheDocument()
    })

    act(() => {
      dispatchWorkspaceRuntimeHarness.emitAlarmIncidentChanged(
        createDispatchUnclosedAlarmIncidentChangedEventFixture({
          edgeId: 'edge-visual-1',
          incident: {
            incidentId: 'dispatch-incident-edge-1',
            edgeId: 'edge-visual-1',
          },
        }),
      )
    })

    await waitFor(() => {
      expect(
        within(screen.getByTestId('dispatch-action-slot')).getByTestId(
          'dashboard-alarm-red-light-count',
        ),
      ).toHaveTextContent('1')
    })
    expect(screen.getByTestId('dashboard-alarm-incident-row-dispatch-incident-edge-1')).toBeInTheDocument()

    await user.selectOptions(screen.getByRole('combobox', { name: 'Edge Server' }), 'edge-visual-2')

    await waitFor(() => {
      expect(route.router.state.location.search).toContain('edgeId=edge-visual-2')
    })
    await waitFor(() => {
      expect(dispatchWorkspaceRuntimeHarness.getDisposeCount('edge-visual-1')).toBe(1)
      expect(dispatchWorkspaceRuntimeHarness.startSession).toHaveBeenCalledWith(
        expect.objectContaining({ edgeId: 'edge-visual-2' }),
      )
    })
    await waitFor(() => {
      expect(
        within(screen.getByTestId('dispatch-action-slot')).queryByTestId(
          'dashboard-alarm-red-light-indicator',
        ),
      ).not.toBeInTheDocument()
      expect(
        screen.queryByTestId('dashboard-alarm-incident-row-dispatch-incident-edge-1'),
      ).not.toBeInTheDocument()
    })
    expect(dispatchWorkspaceRuntimeHarness.startSession).toHaveBeenCalledTimes(2)

    await user.click(
      within(screen.getByRole('tablist', { name: 'Dispatch tabs' })).getByRole('tab', {
        name: 'Telemetry',
      }),
    )

    await waitFor(() => {
      expect(route.router.state.location.pathname).toBe('/hub/dispatch/telemetry')
    })
    expect(dispatchWorkspaceRuntimeHarness.getDisposeCount('edge-visual-2')).toBe(1)
    expect(dispatchWorkspaceRuntimeHarness.startSession).toHaveBeenCalledTimes(2)
    expect(
      within(screen.getByTestId('dispatch-action-slot')).queryByRole('button', {
        name: 'Fit to view',
      }),
    ).not.toBeInTheDocument()
    expect(
      within(screen.getByTestId('dispatch-action-slot')).queryByRole('button', { name: 'Details' }),
    ).not.toBeInTheDocument()
    expect(
      within(screen.getByTestId('dispatch-action-slot')).queryByTestId(
        'dashboard-alarm-red-light-indicator',
      ),
    ).not.toBeInTheDocument()

    await user.click(
      within(screen.getByRole('tablist', { name: 'Dispatch tabs' })).getByRole('tab', {
        name: 'Dashboard',
      }),
    )

    await waitFor(() => {
      expect(route.router.state.location.pathname).toBe('/hub/dispatch/dashboard')
    })
    await waitFor(() => {
      expect(dispatchWorkspaceRuntimeHarness.startSession).toHaveBeenCalledTimes(3)
      expect(dispatchWorkspaceRuntimeHarness.startSession).toHaveBeenLastCalledWith(
        expect.objectContaining({ edgeId: 'edge-visual-2' }),
      )
      expect(
        within(screen.getByTestId('dispatch-action-slot')).getByRole('button', {
          name: 'Fit to view',
        }),
      ).toBeInTheDocument()
    })
    expect(
      within(screen.getByTestId('dispatch-action-slot')).queryByTestId(
        'dashboard-alarm-red-light-indicator',
      ),
    ).not.toBeInTheDocument()
    expect(screen.queryByTestId('dashboard-alarm-incident-row-dispatch-incident-edge-1')).not.toBeInTheDocument()
  })
})
