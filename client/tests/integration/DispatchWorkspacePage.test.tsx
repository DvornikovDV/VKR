import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createDashboardVisualRestFixtures,
  dashboardVisualDiagram,
} from '../fixtures/dashboardVisualLayout'
import { useAuthStore } from '@/shared/store/useAuthStore'
import {
  authenticateDispatchWorkspaceUser,
  dispatchWorkspaceRuntimeHarness,
  renderDispatchWorkspaceRoute,
  setupDispatchWorkspaceRestFixtures,
} from './helpers/dispatchWorkspaceHarness'

vi.mock('@/features/dashboard/services/cloudRuntimeClient', async () => {
  const actual = await vi.importActual<typeof import('@/features/dashboard/services/cloudRuntimeClient')>(
    '@/features/dashboard/services/cloudRuntimeClient',
  )
  const { dashboardRuntimeClientHarness } = await import('./helpers/mockDashboardRuntimeSocket')

  return {
    ...actual,
    cloudRuntimeClient: {
      startSession: dashboardRuntimeClientHarness.startSession,
    },
  }
})

beforeEach(() => {
  dispatchWorkspaceRuntimeHarness.reset()
  authenticateDispatchWorkspaceUser()
})

afterEach(() => {
  act(() => {
    useAuthStore.setState({ session: null, isAuthenticated: false })
  })
})

describe('DispatchWorkspacePage routing', () => {
  it('proves Dispatch routing, query preservation, sidebar tabs, and legacy one-session compatibility through User Hub routes', async () => {
    setupDispatchWorkspaceRestFixtures({
      dashboard: createDashboardVisualRestFixtures(),
    })

    const defaultRoute = renderDispatchWorkspaceRoute('/hub/dispatch')

    await waitFor(() => {
      expect(defaultRoute.router.state.location.pathname).toBe('/hub/dispatch/dashboard')
    })
    expect(screen.getByRole('link', { name: 'Dispatch' })).toHaveAttribute('href', '/hub/dispatch')

    const tablist = screen.getByRole('tablist', { name: 'Dispatch tabs' })
    expect(within(tablist).getByRole('tab', { name: 'Dashboard' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(within(tablist).getByRole('tab', { name: 'Telemetry' })).toBeInTheDocument()
    expect(within(tablist).getByRole('tab', { name: 'Commands' })).toBeInTheDocument()
    expect(within(tablist).getByRole('tab', { name: 'Trends' })).toBeInTheDocument()
    expect(within(tablist).getByRole('tab', { name: 'Alarms' })).toBeInTheDocument()
    expect(dispatchWorkspaceRuntimeHarness.startSession).not.toHaveBeenCalled()
    defaultRoute.renderResult.unmount()

    dispatchWorkspaceRuntimeHarness.reset()
    const canonicalRoute = renderDispatchWorkspaceRoute(
      `/hub/dispatch/dashboard?diagramId=${dashboardVisualDiagram._id}&edgeId=edge-visual-1`,
    )

    await waitFor(() => {
      expect(canonicalRoute.router.state.location.pathname).toBe('/hub/dispatch/dashboard')
    })
    const canonicalSearchParams = new URLSearchParams(canonicalRoute.router.state.location.search)
    expect(canonicalSearchParams.get('diagramId')).toBe(dashboardVisualDiagram._id)
    expect(canonicalSearchParams.get('edgeId')).toBe('edge-visual-1')
    expect(await screen.findByTestId('dashboard-visual-surface')).toBeInTheDocument()

    await waitFor(() => {
      expect(dispatchWorkspaceRuntimeHarness.startSession).toHaveBeenCalledTimes(1)
    })
    expect(dispatchWorkspaceRuntimeHarness.startSession).toHaveBeenCalledWith(
      expect.objectContaining({ edgeId: 'edge-visual-1' }),
    )

    await userEvent.setup().click(screen.getByRole('tab', { name: 'Telemetry' }))
    await waitFor(() => {
      expect(canonicalRoute.router.state.location.pathname).toBe('/hub/dispatch/telemetry')
    })
    const telemetrySearchParams = new URLSearchParams(canonicalRoute.router.state.location.search)
    expect(telemetrySearchParams.get('diagramId')).toBe(dashboardVisualDiagram._id)
    expect(telemetrySearchParams.get('edgeId')).toBe('edge-visual-1')
    expect(screen.getByRole('tab', { name: 'Telemetry' })).toHaveAttribute('aria-selected', 'true')
    expect(await screen.findByRole('heading', { name: 'Telemetry placeholder' })).toBeInTheDocument()
    expect(dispatchWorkspaceRuntimeHarness.startSession).toHaveBeenCalledTimes(1)
    canonicalRoute.renderResult.unmount()

    dispatchWorkspaceRuntimeHarness.reset()
    const legacyRoute = renderDispatchWorkspaceRoute(
      `/hub/dashboard?diagramId=${dashboardVisualDiagram._id}&edgeId=edge-visual-1`,
    )

    await waitFor(() => {
      expect(legacyRoute.router.state.location.pathname).toBe('/hub/dispatch/dashboard')
    })
    const legacySearchParams = new URLSearchParams(legacyRoute.router.state.location.search)
    expect(legacySearchParams.get('diagramId')).toBe(dashboardVisualDiagram._id)
    expect(legacySearchParams.get('edgeId')).toBe('edge-visual-1')

    expect(await screen.findByRole('tab', { name: 'Dashboard' })).toHaveAttribute(
      'aria-selected',
      'true',
    )

    await waitFor(() => {
      expect(dispatchWorkspaceRuntimeHarness.startSession).toHaveBeenCalledTimes(1)
    })
    expect(dispatchWorkspaceRuntimeHarness.startSession).toHaveBeenCalledWith(
      expect.objectContaining({ edgeId: 'edge-visual-1' }),
    )
  })
})
