import { act } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

function renderAdminRoute(path: string) {
  const router = createMemoryRouter(
    [
      {
        path: '/login',
        element: <div data-testid="login-page">Login</div>,
      },
      {
        path: '/admin',
        element: <ProtectedRoute requiredRole="ADMIN" />,
        children: adminHubRouteChildren,
      },
    ],
    { initialEntries: [path] },
  )

  render(<RouterProvider router={router} />)
}

beforeEach(() => {
  act(() => {
    useAuthStore.setState({ session: null, isAuthenticated: false })
    useAuthStore.getState().setSession(adminSession)
  })
})

describe('Admin Hub routes and pages (T050d)', () => {
  it('T026: resolves /admin/users and /admin/diagrams routes to target pages', async () => {
    server.use(
      http.get('/api/admin/users', () =>
        HttpResponse.json({
          status: 'success',
          total: 1,
          data: [
            {
              _id: 'u1',
              email: 'user@example.com',
              role: 'USER',
              subscriptionTier: 'FREE',
              isDeleted: false,
              isBanned: false,
              createdAt: '2026-03-01T00:00:00.000Z',
            },
          ],
        }),
      ),
      http.get('/api/diagrams', () =>
        HttpResponse.json({
          status: 'success',
          data: [{ _id: 'd1', name: 'Main Diagram', layout: {} }],
        }),
      ),
    )

    renderAdminRoute('/admin/users')
    expect(await screen.findByRole('heading', { name: 'User Management' })).toBeInTheDocument()

    renderAdminRoute('/admin/diagrams')
    expect(await screen.findByRole('heading', { name: 'Admin Diagram Gallery' })).toBeInTheDocument()
  })

  it('T023: supports register, assign and revoke flow on Edge Fleet page', async () => {
    interface MockEdge {
      _id: string
      name: string
      trustedUsers: Array<{ _id: string; email: string }>
      createdBy: { _id: string; email: string }
    }

    const users = [
      {
        _id: 'u1',
        email: 'user-1@example.com',
        role: 'USER',
        subscriptionTier: 'FREE',
        isDeleted: false,
        isBanned: false,
        createdAt: '2026-03-01T00:00:00.000Z',
      },
    ]

    let fleet: MockEdge[] = [
      {
        _id: 'edge-1',
        name: 'Existing Edge',
        trustedUsers: [],
        createdBy: { _id: 'admin-1', email: 'admin@example.com' },
      },
    ]

    server.use(
      http.get('/api/admin/edge-servers', () =>
        HttpResponse.json({
          status: 'success',
          data: fleet,
        }),
      ),
      http.get('/api/admin/users', () =>
        HttpResponse.json({
          status: 'success',
          total: users.length,
          data: users,
        }),
      ),
      http.get('/api/edge-servers', () =>
        HttpResponse.json({
          status: 'success',
          data: fleet.map((edge) => ({ _id: edge._id, isOnline: false })),
        }),
      ),
      http.post('/api/edge-servers', async ({ request }) => {
        const body = (await request.json()) as { name: string; apiKeyHash: string }
        const created = {
          _id: 'edge-2',
          name: body.name,
          trustedUsers: [],
          createdBy: { _id: 'admin-1', email: 'admin@example.com' },
        }
        fleet = [created, ...fleet]

        return HttpResponse.json(
          {
            status: 'success',
            data: created,
          },
          { status: 201 },
        )
      }),
      http.post('/api/edge-servers/:edgeId/bind', async ({ params, request }) => {
        const body = (await request.json()) as { userId: string }
        const user = users.find((item) => item._id === body.userId)
        if (!user) {
          return HttpResponse.json({ status: 'error', message: 'User not found' }, { status: 404 })
        }

        const edgeId = String(params.edgeId)
        fleet = fleet.map((edge) =>
          edge._id === edgeId
            ? { ...edge, trustedUsers: [{ _id: user._id, email: user.email }] }
            : edge,
        )
        const updated = fleet.find((edge) => edge._id === edgeId)

        return HttpResponse.json({ status: 'success', data: updated })
      }),
      http.delete('/api/edge-servers/:edgeId/bind/:userId', ({ params }) => {
        const edgeId = String(params.edgeId)
        fleet = fleet.map((edge) =>
          edge._id === edgeId ? { ...edge, trustedUsers: [] } : edge,
        )
        const updated = fleet.find((edge) => edge._id === edgeId)

        return HttpResponse.json({ status: 'success', data: updated })
      }),
    )

    const user = userEvent.setup()
    renderAdminRoute('/admin/edge')

    expect(await screen.findByRole('heading', { name: 'Edge Fleet' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Register Edge Server' }))
    await user.type(screen.getByLabelText('Name'), 'New Edge')
    await user.type(screen.getByLabelText('API key hash'), 'hash-new-edge')
    await user.click(screen.getByRole('button', { name: 'Register' }))

    const newEdgeCell = await screen.findByText('New Edge')
    const newEdgeRow = newEdgeCell.closest('tr')
    expect(newEdgeRow).not.toBeNull()

    await user.click(within(newEdgeRow as HTMLTableRowElement).getByRole('button', { name: 'Assign to User' }))
    await user.selectOptions(screen.getByLabelText('User'), 'u1')
    await user.click(screen.getByRole('button', { name: 'Assign' }))

    await waitFor(() => {
      const row = screen.getByText('New Edge').closest('tr')
      expect(row).not.toBeNull()
      expect(within(row as HTMLTableRowElement).getByText('user-1@example.com')).toBeInTheDocument()
    })

    await user.click(within(screen.getByText('New Edge').closest('tr') as HTMLTableRowElement).getByRole('button', { name: 'Revoke API key' }))
    await user.click(screen.getByRole('button', { name: 'Revoke' }))

    await waitFor(() => {
      const row = screen.getByText('New Edge').closest('tr')
      expect(row).not.toBeNull()
      expect(within(row as HTMLTableRowElement).getByText('Not assigned')).toBeInTheDocument()
    })
  })

  it('T025b: blocks assign for FREE user without slots and allows assign when slot exists', async () => {
    let diagrams = [{ _id: 'd1', name: 'Diagram A', layout: {} }]
    const users = [
      {
        _id: 'u-full',
        email: 'full@example.com',
        role: 'USER',
        subscriptionTier: 'FREE',
        isDeleted: false,
        isBanned: false,
        createdAt: '2026-03-01T00:00:00.000Z',
        diagramCount: 3,
      },
      {
        _id: 'u-free',
        email: 'free@example.com',
        role: 'USER',
        subscriptionTier: 'FREE',
        isDeleted: false,
        isBanned: false,
        createdAt: '2026-03-01T00:00:00.000Z',
        diagramCount: 1,
      },
    ]

    server.use(
      http.get('/api/diagrams', () =>
        HttpResponse.json({
          status: 'success',
          data: diagrams,
        }),
      ),
      http.get('/api/admin/users', () =>
        HttpResponse.json({
          status: 'success',
          total: users.length,
          data: users,
        }),
      ),
      http.post('/api/diagrams/:id/assign', async ({ request, params }) => {
        const body = (await request.json()) as { targetUserId: string }
        if (body.targetUserId === 'u-full') {
          return HttpResponse.json(
            { status: 'error', message: 'Target user has no free slots' },
            { status: 403 },
          )
        }

        const diagramId = String(params.id)
        diagrams = diagrams.filter((diagram) => diagram._id !== diagramId)
        return HttpResponse.json({ status: 'success', data: { _id: diagramId } })
      }),
    )

    const user = userEvent.setup()
    renderAdminRoute('/admin/diagrams')

    expect(await screen.findByText('Diagram A')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Assign to User' }))
    await user.selectOptions(screen.getByLabelText('Target user'), 'u-full')

    expect(
      screen.getByText('Assignment is blocked for this user: FREE tier limit reached.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Assign' })).toBeDisabled()

    await user.selectOptions(screen.getByLabelText('Target user'), 'u-free')
    expect(screen.getByRole('button', { name: 'Assign' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: 'Assign' }))

    await waitFor(() => {
      expect(screen.queryByText('Diagram A')).not.toBeInTheDocument()
    })
  })
})
