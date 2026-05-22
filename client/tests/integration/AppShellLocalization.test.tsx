import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'

import { AdminHubLayout } from '@/features/admin-hub/AdminHubLayout'
import { UserHubLayout } from '@/features/user-hub/UserHubLayout'
import { useAuthStore, type Session } from '@/shared/store/useAuthStore'

function mountShell(element: React.ReactNode, path: string) {
  const router = createMemoryRouter(
    [
      {
        path,
        element,
        children: [{ index: true, element: <div data-testid="route-content">content</div> }],
      },
    ],
    { initialEntries: [path] },
  )

  render(<RouterProvider router={router} />)
}

describe('localized hub shell navigation', () => {
  beforeEach(() => {
    const session: Session = {
      id: 'user-1',
      email: 'user@example.com',
      role: 'USER',
      tier: 'FREE',
      accessToken: 'token',
    }

    act(() => {
      useAuthStore.setState({ session: null, isAuthenticated: false })
      useAuthStore.getState().setSession(session)
    })
  })

  it('renders User Hub navigation in Russian', () => {
    mountShell(<UserHubLayout />, '/hub')

    expect(screen.getByText('Кабинет')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Мнемосхемы' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Диспетчеризация' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Объекты' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Профиль' })).toBeInTheDocument()
    expect(screen.getByText('Пользователь · Бесплатный')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Выйти' })).toBeInTheDocument()
  })

  it('renders Admin Hub navigation in Russian', () => {
    const session: Session = {
      id: 'admin-1',
      email: 'admin@example.com',
      role: 'ADMIN',
      tier: 'PRO',
      accessToken: 'token',
    }

    act(() => {
      useAuthStore.setState({ session: null, isAuthenticated: false })
      useAuthStore.getState().setSession(session)
    })

    mountShell(<AdminHubLayout />, '/admin')

    expect(screen.getAllByText('Администрирование')).not.toHaveLength(0)
    expect(screen.getByRole('link', { name: 'Обзор' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Объекты' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Пользователи' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Мнемосхемы' })).toBeInTheDocument()
    expect(screen.getByText('Администратор · PRO')).toBeInTheDocument()
  })
})
