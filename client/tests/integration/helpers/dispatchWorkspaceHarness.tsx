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
  type UserEdgeConsumerFixtures,
} from '../../mocks/handlers'
import { server } from '../../mocks/server'
import {
  dashboardRuntimeClientHarness,
  dashboardRuntimeSocketHarness,
  createDashboardActiveUnacknowledgedAlarmIncidentProjectionFixture,
  createDashboardAlarmIncidentChangedEventFixture,
  createDashboardClosedAlarmIncidentChangedEventFixture,
  createDashboardTelemetryEventFixture,
  createDashboardUnclosedAlarmIncidentChangedEventFixture,
} from './mockDashboardRuntimeSocket'

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
}

export interface DispatchWorkspaceRenderResult {
  router: ReturnType<typeof createMemoryRouter>
  renderResult: RenderResult
}

export const dispatchWorkspaceRuntimeHarness = dashboardRuntimeClientHarness
export const dispatchWorkspaceRuntimeSocketHarness = dashboardRuntimeSocketHarness

export {
  createDashboardActiveUnacknowledgedAlarmIncidentProjectionFixture as createDispatchActiveUnacknowledgedAlarmIncidentProjectionFixture,
  createDashboardAlarmIncidentChangedEventFixture as createDispatchAlarmIncidentChangedEventFixture,
  createDashboardClosedAlarmIncidentChangedEventFixture as createDispatchClosedAlarmIncidentChangedEventFixture,
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
): DashboardRestFixtures {
  const dashboardFixtures = createDashboardApiFixtures(options.dashboard)
  const userEdgeFixtures = createUserEdgeConsumerFixtures({
    ...options.userEdge,
    catalogByEdgeId: {
      'edge-visual-1': dashboardVisualCatalog,
      ...(options.userEdge?.catalogByEdgeId ?? {}),
    },
  })

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
  )

  return dashboardFixtures
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
