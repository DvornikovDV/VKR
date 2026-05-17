import { act, render, type RenderResult } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { userHubRouteChildren } from '@/app/userHubRoutes'
import { ProtectedRoute } from '@/shared/components/ProtectedRoute'
import { useAuthStore, type Session } from '@/shared/store/useAuthStore'
import { dashboardVisualCatalog } from '../../fixtures/dashboardVisualLayout'
import {
  createDashboardApiFixtures,
  createDashboardApiHandlers,
  createUserEdgeConsumerFixtures,
  type DashboardRestFixtures,
  type UserEdgeCatalogFixture,
  type UserEdgeConsumerFixtures,
} from '../../mocks/handlers'
import { server } from '../../mocks/server'
import type {
  CommandAuditListResponse,
  CommandAuditProjection,
} from '@/shared/api/commands'
import type { TelemetryHistoryResponse } from '@/shared/api/telemetryHistory'
import {
  dashboardRuntimeClientHarness,
  dashboardRuntimeSocketHarness,
  createDashboardActiveAcknowledgedAlarmIncidentProjectionFixture,
  createDashboardActiveUnacknowledgedAlarmIncidentProjectionFixture,
  createDashboardAlarmIncidentChangedEventFixture,
  createDashboardClearedUnacknowledgedAlarmIncidentProjectionFixture,
  createDashboardClosedAlarmIncidentChangedEventFixture,
  createDashboardClosedAlarmIncidentProjectionFixture,
  createDashboardTelemetryEventFixture,
  createDashboardUnclosedAlarmIncidentChangedEventFixture,
} from './mockDashboardRuntimeSocket'
import type {
  AlarmIncidentListResponse,
  AlarmIncidentProjection,
} from '@/shared/api/alarmIncidents'

export const dispatchWorkspaceUserSession: Session = {
  id: 'dispatch-user-1',
  email: 'dispatch.user@example.com',
  role: 'USER',
  tier: 'PRO',
  accessToken: 'dispatch-user-token',
}

export interface DispatchWorkspaceRestFixtureOptions {
  dashboard?: Partial<DashboardRestFixtures>
  userEdge?: Partial<UserEdgeConsumerFixtures>
  alarmIncidents?: {
    list?: {
      resolve?: (request: DispatchAlarmIncidentListFixtureRequest) => Promise<AlarmIncidentListResponse> | AlarmIncidentListResponse
      response?: AlarmIncidentListResponse
    }
    ack?: {
      resolve?: (request: DispatchAlarmIncidentAckFixtureRequest) => Promise<AlarmIncidentProjection> | AlarmIncidentProjection
      response?: AlarmIncidentProjection
    }
  }
  commandAudit?: {
    resolve?: (request: DispatchCommandAuditFixtureRequest) => Promise<CommandAuditListResponse> | CommandAuditListResponse
    response?: CommandAuditListResponse
  }
  telemetryHistory?: {
    resolve?: (request: DispatchTelemetryHistoryFixtureRequest) => Promise<TelemetryHistoryResponse> | TelemetryHistoryResponse
    response?: TelemetryHistoryResponse
  }
}

export interface DispatchWorkspaceRenderResult {
  router: ReturnType<typeof createMemoryRouter>
  renderResult: RenderResult
}

export interface DispatchWorkspaceRestFixturesResult extends DashboardRestFixtures {
  dispatchAlarmIncidents: {
    listRequests: DispatchAlarmIncidentListFixtureRequest[]
    ackRequests: DispatchAlarmIncidentAckFixtureRequest[]
  }
}

export const dispatchWorkspaceRuntimeHarness = dashboardRuntimeClientHarness
export const dispatchWorkspaceRuntimeSocketHarness = dashboardRuntimeSocketHarness

export interface DispatchAlarmIncidentListFixtureRequest {
  edgeId: string
  state: string | null
  page: string | null
  limit: string | null
  sort: string | null
  order: string | null
}

export interface DispatchAlarmIncidentAckFixtureRequest {
  edgeId: string
  incidentId: string
}

export interface DispatchTelemetryHistoryFixtureRequest {
  edgeId: string | null
  deviceId: string | null
  metric: string | null
  dateStart: string | null
  dateEnd: string | null
  maxPoints: string | null
}

