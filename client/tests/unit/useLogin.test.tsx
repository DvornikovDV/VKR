import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import { http, HttpResponse } from 'msw'
import { server } from '../mocks/server'
import { useLogin } from '@/features/auth/hooks/useLogin'
import { useAuthStore } from '@/shared/store/useAuthStore'

function RouterWrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>
}

beforeEach(() => {
  act(() => {
    useAuthStore.setState({ session: null, isAuthenticated: false })
  })
})

describe('useLogin', () => {
  it('shows dedicated error for banned account login', async () => {
    server.use(
      http.post('/api/auth/login', () =>
        HttpResponse.json(
          { status: 'error', message: 'Account has been suspended' },
          { status: 401 },
        ),
      ),
    )

    const { result } = renderHook(() => useLogin(), { wrapper: RouterWrapper })

    await act(async () => {
      await result.current.login({ email: 'banned@example.com', password: 'Password123!' })
    })

    expect(result.current.error).toBe('Your account has been suspended. Please contact support.')
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })
})
