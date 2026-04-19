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

interface MockEdge {
  _id: string
  name: string
  lifecycleState: 'Active' | 'Blocked'
  availability: {
    online: boolean
    lastSeenAt: string | null
  }
  trustedUsers: Array<{ _id: string; email: string }>
  createdBy: { _id: string; email: string } | null
  persistentCredentialVersion: number | null
  lastLifecycleEventAt: string | null
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

function installCanonicalEdgeFleetHandlers(params: {
  fleetRef: { current: MockEdge[] }
  users: Array<{
    _id: string
    email: string
    role: 'ADMIN' | 'USER'
    subscriptionTier: 'FREE' | 'PRO'
    isDeleted: boolean
    isBanned: boolean
    createdAt: string
  }>
}) {
  server.use(
    http.get('/api/admin/edge-servers', () =>
      HttpResponse.json({
        status: 'success',
        data: params.fleetRef.current,
      }),
    ),
    http.get('/api/admin/users', () =>
      HttpResponse.json({
        status: 'success',
        total: params.users.length,
        data: params.users,
      }),
    ),
    http.get('/api/edge-servers/:edgeId/ping', ({ params: routeParams }) => {
      const edgeId = String(routeParams.edgeId)
      const edge = params.fleetRef.current.find((item) => item._id === edgeId)

      if (!edge) {
        return HttpResponse.json({ status: 'error', message: 'Edge not found' }, { status: 404 })
      }

      return HttpResponse.json({
        status: 'success',
        data: {
          lifecycleState: edge.lifecycleState,
          availability: edge.availability,
        },
      })
    }),
  )
}

beforeEach(() => {
  act(() => {
    useAuthStore.setState({ session: null, isAuthenticated: false })
    useAuthStore.getState().setSession(adminSession)
  })
})

describe('Admin Hub routes and pages (canonical edge contract)', () => {
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

  it('shows one-time persistent credential disclosure for register, rotate, and unblock without keeping old secret visible', async () => {
    const users = [
      {
        _id: 'u1',
        email: 'user-1@example.com',
        role: 'USER' as const,
        subscriptionTier: 'FREE' as const,
        isDeleted: false,
        isBanned: false,
        createdAt: '2026-03-01T00:00:00.000Z',
      },
    ]

    const fleetRef = {
      current: [
        {
          _id: 'edge-active',
          name: 'Active Edge',
          lifecycleState: 'Active' as const,
          availability: { online: true, lastSeenAt: '2026-03-29T10:00:00.000Z' },
          trustedUsers: [],
          createdBy: { _id: 'admin-1', email: 'admin@example.com' },
          persistentCredentialVersion: 2,
          lastLifecycleEventAt: '2026-03-29T10:00:00.000Z',
        },
        {
          _id: 'edge-blocked',
          name: 'Blocked Edge',
          lifecycleState: 'Blocked' as const,
          availability: { online: false, lastSeenAt: '2026-03-29T09:30:00.000Z' },
          trustedUsers: [],
          createdBy: { _id: 'admin-1', email: 'admin@example.com' },
          persistentCredentialVersion: 1,
          lastLifecycleEventAt: '2026-03-29T09:30:00.000Z',
        },
      ] satisfies MockEdge[],
    }

    installCanonicalEdgeFleetHandlers({ fleetRef, users })

    const registrationSecret = 'register-secret-value'
    const rotateSecret = 'rotate-secret-value'
    const unblockSecret = 'unblock-secret-value'

    server.use(
      http.post('/api/edge-servers', async ({ request }) => {
        const body = (await request.json()) as { name: string }
        const created: MockEdge = {
          _id: 'edge-new',
          name: body.name,
          lifecycleState: 'Active',
          availability: { online: false, lastSeenAt: null },
          trustedUsers: [],
          createdBy: { _id: 'admin-1', email: 'admin@example.com' },
          persistentCredentialVersion: 1,
          lastLifecycleEventAt: '2026-03-29T10:10:00.000Z',
        }
        fleetRef.current = [created, ...fleetRef.current]

        return HttpResponse.json(
          {
            status: 'success',
            data: {
              edge: created,
              persistentCredential: {
                edgeId: created._id,
                credentialSecret: registrationSecret,
                version: 1,
                issuedAt: '2026-03-29T10:10:00.000Z',
                instructions: 'Use this secret as the edge runtime persistent credential.',
              },
            },
          },
          { status: 201 },
        )
      }),
      http.post('/api/edge-servers/:edgeId/rotate-credential', ({ params }) => {
        const edgeId = String(params.edgeId)
        const target = fleetRef.current.find((edge) => edge._id === edgeId)
        if (!target) {
          return HttpResponse.json({ status: 'error', message: 'Edge not found' }, { status: 404 })
        }

        const updated: MockEdge = {
          ...target,
          persistentCredentialVersion: (target.persistentCredentialVersion ?? 0) + 1,
          lastLifecycleEventAt: '2026-03-29T10:20:00.000Z',
        }
        fleetRef.current = fleetRef.current.map((edge) => (edge._id === edgeId ? updated : edge))

        return HttpResponse.json({
          status: 'success',
          data: {
            edge: updated,
            persistentCredential: {
              edgeId,
              credentialSecret: rotateSecret,
              version: updated.persistentCredentialVersion,
              issuedAt: '2026-03-29T10:20:00.000Z',
              instructions: 'Use this secret as the edge runtime persistent credential.',
            },
          },
        })
      }),
      http.post('/api/edge-servers/:edgeId/unblock', ({ params }) => {
        const edgeId = String(params.edgeId)
        const target = fleetRef.current.find((edge) => edge._id === edgeId)
        if (!target) {
          return HttpResponse.json({ status: 'error', message: 'Edge not found' }, { status: 404 })
        }

        const updated: MockEdge = {
          ...target,
          lifecycleState: 'Active',
          persistentCredentialVersion: (target.persistentCredentialVersion ?? 0) + 1,
          lastLifecycleEventAt: '2026-03-29T10:30:00.000Z',
        }
        fleetRef.current = fleetRef.current.map((edge) => (edge._id === edgeId ? updated : edge))

        return HttpResponse.json({
          status: 'success',
          data: {
            edge: updated,
            persistentCredential: {
              edgeId,
              credentialSecret: unblockSecret,
              version: updated.persistentCredentialVersion,
              issuedAt: '2026-03-29T10:30:00.000Z',
              instructions: 'Use this secret as the edge runtime persistent credential.',
            },
          },
        })
      }),
    )

    const user = userEvent.setup()
    renderAdminRoute('/admin/edge')

    expect(await screen.findByRole('heading', { name: 'Edge Fleet' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Register Edge Server' }))
    await user.type(screen.getByLabelText('Name'), 'New Edge')
    await user.click(screen.getByRole('button', { name: 'Register' }))

    expect(await screen.findByRole('heading', { name: 'One-time persistent credential' })).toBeInTheDocument()
    expect(screen.getByText(registrationSecret)).toBeInTheDocument()

    const newRow = await screen.findByText('New Edge')
    expect(within(newRow.closest('tr') as HTMLTableRowElement).getByText('v1')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Refresh' }))
    await waitFor(() => {
      expect(screen.queryByText(registrationSecret)).not.toBeInTheDocument()
    })

    await user.click(
      within(screen.getByText('New Edge').closest('tr') as HTMLTableRowElement).getByRole('button', {
        name: 'Rotate credential',
      }),
    )
    expect(await screen.findByText(rotateSecret)).toBeInTheDocument()
    expect(screen.queryByText(registrationSecret)).not.toBeInTheDocument()

    await user.click(
      within(screen.getByText('Blocked Edge').closest('tr') as HTMLTableRowElement).getByRole('button', {
        name: 'Unblock edge',
      }),
    )
    expect(await screen.findByText(unblockSecret)).toBeInTheDocument()
    expect(screen.queryByText(rotateSecret)).not.toBeInTheDocument()
  })

  it('renders canonical lifecycle controls and removes onboarding-only actions', async () => {
    const users = [
      {
        _id: 'u1',
        email: 'user-1@example.com',
        role: 'USER' as const,
        subscriptionTier: 'FREE' as const,
        isDeleted: false,
        isBanned: false,
        createdAt: '2026-03-01T00:00:00.000Z',
      },
    ]

    const fleetRef = {
      current: [
        {
          _id: 'edge-active',
          name: 'Active Edge',
          lifecycleState: 'Active' as const,
          availability: { online: true, lastSeenAt: '2026-03-29T10:00:00.000Z' },
          trustedUsers: [],
          createdBy: { _id: 'admin-1', email: 'admin@example.com' },
          persistentCredentialVersion: 3,
          lastLifecycleEventAt: '2026-03-29T10:00:00.000Z',
        },
        {
          _id: 'edge-blocked',
          name: 'Blocked Edge',
          lifecycleState: 'Blocked' as const,
          availability: { online: false, lastSeenAt: '2026-03-29T09:00:00.000Z' },
          trustedUsers: [],
          createdBy: { _id: 'admin-1', email: 'admin@example.com' },
          persistentCredentialVersion: 2,
          lastLifecycleEventAt: '2026-03-29T09:00:00.000Z',
        },
      ] satisfies MockEdge[],
    }

    installCanonicalEdgeFleetHandlers({ fleetRef, users })

    server.use(
      http.post('/api/edge-servers/:edgeId/block', ({ params }) => {
        const edgeId = String(params.edgeId)
        const target = fleetRef.current.find((edge) => edge._id === edgeId)
        if (!target) {
          return HttpResponse.json({ status: 'error', message: 'Edge not found' }, { status: 404 })
        }

        const updatedSnapshot: MockEdge = {
          ...target,
          lifecycleState: 'Blocked',
          availability: { online: false, lastSeenAt: '2026-03-29T10:55:00.000Z' },
          lastLifecycleEventAt: '2026-03-29T10:55:00.000Z',
        }
        const updatedResponse: MockEdge = {
          ...updatedSnapshot,
          availability: { online: false, lastSeenAt: '2026-03-29T10:10:00.000Z' },
          lastLifecycleEventAt: '2026-03-29T10:10:00.000Z',
        }
        fleetRef.current = fleetRef.current.map((edge) => (edge._id === edgeId ? updatedSnapshot : edge))
        return HttpResponse.json({
          status: 'success',
          data: {
            edge: updatedResponse,
          },
        })
      }),
      http.post('/api/edge-servers/:edgeId/unblock', ({ params }) => {
        const edgeId = String(params.edgeId)
        const target = fleetRef.current.find((edge) => edge._id === edgeId)
        if (!target) {
          return HttpResponse.json({ status: 'error', message: 'Edge not found' }, { status: 404 })
        }

        const updated: MockEdge = {
          ...target,
          lifecycleState: 'Active',
          availability: { online: true, lastSeenAt: '2026-03-29T10:12:00.000Z' },
          persistentCredentialVersion: (target.persistentCredentialVersion ?? 0) + 1,
          lastLifecycleEventAt: '2026-03-29T10:12:00.000Z',
        }
        fleetRef.current = fleetRef.current.map((edge) => (edge._id === edgeId ? updated : edge))

        return HttpResponse.json({
          status: 'success',
          data: {
            edge: updated,
            persistentCredential: {
              edgeId,
              credentialSecret: 'unblock-secret',
              version: updated.persistentCredentialVersion,
              issuedAt: '2026-03-29T10:12:00.000Z',
              instructions: 'Use this secret as the edge runtime persistent credential.',
            },
          },
        })
      }),
    )

    const user = userEvent.setup()
    renderAdminRoute('/admin/edge')

    expect(await screen.findByRole('heading', { name: 'Edge Fleet' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reset onboarding' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Revoke trust' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Re-enable onboarding' })).not.toBeInTheDocument()

    const activeRow = screen.getByText('Active Edge').closest('tr')
    expect(activeRow).not.toBeNull()
    expect(within(activeRow as HTMLTableRowElement).getByText('Active')).toBeInTheDocument()
    expect(within(activeRow as HTMLTableRowElement).getByText('Online')).toBeInTheDocument()

    await user.click(
      within(activeRow as HTMLTableRowElement).getByRole('button', { name: 'Block edge' }),
    )

    await waitFor(() => {
      const updatedRow = screen.getByText('Active Edge').closest('tr')
      expect(updatedRow).not.toBeNull()
      expect(within(updatedRow as HTMLTableRowElement).getByText('Blocked')).toBeInTheDocument()
      expect(within(updatedRow as HTMLTableRowElement).getByText('Offline')).toBeInTheDocument()
      expect(within(updatedRow as HTMLTableRowElement).getByText('Last seen: 2026-03-29 10:55:00 UTC')).toBeInTheDocument()
    })

    const blockedRow = screen.getByText('Blocked Edge').closest('tr')
    expect(blockedRow).not.toBeNull()
    await user.click(
      within(blockedRow as HTMLTableRowElement).getByRole('button', { name: 'Unblock edge' }),
    )

    await waitFor(() => {
      const updatedRow = screen.getByText('Blocked Edge').closest('tr')
      expect(updatedRow).not.toBeNull()
      expect(within(updatedRow as HTMLTableRowElement).getByText('Active')).toBeInTheDocument()
      expect(within(updatedRow as HTMLTableRowElement).getByText('Online')).toBeInTheDocument()
      expect(within(updatedRow as HTMLTableRowElement).getByText('Last seen: 2026-03-29 10:12:00 UTC')).toBeInTheDocument()
    })
  })

  it('keeps assign and revoke flow working on Edge Fleet page', async () => {
    const users = [
      {
        _id: 'u1',
        email: 'user-1@example.com',
        role: 'USER' as const,
        subscriptionTier: 'FREE' as const,
        isDeleted: false,
        isBanned: false,
        createdAt: '2026-03-01T00:00:00.000Z',
      },
    ]

    const fleetRef = {
      current: [
        {
          _id: 'edge-1',
          name: 'Existing Edge',
          lifecycleState: 'Active' as const,
          availability: { online: true, lastSeenAt: '2026-03-29T09:00:00.000Z' },
          trustedUsers: [],
          createdBy: { _id: 'admin-1', email: 'admin@example.com' },
          persistentCredentialVersion: 1,
          lastLifecycleEventAt: '2026-03-29T09:00:00.000Z',
        },
      ] satisfies MockEdge[],
    }

    installCanonicalEdgeFleetHandlers({ fleetRef, users })

    server.use(
      http.post('/api/edge-servers/:edgeId/bind', async ({ params, request }) => {
        const body = (await request.json()) as { userId: string }
        const edgeId = String(params.edgeId)
        const matchedUser = users.find((item) => item._id === body.userId)

        if (!matchedUser) {
          return HttpResponse.json({ status: 'error', message: 'User not found' }, { status: 404 })
        }

        fleetRef.current = fleetRef.current.map((edge) =>
          edge._id === edgeId
            ? { ...edge, trustedUsers: [{ _id: matchedUser._id, email: matchedUser.email }] }
            : edge,
        )
        const updated = fleetRef.current.find((edge) => edge._id === edgeId)

        return HttpResponse.json({ status: 'success', data: updated })
      }),
      http.delete('/api/edge-servers/:edgeId/bind/:userId', ({ params }) => {
        const edgeId = String(params.edgeId)
        fleetRef.current = fleetRef.current.map((edge) =>
          edge._id === edgeId ? { ...edge, trustedUsers: [] } : edge,
        )
        const updated = fleetRef.current.find((edge) => edge._id === edgeId)

        return HttpResponse.json({ status: 'success', data: updated })
      }),
    )

    const user = userEvent.setup()
    renderAdminRoute('/admin/edge')

    expect(await screen.findByRole('heading', { name: 'Edge Fleet' })).toBeInTheDocument()

    const row = await screen.findByText('Existing Edge')
    const edgeRow = row.closest('tr')
    expect(edgeRow).not.toBeNull()
    expect(within(edgeRow as HTMLTableRowElement).getByText('Online')).toBeInTheDocument()

    await user.click(
      within(edgeRow as HTMLTableRowElement).getByRole('button', { name: 'Assign to User' }),
    )
    await user.selectOptions(screen.getByLabelText('User'), 'u1')
    await user.click(screen.getByRole('button', { name: 'Assign' }))

    await waitFor(() => {
      const updatedRow = screen.getByText('Existing Edge').closest('tr')
      expect(updatedRow).not.toBeNull()
      expect(within(updatedRow as HTMLTableRowElement).getByText('user-1@example.com')).toBeInTheDocument()
    })

    await user.click(
      within(screen.getByText('Existing Edge').closest('tr') as HTMLTableRowElement).getByRole(
        'button',
        { name: 'Remove user access' },
      ),
    )
    await user.click(screen.getByRole('button', { name: 'Revoke' }))

    await waitFor(() => {
      const updatedRow = screen.getByText('Existing Edge').closest('tr')
      expect(updatedRow).not.toBeNull()
      expect(within(updatedRow as HTMLTableRowElement).getByText('Not assigned')).toBeInTheDocument()
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
