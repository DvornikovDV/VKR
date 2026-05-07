import { useEffect, useMemo, useState } from 'react'
import { Circle, Group, Image as KonvaImage, Layer, Line, Rect, Stage, Text } from 'react-konva'
import type {
  DashboardCanvasPoint,
  DashboardConnectionPoint,
  DashboardDiagramBounds,
  DashboardRuntimeProjection,
  DashboardRuntimeLayout,
  DashboardSavedImage,
  DashboardWidget,
} from '@/features/dashboard/model/types'
import type {
  DashboardViewportPanInput,
  DashboardViewportSize,
  DashboardViewportState,
} from '@/features/dashboard/model/viewport'

interface DashboardVisualSurfaceProps {
  runtimeLayout: DashboardRuntimeLayout
  runtimeProjection: DashboardRuntimeProjection | null
  viewport: DashboardViewportState
  viewportSize: DashboardViewportSize
  onPanViewport: (pan: DashboardViewportPanInput) => void
  onZoomAtCursor?: (anchor: DashboardCanvasPoint, factor: number) => void
}

type KonvaDragEvent = {
  target: {
    x: () => number
    y: () => number
  }
}

type KonvaWheelEvent = {
  evt: WheelEvent
  target: {
    getStage: () => { getPointerPosition: () => { x: number; y: number } | null } | null
  }
}

const GRID_STEP = 40
const MIN_WORKSPACE_PADDING = 480
const WORKSPACE_VIEWPORT_PADDING_FACTOR = 2
const CONNECTION_POINT_RADIUS = 5
const WORKSPACE_BACKGROUND = '#eaf4ff'
const WORKSPACE_GRID_LINE = '#cfe0f2'

function toFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function resolveImageWidth(image: DashboardSavedImage): number {
  return Math.max(0, toFiniteNumber(image.width, 0) * toFiniteNumber(image.scaleX, 1))
}

function resolveImageHeight(image: DashboardSavedImage): number {
  return Math.max(0, toFiniteNumber(image.height, 0) * toFiniteNumber(image.scaleY, 1))
}

function resolveWidgetWidth(widget: DashboardWidget): number {
  return Math.max(0, toFiniteNumber(widget.width, 0))
}

function resolveWidgetHeight(widget: DashboardWidget): number {
  return Math.max(0, toFiniteNumber(widget.height, 0))
}

function selectWidgetCaption(widget: DashboardWidget): string {
  if (typeof widget.label === 'string' && widget.label.trim().length > 0) {
    return widget.label.trim()
  }

  if (typeof widget.text === 'string' && widget.text.trim().length > 0) {
    return widget.text.trim()
  }

  return widget.id
}

function isConnectionPointOffset(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
}

