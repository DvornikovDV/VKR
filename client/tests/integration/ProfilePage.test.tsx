import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { userHubRouteChildren } from '@/app/userHubRoutes'
import { ProtectedRoute } from '@/shared/components/ProtectedRoute'
import { useAuthStore, type Session } from '@/shared/store/useAuthStore'
import { server } from '../mocks/server'

const freeUserSession: Session = {
  id: 'user-1',
  email: 'user@example.com',
  role: 'USER',
  tier: 'FREE',
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
    useAuthStore.getState().setSession(freeUserSession)
  })
})

describe('ProfilePage route wiring and summary (T038-T040)', () => {
  it('resolves /hub/profile to the profile page instead of the placeholder route', async () => {
    server.use(
      http.get('/api/users/me', () =>
        HttpResponse.json({
          status: 'success',
          data: {
            _id: 'user-1',
            email: 'user@example.com',
            role: 'USER',
            subscriptionTier: 'FREE',
          },
        }),
      ),
      http.get('/api/users/me/stats', () =>
        HttpResponse.json({
          status: 'success',
          data: {
            diagramCount: 2,
            edgeServerCount: 1,
          },
        }),
      ),
    )

    mount('/hub/profile')

    expect(await screen.findByRole('heading', { name: 'Профиль' })).toBeInTheDocument()
    expect(screen.queryByText('User Hub - Page (Phase 4-8)')).not.toBeInTheDocument()
  })

  it('renders tier and unlimited quotas from the fresh self-service profile payload', async () => {
    server.use(
      http.get('/api/users/me', () =>
        HttpResponse.json({
          status: 'success',
          data: {
            _id: 'user-1',
            email: 'fresh-tier@example.com',
            role: 'USER',
            subscriptionTier: 'PRO',
          },
        }),
      ),
      http.get('/api/users/me/stats', () =>
        HttpResponse.json({
          status: 'success',
          data: {
            diagramCount: 2,
            edgeServerCount: 1,
          },
        }),
      ),
    )

    mount('/hub/profile')

    const tierSection = await screen.findByLabelText('profile-subscription-tier')
    const diagramsCard = screen.getByLabelText('profile-diagram-usage')
    const equipmentCard = screen.getByLabelText('profile-equipment-usage')

    expect(within(tierSection).getByText('PRO')).toBeInTheDocument()
    expect(within(diagramsCard).getByText('2 / Безлимит')).toBeInTheDocument()
    expect(within(equipmentCard).getByText('1 / Безлимит')).toBeInTheDocument()
    expect(
      screen.getByText('Доступ PRO активен. Лимиты мнемосхем и объектов не ограничены.'),
    ).toBeInTheDocument()
  })

  it('keeps the password form available even when profile summary loading fails', async () => {
    const user = userEvent.setup()
    let passwordPayload: Record<string, string> | null = null

    server.use(
      http.get('/api/users/me', () =>
        HttpResponse.json(
          {
            status: 'error',
            message: 'Профиль временно недоступен',
          },
          { status: 500 },
        ),
      ),
      http.get('/api/users/me/stats', () =>
        HttpResponse.json(
          {
            status: 'error',
            message: 'Статистика временно недоступна',
          },
          { status: 500 },
        ),
      ),
      http.patch('/api/users/me/password', async ({ request }) => {
        passwordPayload = (await request.json()) as Record<string, string>
        return HttpResponse.json({
          status: 'success',
          message: 'Password changed successfully',
        })
      }),
    )

    mount('/hub/profile')

    await screen.findByRole('heading', { name: 'Профиль' })
    expect(await screen.findByText('Ошибка сервера. Попробуйте позже.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Смена пароля' })).toBeInTheDocument()

    await user.type(screen.getByLabelText('Текущий пароль'), 'old-password-1')
    await user.type(screen.getByLabelText('Новый пароль'), 'new-password-2')
    await user.type(screen.getByLabelText('Повторите новый пароль'), 'new-password-2')
    await user.click(screen.getByRole('button', { name: 'Обновить пароль' }))

    expect(await screen.findByText('Пароль успешно обновлен.')).toBeInTheDocument()
    expect(passwordPayload).toEqual({
      currentPassword: 'old-password-1',
      newPassword: 'new-password-2',
    })
  })
})
