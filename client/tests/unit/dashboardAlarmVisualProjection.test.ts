import { describe, expect, it } from 'vitest'
import { selectDashboardAlarmVisualState } from '@/features/dashboard/model/alarmVisualProjection'
import { normalizeDashboardRuntimeLayout } from '@/features/dashboard/model/runtimeLayout'
import { createDashboardBindingKey } from '@/features/dashboard/model/selectors'
import {
  dashboardVisualAlarmFixtureAnchor,
  dashboardVisualBindingProfile,
  dashboardVisualLayout,
} from '../fixtures/dashboardVisualLayout'
import {
  createDashboardActiveUnacknowledgedAlarmIncidentProjectionFixture,
  createDashboardClearedUnacknowledgedAlarmIncidentProjectionFixture,
  createDashboardClosedAlarmIncidentProjectionFixture,
  createDashboardDangerAlarmIncidentProjectionFixture,
  createDashboardVisualDangerAlarmIncidentProjectionFixture,
  createDashboardVisualWarningAlarmIncidentProjectionFixture,
} from '../integration/helpers/mockDashboardRuntimeSocket'
import type {
  DashboardBindingProfile,
  DashboardLayoutDocument,
} from '@/features/dashboard/model/types'

describe('dashboard alarm visual projection', () => {
  it('maps saved binding incidents to widget state and renderable image aggregation', () => {
    const runtimeLayout = normalizeDashboardRuntimeLayout(dashboardVisualLayout)
    const incidents = [
      createDashboardVisualWarningAlarmIncidentProjectionFixture({
        incidentId: 'incident-temperature-warning-active',
      }),
      createDashboardVisualDangerAlarmIncidentProjectionFixture({
        incidentId: 'incident-status-danger-acknowledged',
        lifecycleState: 'active_acknowledged',
        isActive: true,
        isAcknowledged: true,
        acknowledgedAt: '2026-05-09T10:05:00.000Z',
        acknowledgedBy: 'operator-1',
        rule: { severity: 'danger' },
      }),
      createDashboardClearedUnacknowledgedAlarmIncidentProjectionFixture({
        incidentId: 'incident-status-warning-cleared',
        edgeId: dashboardVisualAlarmFixtureAnchor.edgeId,
        deviceId: dashboardVisualAlarmFixtureAnchor.dangerDeviceId,
        metric: dashboardVisualAlarmFixtureAnchor.dangerMetric,
        rule: { severity: 'warning' },
      }),
    ]

    const projection = selectDashboardAlarmVisualState({
      selectedEdgeId: dashboardVisualAlarmFixtureAnchor.edgeId,
      incidents,
      bindingProfile: dashboardVisualBindingProfile,
      runtimeLayout,
    })

    expect(Object.keys(projection.widgetById).sort()).toEqual([
      dashboardVisualAlarmFixtureAnchor.dangerWidgetId,
      dashboardVisualAlarmFixtureAnchor.warningWidgetId,
    ])
    expect(projection.widgetById[dashboardVisualAlarmFixtureAnchor.warningWidgetId]).toMatchObject({
      count: 1,
      severity: 'warning',
      lifecycleMode: 'active_unacknowledged',
    })
    expect(projection.widgetById[dashboardVisualAlarmFixtureAnchor.warningWidgetId]?.incidents).toEqual([
      expect.objectContaining({
        incidentId: 'incident-temperature-warning-active',
        deviceId: dashboardVisualAlarmFixtureAnchor.warningDeviceId,
        metric: dashboardVisualAlarmFixtureAnchor.warningMetric,
      }),
    ])
    expect(projection.widgetById[dashboardVisualAlarmFixtureAnchor.dangerWidgetId]).toMatchObject({
      count: 2,
      severity: 'danger',
      lifecycleMode: 'active_acknowledged',
    })
    expect(projection.imageById[dashboardVisualAlarmFixtureAnchor.sharedImageId]).toMatchObject({
      count: 3,
      severity: 'danger',
      lifecycleMode: 'active_unacknowledged',
      widgetIds: [
        dashboardVisualAlarmFixtureAnchor.warningWidgetId,
        dashboardVisualAlarmFixtureAnchor.dangerWidgetId,
      ],
      bindingKeys: [
        createDashboardBindingKey(
          dashboardVisualAlarmFixtureAnchor.warningDeviceId,
          dashboardVisualAlarmFixtureAnchor.warningMetric,
        ),
        createDashboardBindingKey(
          dashboardVisualAlarmFixtureAnchor.dangerDeviceId,
          dashboardVisualAlarmFixtureAnchor.dangerMetric,
        ),
      ],
    })
  })

  it('excludes closed, unmatched, inferred, and non-renderable image targets', () => {
    const inferenceTrapLayout = {
      images: [
        ...(dashboardVisualLayout.images ?? []),
        {
          imageId: 'image-damaged',
          base64: '',
          x: 900,
          y: 100,
          height: 120,
          scaleX: 1,
          scaleY: 1,
        },
      ],
      widgets: [
        ...(dashboardVisualLayout.widgets ?? []),
        {
          id: 'widget-label-trap',
          type: 'label',
          imageId: 'image-boiler',
          x: 96,
          y: 92,
          width: 180,
          height: 40,
          text: 'boiler-1 temperature',
          label: 'boiler-1 temperature',
          displayValue: 95,
        },
        {
          id: 'widget-damaged-image-bound',
          type: 'number-display',
          imageId: 'image-damaged',
          x: 920,
          y: 132,
          width: 120,
          height: 48,
          text: 'boiler-1 pressure',
          label: 'boiler-1 pressure',
          displayValue: 101,
        },
      ],
    } satisfies DashboardLayoutDocument
    const runtimeLayout = normalizeDashboardRuntimeLayout(inferenceTrapLayout)
    const bindingProfile = {
      ...dashboardVisualBindingProfile,
      widgetBindings: [
        ...dashboardVisualBindingProfile.widgetBindings,
        {
          widgetId: 'widget-damaged-image-bound',
          deviceId: 'boiler-1',
          metric: 'pressure',
        },
      ],
    } satisfies DashboardBindingProfile
    const incidents = [
      createDashboardClosedAlarmIncidentProjectionFixture({
        incidentId: 'incident-closed-bound',
        edgeId: dashboardVisualAlarmFixtureAnchor.edgeId,
        deviceId: dashboardVisualAlarmFixtureAnchor.warningDeviceId,
        metric: dashboardVisualAlarmFixtureAnchor.warningMetric,
        rule: { severity: 'danger' },
      }),
      createDashboardDangerAlarmIncidentProjectionFixture({
        incidentId: 'incident-unmatched-label-geometry-telemetry-trap',
        edgeId: dashboardVisualAlarmFixtureAnchor.edgeId,
        deviceId: 'boiler-1',
        metric: 'unbound-temperature',
        latestValue: 95,
      }),
      createDashboardDangerAlarmIncidentProjectionFixture({
        incidentId: 'incident-wrong-edge',
        edgeId: 'edge-other',
        deviceId: dashboardVisualAlarmFixtureAnchor.dangerDeviceId,
        metric: dashboardVisualAlarmFixtureAnchor.dangerMetric,
      }),
      createDashboardActiveUnacknowledgedAlarmIncidentProjectionFixture({
        incidentId: 'incident-non-renderable-image-widget',
        edgeId: dashboardVisualAlarmFixtureAnchor.edgeId,
        deviceId: 'boiler-1',
        metric: 'pressure',
        rule: { severity: 'danger' },
      }),
    ]

    const projection = selectDashboardAlarmVisualState({
      selectedEdgeId: dashboardVisualAlarmFixtureAnchor.edgeId,
      incidents,
      bindingProfile,
      runtimeLayout,
    })

    expect(projection.widgetById).toEqual({
      'widget-damaged-image-bound': expect.objectContaining({
        count: 1,
        severity: 'danger',
        lifecycleMode: 'active_unacknowledged',
      }),
    })
    expect(projection.widgetById[dashboardVisualAlarmFixtureAnchor.warningWidgetId]).toBeUndefined()
    expect(projection.widgetById[dashboardVisualAlarmFixtureAnchor.dangerWidgetId]).toBeUndefined()
    expect(projection.widgetById['widget-label-trap']).toBeUndefined()
    expect(projection.imageById).toEqual({})
    expect(runtimeLayout.imageById.has('image-damaged')).toBe(true)
    expect(runtimeLayout.runtimeRenderableImageById.has('image-damaged')).toBe(false)
  })

  it('rejects wrong-edge binding profiles and deduplicates repeated binding rows', () => {
    const runtimeLayout = normalizeDashboardRuntimeLayout(dashboardVisualLayout)
    const incident = createDashboardActiveUnacknowledgedAlarmIncidentProjectionFixture({
      incidentId: 'incident-duplicate-binding-row',
      edgeId: dashboardVisualAlarmFixtureAnchor.edgeId,
      deviceId: dashboardVisualAlarmFixtureAnchor.warningDeviceId,
      metric: dashboardVisualAlarmFixtureAnchor.warningMetric,
      rule: { severity: 'warning' },
    })
    const duplicatedBindingProfile = {
      ...dashboardVisualBindingProfile,
      widgetBindings: [
        ...dashboardVisualBindingProfile.widgetBindings,
        {
          widgetId: dashboardVisualAlarmFixtureAnchor.warningWidgetId,
          deviceId: dashboardVisualAlarmFixtureAnchor.warningDeviceId,
          metric: dashboardVisualAlarmFixtureAnchor.warningMetric,
        },
      ],
    } satisfies DashboardBindingProfile

    const projection = selectDashboardAlarmVisualState({
      selectedEdgeId: dashboardVisualAlarmFixtureAnchor.edgeId,
      incidents: [incident],
      bindingProfile: duplicatedBindingProfile,
      runtimeLayout,
    })

    expect(projection.widgetById[dashboardVisualAlarmFixtureAnchor.warningWidgetId]).toMatchObject({
      count: 1,
      incidents: [expect.objectContaining({ incidentId: incident.incidentId })],
    })
    expect(projection.imageById[dashboardVisualAlarmFixtureAnchor.sharedImageId]).toMatchObject({
      count: 1,
      bindingKeys: [
        createDashboardBindingKey(
          dashboardVisualAlarmFixtureAnchor.warningDeviceId,
          dashboardVisualAlarmFixtureAnchor.warningMetric,
        ),
      ],
      incidents: [expect.objectContaining({ incidentId: incident.incidentId })],
    })

    const wrongEdgeProjection = selectDashboardAlarmVisualState({
      selectedEdgeId: dashboardVisualAlarmFixtureAnchor.edgeId,
      incidents: [incident],
      bindingProfile: {
        ...dashboardVisualBindingProfile,
        edgeServerId: 'edge-other',
      },
      runtimeLayout,
    })

    expect(wrongEdgeProjection).toEqual({ widgetById: {}, imageById: {} })
  })
})
