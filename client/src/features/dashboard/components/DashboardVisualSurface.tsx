import { useEffect, useMemo, useState } from 'react'
import { Circle, Group, Image as KonvaImage, Layer, Line, Rect, Stage, Text } from 'react-konva'
import type {
  DashboardCanvasPoint,
  DashboardConnectionPoint,
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
}

type KonvaDragEvent = {
  target: {
    x: () => number
    y: () => number
  }
}

const GRID_STEP = 40
const GRID_PADDING = 240
const CONNECTION_POINT_RADIUS = 5

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
}: DashboardVisualSurfaceProps) {
  const imageElementsById = useImageElementsById(runtimeLayout.runtimeRenderableImages)
  const renderIssueSummary = formatRenderIssueSummary(runtimeLayout)
  const gridBounds = useMemo(
    () => ({
      minX: runtimeLayout.diagramBounds.minX - GRID_PADDING,
      minY: runtimeLayout.diagramBounds.minY - GRID_PADDING,
      maxX: runtimeLayout.diagramBounds.maxX + GRID_PADDING,
      maxY: runtimeLayout.diagramBounds.maxY + GRID_PADDING,
    }),
    [runtimeLayout.diagramBounds],
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
    <div data-testid="dashboard-visual-surface" className="overflow-hidden rounded-md border border-[#cbd5e1] bg-[#f8fafc]">
      <Stage
        data-testid="dashboard-visual-stage"
        width={viewportSize.width}
        height={viewportSize.height}
        className="block"
      >
        <Layer data-testid="dashboard-visual-grid-layer">
          <Group
            data-testid="dashboard-visual-workspace"
            x={viewport.offsetX}
            y={viewport.offsetY}
            scaleX={viewport.scale}
            scaleY={viewport.scale}
            draggable
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
                stroke="#e2e8f0"
                strokeWidth={1}
                listening={false}
              />
            ))}
            {horizontalGridLines.map((y) => (
              <Line
                key={`grid-y-${y}`}
                points={[gridBounds.minX, y, gridBounds.maxX, y]}
                stroke="#e2e8f0"
                strokeWidth={1}
                listening={false}
              />
            ))}

            {runtimeLayout.runtimeRenderableImages.map((image) => (
              <KonvaImage
                key={image.imageId}
                data-testid={`dashboard-visual-image-${image.imageId}`}
                image={imageElementsById.get(image.imageId)}
                x={toFiniteNumber(image.x, 0)}
                y={toFiniteNumber(image.y, 0)}
                width={resolveImageWidth(image)}
                height={resolveImageHeight(image)}
                opacity={0.95}
                listening={false}
              />
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
              const isVisualValueWidget = widget.type === 'number-display' || widget.type === 'text-display'
              const widgetText =
                isVisualValueWidget && widgetProjection ? widgetProjection.visualValue : widget.id

              return (
                <Group key={widget.id} data-testid={`dashboard-visual-widget-${widget.id}`} listening={false}>
                  <Rect
                    data-testid={`dashboard-visual-widget-shell-${widget.id}`}
                    x={x}
                    y={y}
                    width={width}
                    height={height}
                    cornerRadius={4}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={2}
                  />
                  <Text
                    data-testid={`dashboard-visual-widget-value-${widget.id}`}
                    x={x + 8}
                    y={y + Math.max(6, (height - fontSize) / 2)}
                    width={Math.max(0, width - 16)}
                    height={Math.max(0, height - 8)}
                    text={widgetText}
                    fontSize={Math.min(fontSize, 16)}
                    fill={textFill}
                    listening={false}
                  />
                </Group>
              )
            })}
          </Group>
        </Layer>
      </Stage>

      {renderIssueSummary && (
        <p className="border-t border-[#cbd5e1] px-3 py-2 text-xs text-[#475569]">{renderIssueSummary}</p>
      )}
    </div>
  )
}
