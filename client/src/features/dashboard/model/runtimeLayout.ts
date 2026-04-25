import type {
  DashboardCanvasPoint,
  DashboardConnectionPoint,
  DashboardConnectionRenderSegment,
  DashboardDiagramBounds,
  DashboardLayoutDocument,
  DashboardRenderIssue,
  DashboardRuntimeLayout,
  DashboardSavedConnection,
  DashboardSavedConnectionSegment,
  DashboardSavedImage,
  DashboardWidget,
} from '@/features/dashboard/model/types'

const EMPTY_BOUNDS: DashboardDiagramBounds = {
  minX: 0,
  minY: 0,
  maxX: 0,
  maxY: 0,
  width: 0,
  height: 0,
}

type DashboardImageWithGeometry = DashboardSavedImage & {
  x: number
  y: number
  width: number
  height: number
}

type DashboardConnectionPointWithGeometry = DashboardConnectionPoint & {
  side: NonNullable<DashboardConnectionPoint['side']>
  offset: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function toArray<T>(value: T[] | undefined): T[] {
  return Array.isArray(value) ? value : []
}

function hasNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isSavedImage(value: unknown): value is DashboardSavedImage {
  return isRecord(value) && hasNonEmptyString(value.imageId)
}

function isConnectionPoint(value: unknown): value is DashboardConnectionPoint {
  return isRecord(value) && hasNonEmptyString(value.id) && hasNonEmptyString(value.imageId)
}

function isConnectionPointSide(value: unknown): value is DashboardConnectionPoint['side'] {
  return value === 'top' || value === 'right' || value === 'bottom' || value === 'left'
}

function isSavedConnection(value: unknown): value is DashboardSavedConnection {
  return (
    isRecord(value) &&
    hasNonEmptyString(value.id) &&
    hasNonEmptyString(value.fromPinId) &&
    hasNonEmptyString(value.toPinId)
  )
}

function isDashboardWidget(value: unknown): value is DashboardWidget {
  return isRecord(value) && hasNonEmptyString(value.id) && hasNonEmptyString(value.type)
}

function hasImageGeometry(image: DashboardSavedImage): image is DashboardImageWithGeometry {
  return (
    isFiniteNumber(image.x) &&
    isFiniteNumber(image.y) &&
    isFiniteNumber(image.width) &&
    isFiniteNumber(image.height)
  )
}

function hasConnectionPointGeometry(
  point: DashboardConnectionPoint,
): point is DashboardConnectionPointWithGeometry {
  return (
    isConnectionPointSide(point.side) &&
    isFiniteNumber(point.offset) &&
    point.offset >= 0 &&
    point.offset <= 1
  )
}

function hasWidgetGeometry(widget: DashboardWidget): boolean {
  return (
    isFiniteNumber(widget.x) &&
    isFiniteNumber(widget.y) &&
    isFiniteNumber(widget.width) &&
    isFiniteNumber(widget.height)
  )
}

function createIssue(
  severity: DashboardRenderIssue['severity'],
  kind: string,
  message: string,
  elementId: string | null,
): DashboardRenderIssue {
  return {
    severity,
    kind,
    message,
    elementId,
  }
}

function appendRectBounds(
  bounds: DashboardDiagramBounds | null,
  x: unknown,
  y: unknown,
  width: unknown,
  height: unknown,
): DashboardDiagramBounds | null {
  if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(width) || !isFiniteNumber(height)) {
    return bounds
  }

  const left = x
  const top = y
  const rectWidth = Math.max(0, width)
  const rectHeight = Math.max(0, height)
  const right = left + rectWidth
  const bottom = top + rectHeight

  if (!bounds) {
    return {
      minX: left,
      minY: top,
      maxX: right,
      maxY: bottom,
      width: right - left,
      height: bottom - top,
    }
  }

  const minX = Math.min(bounds.minX, left)
  const minY = Math.min(bounds.minY, top)
  const maxX = Math.max(bounds.maxX, right)
  const maxY = Math.max(bounds.maxY, bottom)

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  }
}

function appendPointBounds(
  bounds: DashboardDiagramBounds | null,
  point: DashboardCanvasPoint,
): DashboardDiagramBounds | null {
  return appendRectBounds(bounds, point.x, point.y, 0, 0)
}

function resolveImageWidth(image: DashboardSavedImage): number {
  const scaleX = isFiniteNumber(image.scaleX) ? image.scaleX : 1
  return isFiniteNumber(image.width) ? Math.max(0, image.width * scaleX) : 0
}

function resolveImageHeight(image: DashboardSavedImage): number {
  const scaleY = isFiniteNumber(image.scaleY) ? image.scaleY : 1
  return isFiniteNumber(image.height) ? Math.max(0, image.height * scaleY) : 0
}

