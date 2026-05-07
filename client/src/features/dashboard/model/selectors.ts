import type {
  DashboardBindingProfile,
  DashboardCommandBinding,
  DashboardCommandCapability,
  DashboardCommandCatalog,
  DashboardCommandRuntimeProjection,
  DashboardCommandType,
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

const COMMAND_WIDGET_TYPES_BY_COMMAND_TYPE: Record<string, DashboardCommandType> = {
  toggle: 'set_bool',
  slider: 'set_number',
}

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

function projectLedValue(value: DashboardRuntimeValue): boolean {
  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'number') {
    return value !== 0
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (!normalized) {
      return false
    }

    if (normalized === 'false' || normalized === '0' || normalized === 'off' || normalized === 'no') {
      return false
    }

    if (normalized === 'true' || normalized === '1' || normalized === 'on' || normalized === 'yes') {
      return true
    }

    const parsed = Number(normalized)
    return Number.isFinite(parsed) ? parsed !== 0 : true
  }

  return false
}

function selectSavedUnitLabel(widget: DashboardWidget): string | null {
  if (typeof widget.unit !== 'string') {
    return null
  }

  const trimmed = widget.unit.trim()
  return trimmed.length > 0 ? trimmed : null
}

function selectPendingWidgetValue(widget: DashboardWidget): DashboardRuntimeValue {
  const widgetType = widget.type.trim()

  if (widgetType === 'number-display') {
    if (isSupportedRuntimeValue(widget.displayValue)) {
      return projectDashboardWidgetValue(widgetType, widget.displayValue)
    }

    return null
  }

  if (widgetType === 'text-display') {
    if (typeof widget.text === 'string') {
      return widget.text
    }

    if (isSupportedRuntimeValue(widget.displayValue)) {
      return projectDashboardWidgetValue(widgetType, widget.displayValue)
    }

    return null
  }

  return null
}

function formatVisualWidgetValue(
  widgetType: string,
  value: DashboardRuntimeValue,
  unitLabel: string | null,
): string {
  if (value === null) {
    return 'Pending'
  }

  const renderedValue = String(value)
  if (widgetType === 'number-display' && unitLabel) {
    return `${renderedValue} ${unitLabel}`
  }

  return renderedValue
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
    return projectLedValue(value)
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
    const hasLiveValue = Object.prototype.hasOwnProperty.call(widgetValuesById, widgetId)
    const rawValue = hasLiveValue ? widgetValuesById[widgetId] : null
    const pendingValue = selectPendingWidgetValue(widget)
    const value = isSupported ? projectDashboardWidgetValue(widgetType, rawValue) : rawValue
    const projectedValue = hasLiveValue ? value : pendingValue
    const unitLabel = widgetType === 'number-display' ? selectSavedUnitLabel(widget) : null

    return {
      widgetId,
      widgetType,
      isBound,
      isSupported,
      value: projectedValue,
      visualValue: formatVisualWidgetValue(widgetType, projectedValue, unitLabel),
      valueState: hasLiveValue ? 'live' : 'pending',
      unitLabel,
    }
  })
}

function selectCommandBindingForWidget(
  commandBindings: DashboardCommandBinding[],
  widgetId: string,
): DashboardCommandBinding | null {
  for (const binding of commandBindings) {
    if (binding.widgetId.trim() === widgetId) {
      return binding
    }
  }

  return null
}

function selectCatalogCommandForBinding(
  catalog: DashboardCommandCatalog | null | undefined,
  commandBinding: DashboardCommandBinding,
): DashboardCommandCapability | null {
  if (!catalog) {
    return null
  }

  const deviceId = commandBinding.deviceId.trim()
  const commandType = commandBinding.commandType

  for (const command of catalog.commands) {
    if (command.deviceId.trim() !== deviceId) {
      continue
    }

    if (command.commandType !== commandType) {
      continue
    }

    return command
  }

  return null
}

interface DashboardCompatibleCommandMatch {
  catalogCommand: DashboardCommandCapability
  reportedWidgetBinding: DashboardBindingProfile['widgetBindings'][number]
}

function selectReportedWidgetBindingForCommand(
  bindingProfile: DashboardBindingProfile,
  commandBinding: DashboardCommandBinding,
  catalogCommand: DashboardCommandCapability,
) {
  const widgetId = commandBinding.widgetId.trim()
  const deviceId = commandBinding.deviceId.trim()
  const reportedMetric = catalogCommand.reportedMetric.trim()

  for (const widgetBinding of bindingProfile.widgetBindings) {
    if (widgetBinding.widgetId.trim() !== widgetId) {
      continue
    }

    if (widgetBinding.deviceId.trim() !== deviceId) {
      continue
    }

    if (widgetBinding.metric.trim() !== reportedMetric) {
      continue
    }

    return widgetBinding
  }

  return null
}

