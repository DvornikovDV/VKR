import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createDashboardVisualRestFixtures,
  dashboardVisualBindingProfile,
  dashboardVisualCatalog,
  dashboardVisualDiagram,
} from '../fixtures/dashboardVisualLayout'
import { useAuthStore } from '@/shared/store/useAuthStore'
import * as telemetryHistoryApi from '@/shared/api/telemetryHistory'
import { ackAlarmIncident, listAlarmIncidents } from '@/shared/api/alarmIncidents'
import { listCommandAudit } from '@/shared/api/commands'
import {
  authenticateDispatchWorkspaceUser,
  createDispatchActiveAcknowledgedAlarmIncidentProjectionFixture,
  createDispatchActiveUnacknowledgedAlarmIncidentProjectionFixture,
  createDispatchAlarmIncidentListResponseFixture,
  createDispatchClosedAlarmIncidentProjectionFixture,
  createDispatchCommandAuditResponseFixture,
  createDispatchCommandAuditRowFixture,
  createDispatchLiveTelemetryMultiEdgeBindingProfilesFixture,
  createDispatchWorkspaceDeferred,
  createDispatchTelemetryHistoryResponseFixture,
  createDispatchUnclosedAlarmIncidentChangedEventFixture,
  createDispatchTelemetryEventFixture,
  dispatchWorkspaceTrendsCatalog,
  dispatchWorkspaceRuntimeHarness,
  dispatchWorkspaceRuntimeSocketHarness,
  renderDispatchWorkspaceRoute,
  setupDispatchWorkspaceRestFixtures,
  type DispatchCommandAuditFixtureRequest,
} from './helpers/dispatchWorkspaceHarness'
import { server } from '../mocks/server'

vi.mock('@/features/dashboard/services/cloudRuntimeClient', async () => {
  const actual = await vi.importActual<typeof import('@/features/dashboard/services/cloudRuntimeClient')>(
    '@/features/dashboard/services/cloudRuntimeClient',
  )
  const {
    dashboardRuntimeClientHarness,
    dashboardRuntimeSocketHarness,
  } = await import('./helpers/mockDashboardRuntimeSocket')
  const telemetryOnlyRuntimeClient = actual.createCloudRuntimeClient(
    dashboardRuntimeSocketHarness.socketFactory,
  )

  return {
    ...actual,
    cloudRuntimeClient: {
      startSession: dashboardRuntimeClientHarness.startSession,
      startTelemetryOnlySession: telemetryOnlyRuntimeClient.startTelemetryOnlySession,
    },
  }
})

beforeEach(() => {
  dispatchWorkspaceRuntimeHarness.reset()
  dispatchWorkspaceRuntimeSocketHarness.reset()
  authenticateDispatchWorkspaceUser()
})

afterEach(() => {
  vi.restoreAllMocks()
  act(() => {
    useAuthStore.setState({ session: null, isAuthenticated: false })
  })
})

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })

  return { promise, resolve, reject }
}

function getSelectOptionValues(select: HTMLSelectElement): string[] {
  return Array.from(select.options).map((option) => option.value)
}

async function findComboboxByOptionValue(value: string): Promise<HTMLSelectElement> {
  let matchedSelect: HTMLSelectElement | undefined

  await waitFor(() => {
    matchedSelect = (screen.getAllByRole('combobox') as HTMLSelectElement[]).find((select) =>
      getSelectOptionValues(select).includes(value),
    )
    expect(matchedSelect).toBeDefined()
  })

  return matchedSelect as HTMLSelectElement
}

