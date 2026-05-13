import { apiClient } from '@/shared/api/client'

export const TELEMETRY_HISTORY_DEFAULT_MAX_POINTS = 300
export const TELEMETRY_HISTORY_MAX_POINTS = 1_000

export interface TelemetryHistoryRequestParams {
  edgeId: string
  deviceId: string
  metric: string
  date_start: string
  date_end: string
  maxPoints: number
}

export interface TelemetryHistoryPoint {
  timeStart: string
  timeEnd: string
  pointTime: string
  min: number
  max: number
  avg: number
  last: number
  count: number
}

export interface TelemetryHistoryResponse {
  edgeId: string
  deviceId: string
  metric: string
  dateStart: string
  dateEnd: string
  maxPoints: number
  series: TelemetryHistoryPoint[]
}

function buildTelemetryHistoryQuery(params: TelemetryHistoryRequestParams): string {
  const query = new URLSearchParams()

  query.set('edgeId', params.edgeId)
  query.set('deviceId', params.deviceId)
  query.set('metric', params.metric)
  query.set('date_start', params.date_start)
  query.set('date_end', params.date_end)
  query.set('maxPoints', String(params.maxPoints))

  return query.toString()
}

export function getTelemetryHistory(
  params: TelemetryHistoryRequestParams,
): Promise<TelemetryHistoryResponse> {
  return apiClient.get<TelemetryHistoryResponse>(
    `/telemetry/historic?${buildTelemetryHistoryQuery(params)}`,
  )
}
