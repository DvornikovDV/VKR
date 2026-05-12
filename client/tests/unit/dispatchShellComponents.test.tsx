import { fireEvent, render, screen, within } from '@testing-library/react'
import { useEffect, useState } from 'react'
import { MemoryRouter } from 'react-router-dom'
import {
  createDispatchActionSlotContextKey,
  DispatchActionSlotProvider,
  useDispatchActionSlot,
} from '@/features/dispatch/components/DispatchActionSlot'
import { DispatchContextBar } from '@/features/dispatch/components/DispatchContextBar'
import { DispatchPlaceholderTab } from '@/features/dispatch/components/DispatchPlaceholderTab'
import { DispatchTabs } from '@/features/dispatch/components/DispatchTabs'
import {
  DISPATCH_DASHBOARD_TAB,
  DISPATCH_TELEMETRY_TAB,
  type DispatchTabId,
} from '@/features/dispatch/model/routes'
import type {
  DispatchActionSlotRegistration,
  DispatchWorkspaceContextSnapshot,
} from '@/features/dispatch/model/types'

const diagram = {
  _id: 'diagram-1',
  name: 'Boiler diagram',
  layout: { widgets: [] },
}

const edge = {
  _id: 'edge-1',
  name: 'Boiler edge',
  lifecycleState: 'Active' as const,
  availability: { online: true, lastSeenAt: '2026-05-12T09:00:00.000Z' },
}

const bindingProfile = {
  _id: 'binding-1',
  diagramId: diagram._id,
  edgeServerId: edge._id,
  widgetBindings: [],
  commandBindings: [],
}

function createWorkspaceSnapshot(tabId: DispatchTabId): DispatchWorkspaceContextSnapshot {
  return {
    status: 'ready',
    routeState: {
      tabId,
      diagramId: diagram._id,
      edgeId: edge._id,
      selectionSource: 'route-prefill',
    },
    diagramOptions: [{ id: diagram._id, name: diagram.name, diagram }],
    edgeOptions: [
      {
        id: edge._id,
        name: edge.name,
        edge,
        hasBindingForSelectedDiagram: true,
      },
    ],
    bindingProfiles: [bindingProfile],
    selection: {
      diagramId: diagram._id,
      edgeId: edge._id,
      selectedDiagram: diagram,
      selectedEdge: edge,
      selectedBindingProfile: bindingProfile,
    },
    dashboardRuntime: {
      savedDiagram: null,
      edgeCatalog: null,
      edgeCatalogStatus: 'idle',
    },
    recoveryState: 'ready',
    errorMessage: null,
  }
}

function DashboardSlotRegistration({
  contextKey,
}: {
  contextKey: string
}) {
  const actionSlot = useDispatchActionSlot()

  useEffect(() => {
    const registration: DispatchActionSlotRegistration = {
      tabId: DISPATCH_DASHBOARD_TAB,
      contextKey,
      controls: [
        {
          id: 'dashboard.fitToView',
          label: 'Fit to view',
          content: (
            <button type="button" aria-label="Fit to view">
              Fit
            </button>
          ),
          order: 1,
        },
      ],
    }

    return actionSlot.register(registration)
  }, [actionSlot, contextKey])

  return null
}

function DispatchShellProbe() {
  const [activeTabId, setActiveTabId] = useState<DispatchTabId>(DISPATCH_DASHBOARD_TAB)
  const workspaceContext = createWorkspaceSnapshot(activeTabId)
  const actionContextKey = createDispatchActionSlotContextKey(workspaceContext.selection)

  return (
    <DispatchActionSlotProvider activeTabId={activeTabId} contextKey={actionContextKey}>
      <DispatchTabs activeTabId={activeTabId} />
      <DispatchContextBar
        workspaceContext={workspaceContext}
        activeTabId={activeTabId}
        onDiagramChange={() => undefined}
        onEdgeChange={() => undefined}
      />
      {activeTabId === DISPATCH_DASHBOARD_TAB ? (
        <DashboardSlotRegistration contextKey={actionContextKey} />
      ) : (
        <DispatchPlaceholderTab tabId={DISPATCH_TELEMETRY_TAB} workspaceContext={workspaceContext} />
      )}
      <button type="button" onClick={() => setActiveTabId(DISPATCH_TELEMETRY_TAB)}>
        Activate telemetry
      </button>
    </DispatchActionSlotProvider>
  )
}

describe('Dispatch shell component primitives (T007-T010)', () => {
  it('composes tabs, context bar, placeholders, and scoped action-slot cleanup', () => {
    render(
      <MemoryRouter initialEntries={['/hub/dispatch/dashboard?diagramId=diagram-1&edgeId=edge-1']}>
        <DispatchShellProbe />
      </MemoryRouter>,
    )

    expect(screen.getAllByLabelText('Diagram')).toHaveLength(1)
    expect(screen.getAllByLabelText('Edge Server')).toHaveLength(1)
    expect(screen.getByTestId('dispatch-selected-context')).toHaveTextContent('Boiler diagram')
    expect(screen.getByTestId('dispatch-selected-context')).toHaveTextContent('Boiler edge')
    expect(screen.getByRole('button', { name: 'Fit to view' })).toBeInTheDocument()

    const tabs = screen.getByRole('tablist', { name: 'Dispatch tabs' })
    expect(within(tabs).getByRole('tab', { name: 'Dashboard' })).toHaveAttribute(
      'href',
      '/hub/dispatch/dashboard?diagramId=diagram-1&edgeId=edge-1',
    )
    expect(within(tabs).getByRole('tab', { name: 'Telemetry' })).toHaveAttribute(
      'href',
      '/hub/dispatch/telemetry?diagramId=diagram-1&edgeId=edge-1',
    )

    fireEvent.click(screen.getByRole('button', { name: 'Activate telemetry' }))

    expect(screen.queryByRole('button', { name: 'Fit to view' })).not.toBeInTheDocument()
    expect(screen.getByTestId('dispatch-placeholder-context')).toHaveTextContent('Boiler diagram')
    expect(screen.getByTestId('dispatch-placeholder-context')).toHaveTextContent('Boiler edge')
  })
})