function resolveConnectionPointPosition(
  point: DashboardConnectionPoint,
  imageById: Map<string, DashboardSavedImage>,
): DashboardCanvasPoint | null {
  const image = imageById.get(point.imageId)
  if (!image) {
    return null
  }

  if (!hasImageGeometry(image) || !hasConnectionPointGeometry(point)) {
    return null
  }

  const x = image.x
  const y = image.y
  const width = resolveImageWidth(image)
  const height = resolveImageHeight(image)
  const offset = point.offset

  switch (point.side) {
    case 'top':
      return { x: x + width * offset, y }
    case 'right':
      return { x: x + width, y: y + height * offset }
    case 'bottom':
      return { x: x + width * offset, y: y + height }
    case 'left':
      return { x, y: y + height * offset }
    default:
      return null
  }
}

function isCanvasPoint(value: unknown): value is DashboardCanvasPoint {
  return isRecord(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y)
}

function resolveSegmentEndpointPair(
  segment: DashboardSavedConnectionSegment,
): { from: DashboardCanvasPoint; to: DashboardCanvasPoint } | null {
  if (
    isFiniteNumber(segment.x1) &&
    isFiniteNumber(segment.y1) &&
    isFiniteNumber(segment.x2) &&
    isFiniteNumber(segment.y2)
  ) {
    return {
      from: { x: segment.x1, y: segment.y1 },
      to: { x: segment.x2, y: segment.y2 },
    }
  }

  if (isCanvasPoint(segment.start) && isCanvasPoint(segment.end)) {
    return {
      from: segment.start,
      to: segment.end,
    }
  }

  if (isCanvasPoint(segment.from) && isCanvasPoint(segment.to)) {
    return {
      from: segment.from,
      to: segment.to,
    }
  }

  if (Array.isArray(segment.points) && segment.points.length >= 2) {
    const firstPoint = segment.points[0]
    const lastPoint = segment.points[segment.points.length - 1]

    if (isCanvasPoint(firstPoint) && isCanvasPoint(lastPoint)) {
      return {
        from: firstPoint,
        to: lastPoint,
      }
    }
  }

  return null
}

function selectSavedSegmentResult(
  connection: DashboardSavedConnection,
): { renderSegments: DashboardConnectionRenderSegment[]; issues: DashboardRenderIssue[] } {
  const renderSegments: DashboardConnectionRenderSegment[] = []
  const issues: DashboardRenderIssue[] = []

  for (const segment of toArray(connection.segments)) {
    const endpointPair = resolveSegmentEndpointPair(segment)

    if (!endpointPair) {
      issues.push(
        createIssue(
          'recoverable',
          'unsupported-connection-segment',
          'Saved connection segment geometry is incomplete or unsupported.',
          connection.id,
        ),
      )
      continue
    }

    renderSegments.push({
      connectionId: connection.id,
      from: endpointPair.from,
      to: endpointPair.to,
      source: 'saved-segment',
      savedSegment: segment,
    })
  }

  return { renderSegments, issues }
}

function deriveConnectionPointSegment(
  connection: DashboardSavedConnection,
  pointById: Map<string, DashboardConnectionPoint>,
  imageById: Map<string, DashboardSavedImage>,
): DashboardConnectionRenderSegment | null {
  const fromPoint = pointById.get(connection.fromPinId)
  const toPoint = pointById.get(connection.toPinId)

  if (!fromPoint || !toPoint) {
    return null
  }

  const fromPosition = resolveConnectionPointPosition(fromPoint, imageById)
  const toPosition = resolveConnectionPointPosition(toPoint, imageById)

  if (!fromPosition || !toPosition) {
    return null
  }

  return {
    connectionId: connection.id,
    from: fromPosition,
    to: toPosition,
    source: 'connection-point',
  }
}

function buildConnectionRenderSegments(
  connections: DashboardSavedConnection[],
  pointById: Map<string, DashboardConnectionPoint>,
  imageById: Map<string, DashboardSavedImage>,
): { renderSegments: DashboardConnectionRenderSegment[]; issues: DashboardRenderIssue[] } {
  const renderSegments: DashboardConnectionRenderSegment[] = []
  const issues: DashboardRenderIssue[] = []

  for (const connection of connections) {
    if (toArray(connection.segments).length > 0) {
      const savedSegmentResult = selectSavedSegmentResult(connection)
      renderSegments.push(...savedSegmentResult.renderSegments)
      issues.push(...savedSegmentResult.issues)
      continue
    }

    const derivedSegment = deriveConnectionPointSegment(connection, pointById, imageById)
    if (derivedSegment) {
      renderSegments.push(derivedSegment)
    }
  }

  return { renderSegments, issues }
}

