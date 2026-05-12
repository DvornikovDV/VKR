import { act, renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useDispatchRouteState } from '@/features/dispatch/hooks/useDispatchRouteState'
import { useDispatchWorkspaceContext } from '@/features/dispatch/hooks/useDispatchWorkspaceContext'
import {
  selectDispatchAllowedEdgeOptions,
  selectDispatchBindingProfilesForDiagram,
  selectDispatchRecoveryState,
  selectDispatchSelectedBindingProfile,
  selectDispatchSelectedCatalogStatus,
  selectDispatchSelectedDiagram,
  selectDispatchSelectedEdge,
  selectDispatchSelectedSavedDiagram,
} from '@/features/dispatch/model/context'
import { DISPATCH_DASHBOARD_TAB } from '@/features/dispatch/model/routes'
import type { DashboardBindingProfile } from '@/features/dashboard/model/types'
import { useAuthStore, type Session } from '@/shared/store/useAuthStore'
import { server } from '../mocks/server'

const userSession: Session = {
  id: 'dispatch-user-1',
  email: 'dispatch.user@example.com',
  role: 'USER',
  tier: 'PRO',
  accessToken: 'dispatch-token',
}

const visualLayout = {
  widgets: [{ id: 'widget-1', type: 'number-display', x: 0, y: 0, width: 120, height: 48 }],
}

const diagramOne = { _id: 'diagram-1', name: 'Boiler', layout: visualLayout }
const diagramTwo = { _id: 'diagram-2', name: 'Pump', layout: visualLayout }

const edgeOne = {
  _id: 'edge-1',
  name: 'Edge One',
  lifecycleState: 'Active' as const,
  availability: { online: true, lastSeenAt: '2026-05-12T07:00:00.000Z' },
}

const edgeTwo = {
  _id: 'edge-2',
  name: 'Edge Two',
  lifecycleState: 'Active' as const,
  availability: { online: false, lastSeenAt: '2026-05-12T07:05:00.000Z' },
}

const blockedEdge = {
  _id: 'edge-blocked',
  name: 'Blocked Edge',
  lifecycleState: 'Blocked' as const,
  availability: { online: false, lastSeenAt: null },
}

const bindingOne: DashboardBindingProfile = {
  _id: 'binding-1',
  diagramId: 'diagram-1',
  edgeServerId: 'edge-1',
  widgetBindings: [{ widgetId: 'widget-1', deviceId: 'pump-1', metric: 'temperature' }],
  commandBindings: [],
}

const bindingTwo: DashboardBindingProfile = {
  _id: 'binding-2',
  diagramId: 'diagram-2',
  edgeServerId: 'edge-2',
  widgetBindings: [{ widgetId: 'widget-1', deviceId: 'pump-2', metric: 'pressure' }],
  commandBindings: [],
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })

  return { promise, resolve }
}

function jsonSuccess(data: unknown) {
  return HttpResponse.json({ status: 'success', data })
}

function createMemoryWrapper(initialEntry: string) {
  return ({ children }: { children: ReactNode }) =>
    createElement(MemoryRouter, { initialEntries: [initialEntry] }, children)
}

beforeEach(() => {
  act(() => {
    useAuthStore.setState({ session: null, isAuthenticated: false })
    useAuthStore.getState().setSession(userSession)
  })
})

afterEach(() => {
  act(() => {
    useAuthStore.setState({ session: null, isAuthenticated: false })
  })
})

