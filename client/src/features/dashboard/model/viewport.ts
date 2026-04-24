import type { DashboardCanvasPoint, DashboardDiagramBounds } from '@/features/dashboard/model/types'

export type DashboardViewportMode = 'fit' | 'manual' | 'reset'

export interface DashboardViewportSize {
  width: number
  height: number
}

export interface DashboardViewportState {
  bounds: DashboardDiagramBounds
  scale: number
  offsetX: number
  offsetY: number
  minScale: number
  maxScale: number
  mode: DashboardViewportMode
}

export interface DashboardViewportOptions {
  minScale?: number
  maxScale?: number
  padding?: number
}

export interface DashboardViewportPanInput {
  deltaX: number
  deltaY: number
}

export interface DashboardViewportZoomInput {
  factor: number
  anchor: DashboardCanvasPoint
}

export interface DashboardGridTransform {
  scale: number
  offsetX: number
  offsetY: number
}

const DEFAULT_MIN_SCALE = 0.2
const DEFAULT_MAX_SCALE = 2
const DEFAULT_PADDING = 20
const NEAR_FULL_SCALE_THRESHOLD = 0.98

function resolveViewportOptions(options: DashboardViewportOptions = {}): Required<DashboardViewportOptions> {
  return {
    minScale: options.minScale ?? DEFAULT_MIN_SCALE,
    maxScale: options.maxScale ?? DEFAULT_MAX_SCALE,
    padding: options.padding ?? DEFAULT_PADDING,
  }
}

function clampScale(scale: number, minScale: number, maxScale: number): number {
  return Math.min(maxScale, Math.max(minScale, scale))
}

function getAvailableSize(size: DashboardViewportSize, padding: number): DashboardViewportSize {
  return {
    width: Math.max(0, size.width - padding * 2),
    height: Math.max(0, size.height - padding * 2),
  }
}

function calculateFitScale(
  bounds: DashboardDiagramBounds,
  size: DashboardViewportSize,
  options: Required<DashboardViewportOptions>,
): number {
  if (bounds.width <= 0 || bounds.height <= 0 || size.width <= 0 || size.height <= 0) {
    return 1
  }

  const availableSize = getAvailableSize(size, options.padding)
  const rawFitScale = Math.min(availableSize.width / bounds.width, availableSize.height / bounds.height)
  const normalizedFitScale = rawFitScale >= NEAR_FULL_SCALE_THRESHOLD ? 1 : rawFitScale

  return Math.min(options.maxScale, normalizedFitScale)
}

function centerBoundsInViewport(
  bounds: DashboardDiagramBounds,
  size: DashboardViewportSize,
  scale: number,
): Pick<DashboardViewportState, 'offsetX' | 'offsetY'> {
  return {
    offsetX: (size.width - bounds.width * scale) / 2 - bounds.minX * scale,
    offsetY: (size.height - bounds.height * scale) / 2 - bounds.minY * scale,
  }
}

export function fitDashboardViewport(
  bounds: DashboardDiagramBounds,
  size: DashboardViewportSize,
  options?: DashboardViewportOptions,
): DashboardViewportState {
  const resolvedOptions = resolveViewportOptions(options)
  const scale = calculateFitScale(bounds, size, resolvedOptions)
  const offsets = centerBoundsInViewport(bounds, size, scale)

  return {
    bounds,
    scale,
    offsetX: offsets.offsetX,
    offsetY: offsets.offsetY,
    minScale: resolvedOptions.minScale,
    maxScale: resolvedOptions.maxScale,
    mode: 'fit',
  }
}

export function createDashboardInitialViewport(
  bounds: DashboardDiagramBounds,
  size: DashboardViewportSize,
  options?: DashboardViewportOptions,
): DashboardViewportState {
  return fitDashboardViewport(bounds, size, options)
}

export function resetDashboardViewport(
  bounds: DashboardDiagramBounds,
  options?: Pick<DashboardViewportOptions, 'minScale' | 'maxScale'>,
): DashboardViewportState {
  const resolvedOptions = resolveViewportOptions(options)

  return {
    bounds,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    minScale: resolvedOptions.minScale,
    maxScale: resolvedOptions.maxScale,
    mode: 'reset',
  }
}

export function panDashboardViewport(
  viewport: DashboardViewportState,
  pan: DashboardViewportPanInput,
): DashboardViewportState {
  return {
    ...viewport,
    offsetX: viewport.offsetX + pan.deltaX,
    offsetY: viewport.offsetY + pan.deltaY,
    mode: 'manual',
  }
}

export function zoomDashboardViewport(
  viewport: DashboardViewportState,
  zoom: DashboardViewportZoomInput,
): DashboardViewportState {
  const nextScale = clampScale(
    viewport.scale * zoom.factor,
    viewport.minScale,
    viewport.maxScale,
  )
  const anchorWorldX = (zoom.anchor.x - viewport.offsetX) / viewport.scale
  const anchorWorldY = (zoom.anchor.y - viewport.offsetY) / viewport.scale

  return {
    ...viewport,
    scale: nextScale,
    offsetX: zoom.anchor.x - anchorWorldX * nextScale,
    offsetY: zoom.anchor.y - anchorWorldY * nextScale,
    mode: 'manual',
  }
}

export function getDashboardGridTransform(viewport: DashboardViewportState): DashboardGridTransform {
  return {
    scale: viewport.scale,
    offsetX: viewport.offsetX,
    offsetY: viewport.offsetY,
  }
}
