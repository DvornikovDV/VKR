import { act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { server } from '../mocks/server'
import { createAdminDiagramAssignmentHandlers } from '../mocks/handlers'
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

const originalClipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard')

function stubClipboard(writeText: Clipboard['writeText']) {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  })
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
  return router
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

afterEach(() => {
  if (originalClipboardDescriptor) {
    Object.defineProperty(navigator, 'clipboard', originalClipboardDescriptor)
    return
  }

  Reflect.deleteProperty(navigator, 'clipboard')
})

describe('Admin Hub routes and pages (canonical edge contract)', () => {
  it.each([
    ['/admin', 'Admin Overview'],
    ['/admin/diagrams', 'Admin Diagram Gallery'],
  ])('creates an empty Admin template from %s and opens the reduced editor', async (path) => {
    let createPayload: unknown = null

    server.use(
      http.get('/api/admin/users', () =>
        HttpResponse.json({
          status: 'success',
          total: 0,
          data: [],
        }),
      ),
      http.get('/api/admin/edge-servers', () =>
        HttpResponse.json({
          status: 'success',
          data: [],
        }),
      ),
      http.get('/api/diagrams', () =>
        HttpResponse.json({
          status: 'success',
          data: [],
        }),
      ),
      http.post('/api/diagrams', async ({ request }) => {
        createPayload = await request.json()
        return HttpResponse.json(
          {
            status: 'success',
            data: {
              _id: 'new-admin-template',
              name: 'New Admin Template',
              layout: {},
            },
          },
          { status: 201 },
        )
      }),
      http.get('/api/diagrams/new-admin-template', () =>
        HttpResponse.json({
          status: 'success',
          data: {
            _id: 'new-admin-template',
            name: 'New Admin Template',
            layout: {},
            __v: 0,
          },
        }),
      ),
    )

    const user = userEvent.setup()
    const router = renderAdminRoute(path)

    await user.click(await screen.findByRole('button', { name: 'Создать мнемосхему' }))
    await user.type(screen.getByLabelText('Имя мнемосхемы'), '  New Admin Template  ')
    await user.click(screen.getByRole('button', { name: 'Создать' }))

    await waitFor(() => {
      expect(createPayload).toEqual({
        name: 'New Admin Template',
        layout: {},
      })
      expect(router.state.location.pathname).toBe('/admin/editor/new-admin-template')
    })
  })

  it('keeps Admin template creation recoverable after one create-API failure', async () => {
    let createAttempts = 0

    server.use(
      http.get('/api/diagrams', () =>
        HttpResponse.json({
          status: 'success',
          data: [],
        }),
      ),
      http.get('/api/admin/users', () =>
        HttpResponse.json({
          status: 'success',
          total: 0,
          data: [],
        }),
      ),
      http.post('/api/diagrams', async ({ request }) => {
        createAttempts += 1
        const payload = (await request.json()) as { name: string; layout: Record<string, unknown> }

        if (createAttempts === 1) {
          return HttpResponse.json(
            { status: 'error', message: 'Create service unavailable' },
            { status: 503 },
          )
        }

        return HttpResponse.json(
          {
            status: 'success',
            data: {
              _id: 'recovered-template',
              ...payload,
            },
          },
          { status: 201 },
        )
      }),
      http.get('/api/diagrams/recovered-template', () =>
        HttpResponse.json({
          status: 'success',
          data: {
            _id: 'recovered-template',
            name: 'Recovered Template',
            layout: {},
            __v: 0,
          },
        }),
      ),
    )

    const user = userEvent.setup()
    const router = renderAdminRoute('/admin/diagrams')

    await user.click(await screen.findByRole('button', { name: 'Создать мнемосхему' }))
    await user.type(screen.getByLabelText('Имя мнемосхемы'), 'Recovered Template')
    await user.click(screen.getByRole('button', { name: 'Создать' }))

    expect(await screen.findByText('Ошибка сервера. Попробуйте позже.')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByLabelText('Имя мнемосхемы')).toHaveValue('Recovered Template')

    await user.click(screen.getByRole('button', { name: 'Создать' }))

    await waitFor(() => {
      expect(createAttempts).toBe(2)
      expect(router.state.location.pathname).toBe('/admin/editor/recovered-template')
    })
  })

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
    expect(await screen.findByRole('heading', { name: 'Пользователи' })).toBeInTheDocument()

    renderAdminRoute('/admin/diagrams')
    expect(await screen.findByRole('heading', { name: 'Мнемосхемы администратора' })).toBeInTheDocument()
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

    const fleetRef: { current: MockEdge[] } = {
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
    const writeText = vi.fn(async (_text: string) => undefined)
    writeText.mockRejectedValueOnce(new Error('Clipboard unavailable'))

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
    stubClipboard(writeText)
    renderAdminRoute('/admin/edge')

    expect(await screen.findByRole('heading', { name: 'Объекты' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Зарегистрировать объект' }))
    await user.type(screen.getByLabelText('Название'), 'New Edge')
    await user.click(screen.getByRole('button', { name: 'Зарегистрировать' }))

    expect(await screen.findByRole('heading', { name: 'Одноразовый постоянный ключ' })).toBeInTheDocument()
    expect(screen.getByText(registrationSecret)).toBeInTheDocument()
    const registrationInstallerJson = screen.getByRole('textbox', { name: 'JSON установщика' })
    expect((registrationInstallerJson as HTMLTextAreaElement).value).toContain(
      `"credentialSecret": "${registrationSecret}"`,
    )
    expect((registrationInstallerJson as HTMLTextAreaElement).value).toContain('"edgeId": "edge-new"')
    expect((registrationInstallerJson as HTMLTextAreaElement).value).toContain('"version": 1')

    await user.click(await screen.findByRole('button', { name: 'Скопировать JSON установщика' }))
    expect(
      await screen.findByText('Не удалось скопировать. Выделите и скопируйте JSON установщика вручную.'),
    ).toBeInTheDocument()
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(
        expect.stringContaining(`"credentialSecret": "${registrationSecret}"`),
      )
    })
    expect(JSON.stringify(localStorage)).not.toContain(registrationSecret)
    expect(JSON.stringify(sessionStorage)).not.toContain(registrationSecret)

    const newRow = await screen.findByText('New Edge')
    expect(within(newRow.closest('tr') as HTMLTableRowElement).getByText('v1')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Скрыть секрет' }))
    await waitFor(() => {
      expect(screen.queryByText(registrationSecret)).not.toBeInTheDocument()
      expect(screen.queryByDisplayValue((value) => value.includes(registrationSecret))).not.toBeInTheDocument()
    })

    await user.click(
      within(screen.getByText('New Edge').closest('tr') as HTMLTableRowElement).getByRole('button', {
        name: 'Ротировать ключ',
      }),
    )
    expect(await screen.findByText(rotateSecret)).toBeInTheDocument()
    const rotateInstallerJson = screen.getByRole('textbox', { name: 'JSON установщика' })
    expect((rotateInstallerJson as HTMLTextAreaElement).value).toContain(
      `"credentialSecret": "${rotateSecret}"`,
    )
    expect(screen.queryByText(registrationSecret)).not.toBeInTheDocument()
    expect(screen.queryByDisplayValue((value) => value.includes(registrationSecret))).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Обновить' }))
    await waitFor(() => {
      expect(screen.queryByText(rotateSecret)).not.toBeInTheDocument()
      expect(screen.queryByDisplayValue((value) => value.includes(rotateSecret))).not.toBeInTheDocument()
    })

    await user.click(
      within(screen.getByText('New Edge').closest('tr') as HTMLTableRowElement).getByRole('button', {
        name: 'Ротировать ключ',
      }),
    )
    expect(await screen.findByText(rotateSecret)).toBeInTheDocument()
    expect(screen.queryByText(registrationSecret)).not.toBeInTheDocument()

    await user.click(
      within(screen.getByText('Blocked Edge').closest('tr') as HTMLTableRowElement).getByRole('button', {
        name: 'Разблокировать объект',
      }),
    )
    expect(await screen.findByText(unblockSecret)).toBeInTheDocument()
    expect((screen.getByRole('textbox', { name: 'JSON установщика' }) as HTMLTextAreaElement).value).toContain(
      `"credentialSecret": "${unblockSecret}"`,
    )
    expect(screen.queryByText(rotateSecret)).not.toBeInTheDocument()
    expect(screen.queryByDisplayValue((value) => value.includes(rotateSecret))).not.toBeInTheDocument()
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

    const fleetRef: { current: MockEdge[] } = {
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

    expect(await screen.findByRole('heading', { name: 'Объекты' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reset onboarding' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Revoke trust' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Re-enable onboarding' })).not.toBeInTheDocument()

    const activeRow = screen.getByText('Active Edge').closest('tr')
    expect(activeRow).not.toBeNull()
    expect(within(activeRow as HTMLTableRowElement).getByText('Активен')).toBeInTheDocument()
    expect(within(activeRow as HTMLTableRowElement).getByText('В сети')).toBeInTheDocument()

    await user.click(
      within(activeRow as HTMLTableRowElement).getByRole('button', { name: 'Заблокировать объект' }),
    )

    await waitFor(() => {
      const updatedRow = screen.getByText('Active Edge').closest('tr')
      expect(updatedRow).not.toBeNull()
      expect(within(updatedRow as HTMLTableRowElement).getByText('Заблокирован')).toBeInTheDocument()
      expect(within(updatedRow as HTMLTableRowElement).getByText('Не в сети')).toBeInTheDocument()
      expect(within(updatedRow as HTMLTableRowElement).getByText('Последний сигнал: 29.03.2026, 10:55:00 UTC')).toBeInTheDocument()
    })

    const blockedRow = screen.getByText('Blocked Edge').closest('tr')
    expect(blockedRow).not.toBeNull()
    await user.click(
      within(blockedRow as HTMLTableRowElement).getByRole('button', { name: 'Разблокировать объект' }),
    )

    await waitFor(() => {
      const updatedRow = screen.getByText('Blocked Edge').closest('tr')
      expect(updatedRow).not.toBeNull()
      expect(within(updatedRow as HTMLTableRowElement).getByText('Активен')).toBeInTheDocument()
      expect(within(updatedRow as HTMLTableRowElement).getByText('В сети')).toBeInTheDocument()
      expect(within(updatedRow as HTMLTableRowElement).getByText('Последний сигнал: 29.03.2026, 10:12:00 UTC')).toBeInTheDocument()
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

    const fleetRef: { current: MockEdge[] } = {
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

    expect(await screen.findByRole('heading', { name: 'Объекты' })).toBeInTheDocument()

    const row = await screen.findByText('Existing Edge')
    const edgeRow = row.closest('tr')
    expect(edgeRow).not.toBeNull()
    expect(within(edgeRow as HTMLTableRowElement).getByText('В сети')).toBeInTheDocument()

    await user.click(
      within(edgeRow as HTMLTableRowElement).getByRole('button', { name: 'Назначить пользователю' }),
    )
    await user.selectOptions(screen.getByLabelText('Пользователь'), 'u1')
    await user.click(screen.getByRole('button', { name: 'Назначить' }))

    await waitFor(() => {
      const updatedRow = screen.getByText('Existing Edge').closest('tr')
      expect(updatedRow).not.toBeNull()
      expect(within(updatedRow as HTMLTableRowElement).getByText('user-1@example.com')).toBeInTheDocument()
    })

    await user.click(
      within(screen.getByText('Existing Edge').closest('tr') as HTMLTableRowElement).getByRole(
        'button',
        { name: 'Удалить доступ пользователя' },
      ),
    )
    await user.click(screen.getByRole('button', { name: 'Отозвать' }))

    await waitFor(() => {
      const updatedRow = screen.getByText('Existing Edge').closest('tr')
      expect(updatedRow).not.toBeNull()
      expect(within(updatedRow as HTMLTableRowElement).getByText('Не назначены')).toBeInTheDocument()
    })
  })

  it('searches filtered candidates beyond the first 100, retains the template, and shows one Cloud rejection', async () => {
    const ordinaryUsers = Array.from({ length: 101 }, (_, index) => ({
      _id: `user-${index + 1}`,
      email: `user-${String(index + 1).padStart(3, '0')}@example.com`,
      role: 'USER' as const,
      subscriptionTier: 'FREE' as const,
      isDeleted: false,
      isBanned: false,
      createdAt: '2026-03-01T00:00:00.000Z',
    }))
    const fixtures = {
      adminTemplates: [{ _id: 'template-1', name: 'Reusable Template', layout: { widgets: [] } }],
      candidateUsers: [
        ...ordinaryUsers,
        {
          _id: 'deep-target',
          email: 'deep-target@example.com',
          role: 'USER' as const,
          subscriptionTier: 'FREE' as const,
          isDeleted: false,
          isBanned: false,
          createdAt: '2026-03-01T00:00:00.000Z',
        },
        {
          _id: 'stale-full-target',
          email: 'stale-full@example.com',
          role: 'USER' as const,
          subscriptionTier: 'FREE' as const,
          isDeleted: false,
          isBanned: false,
          createdAt: '2026-03-01T00:00:00.000Z',
        },
      ],
      assignedCopies: [],
      rejectedTargetIds: ['stale-full-target'],
      userListRequests: [],
    }
    server.use(...createAdminDiagramAssignmentHandlers(fixtures))

    const user = userEvent.setup()
    renderAdminRoute('/admin/diagrams')

    expect(await screen.findByText('Reusable Template')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Назначить пользователю' }))

    await user.type(screen.getByLabelText('Поиск пользователей для назначения'), 'deep-target')
    await user.click(screen.getByRole('button', { name: 'Найти' }))
    await user.selectOptions(await screen.findByLabelText('Пользователь'), 'deep-target')
    await user.click(screen.getByRole('button', { name: 'Назначить' }))

    await waitFor(() => {
      expect(fixtures.assignedCopies).toHaveLength(1)
      expect(fixtures.assignedCopies[0]).toMatchObject({
        ownerId: 'deep-target',
        sourceTemplateId: 'template-1',
      })
    })
    expect(screen.getByText('Reusable Template')).toBeInTheDocument()
    expect(fixtures.adminTemplates).toHaveLength(1)
    expect(fixtures.userListRequests).toContain(
      '?search=deep-target&page=1&limit=20&role=USER&activeOnly=true',
    )

    await user.click(screen.getByRole('button', { name: 'Назначить пользователю' }))
    await user.type(screen.getByLabelText('Поиск пользователей для назначения'), 'stale-full')
    await user.click(screen.getByRole('button', { name: 'Найти' }))
    await user.selectOptions(await screen.findByLabelText('Пользователь'), 'stale-full-target')
    expect(screen.getByRole('button', { name: 'Назначить' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Назначить' }))

    expect(
      await screen.findByText(
        'Назначение отклонено сервером. У пользователя может не быть свободной квоты или он больше не подходит для назначения.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('Reusable Template')).toBeInTheDocument()
    expect(fixtures.assignedCopies).toHaveLength(1)
  })

  it('clears a candidate-loading error after a successful server-backed retry', async () => {
    let candidateRequests = 0

    server.use(
      http.get('/api/diagrams', () =>
        HttpResponse.json({
          status: 'success',
          data: [{ _id: 'template-1', name: 'Reusable Template', layout: {} }],
        }),
      ),
      http.get('/api/admin/users', ({ request }) => {
        candidateRequests += 1

        if (candidateRequests === 1) {
          return HttpResponse.json(
            { status: 'error', message: 'Candidate search unavailable' },
            { status: 503 },
          )
        }

        const url = new URL(request.url)
        expect(url.searchParams.get('search')).toBe('recovered')
        expect(url.searchParams.get('role')).toBe('USER')
        expect(url.searchParams.get('activeOnly')).toBe('true')

        return HttpResponse.json({
          status: 'success',
          data: [
            {
              _id: 'recovered-user',
              email: 'recovered@example.com',
              role: 'USER',
              subscriptionTier: 'FREE',
              isDeleted: false,
              isBanned: false,
              createdAt: '2026-03-01T00:00:00.000Z',
            },
          ],
          total: 1,
          page: 1,
          limit: 20,
        })
      }),
    )

    const user = userEvent.setup()
    renderAdminRoute('/admin/diagrams')

    await user.click(await screen.findByRole('button', { name: 'Назначить пользователю' }))
    expect(await screen.findByText('Ошибка сервера. Попробуйте позже.')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Поиск пользователей для назначения'), 'recovered')
    await user.click(screen.getByRole('button', { name: 'Найти' }))

    await waitFor(() => {
      expect(screen.queryByText('Ошибка сервера. Попробуйте позже.')).not.toBeInTheDocument()
      expect(screen.getByRole('option', { name: 'recovered@example.com (FREE)' })).toBeInTheDocument()
    })
  })
})
