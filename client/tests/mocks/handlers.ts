import { http, HttpResponse, type HttpHandler } from 'msw'
import type { DashboardLayoutDocument } from '@/features/dashboard/model/types'

export interface DashboardDiagramFixture {
  _id: string
  name: string
  layout: DashboardLayoutDocument
}

export interface DashboardBindingFixture {
  widgetId: string
  deviceId: string
  metric: string
}

export interface DashboardBindingProfileFixture {
  _id: string
  diagramId: string
  edgeServerId: string
  widgetBindings: DashboardBindingFixture[]
}

export interface DashboardEdgeFixture {
  _id: string
  name: string
  lifecycleState: 'Active' | 'Blocked'
  availability: {
    online: boolean
    lastSeenAt: string | null
  }
}

export interface UserEdgeCatalogFixture {
  edgeServerId: string
  deviceId: string
  metric: string
  label: string
}

export interface AdminEdgeFixture {
  _id: string
  name: string
  lifecycleState: 'Active' | 'Blocked'
  availability: {
    online: boolean
    lastSeenAt: string | null
  }
  trustedUsers: Array<{ _id: string; email: string }>
  createdBy: { _id: string; email: string } | null
  persistentCredentialVersion: number | null
  lastLifecycleEventAt: string | null
}

export interface AdminEdgeCredentialDisclosureFixture {
  edge: AdminEdgeFixture
  persistentCredential: {
    edgeId: string
    credentialSecret: string
    version: number
    issuedAt: string
    instructions: string
  }
}

export interface AdminEdgeContractFixtures {
  fleet: AdminEdgeFixture[]
  blockEdgeById?: Record<string, AdminEdgeFixture>
  rotateDisclosureById?: Record<string, AdminEdgeCredentialDisclosureFixture>
  unblockDisclosureById?: Record<string, AdminEdgeCredentialDisclosureFixture>
}

export interface DashboardRestFixtures {
  diagramsById: Record<string, DashboardDiagramFixture>
  trustedEdges: DashboardEdgeFixture[]
  bindingProfilesByDiagramId: Record<string, DashboardBindingProfileFixture[]>
}

export interface UserEdgeConsumerFixtures {
  assignedEdges: DashboardEdgeFixture[]
  catalogByEdgeId: Record<string, UserEdgeCatalogFixture[]>
}

function createDefaultDashboardRestFixtures(): DashboardRestFixtures {
  return {
    diagramsById: {
      'diagram-1': {
        _id: 'diagram-1',
        name: 'Boiler',
        layout: {
          widgets: [{ id: 'widget-1', type: 'number-display', x: 20, y: 20 }],
        },
      },
      'diagram-2': {
        _id: 'diagram-2',
        name: 'Pump',
        layout: {
          widgets: [{ id: 'widget-2', type: 'number-display', x: 20, y: 20 }],
        },
      },
    },
    trustedEdges: [
      {
        _id: 'edge-1',
        name: 'Edge A',
        lifecycleState: 'Active',
        availability: { online: true, lastSeenAt: '2026-03-26T10:20:00.000Z' },
      },
      {
        _id: 'edge-2',
        name: 'Edge B',
        lifecycleState: 'Active',
        availability: { online: false, lastSeenAt: '2026-03-26T10:10:00.000Z' },
      },
    ],
    bindingProfilesByDiagramId: {
      'diagram-1': [
        {
          _id: 'binding-1',
          diagramId: 'diagram-1',
          edgeServerId: 'edge-1',
          widgetBindings: [{ widgetId: 'widget-1', deviceId: 'pump-1', metric: 'temperature' }],
        },
      ],
      'diagram-2': [
        {
          _id: 'binding-2',
          diagramId: 'diagram-2',
          edgeServerId: 'edge-2',
          widgetBindings: [{ widgetId: 'widget-2', deviceId: 'pump-2', metric: 'flow' }],
        },
      ],
    },
  }
}

function createDefaultUserEdgeConsumerFixtures(): UserEdgeConsumerFixtures {
  return {
    assignedEdges: [
      {
        _id: 'edge-online',
        name: 'Online Edge',
        lifecycleState: 'Active',
        availability: { online: true, lastSeenAt: '2026-04-19T10:20:00.000Z' },
      },
      {
        _id: 'edge-offline',
        name: 'Offline Edge',
        lifecycleState: 'Active',
        availability: { online: false, lastSeenAt: '2026-04-19T10:10:00.000Z' },
      },
      {
        _id: 'edge-blocked',
        name: 'Blocked Edge',
        lifecycleState: 'Blocked',
        availability: { online: false, lastSeenAt: '2026-04-19T10:00:00.000Z' },
      },
    ],
    catalogByEdgeId: {
      'edge-online': [
        {
          edgeServerId: 'edge-online',
          deviceId: 'pump-1',
          metric: 'temperature',
          label: 'pump-1.temperature',
        },
      ],
      'edge-offline': [],
      'edge-blocked': [],
    },
  }
}

