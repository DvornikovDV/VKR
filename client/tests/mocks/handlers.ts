import { http, HttpResponse, type HttpHandler } from 'msw'

interface DashboardWidgetFixture extends Record<string, unknown> {
  id: string
  type: string
}

export interface DashboardDiagramFixture {
  _id: string
  name: string
  layout: {
    widgets: DashboardWidgetFixture[]
  }
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
}

export interface DashboardRestFixtures {
  diagramsById: Record<string, DashboardDiagramFixture>
  trustedEdges: DashboardEdgeFixture[]
  bindingProfilesByDiagramId: Record<string, DashboardBindingProfileFixture[]>
}

export type OnboardingLifecycleState =
  | 'Pending First Connection'
  | 'Active'
  | 'Re-onboarding Required'
  | 'Blocked'

export type OnboardingPackageStatus = 'ready' | 'used' | 'expired' | 'reset' | 'blocked'

export interface OnboardingPackageSummaryFixture {
  credentialId: string
  status: OnboardingPackageStatus
  issuedAt: string
  expiresAt: string
  usedAt: string | null
  displayHint: string | null
}

export interface FirstConnectionPackageDisclosureFixture {
  edgeId: string
  onboardingSecret: string
  issuedAt: string
  expiresAt: string
  instructions: string
}

export interface AdminFleetEdgeFixture {
  _id: string
  name: string
  lifecycleState: OnboardingLifecycleState
  isTelemetryReady: boolean
  availability: {
    online: boolean
    lastSeenAt: string | null
  }
  trustedUsers: Array<{ _id: string; email: string }>
  createdBy: { _id: string; email: string } | null
  currentOnboardingPackage: OnboardingPackageSummaryFixture | null
  persistentCredentialVersion: number | null
  lastLifecycleEventAt: string | null
}

export interface TelemetryReadyEdgeFixture {
  _id: string
  name: string
  lifecycleState: 'Active'
  availability: {
    online: boolean
    lastSeenAt: string | null
  }
}

export interface OnboardingDisclosureFixture {
  edge: AdminFleetEdgeFixture
  onboardingPackage: FirstConnectionPackageDisclosureFixture
}

export interface EdgeLifecycleActionFixtures {
  resetByEdgeId: Record<string, OnboardingDisclosureFixture>
  revokeByEdgeId: Record<string, AdminFleetEdgeFixture>
  blockByEdgeId: Record<string, AdminFleetEdgeFixture>
  reenableByEdgeId: Record<string, AdminFleetEdgeFixture>
}

