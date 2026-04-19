import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { server } from '../mocks/server'
import { GalleryPage } from '@/features/user-hub/pages/GalleryPage'
import { useAuthStore, type Session } from '@/shared/store/useAuthStore'
import {
  createUserEdgeConsumerFixtures,
  createUserEdgeConsumerHandlers,
} from '../mocks/handlers'

const freeSession: Session = {
  id: 'user-free',
  email: 'free@example.com',
  role: 'USER',
  tier: 'FREE',
  accessToken: 'free-token',
}

function renderPage(initialPath = '/hub') {
  const router = createMemoryRouter(
    [
      {
        path: '/hub',
        element: <GalleryPage />,
      },
      {
        path: '/hub/dashboard',
        element: <div>Native Dashboard target</div>,
      },
      {
        path: '/hub/editor/:id',
        element: <div>Editor target</div>,
      },
    ],
    { initialEntries: [initialPath] },
  )

  render(<RouterProvider router={router} />)
  return router
}

beforeEach(() => {
  act(() => {
    useAuthStore.setState({ session: null, isAuthenticated: false })
    useAuthStore.getState().setSession(freeSession)
  })
})

describe('GalleryPage', () => {
  it('renders cards from GET /api/diagrams', async () => {
    // GET /api/diagrams
    server.use(
      http.get('/api/diagrams', () =>
        HttpResponse.json({
          status: 'success',
          data: [
            { _id: 'd1', name: 'Boiler Hall', layout: {}, updatedAt: '2026-03-01T00:00:00.000Z' },
            { _id: 'd2', name: 'Pump Station', layout: {}, updatedAt: '2026-03-02T00:00:00.000Z' },
          ],
        }),
      ),
      http.get('/api/edge-servers', () =>
        HttpResponse.json({
          status: 'success',
          data: [],
        }),
      ),
      http.get('/api/diagrams/:id/bindings', ({ params }) => {
        if (params.id === 'd1') {
          return HttpResponse.json({
            status: 'success',
            data: [
              {
                _id: 'b1',
                diagramId: 'd1',
                edgeServerId: 'edge-a',
                widgetBindings: [],
              },
            ],
          })
        }

        return HttpResponse.json({ status: 'success', data: [] })
      }),
    )

    renderPage()

    expect(await screen.findByText('Boiler Hall')).toBeInTheDocument()
    expect(await screen.findByText('Pump Station')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create Diagram' })).toBeEnabled()
  })

  it('blocks create CTA when FREE tier already has 3 diagrams', async () => {
    server.use(
      http.get('/api/diagrams', () =>
        HttpResponse.json({
          status: 'success',
          data: [
            { _id: 'd1', name: 'D1', layout: {}, updatedAt: '2026-03-01T00:00:00.000Z' },
            { _id: 'd2', name: 'D2', layout: {}, updatedAt: '2026-03-02T00:00:00.000Z' },
            { _id: 'd3', name: 'D3', layout: {}, updatedAt: '2026-03-03T00:00:00.000Z' },
          ],
        }),
      ),
      http.get('/api/edge-servers', () =>
        HttpResponse.json({
          status: 'success',
          data: [],
        }),
      ),
      http.get('/api/diagrams/:id/bindings', () =>
        HttpResponse.json({ status: 'success', data: [] }),
      ),
    )

    renderPage()

    expect(await screen.findByText('D1')).toBeInTheDocument()
    expect(screen.getByText('FREE tier limit reached: maximum 3 diagrams.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create Diagram' })).toBeDisabled()
  })

  it('disables native dashboard handoff for blocked telemetry profiles but preserves offline active handoff', async () => {
    const user = userEvent.setup()
    const fixtures = createUserEdgeConsumerFixtures({
      assignedEdges: [
        {
          _id: 'edge-offline',
          name: 'Offline Edge',
          lifecycleState: 'Active',
          availability: { online: false, lastSeenAt: '2026-04-19T09:40:00.000Z' },
        },
        {
          _id: 'edge-blocked',
          name: 'Blocked Edge',
          lifecycleState: 'Blocked',
          availability: { online: false, lastSeenAt: '2026-04-19T09:30:00.000Z' },
        },
      ],
    })

    server.use(
      ...createUserEdgeConsumerHandlers(fixtures),
      http.get('/api/diagrams', () =>
        HttpResponse.json({
          status: 'success',
          data: [
            {
              _id: 'diagram-1',
              name: 'Boiler Hall',
              layout: {},
              updatedAt: '2026-04-19T10:00:00.000Z',
            },
          ],
        }),
      ),
      http.get('/api/diagrams/:id/bindings', () =>
        HttpResponse.json({
          status: 'success',
          data: [
            {
              _id: 'binding-offline',
              diagramId: 'diagram-1',
              edgeServerId: 'edge-offline',
              widgetBindings: [],
            },
            {
              _id: 'binding-blocked',
              diagramId: 'diagram-1',
              edgeServerId: 'edge-blocked',
              widgetBindings: [],
            },
          ],
        }),
      ),
    )

    const router = renderPage()

    expect(await screen.findByText('Boiler Hall')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Telemetry Profiles' }))

    const blockedProfile = screen.getByText('Blocked Edge').closest('li')
    expect(blockedProfile).not.toBeNull()
    const blockedCard = within(blockedProfile as HTMLElement)
    expect(blockedCard.getByText('Blocked')).toBeInTheDocument()
    expect(blockedCard.getByText('Offline')).toBeInTheDocument()
    expect(
      blockedCard.getByText('Native Dashboard handoff is unavailable while this edge is blocked.'),
    ).toBeInTheDocument()
    expect(blockedCard.getByRole('button', { name: /Open Dashboard/i })).toBeDisabled()

    const offlineProfile = screen.getByText('Offline Edge').closest('li')
    expect(offlineProfile).not.toBeNull()
    const offlineCard = within(offlineProfile as HTMLElement)
    expect(offlineCard.getByText('Active')).toBeInTheDocument()
    expect(offlineCard.getByText('Offline')).toBeInTheDocument()

    await user.click(offlineCard.getByRole('button', { name: /Open Dashboard/i }))

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/hub/dashboard')
    })
    expect(router.state.location.search).toContain('diagramId=diagram-1')
    expect(router.state.location.search).toContain('edgeId=edge-offline')
  })

  it('keeps native dashboard handoff available when edge lifecycle metadata is temporarily unresolved', async () => {
    const user = userEvent.setup()

    server.use(
      http.get('/api/diagrams', () =>
        HttpResponse.json({
          status: 'success',
          data: [
            {
              _id: 'diagram-1',
              name: 'Boiler Hall',
              layout: {},
              updatedAt: '2026-04-19T10:00:00.000Z',
            },
          ],
        }),
      ),
      http.get('/api/edge-servers', () =>
        HttpResponse.json(
          {
            status: 'error',
            message: 'edge metadata unavailable',
          },
          { status: 503 },
        ),
      ),
      http.get('/api/diagrams/:id/bindings', () =>
        HttpResponse.json({
          status: 'success',
          data: [
            {
              _id: 'binding-active',
              diagramId: 'diagram-1',
              edgeServerId: 'edge-active',
              widgetBindings: [],
            },
          ],
        }),
      ),
    )

    const router = renderPage()

    expect(await screen.findByText('Boiler Hall')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Telemetry Profiles' }))

    const unresolvedProfile = screen.getByText('edge-active').closest('li')
    expect(unresolvedProfile).not.toBeNull()
    const unresolvedCard = within(unresolvedProfile as HTMLElement)
    expect(unresolvedCard.getByText('Unknown')).toBeInTheDocument()
    expect(
      unresolvedCard.getByText(
        'Edge lifecycle status is temporarily unavailable. Native Dashboard handoff remains available.',
      ),
    ).toBeInTheDocument()

    await user.click(unresolvedCard.getByRole('button', { name: /Open Dashboard/i }))

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/hub/dashboard')
    })
    expect(router.state.location.search).toContain('diagramId=diagram-1')
    expect(router.state.location.search).toContain('edgeId=edge-active')
  })
})