describe('DispatchWorkspacePage routing', () => {
  it('lets the Dispatch harness mock command audit GET responses with the Cloud list query shape', async () => {
    const commandAuditRequests: Array<{
      edgeId: string
      page: string | null
      limit: string | null
      status: string | null
    }> = []
    const response = createDispatchCommandAuditResponseFixture({
      audits: [
        createDispatchCommandAuditRowFixture({
          requestId: 'command-audit-request-timeout',
          status: 'timeout',
          failureReason: 'edge_command_timeout',
        }),
      ],
      page: 2,
      limit: 25,
      total: 26,
      hasNextPage: true,
    })

    setupDispatchWorkspaceRestFixtures({
      commandAudit: {
        resolve: (request) => {
          commandAuditRequests.push(request)
          return response
        },
      },
    })

    await expect(
      listCommandAudit('edge-visual-1', {
        page: 2,
        limit: 25,
        status: 'timeout',
      }),
    ).resolves.toEqual(response)

    expect(commandAuditRequests).toEqual([
      {
        edgeId: 'edge-visual-1',
        page: '2',
        limit: '25',
        status: 'timeout',
      },
    ])
    expect(dispatchWorkspaceRuntimeHarness.startSession).not.toHaveBeenCalled()
  })

  it('lets the Dispatch harness drive alarm incident list and ACK through shared Cloud helpers', async () => {
    const listedIncident = createDispatchActiveUnacknowledgedAlarmIncidentProjectionFixture({
      incidentId: 'dispatch-alarm-list-1',
      edgeId: 'edge-visual-1',
    })
    const acknowledgedIncident = createDispatchActiveAcknowledgedAlarmIncidentProjectionFixture({
      incidentId: listedIncident.incidentId,
      edgeId: listedIncident.edgeId,
      acknowledgedAt: '2026-05-09T10:06:00.000Z',
      acknowledgedBy: 'dispatch-user-1',
    })
    const deferredList = createDispatchWorkspaceDeferred<ReturnType<typeof createDispatchAlarmIncidentListResponseFixture>>()
    const deferredAck = createDispatchWorkspaceDeferred<typeof acknowledgedIncident>()
    const fixtures = setupDispatchWorkspaceRestFixtures({
      alarmIncidents: {
        list: {
          resolve: () => deferredList.promise,
        },
        ack: {
          resolve: () => deferredAck.promise,
        },
      },
    })

    const listPromise = listAlarmIncidents('edge-visual-1', {
      state: 'unclosed',
      page: 2,
      limit: 25,
      sort: 'latest',
      order: 'desc',
    })
    await waitFor(() => {
      expect(fixtures.dispatchAlarmIncidents.listRequests).toEqual([
        {
          edgeId: 'edge-visual-1',
          state: 'unclosed',
          page: '2',
          limit: '25',
          sort: 'latest',
          order: 'desc',
        },
      ])
    })
    deferredList.resolve(
      createDispatchAlarmIncidentListResponseFixture({
        incidents: [listedIncident],
        page: 2,
        limit: 25,
        total: 26,
        hasNextPage: true,
      }),
    )
    await expect(listPromise).resolves.toEqual({
      incidents: [listedIncident],
      page: 2,
      limit: 25,
      total: 26,
      hasNextPage: true,
    })

    const ackPromise = ackAlarmIncident('edge-visual-1', listedIncident.incidentId)
    await waitFor(() => {
      expect(fixtures.dispatchAlarmIncidents.ackRequests).toEqual([
        {
          edgeId: 'edge-visual-1',
          incidentId: listedIncident.incidentId,
        },
      ])
    })
    deferredAck.resolve(acknowledgedIncident)
    await expect(ackPromise).resolves.toEqual(acknowledgedIncident)
    expect(dispatchWorkspaceRuntimeHarness.startSession).not.toHaveBeenCalled()
  })

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
    expect(screen.getByTestId('dispatch-live-telemetry-tab')).toHaveAttribute(
      'data-edge-id',
      'edge-visual-1',
    )
    await waitFor(() => {
      expect(dispatchWorkspaceRuntimeSocketHarness.getLastSubscribePayload()).toEqual({
        edgeId: 'edge-visual-1',
      })
    })
    expect(within(screen.getByTestId('dispatch-action-slot')).queryByRole('button', { name: 'Fit to view' })).not.toBeInTheDocument()
    expect(within(screen.getByTestId('dispatch-action-slot')).queryByRole('button', { name: 'Details' })).not.toBeInTheDocument()
    expect(within(screen.getByTestId('dispatch-action-slot')).queryByTestId('dashboard-alarm-red-light-indicator')).not.toBeInTheDocument()
    expect(dispatchWorkspaceRuntimeHarness.startSession).toHaveBeenCalledTimes(1)

    await user.click(within(screen.getByRole('tablist', { name: 'Dispatch tabs' })).getByRole('tab', { name: 'Commands' }))
    await waitFor(() => {
      expect(canonicalRoute.router.state.location.pathname).toBe('/hub/dispatch/commands')
    })
    await waitFor(() => {
      expect(screen.getByTestId('dispatch-command-audit-tab')).toHaveAttribute(
        'data-edge-id',
        'edge-visual-1',
      )
    })
    expect(screen.queryByTestId('dispatch-placeholder-context')).not.toBeInTheDocument()
    expect(dispatchWorkspaceRuntimeHarness.startSession).toHaveBeenCalledTimes(1)

    await user.click(within(screen.getByRole('tablist', { name: 'Dispatch tabs' })).getByRole('tab', { name: 'Alarms' }))
    await waitFor(() => {
      expect(canonicalRoute.router.state.location.pathname).toBe('/hub/dispatch/alarms')
    })
    await waitFor(() => {
      expect(screen.getByTestId('dispatch-alarm-journal-tab')).toHaveAttribute(
        'data-edge-id',
        'edge-visual-1',
      )
    })
    expect(screen.queryByTestId('dispatch-placeholder-context')).not.toBeInTheDocument()
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
    const commandRequests: Array<{ edgeId: string; body: unknown }> = []
    let releaseEdgeOneCommand: () => void = () => {}

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
    server.use(
      http.post('/api/edge-servers/:edgeId/commands', async ({ params, request }) => {
        const edgeId = String(params.edgeId)
        commandRequests.push({
          edgeId,
          body: await request.json(),
        })

        if (edgeId !== 'edge-visual-1') {
          return HttpResponse.json({
            status: 'success',
            data: { requestId: `dispatch-command-${edgeId}`, commandStatus: 'confirmed' },
          })
        }

        return new Promise((resolve) => {
          releaseEdgeOneCommand = () =>
            resolve(
              HttpResponse.json({
                status: 'success',
                data: { requestId: 'dispatch-command-stale-1', commandStatus: 'confirmed' },
              }),
            )
        })
      }),
    )

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
      dispatchWorkspaceRuntimeHarness.emitTelemetry(
        createDispatchTelemetryEventFixture({
          edgeId: 'edge-visual-1',
          readings: [
            { deviceId: 'pump-1', metric: 'running', last: false, ts: 1763895000000 },
          ],
        }),
      )
    })
    await user.click(await screen.findByRole('button', { name: 'Command toggle widget-command-toggle' }))
    await waitFor(() => {
      expect(commandRequests).toEqual([
        {
          edgeId: 'edge-visual-1',
          body: {
            deviceId: 'pump-1',
            commandType: 'set_bool',
            payload: { value: true },
          },
        },
      ])
      expect(screen.getByTestId('dashboard-command-state-widget-command-toggle')).toHaveTextContent(
        'pending',
      )
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
      expect(screen.queryByTestId('dashboard-command-state-widget-command-toggle')).not.toBeInTheDocument()
    })
    await act(async () => {
      releaseEdgeOneCommand()
    })
    await waitFor(() => {
      expect(screen.queryByTestId('dashboard-command-state-widget-command-toggle')).not.toBeInTheDocument()
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

  it('proves Dispatch Live Telemetry route uses the selected binding profile without Dashboard runtime side effects', async () => {
    setupDispatchWorkspaceRestFixtures({
      dashboard: {
        ...createDashboardVisualRestFixtures(),
        bindingProfilesByDiagramId: {
          [dashboardVisualDiagram._id]: [
            {
              ...dashboardVisualBindingProfile,
              widgetBindings: [
                { widgetId: 'widget-temperature', deviceId: 'boiler-1', metric: 'temperature' },
                { widgetId: 'widget-command-toggle', deviceId: 'pump-1', metric: 'running' },
              ],
            },
          ],
        },
      },
    })

    renderDispatchWorkspaceRoute(
      `/hub/dispatch/telemetry?diagramId=${dashboardVisualDiagram._id}&edgeId=edge-visual-1`,
    )

    const telemetryTab = await screen.findByTestId('dispatch-live-telemetry-tab')
    expect(telemetryTab).toHaveAttribute('data-edge-id', 'edge-visual-1')
    expect(screen.queryByTestId('dispatch-placeholder-context')).not.toBeInTheDocument()

    await waitFor(() => {
      expect(dispatchWorkspaceRuntimeSocketHarness.getLastSubscribePayload()).toEqual({
        edgeId: 'edge-visual-1',
      })
    })
    expect(dispatchWorkspaceRuntimeSocketHarness.getEmittedEvents()).toEqual([
      { event: 'subscribe', payload: { edgeId: 'edge-visual-1' } },
    ])
    expect(dispatchWorkspaceRuntimeHarness.startSession).not.toHaveBeenCalled()
    expect(screen.queryByTestId('dashboard-visual-surface')).not.toBeInTheDocument()
    expect(screen.queryByTestId('dashboard-alarm-red-light-indicator')).not.toBeInTheDocument()

    act(() => {
      dispatchWorkspaceRuntimeSocketHarness.emitRemovedConnectError(
        new Error('late stale transport error'),
      )
      dispatchWorkspaceRuntimeSocketHarness.emitRemovedTelemetry(
        createDispatchTelemetryEventFixture({
          edgeId: 'edge-visual-1',
          readings: [
            { deviceId: 'boiler-1', metric: 'temperature', last: 98, ts: 1779000003500 },
          ],
          serverTs: 1779000003600,
        }),
      )
      dispatchWorkspaceRuntimeSocketHarness.emitTelemetry(
        createDispatchTelemetryEventFixture({
          edgeId: 'edge-visual-1',
          readings: [
            { deviceId: 'boiler-1', metric: 'temperature', last: 71.5, ts: 1779000001000 },
            { deviceId: 'boiler-1', metric: 'unbound', last: 99, ts: 1779000001000 },
          ],
          serverTs: 1779000001100,
        }),
      )
      dispatchWorkspaceRuntimeSocketHarness.emitTelemetry(
        createDispatchTelemetryEventFixture({
          edgeId: 'edge-visual-2',
          readings: [
            { deviceId: 'boiler-1', metric: 'temperature', last: 88.8, ts: 1779000002000 },
          ],
          serverTs: 1779000002100,
        }),
      )
      dispatchWorkspaceRuntimeSocketHarness.emitTelemetry(
        createDispatchTelemetryEventFixture({
          edgeId: 'edge-visual-1',
          readings: [
            { deviceId: 'boiler-1', metric: 'temperature', last: 72.1, ts: 1779000002500 },
          ],
          serverTs: 1779000002600,
        }),
      )
      dispatchWorkspaceRuntimeSocketHarness.emitTelemetry(
        createDispatchTelemetryEventFixture({
          edgeId: 'edge-visual-1',
          readings: [
            { deviceId: 'pump-1', metric: 'running', last: true, ts: 1779000003000 },
          ],
          serverTs: 1779000003100,
        }),
      )
    })

    const rows = await screen.findAllByTestId('dispatch-live-telemetry-row')
    expect(rows).toHaveLength(3)
    expect(rows[0]).toHaveAttribute('data-edge-id', 'edge-visual-1')
    expect(rows[0]).toHaveAttribute('data-device-id', 'pump-1')
    expect(rows[0]).toHaveAttribute('data-metric', 'running')
    expect(within(rows[0]).getByText('true')).toBeInTheDocument()
    expect(rows[1]).toHaveAttribute('data-edge-id', 'edge-visual-1')
    expect(rows[1]).toHaveAttribute('data-device-id', 'boiler-1')
    expect(rows[1]).toHaveAttribute('data-metric', 'temperature')
    expect(within(rows[1]).getByText('72.1')).toBeInTheDocument()
    expect(rows[2]).toHaveAttribute('data-edge-id', 'edge-visual-1')
    expect(rows[2]).toHaveAttribute('data-device-id', 'boiler-1')
    expect(rows[2]).toHaveAttribute('data-metric', 'temperature')
    expect(within(rows[2]).getByText('71.5')).toBeInTheDocument()
    expect(screen.queryByText('88.8')).not.toBeInTheDocument()
    expect(screen.queryByText('99')).not.toBeInTheDocument()
    expect(screen.getByTestId('dispatch-live-telemetry-transport-status')).toHaveAttribute(
      'data-transport-status',
      'connected',
    )
  })

  it('proves Dispatch Live Telemetry pause buffering and selected context cleanup', async () => {
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
          [dashboardVisualDiagram._id]: createDispatchLiveTelemetryMultiEdgeBindingProfilesFixture(),
        },
      },
    })

    const route = renderDispatchWorkspaceRoute(
      `/hub/dispatch/telemetry?diagramId=${dashboardVisualDiagram._id}&edgeId=edge-visual-1`,
    )
    const user = userEvent.setup()

    await waitFor(() => {
      expect(dispatchWorkspaceRuntimeSocketHarness.getLastSubscribePayload()).toEqual({
        edgeId: 'edge-visual-1',
      })
    })

    act(() => {
      dispatchWorkspaceRuntimeSocketHarness.emitTelemetry(
        createDispatchTelemetryEventFixture({
          edgeId: 'edge-visual-1',
          readings: [
            { deviceId: 'boiler-1', metric: 'temperature', last: 40, ts: 1779000001000 },
          ],
          serverTs: 1779000001100,
        }),
      )
    })

    let rows = await screen.findAllByTestId('dispatch-live-telemetry-row')
    expect(rows).toHaveLength(1)
    expect(within(rows[0]).getByText('40')).toBeInTheDocument()

    const actionSlot = screen.getByTestId('dispatch-action-slot')
    await user.click(
      within(actionSlot).getByRole('button', { name: 'Pause live telemetry' }),
    )
    expect(
      within(actionSlot).getByRole('button', { name: 'Resume live telemetry' }),
    ).toBeInTheDocument()

    act(() => {
      dispatchWorkspaceRuntimeSocketHarness.emitTelemetry(
        createDispatchTelemetryEventFixture({
          edgeId: 'edge-visual-1',
          readings: [
            { deviceId: 'boiler-1', metric: 'temperature', last: 41, ts: 1779000002000 },
          ],
          serverTs: 1779000002100,
        }),
      )
      dispatchWorkspaceRuntimeSocketHarness.emitTelemetry(
        createDispatchTelemetryEventFixture({
          edgeId: 'edge-visual-1',
          readings: [
            { deviceId: 'pump-1', metric: 'running', last: true, ts: 1779000003000 },
          ],
          serverTs: 1779000003100,
        }),
      )
    })

    await waitFor(() => {
      expect(screen.getByTestId('dispatch-live-telemetry-toolbar-summary')).toHaveTextContent(
        '1 rows visible | 2 newer waiting',
      )
      expect(screen.getByTestId('dispatch-live-telemetry-action-summary')).toHaveTextContent(
        '1 visible | 2 waiting | connected',
      )
    })
    rows = screen.getAllByTestId('dispatch-live-telemetry-row')
    expect(rows).toHaveLength(1)
    expect(within(rows[0]).getByText('40')).toBeInTheDocument()
    expect(screen.queryByText('41')).not.toBeInTheDocument()
    expect(screen.queryByText('true')).not.toBeInTheDocument()
    expect(dispatchWorkspaceRuntimeSocketHarness.spies.disconnect).not.toHaveBeenCalled()

    await user.click(
      within(actionSlot).getByRole('button', { name: 'Resume live telemetry' }),
    )
    await waitFor(() => {
      expect(screen.getAllByTestId('dispatch-live-telemetry-row')).toHaveLength(3)
      expect(screen.getByTestId('dispatch-live-telemetry-toolbar-summary')).toHaveTextContent(
        '3 rows visible | 0 newer waiting',
      )
    })
    expect(screen.getByText('41')).toBeInTheDocument()
    expect(screen.getByText('true')).toBeInTheDocument()

    act(() => {
      dispatchWorkspaceRuntimeSocketHarness.emitConnectError(new Error('stale transport error'))
    })
    expect(await screen.findByTestId('dispatch-live-telemetry-error')).toHaveTextContent(
      'stale transport error',
    )

    await user.selectOptions(screen.getByRole('combobox', { name: 'Edge Server' }), 'edge-visual-2')
    await waitFor(() => {
      expect(route.router.state.location.search).toContain('edgeId=edge-visual-2')
      expect(screen.getByTestId('dispatch-live-telemetry-tab')).toHaveAttribute(
        'data-edge-id',
        'edge-visual-2',
      )
      expect(screen.getByTestId('dispatch-live-telemetry-tab')).toHaveAttribute(
        'data-binding-profile-id',
        'binding-visual-2',
      )
    })
    await waitFor(() => {
      expect(dispatchWorkspaceRuntimeSocketHarness.getLastSubscribePayload()).toEqual({
        edgeId: 'edge-visual-2',
      })
    })
    expect(screen.queryByTestId('dispatch-live-telemetry-error')).not.toBeInTheDocument()
    expect(screen.queryAllByTestId('dispatch-live-telemetry-row')).toHaveLength(0)
    expect(screen.getByTestId('dispatch-live-telemetry-toolbar-summary')).toHaveTextContent(
      '0 rows visible | 0 newer waiting',
    )
    expect(screen.getByTestId('dispatch-live-telemetry-pause-state')).toHaveAttribute(
      'data-paused',
      'false',
    )

    act(() => {
      dispatchWorkspaceRuntimeSocketHarness.emitTelemetry(
        createDispatchTelemetryEventFixture({
          edgeId: 'edge-visual-1',
          readings: [
            { deviceId: 'boiler-1', metric: 'temperature', last: 99, ts: 1779000004000 },
          ],
          serverTs: 1779000004100,
        }),
      )
      dispatchWorkspaceRuntimeSocketHarness.emitTelemetry(
        createDispatchTelemetryEventFixture({
          edgeId: 'edge-visual-2',
          readings: [
            { deviceId: 'boiler-1', metric: 'temperature', last: 100, ts: 1779000005000 },
            { deviceId: 'pump-2', metric: 'pressure', last: 12.3, ts: 1779000006000 },
          ],
          serverTs: 1779000006100,
        }),
      )
    })

    rows = await screen.findAllByTestId('dispatch-live-telemetry-row')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toHaveAttribute('data-edge-id', 'edge-visual-2')
    expect(rows[0]).toHaveAttribute('data-device-id', 'pump-2')
    expect(rows[0]).toHaveAttribute('data-metric', 'pressure')
    expect(within(rows[0]).getByText('12.3')).toBeInTheDocument()
    expect(screen.queryByText('98')).not.toBeInTheDocument()
    expect(screen.queryByText('99')).not.toBeInTheDocument()
    expect(screen.queryByText('100')).not.toBeInTheDocument()
    expect(screen.queryByText('late stale transport error')).not.toBeInTheDocument()
    expect(dispatchWorkspaceRuntimeHarness.startSession).not.toHaveBeenCalled()
  })

  it('proves Dispatch Trends route uses selected context, helper history loading, same-response render, and stale response rejection', async () => {
    const telemetryHistorySpy = vi.spyOn(telemetryHistoryApi, 'getTelemetryHistory')
    const edgeOneHistory = createDeferred<telemetryHistoryApi.TelemetryHistoryResponse>()
    const edgeTwoHistory = createDeferred<telemetryHistoryApi.TelemetryHistoryResponse>()
    const historyRequests: string[] = []

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
          'edge-visual-1': dispatchWorkspaceTrendsCatalog,
          'edge-visual-2': {
            ...dashboardVisualCatalog,
            edgeServerId: 'edge-visual-2',
            telemetry: [
              {
                deviceId: 'boiler-2',
                metric: 'pressure',
                valueType: 'number',
                label: 'Backup pressure',
              },
              {
                deviceId: 'pump-2',
                metric: 'running',
                valueType: 'boolean',
                label: 'Backup pump running',
              },
            ],
          },
        },
      },
      telemetryHistory: {
        resolve: (request) => {
          historyRequests.push(`${request.edgeId}:${request.deviceId}:${request.metric}`)
          return request.edgeId === 'edge-visual-1'
            ? edgeOneHistory.promise
            : edgeTwoHistory.promise
        },
      },
    })

    const route = renderDispatchWorkspaceRoute(
      `/hub/dispatch/trends?diagramId=${dashboardVisualDiagram._id}&edgeId=edge-visual-1`,
    )
    const user = userEvent.setup()

    await waitFor(() => {
      expect(route.router.state.location.pathname).toBe('/hub/dispatch/trends')
    })
    const initialSearchParams = new URLSearchParams(route.router.state.location.search)
    expect(initialSearchParams.get('diagramId')).toBe(dashboardVisualDiagram._id)
    expect(initialSearchParams.get('edgeId')).toBe('edge-visual-1')
    await waitFor(() => {
      expect(screen.getByTestId('dispatch-trends-tab')).toHaveAttribute(
        'data-edge-id',
        'edge-visual-1',
      )
    })
    expect(screen.queryByTestId('dispatch-placeholder-context')).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Diagram' })).toHaveValue(
      dashboardVisualDiagram._id,
    )
    expect(screen.getByRole('combobox', { name: 'Edge Server' })).toHaveValue('edge-visual-1')
    expect(dispatchWorkspaceRuntimeHarness.startSession).not.toHaveBeenCalled()

    const metricSelect = await findComboboxByOptionValue('boiler-1:temperature')
    expect(getSelectOptionValues(metricSelect)).toEqual(
      expect.arrayContaining(['boiler-1:temperature', 'boiler-1:flowRate']),
    )
    expect(getSelectOptionValues(metricSelect)).not.toContain('pump-1:running')

    await user.selectOptions(metricSelect, 'boiler-1:temperature')
    await user.click(screen.getByTestId('dispatch-trends-refresh'))

    await waitFor(() => {
      expect(telemetryHistorySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          edgeId: 'edge-visual-1',
          deviceId: 'boiler-1',
          metric: 'temperature',
          maxPoints: 300,
        }),
      )
    })
    expect(dispatchWorkspaceRuntimeHarness.startSession).not.toHaveBeenCalled()

    await user.selectOptions(screen.getByRole('combobox', { name: 'Edge Server' }), 'edge-visual-2')
    await waitFor(() => {
      expect(route.router.state.location.search).toContain('edgeId=edge-visual-2')
    })
    const edgeTwoMetricSelect = await findComboboxByOptionValue('boiler-2:pressure')
    await user.selectOptions(edgeTwoMetricSelect, 'boiler-2:pressure')
    await user.click(screen.getByTestId('dispatch-trends-refresh'))

    edgeTwoHistory.resolve(
      createDispatchTelemetryHistoryResponseFixture({
        edgeId: 'edge-visual-2',
        deviceId: 'boiler-2',
        metric: 'pressure',
        series: [
          {
            timeStart: '2026-05-13T08:10:00.000Z',
            timeEnd: '2026-05-13T08:15:00.000Z',
            pointTime: '2026-05-13T08:12:30.000Z',
            min: 31,
            max: 42,
            avg: 37,
            last: 41,
            count: 24,
          },
        ],
      }),
    )

    expect(await screen.findByTestId('dispatch-trends-chart')).toHaveAttribute('data-value-mode', 'avg')
    const table = screen.getByTestId('dispatch-trends-table')
    expect(table.querySelector('time[datetime="2026-05-13T08:10:00.000Z"]')).toBeInTheDocument()
    expect(within(table).getByText('31')).toBeInTheDocument()
    expect(within(table).getByText('42')).toBeInTheDocument()
    expect(within(table).getByText('37')).toBeInTheDocument()
    expect(within(table).getByText('41')).toBeInTheDocument()
    expect(within(table).getByText('24')).toBeInTheDocument()

    edgeOneHistory.resolve(
      createDispatchTelemetryHistoryResponseFixture({
        edgeId: 'edge-visual-1',
        deviceId: 'boiler-1',
        metric: 'temperature',
        series: [
          {
            timeStart: '2026-05-13T08:00:00.000Z',
            timeEnd: '2026-05-13T08:05:00.000Z',
            pointTime: '2026-05-13T08:02:30.000Z',
            min: 10,
            max: 20,
            avg: 15,
            last: 19,
            count: 60,
          },
        ],
      }),
    )
    await waitFor(() => {
      const activeTable = screen.getByTestId('dispatch-trends-table')
      expect(
        activeTable.querySelector('time[datetime="2026-05-13T08:10:00.000Z"]'),
      ).toBeInTheDocument()
      expect(within(activeTable).queryByText('60')).not.toBeInTheDocument()
    })
    expect(historyRequests).toEqual([
      'edge-visual-1:boiler-1:temperature',
      'edge-visual-2:boiler-2:pressure',
    ])
    expect(dispatchWorkspaceRuntimeHarness.startSession).not.toHaveBeenCalled()
  })

  it('proves Dispatch Commands route uses selected Edge audit list, refresh, empty state, stale rejection, and no runtime session', async () => {
    const edgeOneStaleAudit = createDeferred<ReturnType<typeof createDispatchCommandAuditResponseFixture>>()
    const edgeTwoAudit = createDeferred<ReturnType<typeof createDispatchCommandAuditResponseFixture>>()
    const auditRequests: DispatchCommandAuditFixtureRequest[] = []
    let edgeOneRequestCount = 0

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
      commandAudit: {
        resolve: (request) => {
          auditRequests.push(request)

          if (request.edgeId === 'edge-visual-1') {
            edgeOneRequestCount += 1

            if (edgeOneRequestCount === 1) {
              return createDispatchCommandAuditResponseFixture({
                audits: [
                  createDispatchCommandAuditRowFixture({
                    requestId: 'command-audit-edge-1-initial',
                    edgeId: 'edge-visual-1',
                    deviceId: 'pump-1',
                    commandType: 'set_bool',
                    payload: { value: true },
                    requestedBy: 'dispatch-user-1',
                    requestedByEmail: 'dispatch.user@example.com',
                    requestedAt: '2026-05-14T08:00:00.000Z',
                    status: 'confirmed',
                    completedAt: '2026-05-14T08:00:02.000Z',
                    failureReason: null,
                  }),
                ],
              })
            }

            return edgeOneStaleAudit.promise
          }

          if (request.edgeId === 'edge-visual-2' && request.status === 'failed') {
            return createDispatchCommandAuditResponseFixture({
              audits: [],
              total: 0,
              hasNextPage: false,
            })
          }

          return edgeTwoAudit.promise
        },
      },
    })

    const route = renderDispatchWorkspaceRoute(
      `/hub/dispatch/commands?diagramId=${dashboardVisualDiagram._id}&edgeId=edge-visual-1`,
    )
    const user = userEvent.setup()

    await waitFor(() => {
      expect(route.router.state.location.pathname).toBe('/hub/dispatch/commands')
    })
    await waitFor(() => {
      expect(auditRequests[0]).toEqual({
        edgeId: 'edge-visual-1',
        page: '1',
        limit: '50',
        status: null,
      })
    })
    expect(dispatchWorkspaceRuntimeHarness.startSession).not.toHaveBeenCalled()

    const initialRow = await screen.findByTestId('dispatch-command-audit-row-command-audit-edge-1-initial')
    expect(within(initialRow).getByText('pump-1')).toBeInTheDocument()
    expect(within(initialRow).getByText('set_bool')).toBeInTheDocument()
    expect(within(initialRow).getByText('Confirmed')).toBeInTheDocument()
    expect(within(initialRow).getByText('dispatch.user@example.com')).toBeInTheDocument()
    expect(within(initialRow).queryByText('dispatch-user-1')).not.toBeInTheDocument()
    expect(within(initialRow).getByText('true')).toBeInTheDocument()

    await user.click(screen.getByTestId('dispatch-command-audit-refresh'))
    await waitFor(() => {
      expect(auditRequests).toHaveLength(2)
      expect(auditRequests[1]).toEqual({
        edgeId: 'edge-visual-1',
        page: '1',
        limit: '50',
        status: null,
      })
    })

    await user.selectOptions(screen.getByRole('combobox', { name: 'Edge Server' }), 'edge-visual-2')
    await waitFor(() => {
      expect(route.router.state.location.search).toContain('edgeId=edge-visual-2')
    })
    await waitFor(() => {
      expect(auditRequests[2]).toEqual({
        edgeId: 'edge-visual-2',
        page: '1',
        limit: '50',
        status: null,
      })
    })

    edgeTwoAudit.resolve(
      createDispatchCommandAuditResponseFixture({
        audits: [
          createDispatchCommandAuditRowFixture({
            requestId: 'command-audit-edge-2-current',
            edgeId: 'edge-visual-2',
            deviceId: 'pump-2',
            commandType: 'set_number',
            payload: { value: 42 },
            requestedBy: 'dispatch-user-2',
            requestedByEmail: 'dispatcher.two@example.com',
            requestedAt: '2026-05-14T08:05:00.000Z',
            status: 'failed',
            completedAt: '2026-05-14T08:05:03.000Z',
            failureReason: 'edge_command_failed',
          }),
        ],
      }),
    )

    const currentRow = await screen.findByTestId('dispatch-command-audit-row-command-audit-edge-2-current')
    expect(within(currentRow).getByText('pump-2')).toBeInTheDocument()
    expect(within(currentRow).getByText('set_number')).toBeInTheDocument()
    expect(within(currentRow).getByText('Failed')).toBeInTheDocument()
    expect(within(currentRow).getByText('Edge command failed')).toBeInTheDocument()
    expect(within(currentRow).getByText('dispatcher.two@example.com')).toBeInTheDocument()
    expect(within(currentRow).queryByText('dispatch-user-2')).not.toBeInTheDocument()
    expect(within(currentRow).getByText('42')).toBeInTheDocument()
    expect(screen.queryByTestId('dispatch-command-audit-row-command-audit-edge-1-initial')).not.toBeInTheDocument()

    edgeOneStaleAudit.resolve(
      createDispatchCommandAuditResponseFixture({
        audits: [
          createDispatchCommandAuditRowFixture({
            requestId: 'command-audit-edge-1-stale',
            edgeId: 'edge-visual-1',
            deviceId: 'stale-pump',
          }),
        ],
      }),
    )
    await waitFor(() => {
      expect(screen.getByTestId('dispatch-command-audit-row-command-audit-edge-2-current')).toBeInTheDocument()
      expect(screen.queryByTestId('dispatch-command-audit-row-command-audit-edge-1-stale')).not.toBeInTheDocument()
    })

    await user.selectOptions(screen.getByRole('combobox', { name: 'Command status' }), 'failed')
    await waitFor(() => {
      expect(auditRequests[3]).toEqual({
        edgeId: 'edge-visual-2',
        page: '1',
        limit: '50',
        status: 'failed',
      })
    })
    expect(await screen.findByTestId('dispatch-command-audit-empty')).toBeInTheDocument()
    expect(screen.queryByTestId('dispatch-command-audit-row-command-audit-edge-2-current')).not.toBeInTheDocument()
    expect(dispatchWorkspaceRuntimeHarness.startSession).not.toHaveBeenCalled()
  })

  it('proves Dispatch Alarms route loads the selected Edge journal over REST without Dashboard runtime session', async () => {
    const edgeOneStaleList = createDispatchWorkspaceDeferred<ReturnType<typeof createDispatchAlarmIncidentListResponseFixture>>()
    const activeIncident = createDispatchActiveUnacknowledgedAlarmIncidentProjectionFixture({
      incidentId: 'dispatch-alarm-active-1',
      edgeId: 'edge-visual-1',
      deviceId: 'boiler-1',
      metric: 'temperature',
      ruleId: 'high-temperature',
      latestValue: 92,
      activatedAt: '2026-05-09T10:00:00.000Z',
      rule: {
        ruleId: 'high-temperature',
        ruleRevision: '1',
        conditionType: 'high',
        triggerThreshold: 80,
        clearThreshold: 75,
        expectedValue: null,
        severity: 'danger',
        label: 'High temperature',
      },
    })
    const closedIncident = createDispatchClosedAlarmIncidentProjectionFixture({
      incidentId: 'dispatch-alarm-closed-2',
      edgeId: 'edge-visual-2',
      deviceId: 'pump-2',
      metric: 'running',
      ruleId: 'pump-running',
      latestValue: false,
      activatedAt: '2026-05-09T09:00:00.000Z',
      clearedAt: '2026-05-09T09:10:00.000Z',
      acknowledgedAt: '2026-05-09T09:12:00.000Z',
      rule: {
        ruleId: 'pump-running',
        ruleRevision: '2',
        conditionType: 'state',
        triggerThreshold: null,
        clearThreshold: null,
        expectedValue: true,
        severity: 'warning',
        label: 'Pump stopped',
      },
    })
    const alarmRequests: string[] = []
    let edgeTwoRequestCount = 0
    const fixtures = setupDispatchWorkspaceRestFixtures({
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
      alarmIncidents: {
        list: {
          resolve: (request) => {
            alarmRequests.push(`${request.edgeId}:${request.state}:${request.page}`)

            if (request.edgeId === 'edge-visual-1' && request.state === 'unclosed') {
              return edgeOneStaleList.promise
            }

            if (request.edgeId === 'edge-visual-2' && request.state === 'all') {
              return createDispatchAlarmIncidentListResponseFixture({
                incidents: [closedIncident],
                page: 1,
                limit: 50,
                total: 1,
                hasNextPage: false,
              })
            }

            edgeTwoRequestCount += 1

            return createDispatchAlarmIncidentListResponseFixture({
              incidents: [
                createDispatchActiveUnacknowledgedAlarmIncidentProjectionFixture({
                  incidentId: `dispatch-alarm-edge-2-page-${edgeTwoRequestCount}`,
                  edgeId: 'edge-visual-2',
                  deviceId: 'boiler-2',
                  metric: 'pressure',
                  ruleId: 'backup-pressure',
                  rule: {
                    ruleId: 'backup-pressure',
                    ruleRevision: '1',
                    conditionType: 'high',
                    triggerThreshold: 60,
                    clearThreshold: 55,
                    expectedValue: null,
                    severity: 'danger',
                    label: 'Backup pressure',
                  },
                }),
              ],
              page: edgeTwoRequestCount,
              limit: 50,
              total: 100,
              hasNextPage: edgeTwoRequestCount < 2,
            })
          },
        },
      },
    })

    const route = renderDispatchWorkspaceRoute(
      `/hub/dispatch/alarms?diagramId=${dashboardVisualDiagram._id}&edgeId=edge-visual-1`,
    )
    const user = userEvent.setup()

    await waitFor(() => {
      expect(fixtures.dispatchAlarmIncidents.listRequests[0]).toEqual({
        edgeId: 'edge-visual-1',
        state: 'unclosed',
        page: '1',
        limit: '50',
        sort: 'latest',
        order: 'desc',
      })
    })
    expect(dispatchWorkspaceRuntimeHarness.startSession).not.toHaveBeenCalled()

    await user.selectOptions(screen.getByRole('combobox', { name: 'Edge Server' }), 'edge-visual-2')
    await waitFor(() => {
      expect(route.router.state.location.search).toContain('edgeId=edge-visual-2')
    })
    await waitFor(() => {
      expect(fixtures.dispatchAlarmIncidents.listRequests[1]).toEqual({
        edgeId: 'edge-visual-2',
        state: 'unclosed',
        page: '1',
        limit: '50',
        sort: 'latest',
        order: 'desc',
      })
    })
    expect(await screen.findByTestId('dispatch-alarm-journal-row-dispatch-alarm-edge-2-page-1')).toBeInTheDocument()
    edgeOneStaleList.resolve(
      createDispatchAlarmIncidentListResponseFixture({
        incidents: [activeIncident],
      }),
    )
    await waitFor(() => {
      expect(screen.queryByTestId('dispatch-alarm-journal-row-dispatch-alarm-active-1')).not.toBeInTheDocument()
      expect(screen.getByTestId('dispatch-alarm-journal-row-dispatch-alarm-edge-2-page-1')).toBeInTheDocument()
    })

    const row = screen.getByTestId('dispatch-alarm-journal-row-dispatch-alarm-edge-2-page-1')
    expect(within(row).getByText('Backup pressure')).toBeInTheDocument()
    expect(within(row).getByText('boiler-2 / pressure')).toBeInTheDocument()
    expect(within(row).getByText(/High condition: latest/)).toBeInTheDocument()
    expect(within(row).getByText('Danger')).toBeInTheDocument()
    expect(within(row).getByText('Active unacknowledged')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Next alarm journal page' }))
    await waitFor(() => {
      expect(fixtures.dispatchAlarmIncidents.listRequests[2]).toEqual({
        edgeId: 'edge-visual-2',
        state: 'unclosed',
        page: '2',
        limit: '50',
        sort: 'latest',
        order: 'desc',
      })
    })
    expect(await screen.findByTestId('dispatch-alarm-journal-row-dispatch-alarm-edge-2-page-2')).toBeInTheDocument()

    const actionSlot = screen.getByTestId('dispatch-action-slot')
    expect(
      within(actionSlot).queryByRole('combobox', { name: 'Alarm incident state' }),
    ).not.toBeInTheDocument()
    expect(
      within(actionSlot).queryByTestId('dispatch-alarm-journal-refresh'),
    ).not.toBeInTheDocument()

    const alarmJournalTab = screen.getByTestId('dispatch-alarm-journal-tab')
    expect(
      within(alarmJournalTab).getByRole('button', { name: 'Previous alarm journal page' }),
    ).toBeInTheDocument()
    expect(
      within(alarmJournalTab).getByRole('button', { name: 'Next alarm journal page' }),
    ).toBeInTheDocument()
    const stateSelect = within(alarmJournalTab).getByRole('combobox', { name: 'Alarm incident state' })
    expect(stateSelect).toHaveValue('unclosed')
    expect(within(alarmJournalTab).getByTestId('dispatch-alarm-journal-toolbar-summary')).toHaveTextContent(
      'Page 2 | 1 incidents visible | 100 total',
    )
    await user.selectOptions(stateSelect, 'all')
    await waitFor(() => {
      expect(fixtures.dispatchAlarmIncidents.listRequests[3]).toEqual({
        edgeId: 'edge-visual-2',
        state: 'all',
        page: '1',
        limit: '50',
        sort: 'latest',
        order: 'desc',
      })
    })
    const closedRow = await screen.findByTestId('dispatch-alarm-journal-row-dispatch-alarm-closed-2')
    expect(within(closedRow).getByText('Pump stopped')).toBeInTheDocument()
    expect(within(closedRow).getByText('pump-2 / running')).toBeInTheDocument()
    expect(within(closedRow).getByText('Warning')).toBeInTheDocument()
    expect(within(closedRow).getByText('Closed')).toBeInTheDocument()
    expect(screen.getByTestId('dispatch-alarm-journal-closed-at-dispatch-alarm-closed-2')).not.toHaveTextContent('-')

    await user.click(within(alarmJournalTab).getByTestId('dispatch-alarm-journal-refresh'))
    await waitFor(() => {
      expect(fixtures.dispatchAlarmIncidents.listRequests).toHaveLength(5)
      expect(fixtures.dispatchAlarmIncidents.listRequests[4]).toEqual({
        edgeId: 'edge-visual-2',
        state: 'all',
        page: '1',
        limit: '50',
        sort: 'latest',
        order: 'desc',
      })
    })
    expect(alarmRequests).toEqual([
      'edge-visual-1:unclosed:1',
      'edge-visual-2:unclosed:1',
      'edge-visual-2:unclosed:2',
      'edge-visual-2:all:1',
      'edge-visual-2:all:1',
    ])
    expect(dispatchWorkspaceRuntimeHarness.startSession).not.toHaveBeenCalled()
    route.renderResult.unmount()

    const noEdgeFixtures = setupDispatchWorkspaceRestFixtures({
      dashboard: createDashboardVisualRestFixtures(),
    })
    renderDispatchWorkspaceRoute(`/hub/dispatch/alarms?diagramId=${dashboardVisualDiagram._id}`)
    expect(await screen.findByTestId('dispatch-alarm-journal-no-edge')).toBeInTheDocument()
    expect(noEdgeFixtures.dispatchAlarmIncidents.listRequests).toHaveLength(0)
    expect(dispatchWorkspaceRuntimeHarness.startSession).not.toHaveBeenCalled()
  })

  it('proves Dispatch Alarms ACK waits for Cloud confirmation and ignores stale Edge responses', async () => {
    const confirmedAck = createDispatchWorkspaceDeferred<ReturnType<typeof createDispatchActiveAcknowledgedAlarmIncidentProjectionFixture>>()
    const staleAck = createDispatchWorkspaceDeferred<ReturnType<typeof createDispatchActiveAcknowledgedAlarmIncidentProjectionFixture>>()
    const confirmedIncident = createDispatchActiveUnacknowledgedAlarmIncidentProjectionFixture({
      incidentId: 'dispatch-alarm-confirmed-ack',
      edgeId: 'edge-visual-1',
      deviceId: 'boiler-1',
      metric: 'temperature',
      ruleId: 'dispatch-confirmed-ack-rule',
      rule: {
        ruleId: 'dispatch-confirmed-ack-rule',
        ruleRevision: '1',
        conditionType: 'high',
        triggerThreshold: 80,
        clearThreshold: 75,
        expectedValue: null,
        severity: 'danger',
        label: 'Confirmed ACK alarm',
      },
    })
    const staleEdgeOneIncident = createDispatchActiveUnacknowledgedAlarmIncidentProjectionFixture({
      incidentId: 'dispatch-alarm-shared-ack',
      edgeId: 'edge-visual-1',
      deviceId: 'pump-1',
      metric: 'running',
      ruleId: 'dispatch-stale-ack-rule',
      rule: {
        ruleId: 'dispatch-stale-ack-rule',
        ruleRevision: '1',
        conditionType: 'state',
        triggerThreshold: null,
        clearThreshold: null,
        expectedValue: true,
        severity: 'warning',
        label: 'Stale ACK alarm',
      },
    })
    const edgeTwoIncident = createDispatchActiveUnacknowledgedAlarmIncidentProjectionFixture({
      incidentId: staleEdgeOneIncident.incidentId,
      edgeId: 'edge-visual-2',
      deviceId: 'pump-2',
      metric: 'running',
      ruleId: 'dispatch-current-edge-rule',
      rule: {
        ruleId: 'dispatch-current-edge-rule',
        ruleRevision: '1',
        conditionType: 'state',
        triggerThreshold: null,
        clearThreshold: null,
        expectedValue: true,
        severity: 'warning',
        label: 'Current Edge ACK alarm',
      },
    })
    let ackRequestCount = 0
    const fixtures = setupDispatchWorkspaceRestFixtures({
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
      alarmIncidents: {
        list: {
          resolve: (request) => {
            if (request.edgeId === 'edge-visual-2') {
              return createDispatchAlarmIncidentListResponseFixture({
                incidents: [edgeTwoIncident],
              })
            }

            return createDispatchAlarmIncidentListResponseFixture({
              incidents: [confirmedIncident, staleEdgeOneIncident],
            })
          },
        },
        ack: {
          resolve: () => {
            ackRequestCount += 1
            return ackRequestCount === 1 ? confirmedAck.promise : staleAck.promise
          },
        },
      },
    })

    const route = renderDispatchWorkspaceRoute(
      `/hub/dispatch/alarms?diagramId=${dashboardVisualDiagram._id}&edgeId=edge-visual-1`,
    )
    const user = userEvent.setup()

    const confirmedRow = await screen.findByTestId('dispatch-alarm-journal-row-dispatch-alarm-confirmed-ack')
    const staleRow = await screen.findByTestId('dispatch-alarm-journal-row-dispatch-alarm-shared-ack')
    const confirmedAckButton = within(confirmedRow).getByRole('button', {
      name: 'Acknowledge alarm Confirmed ACK alarm',
    })
    const staleAckButton = within(staleRow).getByRole('button', {
      name: 'Acknowledge alarm Stale ACK alarm',
    })

    await user.click(confirmedAckButton)
    await waitFor(() => {
      expect(fixtures.dispatchAlarmIncidents.ackRequests[0]).toEqual({
        edgeId: 'edge-visual-1',
        incidentId: 'dispatch-alarm-confirmed-ack',
      })
    })
    expect(confirmedAckButton).toBeDisabled()
    expect(within(confirmedRow).getByText('Pending')).toBeInTheDocument()
    expect(staleAckButton).not.toBeDisabled()
    expect(within(confirmedRow).getByText('Active unacknowledged')).toBeInTheDocument()
    expect(within(confirmedRow).queryByText('Active acknowledged')).not.toBeInTheDocument()
    expect(within(confirmedRow).queryByText('Acknowledged')).not.toBeInTheDocument()

    confirmedAck.resolve(
      createDispatchActiveAcknowledgedAlarmIncidentProjectionFixture({
        incidentId: confirmedIncident.incidentId,
        edgeId: confirmedIncident.edgeId,
        deviceId: confirmedIncident.deviceId,
        metric: confirmedIncident.metric,
        ruleId: confirmedIncident.ruleId,
        rule: confirmedIncident.rule,
        acknowledgedAt: '2026-05-09T10:06:00.000Z',
        acknowledgedBy: 'dispatch-user-1',
      }),
    )
    await waitFor(() => {
      expect(within(confirmedRow).getByText('Active acknowledged')).toBeInTheDocument()
      expect(within(confirmedRow).getByText('Acknowledged')).toBeInTheDocument()
    })

    await user.click(staleAckButton)
    await waitFor(() => {
      expect(fixtures.dispatchAlarmIncidents.ackRequests[1]).toEqual({
        edgeId: 'edge-visual-1',
        incidentId: 'dispatch-alarm-shared-ack',
      })
    })
    expect(staleAckButton).toBeDisabled()
    expect(within(staleRow).getByText('Pending')).toBeInTheDocument()

    await user.selectOptions(screen.getByRole('combobox', { name: 'Edge Server' }), 'edge-visual-2')
    await waitFor(() => {
      expect(route.router.state.location.search).toContain('edgeId=edge-visual-2')
    })
    const currentEdgeRow = await screen.findByTestId('dispatch-alarm-journal-row-dispatch-alarm-shared-ack')
    expect(within(currentEdgeRow).getByText('Current Edge ACK alarm')).toBeInTheDocument()
    expect(within(currentEdgeRow).getByText('Active unacknowledged')).toBeInTheDocument()
    expect(
      within(currentEdgeRow).getByRole('button', {
        name: 'Acknowledge alarm Current Edge ACK alarm',
      }),
    ).not.toBeDisabled()

    staleAck.resolve(
      createDispatchActiveAcknowledgedAlarmIncidentProjectionFixture({
        incidentId: staleEdgeOneIncident.incidentId,
        edgeId: staleEdgeOneIncident.edgeId,
        deviceId: staleEdgeOneIncident.deviceId,
        metric: staleEdgeOneIncident.metric,
        ruleId: staleEdgeOneIncident.ruleId,
        rule: staleEdgeOneIncident.rule,
        acknowledgedAt: '2026-05-09T10:07:00.000Z',
        acknowledgedBy: 'dispatch-user-1',
      }),
    )
    await waitFor(() => {
      expect(screen.getByTestId('dispatch-alarm-journal-row-dispatch-alarm-shared-ack')).toHaveAttribute(
        'data-edge-id',
        'edge-visual-2',
      )
      expect(within(currentEdgeRow).getByText('Active unacknowledged')).toBeInTheDocument()
      expect(within(currentEdgeRow).queryByText('Active acknowledged')).not.toBeInTheDocument()
      expect(within(currentEdgeRow).queryByText('Acknowledged')).not.toBeInTheDocument()
    })
    expect(dispatchWorkspaceRuntimeHarness.startSession).not.toHaveBeenCalled()
  })
})
