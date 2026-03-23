import type {
  DashboardBindingProfile,
  DashboardDiagramDocument,
  DashboardEdgeAvailability,
  DashboardMetricValueByBindingKey,
  DashboardRuntimeProjection,
  DashboardRuntimeValue,
  DashboardTelemetryReading,
  DashboardTransportStatus,
  DashboardWidget,
  DashboardWidgetRuntimeProjection,
  DashboardWidgetValueById,
} from '@/features/dashboard/model/types'

export const DASHBOARD_BINDING_KEY_SEPARATOR = '::'

export const SUPPORTED_DASHBOARD_WIDGET_TYPES = new Set<string>([
  'number-display',
  'text-display',
  'led',
])

function toNonEmptyString(value: string): string {
  return value.trim()
}

function isSupportedRuntimeValue(value: unknown): value is DashboardRuntimeValue {
  return (
    value === null ||
    typeof value === 'number' ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  )
}

export function createDashboardBindingKey(deviceId: string, metric: string): string {
  return `${toNonEmptyString(deviceId)}${DASHBOARD_BINDING_KEY_SEPARATOR}${toNonEmptyString(metric)}`
}

export function mergeTelemetryReadingsByBindingKey(
  previous: DashboardMetricValueByBindingKey,
  readings: DashboardTelemetryReading[],
): DashboardMetricValueByBindingKey {
  const next: DashboardMetricValueByBindingKey = { ...previous }

  for (const reading of readings) {
    const deviceId = toNonEmptyString(reading.deviceId)
    const metric = toNonEmptyString(reading.metric)
    if (!deviceId || !metric) {
      continue
    }

    if (!isSupportedRuntimeValue(reading.last)) {
      continue
    }

    next[createDashboardBindingKey(deviceId, metric)] = reading.last
  }

  return next
}

export function selectWidgetValuesById(
  bindingProfile: DashboardBindingProfile | null | undefined,
  metricValueByBindingKey: DashboardMetricValueByBindingKey,
): DashboardWidgetValueById {
  if (!bindingProfile) {
    return {}
  }

  const widgetValues: DashboardWidgetValueById = {}

  for (const binding of bindingProfile.widgetBindings) {
    const widgetId = binding.widgetId.trim()
    const deviceId = binding.deviceId.trim()
    const metric = binding.metric.trim()

    if (!widgetId || !deviceId || !metric) {
      continue
    }

    const bindingKey = createDashboardBindingKey(deviceId, metric)
    if (!Object.prototype.hasOwnProperty.call(metricValueByBindingKey, bindingKey)) {
      continue
    }

    widgetValues[widgetId] = metricValueByBindingKey[bindingKey]
  }

  return widgetValues
}

export function projectDashboardWidgetValue(
  widgetType: string,
  value: DashboardRuntimeValue,
): DashboardRuntimeValue {
  if (value === null) {
    return null
  }

  if (widgetType === 'number-display') {
    if (typeof value === 'number') {
      return value
    }

    if (typeof value === 'boolean') {
      return value ? 1 : 0
    }

    if (typeof value === 'string') {
      const parsed = Number(value)
      return Number.isFinite(parsed) ? parsed : null
    }
  }

  if (widgetType === 'text-display') {
    return String(value)
  }

  if (widgetType === 'led') {
    return Boolean(value)
  }

  return value
}

function selectWidgets(diagram: DashboardDiagramDocument | null | undefined): DashboardWidget[] {
  if (!diagram || !diagram.layout || !Array.isArray(diagram.layout.widgets)) {
    return []
  }

  return diagram.layout.widgets.filter(
    (candidate): candidate is DashboardWidget =>
      Boolean(candidate) && typeof candidate === 'object' && !Array.isArray(candidate),
  )
}

export function selectWidgetRuntimeProjection(
  widgets: DashboardWidget[],
  bindingProfile: DashboardBindingProfile | null | undefined,
  widgetValuesById: DashboardWidgetValueById,
): DashboardWidgetRuntimeProjection[] {
  const boundWidgetIds = new Set<string>(
    (bindingProfile?.widgetBindings ?? []).map((binding) => binding.widgetId.trim()),
  )

  return widgets.map((widget) => {
    const widgetId = widget.id.trim()
    const widgetType = widget.type.trim()
    const isBound = boundWidgetIds.has(widgetId)
    const isSupported = SUPPORTED_DASHBOARD_WIDGET_TYPES.has(widgetType)
    const rawValue =
      Object.prototype.hasOwnProperty.call(widgetValuesById, widgetId) ?
        widgetValuesById[widgetId]
      : null

    return {
      widgetId,
      widgetType,
      isBound,
      isSupported,
      value: isSupported ? projectDashboardWidgetValue(widgetType, rawValue) : rawValue,
    }
  })
}

export function selectDashboardRuntimeProjection(
  diagram: DashboardDiagramDocument | null | undefined,
  bindingProfile: DashboardBindingProfile | null | undefined,
  metricValueByBindingKey: DashboardMetricValueByBindingKey,
): DashboardRuntimeProjection {
  const widgetValueById = selectWidgetValuesById(bindingProfile, metricValueByBindingKey)
  const widgets = selectWidgetRuntimeProjection(
    selectWidgets(diagram),
    bindingProfile,
    widgetValueById,
  )

  return {
    metricValueByBindingKey,
    widgetValueById,
    widgets,
  }
}

export function selectTransportStatusLabel(status: DashboardTransportStatus): string {
  switch (status) {
    case 'idle':
      return 'Idle'
    case 'connecting':
      return 'Connecting'
    case 'connected':
      return 'Connected'
    case 'reconnecting':
      return 'Reconnecting'
    case 'failed':
      return 'Connection failed'
    default:
      return 'Unknown'
  }
}

export function selectEdgeAvailabilityLabel(status: DashboardEdgeAvailability): string {
  switch (status) {
    case 'unknown':
      return 'Edge status unknown'
    case 'online':
      return 'Edge online'
    case 'offline':
      return 'Edge offline'
    default:
      return 'Edge status unknown'
  }
}
