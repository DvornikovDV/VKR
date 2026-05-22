import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DashboardAlarmRedLightIndicator } from '@/features/dashboard/components/DashboardAlarmRedLightIndicator'
import { DashboardAlarmToastNotice } from '@/features/dashboard/components/DashboardAlarmToastNotice'
import { createDashboardUnclosedAlarmIncidentChangedEventFixture } from './helpers/mockDashboardRuntimeSocket'

describe('Dashboard alarm red-light UI primitives', () => {
  it('exposes stable accessible anchors only when known unclosed incidents exist', () => {
    const { rerender } = render(<DashboardAlarmRedLightIndicator count={0} />)

    expect(screen.queryByTestId('dashboard-alarm-red-light-indicator')).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    rerender(<DashboardAlarmRedLightIndicator count={2} />)

    expect(
      screen.getByRole('status', { name: 'Известные незакрытые аварии: 2' }),
    ).toHaveAttribute('data-testid', 'dashboard-alarm-red-light-indicator')
    expect(screen.getByTestId('dashboard-alarm-red-light-count')).toHaveTextContent('2')
  })

  it('exposes a dismissible toast anchor without mutating incident identity', () => {
    const onDismiss = vi.fn()
    const incident = createDashboardUnclosedAlarmIncidentChangedEventFixture({
      incident: {
        incidentId: 'incident-toast-1',
        rule: {
          label: 'Compressor pressure',
        },
      },
    }).incident

    render(
      <DashboardAlarmToastNotice
        notice={{ incidentId: incident.incidentId, incident }}
        onDismiss={onDismiss}
      />,
    )

    const toast = screen.getByRole('alert', {
      name: 'Уведомление о незакрытой аварии для Compressor pressure',
    })
    expect(toast).toHaveAttribute('data-testid', 'dashboard-alarm-toast-notice')
    expect(toast).toHaveAttribute('data-incident-id', 'incident-toast-1')
    expect(screen.getByText('ID аварии: incident-toast-1')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Закрыть уведомление об аварии incident-toast-1' }))

    expect(onDismiss).toHaveBeenCalledWith('incident-toast-1')
  })
})
