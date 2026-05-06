import {
  getAssignedEdgeServers,
  getEdgeServerCatalog,
  type AssignedEdgeServer,
  type EdgeCapabilitiesCatalogSnapshot,
} from '@/shared/api/edgeServers'
import {
  formatEdgeMachineLabel,
  getEdgeAvailabilityLabel,
} from '@/shared/edgePresentation'
import type {
  EditorDeviceMetricCatalogEntry,
  EditorMachineOption,
  EditorMetricOption,
  EditorDeviceCommandCatalogEntry,
  EditorCommandOption,
} from '@/features/constructor-host/types'

interface DeviceCatalogAccumulator {
  edgeServerId: string
  deviceId: string
  deviceLabel: string
  deviceType?: string
  metricsByKey: Map<string, EditorMetricOption>
}

interface DeviceCommandCatalogAccumulator {
  edgeServerId: string
  deviceId: string
  deviceLabel: string
  commandsByKey: Map<string, EditorCommandOption>
}

function normalizeString(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : ''
}

function buildDeviceLabel(deviceId: string): string {
  return deviceId
}

function buildMetricOption(telemetryItem: EdgeCapabilitiesCatalogSnapshot['telemetry'][number]): EditorMetricOption {
  const metric = normalizeString(telemetryItem.metric)
  const option: EditorMetricOption = {
    key: metric,
    label: normalizeString(telemetryItem.label) || metric,
  }

  if (telemetryItem.valueType) {
    option.valueType = telemetryItem.valueType
  }

  return option
}

export function mapTrustedEdgeServersToMachineOptions(
  edgeServers: AssignedEdgeServer[],
): EditorMachineOption[] {
  return mapAssignedEdgeServersToMachineOptions(edgeServers)
}

export function mapAssignedEdgeServersToMachineOptions(
  edgeServers: AssignedEdgeServer[],
): EditorMachineOption[] {
  return edgeServers
    .map((edgeServer) => ({
      edgeServerId: edgeServer._id,
      label: formatEdgeMachineLabel(
        edgeServer.name,
        edgeServer.lifecycleState,
        getEdgeAvailabilityLabel(edgeServer.availability.online),
      ),
      edgeName: edgeServer.name,
      lifecycleState: edgeServer.lifecycleState,
      availabilityLabel: getEdgeAvailabilityLabel(edgeServer.availability.online),
      lastSeenAt: edgeServer.availability.lastSeenAt,
      isOnline: edgeServer.availability.online,
    }))
    .sort((a, b) => (a.edgeName ?? a.label).localeCompare(b.edgeName ?? b.label))
}

export function mapCatalogRowsToDeviceMetricCatalog(
  edgeServerId: string,
  catalogSnapshot: EdgeCapabilitiesCatalogSnapshot,
): EditorDeviceMetricCatalogEntry[] {
  const normalizedEdgeServerId = normalizeString(edgeServerId)
  if (normalizedEdgeServerId.length === 0) {
    return []
  }

  const byDeviceId = new Map<string, DeviceCatalogAccumulator>()

  const sourceEdgeServerId = normalizeString(catalogSnapshot.edgeServerId) || normalizedEdgeServerId

  for (const telemetryItem of catalogSnapshot.telemetry) {
    const deviceId = normalizeString(telemetryItem.deviceId)
    const metric = normalizeString(telemetryItem.metric)

    if (deviceId.length === 0 || metric.length === 0) {
      continue
    }

    const existingEntry = byDeviceId.get(deviceId)
    const entry =
      existingEntry ??
      (() => {
        const createdEntry: DeviceCatalogAccumulator = {
          edgeServerId: sourceEdgeServerId,
          deviceId,
          deviceLabel: buildDeviceLabel(deviceId),
          deviceType: undefined,
          metricsByKey: new Map<string, EditorMetricOption>(),
        }
        byDeviceId.set(deviceId, createdEntry)
        return createdEntry
      })()

    if (!entry.metricsByKey.has(metric)) {
      entry.metricsByKey.set(metric, buildMetricOption(telemetryItem))
    }
  }

  return [...byDeviceId.values()]
    .map<EditorDeviceMetricCatalogEntry>((entry) => ({
      edgeServerId: entry.edgeServerId,
      deviceId: entry.deviceId,
      deviceLabel: entry.deviceLabel,
      deviceType: entry.deviceType,
      metrics: [...entry.metricsByKey.values()].sort((a, b) => a.label.localeCompare(b.label)),
    }))
    .sort((a, b) => a.deviceLabel.localeCompare(b.deviceLabel))
}

