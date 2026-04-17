import { act } from '@testing-library/react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { server } from '../mocks/server'
import { adminHubRouteChildren } from '@/app/adminHubRoutes'
import { ProtectedRoute } from '@/shared/components/ProtectedRoute'
import { useAuthStore, type Session } from '@/shared/store/useAuthStore'

const adminSession: Session = {
  id: 'admin-1',
  email: 'admin@example.com',
  role: 'ADMIN',
  tier: 'PRO',
  accessToken: 'admin-token',
}

function renderAdminEdgeRoute() {
  const router = createMemoryRouter(
    [
      {
        path: '/login',
        element: <div>Login</div>,
      },
      {
        path: '/admin',
        element: <ProtectedRoute requiredRole="ADMIN" />,
        children: adminHubRouteChildren,
      },
    ],
    { initialEntries: ['/admin/edge'] },
  )

  render(<RouterProvider router={router} />)
}

beforeEach(() => {
  act(() => {
    useAuthStore.setState({ session: null, isAuthenticated: false })
    useAuthStore.getState().setSession(adminSession)
  })
})

describe('repro_task_T054', () => {
  it('keeps the Edge Fleet block flow working when the cloud contract returns data.edge', async () => {
    server.use(
      http.get('/api/admin/edge-servers', () =>
        HttpResponse.json({
          status: 'success',
          data: [
            {
              _id: 'edge-active',
              name: 'Active Edge',
              lifecycleState: 'Active',
              availability: { online: true, lastSeenAt: '2026-04-17T10:00:00.000Z' },
              trustedUsers: [],
              createdBy: { _id: 'admin-1', email: 'admin@example.com' },
              persistentCredentialVersion: 2,
              lastLifecycleEventAt: '2026-04-17T10:00:00.000Z',
            },
          ],
        }),
      ),
      http.get('/api/admin/users', () =>
        HttpResponse.json({
          status: 'success',
          total: 0,
          data: [],
        }),
      ),
      http.get('/api/edge-servers/:edgeId/ping', () =>
        HttpResponse.json({
          status: 'success',
          data: {
            lifecycleState: 'Active',
            availability: { online: true, lastSeenAt: '2026-04-17T10:00:00.000Z' },
          },
        }),
      ),
      http.post('/api/edge-servers/:edgeId/block', ({ params }) =>
        HttpResponse.json({
          status: 'success',
          data: {
            edge: {
              _id: String(params.edgeId),
              name: 'Active Edge',
              lifecycleState: 'Blocked',
              availability: { online: false, lastSeenAt: '2026-04-17T10:05:00.000Z' },
              trustedUsers: [],
              createdBy: { _id: 'admin-1', email: 'admin@example.com' },
              persistentCredentialVersion: 2,
              lastLifecycleEventAt: '2026-04-17T10:05:00.000Z',
            },
          },
        }),
      ),
    )

    const user = userEvent.setup()
    renderAdminEdgeRoute()

    expect(await screen.findByRole('heading', { name: 'Edge Fleet' })).toBeInTheDocument()

    const edgeRow = await screen.findByText('Active Edge')
    const row = edgeRow.closest('tr')
    expect(row).not.toBeNull()

    await user.click(
      within(row as HTMLTableRowElement).getByRole('button', { name: 'Block edge' }),
    )

    await waitFor(() => {
      const updatedRow = screen.getByText('Active Edge').closest('tr')
      expect(updatedRow).not.toBeNull()
      expect(within(updatedRow as HTMLTableRowElement).getByText('Blocked')).toBeInTheDocument()
      expect(within(updatedRow as HTMLTableRowElement).getByText('Offline')).toBeInTheDocument()
    })
  })
})