function resolveConnectionPointPosition(
  point: DashboardConnectionPoint,
  image: DashboardSavedImage,
): DashboardCanvasPoint | null {
  if (!isConnectionPointOffset(point.offset)) {
    return null
  }

  const x = toFiniteNumber(image.x, 0)
  const y = toFiniteNumber(image.y, 0)
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

function createGridLinePositions(start: number, end: number): number[] {
  const first = Math.floor(start / GRID_STEP) * GRID_STEP
  const positions: number[] = []

  for (let position = first; position <= end; position += GRID_STEP) {
    positions.push(position)
  }

  return positions
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function resolveWorkspacePadding(viewport: DashboardViewportState, viewportSize: DashboardViewportSize): number {
  const safeScale = Math.max(0.01, viewport.scale)
  const visibleWorldSize = Math.max(viewportSize.width, viewportSize.height) / safeScale

  return Math.max(MIN_WORKSPACE_PADDING, visibleWorldSize * WORKSPACE_VIEWPORT_PADDING_FACTOR)
}

function resolveBoundedViewportOffset(
  requestedOffset: DashboardCanvasPoint,
  gridBounds: DashboardDiagramBounds,
  viewport: DashboardViewportState,
  viewportSize: DashboardViewportSize,
): DashboardCanvasPoint {
  const scale = Math.max(0.01, viewport.scale)
  const workspaceWidth = (gridBounds.maxX - gridBounds.minX) * scale
  const workspaceHeight = (gridBounds.maxY - gridBounds.minY) * scale

  const centerX = (viewportSize.width - workspaceWidth) / 2 - gridBounds.minX * scale
  const centerY = (viewportSize.height - workspaceHeight) / 2 - gridBounds.minY * scale

  const minX = viewportSize.width - gridBounds.maxX * scale
  const maxX = -gridBounds.minX * scale
  const minY = viewportSize.height - gridBounds.maxY * scale
  const maxY = -gridBounds.minY * scale

  return {
    x: workspaceWidth <= viewportSize.width ? centerX : clamp(requestedOffset.x, minX, maxX),
    y: workspaceHeight <= viewportSize.height ? centerY : clamp(requestedOffset.y, minY, maxY),
  }
}

function formatRenderIssueSummary(runtimeLayout: DashboardRuntimeLayout): string | null {
  if (runtimeLayout.renderIssues.length === 0) {
    return null
  }

  const blockingCount = runtimeLayout.renderIssues.filter((issue) => issue.severity === 'blocking').length
  const recoverableCount = runtimeLayout.renderIssues.length - blockingCount
  const parts = [
    blockingCount > 0 ? `${blockingCount} blocking` : null,
    recoverableCount > 0 ? `${recoverableCount} recoverable` : null,
  ].filter(Boolean)

  return `Visual rendering issues: ${parts.join(', ')}`
}

function resolveLedRadius(widget: DashboardWidget, width: number, height: number): number {
  const savedRadius = toFiniteNumber(widget.radius, 0)
  if (savedRadius > 0) {
    return savedRadius
  }

  return Math.max(6, Math.min(width, height) / 2)
}

function resolveSliderBounds(widget: DashboardWidget): { min: number; max: number } {
  const min = toFiniteNumber(widget.min, 0)
  const max = toFiniteNumber(widget.max, 100)

  return max > min ? { min, max } : { min: 0, max: 100 }
}

function useImageElementsById(images: DashboardSavedImage[]): Map<string, HTMLImageElement> {
  const [imageElementsById, setImageElementsById] = useState<Map<string, HTMLImageElement>>(new Map())

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    let isMounted = true
    const loadedImages = new Map<string, HTMLImageElement>()

    for (const image of images) {
      if (typeof image.base64 !== 'string' || image.base64.trim().length === 0) {
        continue
      }

      const imageElement = new window.Image()
      imageElement.onload = () => {
        if (!isMounted) {
          return
        }

        loadedImages.set(image.imageId, imageElement)
        setImageElementsById(new Map(loadedImages))
      }
      imageElement.src = image.base64
    }

    setImageElementsById(new Map(loadedImages))

    return () => {
      isMounted = false
    }
  }, [images])

  return imageElementsById
}

