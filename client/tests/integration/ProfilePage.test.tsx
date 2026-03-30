import { act, render, screen } from '@testing-library/react'
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

    expect(await screen.findByRole('heading', { name: 'Profile' })).toBeInTheDocument()
    expect(screen.queryByText('User Hub - Page (Phase 4-8)')).not.toBeInTheDocument()
  })

  it('renders FREE tier usage summary and upgrade prompt from self-service stats', async () => {
    server.use(
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

    expect(await screen.findByText('FREE')).toBeInTheDocument()
    expect(screen.getByText('2 / 3')).toBeInTheDocument()
    expect(screen.getByText('1 / 1')).toBeInTheDocument()
    expect(
      screen.getByText('Upgrade to PRO to unlock unlimited diagrams and additional equipment slots.'),
    ).toBeInTheDocument()
  })

  it('submits the password change form through the self-service endpoint', async () => {
    const user = userEvent.setup()
    let passwordPayload: Record<string, string> | null = null

    server.use(
      http.get('/api/users/me/stats', () =>
        HttpResponse.json({
          status: 'success',
          data: {
            diagramCount: 2,
            edgeServerCount: 1,
          },
        }),
      ),
      http.post('/api/users/me/password', async ({ request }) => {
        passwordPayload = (await request.json()) as Record<string, string>
        return HttpResponse.json({
          status: 'success',
          message: 'Password changed successfully',
        })
      }),
    )

    mount('/hub/profile')

    await screen.findByRole('heading', { name: 'Profile' })

    await user.type(screen.getByLabelText('Current password'), 'old-password-1')
    await user.type(screen.getByLabelText('New password'), 'new-password-2')
    await user.type(screen.getByLabelText('Confirm new password'), 'new-password-2')
    await user.click(screen.getByRole('button', { name: 'Update password' }))

    expect(await screen.findByText('Password updated successfully.')).toBeInTheDocument()
    expect(passwordPayload).toEqual({
      currentPassword: 'old-password-1',
      newPassword: 'new-password-2',
    })
  })
})
