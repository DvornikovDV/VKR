import { act, render, screen, within } from '@testing-library/react'
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
        element: <div>Login</div>,
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

describe('repro_task_T056', () => {
  it('renders canonical lifecycle and availability rows for assigned blocked edges on /hub/edge', async () => {
    server.use(
      http.get('/api/edge-servers', () =>
        HttpResponse.json({
          status: 'success',
          data: [
            {
              _id: 'edge-active',
              name: 'Active Edge',
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
    )

    mount('/hub/edge')

    const blockedCard = (await screen.findByText('Blocked Edge')).closest('article')
    expect(blockedCard).not.toBeNull()

    const card = within(blockedCard as HTMLElement)
    expect(card.getByText('Lifecycle')).toBeInTheDocument()
    expect(card.getAllByText('Blocked')).toHaveLength(2)
    expect(card.getByText('Availability')).toBeInTheDocument()
    expect(card.getAllByText('Offline')).toHaveLength(2)
    expect(card.getByText('Last seen')).toBeInTheDocument()
    expect(card.getByText('2026-04-19 09:30 UTC')).toBeInTheDocument()
  })
})