describe('Dispatch foundational route and context primitives (T004-T006)', () => {
  it('preserves query-prefill semantics and clears edge on diagram changes', async () => {
    const wrapper = createMemoryWrapper('/hub/dispatch/dashboard?edgeId=edge-1')
    const { result } = renderHook(() => useDispatchRouteState(), { wrapper })

    expect(result.current.routeState.tabId).toBe(DISPATCH_DASHBOARD_TAB)
    expect(result.current.routeState.diagramId).toBeNull()
    expect(result.current.routeState.edgeId).toBe('edge-1')
    expect(result.current.isStructurallyInvalid).toBe(true)

    act(() => {
      result.current.setRouteState(
        { diagramId: 'diagram-1', edgeId: 'edge-1' },
        { source: 'user-selection' },
      )
    })

    await waitFor(() => {
      expect(result.current.routeState.diagramId).toBe('diagram-1')
      expect(result.current.routeState.edgeId).toBe('edge-1')
      expect(result.current.routeState.selectionSource).toBe('user-selection')
    })

    act(() => {
      result.current.setRouteState({ diagramId: 'diagram-2' })
    })

    await waitFor(() => {
      expect(result.current.routeState.diagramId).toBe('diagram-2')
      expect(result.current.routeState.edgeId).toBeNull()
      expect(result.current.isStructurallyInvalid).toBe(false)
    })
  })

  it('resolves Dispatch context selectors without fabricating invalid selections', () => {
    const bindingProfilesByDiagram = { 'diagram-1': [bindingOne] }
    const catalogStatusByEdgeId = { 'edge-1': 'loaded' as const }

    const selectedDiagram = selectDispatchSelectedDiagram([diagramOne], 'diagram-1')
    const selectedSavedDiagram = selectDispatchSelectedSavedDiagram(
      { 'diagram-1': diagramOne },
      'diagram-1',
    )
    const profiles = selectDispatchBindingProfilesForDiagram(bindingProfilesByDiagram, 'diagram-1')
    const edgeOptions = selectDispatchAllowedEdgeOptions([edgeOne, edgeTwo], profiles)

    expect(selectedDiagram?._id).toBe('diagram-1')
    expect(selectedSavedDiagram?._id).toBe('diagram-1')
    expect(profiles).toEqual([bindingOne])
    expect(edgeOptions.map((option) => option.id)).toEqual(['edge-1'])
    expect(selectDispatchSelectedEdge([edgeOne, edgeTwo], 'edge-1')?._id).toBe('edge-1')
    expect(selectDispatchSelectedBindingProfile(profiles, 'edge-1')?._id).toBe('binding-1')
    expect(selectDispatchSelectedCatalogStatus(catalogStatusByEdgeId, 'edge-1')).toBe('loaded')
    expect(selectDispatchSelectedCatalogStatus(catalogStatusByEdgeId, null)).toBe('idle')

    expect(
      selectDispatchRecoveryState({
        isRouteStateStructurallyInvalid: true,
        bootstrapError: null,
        bindingsError: null,
        savedDiagramError: null,
        isBootstrapLoading: false,
        isBindingsLoading: false,
        isSavedDiagramLoading: false,
        hasBindingProfilesForSelectedDiagram: true,
        requiresDashboardRuntimeContext: false,
        selectedDiagramId: null,
        selectedDiagram: null,
        selectedEdgeId: 'edge-1',
        selectedEdge: edgeOne,
        selectedBindingProfile: bindingOne,
        selectedSavedDiagram: null,
        bindingValidation: null,
        selectedRuntimeLayout: null,
      }),
    ).toBe('invalid-selection')
  })

  it('keeps stale diagram, binding, and catalog responses out of the active Dispatch context', async () => {
    const staleBindings = createDeferred<DashboardBindingProfile[]>()
    const staleDiagram = createDeferred<typeof diagramOne>()
    const staleCatalog = createDeferred<{
      edgeServerId: string
      telemetry: unknown[]
      commands: unknown[]
    }>()
    const bindingRequests: string[] = []
    const diagramRequests: string[] = []
    const catalogRequests: string[] = []

    server.use(
      http.get('/api/diagrams', () => jsonSuccess([diagramOne, diagramTwo])),
      http.get('/api/edge-servers', () => jsonSuccess([edgeOne, edgeTwo, blockedEdge])),
      http.get('/api/diagrams/:id/bindings', async ({ params }) => {
        const diagramId = String(params.id)
        bindingRequests.push(diagramId)

        if (diagramId === 'diagram-1') {
          return jsonSuccess(await staleBindings.promise)
        }

        return jsonSuccess([bindingTwo])
      }),
      http.get('/api/diagrams/:id', async ({ params }) => {
        const diagramId = String(params.id)
        diagramRequests.push(diagramId)

        if (diagramId === 'diagram-1') {
          return jsonSuccess(await staleDiagram.promise)
        }

        return jsonSuccess(diagramTwo)
      }),
      http.get('/api/edge-servers/:edgeId/catalog', async ({ params }) => {
        const edgeId = String(params.edgeId)
        catalogRequests.push(edgeId)

        if (edgeId === 'edge-1') {
          return jsonSuccess(await staleCatalog.promise)
        }

        return jsonSuccess({ edgeServerId: 'edge-2', telemetry: [], commands: [] })
      }),
    )

    const wrapper = createMemoryWrapper('/hub/dispatch/dashboard?diagramId=diagram-1&edgeId=edge-1')
    const { result } = renderHook(
      () => {
        const route = useDispatchRouteState()
        const workspace = useDispatchWorkspaceContext({
          routeState: route.routeState,
          isRouteStateStructurallyInvalid: route.isStructurallyInvalid,
          loadDashboardRuntimeContext: true,
        })

        return { ...route, workspace }
      },
      { wrapper },
    )

    await waitFor(() => {
      expect(result.current.workspace.selection.selectedDiagram?._id).toBe('diagram-1')
      expect(bindingRequests).toContain('diagram-1')
      expect(diagramRequests).toContain('diagram-1')
      expect(catalogRequests).toContain('edge-1')
    })

    act(() => {
      result.current.setRouteState(
        { diagramId: 'diagram-2', edgeId: 'edge-2' },
        { source: 'user-selection' },
      )
    })

    await waitFor(() => {
      expect(result.current.workspace.recoveryState).toBe('ready')
      expect(result.current.workspace.selection.selectedDiagram?._id).toBe('diagram-2')
      expect(result.current.workspace.selection.selectedEdge?._id).toBe('edge-2')
      expect(result.current.workspace.selection.selectedBindingProfile?._id).toBe('binding-2')
      expect(result.current.workspace.dashboardRuntime.savedDiagram?._id).toBe('diagram-2')
      expect(result.current.workspace.dashboardRuntime.edgeCatalog?.edgeServerId).toBe('edge-2')
    })

    act(() => {
      staleBindings.resolve([bindingOne])
      staleDiagram.resolve(diagramOne)
      staleCatalog.resolve({ edgeServerId: 'edge-1', telemetry: [], commands: [] })
    })

    await waitFor(() => {
      expect(result.current.workspace.selection.selectedDiagram?._id).toBe('diagram-2')
      expect(result.current.workspace.selection.selectedEdge?._id).toBe('edge-2')
      expect(result.current.workspace.selection.selectedBindingProfile?._id).toBe('binding-2')
      expect(result.current.workspace.dashboardRuntime.savedDiagram?._id).toBe('diagram-2')
      expect(result.current.workspace.dashboardRuntime.edgeCatalog?.edgeServerId).toBe('edge-2')
    })
  })

  it('keeps Dashboard-only runtime context inactive when the active Dispatch tab does not need it', async () => {
    const catalog = createDeferred<{ edgeServerId: string; telemetry: unknown[]; commands: unknown[] }>()

    server.use(
      http.get('/api/diagrams', () => jsonSuccess([diagramOne])),
      http.get('/api/edge-servers', () => jsonSuccess([edgeOne])),
      http.get('/api/diagrams/:id/bindings', () => jsonSuccess([bindingOne])),
      http.get('/api/diagrams/:id', () => jsonSuccess(diagramOne)),
      http.get('/api/edge-servers/:edgeId/catalog', async () => jsonSuccess(await catalog.promise)),
    )

    const wrapper = createMemoryWrapper('/hub/dispatch/dashboard?diagramId=diagram-1&edgeId=edge-1')
    const { result, rerender } = renderHook(
      ({ loadDashboardRuntimeContext }: { loadDashboardRuntimeContext: boolean }) => {
        const route = useDispatchRouteState()
        return useDispatchWorkspaceContext({
          routeState: route.routeState,
          isRouteStateStructurallyInvalid: route.isStructurallyInvalid,
          loadDashboardRuntimeContext,
        })
      },
      { initialProps: { loadDashboardRuntimeContext: true }, wrapper },
    )

    await waitFor(() => {
      expect(result.current.selection.selectedBindingProfile?._id).toBe('binding-1')
      expect(result.current.dashboardRuntime.edgeCatalogStatus).toBe('loading')
    })

    rerender({ loadDashboardRuntimeContext: false })

    act(() => {
      catalog.resolve({ edgeServerId: 'edge-1', telemetry: [], commands: [] })
    })

    await waitFor(() => {
      expect(result.current.recoveryState).toBe('ready')
      expect(result.current.dashboardRuntime.savedDiagram).toBeNull()
      expect(result.current.dashboardRuntime.edgeCatalog).toBeNull()
      expect(result.current.dashboardRuntime.edgeCatalogStatus).toBe('idle')
    })
  })
})
