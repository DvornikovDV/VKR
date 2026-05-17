import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DispatchAlarmJournalTable } from '@/features/dispatch/components/DispatchAlarmJournalTable'
import { DispatchAlarmJournalToolbar } from '@/features/dispatch/components/DispatchAlarmJournalToolbar'
import { getDispatchAlarmJournalClosedAt } from '@/features/dispatch/model/alarmJournal'
import {
  createDispatchActiveUnacknowledgedAlarmIncidentProjectionFixture,
  createDispatchClosedAlarmIncidentProjectionFixture,
} from './helpers/dispatchWorkspaceHarness'

describe('Dispatch Alarm Journal presentation components', () => {
  it('renders operator-facing incident fields and ACK controls from explicit projection props', async () => {
    const activeIncident = createDispatchActiveUnacknowledgedAlarmIncidentProjectionFixture({
      incidentId: 'incident-active-1',
      edgeId: 'edge-visual-1',
      deviceId: 'boiler-1',
      metric: 'temperature',
      ruleId: 'rule-temp-high',
      latestValue: 98,
      rule: {
        label: 'Boiler temperature high',
        severity: 'danger',
        conditionType: 'high',
        triggerThreshold: 90,
        clearThreshold: 75,
      },
    })
    const closedIncident = createDispatchClosedAlarmIncidentProjectionFixture({
      incidentId: 'incident-closed-1',
      edgeId: 'edge-visual-1',
      deviceId: 'pump-2',
      metric: 'pressure',
      ruleId: 'rule-pressure-low',
      clearedAt: '2026-05-09T10:10:00.000Z',
      acknowledgedAt: '2026-05-09T10:12:00.000Z',
      latestValue: 12,
      rule: {
        label: 'Pump pressure low',
        severity: 'warning',
        conditionType: 'low',
        triggerThreshold: 20,
        clearThreshold: 25,
      },
    })
    const onAcknowledgeIncident = vi.fn()
    const user = userEvent.setup()

    render(
      <DispatchAlarmJournalTable
        incidents={[activeIncident, closedIncident]}
        ackErrorsByIncidentId={{ [activeIncident.incidentId]: 'ACK failed' }}
        onAcknowledgeIncident={onAcknowledgeIncident}
      />,
    )

    const activeRow = screen.getByTestId('dispatch-alarm-journal-row-incident-active-1')
    expect(within(activeRow).getByText('Boiler temperature high')).toBeInTheDocument()
    expect(within(activeRow).getByText('boiler-1 / temperature')).toBeInTheDocument()
    expect(
      within(activeRow).getByText('High condition: latest 98; trigger 90; clear 75'),
    ).toBeInTheDocument()
    expect(within(activeRow).getByText('Danger')).toBeInTheDocument()
    expect(within(activeRow).getByText('Active unacknowledged')).toBeInTheDocument()
    expect(activeRow.querySelector('time[datetime="2026-05-09T10:00:00.000Z"]')).toBeInTheDocument()
    expect(within(activeRow).getByText('ACK failed')).toBeInTheDocument()

    await user.click(within(activeRow).getByRole('button', { name: /Acknowledge alarm/i }))
    expect(onAcknowledgeIncident).toHaveBeenCalledWith(activeIncident)

    const closedRow = screen.getByTestId('dispatch-alarm-journal-row-incident-closed-1')
    expect(within(closedRow).getByText('pump-2 / pressure')).toBeInTheDocument()
    expect(within(closedRow).getByText('Closed')).toBeInTheDocument()
    expect(
      within(screen.getByTestId('dispatch-alarm-journal-closed-at-incident-closed-1')).getByText(
        getDispatchAlarmJournalClosedAt(closedIncident)!,
      ),
    ).toBeInTheDocument()
    expect(within(closedRow).getByText('Acknowledged')).toBeInTheDocument()
  })

  it('renders toolbar state, refresh, and bounded pagination controls in one compact bar', async () => {
    const onStateChange = vi.fn()
    const onRefresh = vi.fn()
    const onPreviousPage = vi.fn()
    const onNextPage = vi.fn()
    const user = userEvent.setup()

    render(
      <DispatchAlarmJournalToolbar
        state="unclosed"
        visibleCount={50}
        total={125}
        pagination={{ page: 2, limit: 50, total: 125, hasNextPage: true }}
        onStateChange={onStateChange}
        onRefresh={onRefresh}
        onPreviousPage={onPreviousPage}
        onNextPage={onNextPage}
      />,
    )

    const toolbar = screen.getByTestId('dispatch-alarm-journal-toolbar')
    await user.selectOptions(within(toolbar).getByRole('combobox', { name: 'Alarm incident state' }), 'all')
    expect(onStateChange).toHaveBeenCalledWith('all')

    await user.click(within(toolbar).getByRole('button', { name: /Refresh/i }))
    expect(onRefresh).toHaveBeenCalledTimes(1)
    expect(within(toolbar).getByText('Page 2 | 50 incidents visible | 125 total')).toBeInTheDocument()

    await user.click(within(toolbar).getByRole('button', { name: 'Previous alarm journal page' }))
    await user.click(within(toolbar).getByRole('button', { name: 'Next alarm journal page' }))
    expect(onPreviousPage).toHaveBeenCalledTimes(1)
    expect(onNextPage).toHaveBeenCalledTimes(1)
  })
})
