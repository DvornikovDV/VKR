// T001b — Vitest + React Testing Library + MSW global setup
import '@testing-library/jest-dom'
import React from 'react'
import { afterAll, afterEach, beforeAll, vi } from 'vitest'
import { server } from './mocks/server'

type MockKonvaNodeProps = {
  children?: React.ReactNode
  'data-testid'?: string
  'data-source'?: string
  draggable?: boolean
  fill?: string
  fontSize?: number
  height?: number
  listening?: boolean
  opacity?: number
  points?: number[]
  radius?: number
  scaleX?: number
  scaleY?: number
  stroke?: string
  text?: string
  width?: number
  x?: number
  y?: number
  onDragEnd?: (event: { target: { x: () => number; y: () => number } }) => void
}

function toDataAttribute(value: string | number | undefined): string | undefined {
  return value === undefined ? undefined : String(value)
}

function MockKonvaNode({
  children,
  'data-testid': dataTestId,
  'data-source': dataSource,
  draggable,
  fill,
  fontSize,
  height,
  listening,
  onDragEnd,
  opacity,
  points,
  radius,
  scaleX,
  scaleY,
  stroke,
  text,
  width,
  x,
  y,
}: MockKonvaNodeProps) {
  const isDraggableWorkspace = draggable === true

  return React.createElement(
    'div',
    {
      'data-testid': dataTestId ?? (isDraggableWorkspace ? 'dashboard-visual-workspace' : undefined),
      'data-konva-node': '',
      'data-draggable': isDraggableWorkspace ? 'true' : undefined,
      'data-source': dataSource,
      'data-x': toDataAttribute(x),
      'data-y': toDataAttribute(y),
      'data-width': toDataAttribute(width),
      'data-height': toDataAttribute(height),
      'data-listening': listening === undefined ? undefined : String(listening),
      'data-opacity': toDataAttribute(opacity),
      'data-points': points?.join(','),
      'data-fill': fill,
      'data-font-size': toDataAttribute(fontSize),
      'data-stroke': stroke,
      'data-radius': toDataAttribute(radius),
      'data-scale-x': toDataAttribute(scaleX),
      'data-scale-y': toDataAttribute(scaleY),
      onMouseUp: isDraggableWorkspace
        ? () =>
            onDragEnd?.({
              target: {
                x: () => (typeof x === 'number' ? x + 64 : 64),
                y: () => (typeof y === 'number' ? y - 32 : -32),
              },
            })
        : undefined,
    },
    text,
    children,
  )
}

vi.mock('react-konva', () => ({
  Stage: MockKonvaNode,
  Layer: MockKonvaNode,
  Group: MockKonvaNode,
  Rect: MockKonvaNode,
  Line: MockKonvaNode,
  Circle: MockKonvaNode,
  Image: MockKonvaNode,
  Text: MockKonvaNode,
}))

// ── MSW ───────────────────────────────────────────────────────────────────
// Start MSW service worker before all tests, reset handlers between tests,
// stop after all tests complete.
beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
