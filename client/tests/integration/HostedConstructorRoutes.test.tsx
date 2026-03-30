import { act } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { server } from '../mocks/server'
import { ProtectedRoute } from '@/shared/components/ProtectedRoute'
import { useAuthStore, type Session } from '@/shared/store/useAuthStore'
import { useReAuthStore } from '@/shared/api/tokenRefresh'
import { adminHubRouteChildren } from '@/app/adminHubRoutes'
import { userHubRouteChildren } from '@/app/userHubRoutes'
import { createMockHostedConstructorHarness } from './helpers/mockHostedConstructor'
import { loadHostedConstructor } from '@/features/constructor-host/loadHostedConstructor'

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

const adminSession: Session = {
  id: 'admin-1',
  email: 'admin@example.com',
  role: 'ADMIN',
  tier: 'PRO',
  accessToken: 'admin-token',
}

function renderRoutes(initialPath: string) {
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
      {
        path: '/admin',
        element: <ProtectedRoute requiredRole="ADMIN" />,
        children: adminHubRouteChildren,
      },
    ],
    { initialEntries: [initialPath] },
  )

  render(<RouterProvider router={router} />)
}

beforeEach(() => {
  mockedLoadHostedConstructor.mockReset()
  act(() => {
    useAuthStore.setState({ session: null, isAuthenticated: false })
    useReAuthStore.setState({ needsReAuth: false, returnPath: '/' })
  })
})

describe('Hosted constructor route bootstrapping (T009)', () => {
  it('boots user editor route and loads hosted runtime in full mode', async () => {
    const harness = createMockHostedConstructorHarness()
    mockedLoadHostedConstructor.mockResolvedValue(harness.module)

    server.use(
      http.get('/api/diagrams/:id', ({ params }) =>
        HttpResponse.json({
          status: 'success',
          data: {
            _id: String(params.id),
            name: 'User Diagram',
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
              _id: 'edge-1',
              name: 'Machine 1',
              lifecycleState: 'Active',
              availability: { online: true, lastSeenAt: null },
            },
          ],
        }),
      ),
      http.get('/api/edge-servers/:edgeId/catalog', ({ params }) =>
        HttpResponse.json({
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
        }),
      ),
      http.get('/api/diagrams/:id/bindings', () =>
        HttpResponse.json({
          status: 'success',
          data: [],
        }),
      ),
    )

    act(() => {
      useAuthStore.getState().setSession(userSession)
    })

    renderRoutes('/hub/editor/diagram-42')

    expect(await screen.findByTestId('constructor-host-runtime')).toBeInTheDocument()

    await waitFor(() => {
      expect(harness.createHostedConstructorMock).toHaveBeenCalledTimes(1)
    })

    expect(harness.getLastConfig()?.mode).toBe('full')
  })

  it('boots admin editor route and loads hosted runtime in reduced mode', async () => {
    const harness = createMockHostedConstructorHarness()
    mockedLoadHostedConstructor.mockResolvedValue(harness.module)

    server.use(
      http.get('/api/diagrams/:id', ({ params }) =>
        HttpResponse.json({
          status: 'success',
          data: {
            _id: String(params.id),
            name: 'Admin Diagram',
            layout: { images: [] },
            __v: 9,
          },
        }),
      ),
    )

    act(() => {
      useAuthStore.getState().setSession(adminSession)
    })

    renderRoutes('/admin/editor/diagram-admin')

    expect(await screen.findByText('Hosted Constructor')).toBeInTheDocument()

    await waitFor(() => {
      expect(harness.createHostedConstructorMock).toHaveBeenCalledTimes(1)
    })

    expect(harness.getLastConfig()?.mode).toBe('reduced')
  })

  it('auto-recovers invalid layout payloads on user full route and opens runtime', async () => {
    const harness = createMockHostedConstructorHarness()
    mockedLoadHostedConstructor.mockResolvedValue(harness.module)

    server.use(
      http.get('/api/diagrams/:id', ({ params }) =>
        HttpResponse.json({
          status: 'success',
          data: {
            _id: String(params.id),
            name: 'Broken User Diagram',
            layout: null,
            __v: 1,
          },
        }),
      ),
      http.get('/api/edge-servers', () =>
        HttpResponse.json({
          status: 'success',
          data: [
            {
              _id: 'edge-1',
              name: 'Machine 1',
              lifecycleState: 'Active',
              availability: { online: true, lastSeenAt: null },
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
      http.get('/api/diagrams/:id/bindings', () =>
        HttpResponse.json({
          status: 'success',
          data: [],
        }),
      ),
    )

    act(() => {
      useAuthStore.getState().setSession(userSession)
    })

    renderRoutes('/hub/editor/diagram-invalid-layout')

    await waitFor(() => {
      expect(harness.createHostedConstructorMock).toHaveBeenCalledTimes(1)
    })

    expect(screen.queryByText('Unable to open hosted constructor page.')).not.toBeInTheDocument()
    expect(screen.getByText(/recovered with an empty layout/i)).toBeInTheDocument()
    expect(harness.getLastConfig()?.initialLayout).toEqual({})
    expect(harness.getLastConfig()?.mode).toBe('full')
  })

  it('keeps hosted runtime mounted while temporary re-auth overlay is visible (T014a)', async () => {
    const harness = createMockHostedConstructorHarness()
    mockedLoadHostedConstructor.mockResolvedValue(harness.module)

    server.use(
      http.get('/api/diagrams/:id', ({ params }) =>
        HttpResponse.json({
          status: 'success',
          data: {
            _id: String(params.id),
            name: 'ReAuth Diagram',
            layout: { widgets: [] },
            __v: 1,
          },
        }),
      ),
      http.get('/api/edge-servers', () =>
        HttpResponse.json({
          status: 'success',
          data: [
            {
              _id: 'edge-reauth',
              name: 'Reauth machine',
              lifecycleState: 'Active',
              availability: { online: true, lastSeenAt: null },
            },
          ],
        }),
      ),
      http.get('/api/edge-servers/:edgeId/catalog', ({ params }) =>
        HttpResponse.json({
          status: 'success',
          data: [
            {
              edgeServerId: String(params.edgeId),
              sourceId: 'line',
              deviceId: 'device-reauth',
              metric: 'flow',
              label: 'Line flow',
            },
          ],
        }),
      ),
      http.get('/api/diagrams/:id/bindings', () =>
        HttpResponse.json({
          status: 'success',
          data: [],
        }),
      ),
    )

    act(() => {
      useAuthStore.getState().setSession(userSession)
    })

    renderRoutes('/hub/editor/diagram-reauth')

    await waitFor(() => {
      expect(harness.createHostedConstructorMock).toHaveBeenCalledTimes(1)
    })

    act(() => {
      useReAuthStore.getState().triggerReAuth('/hub/editor/diagram-reauth')
    })

    expect(await screen.findByText('Session expired')).toBeInTheDocument()
    expect(harness.createHostedConstructorMock).toHaveBeenCalledTimes(1)
    expect(harness.instanceSpies.destroyMock).not.toHaveBeenCalled()

    act(() => {
      useReAuthStore.getState().clearReAuth()
    })

    await waitFor(() => {
      expect(harness.createHostedConstructorMock).toHaveBeenCalledTimes(1)
    })
    expect(harness.instanceSpies.destroyMock).not.toHaveBeenCalled()
  })
})
