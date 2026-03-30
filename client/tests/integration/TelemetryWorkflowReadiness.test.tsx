import { act } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '../mocks/server'
import { loadHostedConstructor } from '@/features/constructor-host/loadHostedConstructor'
import { createMockHostedConstructorHarness } from './helpers/mockHostedConstructor'
import { userHubRouteChildren } from '@/app/userHubRoutes'
import { ProtectedRoute } from '@/shared/components/ProtectedRoute'
import { useAuthStore, type Session } from '@/shared/store/useAuthStore'

vi.mock('@/features/user-hub/pages/DashboardPage', () => ({
  DashboardPage: () => <div>Native Dashboard target</div>,
}))

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
  tier: 'FREE',
  accessToken: 'user-token',
}

function renderTelemetryFlow(initialPath: string) {
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

describe('Telemetry workflow readiness integration (T050c)', () => {
  it('guides empty-catalog constructor flow and hands off saved profile to native dashboard route', async () => {
    const user = userEvent.setup()
    const harness = createMockHostedConstructorHarness({
      initialBindings: [{ widgetId: 'widget-1', deviceId: 'device-1', metric: 'temperature' }],
    })
    mockedLoadHostedConstructor.mockResolvedValue(harness.module)

    let catalogReady = false
    const savedProfiles: Array<{
      _id: string
      diagramId: string
      edgeServerId: string
      widgetBindings: Array<{ widgetId: string; deviceId: string; metric: string }>
    }> = []

    server.use(
      http.get('/api/diagrams', () =>
        HttpResponse.json({
          status: 'success',
          data: [
            {
              _id: 'diagram-1',
              name: 'Boiler Hall',
              layout: {},
              __v: 3,
              updatedAt: '2026-03-01T00:00:00.000Z',
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
            __v: 3,
          },
        }),
      ),
      http.get('/api/edge-servers', () =>
        HttpResponse.json({
          status: 'success',
          data: [
            {
              _id: 'edge-a',
              name: 'Boiler PLC A',
              lifecycleState: 'Active',
              availability: { online: true, lastSeenAt: null },
            },
          ],
        }),
      ),
      http.get('/api/edge-servers/:edgeId/catalog', ({ params }) => {
        if (!catalogReady) {
          return HttpResponse.json({
            status: 'success',
            data: [],
          })
        }

        return HttpResponse.json({
          status: 'success',
          data: [
            {
              edgeServerId: String(params.edgeId),
              sourceId: 'boiler',
              deviceId: 'device-1',
              metric: 'temperature',
              label: 'Boiler temperature',
            },
          ],
        })
      }),
      http.get('/api/diagrams/:id/bindings', ({ params }) =>
        HttpResponse.json({
          status: 'success',
          data: savedProfiles.filter((profile) => profile.diagramId === String(params.id)),
        }),
      ),
      http.post('/api/diagrams/:id/bindings', async ({ params, request }) => {
        const payload = (await request.json()) as {
          edgeServerId: string
          widgetBindings: Array<{ widgetId: string; deviceId: string; metric: string }>
        }

        const upsertedProfile = {
          _id: `binding-${payload.edgeServerId}`,
          diagramId: String(params.id),
          edgeServerId: payload.edgeServerId,
          widgetBindings: payload.widgetBindings,
        }
        const index = savedProfiles.findIndex(
          (profile) =>
            profile.diagramId === upsertedProfile.diagramId &&
            profile.edgeServerId === upsertedProfile.edgeServerId,
        )

        if (index >= 0) {
          savedProfiles[index] = upsertedProfile
        } else {
          savedProfiles.push(upsertedProfile)
        }

        return HttpResponse.json({
          status: 'success',
          data: upsertedProfile,
        })
      }),
    )

    const router = renderTelemetryFlow('/hub/editor/diagram-1')

    await waitFor(() => {
      expect(harness.createHostedConstructorMock).toHaveBeenCalledTimes(1)
    })
    expect(
      screen.getByText(/selected edge has no telemetry-derived catalog entries yet/i),
    ).toBeInTheDocument()

    catalogReady = true
    act(() => {
      harness.emitMachineChange('edge-a')
    })

    await waitFor(() => {
      expect(
        screen.queryByText(/selected edge has no telemetry-derived catalog entries yet/i),
      ).not.toBeInTheDocument()
    })

    act(() => {
      harness.emitSaveBindingsIntent()
    })

    await waitFor(() => {
      expect(savedProfiles).toHaveLength(1)
    })

    await act(async () => {
      await router.navigate('/hub')
    })

    expect(await screen.findByText('Boiler Hall')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Telemetry Profiles' }))

    expect(screen.getByText('Boiler PLC A')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Open Dashboard/i }))

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/hub/dashboard')
    })
    expect(router.state.location.search).toContain('diagramId=diagram-1')
    expect(router.state.location.search).toContain('edgeId=edge-a')
  })
})
