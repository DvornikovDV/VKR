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

  it('T012: shows onboarding disclosure for register and reset without re-showing old secret', async () => {
    interface MockEdge {
      _id: string
      name: string
      lifecycleState: 'Pending First Connection' | 'Active' | 'Re-onboarding Required' | 'Blocked'
      isTelemetryReady: boolean
      availability: {
        online: boolean
        lastSeenAt: string | null
      }
      trustedUsers: Array<{ _id: string; email: string }>
      createdBy: { _id: string; email: string } | null
      currentOnboardingPackage: {
        credentialId: string
        status: 'ready' | 'used' | 'expired' | 'reset' | 'blocked'
        issuedAt: string
        expiresAt: string
        usedAt: string | null
        displayHint: string | null
      } | null
      persistentCredentialVersion: number | null
      lastLifecycleEventAt: string | null
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
        lifecycleState: 'Active',
        isTelemetryReady: true,
        availability: { online: false, lastSeenAt: null },
        trustedUsers: [],
        createdBy: { _id: 'admin-1', email: 'admin@example.com' },
        currentOnboardingPackage: null,
        persistentCredentialVersion: 2,
        lastLifecycleEventAt: '2026-03-29T09:00:00.000Z',
      },
    ]

    const registrationSecret = 'register-secret-value'
    const resetSecret = 'reset-secret-value'

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
        const body = (await request.json()) as { name: string }
        const created = {
          _id: 'edge-2',
          name: body.name,
          lifecycleState: 'Pending First Connection' as const,
          isTelemetryReady: false,
          availability: { online: false, lastSeenAt: null },
          trustedUsers: [],
          createdBy: { _id: 'admin-1', email: 'admin@example.com' },
          currentOnboardingPackage: {
            credentialId: 'pkg-edge-2-v1',
            status: 'ready' as const,
            issuedAt: '2026-03-29T10:00:00.000Z',
            expiresAt: '2026-03-30T10:00:00.000Z',
            usedAt: null,
            displayHint: 'Ends with ...EDGE',
          },
          persistentCredentialVersion: null,
          lastLifecycleEventAt: '2026-03-29T10:00:00.000Z',
        }
        fleet = [created, ...fleet]

        return HttpResponse.json(
          {
            status: 'success',
            data: {
              edge: created,
              onboardingPackage: {
                edgeId: created._id,
                onboardingSecret: registrationSecret,
                issuedAt: '2026-03-29T10:00:00.000Z',
                expiresAt: '2026-03-30T10:00:00.000Z',
                instructions: 'Use once during first activation',
              },
            },
          },
          { status: 201 },
        )
      }),
      http.post('/api/edge-servers/:edgeId/onboarding/reset', ({ params }) => {
        const edgeId = String(params.edgeId)
        const target = fleet.find((edge) => edge._id === edgeId)
        if (!target) {
          return HttpResponse.json({ status: 'error', message: 'Edge not found' }, { status: 404 })
        }

        const updated = {
          ...target,
          currentOnboardingPackage: {
            credentialId: 'pkg-edge-2-v2',
            status: 'ready' as const,
            issuedAt: '2026-03-29T11:00:00.000Z',
            expiresAt: '2026-03-30T11:00:00.000Z',
            usedAt: null,
            displayHint: 'Ends with ...RESET',
          },
          lastLifecycleEventAt: '2026-03-29T11:00:00.000Z',
        }
        fleet = fleet.map((edge) => (edge._id === edgeId ? updated : edge))

        return HttpResponse.json({
          status: 'success',
          data: {
            edge: updated,
            onboardingPackage: {
              edgeId,
              onboardingSecret: resetSecret,
              issuedAt: '2026-03-29T11:00:00.000Z',
              expiresAt: '2026-03-30T11:00:00.000Z',
              instructions: 'Use once during first activation',
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

    expect(await screen.findByRole('heading', { name: 'One-time onboarding package' })).toBeInTheDocument()
    expect(screen.getByText(registrationSecret)).toBeInTheDocument()

    await waitFor(() => {
      const row = screen.getByText('New Edge').closest('tr')
      expect(row).not.toBeNull()
      expect(within(row as HTMLTableRowElement).getByText('Pending First Connection')).toBeInTheDocument()
      expect(within(row as HTMLTableRowElement).getByText('Ends with ...EDGE')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Refresh' }))

    await waitFor(() => {
      expect(screen.queryByText(registrationSecret)).not.toBeInTheDocument()
    })

    const refreshedRow = screen.getByText('New Edge').closest('tr')
    expect(refreshedRow).not.toBeNull()
    expect(within(refreshedRow as HTMLTableRowElement).getByText('Ends with ...EDGE')).toBeInTheDocument()

    await user.click(
      within(refreshedRow as HTMLTableRowElement).getByRole('button', { name: 'Reset onboarding' }),
    )

    expect(await screen.findByText(resetSecret)).toBeInTheDocument()
    expect(screen.queryByText(registrationSecret)).not.toBeInTheDocument()

    await waitFor(() => {
      const row = screen.getByText('New Edge').closest('tr')
      expect(row).not.toBeNull()
      expect(within(row as HTMLTableRowElement).getByText('Ends with ...RESET')).toBeInTheDocument()
    })
  })

  it('T024: renders lifecycle controls and applies recovery actions from lifecycle-aware payloads', async () => {
    interface MockEdge {
      _id: string
      name: string
      lifecycleState: 'Pending First Connection' | 'Active' | 'Re-onboarding Required' | 'Blocked'
      isTelemetryReady: boolean
      availability: {
        online: boolean
        lastSeenAt: string | null
      }
      trustedUsers: Array<{ _id: string; email: string }>
      createdBy: { _id: string; email: string } | null
      currentOnboardingPackage: {
        credentialId: string
        status: 'ready' | 'used' | 'expired' | 'reset' | 'blocked'
        issuedAt: string
        expiresAt: string
        usedAt: string | null
        displayHint: string | null
      } | null
      persistentCredentialVersion: number | null
      lastLifecycleEventAt: string | null
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
        _id: 'edge-pending',
        name: 'Pending Edge',
        lifecycleState: 'Pending First Connection',
        isTelemetryReady: false,
        availability: { online: false, lastSeenAt: null },
        trustedUsers: [],
        createdBy: { _id: 'admin-1', email: 'admin@example.com' },
        currentOnboardingPackage: {
          credentialId: 'pkg-pending-v1',
          status: 'ready',
          issuedAt: '2026-03-29T09:00:00.000Z',
          expiresAt: '2026-03-30T09:00:00.000Z',
          usedAt: null,
          displayHint: 'Ends with ...PEND',
        },
        persistentCredentialVersion: null,
        lastLifecycleEventAt: '2026-03-29T09:00:00.000Z',
      },
      {
        _id: 'edge-active',
        name: 'Active Edge',
        lifecycleState: 'Active',
        isTelemetryReady: true,
        availability: { online: true, lastSeenAt: '2026-03-29T10:00:00.000Z' },
        trustedUsers: [],
        createdBy: { _id: 'admin-1', email: 'admin@example.com' },
        currentOnboardingPackage: null,
        persistentCredentialVersion: 3,
        lastLifecycleEventAt: '2026-03-29T10:00:00.000Z',
      },
      {
        _id: 'edge-recovery',
        name: 'Recovery Edge',
        lifecycleState: 'Re-onboarding Required',
        isTelemetryReady: false,
        availability: { online: false, lastSeenAt: null },
        trustedUsers: [],
        createdBy: { _id: 'admin-1', email: 'admin@example.com' },
        currentOnboardingPackage: {
          credentialId: 'pkg-recovery-v1',
          status: 'ready',
          issuedAt: '2026-03-29T10:30:00.000Z',
          expiresAt: '2026-03-30T10:30:00.000Z',
          usedAt: null,
          displayHint: 'Ends with ...RECO',
        },
        persistentCredentialVersion: null,
        lastLifecycleEventAt: '2026-03-29T10:30:00.000Z',
      },
      {
        _id: 'edge-blocked',
        name: 'Blocked Edge',
        lifecycleState: 'Blocked',
        isTelemetryReady: false,
        availability: { online: false, lastSeenAt: null },
        trustedUsers: [],
        createdBy: { _id: 'admin-1', email: 'admin@example.com' },
        currentOnboardingPackage: {
          credentialId: 'pkg-blocked-v1',
          status: 'blocked',
          issuedAt: '2026-03-29T08:00:00.000Z',
          expiresAt: '2026-03-30T08:00:00.000Z',
          usedAt: null,
          displayHint: 'Ends with ...BLOC',
        },
        persistentCredentialVersion: null,
        lastLifecycleEventAt: '2026-03-29T10:45:00.000Z',
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
      // REST fallback intentionally disagrees with admin availability; page must prefer lifecycle payload.
      http.get('/api/edge-servers', () =>
        HttpResponse.json({
          status: 'success',
          data: fleet.map((edge) => ({ _id: edge._id, isOnline: !edge.availability.online })),
        }),
      ),
      http.post('/api/edge-servers/:edgeId/trust/revoke', ({ params }) => {
        const edgeId = String(params.edgeId)
        const edge = fleet.find((item) => item._id === edgeId)
        if (!edge) {
          return HttpResponse.json({ status: 'error', message: 'Edge not found' }, { status: 404 })
        }

        const updated: MockEdge = {
          ...edge,
          lifecycleState: 'Re-onboarding Required',
          isTelemetryReady: false,
          availability: { online: false, lastSeenAt: edge.availability.lastSeenAt },
          persistentCredentialVersion: null,
          lastLifecycleEventAt: '2026-03-29T11:00:00.000Z',
        }
        fleet = fleet.map((item) => (item._id === edgeId ? updated : item))
        return HttpResponse.json({ status: 'success', data: updated })
      }),
      http.post('/api/edge-servers/:edgeId/block', ({ params }) => {
        const edgeId = String(params.edgeId)
        const edge = fleet.find((item) => item._id === edgeId)
        if (!edge) {
          return HttpResponse.json({ status: 'error', message: 'Edge not found' }, { status: 404 })
        }

        const updated: MockEdge = {
          ...edge,
          lifecycleState: 'Blocked',
          isTelemetryReady: false,
          availability: { online: false, lastSeenAt: edge.availability.lastSeenAt },
          currentOnboardingPackage: edge.currentOnboardingPackage
            ? { ...edge.currentOnboardingPackage, status: 'blocked' }
            : edge.currentOnboardingPackage,
          lastLifecycleEventAt: '2026-03-29T11:05:00.000Z',
        }
        fleet = fleet.map((item) => (item._id === edgeId ? updated : item))
        return HttpResponse.json({ status: 'success', data: updated })
      }),
      http.post('/api/edge-servers/:edgeId/re-enable-onboarding', ({ params }) => {
        const edgeId = String(params.edgeId)
        const edge = fleet.find((item) => item._id === edgeId)
        if (!edge) {
          return HttpResponse.json({ status: 'error', message: 'Edge not found' }, { status: 404 })
        }

        const updated: MockEdge = {
          ...edge,
          lifecycleState: 'Re-onboarding Required',
          isTelemetryReady: false,
          lastLifecycleEventAt: '2026-03-29T11:10:00.000Z',
        }
        fleet = fleet.map((item) => (item._id === edgeId ? updated : item))
        return HttpResponse.json({ status: 'success', data: updated })
      }),
    )

    const user = userEvent.setup()
    renderAdminRoute('/admin/edge')

    expect(await screen.findByRole('heading', { name: 'Edge Fleet' })).toBeInTheDocument()

    const activeRow = screen.getByText('Active Edge').closest('tr')
    expect(activeRow).not.toBeNull()
    expect(within(activeRow as HTMLTableRowElement).getByText('Active')).toBeInTheDocument()
    expect(within(activeRow as HTMLTableRowElement).getByText('Online')).toBeInTheDocument()

    const pendingRow = screen.getByText('Pending Edge').closest('tr')
    expect(pendingRow).not.toBeNull()
    expect(
      within(pendingRow as HTMLTableRowElement).getByText('Pending First Connection'),
    ).toBeInTheDocument()

    const recoveryRow = screen.getByText('Recovery Edge').closest('tr')
    expect(recoveryRow).not.toBeNull()
    expect(
      within(recoveryRow as HTMLTableRowElement).getByText('Re-onboarding Required'),
    ).toBeInTheDocument()

    const blockedRow = screen.getByText('Blocked Edge').closest('tr')
    expect(blockedRow).not.toBeNull()
    expect(within(blockedRow as HTMLTableRowElement).getAllByText('Blocked').length).toBeGreaterThan(0)

    await user.click(
      within(activeRow as HTMLTableRowElement).getByRole('button', { name: 'Revoke trust' }),
    )

    await waitFor(() => {
      const updatedRow = screen.getByText('Active Edge').closest('tr')
      expect(updatedRow).not.toBeNull()
      expect(within(updatedRow as HTMLTableRowElement).getByText('Re-onboarding Required')).toBeInTheDocument()
      expect(within(updatedRow as HTMLTableRowElement).getByText('Offline')).toBeInTheDocument()
    })

    await user.click(
      within(pendingRow as HTMLTableRowElement).getByRole('button', { name: 'Block edge' }),
    )

    await waitFor(() => {
      const updatedRow = screen.getByText('Pending Edge').closest('tr')
      expect(updatedRow).not.toBeNull()
      expect(within(updatedRow as HTMLTableRowElement).getAllByText('Blocked').length).toBeGreaterThan(0)
    })

    await user.click(
      within(blockedRow as HTMLTableRowElement).getByRole('button', {
        name: 'Re-enable onboarding',
      }),
    )

    await waitFor(() => {
      const updatedRow = screen.getByText('Blocked Edge').closest('tr')
      expect(updatedRow).not.toBeNull()
      expect(within(updatedRow as HTMLTableRowElement).getByText('Re-onboarding Required')).toBeInTheDocument()
    })
  })

  it('keeps assign and revoke flow working on Edge Fleet page', async () => {
    interface MockEdge {
      _id: string
      name: string
      lifecycleState: 'Pending First Connection' | 'Active' | 'Re-onboarding Required' | 'Blocked'
      isTelemetryReady: boolean
      availability: {
        online: boolean
        lastSeenAt: string | null
      }
      trustedUsers: Array<{ _id: string; email: string }>
      createdBy: { _id: string; email: string } | null
      currentOnboardingPackage: {
        credentialId: string
        status: 'ready' | 'used' | 'expired' | 'reset' | 'blocked'
        issuedAt: string
        expiresAt: string
        usedAt: string | null
        displayHint: string | null
      } | null
      persistentCredentialVersion: number | null
      lastLifecycleEventAt: string | null
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
        lifecycleState: 'Pending First Connection',
        isTelemetryReady: false,
        availability: { online: true, lastSeenAt: '2026-03-29T09:00:00.000Z' },
        trustedUsers: [],
        createdBy: { _id: 'admin-1', email: 'admin@example.com' },
        currentOnboardingPackage: {
          credentialId: 'pkg-edge-1-v1',
          status: 'ready',
          issuedAt: '2026-03-29T09:00:00.000Z',
          expiresAt: '2026-03-30T09:00:00.000Z',
          usedAt: null,
          displayHint: 'Ends with ...A111',
        },
        persistentCredentialVersion: null,
        lastLifecycleEventAt: '2026-03-29T09:00:00.000Z',
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
          data: fleet.map((edge) => ({ _id: edge._id, isOnline: !edge.availability.online })),
        }),
      ),
      http.post('/api/edge-servers/:edgeId/bind', async ({ params, request }) => {
        const body = (await request.json()) as { userId: string }
        const edgeId = String(params.edgeId)
        const user = users.find((item) => item._id === body.userId)

        if (!user) {
          return HttpResponse.json({ status: 'error', message: 'User not found' }, { status: 404 })
        }

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
        fleet = fleet.map((edge) => (edge._id === edgeId ? { ...edge, trustedUsers: [] } : edge))
        const updated = fleet.find((edge) => edge._id === edgeId)

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