export function DashboardVisualSurface({
  runtimeLayout,
  runtimeProjection,
  viewport,
  viewportSize,
  onPanViewport,
  onZoomAtCursor,
}: DashboardVisualSurfaceProps) {
  const imageElementsById = useImageElementsById(runtimeLayout.runtimeRenderableImages)
  const renderIssueSummary = formatRenderIssueSummary(runtimeLayout)
  const gridBounds = useMemo(
    () => {
      const workspacePadding = resolveWorkspacePadding(viewport, viewportSize)

      return {
        minX: runtimeLayout.diagramBounds.minX - workspacePadding,
        minY: runtimeLayout.diagramBounds.minY - workspacePadding,
        maxX: runtimeLayout.diagramBounds.maxX + workspacePadding,
        maxY: runtimeLayout.diagramBounds.maxY + workspacePadding,
        width: runtimeLayout.diagramBounds.width + workspacePadding * 2,
        height: runtimeLayout.diagramBounds.height + workspacePadding * 2,
      }
    },
    [runtimeLayout.diagramBounds, viewport, viewportSize],
  )
  const verticalGridLines = useMemo(
    () => createGridLinePositions(gridBounds.minX, gridBounds.maxX),
    [gridBounds.maxX, gridBounds.minX],
  )
  const horizontalGridLines = useMemo(
    () => createGridLinePositions(gridBounds.minY, gridBounds.maxY),
    [gridBounds.maxY, gridBounds.minY],
  )
  const widgetProjectionById = useMemo(
    () => new Map((runtimeProjection?.widgets ?? []).map((widget) => [widget.widgetId, widget])),
    [runtimeProjection],
  )

  return (
    <div
      data-testid="dashboard-visual-surface"
      className="absolute inset-0 overflow-hidden rounded-md border border-[#cbd5e1] bg-[#eaf4ff]"
    >
      <Stage
        data-testid="dashboard-visual-stage"
        width={viewportSize.width}
        height={viewportSize.height}
        className="block"
        onWheel={(e: KonvaWheelEvent) => {
          if (!onZoomAtCursor) return
          e.evt.preventDefault()
          const stage = e.target.getStage()
          const pointer = stage?.getPointerPosition()
          if (!pointer) return
          const factor = e.evt.deltaY > 0 ? 0.9 : 1.1
          onZoomAtCursor({ x: pointer.x, y: pointer.y }, factor)
        }}
      >
        <Layer data-testid="dashboard-visual-grid-layer">
          <Rect
            x={0}
            y={0}
            width={viewportSize.width}
            height={viewportSize.height}
            fill={WORKSPACE_BACKGROUND}
            listening={false}
          />
          <Group
            data-testid="dashboard-visual-workspace"
            x={viewport.offsetX}
            y={viewport.offsetY}
            scaleX={viewport.scale}
            scaleY={viewport.scale}
            draggable
            dragBoundFunc={(position) =>
              resolveBoundedViewportOffset(position, gridBounds, viewport, viewportSize)
            }
            onDragEnd={(event: KonvaDragEvent) =>
              onPanViewport({
                deltaX: event.target.x() - viewport.offsetX,
                deltaY: event.target.y() - viewport.offsetY,
              })
            }
          >
            <Rect
              data-testid="dashboard-visual-drag-hit-area"
              x={gridBounds.minX}
              y={gridBounds.minY}
              width={gridBounds.maxX - gridBounds.minX}
              height={gridBounds.maxY - gridBounds.minY}
              fill="#ffffff"
              opacity={0.01}
              listening={true}
            />
            {verticalGridLines.map((x) => (
              <Line
                key={`grid-x-${x}`}
                points={[x, gridBounds.minY, x, gridBounds.maxY]}
                stroke={WORKSPACE_GRID_LINE}
                strokeWidth={1}
                listening={false}
              />
            ))}
            {horizontalGridLines.map((y) => (
              <Line
                key={`grid-y-${y}`}
                points={[gridBounds.minX, y, gridBounds.maxX, y]}
                stroke={WORKSPACE_GRID_LINE}
                strokeWidth={1}
                listening={false}
              />
            ))}

            {runtimeLayout.runtimeRenderableImages.map((image) => (
              <Group key={image.imageId}>
                <Rect
                  x={toFiniteNumber(image.x, 0)}
                  y={toFiniteNumber(image.y, 0)}
                  width={resolveImageWidth(image)}
                  height={resolveImageHeight(image)}
                  stroke="#000000"
                  strokeWidth={2}
                  listening={false}
                />
                <KonvaImage
                  data-testid={`dashboard-visual-image-${image.imageId}`}
                  image={imageElementsById.get(image.imageId)}
                  x={toFiniteNumber(image.x, 0)}
                  y={toFiniteNumber(image.y, 0)}
                  width={resolveImageWidth(image)}
                  height={resolveImageHeight(image)}
                  opacity={0.95}
                  listening={false}
                />
              </Group>
            ))}

            {runtimeLayout.connectionRenderSegments.map((segment, index) => (
              <Line
                key={`${segment.connectionId}-${index}`}
                data-testid={`dashboard-visual-connection-${segment.connectionId}-${index}`}
                data-source={segment.source}
                points={[segment.from.x, segment.from.y, segment.to.x, segment.to.y]}
                stroke="#1e293b"
                strokeWidth={4}
                lineCap="round"
                lineJoin="round"
                listening={false}
              />
            ))}

            {runtimeLayout.runtimeRenderableConnectionPoints.map((point) => {
              const image = runtimeLayout.runtimeRenderableImageById.get(point.imageId)
              if (!image) {
                return null
              }

              const position = resolveConnectionPointPosition(point, image)
              if (!position) {
                return null
              }

              return (
                <Circle
                  key={point.id}
                  data-testid={`dashboard-visual-point-${point.id}`}
                  x={position.x}
                  y={position.y}
                  radius={CONNECTION_POINT_RADIUS}
                  fill="#000000"
                  stroke="#ffffff"
                  strokeWidth={1}
                  listening={false}
                />
              )
            })}

            {runtimeLayout.runtimeRenderableWidgets.map((widget) => {
              const width = resolveWidgetWidth(widget)
              const height = resolveWidgetHeight(widget)
              const x = toFiniteNumber(widget.x, 0)
              const y = toFiniteNumber(widget.y, 0)
              const fill = typeof widget.backgroundColor === 'string' ? widget.backgroundColor : '#0f172a'
              const stroke = typeof widget.borderColor === 'string' ? widget.borderColor : '#475569'
              const textFill = typeof widget.color === 'string' ? widget.color : '#f8fafc'
              const fontSize = Math.max(10, toFiniteNumber(widget.fontSize, 13))
              const widgetProjection = widgetProjectionById.get(widget.id)
              const actualValue = widgetProjection?.value ?? null
              const actualText = widgetProjection ? widgetProjection.visualValue : 'Pending'
              const isVisualValueWidget = widget.type === 'number-display' || widget.type === 'text-display'
              const isToggleWidget = widget.type === 'toggle'
              const isSliderWidget = widget.type === 'slider'
              const isRuntimeValueWidget = isVisualValueWidget || isToggleWidget || isSliderWidget
              const widgetText = isVisualValueWidget && widgetProjection ? widgetProjection.visualValue : widget.id
              const isLedWidget = widget.type === 'led'
              const isUnsupportedVisualWidget = !isLedWidget && !isRuntimeValueWidget
              const widgetCaption = selectWidgetCaption(widget)
              const readOnlyTextY = y + Math.max(20, height / 2)
              const isToggleOn = actualValue === true
              const ledOn = actualValue === true
              const sliderBounds = resolveSliderBounds(widget)
              const sliderValue = typeof actualValue === 'number' ? actualValue : null
              const sliderRatio =
                sliderValue === null
                  ? 0
                  : clamp((sliderValue - sliderBounds.min) / (sliderBounds.max - sliderBounds.min), 0, 1)
              const sliderTrackWidth = Math.max(0, width - 24)
              const sliderTrackX = x + 12
              const sliderTrackY = y + Math.max(18, height / 2)

              return (
                <Group key={widget.id} data-testid={`dashboard-visual-widget-${widget.id}`} listening={false}>
                  {isLedWidget ? (
                    <>
                      <Circle
                        data-testid={`dashboard-visual-led-indicator-${widget.id}`}
                        x={x + width / 2}
                        y={y + height / 2}
                        radius={resolveLedRadius(widget, width, height)}
                        fill={
                          ledOn
                            ? (typeof widget.colorOn === 'string' ? widget.colorOn : '#22c55e')
                            : (typeof widget.colorOff === 'string' ? widget.colorOff : '#64748b')
                        }
                        stroke={typeof widget.colorOn === 'string' ? widget.colorOn : '#cbd5e1'}
                        strokeWidth={2}
                        listening={false}
                      />
                      <Text
                        data-testid={`dashboard-visual-widget-value-${widget.id}`}
                        x={x - width / 2}
                        y={y + height + 6}
                        width={width * 2}
                        align="center"
                        text={actualText}
                        fontSize={12}
                        fill="#475569"
                        listening={false}
                      />
                    </>
                  ) : isToggleWidget ? (
                    <>
                      <Rect
                        data-testid={`dashboard-visual-widget-shell-${widget.id}`}
                        x={x}
                        y={y}
                        width={width}
                        height={height}
                        cornerRadius={4}
                        fill="#0f172a"
                        stroke={isToggleOn ? '#22c55e' : '#64748b'}
                        strokeWidth={2}
                        listening={false}
                      />
                      <Rect
                        data-testid={`dashboard-visual-toggle-track-${widget.id}`}
                        x={x + 8}
                        y={y + Math.max(6, (height - 20) / 2)}
                        width={46}
                        height={20}
                        cornerRadius={10}
                        fill={isToggleOn ? '#16a34a' : '#475569'}
                        listening={false}
                      />
                      <Circle
                        data-testid={`dashboard-visual-toggle-knob-${widget.id}`}
                        x={x + (isToggleOn ? 44 : 18)}
                        y={y + Math.max(16, height / 2)}
                        radius={8}
                        fill="#f8fafc"
                        listening={false}
                      />
                      <Text
                        data-testid={`dashboard-visual-widget-value-${widget.id}`}
                        x={x + 62}
                        y={y + Math.max(6, (height - fontSize) / 2)}
                        width={Math.max(0, width - 70)}
                        height={Math.max(0, height - 8)}
                        text={actualText}
                        fontSize={Math.min(fontSize, 14)}
                        fill="#e2e8f0"
                        listening={false}
                      />
                    </>
                  ) : isSliderWidget ? (
                    <>
                      <Rect
                        data-testid={`dashboard-visual-widget-shell-${widget.id}`}
                        x={x}
                        y={y}
                        width={width}
                        height={height}
                        cornerRadius={4}
                        fill="#0f172a"
                        stroke="#38bdf8"
                        strokeWidth={2}
                        listening={false}
                      />
                      <Rect
                        data-testid={`dashboard-visual-slider-track-${widget.id}`}
                        x={sliderTrackX}
                        y={sliderTrackY}
                        width={sliderTrackWidth}
                        height={6}
                        cornerRadius={3}
                        fill="#334155"
                        listening={false}
                      />
                      <Rect
                        data-testid={`dashboard-visual-slider-fill-${widget.id}`}
                        x={sliderTrackX}
                        y={sliderTrackY}
                        width={sliderTrackWidth * sliderRatio}
                        height={6}
                        cornerRadius={3}
                        fill="#38bdf8"
                        listening={false}
                      />
                      <Circle
                        data-testid={`dashboard-visual-slider-knob-${widget.id}`}
                        x={sliderTrackX + sliderTrackWidth * sliderRatio}
                        y={sliderTrackY + 3}
                        radius={8}
                        fill="#f8fafc"
                        stroke="#0ea5e9"
                        strokeWidth={2}
                        listening={false}
                      />
                      <Text
                        data-testid={`dashboard-visual-widget-value-${widget.id}`}
                        x={x + 8}
                        y={y + 4}
                        width={Math.max(0, width - 16)}
                        text={actualText}
                        fontSize={Math.min(fontSize, 13)}
                        fill="#e2e8f0"
                        listening={false}
                      />
                    </>
                  ) : (
                    <>
                      <Rect
                        data-testid={`dashboard-visual-widget-shell-${widget.id}`}
                        x={x}
                        y={y}
                        width={width}
                        height={height}
                        cornerRadius={4}
                        fill={isUnsupportedVisualWidget ? '#0f172a' : fill}
                        stroke={isUnsupportedVisualWidget ? '#94a3b8' : stroke}
                        strokeWidth={2}
                        dash={isUnsupportedVisualWidget ? [8, 6] : undefined}
                        opacity={isUnsupportedVisualWidget ? 0.9 : 1}
                        listening={false}
                      />
                      <Text
                        data-testid={`dashboard-visual-widget-value-${widget.id}`}
                        x={x + 8}
                        y={isUnsupportedVisualWidget ? y + 6 : y + Math.max(6, (height - fontSize) / 2)}
                        width={Math.max(0, width - 16)}
                        height={Math.max(0, height - 8)}
                        text={isUnsupportedVisualWidget ? widgetCaption : widgetText}
                        fontSize={isUnsupportedVisualWidget ? Math.min(fontSize, 14) : fontSize}
                        fill={isUnsupportedVisualWidget ? '#e2e8f0' : textFill}
                        listening={false}
                      />
                      {isUnsupportedVisualWidget && (
                        <Text
                          data-testid={`dashboard-visual-widget-readonly-${widget.id}`}
                          x={x + 8}
                          y={readOnlyTextY}
                          width={Math.max(0, width - 16)}
                          text="Read only"
                          fontSize={12}
                          fill="#94a3b8"
                          listening={false}
                        />
                      )}
                    </>
                  )}
                </Group>
              )
            })}
          </Group>
        </Layer>
      </Stage>

      {renderIssueSummary && (
        <p className="pointer-events-none absolute bottom-3 left-3 rounded border border-[#cbd5e1] bg-white/90 px-3 py-2 text-xs text-[#475569] shadow-sm">
          {renderIssueSummary}
        </p>
      )}
    </div>
  )
}
