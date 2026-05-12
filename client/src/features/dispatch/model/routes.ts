export const DISPATCH_ROUTE_PREFIX = '/hub/dispatch' as const
export const DISPATCH_LEGACY_DASHBOARD_PATH = '/hub/dashboard' as const

export const DISPATCH_DASHBOARD_TAB = 'dashboard' as const
export const DISPATCH_TELEMETRY_TAB = 'telemetry' as const
export const DISPATCH_COMMANDS_TAB = 'commands' as const
export const DISPATCH_TRENDS_TAB = 'trends' as const
export const DISPATCH_ALARMS_TAB = 'alarms' as const

export const DISPATCH_TAB_IDS = [
  DISPATCH_DASHBOARD_TAB,
  DISPATCH_TELEMETRY_TAB,
  DISPATCH_COMMANDS_TAB,
  DISPATCH_TRENDS_TAB,
  DISPATCH_ALARMS_TAB,
] as const

export type DispatchTabId = (typeof DISPATCH_TAB_IDS)[number]

export interface DispatchTabRouteDefinition {
  id: DispatchTabId
  label: string
  path: string
  segment: DispatchTabId
  isRuntimeTab: boolean
}

export const DISPATCH_TAB_ROUTES = [
  {
    id: DISPATCH_DASHBOARD_TAB,
    label: 'Dashboard',
    path: `${DISPATCH_ROUTE_PREFIX}/${DISPATCH_DASHBOARD_TAB}`,
    segment: DISPATCH_DASHBOARD_TAB,
    isRuntimeTab: true,
  },
  {
    id: DISPATCH_TELEMETRY_TAB,
    label: 'Telemetry',
    path: `${DISPATCH_ROUTE_PREFIX}/${DISPATCH_TELEMETRY_TAB}`,
    segment: DISPATCH_TELEMETRY_TAB,
    isRuntimeTab: false,
  },
  {
    id: DISPATCH_COMMANDS_TAB,
    label: 'Commands',
    path: `${DISPATCH_ROUTE_PREFIX}/${DISPATCH_COMMANDS_TAB}`,
    segment: DISPATCH_COMMANDS_TAB,
    isRuntimeTab: false,
  },
  {
    id: DISPATCH_TRENDS_TAB,
    label: 'Trends',
    path: `${DISPATCH_ROUTE_PREFIX}/${DISPATCH_TRENDS_TAB}`,
    segment: DISPATCH_TRENDS_TAB,
    isRuntimeTab: false,
  },
  {
    id: DISPATCH_ALARMS_TAB,
    label: 'Alarms',
    path: `${DISPATCH_ROUTE_PREFIX}/${DISPATCH_ALARMS_TAB}`,
    segment: DISPATCH_ALARMS_TAB,
    isRuntimeTab: false,
  },
] as const satisfies readonly DispatchTabRouteDefinition[]

export const DISPATCH_DEFAULT_TAB_ID: DispatchTabId = DISPATCH_DASHBOARD_TAB
export const DISPATCH_DEFAULT_PATH = `${DISPATCH_ROUTE_PREFIX}/${DISPATCH_DEFAULT_TAB_ID}` as const

export const DISPATCH_ROUTE_QUERY_KEYS = {
  diagramId: 'diagramId',
  edgeId: 'edgeId',
} as const

export function isDispatchTabId(value: string | null | undefined): value is DispatchTabId {
  return DISPATCH_TAB_IDS.includes(value as DispatchTabId)
}

export function getDispatchTabRoute(tabId: DispatchTabId): DispatchTabRouteDefinition {
  return DISPATCH_TAB_ROUTES.find((route) => route.id === tabId) ?? DISPATCH_TAB_ROUTES[0]
}

export function getDispatchTabPath(tabId: DispatchTabId): string {
  return getDispatchTabRoute(tabId).path
}

export function normalizeDispatchTabId(value: string | null | undefined): DispatchTabId {
  return isDispatchTabId(value) ? value : DISPATCH_DEFAULT_TAB_ID
}
