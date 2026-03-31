import { beforeEach, describe, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, Link, RouterProvider } from 'react-router-dom'
import { server } from '../mocks/server'
import { getDiagramById } from '@/shared/api/diagrams'
import { loadHostedDeviceMetricCatalog, loadHostedMachineOptions } from '@/features/constructor-host/adapters/catalogAdapter'
import {
  loadHostedConstructor,
  resetHostedConstructorLoaderForTests,
} from '@/features/constructor-host/loadHostedConstructor'
import { useUnsavedChangesGuard } from '@/features/constructor-host/useUnsavedChangesGuard'

function GuardedPage({ hasUnsavedChanges }: { hasUnsavedChanges: boolean }) {
  useUnsavedChangesGuard({
    hasUnsavedChanges,
    message: 'Unsaved work will be lost. Continue?',
  })

  return <Link to="/next">Go next</Link>
}

function renderGuardedRouter(hasUnsavedChanges: boolean) {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <GuardedPage hasUnsavedChanges={hasUnsavedChanges} />,
      },
      {
        path: '/next',
        element: <div>Next page</div>,
      },
    ],
    { initialEntries: ['/'] },
  )

  render(<RouterProvider router={router} />)
  return router
}

beforeEach(() => {
  resetHostedConstructorLoaderForTests()
  vi.restoreAllMocks()
})

describe('Constructor host foundation tasks (T004-T007)', () => {
  it('loads one diagram by id through the typed API helper (T004)', async () => {
    server.use(
      http.get('/api/diagrams/:id', ({ params }) =>
        HttpResponse.json({
          status: 'success',
          data: {
            _id: String(params.id),
            name: 'Boiler Hall',
            layout: { widgets: [] },
            __v: 5,
          },
        }),
      ),
    )

    const diagram = await getDiagramById('diagram-42')

    expect(diagram._id).toBe('diagram-42')
    expect(diagram.__v).toBe(5)
    expect(diagram.layout).toEqual({ widgets: [] })
  })

  it('maps trusted machines and catalog rows via cloud-backed adapter (T005)', async () => {
    server.use(
      http.get('/api/edge-servers', () =>
        HttpResponse.json({
          status: 'success',
          data: [
            // Non-canonical payload missing lifecycleState must be ignored.
            { _id: 'edge-invalid', name: 'Invalid' },
            // Canonical non-Active payload must be ignored as not telemetry-ready.
            {
              _id: 'edge-blocked',
              name: 'Blocked',
              lifecycleState: 'Blocked',
              availability: { online: false, lastSeenAt: null },
            },
            // Canonical Active rows are accepted.
            {
              _id: 'edge-b',
              name: 'Bravo',
              lifecycleState: 'Active',
              availability: { online: false, lastSeenAt: null },
            },
            {
              _id: 'edge-a',
              name: 'Alpha',
              lifecycleState: 'Active',
              availability: { online: true, lastSeenAt: null },
            },
          ],
        }),
      ),
      http.get('/api/edge-servers/:edgeId/catalog', ({ params }) =>
        HttpResponse.json({
          status: 'success',
          data: [
            {
              edgeServerId: String(params.edgeId),
              deviceId: 'pump-1',
              metric: 'temperature',
              label: 'pump-1 / temperature',
            },
            {
              edgeServerId: String(params.edgeId),
              deviceId: 'pump-1',
              metric: 'pressure',
              label: 'pump-1 / pressure',
            },
            {
              edgeServerId: String(params.edgeId),
              deviceId: 'pump-1',
              metric: 'temperature',
              label: 'duplicate row should be deduped',
            },
          ],
        }),
      ),
    )

    const machines = await loadHostedMachineOptions()
    const catalog = await loadHostedDeviceMetricCatalog('edge-a')

    expect(machines).toEqual([
      { edgeServerId: 'edge-a', label: 'Alpha', isOnline: true },
      { edgeServerId: 'edge-b', label: 'Bravo', isOnline: false },
    ])
    expect(catalog).toEqual([
      {
        edgeServerId: 'edge-a',
        deviceId: 'pump-1',
        deviceLabel: 'pump-1',
        deviceType: undefined,
        metrics: [
          { key: 'pressure', label: 'pressure' },
          { key: 'temperature', label: 'temperature' },
        ],
      },
    ])
  })

  it('loads hosted constructor runtime through same-origin loader with module validation (T006)', async () => {
    const importer = vi.fn(async () => ({
      createHostedConstructor: vi.fn(async () => ({
        loadLayout: vi.fn(async () => undefined),
        getLayout: vi.fn(async () => ({})),
        loadBindings: vi.fn(async () => undefined),
        getBindings: vi.fn(async () => []),
        updateCatalog: vi.fn(),
        setActiveMachine: vi.fn(),
        destroy: vi.fn(),
      })),
    }))

    const firstModule = await loadHostedConstructor({ importer })
    const secondModule = await loadHostedConstructor({ importer })

    expect(firstModule).toBe(secondModule)
    expect(importer).toHaveBeenCalledTimes(1)
    expect(importer).toHaveBeenCalledWith(
      expect.stringMatching(/^http:\/\/localhost:\d+\/constructor\/hosted-entry\.js$/),
    )

    resetHostedConstructorLoaderForTests()

    await expect(
      loadHostedConstructor({
        importer: async () => ({}),
      }),
    ).rejects.toThrow(/createHostedConstructor/)
  })

  it('warns before route navigation when unsaved changes exist (T007)', async () => {
    const user = userEvent.setup()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)

    renderGuardedRouter(true)

    await user.click(screen.getByRole('link', { name: 'Go next' }))

    expect(confirmSpy).toHaveBeenCalledWith('Unsaved work will be lost. Continue?')
    await waitFor(() => {
      expect(screen.queryByText('Next page')).not.toBeInTheDocument()
    })

    confirmSpy.mockReturnValue(true)
    await user.click(screen.getByRole('link', { name: 'Go next' }))

    expect(await screen.findByText('Next page')).toBeInTheDocument()
  })
})
