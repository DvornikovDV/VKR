import { act, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '../mocks/server'
import { loadHostedConstructor } from '@/features/constructor-host/loadHostedConstructor'
import { createMockHostedConstructorHarness } from './helpers/mockHostedConstructor'
import { userHubRouteChildren } from '@/app/userHubRoutes'
import { ProtectedRoute } from '@/shared/components/ProtectedRoute'
import { useAuthStore, type Session } from '@/shared/store/useAuthStore'

vi.mock('@/features/constructor-host/loadHostedConstructor', async () => {
  const actual = await vi.importActual<typeof import('@/features/constructor-host/loadHostedConstructor')>(
    '@/features/constructor-host/loadHostedConstructor',
  )

  return {
    ...actual,
    loadHostedConstructor: vi.fn(),
  }
})

const mockedLoadHostedConstructor = vi.mocked(loadHostedConstructor)

const userSession: Session = {
  id: 'user-1',
  email: 'user@example.com',
  role: 'USER',
  tier: 'PRO',
  accessToken: 'user-token',
}

function renderUserHub(initialPath: string) {
  const router = createMemoryRouter(
    [
      {
        path: '/login',
        element: <div>Login</div>,
      },
      {
        path: '/hub',
        element: <ProtectedRoute requiredRole="USER" />,
        children: userHubRouteChildren,
      },
    ],
    { initialEntries: [initialPath] },
  )

  render(<RouterProvider router={router} />)
  return router
}

beforeEach(() => {
  mockedLoadHostedConstructor.mockReset()
  act(() => {
    useAuthStore.setState({ session: null, isAuthenticated: false })
    useAuthStore.getState().setSession(userSession)
  })
})

describe('repro_task_T057', () => {
  it('propagates blocked edge lifecycle context into /hub/editor/:id machine selection guidance', async () => {
    const harness = createMockHostedConstructorHarness()
    mockedLoadHostedConstructor.mockResolvedValue(harness.module)

    server.use(
      http.get('/api/diagrams/:id', ({ params }) =>
        HttpResponse.json({
          status: 'success',
          data: {
            _id: String(params.id),
            name: 'Boiler Hall',
            layout: { widgets: [] },
            __v: 4,
          },
        }),
      ),
      http.get('/api/diagrams/:id/bindings', () =>
        HttpResponse.json({
          status: 'success',
          data: [],
        }),
      ),
      http.get('/api/edge-servers', () =>
        HttpResponse.json({
          status: 'success',
          data: [
            {
              _id: 'edge-active',
              name: 'Alpha Edge',
              lifecycleState: 'Active',
              availability: { online: true, lastSeenAt: '2026-04-19T10:00:00.000Z' },
            },
            {
              _id: 'edge-blocked',
              name: 'Blocked Edge',
              lifecycleState: 'Blocked',
              availability: { online: false, lastSeenAt: '2026-04-19T09:30:00.000Z' },
            },
          ],
        }),
      ),
      http.get('/api/edge-servers/:edgeId/catalog', ({ params }) =>
        HttpResponse.json({
          status: 'success',
          data: params.edgeId === 'edge-blocked'
            ? []
            : [
                {
                  edgeServerId: String(params.edgeId),
                  deviceId: 'device-1',
                  metric: 'temperature',
                  label: 'device-1.temperature',
                },
              ],
        }),
      ),
    )

    renderUserHub('/hub/editor/diagram-1?edgeId=edge-blocked')

    await waitFor(() => {
      expect(harness.createHostedConstructorMock).toHaveBeenCalledTimes(1)
    })

    const config = harness.getLastConfig()
    expect(config?.machines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          edgeServerId: 'edge-blocked',
          lifecycleState: 'Blocked',
          availabilityLabel: 'Offline',
        }),
      ]),
    )

    expect(
      screen.getByText(/selected edge is currently blocked/i),
    ).toBeInTheDocument()
  })

  it('marks blocked telemetry profiles as unavailable for dashboard handoff in /hub gallery', async () => {
    const user = userEvent.setup()

    server.use(
      http.get('/api/diagrams', () =>
        HttpResponse.json({
          status: 'success',
          data: [
            {
              _id: 'diagram-1',
              name: 'Boiler Hall',
              layout: {},
              updatedAt: '2026-04-19T10:00:00.000Z',
            },
          ],
        }),
      ),
      http.get('/api/diagrams/:id', ({ params }) =>
        HttpResponse.json({
          status: 'success',
          data: {
            _id: String(params.id),
            name: 'Boiler Hall',
            layout: { widgets: [] },
            __v: 4,
          },
        }),
      ),
      http.get('/api/edge-servers', () =>
        HttpResponse.json({
          status: 'success',
          data: [
            {
              _id: 'edge-blocked',
              name: 'Blocked Edge',
              lifecycleState: 'Blocked',
              availability: { online: false, lastSeenAt: '2026-04-19T09:30:00.000Z' },
            },
          ],
        }),
      ),
      http.get('/api/diagrams/:id/bindings', () =>
        HttpResponse.json({
          status: 'success',
          data: [
            {
              _id: 'binding-blocked',
              diagramId: 'diagram-1',
              edgeServerId: 'edge-blocked',
              widgetBindings: [],
            },
          ],
        }),
      ),
      http.get('/api/edge-servers/:edgeId/catalog', () =>
        HttpResponse.json({
          status: 'success',
          data: [],
        }),
      ),
    )

    const router = renderUserHub('/hub')
    expect(await screen.findByText('Boiler Hall')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Telemetry Profiles' }))

    const blockedProfile = screen.getByText('Blocked Edge').closest('li')
    expect(blockedProfile).not.toBeNull()

    const profile = within(blockedProfile as HTMLElement)
    expect(profile.getByText('Blocked')).toBeInTheDocument()
    expect(profile.getByRole('button', { name: /Open Dashboard/i })).toBeDisabled()

    await user.click(profile.getByRole('button', { name: /Edit Bindings/i }))

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/hub/editor/diagram-1')
    })
    expect(router.state.location.search).toContain('edgeId=edge-blocked')
  })

  it('keeps Dispatch Dashboard handoff available when edge metadata is temporarily unresolved in /hub gallery', async () => {
    const user = userEvent.setup()

    server.use(
      http.get('/api/diagrams', () =>
        HttpResponse.json({
          status: 'success',
          data: [
            {
              _id: 'diagram-1',
              name: 'Boiler Hall',
              layout: {},
              updatedAt: '2026-04-19T10:00:00.000Z',
            },
          ],
        }),
      ),
      http.get('/api/edge-servers', () =>
        HttpResponse.json(
          {
            status: 'error',
            message: 'edge metadata unavailable',
          },
          { status: 503 },
        ),
      ),
      http.get('/api/diagrams/:id/bindings', () =>
        HttpResponse.json({
          status: 'success',
          data: [
            {
              _id: 'binding-active',
              diagramId: 'diagram-1',
              edgeServerId: 'edge-active',
              widgetBindings: [],
            },
          ],
        }),
      ),
    )

    const router = renderUserHub('/hub')
    expect(await screen.findByText('Boiler Hall')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Telemetry Profiles' }))

    const unresolvedProfile = screen.getByText('edge-active').closest('li')
    expect(unresolvedProfile).not.toBeNull()

    const profile = within(unresolvedProfile as HTMLElement)
    const openDashboardButton = profile.getByRole('button', { name: /Open Dashboard/i })
    expect(openDashboardButton).toBeEnabled()

    await user.click(openDashboardButton)

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/hub/dispatch/dashboard')
    })
    expect(router.state.location.search).toContain('diagramId=diagram-1')
    expect(router.state.location.search).toContain('edgeId=edge-active')
  })
})
