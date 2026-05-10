import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ackAlarmIncident } from '@/shared/api/alarmIncidents'
import { apiClient } from '@/shared/api/client'
import {
  countDashboardUnclosedAlarmIncidents,
  getDashboardAlarmIncidentIdentityLabel,
  getDashboardAlarmIncidentLifecycleLabel,
  getDashboardAlarmIncidentRowTime,
  isDashboardAlarmIncidentUnclosed,
  selectDashboardAlarmRedLightSummary,
  selectDashboardUnclosedAlarmIncidents,
  selectNewestDashboardUnclosedAlarmIncident,
  upsertDashboardAlarmIncident,
} from '@/features/dashboard/model/alarmIncidents'
import {
  createDashboardAlarmIncidentChangedEventFixture,
  createDashboardClosedAlarmIncidentChangedEventFixture,
  createDashboardUnclosedAlarmIncidentChangedEventFixture,
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

  it('derives red-light incidents only from active and acknowledged lifecycle flags', () => {
    const activeAcknowledged = createDashboardUnclosedAlarmIncidentChangedEventFixture({
      incident: {
        incidentId: 'incident-active-acked',
        isAcknowledged: true,
        lifecycleState: 'active_acknowledged',
        updatedAt: '2026-05-09T10:05:00.000Z',
      },
    }).incident
    const clearedUnacknowledged = createDashboardUnclosedAlarmIncidentChangedEventFixture({
      incident: {
        incidentId: 'incident-cleared-unacked',
        isActive: false,
        lifecycleState: 'cleared_unacknowledged',
        clearedAt: '2026-05-09T10:10:00.000Z',
        updatedAt: '2026-05-09T10:10:00.000Z',
      },
    }).incident
    const closed = createDashboardClosedAlarmIncidentChangedEventFixture({
      incident: {
        incidentId: 'incident-closed',
        updatedAt: '2026-05-09T10:15:00.000Z',
      },
    }).incident

    const incidents = [closed, clearedUnacknowledged, activeAcknowledged]
    const summary = selectDashboardAlarmRedLightSummary(incidents)

    expect(isDashboardAlarmIncidentUnclosed(activeAcknowledged)).toBe(true)
    expect(isDashboardAlarmIncidentUnclosed(clearedUnacknowledged)).toBe(true)
    expect(isDashboardAlarmIncidentUnclosed(closed)).toBe(false)
    expect(selectDashboardUnclosedAlarmIncidents(incidents)).toEqual([
      clearedUnacknowledged,
      activeAcknowledged,
    ])
    expect(countDashboardUnclosedAlarmIncidents(incidents)).toBe(2)
    expect(selectNewestDashboardUnclosedAlarmIncident(incidents)).toBe(clearedUnacknowledged)
    expect(summary).toEqual({
      unclosedCount: 2,
      unclosedIncidents: [clearedUnacknowledged, activeAcknowledged],
      newestUnclosedIncident: clearedUnacknowledged,
    })
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
