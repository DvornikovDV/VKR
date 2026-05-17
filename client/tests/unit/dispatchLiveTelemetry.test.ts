import { describe, expect, it } from 'vitest'
import {
  DISPATCH_LIVE_TELEMETRY_WINDOW_MS,
  appendDispatchLiveTelemetryRows,
  countDispatchLiveTelemetryWaitingRows,
  createDispatchLiveTelemetryBindingPairKey,
  normalizeDispatchLiveTelemetryRows,
  pruneDispatchLiveTelemetryRows,
  selectDispatchLiveTelemetryBindingPairs,
} from '@/features/dispatch/model/liveTelemetry'
import type { DashboardBindingProfile, DashboardTelemetryEvent } from '@/features/dashboard/model/types'

const bindingProfile: DashboardBindingProfile = {
  _id: 'profile-1',
  diagramId: 'diagram-1',
  edgeServerId: 'edge-1',
  widgetBindings: [
    { widgetId: 'temperature-a', deviceId: ' pump-1 ', metric: ' temperature ' },
    { widgetId: 'temperature-b', deviceId: 'pump-1', metric: 'temperature' },
    { widgetId: 'running', deviceId: 'pump-1', metric: 'running' },
  ],
  commandBindings: [],
}

function createTelemetryEvent(readings: DashboardTelemetryEvent['readings']): DashboardTelemetryEvent {
  return {
    edgeId: 'edge-1',
    serverTs: Date.parse('2026-05-17T10:00:00.000Z'),
    readings,
  }
}

describe('dispatch live telemetry helpers', () => {
  it('normalizes append-only rows and filters only by bound deviceId + metric pairs', () => {
    const pairs = selectDispatchLiveTelemetryBindingPairs(bindingProfile)
    const event = createTelemetryEvent([
      { deviceId: 'pump-1', metric: 'temperature', last: 23.5, ts: 100 },
      { deviceId: 'pump-1', metric: 'pressure', last: 2, ts: 101 },
      { deviceId: 'pump-1', metric: 'temperature', last: 24, ts: 50 },
      { deviceId: 'pump-1', metric: 'running', last: true, ts: 102 },
    ])

    const rows = normalizeDispatchLiveTelemetryRows(event, {
      contextKey: 'diagram-1:edge-1:profile-1',
      relevantPairs: pairs,
      receivedAt: Date.parse('2026-05-17T10:00:05.000Z'),
      sequenceStart: 7,
    })

    expect([...pairs]).toEqual([
      createDispatchLiveTelemetryBindingPairKey('pump-1', 'temperature'),
      createDispatchLiveTelemetryBindingPairKey('pump-1', 'running'),
    ])
    expect(rows).toHaveLength(3)
    expect(rows.map((row) => [row.deviceId, row.metric, row.value])).toEqual([
      ['pump-1', 'temperature', 23.5],
      ['pump-1', 'temperature', 24],
      ['pump-1', 'running', true],
    ])
    expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length)
    expect(rows[1].eventTimestamp).toBe(50)
  })

  it('prunes the in-memory buffer by receivedAt while keeping eventTimestamp as display data', () => {
    const now = Date.parse('2026-05-17T10:01:00.000Z')
    const pairs = new Set([createDispatchLiveTelemetryBindingPairKey('pump-1', 'temperature')])
    const buffer = appendDispatchLiveTelemetryRows(
      [],
      normalizeDispatchLiveTelemetryRows(
        createTelemetryEvent([
          { deviceId: 'pump-1', metric: 'temperature', last: 10, ts: now },
          { deviceId: 'pump-1', metric: 'temperature', last: 11, ts: now - 3_600_000 },
        ]),
        {
          contextKey: 'diagram-1:edge-1:profile-1',
          relevantPairs: pairs,
          receivedAt: now - DISPATCH_LIVE_TELEMETRY_WINDOW_MS - 1,
        },
      ),
      now,
    )

    const next = appendDispatchLiveTelemetryRows(
      buffer,
      normalizeDispatchLiveTelemetryRows(
        createTelemetryEvent([
          { deviceId: 'pump-1', metric: 'temperature', last: 12, ts: now - 3_600_000 },
        ]),
        {
          contextKey: 'diagram-1:edge-1:profile-1',
          relevantPairs: pairs,
          receivedAt: now,
          sequenceStart: buffer.length,
        },
      ),
      now,
    )

    expect(buffer).toEqual([])
    expect(next).toHaveLength(1)
    expect(next[0]).toMatchObject({
      value: 12,
      receivedAt: now,
      eventTimestamp: now - 3_600_000,
    })
    expect(pruneDispatchLiveTelemetryRows(next, now + DISPATCH_LIVE_TELEMETRY_WINDOW_MS + 1)).toEqual([])
  })

  it('counts waiting rows from the bounded buffer that are not in the paused snapshot', () => {
    const pairs = new Set([createDispatchLiveTelemetryBindingPairKey('pump-1', 'temperature')])
    const initialRows = normalizeDispatchLiveTelemetryRows(
      createTelemetryEvent([{ deviceId: 'pump-1', metric: 'temperature', last: 10, ts: 1 }]),
      {
        contextKey: 'diagram-1:edge-1:profile-1',
        relevantPairs: pairs,
        receivedAt: 1_000,
      },
    )
    const currentRows = appendDispatchLiveTelemetryRows(
      initialRows,
      normalizeDispatchLiveTelemetryRows(
        createTelemetryEvent([
          { deviceId: 'pump-1', metric: 'temperature', last: 11, ts: 2 },
          { deviceId: 'pump-1', metric: 'temperature', last: 12, ts: 3 },
        ]),
        {
          contextKey: 'diagram-1:edge-1:profile-1',
          relevantPairs: pairs,
          receivedAt: 2_000,
          sequenceStart: initialRows.length,
        },
      ),
      2_000,
    )

    expect(countDispatchLiveTelemetryWaitingRows(currentRows, initialRows)).toBe(2)
    expect(countDispatchLiveTelemetryWaitingRows(currentRows, currentRows)).toBe(0)
  })
})
