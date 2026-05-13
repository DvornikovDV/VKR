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
import {
  authenticateDispatchWorkspaceUser,
  createDispatchTelemetryHistoryResponseFixture,
  createDispatchUnclosedAlarmIncidentChangedEventFixture,
  createDispatchTelemetryEventFixture,
  dispatchWorkspaceTrendsCatalog,
  dispatchWorkspaceRuntimeHarness,
  renderDispatchWorkspaceRoute,
  setupDispatchWorkspaceRestFixtures,
} from './helpers/dispatchWorkspaceHarness'
import { server } from '../mocks/server'

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
    expect(screen.getByTestId('dispatch-placeholder-context')).toHaveAttribute(
      'data-tab-id',
      'telemetry',
    )
    expect(within(screen.getByTestId('dispatch-action-slot')).queryByRole('button', { name: 'Fit to view' })).not.toBeInTheDocument()
    expect(within(screen.getByTestId('dispatch-action-slot')).queryByRole('button', { name: 'Details' })).not.toBeInTheDocument()
    expect(within(screen.getByTestId('dispatch-action-slot')).queryByTestId('dashboard-alarm-red-light-indicator')).not.toBeInTheDocument()
    expect(dispatchWorkspaceRuntimeHarness.startSession).toHaveBeenCalledTimes(1)

    await user.click(within(screen.getByRole('tablist', { name: 'Dispatch tabs' })).getByRole('tab', { name: 'Commands' }))
    await waitFor(() => {
      expect(canonicalRoute.router.state.location.pathname).toBe('/hub/dispatch/commands')
    })
    expect(screen.getByTestId('dispatch-placeholder-context')).toHaveAttribute(
      'data-tab-id',
      'commands',
    )
    expect(dispatchWorkspaceRuntimeHarness.startSession).toHaveBeenCalledTimes(1)

    await user.click(within(screen.getByRole('tablist', { name: 'Dispatch tabs' })).getByRole('tab', { name: 'Alarms' }))
    await waitFor(() => {
      expect(canonicalRoute.router.state.location.pathname).toBe('/hub/dispatch/alarms')
    })
    expect(screen.getByTestId('dispatch-placeholder-context')).toHaveAttribute(
      'data-tab-id',
      'alarms',
    )
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
})