export async function loadHostedMachineOptions(): Promise<EditorMachineOption[]> {
  const edgeServers = await getAssignedEdgeServers()
  return mapAssignedEdgeServersToMachineOptions(edgeServers)
}

export async function loadHostedDeviceMetricCatalog(
  edgeServerId: string,
): Promise<EditorDeviceMetricCatalogEntry[]> {
  const normalizedEdgeServerId = normalizeString(edgeServerId)
  if (normalizedEdgeServerId.length === 0) {
    return []
  }

  const catalogSnapshot = await getEdgeServerCatalog(normalizedEdgeServerId)
  return mapCatalogRowsToDeviceMetricCatalog(normalizedEdgeServerId, catalogSnapshot)
}

export function mapCatalogCommandsToDeviceCommandCatalog(
  edgeServerId: string,
  catalogSnapshot: EdgeCapabilitiesCatalogSnapshot,
): EditorDeviceCommandCatalogEntry[] {
  const normalizedEdgeServerId = normalizeString(edgeServerId)
  if (normalizedEdgeServerId.length === 0) {
    return []
  }

  const byDeviceId = new Map<string, DeviceCommandCatalogAccumulator>()
  const sourceEdgeServerId = normalizeString(catalogSnapshot.edgeServerId) || normalizedEdgeServerId

  for (const commandItem of catalogSnapshot.commands) {
    const deviceId = normalizeString(commandItem.deviceId)
    const commandType = commandItem.commandType

    if (deviceId.length === 0 || !commandType) {
      continue
    }

    const existingEntry = byDeviceId.get(deviceId)
    const entry =
      existingEntry ??
      (() => {
        const createdEntry: DeviceCommandCatalogAccumulator = {
          edgeServerId: sourceEdgeServerId,
          deviceId,
          deviceLabel: buildDeviceLabel(deviceId),
          commandsByKey: new Map<string, EditorCommandOption>(),
        }
        byDeviceId.set(deviceId, createdEntry)
        return createdEntry
      })()

    if (!entry.commandsByKey.has(commandType)) {
      entry.commandsByKey.set(commandType, {
        commandType: commandItem.commandType,
        valueType: commandItem.valueType,
        label: normalizeString(commandItem.label) || `${deviceId} / ${commandType}`,
        min: commandItem.min,
        max: commandItem.max,
        reportedMetric: commandItem.reportedMetric,
      })
    }
  }

  return [...byDeviceId.values()]
    .map<EditorDeviceCommandCatalogEntry>((entry) => ({
      edgeServerId: entry.edgeServerId,
      deviceId: entry.deviceId,
      deviceLabel: entry.deviceLabel,
      commands: [...entry.commandsByKey.values()].sort((a, b) => a.label.localeCompare(b.label)),
    }))
    .sort((a, b) => a.deviceLabel.localeCompare(b.deviceLabel))
}

export async function loadHostedDeviceCommandCatalog(
  edgeServerId: string,
): Promise<EditorDeviceCommandCatalogEntry[]> {
  const normalizedEdgeServerId = normalizeString(edgeServerId)
  if (normalizedEdgeServerId.length === 0) {
    return []
  }

  const catalogSnapshot = await getEdgeServerCatalog(normalizedEdgeServerId)
  return mapCatalogCommandsToDeviceCommandCatalog(normalizedEdgeServerId, catalogSnapshot)
}
