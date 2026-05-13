import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from '@/shared/api/client'
import {
  getTelemetryHistory,
  type TelemetryHistoryResponse,
} from '@/shared/api/telemetryHistory'

vi.mock('@/shared/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api/client')>()
  return {
    ...actual,
    apiClient: {
      get: vi.fn(),
    },
  }
})

describe('telemetry history contract anchors', () => {
  beforeEach(() => {
    vi.mocked(apiClient.get).mockReset()
  })

  it('requests historic telemetry through apiClient.get and returns unwrapped response data', async () => {
    const response: TelemetryHistoryResponse = {
      edgeId: 'edge-1',
      deviceId: 'pump-1',
      metric: 'temperature',
      dateStart: '2026-05-13T00:00:00.000Z',
      dateEnd: '2026-05-13T01:00:00.000Z',
      maxPoints: 120,
      series: [
        {
          timeStart: '2026-05-13T00:00:00.000Z',
          timeEnd: '2026-05-13T00:05:00.000Z',
          pointTime: '2026-05-13T00:02:30.000Z',
          min: 20,
          max: 25,
          avg: 22.5,
          last: 24,
          count: 300,
        },
      ],
    }
    vi.mocked(apiClient.get).mockResolvedValue(response)

    await expect(
      getTelemetryHistory({
        edgeId: 'edge-1',
        deviceId: 'pump-1',
        metric: 'temperature',
        date_start: '2026-05-13T00:00:00.000Z',
        date_end: '2026-05-13T01:00:00.000Z',
        maxPoints: 120,
      }),
    ).resolves.toEqual(response)

    const expectedQuery = new URLSearchParams({
      edgeId: 'edge-1',
      deviceId: 'pump-1',
      metric: 'temperature',
      date_start: '2026-05-13T00:00:00.000Z',
      date_end: '2026-05-13T01:00:00.000Z',
      maxPoints: '120',
    }).toString()

    expect(apiClient.get).toHaveBeenCalledWith(`/telemetry/historic?${expectedQuery}`)
  })
})
