import { describe, expect, it } from 'vitest'
import {
  createDispatchTrendsDefaultFilter,
  projectDispatchTrendsHistoryResponse,
  selectDispatchTrendsNumericMetricOptions,
} from '@/features/dispatch/model/trends'
import { TELEMETRY_HISTORY_DEFAULT_MAX_POINTS } from '@/shared/api/telemetryHistory'
import type { EdgeCapabilitiesCatalogSnapshot } from '@/shared/api/edgeServersCanonical'

describe('dispatch trends helpers', () => {
  it('keeps metric choices limited to catalog telemetry entries with valueType number', () => {
    const catalog: EdgeCapabilitiesCatalogSnapshot = {
      edgeServerId: 'edge-1',
      telemetry: [
        {
          deviceId: 'pump-1',
          metric: 'temperature',
          valueType: 'number',
          label: 'Pump temperature',
        },
        {
          deviceId: 'pump-1',
          metric: 'running',
          valueType: 'boolean',
          label: 'Pump running',
        },
        {
          deviceId: 'pump-1',
          metric: 'legacyPressure',
          label: 'Legacy pressure without type',
        },
      ],
      commands: [],
    }

    expect(selectDispatchTrendsNumericMetricOptions(catalog)).toEqual([
      {
        id: 'pump-1:temperature',
        deviceId: 'pump-1',
        metric: 'temperature',
        valueType: 'number',
        label: 'Pump temperature',
      },
    ])
  })

  it('derives a bounded default range and default request controls for the selected edge', () => {
    const now = new Date('2026-05-13T10:15:30.000Z')

    expect(createDispatchTrendsDefaultFilter('edge-1', now)).toEqual({
      edgeId: 'edge-1',
      deviceId: null,
      metric: null,
      valueMode: 'avg',
      maxPoints: TELEMETRY_HISTORY_DEFAULT_MAX_POINTS,
      dateStart: '2026-05-13T09:15:30.000Z',
      dateEnd: '2026-05-13T10:15:30.000Z',
    })
  })

  it('projects chart and table rows from the same history response with midpoint fallback', () => {
    const response = {
      edgeId: 'edge-1',
      deviceId: 'pump-1',
      metric: 'temperature',
      dateStart: '2026-05-13T10:00:00.000Z',
      dateEnd: '2026-05-13T10:10:00.000Z',
      maxPoints: 300,
      series: [
        {
          timeStart: '2026-05-13T10:00:00.000Z',
          timeEnd: '2026-05-13T10:10:00.000Z',
          min: 20,
          max: 30,
          avg: 25,
          last: 29,
          count: 600,
        },
      ],
    }

    const projection = projectDispatchTrendsHistoryResponse(response, 'last')

    expect(projection.response.series).toEqual([
      {
        ...response.series[0],
        pointTime: '2026-05-13T10:05:00.000Z',
      },
    ])
    expect(projection.chartPoints).toEqual([
      {
        timeStart: '2026-05-13T10:00:00.000Z',
        timeEnd: '2026-05-13T10:10:00.000Z',
        pointTime: '2026-05-13T10:05:00.000Z',
        value: 29,
      },
    ])
    expect(projection.tableRows).toEqual([
      {
        timeStart: '2026-05-13T10:00:00.000Z',
        timeEnd: '2026-05-13T10:10:00.000Z',
        pointTime: '2026-05-13T10:05:00.000Z',
        min: 20,
        max: 30,
        avg: 25,
        last: 29,
        count: 600,
      },
    ])
    expect(projection.chartPoints[0].pointTime).toBe(projection.tableRows[0].pointTime)
    expect(projection.response.series[0].pointTime).toBe(projection.chartPoints[0].pointTime)
  })
})
