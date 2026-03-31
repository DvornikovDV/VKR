import { useState } from 'react'
import { act } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { server } from '../mocks/server'
import { ProtectedRoute } from '@/shared/components/ProtectedRoute'
import { useAuthStore, type Session } from '@/shared/store/useAuthStore'
import { useReAuthStore } from '@/shared/api/tokenRefresh'
import { userHubRouteChildren } from '@/app/userHubRoutes'
import { loadHostedConstructor } from '@/features/constructor-host/loadHostedConstructor'
import { ConstructorHost } from '@/features/constructor-host/ConstructorHost'
import { createMockHostedConstructorHarness } from './helpers/mockHostedConstructor'

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

function renderUserRoutes(initialPath: string) {
  const router = createMemoryRouter(
    [
      {
        path: '/login',
        element: <div>Login</div>,
      },
      {
        path: '/outside',
        element: <div>Outside route</div>,
      },
      {
        path: '/hub',
        element: <ProtectedRoute requiredRole="USER" />,
        children: userHubRouteChildren,
      },
    ],
    { initialEntries: [initialPath] },
  )

  render(<RouterProvider router={router} />)
  return router
}

function mockFullConstructorApis(diagramId: string) {
  server.use(
    http.get('/api/diagrams/:id', () =>
      HttpResponse.json({
        status: 'success',
        data: {
          _id: diagramId,
          name: 'Unsaved Diagram',
          layout: { widgets: [] },
          __v: 4,
        },
      }),
    ),
    http.get('/api/edge-servers', () =>
      HttpResponse.json({
        status: 'success',
        data: [
          {
            _id: 'edge-1',
            name: 'Machine #1',
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
            deviceId: 'device-1',
            metric: 'temperature',
            label: 'Boiler temperature',
          },
        ],
      }),
    ),
    http.get('/api/diagrams/:id/bindings', () =>
      HttpResponse.json({
        status: 'success',
        data: [],
      }),
    ),
  )
}

function MachineSwitchWarningHarness() {
  const [activeMachine, setActiveMachine] = useState<string | null>('edge-1')

  return (
    <section>
      <ConstructorHost
        mode="full"
        initialLayout={{ widgets: [] }}
        machines={[
          { edgeServerId: 'edge-1', label: 'Machine #1' },
          { edgeServerId: 'edge-2', label: 'Machine #2' },
        ]}
        activeEdgeServerId="edge-1"
        onMachineChange={setActiveMachine}
      />
      <p data-testid="active-machine">{activeMachine ?? 'none'}</p>
    </section>
  )
}

beforeEach(() => {
  mockedLoadHostedConstructor.mockReset()
  vi.restoreAllMocks()

  act(() => {
    useAuthStore.setState({ session: null, isAuthenticated: false })
    useReAuthStore.setState({ needsReAuth: false, returnPath: '/' })
    useAuthStore.getState().setSession(userSession)
  })
})

describe('Hosted constructor unsaved-changes coverage (T032)', () => {
  it('warns before route exit after hosted runtime reports dirty state', async () => {
    const harness = createMockHostedConstructorHarness()
    mockedLoadHostedConstructor.mockResolvedValue(harness.module)
    mockFullConstructorApis('diagram-exit-dirty')

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const router = renderUserRoutes('/hub/editor/diagram-exit-dirty')

    await waitFor(() => {
      expect(harness.createHostedConstructorMock).toHaveBeenCalledTimes(1)
    })

    act(() => {
      harness.emitDirtyStateChange({ layoutDirty: true, bindingsDirty: false })
    })

    await act(async () => {
      await router.navigate('/outside')
    })

    expect(confirmSpy).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Outside route')).not.toBeInTheDocument()

    confirmSpy.mockReturnValue(true)

    await act(async () => {
      await router.navigate('/outside')
    })

    expect(await screen.findByText('Outside route')).toBeInTheDocument()
  })

  it('warns before machine switch when runtime reports unsaved state', async () => {
    const harness = createMockHostedConstructorHarness()
    mockedLoadHostedConstructor.mockResolvedValue(harness.module)

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)

    render(<MachineSwitchWarningHarness />)

    await waitFor(() => {
      expect(harness.createHostedConstructorMock).toHaveBeenCalledTimes(1)
    })

    act(() => {
      harness.emitDirtyStateChange({ layoutDirty: false, bindingsDirty: true })
      harness.emitMachineChange('edge-2')
    })

    expect(confirmSpy).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('active-machine')).toHaveTextContent('edge-1')

    confirmSpy.mockReturnValue(true)

    act(() => {
      harness.emitMachineChange('edge-2')
    })

    await waitFor(() => {
      expect(screen.getByTestId('active-machine')).toHaveTextContent('edge-2')
    })
  })

  it('keeps hosted runtime mounted through temporary re-auth overlay with dirty state intact', async () => {
    const harness = createMockHostedConstructorHarness()
    mockedLoadHostedConstructor.mockResolvedValue(harness.module)
    mockFullConstructorApis('diagram-reauth-dirty')

    renderUserRoutes('/hub/editor/diagram-reauth-dirty')

    await waitFor(() => {
      expect(harness.createHostedConstructorMock).toHaveBeenCalledTimes(1)
    })

    act(() => {
      harness.emitDirtyStateChange({ layoutDirty: true, bindingsDirty: true })
      useReAuthStore.getState().triggerReAuth('/hub/editor/diagram-reauth-dirty')
    })

    expect(await screen.findByText('Session expired')).toBeInTheDocument()
    expect(harness.createHostedConstructorMock).toHaveBeenCalledTimes(1)
    expect(harness.instanceSpies.destroyMock).not.toHaveBeenCalled()

    act(() => {
      useReAuthStore.getState().clearReAuth()
    })

    await waitFor(() => {
      expect(harness.createHostedConstructorMock).toHaveBeenCalledTimes(1)
    })
    expect(harness.instanceSpies.destroyMock).not.toHaveBeenCalled()
  })
})