export interface EdgeOnboardingRestFixtures {
  adminFleet: AdminFleetEdgeFixture[]
  telemetryReadyEdges: TelemetryReadyEdgeFixture[]
  lifecycleActions: EdgeLifecycleActionFixtures
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
      { _id: 'edge-1', name: 'Edge A' },
      { _id: 'edge-2', name: 'Edge B' },
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

function createDefaultEdgeOnboardingFixtures(): EdgeOnboardingRestFixtures {
  const adminFleet: AdminFleetEdgeFixture[] = [
    {
      _id: 'edge-onboarding-1',
      name: 'Boiler Edge A',
      lifecycleState: 'Pending First Connection',
      isTelemetryReady: false,
      availability: { online: false, lastSeenAt: null },
      trustedUsers: [],
      createdBy: { _id: 'admin-1', email: 'admin@example.com' },
      currentOnboardingPackage: {
        credentialId: 'cred-1',
        status: 'ready',
        issuedAt: '2026-03-26T10:00:00.000Z',
        expiresAt: '2026-03-27T10:00:00.000Z',
        usedAt: null,
        displayHint: 'Ends with ...A1',
      },
      persistentCredentialVersion: null,
      lastLifecycleEventAt: '2026-03-26T10:00:00.000Z',
    },
    {
      _id: 'edge-onboarding-2',
      name: 'Pump Edge B',
      lifecycleState: 'Active',
      isTelemetryReady: true,
      availability: { online: true, lastSeenAt: '2026-03-26T10:15:00.000Z' },
      trustedUsers: [{ _id: 'user-1', email: 'user@example.com' }],
      createdBy: { _id: 'admin-1', email: 'admin@example.com' },
      currentOnboardingPackage: null,
      persistentCredentialVersion: 1,
      lastLifecycleEventAt: '2026-03-26T10:12:00.000Z',
    },
  ]

  const firstEdge = adminFleet[0]
  const secondEdge = adminFleet[1]

  return {
    adminFleet,
    telemetryReadyEdges: [
      {
        _id: 'edge-onboarding-2',
        name: 'Pump Edge B',
        lifecycleState: 'Active',
        availability: { online: true, lastSeenAt: '2026-03-26T10:15:00.000Z' },
      },
    ],
    lifecycleActions: {
      resetByEdgeId: {
        'edge-onboarding-1': {
          edge: firstEdge,
          onboardingPackage: {
            edgeId: firstEdge._id,
            onboardingSecret: 'first-connection-secret',
            issuedAt: '2026-03-26T10:00:00.000Z',
            expiresAt: '2026-03-27T10:00:00.000Z',
            instructions: 'Use this package once during first edge activation',
          },
        },
      },
      revokeByEdgeId: {
        'edge-onboarding-1': firstEdge,
        'edge-onboarding-2': secondEdge,
      },
      blockByEdgeId: {
        'edge-onboarding-1': firstEdge,
        'edge-onboarding-2': secondEdge,
      },
      reenableByEdgeId: {
        'edge-onboarding-1': firstEdge,
        'edge-onboarding-2': secondEdge,
      },
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

export function createEdgeOnboardingApiFixtures(
  overrides: Partial<EdgeOnboardingRestFixtures> = {},
): EdgeOnboardingRestFixtures {
  const defaults = createDefaultEdgeOnboardingFixtures()

  return {
    adminFleet: overrides.adminFleet ?? defaults.adminFleet,
    telemetryReadyEdges: overrides.telemetryReadyEdges ?? defaults.telemetryReadyEdges,
    lifecycleActions: {
      resetByEdgeId: {
        ...defaults.lifecycleActions.resetByEdgeId,
        ...(overrides.lifecycleActions?.resetByEdgeId ?? {}),
      },
      revokeByEdgeId: {
        ...defaults.lifecycleActions.revokeByEdgeId,
        ...(overrides.lifecycleActions?.revokeByEdgeId ?? {}),
      },
      blockByEdgeId: {
        ...defaults.lifecycleActions.blockByEdgeId,
        ...(overrides.lifecycleActions?.blockByEdgeId ?? {}),
      },
      reenableByEdgeId: {
        ...defaults.lifecycleActions.reenableByEdgeId,
        ...(overrides.lifecycleActions?.reenableByEdgeId ?? {}),
      },
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

export function createEdgeOnboardingApiHandlers(fixtures: EdgeOnboardingRestFixtures): HttpHandler[] {
  return [
    http.get('/api/admin/edge-servers', () =>
      HttpResponse.json({
        status: 'success',
        data: fixtures.adminFleet,
      }),
    ),
    http.get('/api/edge-servers', () =>
      HttpResponse.json({
        status: 'success',
        data: fixtures.telemetryReadyEdges,
      }),
    ),
    http.post('/api/edge-servers/:edgeId/onboarding/reset', ({ params }) => {
      const edgeId = String(params.edgeId)
      const disclosure = fixtures.lifecycleActions.resetByEdgeId[edgeId]

      if (!disclosure) {
        return HttpResponse.json({ status: 'error', message: 'Edge not found' }, { status: 404 })
      }

      return HttpResponse.json({
        status: 'success',
        data: disclosure,
      })
    }),
    http.post('/api/edge-servers/:edgeId/trust/revoke', ({ params }) => {
      const edgeId = String(params.edgeId)
      const edge = fixtures.lifecycleActions.revokeByEdgeId[edgeId]

      if (!edge) {
        return HttpResponse.json({ status: 'error', message: 'Edge not found' }, { status: 404 })
      }

      return HttpResponse.json({ status: 'success', data: edge })
    }),
    http.post('/api/edge-servers/:edgeId/block', ({ params }) => {
      const edgeId = String(params.edgeId)
      const edge = fixtures.lifecycleActions.blockByEdgeId[edgeId]

      if (!edge) {
        return HttpResponse.json({ status: 'error', message: 'Edge not found' }, { status: 404 })
      }

      return HttpResponse.json({ status: 'success', data: edge })
    }),
    http.post('/api/edge-servers/:edgeId/re-enable-onboarding', ({ params }) => {
      const edgeId = String(params.edgeId)
      const edge = fixtures.lifecycleActions.reenableByEdgeId[edgeId]

      if (!edge) {
        return HttpResponse.json({ status: 'error', message: 'Edge not found' }, { status: 404 })
      }

      return HttpResponse.json({ status: 'success', data: edge })
    }),
  ]
}

// Baseline handlers remain empty; tests register scenario-specific handlers.
export const handlers: HttpHandler[] = []