function selectCompatibleCatalogCommandMatch(
  bindingProfile: DashboardBindingProfile,
  catalog: DashboardCommandCatalog | null | undefined,
  commandBinding: DashboardCommandBinding,
): DashboardCompatibleCommandMatch | null {
  if (!catalog) {
    return null
  }

  const deviceId = commandBinding.deviceId.trim()
  const commandType = commandBinding.commandType

  for (const command of catalog.commands) {
    if (command.deviceId.trim() !== deviceId) {
      continue
    }

    if (command.commandType !== commandType) {
      continue
    }

    const reportedWidgetBinding = selectReportedWidgetBindingForCommand(
      bindingProfile,
      commandBinding,
      command,
    )

    if (!reportedWidgetBinding) {
      continue
    }

    return {
      catalogCommand: command,
      reportedWidgetBinding,
    }
  }

  return null
}

export function selectDashboardCommandRuntimeProjection(
  widget: DashboardWidget,
  bindingProfile: DashboardBindingProfile | null | undefined,
  catalog: DashboardCommandCatalog | null | undefined,
): DashboardCommandRuntimeProjection {
  const widgetId = widget.id.trim()
  const widgetType = widget.type.trim()
  const expectedCommandType = COMMAND_WIDGET_TYPES_BY_COMMAND_TYPE[widgetType] ?? null
  const commandBinding = bindingProfile
    ? selectCommandBindingForWidget(bindingProfile.commandBindings, widgetId)
    : null

  if (!commandBinding) {
    return {
      widgetId,
      widgetType,
      isExecutable: false,
      reason: 'missing-command-binding',
      commandType: null,
      commandBinding: null,
      reportedWidgetBinding: null,
      catalogCommand: null,
    }
  }

  if (!expectedCommandType) {
    return {
      widgetId,
      widgetType,
      isExecutable: false,
      reason: 'unsupported-widget-type',
      commandType: commandBinding.commandType,
      commandBinding,
      reportedWidgetBinding: null,
      catalogCommand: null,
    }
  }

  if (commandBinding.commandType !== expectedCommandType) {
    return {
      widgetId,
      widgetType,
      isExecutable: false,
      reason: 'incompatible-widget-command',
      commandType: commandBinding.commandType,
      commandBinding,
      reportedWidgetBinding: null,
      catalogCommand: null,
    }
  }

  const catalogCommand = selectCatalogCommandForBinding(catalog, commandBinding)

  if (!catalogCommand) {
    return {
      widgetId,
      widgetType,
      isExecutable: false,
      reason: 'missing-catalog-command',
      commandType: commandBinding.commandType,
      commandBinding,
      reportedWidgetBinding: null,
      catalogCommand: null,
    }
  }

  const compatibleMatch = bindingProfile
    ? selectCompatibleCatalogCommandMatch(bindingProfile, catalog, commandBinding)
    : null

  if (!compatibleMatch) {
    return {
      widgetId,
      widgetType,
      isExecutable: false,
      reason: 'missing-reported-widget-binding',
      commandType: commandBinding.commandType,
      commandBinding,
      reportedWidgetBinding: null,
      catalogCommand,
    }
  }

  return {
    widgetId,
    widgetType,
    isExecutable: true,
    reason: 'available',
    commandType: commandBinding.commandType,
    commandBinding,
    reportedWidgetBinding: compatibleMatch.reportedWidgetBinding,
    catalogCommand: compatibleMatch.catalogCommand,
  }
}

export function selectDashboardCommandAvailabilityByWidgetId(
  widgets: DashboardWidget[],
  bindingProfile: DashboardBindingProfile | null | undefined,
  catalog: DashboardCommandCatalog | null | undefined,
): Record<string, DashboardCommandRuntimeProjection> {
  const availabilityByWidgetId: Record<string, DashboardCommandRuntimeProjection> = {}

  for (const widget of widgets) {
    const widgetId = widget.id.trim()
    if (!widgetId) {
      continue
    }

    availabilityByWidgetId[widgetId] = selectDashboardCommandRuntimeProjection(
      widget,
      bindingProfile,
      catalog,
    )
  }

  return availabilityByWidgetId
}

export function selectDashboardRuntimeProjection(
  diagram: DashboardDiagramDocument | null | undefined,
  bindingProfile: DashboardBindingProfile | null | undefined,
  metricValueByBindingKey: DashboardMetricValueByBindingKey,
  commandCatalog?: DashboardCommandCatalog | null,
): DashboardRuntimeProjection {
  const widgetsForProjection = selectWidgets(diagram)
  const widgetValueById = selectWidgetValuesById(bindingProfile, metricValueByBindingKey)
  const widgets = selectWidgetRuntimeProjection(
    widgetsForProjection,
    bindingProfile,
    widgetValueById,
  )
  const commandAvailabilityByWidgetId = selectDashboardCommandAvailabilityByWidgetId(
    widgetsForProjection,
    bindingProfile,
    commandCatalog,
  )

  return {
    metricValueByBindingKey,
    widgetValueById,
    widgets,
    commandAvailabilityByWidgetId,
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