export interface DispatchCommandAuditFixtureRequest {
  edgeId: string
  page: string | null
  limit: string | null
  status: string | null
}

export const dispatchWorkspaceTrendsCatalog: UserEdgeCatalogFixture = {
  ...dashboardVisualCatalog,
  telemetry: dashboardVisualCatalog.telemetry.map((entry) => ({
    ...entry,
    valueType:
      entry.metric === 'temperature' || entry.metric === 'flowRate'
        ? 'number'
        : 'boolean',
  })),
}

export function createDispatchTelemetryHistoryResponseFixture(
  overrides: Partial<TelemetryHistoryResponse> = {},
): TelemetryHistoryResponse {
  return {
    edgeId: 'edge-visual-1',
    deviceId: 'boiler-1',
    metric: 'temperature',
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
    ...overrides,
  }
}

export function createDispatchCommandAuditRowFixture(
  overrides: Partial<CommandAuditProjection> = {},
): CommandAuditProjection {
  return {
    requestId: 'command-audit-request-1',
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
    ...overrides,
  }
}

export function createDispatchCommandAuditResponseFixture(
  overrides: Partial<CommandAuditListResponse> = {},
): CommandAuditListResponse {
  const audits = overrides.audits ?? [createDispatchCommandAuditRowFixture()]

  return {
    audits,
    page: 1,
    limit: 50,
    total: audits.length,
    hasNextPage: false,
    ...overrides,
  }
}

export function createDispatchAlarmIncidentListResponseFixture(
  overrides: Partial<AlarmIncidentListResponse> = {},
): AlarmIncidentListResponse {
  const incidents = overrides.incidents ?? []

  return {
    incidents,
    page: 1,
    limit: 50,
    total: incidents.length,
    hasNextPage: false,
    ...overrides,
  }
}

export function createDispatchWorkspaceDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })

  return { promise, resolve, reject }
}

export {
  createDashboardActiveAcknowledgedAlarmIncidentProjectionFixture as createDispatchActiveAcknowledgedAlarmIncidentProjectionFixture,
  createDashboardActiveUnacknowledgedAlarmIncidentProjectionFixture as createDispatchActiveUnacknowledgedAlarmIncidentProjectionFixture,
  createDashboardAlarmIncidentChangedEventFixture as createDispatchAlarmIncidentChangedEventFixture,
  createDashboardClearedUnacknowledgedAlarmIncidentProjectionFixture as createDispatchClearedUnacknowledgedAlarmIncidentProjectionFixture,
  createDashboardClosedAlarmIncidentChangedEventFixture as createDispatchClosedAlarmIncidentChangedEventFixture,
  createDashboardClosedAlarmIncidentProjectionFixture as createDispatchClosedAlarmIncidentProjectionFixture,
  createDashboardTelemetryEventFixture as createDispatchTelemetryEventFixture,
  createDashboardUnclosedAlarmIncidentChangedEventFixture as createDispatchUnclosedAlarmIncidentChangedEventFixture,
}

export function authenticateDispatchWorkspaceUser(
  session: Session = dispatchWorkspaceUserSession,
): void {
  act(() => {
    useAuthStore.setState({ session: null, isAuthenticated: false })
    useAuthStore.getState().setSession(session)
  })
}