export function createDashboardApiFixtures(
  overrides: Partial<DashboardRestFixtures> = {},
): DashboardRestFixtures {
  const defaults = createDefaultDashboardRestFixtures()

  return {
    diagramsById: {
      ...defaults.diagramsById,
      ...(overrides.diagramsById ?? {}),
    },
    trustedEdges: overrides.trustedEdges ?? defaults.trustedEdges,
    bindingProfilesByDiagramId: {
      ...defaults.bindingProfilesByDiagramId,
      ...(overrides.bindingProfilesByDiagramId ?? {}),
    },
  }
}

export function createUserEdgeConsumerFixtures(
  overrides: Partial<UserEdgeConsumerFixtures> = {},
): UserEdgeConsumerFixtures {
  const defaults = createDefaultUserEdgeConsumerFixtures()

  return {
    assignedEdges: overrides.assignedEdges ?? defaults.assignedEdges,
    catalogByEdgeId: {
      ...defaults.catalogByEdgeId,
      ...(overrides.catalogByEdgeId ?? {}),
    },
  }
}

function selectDiagramCatalog(
  diagramsById: Record<string, DashboardDiagramFixture>,
): DashboardDiagramFixture[] {
  return Object.values(diagramsById)
}

export function createDashboardApiHandlers(fixtures: DashboardRestFixtures): HttpHandler[] {
  return [
    http.get('/api/diagrams', () =>
      HttpResponse.json({
        status: 'success',
        data: selectDiagramCatalog(fixtures.diagramsById),
      }),
    ),
    http.get('/api/diagrams/:id', ({ params }) => {
      const diagramId = String(params.id)
      const document = fixtures.diagramsById[diagramId]

      if (!document) {
        return HttpResponse.json({ status: 'error', message: 'Diagram not found' }, { status: 404 })
      }

      return HttpResponse.json({
        status: 'success',
        data: document,
      })
    }),
    http.get('/api/edge-servers', () =>
      HttpResponse.json({
        status: 'success',
        data: fixtures.trustedEdges,
      }),
    ),
    http.get('/api/diagrams/:id/bindings', ({ params }) =>
      HttpResponse.json({
        status: 'success',
        data: fixtures.bindingProfilesByDiagramId[String(params.id)] ?? [],
      }),
    ),
  ]
}

export function createUserEdgeConsumerHandlers(fixtures: UserEdgeConsumerFixtures): HttpHandler[] {
  return [
    http.get('/api/edge-servers', () =>
      HttpResponse.json({
        status: 'success',
        data: fixtures.assignedEdges,
      }),
    ),
    http.get('/api/edge-servers/:edgeId/catalog', ({ params }) =>
      HttpResponse.json({
        status: 'success',
        data: fixtures.catalogByEdgeId[String(params.edgeId)] ?? [],
      }),
    ),
  ]
}

export function createAdminEdgeContractHandlers(fixtures: AdminEdgeContractFixtures): HttpHandler[] {
  return [
    http.get('/api/admin/edge-servers', () =>
      HttpResponse.json({
        status: 'success',
        data: fixtures.fleet,
      }),
    ),
    http.post('/api/edge-servers/:edgeId/block', ({ params }) => {
      const edgeId = String(params.edgeId)
      const edge = fixtures.blockEdgeById?.[edgeId]

      if (!edge) {
        return HttpResponse.json({ status: 'error', message: 'Edge not found' }, { status: 404 })
      }

      return HttpResponse.json({
        status: 'success',
        data: {
          edge,
        },
      })
    }),
    http.post('/api/edge-servers/:edgeId/rotate-credential', ({ params }) => {
      const edgeId = String(params.edgeId)
      const disclosure = fixtures.rotateDisclosureById?.[edgeId]

      if (!disclosure) {
        return HttpResponse.json({ status: 'error', message: 'Edge not found' }, { status: 404 })
      }

      return HttpResponse.json({
        status: 'success',
        data: disclosure,
      })
    }),
    http.post('/api/edge-servers/:edgeId/unblock', ({ params }) => {
      const edgeId = String(params.edgeId)
      const disclosure = fixtures.unblockDisclosureById?.[edgeId]

      if (!disclosure) {
        return HttpResponse.json({ status: 'error', message: 'Edge not found' }, { status: 404 })
      }

      return HttpResponse.json({
        status: 'success',
        data: disclosure,
      })
    }),
  ]
}

// Baseline handlers remain empty; tests register scenario-specific handlers.
export const handlers: HttpHandler[] = []
