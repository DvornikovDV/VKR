import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ackAlarmIncident, listAlarmIncidents } from '@/shared/api/alarmIncidents'
import { apiClient } from '@/shared/api/client'
import {
  countDashboardUnclosedAlarmIncidents,
  getDashboardAlarmIncidentConditionSummary,
  getDashboardAlarmIncidentDisplayDetails,
  getDashboardAlarmIncidentEquipmentIdentityLabel,
  getDashboardAlarmIncidentIdentityLabel,
  getDashboardAlarmIncidentLifecycleTimestamps,
  getDashboardAlarmIncidentLifecycleLabel,
  getDashboardAlarmIncidentRowTime,
  getDashboardAlarmIncidentRuleTitle,
  isDashboardAlarmIncidentUnclosed,
  selectDashboardAlarmRedLightSummary,
  selectDashboardUnclosedAlarmIncidents,
  selectNewestDashboardUnclosedAlarmIncident,
  upsertDashboardAlarmIncident,
} from '@/features/dashboard/model/alarmIncidents'
import {
  createDashboardAlarmIncidentChangedEventFixture,
  createDashboardActiveUnacknowledgedAlarmIncidentProjectionFixture,
  createDashboardClosedAlarmIncidentChangedEventFixture,
  createDashboardUnclosedAlarmIncidentChangedEventFixture,
  createMockDashboardRuntimeClientHarness,
} from '../integration/helpers/mockDashboardRuntimeSocket'

vi.mock('@/shared/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api/client')>()
  return {
    ...actual,
    apiClient: {
      get: vi.fn(),
      post: vi.fn(),
    },
  }
})

describe('alarm incident contract anchors', () => {
  beforeEach(() => {
    vi.mocked(apiClient.get).mockReset()
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

  it('lists incidents through apiClient.get using the unwrapped Cloud list response', async () => {
    const incident = createDashboardActiveUnacknowledgedAlarmIncidentProjectionFixture({
      incidentId: 'incident-list',
    })
    const response = {
      incidents: [incident],
      page: 2,
      limit: 25,
      total: 26,
      hasNextPage: true,
    }
    vi.mocked(apiClient.get).mockResolvedValue(response)

    await expect(
      listAlarmIncidents('edge-1', {
        state: 'all',
        page: 2,
        limit: 25,
        sort: 'latest',
        order: 'asc',
      }),
    ).resolves.toEqual(response)

    expect(apiClient.get).toHaveBeenCalledWith(
      '/edge-servers/edge-1/alarm-incidents?state=all&page=2&limit=25&sort=latest&order=asc',
    )
    expect(apiClient.post).not.toHaveBeenCalled()
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
    expect(getDashboardAlarmIncidentRuleTitle(olderEvent.incident)).toBe('rule-1')
    expect(getDashboardAlarmIncidentEquipmentIdentityLabel(olderEvent.incident)).toBe(
      'pump-1 / temperature',
    )
    expect(getDashboardAlarmIncidentConditionSummary(olderEvent.incident)).toBe(
      'High condition: latest 42.5; trigger 40; clear 35',
    )
    expect(getDashboardAlarmIncidentRowTime(newerEvent.incident)).toBe(
      '2026-05-09T10:11:00.000Z',
    )
    expect(getDashboardAlarmIncidentLifecycleTimestamps(newerEvent.incident)).toEqual({
      activatedAt: '2026-05-09T10:00:00.000Z',
      clearedAt: '2026-05-09T10:10:00.000Z',
      acknowledgedAt: '2026-05-09T10:11:00.000Z',
      closedAt: '2026-05-09T10:11:00.000Z',
    })
    expect(getDashboardAlarmIncidentDisplayDetails(newerEvent.incident)).toEqual(
      expect.objectContaining({
        ruleTitle: 'High temperature',
        equipmentIdentity: 'pump-1 / temperature',
        conditionSummary: 'High condition: latest 42.5; trigger 40; clear 35',
        lifecycleLabel: 'Closed',
        latestRowTime: '2026-05-09T10:11:00.000Z',
      }),
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
