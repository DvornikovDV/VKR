import { act } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '../mocks/server'
import { FullConstructorPage } from '@/features/user-hub/pages/FullConstructorPage'
import { loadHostedConstructor } from '@/features/constructor-host/loadHostedConstructor'
import { createMockHostedConstructorHarness } from './helpers/mockHostedConstructor'
import { useAuthStore, type Session } from '@/shared/store/useAuthStore'

vi.mock('@/features/constructor-host/loadHostedConstructor', async () => {
  const actual = await vi.importActual<typeof import('@/features/constructor-host/loadHostedConstructor')>(
    '@/features/constructor-host/loadHostedConstructor',
  )

  return {
    ...actual,
    loadHostedConstructor: vi.fn(),
  }
})

const mockedLoadHostedConstructor = vi.mocked(loadHostedConstructor)

const userSession: Session = {
  id: 'user-1',
  email: 'user@example.com',
  role: 'USER',
  tier: 'FREE',
  accessToken: 'user-token',
}

function renderFullPage(path: string) {
  const router = createMemoryRouter(
    [
      {
        path: '/hub/editor/:id',
        element: <FullConstructorPage />,
      },
    ],
    { initialEntries: [path] },
  )

  render(<RouterProvider router={router} />)
  return router
}

beforeEach(() => {
  mockedLoadHostedConstructor.mockReset()
  act(() => {
    useAuthStore.setState({ session: null, isAuthenticated: false })
    useAuthStore.getState().setSession(userSession)
  })
})

describe('FullConstructorPage recovery and retry flows', () => {
  it('allows opening page with empty bindings after invalid bindings payload recovery error', async () => {
    const user = userEvent.setup()
    const harness = createMockHostedConstructorHarness()
    mockedLoadHostedConstructor.mockResolvedValue(harness.module)

    server.use(
      http.get('/api/diagrams/:id', ({ params }) =>
        HttpResponse.json({
          status: 'success',
          data: {
            _id: String(params.id),
            name: 'Invalid bindings diagram',
            layout: { widgets: [] },
            __v: 1,
          },
        }),
      ),
      http.get('/api/edge-servers', () =>
        HttpResponse.json({
          status: 'success',
          data: [{ _id: 'edge-1', name: 'Machine #1', isActive: true }],
        }),
      ),
      http.get('/api/edge-servers/:edgeId/catalog', () =>
        HttpResponse.json({
          status: 'success',
          data: [],
        }),
      ),
      http.get('/api/diagrams/:id/bindings', () =>
        HttpResponse.json({
          status: 'success',
          data: [
            {
              _id: 'broken-set',
              diagramId: 'diagram-invalid-bindings',
              edgeServerId: 'edge-1',
              widgetBindings: [{ widgetId: '', deviceId: 'device-1', metric: 'temperature' }],
            },
          ],
        }),
      ),
    )

    renderFullPage('/hub/editor/diagram-invalid-bindings')

    expect(await screen.findByText('Unable to open hosted constructor page.')).toBeInTheDocument()
    expect(screen.getByText(/Invalid bindings payload/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open with empty bindings' })).toBeInTheDocument()
    expect(harness.createHostedConstructorMock).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Open with empty bindings' }))

    await waitFor(() => {
      expect(harness.createHostedConstructorMock).toHaveBeenCalledTimes(1)
    })
    expect(screen.queryByText('Unable to open hosted constructor page.')).not.toBeInTheDocument()
  })

  it('retries diagram loading successfully after transient API failure', async () => {
    const user = userEvent.setup()
    const harness = createMockHostedConstructorHarness()
    mockedLoadHostedConstructor.mockResolvedValue(harness.module)

    let diagramRequestCount = 0

    server.use(
      http.get('/api/diagrams/:id', ({ params }) => {
        diagramRequestCount += 1
        if (diagramRequestCount === 1) {
          return HttpResponse.json(
            {
              status: 'error',
              message: 'Temporary upstream failure',
            },
            { status: 503 },
          )
        }

        return HttpResponse.json({
          status: 'success',
          data: {
            _id: String(params.id),
            name: 'Retry diagram',
            layout: { widgets: [] },
            __v: 2,
          },
        })
      }),
      http.get('/api/edge-servers', () =>
        HttpResponse.json({
          status: 'success',
          data: [{ _id: 'edge-1', name: 'Machine #1', isActive: true }],
        }),
      ),
      http.get('/api/edge-servers/:edgeId/catalog', () =>
        HttpResponse.json({
          status: 'success',
          data: [],
        }),
      ),
      http.get('/api/diagrams/:id/bindings', () =>
        HttpResponse.json({
          status: 'success',
          data: [],
        }),
      ),
    )

    renderFullPage('/hub/editor/diagram-retry')

    expect(await screen.findByText('Unable to open hosted constructor page.')).toBeInTheDocument()
    expect(screen.getByText('Temporary upstream failure')).toBeInTheDocument()
    expect(harness.createHostedConstructorMock).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Retry loading' }))

    await waitFor(() => {
      expect(diagramRequestCount).toBeGreaterThanOrEqual(2)
      expect(harness.createHostedConstructorMock).toHaveBeenCalledTimes(1)
    })
    expect(screen.queryByText('Unable to open hosted constructor page.')).not.toBeInTheDocument()
  })
})
