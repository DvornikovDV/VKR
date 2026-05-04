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
} from '@/features/constructor-host/types'

interface DeviceCatalogAccumulator {
  edgeServerId: string
  deviceId: string
  deviceLabel: string
  deviceType?: string
  metricsByKey: Map<string, EditorMetricOption>
}

function normalizeString(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : ''
}

function buildDeviceLabel(deviceId: string): string {
  return deviceId
}

function buildMetricOption(metric: string): EditorMetricOption {
  return {
    key: metric,
    label: metric,
  }
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
      entry.metricsByKey.set(metric, buildMetricOption(metric))
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
