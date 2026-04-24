import { describe, expect, it } from 'vitest'
import type { DashboardDiagramBounds } from '@/features/dashboard/model/types'
import {
  createDashboardInitialViewport,
  fitDashboardViewport,
  getDashboardGridTransform,
  panDashboardViewport,
  resetDashboardViewport,
  zoomDashboardViewport,
} from '@/features/dashboard/model/viewport'

const savedLayoutBounds: DashboardDiagramBounds = {
  minX: 40,
  minY: 8,
  maxX: 860,
  maxY: 388,
  width: 820,
  height: 380,
}

describe('dashboard viewport helpers (T037/T039)', () => {
  it('uses a near-100% initial fit when saved layout bounds fit the workspace', () => {
    const viewport = createDashboardInitialViewport(savedLayoutBounds, {
      width: 1000,
      height: 600,
    })

    expect(viewport.scale).toBe(1)
    expect(viewport.mode).toBe('fit')
    expect(viewport.offsetX).toBe(50)
    expect(viewport.offsetY).toBe(102)
    expect(viewport.bounds).toBe(savedLayoutBounds)
  })

  it('fits large diagrams into the visible workspace with padding', () => {
    const largeBounds: DashboardDiagramBounds = {
      minX: -200,
      minY: 100,
      maxX: 1800,
      maxY: 1300,
      width: 2000,
      height: 1200,
    }

    const viewport = createDashboardInitialViewport(largeBounds, {
      width: 1000,
      height: 600,
    })

    expect(viewport.scale).toBeCloseTo(0.4667, 4)
    expect(viewport.offsetX).toBeCloseTo(126.67, 2)
    expect(viewport.offsetY).toBeCloseTo(-26.67, 2)
    expect(viewport.mode).toBe('fit')
  })

  it('allows fit-to-view below the default manual zoom minimum for very large diagrams', () => {
    const veryLargeBounds: DashboardDiagramBounds = {
      minX: 0,
      minY: 0,
      maxX: 10000,
      maxY: 5000,
      width: 10000,
      height: 5000,
    }

    const viewport = createDashboardInitialViewport(veryLargeBounds, {
      width: 1000,
      height: 600,
    })

    expect(viewport.scale).toBeCloseTo(0.096, 4)
    expect(viewport.scale).toBeLessThan(viewport.minScale)
    expect(viewport.offsetX).toBeCloseTo(20)
    expect(viewport.offsetY).toBeCloseTo(60)
    expect(viewport.mode).toBe('fit')
  })

  it('pans, zooms around an anchor, and resets without mutating saved layout bounds', () => {
    const originalBounds = { ...savedLayoutBounds }
    const initialViewport = fitDashboardViewport(savedLayoutBounds, {
      width: 1000,
      height: 600,
    })
    const pannedViewport = panDashboardViewport(initialViewport, { deltaX: 48, deltaY: -24 })
    const zoomedViewport = zoomDashboardViewport(pannedViewport, {
      factor: 1.25,
      anchor: { x: 500, y: 300 },
    })
    const resetViewport = resetDashboardViewport(savedLayoutBounds)

    expect(pannedViewport).toEqual({
      ...initialViewport,
      offsetX: initialViewport.offsetX + 48,
      offsetY: initialViewport.offsetY - 24,
      mode: 'manual',
    })
    expect(zoomedViewport.scale).toBeCloseTo(1.25)
    expect(zoomedViewport.offsetX).toBeCloseTo(-2.5)
    expect(zoomedViewport.offsetY).toBeCloseTo(22.5)
    expect(zoomedViewport.mode).toBe('manual')
    expect(resetViewport).toEqual({
      bounds: savedLayoutBounds,
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      minScale: initialViewport.minScale,
      maxScale: initialViewport.maxScale,
      mode: 'reset',
    })
    expect(savedLayoutBounds).toEqual(originalBounds)
  })

  it('exposes the same transform for the grid and diagram workspace', () => {
    const viewport = panDashboardViewport(
      fitDashboardViewport(savedLayoutBounds, { width: 1000, height: 600 }),
      { deltaX: -32, deltaY: 16 },
    )

    expect(getDashboardGridTransform(viewport)).toEqual({
      scale: viewport.scale,
      offsetX: viewport.offsetX,
      offsetY: viewport.offsetY,
    })
  })
})
