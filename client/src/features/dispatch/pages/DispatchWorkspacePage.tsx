import { Navigate, useLocation } from 'react-router-dom'
import { DashboardPage } from '@/features/user-hub/pages/DashboardPage'
import {
  DispatchActionSlotProvider,
  createDispatchActionSlotContextKey,
} from '@/features/dispatch/components/DispatchActionSlot'
import { DispatchContextBar } from '@/features/dispatch/components/DispatchContextBar'
import {
  DispatchPlaceholderTab,
  type DispatchPlaceholderTabId,
} from '@/features/dispatch/components/DispatchPlaceholderTab'
import { DispatchTabs } from '@/features/dispatch/components/DispatchTabs'
import {
  resolveDispatchTabIdFromPathname,
  useDispatchRouteState,
} from '@/features/dispatch/hooks/useDispatchRouteState'
import { useDispatchWorkspaceContext } from '@/features/dispatch/hooks/useDispatchWorkspaceContext'
import {
  DISPATCH_ALARMS_TAB,
  DISPATCH_COMMANDS_TAB,
  DISPATCH_DASHBOARD_TAB,
  DISPATCH_DEFAULT_PATH,
  DISPATCH_ROUTE_PREFIX,
  DISPATCH_TELEMETRY_TAB,
  DISPATCH_TRENDS_TAB,
  getDispatchTabPath,
  type DispatchTabId,
} from '@/features/dispatch/model/routes'
import type { DispatchWorkspaceContextSnapshot } from '@/features/dispatch/model/types'

function normalizePathname(pathname: string): string {
  const normalized = pathname.replace(/\/+$/, '')
  return normalized.length > 0 ? normalized : '/'
}

function getCanonicalDispatchPath(pathname: string): string {
  const normalizedPathname = normalizePathname(pathname)

  if (normalizedPathname === DISPATCH_ROUTE_PREFIX) {
    return DISPATCH_DEFAULT_PATH
  }

  const tabId = resolveDispatchTabIdFromPathname(normalizedPathname)
  return getDispatchTabPath(tabId)
}

function renderDispatchTab(
  activeTabId: DispatchTabId,
  workspaceContext: DispatchWorkspaceContextSnapshot,
) {
  switch (activeTabId) {
    case DISPATCH_DASHBOARD_TAB:
      return <DashboardPage />
    case DISPATCH_TELEMETRY_TAB:
    case DISPATCH_COMMANDS_TAB:
    case DISPATCH_TRENDS_TAB:
    case DISPATCH_ALARMS_TAB:
      return (
        <DispatchPlaceholderTab
          tabId={activeTabId as DispatchPlaceholderTabId}
          workspaceContext={workspaceContext}
        />
      )
    default:
      return null
  }
}

function DispatchWorkspacePageContent() {
  const {
    routeState,
    isStructurallyInvalid,
    setRouteState,
  } = useDispatchRouteState()
  const activeTabId = routeState.tabId
  const workspaceContext = useDispatchWorkspaceContext({
    routeState,
    isRouteStateStructurallyInvalid: isStructurallyInvalid,
    loadDashboardRuntimeContext: activeTabId === DISPATCH_DASHBOARD_TAB,
  })
  const contextKey = createDispatchActionSlotContextKey(workspaceContext.selection)

  return (
    <DispatchActionSlotProvider activeTabId={activeTabId} contextKey={contextKey}>
      <section className="flex min-h-full flex-col bg-[#08111f]">
        <DispatchTabs activeTabId={activeTabId} />
        <DispatchContextBar
          workspaceContext={workspaceContext}
          activeTabId={activeTabId}
          onDiagramChange={(diagramId) =>
            setRouteState(
              { diagramId },
              {
                source: 'user-selection',
              },
            )
          }
          onEdgeChange={(edgeId) =>
            setRouteState(
              { edgeId },
              {
                source: 'user-selection',
              },
            )
          }
        />
        <div className="flex min-h-[24rem] flex-1 flex-col overflow-hidden">
          {renderDispatchTab(activeTabId, workspaceContext)}
        </div>
      </section>
    </DispatchActionSlotProvider>
  )
}

export function DispatchWorkspacePage() {
  const location = useLocation()
  const canonicalPath = getCanonicalDispatchPath(location.pathname)

  if (normalizePathname(location.pathname) !== canonicalPath) {
    return (
      <Navigate
        to={{
          pathname: canonicalPath,
          search: location.search,
        }}
        replace
      />
    )
  }

  return <DispatchWorkspacePageContent />
}