function buildRenderIssues(
  images: DashboardSavedImage[],
  connectionPoints: DashboardConnectionPoint[],
  connections: DashboardSavedConnection[],
  widgets: DashboardWidget[],
  imageById: Map<string, DashboardSavedImage>,
  pointById: Map<string, DashboardConnectionPoint>,
): DashboardRenderIssue[] {
  const issues: DashboardRenderIssue[] = []

  if (images.length === 0 && widgets.length === 0 && connections.length === 0) {
    issues.push(
      createIssue(
        'blocking',
        'missing-visual-layout',
        'Saved diagram has no visual elements for Dashboard rendering.',
        null,
      ),
    )
  }

  for (const image of images) {
    if (!hasImageGeometry(image)) {
      issues.push(
        createIssue(
          'recoverable',
          'incomplete-image-geometry',
          'Saved image geometry is incomplete and cannot be rendered safely.',
          image.imageId,
        ),
      )
    }

    if (!hasNonEmptyString(image.base64) || !image.base64.trim().startsWith('data:image/')) {
      issues.push(
        createIssue(
          'blocking',
          'damaged-image-data',
          'Saved image data is missing or damaged.',
          image.imageId,
        ),
      )
    }
  }

  for (const point of connectionPoints) {
    if (!hasConnectionPointGeometry(point)) {
      issues.push(
        createIssue(
          'recoverable',
          'incomplete-connection-point-geometry',
          'Connection point saved geometry is incomplete and cannot be rendered safely.',
          point.id,
        ),
      )
    }

    if (!imageById.has(point.imageId)) {
      issues.push(
        createIssue(
          'recoverable',
          'missing-point-image',
          'Connection point references a missing saved image.',
          point.id,
        ),
      )
    }
  }

  for (const connection of connections) {
    if (!pointById.has(connection.fromPinId) || !pointById.has(connection.toPinId)) {
      issues.push(
        createIssue(
          'recoverable',
          'missing-connection-point',
          'Connection references a missing saved connection point.',
          connection.id,
        ),
      )
    }
  }

  for (const widget of widgets) {
    if (!hasWidgetGeometry(widget)) {
      issues.push(
        createIssue(
          'recoverable',
          'incomplete-widget-geometry',
          'Widget saved geometry is incomplete and cannot be rendered safely.',
          widget.id,
        ),
      )
    }

    if (hasNonEmptyString(widget.imageId) && !imageById.has(widget.imageId)) {
      issues.push(
        createIssue(
          'recoverable',
          'missing-widget-image',
          'Widget references a missing saved image.',
          widget.id,
        ),
      )
    }
  }

  return issues
}

function calculateDiagramBounds(
  images: DashboardSavedImage[],
  widgets: DashboardWidget[],
  connectionRenderSegments: DashboardConnectionRenderSegment[],
): DashboardDiagramBounds {
  let bounds: DashboardDiagramBounds | null = null

  for (const image of images) {
    bounds = appendRectBounds(
      bounds,
      image.x,
      image.y,
      resolveImageWidth(image),
      resolveImageHeight(image),
    )
  }

  for (const widget of widgets) {
    bounds = appendRectBounds(bounds, widget.x, widget.y, widget.width, widget.height)
  }

  for (const segment of connectionRenderSegments) {
    bounds = appendPointBounds(bounds, segment.from)
    bounds = appendPointBounds(bounds, segment.to)
  }

  return bounds ?? EMPTY_BOUNDS
}

export function normalizeDashboardRuntimeLayout(
  layout: DashboardLayoutDocument | null | undefined,
): DashboardRuntimeLayout {
  const images = toArray(layout?.images).filter(isSavedImage)
  const connectionPoints = toArray(layout?.connectionPoints).filter(isConnectionPoint)
  const connections = toArray(layout?.connections).filter(isSavedConnection)
  const widgets = toArray(layout?.widgets).filter(isDashboardWidget)
  const imageById = new Map(images.map((image) => [image.imageId, image]))
  const runtimeRenderableImages = images.filter(hasImageGeometry)
  const runtimeRenderableImageById = new Map(runtimeRenderableImages.map((image) => [image.imageId, image]))
  const pointById = new Map(connectionPoints.map((point) => [point.id, point]))
  const runtimeRenderableConnectionPoints = connectionPoints.filter(hasConnectionPointGeometry)
  const runtimeRenderablePointById = new Map(
    runtimeRenderableConnectionPoints.map((point) => [point.id, point]),
  )
  const widgetById = new Map(widgets.map((widget) => [widget.id, widget]))
  const widgetIds = new Set(widgets.map((widget) => widget.id))
  const runtimeRenderableWidgets = widgets.filter(hasWidgetGeometry)
  const connectionSegmentResult = buildConnectionRenderSegments(
    connections,
    runtimeRenderablePointById,
    runtimeRenderableImageById,
  )
  const renderIssues = [
    ...buildRenderIssues(
      images,
      connectionPoints,
      connections,
      widgets,
      imageById,
      pointById,
    ),
    ...connectionSegmentResult.issues,
  ]

  return {
    images,
    runtimeRenderableImages,
    connectionPoints,
    runtimeRenderableConnectionPoints,
    connections,
    widgets,
    imageById,
    runtimeRenderableImageById,
    pointById,
    runtimeRenderablePointById,
    widgetById,
    widgetIds,
    runtimeRenderableWidgets,
    connectionRenderSegments: connectionSegmentResult.renderSegments,
    diagramBounds: calculateDiagramBounds(
      runtimeRenderableImages,
      runtimeRenderableWidgets,
      connectionSegmentResult.renderSegments,
    ),
    renderIssues,
    hasBlockingIssues: renderIssues.some((issue) => issue.severity === 'blocking'),
    hasRecoverableIssues: renderIssues.some((issue) => issue.severity === 'recoverable'),
  }
}
