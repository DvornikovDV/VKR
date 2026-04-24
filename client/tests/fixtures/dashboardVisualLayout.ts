import type {
  DashboardBindingProfile,
  DashboardDiagramDocument,
  DashboardLayoutDocument,
} from '@/features/dashboard/model/types'
import type { DashboardRestFixtures } from '../mocks/handlers'

const savedPngDataUrl =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII='

export const dashboardVisualLayout = {
  images: [
    {
      imageId: 'image-boiler',
      base64: savedPngDataUrl,
      x: 40,
      y: 32,
      width: 360,
      height: 220,
      scaleX: 1,
      scaleY: 1,
    },
    {
      imageId: 'image-pump',
      base64: savedPngDataUrl,
      x: 520,
      y: 96,
      width: 180,
      height: 120,
      scaleX: 1.25,
      scaleY: 0.9,
    },
  ],
  connectionPoints: [
    { id: 'pin-boiler-out', imageId: 'image-boiler', side: 'right', offset: 0.45 },
    { id: 'pin-boiler-top', imageId: 'image-boiler', side: 'top', offset: 0.28 },
    { id: 'pin-pump-in', imageId: 'image-pump', side: 'left', offset: 0.5 },
    { id: 'pin-pump-out', imageId: 'image-pump', side: 'right', offset: 0.5 },
  ],
  connections: [
    {
      id: 'connection-main-line',
      fromPinId: 'pin-boiler-out',
      toPinId: 'pin-pump-in',
      segments: [
        { x1: 400, y1: 131, x2: 470, y2: 131 },
        { x1: 470, y1: 131, x2: 520, y2: 156 },
      ],
      userModified: true,
    },
    {
      id: 'connection-damaged-reference',
      fromPinId: 'pin-boiler-top',
      toPinId: 'pin-missing',
      segments: [{ x1: 141, y1: 32, x2: 180, y2: 8 }],
      userModified: false,
    },
  ],
  widgets: [
    {
      id: 'widget-temperature',
      type: 'number-display',
      imageId: 'image-boiler',
      x: 96,
      y: 92,
      width: 112,
      height: 52,
      relativeX: 0.16,
      relativeY: 0.27,
      fontSize: 24,
      color: '#f8fafc',
      backgroundColor: '#0f172a',
      borderColor: '#38bdf8',
      displayValue: 0,
      unit: 'C',
    },
    {
      id: 'widget-status',
      type: 'text-display',
      imageId: 'image-boiler',
      x: 232,
      y: 176,
      width: 136,
      height: 44,
      relativeX: 0.53,
      relativeY: 0.65,
      fontSize: 16,
      color: '#e2e8f0',
      backgroundColor: '#1e293b',
      borderColor: '#475569',
      text: 'Pending',
    },
    {
      id: 'widget-alarm',
      type: 'led',
      imageId: 'image-pump',
      x: 610,
      y: 128,
      width: 36,
      height: 36,
      relativeX: 0.5,
      relativeY: 0.3,
      radius: 18,
      colorOn: '#22c55e',
      colorOff: '#64748b',
    },
    {
      id: 'widget-command',
      type: 'toggle-switch',
      imageId: 'image-pump',
      x: 560,
      y: 184,
      width: 120,
      height: 40,
      relativeX: 0.22,
      relativeY: 0.73,
      label: 'Start Pump',
    },
    {
      id: 'widget-damaged-image',
      type: 'number-display',
      imageId: 'image-missing',
      x: 760,
      y: 340,
      width: 100,
      height: 48,
      relativeX: 0.1,
      relativeY: 0.1,
      fontSize: 18,
      color: '#ffffff',
      backgroundColor: '#111827',
      borderColor: '#ef4444',
    },
  ],
} satisfies DashboardLayoutDocument

export const dashboardVisualDiagram = {
  _id: 'diagram-visual-1',
  name: 'Visual Boiler Runtime',
  layout: dashboardVisualLayout,
  __v: 8,
  createdAt: '2026-04-24T08:00:00.000Z',
  updatedAt: '2026-04-24T08:15:00.000Z',
} satisfies DashboardDiagramDocument

export const dashboardVisualBindingProfile = {
  _id: 'binding-visual-1',
  diagramId: dashboardVisualDiagram._id,
  edgeServerId: 'edge-visual-1',
  widgetBindings: [
    { widgetId: 'widget-temperature', deviceId: 'boiler-1', metric: 'temperature' },
    { widgetId: 'widget-status', deviceId: 'boiler-1', metric: 'status' },
    { widgetId: 'widget-alarm', deviceId: 'pump-1', metric: 'alarm' },
  ],
} satisfies DashboardBindingProfile

export function createDashboardVisualRestFixtures(): DashboardRestFixtures {
  return {
    diagramsById: {
      [dashboardVisualDiagram._id]: dashboardVisualDiagram,
    },
    trustedEdges: [
      {
        _id: 'edge-visual-1',
        name: 'Visual Edge',
        lifecycleState: 'Active',
        availability: {
          online: true,
          lastSeenAt: '2026-04-24T08:14:30.000Z',
        },
      },
    ],
    bindingProfilesByDiagramId: {
      [dashboardVisualDiagram._id]: [dashboardVisualBindingProfile],
    },
  }
}
