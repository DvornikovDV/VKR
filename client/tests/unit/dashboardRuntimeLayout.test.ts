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
      'toggle',
      'slider',
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
      runtimeRenderableImages: images,
      connectionPoints,
      runtimeRenderableConnectionPoints: connectionPoints,
      connections,
      widgets,
      imageById: new Map(images.map((image) => [image.imageId, image])),
      runtimeRenderableImageById: new Map(images.map((image) => [image.imageId, image])),
      pointById: new Map(connectionPoints.map((point) => [point.id, point])),
      runtimeRenderablePointById: new Map(connectionPoints.map((point) => [point.id, point])),
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
    expect(runtimeLayout.runtimeRenderableImages).toEqual(visualImages)
    expect(runtimeLayout.connectionPoints).toEqual(dashboardVisualLayout.connectionPoints)
    expect(runtimeLayout.runtimeRenderableConnectionPoints).toEqual(dashboardVisualLayout.connectionPoints)
    expect(runtimeLayout.connections).toEqual(visualConnections)
    expect(runtimeLayout.widgets).toEqual(visualWidgets)

    expect(runtimeLayout.imageById.get('image-pump')).toBe(visualImages[1])
    expect(runtimeLayout.runtimeRenderableImageById.get('image-pump')).toBe(visualImages[1])
    expect(runtimeLayout.pointById.get('pin-boiler-out')).toEqual(
      expect.objectContaining({ imageId: 'image-boiler', side: 'right', offset: 0.45 }),
    )
    expect(runtimeLayout.runtimeRenderablePointById.get('pin-boiler-out')).toEqual(
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
      { start: { x: 400, y: 131 }, end: { x: 470, y: 131 }, direction: 'horizontal', index: 0 },
      { start: { x: 470, y: 131 }, end: { x: 520, y: 156 }, direction: 'diagonal', index: 1 },
    ])
    expect(
      runtimeLayout.connectionRenderSegments
        .filter((segment) => segment.source === 'saved-segment')
        .map((segment) => ({
          connectionId: segment.connectionId,
          from: segment.from,
          to: segment.to,
          source: segment.source,
        })),
    ).toEqual([
      {
        connectionId: 'connection-main-line',
        from: { x: 400, y: 131 },
        to: { x: 470, y: 131 },
        source: 'saved-segment',
      },
      {
        connectionId: 'connection-main-line',
        from: { x: 470, y: 131 },
        to: { x: 520, y: 156 },
        source: 'saved-segment',
      },
      {
        connectionId: 'connection-damaged-reference',
        from: { x: 141, y: 32 },
        to: { x: 180, y: 8 },
        source: 'saved-segment',
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

  it('reports incomplete widget geometry and keeps the damaged widget out of renderable widgets', () => {
    const runtimeLayout = normalizeDashboardRuntimeLayout({
      ...dashboardVisualLayout,
      widgets: [
        ...(dashboardVisualLayout.widgets ?? []),
        {
          id: 'widget-incomplete-geometry',
          type: 'number-display',
          imageId: 'image-boiler',
          width: 100,
          height: 48,
        },
      ],
    })

    expect(runtimeLayout.widgets.map((widget) => widget.id)).toContain('widget-incomplete-geometry')
    expect(runtimeLayout.runtimeRenderableWidgets.map((widget) => widget.id)).not.toContain(
      'widget-incomplete-geometry',
    )
    expect(runtimeLayout.diagramBounds).toEqual({
      minX: 40,
      minY: 8,
      maxX: 860,
      maxY: 388,
      width: 820,
      height: 380,
    })
    expect(runtimeLayout.renderIssues).toContainEqual(
      expect.objectContaining({
        severity: 'recoverable',
        kind: 'incomplete-widget-geometry',
        elementId: 'widget-incomplete-geometry',
      }),
    )
  })

  it('reports incomplete image geometry and keeps the damaged image out of renderable image paths', () => {
    const runtimeLayout = normalizeDashboardRuntimeLayout({
      ...dashboardVisualLayout,
      images: [
        ...(dashboardVisualLayout.images ?? []),
        {
          imageId: 'image-incomplete-geometry',
          base64: dashboardVisualLayout.images?.[0]?.base64,
          y: -120,
          width: 240,
          height: 80,
        },
      ],
      connectionPoints: [
        ...(dashboardVisualLayout.connectionPoints ?? []),
        {
          id: 'pin-incomplete-image',
          imageId: 'image-incomplete-geometry',
          side: 'right',
          offset: 0.5,
        },
      ],
      connections: [
        ...(dashboardVisualLayout.connections ?? []),
        {
          id: 'connection-incomplete-image-derived',
          fromPinId: 'pin-incomplete-image',
          toPinId: 'pin-pump-in',
          userModified: false,
        },
      ],
    })

    expect(runtimeLayout.images.map((image) => image.imageId)).toContain('image-incomplete-geometry')
    expect(runtimeLayout.imageById.has('image-incomplete-geometry')).toBe(true)
    expect(runtimeLayout.runtimeRenderableImages.map((image) => image.imageId)).not.toContain(
      'image-incomplete-geometry',
    )
    expect(runtimeLayout.runtimeRenderableImageById.has('image-incomplete-geometry')).toBe(false)
    expect(
      runtimeLayout.connectionRenderSegments.some(
        (segment) => segment.connectionId === 'connection-incomplete-image-derived',
      ),
    ).toBe(false)
    expect(runtimeLayout.diagramBounds).toEqual({
      minX: 40,
      minY: 8,
      maxX: 860,
      maxY: 388,
      width: 820,
      height: 380,
    })
    expect(runtimeLayout.renderIssues).toContainEqual(
      expect.objectContaining({
        severity: 'recoverable',
        kind: 'incomplete-image-geometry',
        elementId: 'image-incomplete-geometry',
      }),
    )
  })

  it('reports incomplete connection point geometry without deriving invented point positions', () => {
    const runtimeLayout = normalizeDashboardRuntimeLayout({
      ...dashboardVisualLayout,
      connectionPoints: [
        ...(dashboardVisualLayout.connectionPoints ?? []),
        {
          id: 'pin-incomplete-geometry',
          imageId: 'image-boiler',
        },
      ],
      connections: [
        ...(dashboardVisualLayout.connections ?? []),
        {
          id: 'connection-incomplete-point-derived',
          fromPinId: 'pin-incomplete-geometry',
          toPinId: 'pin-pump-in',
          userModified: false,
        },
      ],
    })

    expect(runtimeLayout.connectionPoints.map((point) => point.id)).toContain('pin-incomplete-geometry')
    expect(runtimeLayout.pointById.has('pin-incomplete-geometry')).toBe(true)
    expect(runtimeLayout.runtimeRenderableConnectionPoints.map((point) => point.id)).not.toContain(
      'pin-incomplete-geometry',
    )
    expect(runtimeLayout.runtimeRenderablePointById.has('pin-incomplete-geometry')).toBe(false)
    expect(
      runtimeLayout.connectionRenderSegments.some(
        (segment) => segment.connectionId === 'connection-incomplete-point-derived',
      ),
    ).toBe(false)
    expect(runtimeLayout.renderIssues).toContainEqual(
      expect.objectContaining({
        severity: 'recoverable',
        kind: 'incomplete-connection-point-geometry',
        elementId: 'pin-incomplete-geometry',
      }),
    )
  })
})

describe('constructor-format start/end segment parsing (T060)', () => {
  it('segments with start/end produce valid render segments without unsupported-connection-segment issues', () => {
    const runtimeLayout = normalizeDashboardRuntimeLayout({
      ...dashboardVisualLayout,
      connections: [
        {
          id: 'connection-constructor-format',
          fromPinId: 'pin-boiler-out',
          toPinId: 'pin-pump-in',
          segments: [
            { start: { x: 400, y: 131 }, end: { x: 520, y: 156 }, direction: 'auto', index: 0 },
          ],
          userModified: true,
        },
      ],
    })

    const renderSegments = runtimeLayout.connectionRenderSegments.filter(
      (s) => s.connectionId === 'connection-constructor-format',
    )
    expect(renderSegments).toHaveLength(1)
    expect(renderSegments[0]).toMatchObject({
      connectionId: 'connection-constructor-format',
      from: { x: 400, y: 131 },
      to: { x: 520, y: 156 },
      source: 'saved-segment',
    })

    const segmentIssues = runtimeLayout.renderIssues.filter(
      (issue) =>
        issue.kind === 'unsupported-connection-segment' &&
        issue.elementId === 'connection-constructor-format',
    )
    expect(segmentIssues).toHaveLength(0)
  })

  it('fixture connections use constructor start/end format and render without segment issues', () => {
    const runtimeLayout = normalizeDashboardRuntimeLayout(dashboardVisualLayout)

    const mainLineSegments = runtimeLayout.connectionRenderSegments.filter(
      (s) => s.connectionId === 'connection-main-line',
    )
    expect(mainLineSegments).toHaveLength(2)
    expect(mainLineSegments[0]).toMatchObject({ from: { x: 400, y: 131 }, to: { x: 470, y: 131 }, source: 'saved-segment' })
    expect(mainLineSegments[1]).toMatchObject({ from: { x: 470, y: 131 }, to: { x: 520, y: 156 }, source: 'saved-segment' })

    const segmentIssues = runtimeLayout.renderIssues.filter(
      (issue) => issue.kind === 'unsupported-connection-segment',
    )
    expect(segmentIssues).toHaveLength(0)
  })
})
