import { http, HttpResponse, type HttpHandler, type JsonBodyType } from 'msw'
import type { DashboardLayoutDocument } from '@/features/dashboard/model/types'
import type { Diagram } from '@/shared/api/diagrams'
import type { UserRow } from '@/shared/api/users'
import {
  dashboardVisualBindingProfile,
  dashboardVisualDiagram,
  dashboardVisualLayout,
  dashboardVisualCatalog,
} from '../fixtures/dashboardVisualLayout'

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

export interface DashboardCommandBindingFixture {
  widgetId: string
  deviceId: string
  commandType: 'set_bool' | 'set_number'
}

export interface DashboardBindingProfileFixture {
  _id: string
  diagramId: string
  edgeServerId: string
  widgetBindings: DashboardBindingFixture[]
  commandBindings?: DashboardCommandBindingFixture[]
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

export interface UserEdgeTelemetryCapabilityFixture {
  deviceId: string
  metric: string
  valueType?: 'boolean' | 'number' | 'string'
  label: string
}

export interface UserEdgeCommandCapabilityFixture {
  deviceId: string
  commandType: 'set_bool' | 'set_number'
  valueType: 'boolean' | 'number'
  min?: number
  max?: number
  reportedMetric: string
  label: string
}

export interface UserEdgeCatalogFixture {
  edgeServerId: string
  telemetry: UserEdgeTelemetryCapabilityFixture[]
  commands: UserEdgeCommandCapabilityFixture[]
}

export interface UserEdgeCommandResponseFixture {
  body: JsonBodyType
  status?: number
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

export interface AdminDiagramAssignmentFixtures {
  adminTemplates: Diagram[]
  candidateUsers: UserRow[]
  assignedCopies: Diagram[]
  rejectedTargetIds?: string[]
  userListRequests?: string[]
}

export interface UserEdgeConsumerFixtures {
  assignedEdges: DashboardEdgeFixture[]
  catalogByEdgeId: Record<string, UserEdgeCatalogFixture>
  commandResponsesByEdgeId?: Record<string, UserEdgeCommandResponseFixture>
}

function createDefaultDashboardRestFixtures(): DashboardRestFixtures {
  const diagramOne = createVisualDiagramFixture('diagram-1', 'Boiler')
  const diagramTwo = createVisualDiagramFixture('diagram-2', 'Pump')

  return {
    diagramsById: {
      [dashboardVisualDiagram._id]: dashboardVisualDiagram,
      [diagramOne._id]: diagramOne,
      [diagramTwo._id]: diagramTwo,
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
      {
        _id: dashboardVisualBindingProfile.edgeServerId,
        name: 'Visual Edge',
        lifecycleState: 'Active',
        availability: {
          online: true,
          lastSeenAt: '2026-04-24T08:14:30.000Z',
        },
      },
    ],
    bindingProfilesByDiagramId: {
      [dashboardVisualDiagram._id]: [dashboardVisualBindingProfile],
      'diagram-1': [
        createVisualBindingProfileFixture('binding-1', 'diagram-1', 'edge-1'),
      ],
      'diagram-2': [
        createVisualBindingProfileFixture('binding-2', 'diagram-2', 'edge-2'),
      ],
    },
  }
}

function createVisualDiagramFixture(_id: string, name: string): DashboardDiagramFixture {
  return {
    ...dashboardVisualDiagram,
    _id,
    name,
    layout: dashboardVisualLayout,
  }
}

function createVisualBindingProfileFixture(
  _id: string,
  diagramId: string,
  edgeServerId: string,
): DashboardBindingProfileFixture {
  return {
    ...dashboardVisualBindingProfile,
    _id,
    diagramId,
    edgeServerId,
    widgetBindings: dashboardVisualBindingProfile.widgetBindings.map((binding) => ({ ...binding })),
    commandBindings: dashboardVisualBindingProfile.commandBindings?.map((binding) => ({ ...binding })),
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
      'edge-online': {
        edgeServerId: 'edge-online',
        telemetry: [
          {
            deviceId: 'pump-1',
            metric: 'temperature',
            label: 'pump-1.temperature',
          },
        ],
        commands: [
          {
            deviceId: 'pump-1',
            commandType: 'set_bool',
            valueType: 'boolean',
            reportedMetric: 'running',
            label: 'pump-1.running',
          },
        ],
      },
      'edge-offline': { edgeServerId: 'edge-offline', telemetry: [], commands: [] },
      'edge-blocked': { edgeServerId: 'edge-blocked', telemetry: [], commands: [] },
      'edge-visual-1': dashboardVisualCatalog,
    },
    commandResponsesByEdgeId: {},
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
    commandResponsesByEdgeId: {
      ...defaults.commandResponsesByEdgeId,
      ...(overrides.commandResponsesByEdgeId ?? {}),
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
    http.get('/api/edge-servers/:edgeId/catalog', ({ params }) => {
      const catalog = fixtures.catalogByEdgeId[String(params.edgeId)]
      if (!catalog) {
        return HttpResponse.json({
          status: 'success',
          data: { edgeServerId: String(params.edgeId), telemetry: [], commands: [] },
        })
      }
      return HttpResponse.json({
        status: 'success',
        data: catalog,
      })
    }),
    http.post('/api/edge-servers/:edgeId/commands', ({ params }) => {
      const overrideResponse = fixtures.commandResponsesByEdgeId?.[String(params.edgeId)]
      if (overrideResponse) {
        return HttpResponse.json(overrideResponse.body, { status: overrideResponse.status || 200 })
      }
      return HttpResponse.json({
        status: 'success',
        data: { commandStatus: 'confirmed' },
      })
    }),
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

export function createAdminDiagramAssignmentHandlers(
  fixtures: AdminDiagramAssignmentFixtures,
): HttpHandler[] {
  return [
    http.get('/api/diagrams', () =>
      HttpResponse.json({
        status: 'success',
        data: fixtures.adminTemplates,
      }),
    ),
    http.delete('/api/diagrams/:id', ({ params }) => {
      const templateIndex = fixtures.adminTemplates.findIndex(
        (diagram) => diagram._id === String(params.id),
      )

      if (templateIndex === -1) {
        return HttpResponse.json(
          { status: 'error', message: 'Diagram not found' },
          { status: 404 },
        )
      }

      fixtures.adminTemplates.splice(templateIndex, 1)
      return new HttpResponse(null, { status: 204 })
    }),
    http.get('/api/admin/users', ({ request }) => {
      const url = new URL(request.url)
      fixtures.userListRequests?.push(url.search)
      const search = url.searchParams.get('search')?.trim().toLowerCase() ?? ''
      const page = Math.max(1, Number(url.searchParams.get('page') ?? 1))
      const limit = Math.max(1, Number(url.searchParams.get('limit') ?? 20))
      const role = url.searchParams.get('role')
      const activeOnly = url.searchParams.get('activeOnly') === 'true'

      const filtered = fixtures.candidateUsers.filter((user) => {
        if (role && user.role !== role) {
          return false
        }

        if (activeOnly && (user.isDeleted || user.isBanned)) {
          return false
        }

        return !search || user.email.toLowerCase().includes(search)
      })
      const offset = (page - 1) * limit

      return HttpResponse.json({
        status: 'success',
        data: filtered.slice(offset, offset + limit),
        total: filtered.length,
        page,
        limit,
      })
    }),
    http.post('/api/diagrams/:id/assign', async ({ params, request }) => {
      const templateId = String(params.id)
      const template = fixtures.adminTemplates.find((diagram) => diagram._id === templateId)
      const { targetUserId } = (await request.json()) as { targetUserId: string }
      const target = fixtures.candidateUsers.find((user) => user._id === targetUserId)

      if (!template || !target) {
        return HttpResponse.json(
          { status: 'error', message: 'Assignment target not found' },
          { status: 404 },
        )
      }

      if (fixtures.rejectedTargetIds?.includes(targetUserId)) {
        return HttpResponse.json(
          { status: 'error', message: 'Target user quota is full' },
          { status: 403 },
        )
      }

      const alreadyAssigned = fixtures.assignedCopies.some(
        (diagram) =>
          diagram.ownerId === targetUserId &&
          diagram.sourceTemplateId === templateId,
      )
      if (alreadyAssigned) {
        return HttpResponse.json(
          { status: 'error', message: 'Diagram template is already assigned to this user' },
          { status: 409 },
        )
      }

      const copy: Diagram = {
        ...template,
        _id: `${template._id}-copy-${targetUserId}`,
        ownerId: targetUserId,
        sourceTemplateId: template._id,
        layout: structuredClone(template.layout),
      }
      fixtures.assignedCopies.push(copy)

      return HttpResponse.json(
        {
          status: 'success',
          data: copy,
        },
        { status: 200 },
      )
    }),
  ]
}

// Baseline handlers remain empty; tests register scenario-specific handlers.
export const handlers: HttpHandler[] = []
