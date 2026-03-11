import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { act } from '@testing-library/react'
import { server } from '../mocks/server'
import { GalleryPage } from '@/features/user-hub/pages/GalleryPage'
import { useAuthStore, type Session } from '@/shared/store/useAuthStore'

const freeSession: Session = {
  id: 'user-free',
  email: 'free@example.com',
  role: 'USER',
  tier: 'FREE',
  accessToken: 'free-token',
}

function renderPage() {
  render(
    <MemoryRouter>
      <GalleryPage />
    </MemoryRouter>,
  )
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
      http.get('/api/diagrams/:id/bindings', () =>
        HttpResponse.json({ status: 'success', data: [] }),
      ),
    )

    renderPage()

    expect(await screen.findByText('D1')).toBeInTheDocument()
    expect(screen.getByText('FREE tier limit reached: maximum 3 diagrams.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create Diagram' })).toBeDisabled()
  })
})
