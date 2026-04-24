import { describe, expect, it } from 'vitest'
import type {
  DashboardConnectionRenderSegment,
  DashboardRenderIssue,
  DashboardRuntimeLayout,
  DashboardSavedLayoutDocument,
} from '@/features/dashboard/model/types'
import { normalizeDashboardRuntimeLayout } from '@/features/dashboard/model/runtimeLayout'
import {
  createDashboardVisualRestFixtures,
  dashboardVisualBindingProfile,
  dashboardVisualDiagram,
  dashboardVisualLayout,
} from '../fixtures/dashboardVisualLayout'

describe('dashboard visual layout fixture (T034)', () => {
  it('visual-layout-fixture exposes constructor-shaped data for MSW consumption', () => {
    expect(dashboardVisualLayout.images).toHaveLength(2)
    expect(dashboardVisualLayout.connectionPoints).toHaveLength(4)
    expect(dashboardVisualLayout.connections).toHaveLength(2)
    expect(dashboardVisualLayout.widgets.map((widget) => widget.type)).toEqual([
      'number-display',
      'text-display',
      'led',
      'toggle-switch',
      'number-display',
    ])

    const fixtures = createDashboardVisualRestFixtures()

    expect(fixtures.diagramsById[dashboardVisualDiagram._id]).toBe(dashboardVisualDiagram)
    expect(fixtures.bindingProfilesByDiagramId[dashboardVisualDiagram._id]).toContain(
      dashboardVisualBindingProfile,
    )
  })
})

describe('dashboard saved layout types (T035)', () => {
  it('saved-layout-types represent visual geometry, indexes, bounds, and render issues', () => {
    const savedLayout: DashboardSavedLayoutDocument = dashboardVisualLayout
    const segment: DashboardConnectionRenderSegment = {
      connectionId: 'connection-main-line',
      from: { x: 400, y: 131 },
      to: { x: 470, y: 131 },
      source: 'saved-segment',
    }
    const issue: DashboardRenderIssue = {
      severity: 'recoverable',
      kind: 'missing-connection-point',
      message: 'Connection references a missing point.',
      elementId: 'connection-damaged-reference',
    }
    const images = savedLayout.images ?? []
    const connectionPoints = savedLayout.connectionPoints ?? []
    const connections = savedLayout.connections ?? []
    const widgets = savedLayout.widgets ?? []
    const runtimeLayout: DashboardRuntimeLayout = {
      images,
      connectionPoints,
      connections,
      widgets,
      imageById: new Map(images.map((image) => [image.imageId, image])),
      pointById: new Map(connectionPoints.map((point) => [point.id, point])),
      widgetById: new Map(widgets.map((widget) => [widget.id, widget])),
      widgetIds: new Set(widgets.map((widget) => widget.id)),
      runtimeRenderableWidgets: widgets,
      connectionRenderSegments: [segment],
      diagramBounds: { minX: 40, minY: 32, maxX: 860, maxY: 388, width: 820, height: 356 },
      renderIssues: [issue],
      hasBlockingIssues: false,
      hasRecoverableIssues: true,
    }

    expect(runtimeLayout.imageById.get('image-boiler')?.x).toBe(40)
    expect(runtimeLayout.connectionRenderSegments[0]).toBe(segment)
    expect(runtimeLayout.renderIssues[0]).toBe(issue)
  })
})

