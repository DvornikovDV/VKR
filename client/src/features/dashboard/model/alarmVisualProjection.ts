import {
  getDashboardAlarmIncidentLifecycleState,
  isDashboardAlarmIncidentUnclosed,
} from '@/features/dashboard/model/alarmIncidents'
import { createDashboardBindingKey } from '@/features/dashboard/model/selectors'
import type {
  DashboardAlarmIncidentProjection,
  DashboardAlarmSeverity,
  DashboardAlarmVisualIncidentRef,
  DashboardAlarmVisualLifecycleMode,
  DashboardAlarmVisualProjectionInput,
  DashboardAlarmVisualState,
  DashboardImageAlarmVisualState,
  DashboardWidget,
} from '@/features/dashboard/model/types'

export type {
  DashboardAlarmVisualIncidentRef,
  DashboardAlarmVisualLifecycleMode,
  DashboardAlarmVisualProjectionInput,
  DashboardAlarmVisualState,
  DashboardImageAlarmVisualState,
  DashboardImageAlarmVisualStateByImageId,
  DashboardWidgetAlarmVisualState,
  DashboardWidgetAlarmVisualStateByWidgetId,
} from '@/features/dashboard/model/types'

const DASHBOARD_ALARM_VISUAL_SEVERITY_PRIORITY: Record<DashboardAlarmSeverity, number> = {
  warning: 1,
  danger: 2,
}

const DASHBOARD_ALARM_VISUAL_LIFECYCLE_PRIORITY: Record<DashboardAlarmVisualLifecycleMode, number> = {
  cleared_unacknowledged: 1,
  active_acknowledged: 2,
  active_unacknowledged: 3,
}

function createEmptyDashboardAlarmVisualState(): DashboardAlarmVisualState {
  return {
    widgetById: {},
    imageById: {},
  }
}

function hasNonEmptyString(value: string): boolean {
  return value.trim().length > 0
}

function selectRenderableWidgetById(widgets: readonly DashboardWidget[]): Map<string, DashboardWidget> {
  return new Map(widgets.map((widget) => [widget.id, widget]))
}

function buildWidgetIdsByAlarmBindingKey(
  input: Pick<DashboardAlarmVisualProjectionInput, 'bindingProfile' | 'runtimeLayout'>,
): Map<string, string[]> {
  const widgetIdsByBindingKey = new Map<string, string[]>()
  const seenWidgetIdsByBindingKey = new Map<string, Set<string>>()
  const renderableWidgetById = selectRenderableWidgetById(input.runtimeLayout.runtimeRenderableWidgets)

  for (const binding of input.bindingProfile?.widgetBindings ?? []) {
    const widgetId = binding.widgetId.trim()
    const deviceId = binding.deviceId.trim()
    const metric = binding.metric.trim()

    if (!hasNonEmptyString(widgetId) || !hasNonEmptyString(deviceId) || !hasNonEmptyString(metric)) {
      continue
    }

    if (!renderableWidgetById.has(widgetId)) {
      continue
    }

    const bindingKey = createDashboardBindingKey(deviceId, metric)
    const seenWidgetIds = seenWidgetIdsByBindingKey.get(bindingKey) ?? new Set<string>()
    if (seenWidgetIds.has(widgetId)) {
      continue
    }

    seenWidgetIds.add(widgetId)
    seenWidgetIdsByBindingKey.set(bindingKey, seenWidgetIds)
    widgetIdsByBindingKey.set(bindingKey, [
      ...(widgetIdsByBindingKey.get(bindingKey) ?? []),
      widgetId,
    ])
  }

  return widgetIdsByBindingKey
}

export function selectDashboardAlarmVisualLifecycleMode(
  incident: Pick<DashboardAlarmIncidentProjection, 'isActive' | 'isAcknowledged'>,
): DashboardAlarmVisualLifecycleMode | null {
  if (!isDashboardAlarmIncidentUnclosed(incident)) {
    return null
  }

  const lifecycleState = getDashboardAlarmIncidentLifecycleState(incident)
  return lifecycleState === 'closed' ? null : lifecycleState
}

export function compareDashboardAlarmVisualSeverity(
  left: DashboardAlarmSeverity,
  right: DashboardAlarmSeverity,
): number {
  return DASHBOARD_ALARM_VISUAL_SEVERITY_PRIORITY[left] - DASHBOARD_ALARM_VISUAL_SEVERITY_PRIORITY[right]
}

export function compareDashboardAlarmVisualLifecycleMode(
  left: DashboardAlarmVisualLifecycleMode,
  right: DashboardAlarmVisualLifecycleMode,
): number {
  return DASHBOARD_ALARM_VISUAL_LIFECYCLE_PRIORITY[left] - DASHBOARD_ALARM_VISUAL_LIFECYCLE_PRIORITY[right]
}

function selectStrongestSeverity(
  current: DashboardAlarmSeverity,
  candidate: DashboardAlarmSeverity,
): DashboardAlarmSeverity {
  return compareDashboardAlarmVisualSeverity(candidate, current) > 0 ? candidate : current
}

