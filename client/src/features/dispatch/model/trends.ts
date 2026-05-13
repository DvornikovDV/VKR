import {
  TELEMETRY_HISTORY_DEFAULT_MAX_POINTS,
  type TelemetryHistoryPoint,
  type TelemetryHistoryResponse,
} from '@/shared/api/telemetryHistory'
import type {
  EdgeCapabilitiesCatalogSnapshot,
  EdgeCatalogTelemetryMetric,
} from '@/shared/api/edgeServersCanonical'

export type DispatchTrendsValueMode = 'avg' | 'last'

export type DispatchTrendsLoadState = 'idle' | 'loading' | 'ready' | 'empty' | 'error'

export interface DispatchTrendsRange {
  dateStart: string
  dateEnd: string
}

export interface DispatchTrendsFilter extends DispatchTrendsRange {
  edgeId: string | null
  deviceId: string | null
  metric: string | null
  valueMode: DispatchTrendsValueMode
  maxPoints: number
}

export interface DispatchTrendsNumericMetricOption {
  id: string
  deviceId: string
  metric: string
  label: string
  valueType: 'number'
}

export interface DispatchTrendsRequestDescriptor {
  edgeId: string
  deviceId: string
  metric: string
  dateStart: string
  dateEnd: string
  maxPoints: number
}

export interface DispatchTrendsRequestGuard {
  requestId: number
  key: string
}

export interface DispatchTrendsChartPoint {
  timeStart: string
  timeEnd: string
  pointTime: string
  value: number
}

export interface DispatchTrendsTableRow {
  timeStart: string
  timeEnd: string
  pointTime: string
  min: number
  max: number
  avg: number
  last: number
  count: number
}

export interface DispatchTrendsProjection {
  response: TelemetryHistoryResponse
  valueMode: DispatchTrendsValueMode
  chartPoints: DispatchTrendsChartPoint[]
  tableRows: DispatchTrendsTableRow[]
}

type TelemetryHistoryPointWithOptionalPointTime = Omit<TelemetryHistoryPoint, 'pointTime'> & {
  pointTime?: string | null
}

type TelemetryHistoryResponseWithOptionalPointTime = Omit<TelemetryHistoryResponse, 'series'> & {
  series: TelemetryHistoryPointWithOptionalPointTime[]
}

function createNumericMetricOption(entry: EdgeCatalogTelemetryMetric): DispatchTrendsNumericMetricOption | null {
  if (entry.valueType !== 'number') {
    return null
  }

  return {
    id: `${entry.deviceId}:${entry.metric}`,
    deviceId: entry.deviceId,
    metric: entry.metric,
    label: entry.label || `${entry.deviceId} / ${entry.metric}`,
    valueType: 'number',
  }
}

function parseTime(value: string): number | null {
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : null
}

function computeMidpointIso(timeStart: string, timeEnd: string): string {
  const start = parseTime(timeStart)
  const end = parseTime(timeEnd)

  if (start === null || end === null) {
    return timeStart
  }

  return new Date(start + (end - start) / 2).toISOString()
}

function normalizeHistoryPoint(point: TelemetryHistoryPointWithOptionalPointTime): TelemetryHistoryPoint {
  return {
    ...point,
    pointTime: point.pointTime || computeMidpointIso(point.timeStart, point.timeEnd),
  }
}

export function createDispatchTrendsDefaultRange(now: Date = new Date()): DispatchTrendsRange {
  const dateEnd = now.toISOString()
  const dateStart = new Date(now.getTime() - 60 * 60 * 1_000).toISOString()

  return {
    dateStart,
    dateEnd,
  }
}

export function createDispatchTrendsDefaultFilter(
  edgeId: string | null,
  now: Date = new Date(),
): DispatchTrendsFilter {
  return {
    edgeId,
    deviceId: null,
    metric: null,
    valueMode: 'avg',
    maxPoints: TELEMETRY_HISTORY_DEFAULT_MAX_POINTS,
    ...createDispatchTrendsDefaultRange(now),
  }
}

export function selectDispatchTrendsNumericMetricOptions(
  catalog: EdgeCapabilitiesCatalogSnapshot | null | undefined,
): DispatchTrendsNumericMetricOption[] {
  if (!catalog) {
    return []
  }

  return catalog.telemetry
    .map((entry) => createNumericMetricOption(entry))
    .filter((entry): entry is DispatchTrendsNumericMetricOption => entry !== null)
}

export function createDispatchTrendsRequestKey(descriptor: DispatchTrendsRequestDescriptor): string {
  return [
    descriptor.edgeId,
    descriptor.deviceId,
    descriptor.metric,
    descriptor.dateStart,
    descriptor.dateEnd,
    String(descriptor.maxPoints),
  ].join('\u001f')
}

export function createDispatchTrendsRequestGuard(
  requestId: number,
  descriptor: DispatchTrendsRequestDescriptor,
): DispatchTrendsRequestGuard {
  return {
    requestId,
    key: createDispatchTrendsRequestKey(descriptor),
  }
}

export function isDispatchTrendsRequestCurrent(
  activeGuard: DispatchTrendsRequestGuard | null,
  responseGuard: DispatchTrendsRequestGuard,
): boolean {
  return activeGuard?.requestId === responseGuard.requestId && activeGuard.key === responseGuard.key
}

export function projectDispatchTrendsHistoryResponse(
  response: TelemetryHistoryResponseWithOptionalPointTime,
  valueMode: DispatchTrendsValueMode,
): DispatchTrendsProjection {
  const normalizedSeries = response.series.map((point) => normalizeHistoryPoint(point))
  const normalizedResponse: TelemetryHistoryResponse = {
    ...response,
    series: normalizedSeries,
  }

  return {
    response: normalizedResponse,
    valueMode,
    chartPoints: normalizedSeries.map((point) => ({
      timeStart: point.timeStart,
      timeEnd: point.timeEnd,
      pointTime: point.pointTime,
      value: point[valueMode],
    })),
    tableRows: normalizedSeries.map((point) => ({
      timeStart: point.timeStart,
      timeEnd: point.timeEnd,
      pointTime: point.pointTime,
      min: point.min,
      max: point.max,
      avg: point.avg,
      last: point.last,
      count: point.count,
    })),
  }
}

export function formatDispatchTrendsTimestamp(value: string, locale?: string): string {
  const timestamp = parseTime(value)
  if (timestamp === null) {
    return value
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(timestamp))
}

export function formatDispatchTrendsNumber(value: number): string {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 3,
  }).format(value)
}
