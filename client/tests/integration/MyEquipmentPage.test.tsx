import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { userHubRouteChildren } from '@/app/userHubRoutes'
import { ProtectedRoute } from '@/shared/components/ProtectedRoute'
import { useAuthStore, type Session } from '@/shared/store/useAuthStore'
import { useTelemetryStore } from '@/shared/store/useTelemetryStore'
import { server } from '../mocks/server'

const userSession: Session = {
  id: 'user-1',
  email: 'user@example.com',
  role: 'USER',
  tier: 'PRO',
  accessToken: 'user-token',
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
    ],
    { initialEntries: [path] },
  )

  render(<RouterProvider router={router} />)
  return router
}

beforeEach(() => {
  act(() => {
    useAuthStore.setState({ session: null, isAuthenticated: false })
    useAuthStore.getState().setSession(userSession)
    useTelemetryStore.setState({
      isConnected: false,
      edgeStatusById: {},
      latestValues: {},
      subscribedEdgeId: null,
      subscribedDiagramId: null,
      reconnectAttempt: 0,
      nextRetryDelayMs: null,
    })
  })
})

describe('MyEquipmentPage route wiring (T034)', () => {
  it('resolves /hub/edge to equipment page content instead of placeholder fallback', async () => {
    server.use(
      http.get('/api/edge-servers', () =>
        HttpResponse.json({
          status: 'success',
          data: [
            {
              _id: 'edge-a',
              name: 'Boiler Edge A',
              lifecycleState: 'Active',
              availability: { online: true, lastSeenAt: '2026-03-29T08:00:00.000Z' },
            },
          ],
        }),
      ),
    )

    mount('/hub/edge')

    expect(await screen.findByRole('heading', { name: 'My Equipment' })).toBeInTheDocument()
    expect(screen.queryByText('User Hub - Page (Phase 4-8)')).not.toBeInTheDocument()
  })
})

describe('MyEquipmentPage assigned-edge readiness view (T033/T047)', () => {
  it('renders assigned edges with online and offline status plus last-seen values', async () => {
    server.use(
      http.get('/api/edge-servers', () =>
        HttpResponse.json({
          status: 'success',
          data: [
            {
              _id: 'edge-online',
              name: 'Pump Edge B',
              lifecycleState: 'Active',
              availability: { online: true, lastSeenAt: '2026-03-29T10:15:00.000Z' },
            },
            {
              _id: 'edge-offline',
              name: 'Valve Edge C',
              lifecycleState: 'Active',
              availability: { online: false, lastSeenAt: '2026-03-28T22:05:00.000Z' },
            },
          ],
        }),
      ),
    )

    mount('/hub/edge')

    expect(await screen.findByText('Pump Edge B')).toBeInTheDocument()
    expect(screen.getByText('Valve Edge C')).toBeInTheDocument()
    expect(screen.getByText('Online')).toBeInTheDocument()
    expect(screen.getByText('Offline')).toBeInTheDocument()
    expect(screen.getByText('2026-03-29 10:15 UTC')).toBeInTheDocument()
    expect(screen.getByText('2026-03-28 22:05 UTC')).toBeInTheDocument()
  })
})
