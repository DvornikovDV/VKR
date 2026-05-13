import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DispatchTrendsTab } from '@/features/dispatch/components/DispatchTrendsTab'
import type { DispatchWorkspaceContextSnapshot } from '@/features/dispatch/model/types'
import { getEdgeServerCatalog } from '@/shared/api/edgeServers'
import { getTelemetryHistory, type TelemetryHistoryResponse } from '@/shared/api/telemetryHistory'

vi.mock('@/shared/api/edgeServers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api/edgeServers')>()
  return {
    ...actual,
    getEdgeServerCatalog: vi.fn(),
  }
})

vi.mock('@/shared/api/telemetryHistory', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api/telemetryHistory')>()
  return {
    ...actual,
    getTelemetryHistory: vi.fn(),
  }
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

function createWorkspaceContext(edgeId: string): DispatchWorkspaceContextSnapshot {
  return {
    status: 'ready',
    routeState: {
      tabId: 'trends',
      diagramId: 'diagram-1',
      edgeId,
      selectionSource: 'route-prefill',
    },
    diagramOptions: [],
    edgeOptions: [],
    bindingProfiles: [],
    selection: {
      diagramId: 'diagram-1',
      edgeId,
      selectedDiagram: {
        _id: 'diagram-1',
        name: 'Dispatch diagram',
        layout: {},
        updatedAt: '2026-05-13T09:00:00.000Z',
      },
      selectedEdge: {
        _id: edgeId,
        name: edgeId === 'edge-1' ? 'Primary Edge' : 'Backup Edge',
        lifecycleState: 'Active',
        availability: {
          online: true,
          lastSeenAt: '2026-05-13T09:00:00.000Z',
        },
      },
      selectedBindingProfile: null,
    },
    dashboardRuntime: {
      savedDiagram: null,
      edgeCatalog: null,
      edgeCatalogStatus: 'idle',
      edgeCatalogError: null,
    },
    recoveryState: 'ready',
    errorMessage: null,
  }
}

function createHistoryResponse(edgeId: string, deviceId: string, metric: string): TelemetryHistoryResponse {
  return {
    edgeId,
    deviceId,
    metric,
    dateStart: '2026-05-13T08:00:00.000Z',
    dateEnd: '2026-05-13T09:00:00.000Z',
    maxPoints: 300,
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
  }
}

describe('DispatchTrendsTab', () => {
  beforeEach(() => {
    vi.mocked(getEdgeServerCatalog).mockReset()
    vi.mocked(getTelemetryHistory).mockReset()
  })

  it('loads selected Edge catalog and requests typed telemetry history from selected numeric controls', async () => {
    vi.mocked(getEdgeServerCatalog).mockResolvedValue({
      edgeServerId: 'edge-1',
      telemetry: [
        {
          deviceId: 'pump-1',
          metric: 'temperature',
          valueType: 'number',
          label: 'Pump temperature',
        },
        {
          deviceId: 'pump-1',
          metric: 'running',
          valueType: 'boolean',
          label: 'Pump running',
        },
      ],
      commands: [],
    })
    vi.mocked(getTelemetryHistory).mockResolvedValue(
      createHistoryResponse('edge-1', 'pump-1', 'temperature'),
    )

    render(<DispatchTrendsTab workspaceContext={createWorkspaceContext('edge-1')} />)

    const metricSelect = await screen.findByRole('combobox', {
      name: 'Numeric telemetry metric',
    })
    expect(getEdgeServerCatalog).toHaveBeenCalledWith('edge-1')
    expect(within(metricSelect).getByRole('option', { name: 'Pump temperature' })).toBeInTheDocument()
    expect(within(metricSelect).queryByRole('option', { name: 'Pump running' })).not.toBeInTheDocument()

    await userEvent.selectOptions(metricSelect, 'pump-1:temperature')
    await userEvent.click(screen.getByRole('button', { name: 'Refresh trends' }))

    await waitFor(() => {
      expect(getTelemetryHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          edgeId: 'edge-1',
          deviceId: 'pump-1',
          metric: 'temperature',
          maxPoints: 300,
        }),
      )
    })
    expect(await screen.findByTestId('dispatch-trends-history-summary')).toHaveTextContent(
      'edge-1 / pump-1 / temperature',
    )
    expect(screen.getByTestId('dispatch-trends-chart')).toHaveAttribute('data-value-mode', 'avg')

    const table = screen.getByTestId('dispatch-trends-table')
    expect(within(table).getByRole('columnheader', { name: 'timeStart' })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: 'timeEnd' })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: 'min' })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: 'max' })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: 'avg' })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: 'last' })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: 'count' })).toBeInTheDocument()
    expect(table.querySelector('time[datetime="2026-05-13T08:00:00.000Z"]')).toBeInTheDocument()
    expect(table.querySelector('time[datetime="2026-05-13T08:05:00.000Z"]')).toBeInTheDocument()
    expect(within(table).getByText('10')).toBeInTheDocument()
    expect(within(table).getByText('20')).toBeInTheDocument()
    expect(within(table).getByText('15')).toBeInTheDocument()
    expect(within(table).getByText('19')).toBeInTheDocument()
    expect(within(table).getByText('60')).toBeInTheDocument()
  })

  it('ignores stale history when the selected Edge changes before the old request resolves', async () => {
    const edgeOneHistory = createDeferred<TelemetryHistoryResponse>()
    const edgeTwoHistory = createDeferred<TelemetryHistoryResponse>()

    vi.mocked(getEdgeServerCatalog).mockImplementation(async (edgeId: string) => ({
      edgeServerId: edgeId,
      telemetry: [
        {
          deviceId: edgeId === 'edge-1' ? 'pump-1' : 'pump-2',
          metric: edgeId === 'edge-1' ? 'temperature' : 'pressure',
          valueType: 'number',
          label: edgeId === 'edge-1' ? 'Pump temperature' : 'Pump pressure',
        },
      ],
      commands: [],
    }))
    vi.mocked(getTelemetryHistory).mockImplementation((params) => {
      return params.edgeId === 'edge-1' ? edgeOneHistory.promise : edgeTwoHistory.promise
    })

    const { rerender } = render(
      <DispatchTrendsTab workspaceContext={createWorkspaceContext('edge-1')} />,
    )
    await userEvent.selectOptions(
      await screen.findByRole('combobox', { name: 'Numeric telemetry metric' }),
      'pump-1:temperature',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Refresh trends' }))

    rerender(<DispatchTrendsTab workspaceContext={createWorkspaceContext('edge-2')} />)
    await userEvent.selectOptions(
      await screen.findByRole('combobox', { name: 'Numeric telemetry metric' }),
      'pump-2:pressure',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Refresh trends' }))

    edgeTwoHistory.resolve(createHistoryResponse('edge-2', 'pump-2', 'pressure'))
    expect(await screen.findByTestId('dispatch-trends-history-summary')).toHaveTextContent(
      'edge-2 / pump-2 / pressure',
    )

    edgeOneHistory.resolve(createHistoryResponse('edge-1', 'pump-1', 'temperature'))
    await waitFor(() => {
      expect(screen.getByTestId('dispatch-trends-history-summary')).toHaveTextContent(
        'edge-2 / pump-2 / pressure',
      )
    })
  })
})
