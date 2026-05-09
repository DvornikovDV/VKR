import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ackAlarmIncident } from '@/shared/api/alarmIncidents'
import { apiClient } from '@/shared/api/client'
import {
  getDashboardAlarmIncidentIdentityLabel,
  getDashboardAlarmIncidentLifecycleLabel,
  getDashboardAlarmIncidentRowTime,
  upsertDashboardAlarmIncident,
} from '@/features/dashboard/model/alarmIncidents'
import {
  createDashboardAlarmIncidentChangedEventFixture,
  createMockDashboardRuntimeClientHarness,
} from '../integration/helpers/mockDashboardRuntimeSocket'

vi.mock('@/shared/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api/client')>()
  return {
    ...actual,
    apiClient: {
      post: vi.fn(),
    },
  }
})

describe('alarm incident contract anchors', () => {
  beforeEach(() => {
    vi.mocked(apiClient.post).mockReset()
  })

  it('acknowledges through the unwrapped Cloud ACK response shape', async () => {
    const event = createDashboardAlarmIncidentChangedEventFixture({
      incident: {
        incidentId: 'incident-ack',
        isAcknowledged: true,
        acknowledgedAt: '2026-05-09T10:05:00.000Z',
        updatedAt: '2026-05-09T10:05:00.000Z',
      },
    })
    vi.mocked(apiClient.post).mockResolvedValue({ incident: event.incident })

    await expect(ackAlarmIncident('edge-1', 'incident-ack')).resolves.toEqual(event.incident)

    expect(apiClient.post).toHaveBeenCalledWith(
      '/edge-servers/edge-1/alarm-incidents/incident-ack/ack',
    )
  })

  it('derives incident display state and replacement without telemetry or local seed data', () => {
    const olderEvent = createDashboardAlarmIncidentChangedEventFixture({
      incident: {
        incidentId: 'incident-old',
        rule: {
          ...createDashboardAlarmIncidentChangedEventFixture().incident.rule,
          label: '  ',
        },
        updatedAt: '2026-05-09T10:00:00.000Z',
      },
    })
    const newerEvent = createDashboardAlarmIncidentChangedEventFixture({
      incident: {
        incidentId: 'incident-new',
        isActive: false,
        isAcknowledged: true,
        clearedAt: '2026-05-09T10:10:00.000Z',
        acknowledgedAt: '2026-05-09T10:11:00.000Z',
        updatedAt: '2026-05-09T10:11:00.000Z',
      },
    })
    const replacementEvent = createDashboardAlarmIncidentChangedEventFixture({
      incident: {
        incidentId: 'incident-old',
        isActive: true,
        isAcknowledged: true,
        acknowledgedAt: '2026-05-09T10:15:00.000Z',
        updatedAt: '2026-05-09T10:15:00.000Z',
      },
    })

    const incidents = upsertDashboardAlarmIncident(
      upsertDashboardAlarmIncident([olderEvent.incident], newerEvent.incident),
      replacementEvent.incident,
    )

    expect(incidents.map((incident) => incident.incidentId)).toEqual([
      'incident-old',
      'incident-new',
    ])
    expect(getDashboardAlarmIncidentLifecycleLabel(replacementEvent.incident)).toBe(
      'Active Acknowledged',
    )
    expect(getDashboardAlarmIncidentLifecycleLabel(newerEvent.incident)).toBe('Closed')
    expect(getDashboardAlarmIncidentIdentityLabel(olderEvent.incident)).toBe(
      'pump-1.temperature (rule-1)',
    )
    expect(getDashboardAlarmIncidentRowTime(newerEvent.incident)).toBe(
      '2026-05-09T10:11:00.000Z',
    )
  })

  it('lets runtime harness emit alarm incident callbacks for later runtime tests', () => {
    const harness = createMockDashboardRuntimeClientHarness()
    const receivedEvents: unknown[] = []
    const event = createDashboardAlarmIncidentChangedEventFixture()

    harness.startSession({
      edgeId: 'edge-1',
      onAlarmIncidentChanged: (nextEvent) => {
        receivedEvents.push(nextEvent)
      },
    })

    harness.emitAlarmIncidentChanged(event)

    expect(receivedEvents).toEqual([event])
  })
})