function selectStrongestLifecycleMode(
  current: DashboardAlarmVisualLifecycleMode,
  candidate: DashboardAlarmVisualLifecycleMode,
): DashboardAlarmVisualLifecycleMode {
  return compareDashboardAlarmVisualLifecycleMode(candidate, current) > 0 ? candidate : current
}

function createIncidentRef(
  incident: DashboardAlarmIncidentProjection,
  lifecycleMode: DashboardAlarmVisualLifecycleMode,
): DashboardAlarmVisualIncidentRef {
  return {
    incidentId: incident.incidentId,
    edgeId: incident.edgeId,
    deviceId: incident.deviceId,
    metric: incident.metric,
    severity: incident.rule.severity,
    lifecycleMode,
  }
}

function appendWidgetIncident(
  state: DashboardAlarmVisualState,
  widgetId: string,
  incidentRef: DashboardAlarmVisualIncidentRef,
) {
  const previous = state.widgetById[widgetId]

  if (!previous) {
    state.widgetById[widgetId] = {
      widgetId,
      count: 1,
      severity: incidentRef.severity,
      lifecycleMode: incidentRef.lifecycleMode,
      incidents: [incidentRef],
    }
    return
  }

  if (previous.incidents.some((incident) => incident.incidentId === incidentRef.incidentId)) {
    return
  }

  previous.count += 1
  previous.severity = selectStrongestSeverity(previous.severity, incidentRef.severity)
  previous.lifecycleMode = selectStrongestLifecycleMode(previous.lifecycleMode, incidentRef.lifecycleMode)
  previous.incidents.push(incidentRef)
}

function appendImageIncident(
  imageState: DashboardImageAlarmVisualState,
  widgetId: string,
  incidentRef: DashboardAlarmVisualIncidentRef,
) {
  const bindingKey = createDashboardBindingKey(incidentRef.deviceId, incidentRef.metric)

  imageState.count += 1
  imageState.severity = selectStrongestSeverity(imageState.severity, incidentRef.severity)
  imageState.lifecycleMode = selectStrongestLifecycleMode(
    imageState.lifecycleMode,
    incidentRef.lifecycleMode,
  )
  if (!imageState.widgetIds.includes(widgetId)) {
    imageState.widgetIds.push(widgetId)
  }
  if (!imageState.bindingKeys.includes(bindingKey)) {
    imageState.bindingKeys.push(bindingKey)
  }
  imageState.incidents.push(incidentRef)
}

function aggregateImageAlarmState(
  state: DashboardAlarmVisualState,
  input: Pick<DashboardAlarmVisualProjectionInput, 'runtimeLayout'>,
) {
  for (const widgetState of Object.values(state.widgetById)) {
    const widget = input.runtimeLayout.widgetById.get(widgetState.widgetId)
    const imageId = widget?.imageId?.trim()

    if (!imageId || !input.runtimeLayout.runtimeRenderableImageById.has(imageId)) {
      continue
    }

    for (const incidentRef of widgetState.incidents) {
      const previous = state.imageById[imageId]

      if (!previous) {
        state.imageById[imageId] = {
          imageId,
          count: 1,
          severity: incidentRef.severity,
          lifecycleMode: incidentRef.lifecycleMode,
          widgetIds: [widgetState.widgetId],
          bindingKeys: [createDashboardBindingKey(incidentRef.deviceId, incidentRef.metric)],
          incidents: [incidentRef],
        }
        continue
      }

      appendImageIncident(previous, widgetState.widgetId, incidentRef)
    }
  }
}

export function selectDashboardAlarmVisualState(
  input: DashboardAlarmVisualProjectionInput,
): DashboardAlarmVisualState {
  const selectedEdgeId = input.selectedEdgeId.trim()
  if (!selectedEdgeId || !input.bindingProfile) {
    return createEmptyDashboardAlarmVisualState()
  }

  if (input.bindingProfile.edgeServerId.trim() !== selectedEdgeId) {
    return createEmptyDashboardAlarmVisualState()
  }

  const widgetIdsByBindingKey = buildWidgetIdsByAlarmBindingKey(input)
  if (widgetIdsByBindingKey.size === 0) {
    return createEmptyDashboardAlarmVisualState()
  }

  const state = createEmptyDashboardAlarmVisualState()

  for (const incident of input.incidents) {
    if (incident.edgeId.trim() !== selectedEdgeId) {
      continue
    }

    const lifecycleMode = selectDashboardAlarmVisualLifecycleMode(incident)
    if (!lifecycleMode) {
      continue
    }

    const deviceId = incident.deviceId.trim()
    const metric = incident.metric.trim()
    if (!hasNonEmptyString(deviceId) || !hasNonEmptyString(metric)) {
      continue
    }

    const widgetIds = widgetIdsByBindingKey.get(createDashboardBindingKey(deviceId, metric)) ?? []
    if (widgetIds.length === 0) {
      continue
    }

    const incidentRef = createIncidentRef(incident, lifecycleMode)
    for (const widgetId of widgetIds) {
      appendWidgetIncident(state, widgetId, incidentRef)
    }
  }

  aggregateImageAlarmState(state, input)

  return state
}
