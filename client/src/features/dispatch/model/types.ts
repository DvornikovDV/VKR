import type { ReactNode } from 'react'
import type {
  DashboardBindingProfile,
  DashboardCatalogLoadStatus,
  DashboardCommandCatalog,
  DashboardDiagramDocument,
  DashboardDiagramSummary,
  DashboardRecoveryState,
  DashboardSelectionSource,
  DashboardTrustedEdgeServer,
} from '@/features/dashboard/model/types'
import type { DispatchTabId } from '@/features/dispatch/model/routes'

export type DispatchSelectionSource = DashboardSelectionSource

export interface DispatchRouteState {
  tabId: DispatchTabId
  diagramId: string | null
  edgeId: string | null
  selectionSource: DispatchSelectionSource
}

export interface DispatchRouteStatePatch {
  diagramId?: string | null
  edgeId?: string | null
}

export interface DispatchDiagramOption {
  id: string
  name: string
  diagram: DashboardDiagramSummary
}

export interface DispatchEdgeOption {
  id: string
  name: string
  edge: DashboardTrustedEdgeServer
  hasBindingForSelectedDiagram: boolean
}

export type DispatchContextLoadStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface DispatchWorkspaceContextSelection {
  diagramId: string | null
  edgeId: string | null
  selectedDiagram: DashboardDiagramSummary | null
  selectedEdge: DashboardTrustedEdgeServer | null
  selectedBindingProfile: DashboardBindingProfile | null
}

export interface DispatchDashboardRuntimeContext {
  savedDiagram: DashboardDiagramDocument | null
  edgeCatalog: DashboardCommandCatalog | null
  edgeCatalogStatus: DashboardCatalogLoadStatus
}

export interface DispatchWorkspaceContextSnapshot {
  status: DispatchContextLoadStatus
  routeState: DispatchRouteState
  diagramOptions: DispatchDiagramOption[]
  edgeOptions: DispatchEdgeOption[]
  bindingProfiles: DashboardBindingProfile[]
  selection: DispatchWorkspaceContextSelection
  dashboardRuntime: DispatchDashboardRuntimeContext
  recoveryState: DashboardRecoveryState
  errorMessage: string | null
}

export type DispatchDashboardActionSlotControlId =
  | 'dashboard.redLight'
  | 'dashboard.fitToView'
  | 'dashboard.details'

export type DispatchActionSlotControlId =
  | DispatchDashboardActionSlotControlId
  | `${Exclude<DispatchTabId, 'dashboard'>}.${string}`

export interface DispatchActionSlotControl {
  id: DispatchActionSlotControlId
  label: string
  content: ReactNode
  order?: number
  disabled?: boolean
}

export interface DispatchActionSlotRegistration {
  tabId: DispatchTabId
  contextKey: string
  controls: DispatchActionSlotControl[]
}

export interface DispatchActionSlotApi {
  register: (registration: DispatchActionSlotRegistration) => () => void
  clearForTab: (tabId: DispatchTabId) => void
}