export function setupDispatchWorkspaceRestFixtures(
  options: DispatchWorkspaceRestFixtureOptions = {},
): DispatchWorkspaceRestFixturesResult {
  const dashboardFixtures = createDashboardApiFixtures(options.dashboard)
  const userEdgeFixtures = createUserEdgeConsumerFixtures({
    ...options.userEdge,
    catalogByEdgeId: {
      'edge-visual-1': dispatchWorkspaceTrendsCatalog,
      ...(options.userEdge?.catalogByEdgeId ?? {}),
    },
  })
  const defaultTelemetryHistoryResponse = options.telemetryHistory?.response
    ?? createDispatchTelemetryHistoryResponseFixture()
  const defaultCommandAuditResponse = options.commandAudit?.response
    ?? createDispatchCommandAuditResponseFixture()
  const defaultAlarmIncidentListResponse = options.alarmIncidents?.list?.response
    ?? createDispatchAlarmIncidentListResponseFixture()
  const listRequests: DispatchAlarmIncidentListFixtureRequest[] = []
  const ackRequests: DispatchAlarmIncidentAckFixtureRequest[] = []

  server.use(
    ...createDashboardApiHandlers(dashboardFixtures),
    http.get('/api/edge-servers/:edgeId/catalog', ({ params }) => {
      const edgeId = String(params.edgeId)
      const catalog = userEdgeFixtures.catalogByEdgeId[edgeId]

      return HttpResponse.json({
        status: 'success',
        data: catalog ?? { edgeServerId: edgeId, telemetry: [], commands: [] },
      })
    }),
    http.get('/api/edge-servers/:edgeId/alarm-incidents', async ({ params, request }) => {
      const url = new URL(request.url)
      const listRequest: DispatchAlarmIncidentListFixtureRequest = {
        edgeId: String(params.edgeId),
        state: url.searchParams.get('state'),
        page: url.searchParams.get('page'),
        limit: url.searchParams.get('limit'),
        sort: url.searchParams.get('sort'),
        order: url.searchParams.get('order'),
      }
      listRequests.push(listRequest)
      const response = options.alarmIncidents?.list?.resolve
        ? await options.alarmIncidents.list.resolve(listRequest)
        : defaultAlarmIncidentListResponse

      return HttpResponse.json({
        status: 'success',
        data: response,
      })
    }),
    http.post('/api/edge-servers/:edgeId/alarm-incidents/:incidentId/ack', async ({ params }) => {
      const ackRequest: DispatchAlarmIncidentAckFixtureRequest = {
        edgeId: String(params.edgeId),
        incidentId: String(params.incidentId),
      }
      ackRequests.push(ackRequest)
      const response = options.alarmIncidents?.ack?.resolve
        ? await options.alarmIncidents.ack.resolve(ackRequest)
        : options.alarmIncidents?.ack?.response ?? createDashboardActiveAcknowledgedAlarmIncidentProjectionFixture({
          edgeId: ackRequest.edgeId,
          incidentId: ackRequest.incidentId,
        })

      return HttpResponse.json({
        status: 'success',
        data: { incident: response },
      })
    }),
    http.get('/api/edge-servers/:edgeId/command-audit', async ({ params, request }) => {
      const url = new URL(request.url)
      const auditRequest: DispatchCommandAuditFixtureRequest = {
        edgeId: String(params.edgeId),
        page: url.searchParams.get('page'),
        limit: url.searchParams.get('limit'),
        status: url.searchParams.get('status'),
      }
      const response = options.commandAudit?.resolve
        ? await options.commandAudit.resolve(auditRequest)
        : defaultCommandAuditResponse

      return HttpResponse.json({
        status: 'success',
        data: response,
      })
    }),
    http.post('/api/edge-servers/:edgeId/commands', ({ params }) => {
      const overrideResponse = userEdgeFixtures.commandResponsesByEdgeId?.[String(params.edgeId)]

      if (overrideResponse) {
        return HttpResponse.json(overrideResponse.body, { status: overrideResponse.status || 200 })
      }

      return HttpResponse.json({
        status: 'success',
        data: { commandStatus: 'confirmed' },
      })
    }),
    http.get('/api/telemetry/historic', async ({ request }) => {
      const url = new URL(request.url)
      const historyRequest: DispatchTelemetryHistoryFixtureRequest = {
        edgeId: url.searchParams.get('edgeId'),
        deviceId: url.searchParams.get('deviceId'),
        metric: url.searchParams.get('metric'),
        dateStart: url.searchParams.get('date_start'),
        dateEnd: url.searchParams.get('date_end'),
        maxPoints: url.searchParams.get('maxPoints'),
      }
      const response = options.telemetryHistory?.resolve
        ? await options.telemetryHistory.resolve(historyRequest)
        : defaultTelemetryHistoryResponse

      return HttpResponse.json({
        status: 'success',
        data: response,
      })
    }),
  )

  return {
    ...dashboardFixtures,
    dispatchAlarmIncidents: {
      listRequests,
      ackRequests,
    },
  }
}

export function renderDispatchWorkspaceRoute(path: string): DispatchWorkspaceRenderResult {
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

  return {
    router,
    renderResult: render(<RouterProvider router={router} />),
  }
}