describe('dashboard saved layout normalization (T036/T038)', () => {
  it('preserves saved ids, coordinates, scale, connection references, segments, and widget geometry', () => {
    const runtimeLayout = normalizeDashboardRuntimeLayout(dashboardVisualLayout)
    const visualImages = dashboardVisualLayout.images ?? []
    const visualConnections = dashboardVisualLayout.connections ?? []
    const visualWidgets = dashboardVisualLayout.widgets ?? []

    expect(runtimeLayout.images).toEqual(visualImages)
    expect(runtimeLayout.connectionPoints).toEqual(dashboardVisualLayout.connectionPoints)
    expect(runtimeLayout.connections).toEqual(visualConnections)
    expect(runtimeLayout.widgets).toEqual(visualWidgets)

    expect(runtimeLayout.imageById.get('image-pump')).toBe(visualImages[1])
    expect(runtimeLayout.pointById.get('pin-boiler-out')).toEqual(
      expect.objectContaining({ imageId: 'image-boiler', side: 'right', offset: 0.45 }),
    )
    expect(runtimeLayout.widgetById.get('widget-temperature')).toEqual(
      expect.objectContaining({
        x: 96,
        y: 92,
        width: 112,
        height: 52,
        relativeX: 0.16,
        relativeY: 0.27,
      }),
    )
    expect(runtimeLayout.widgetIds.has('widget-alarm')).toBe(true)
    expect(runtimeLayout.runtimeRenderableWidgets.map((widget) => widget.id)).toEqual(
      visualWidgets.map((widget) => widget.id),
    )
    expect(visualConnections[0].segments).toEqual([
      { x1: 400, y1: 131, x2: 470, y2: 131 },
      { x1: 470, y1: 131, x2: 520, y2: 156 },
    ])
    expect(
      runtimeLayout.connectionRenderSegments
        .filter((segment) => segment.source === 'saved-segment')
        .map((segment) => ({
          connectionId: segment.connectionId,
          from: segment.from,
          to: segment.to,
          source: segment.source,
          savedSegment: segment.savedSegment,
        })),
    ).toEqual([
      {
        connectionId: 'connection-main-line',
        from: { x: 400, y: 131 },
        to: { x: 470, y: 131 },
        source: 'saved-segment',
        savedSegment: { x1: 400, y1: 131, x2: 470, y2: 131 },
      },
      {
        connectionId: 'connection-main-line',
        from: { x: 470, y: 131 },
        to: { x: 520, y: 156 },
        source: 'saved-segment',
        savedSegment: { x1: 470, y1: 131, x2: 520, y2: 156 },
      },
      {
        connectionId: 'connection-damaged-reference',
        from: { x: 141, y: 32 },
        to: { x: 180, y: 8 },
        source: 'saved-segment',
        savedSegment: { x1: 141, y1: 32, x2: 180, y2: 8 },
      },
    ])
  })

  it('calculates bounds from saved images, widgets, and connection segments', () => {
    const runtimeLayout = normalizeDashboardRuntimeLayout(dashboardVisualLayout)

    expect(runtimeLayout.diagramBounds).toEqual({
      minX: 40,
      minY: 8,
      maxX: 860,
      maxY: 388,
      width: 820,
      height: 380,
    })
  })

  it('derives connection geometry from saved connection point positions only when segments are absent', () => {
    const runtimeLayout = normalizeDashboardRuntimeLayout({
      ...dashboardVisualLayout,
      connections: [
        {
          id: 'connection-derived',
          fromPinId: 'pin-boiler-out',
          toPinId: 'pin-pump-in',
          userModified: false,
        },
      ],
    })

    expect(runtimeLayout.connectionRenderSegments).toEqual([
      {
        connectionId: 'connection-derived',
        from: { x: 400, y: 131 },
        to: { x: 520, y: 150 },
        source: 'connection-point',
      },
    ])
  })

  it('uses saved segment geometry when present and does not silently rebuild unsupported saved segments', () => {
    const pointListSegment = {
      points: [
        { x: 412, y: 80 },
        { x: 456, y: 120 },
      ],
      routeStyle: 'manual',
    }
    const unsupportedSegment = { routeId: 'saved-without-renderable-points' }
    const runtimeLayout = normalizeDashboardRuntimeLayout({
      ...dashboardVisualLayout,
      connections: [
        {
          id: 'connection-point-list-segment',
          fromPinId: 'pin-boiler-out',
          toPinId: 'pin-pump-in',
          segments: [pointListSegment],
          userModified: true,
        },
        {
          id: 'connection-unsupported-segment',
          fromPinId: 'pin-boiler-out',
          toPinId: 'pin-pump-in',
          segments: [unsupportedSegment],
          userModified: true,
        },
      ],
    })

    expect(runtimeLayout.connectionRenderSegments).toContainEqual({
      connectionId: 'connection-point-list-segment',
      from: { x: 412, y: 80 },
      to: { x: 456, y: 120 },
      source: 'saved-segment',
      savedSegment: pointListSegment,
    })
    expect(
      runtimeLayout.connectionRenderSegments.some(
        (segment) =>
          segment.connectionId === 'connection-unsupported-segment' &&
          segment.source === 'connection-point',
      ),
    ).toBe(false)
    expect(runtimeLayout.renderIssues).toContainEqual(
      expect.objectContaining({
        severity: 'recoverable',
        kind: 'unsupported-connection-segment',
        elementId: 'connection-unsupported-segment',
      }),
    )
  })

  it('reports recoverable and blocking render issues from damaged saved references', () => {
    const recoverableLayout = normalizeDashboardRuntimeLayout(dashboardVisualLayout)

    expect(recoverableLayout.hasRecoverableIssues).toBe(true)
    expect(recoverableLayout.renderIssues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'recoverable',
          kind: 'missing-connection-point',
          elementId: 'connection-damaged-reference',
        }),
        expect.objectContaining({
          severity: 'recoverable',
          kind: 'missing-widget-image',
          elementId: 'widget-damaged-image',
        }),
      ]),
    )

    const blockingLayout = normalizeDashboardRuntimeLayout({
      images: [
        {
          imageId: 'image-broken-data',
          base64: 'not-a-data-url',
          x: 0,
          y: 0,
          width: 20,
          height: 20,
        },
      ],
      connectionPoints: [],
      connections: [],
      widgets: [],
    })

    expect(blockingLayout.hasBlockingIssues).toBe(true)
    expect(blockingLayout.renderIssues).toContainEqual(
      expect.objectContaining({
        severity: 'blocking',
        kind: 'damaged-image-data',
        elementId: 'image-broken-data',
      }),
    )
  })
})
