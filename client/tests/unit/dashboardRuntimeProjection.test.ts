import { describe, expect, it } from 'vitest'
import {
  createDashboardBindingKey,
  mergeTelemetryReadingsByBindingKey,
  selectDashboardRuntimeProjection,
} from '@/features/dashboard/model/selectors'
import type {
  DashboardBindingProfile,
  DashboardDiagramDocument,
  DashboardMetricValueByBindingKey,
} from '@/features/dashboard/model/types'

const diagramDocument: DashboardDiagramDocument = {
  _id: 'diagram-1',
  name: 'Boiler',
  layout: {
    widgets: [
      { id: 'widget-number', type: 'number-display' },
      { id: 'widget-text', type: 'text-display' },
      { id: 'widget-led', type: 'led' },
      { id: 'widget-unsupported', type: 'button' },
    ],
  },
}

const bindingProfile: DashboardBindingProfile = {
  _id: 'binding-1',
  diagramId: 'diagram-1',
  edgeServerId: 'edge-1',
  widgetBindings: [
    { widgetId: 'widget-number', deviceId: 'pump-1', metric: 'temperature' },
    { widgetId: 'widget-text', deviceId: 'pump-1', metric: 'status' },
    { widgetId: 'widget-led', deviceId: 'pump-1', metric: 'alarm' },
    { widgetId: 'widget-unsupported', deviceId: 'pump-1', metric: 'command' },
  ],
}

function buildMetricMap(): DashboardMetricValueByBindingKey {
  return mergeTelemetryReadingsByBindingKey(
    {},
    [
      {
        sourceId: 'source-1',
        deviceId: 'pump-1',
        metric: 'temperature',
        last: '48.5',
        ts: 1763895000000,
      },
      {
        sourceId: 'source-1',
        deviceId: 'pump-1',
        metric: 'status',
        last: 15,
        ts: 1763895000100,
      },
      {
        sourceId: 'source-1',
        deviceId: 'pump-1',
        metric: 'alarm',
        last: 'false',
        ts: 1763895000200,
      },
      {
        sourceId: 'source-1',
        deviceId: 'pump-1',
        metric: 'command',
        last: true,
        ts: 1763895000300,
      },
    ],
  )
}

describe('dashboard runtime projection (T021)', () => {
  it('projects number-display, text-display, and led values via saved binding pairs', () => {
    const metricMap = buildMetricMap()
    const projection = selectDashboardRuntimeProjection(diagramDocument, bindingProfile, metricMap)

    expect(
      projection.widgetValueById['widget-number'],
    ).toBe(metricMap[createDashboardBindingKey('pump-1', 'temperature')])
    expect(projection.widgetValueById['widget-text']).toBe(
      metricMap[createDashboardBindingKey('pump-1', 'status')],
    )
    expect(projection.widgetValueById['widget-led']).toBe(
      metricMap[createDashboardBindingKey('pump-1', 'alarm')],
    )

    const numberWidget = projection.widgets.find((item) => item.widgetId === 'widget-number')
    const textWidget = projection.widgets.find((item) => item.widgetId === 'widget-text')
    const ledWidget = projection.widgets.find((item) => item.widgetId === 'widget-led')

    expect(numberWidget?.value).toBe(48.5)
    expect(textWidget?.value).toBe('15')
    expect(ledWidget?.value).toBe(false)
  })

  it('keeps unsupported widget entries visible in projection', () => {
    const projection = selectDashboardRuntimeProjection(diagramDocument, bindingProfile, buildMetricMap())
    const unsupportedWidget = projection.widgets.find(
      (item) => item.widgetId === 'widget-unsupported',
    )

    expect(unsupportedWidget).toEqual(
      expect.objectContaining({
        widgetId: 'widget-unsupported',
        widgetType: 'button',
        isBound: true,
        isSupported: false,
      }),
    )
  })
})
