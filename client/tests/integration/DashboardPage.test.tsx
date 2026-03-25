import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { server } from '../mocks/server'
import { userHubRouteChildren } from '@/app/userHubRoutes'
import { ProtectedRoute } from '@/shared/components/ProtectedRoute'
import { useAuthStore, type Session } from '@/shared/store/useAuthStore'

const userSession: Session = {
  id: 'user-1',
  email: 'user@example.com',
  role: 'USER',
  tier: 'PRO',
  accessToken: 'user-token',
}

const adminSession: Session = {
  id: 'admin-1',
  email: 'admin@example.com',
  role: 'ADMIN',
  tier: 'PRO',
  accessToken: 'admin-token',
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
      {
        path: '/admin',
        element: <ProtectedRoute requiredRole="ADMIN" />,
        children: [{ index: true, element: <div data-testid="admin-home">Admin Home</div> }],
      },
    ],
    { initialEntries: [path] },
  )

  render(<RouterProvider router={router} />)
  return router
}

function setupDashboardApiFixtures() {
  server.use(
    http.get('/api/diagrams', () =>
      HttpResponse.json({
        status: 'success',
        data: [
          { _id: 'diagram-1', name: 'Boiler', layout: { widgets: [] } },
          { _id: 'diagram-2', name: 'Pump', layout: { widgets: [] } },
        ],
      }),
    ),
    http.get('/api/edge-servers', () =>
      HttpResponse.json({
        status: 'success',
        data: [
          { _id: 'edge-1', name: 'Edge A' },
          { _id: 'edge-2', name: 'Edge B' },
        ],
      }),
    ),
    http.get('/api/diagrams/:id/bindings', ({ params }) => {
      if (params.id === 'diagram-1') {
        return HttpResponse.json({
          status: 'success',
          data: [
            {
              _id: 'binding-1',
              diagramId: 'diagram-1',
              edgeServerId: 'edge-1',
              widgetBindings: [],
            },
          ],
        })
      }

      if (params.id === 'diagram-2') {
        return HttpResponse.json({
          status: 'success',
          data: [
            {
              _id: 'binding-2',
              diagramId: 'diagram-2',
              edgeServerId: 'edge-2',
              widgetBindings: [],
            },
          ],
        })
      }

      return HttpResponse.json({ status: 'success', data: [] })
    }),
  )
}

beforeEach(() => {
  act(() => {
    useAuthStore.setState({ session: null, isAuthenticated: false })
    useAuthStore.getState().setSession(userSession)
  })
})

describe('DashboardPage (US1)', () => {
  it('supports valid route prefill with diagram and edge pair', async () => {
    setupDashboardApiFixtures()

    mount('/hub/dashboard?diagramId=diagram-1&edgeId=edge-1')

    expect(await screen.findByRole('heading', { name: 'Dashboard Monitoring' })).toBeInTheDocument()
    expect(screen.getByLabelText('Diagram')).toHaveValue('diagram-1')
    expect(screen.getByLabelText('Edge Server')).toHaveValue('edge-1')
  })

  it('keeps dashboard route and renders invalid-selection for edge-only query', async () => {
    setupDashboardApiFixtures()
    const router = mount('/hub/dashboard?edgeId=edge-1')

    expect(await screen.findByText('Invalid dashboard selection.')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/hub/dashboard')
  })

  it('denies admin access before dashboard initialization', async () => {
    act(() => {
      useAuthStore.setState({ session: null, isAuthenticated: false })
      useAuthStore.getState().setSession(adminSession)
    })

    mount('/hub/dashboard')

    expect(await screen.findByTestId('admin-home')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Dashboard Monitoring' })).not.toBeInTheDocument()
  })

  it('synchronizes URL query when user changes diagram and edge selection', async () => {
    setupDashboardApiFixtures()
    const router = mount('/hub/dashboard')

    expect(await screen.findByRole('heading', { name: 'Dashboard Monitoring' })).toBeInTheDocument()

    const user = userEvent.setup()
    await user.selectOptions(screen.getByLabelText('Diagram'), 'diagram-2')
    await waitFor(() => {
      expect(router.state.location.search).toContain('diagramId=diagram-2')
      expect(router.state.location.search).not.toContain('edgeId=')
    })
    expect(screen.getByText('Select an edge server to start monitoring.')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Edge Server'), 'edge-2')
    await waitFor(() => {
      expect(router.state.location.search).toContain('diagramId=diagram-2')
      expect(router.state.location.search).toContain('edgeId=edge-2')
    })
  })
})
