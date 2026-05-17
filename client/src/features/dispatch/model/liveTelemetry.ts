import type {
  DashboardBindingProfile,
  DashboardRuntimeValue,
  DashboardTelemetryEvent,
  DashboardTelemetryReading,
} from '@/features/dashboard/model/types'

export const DISPATCH_LIVE_TELEMETRY_WINDOW_MS = 60_000

const KEY_SEPARATOR = '\u001f'

export interface DispatchLiveTelemetryContextDescriptor {
  diagramId: string
  edgeId: string
  bindingProfileId: string
}

export interface DispatchLiveTelemetryRequestDescriptor {
  edgeId: string
}

export interface DispatchLiveTelemetryRow {
  id: string
  contextKey: string
  edgeId: string
  deviceId: string
  metric: string
  value: DashboardRuntimeValue
  receivedAt: number
  receivedAtIso: string
  eventTimestamp: number
  eventTimestampIso: string
  serverTimestamp: number
  serverTimestampIso: string
}

export interface NormalizeDispatchLiveTelemetryRowsOptions {
  contextKey: string
  relevantPairs: ReadonlySet<string>
  receivedAt: number
  sequenceStart?: number
}

type DispatchLiveTelemetryBindingPair = Pick<DashboardTelemetryReading, 'deviceId' | 'metric'>

function normalizeIdentityPart(value: string): string {
  return value.trim()
}

function toIsoTimestamp(timestamp: number): string {
  return new Date(timestamp).toISOString()
}

export function createDispatchLiveTelemetryBindingPairKey(deviceId: string, metric: string): string {
  return [normalizeIdentityPart(deviceId), normalizeIdentityPart(metric)].join(KEY_SEPARATOR)
}

export function createDispatchLiveTelemetryContextKey(
  descriptor: DispatchLiveTelemetryContextDescriptor,
): string {
  return [
    normalizeIdentityPart(descriptor.diagramId),
    normalizeIdentityPart(descriptor.edgeId),
    normalizeIdentityPart(descriptor.bindingProfileId),
  ].join(KEY_SEPARATOR)
}

export function createDispatchLiveTelemetryRequestKey(
  descriptor: DispatchLiveTelemetryRequestDescriptor,
): string {
  return normalizeIdentityPart(descriptor.edgeId)
}

export function isDispatchLiveTelemetryBindingPairRelevant(
  pair: DispatchLiveTelemetryBindingPair,
  relevantPairs: ReadonlySet<string>,
): boolean {
  return relevantPairs.has(createDispatchLiveTelemetryBindingPairKey(pair.deviceId, pair.metric))
}

export function selectDispatchLiveTelemetryBindingPairs(
  bindingProfile: Pick<DashboardBindingProfile, 'widgetBindings'> | null | undefined,
): Set<string> {
  const pairs = new Set<string>()

  for (const binding of bindingProfile?.widgetBindings ?? []) {
    const deviceId = normalizeIdentityPart(binding.deviceId)
    const metric = normalizeIdentityPart(binding.metric)

    if (deviceId.length > 0 && metric.length > 0) {
      pairs.add(createDispatchLiveTelemetryBindingPairKey(deviceId, metric))
    }
  }

  return pairs
}

export function normalizeDispatchLiveTelemetryRows(
  event: DashboardTelemetryEvent,
  options: NormalizeDispatchLiveTelemetryRowsOptions,
): DispatchLiveTelemetryRow[] {
  const receivedAtIso = toIsoTimestamp(options.receivedAt)
  let sequence = options.sequenceStart ?? 0

  return event.readings
    .filter((reading) => isDispatchLiveTelemetryBindingPairRelevant(reading, options.relevantPairs))
    .map((reading) => {
      const rowSequence = sequence
      sequence += 1
      const deviceId = normalizeIdentityPart(reading.deviceId)
      const metric = normalizeIdentityPart(reading.metric)

      return {
        id: [
          options.contextKey,
          String(options.receivedAt),
          String(rowSequence),
          createDispatchLiveTelemetryBindingPairKey(deviceId, metric),
        ].join(KEY_SEPARATOR),
        contextKey: options.contextKey,
        edgeId: event.edgeId,
        deviceId,
        metric,
        value: reading.last,
        receivedAt: options.receivedAt,
        receivedAtIso,
        eventTimestamp: reading.ts,
        eventTimestampIso: toIsoTimestamp(reading.ts),
        serverTimestamp: event.serverTs,
        serverTimestampIso: toIsoTimestamp(event.serverTs),
      }
    })
}

export function pruneDispatchLiveTelemetryRows(
  rows: readonly DispatchLiveTelemetryRow[],
  now: number,
  windowMs = DISPATCH_LIVE_TELEMETRY_WINDOW_MS,
): DispatchLiveTelemetryRow[] {
  const windowStart = now - windowMs
  return rows.filter((row) => row.receivedAt >= windowStart)
}

export function appendDispatchLiveTelemetryRows(
  existingRows: readonly DispatchLiveTelemetryRow[],
  newRows: readonly DispatchLiveTelemetryRow[],
  now: number,
  windowMs = DISPATCH_LIVE_TELEMETRY_WINDOW_MS,
): DispatchLiveTelemetryRow[] {
  return pruneDispatchLiveTelemetryRows([...existingRows, ...newRows], now, windowMs)
}

export function countDispatchLiveTelemetryWaitingRows(
  bufferedRows: readonly DispatchLiveTelemetryRow[],
  pausedSnapshotRows: readonly DispatchLiveTelemetryRow[],
): number {
  const visibleRowIds = new Set(pausedSnapshotRows.map((row) => row.id))
  return bufferedRows.reduce((count, row) => count + (visibleRowIds.has(row.id) ? 0 : 1), 0)
}
