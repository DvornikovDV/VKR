import {
  getEdgeServerCatalog,
  getTrustedEdgeServers,
  type EdgeServerCatalogRow,
  type TrustedEdgeServer,
} from '@/shared/api/edgeServers'
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
  edgeServers: TrustedEdgeServer[],
): EditorMachineOption[] {
  return edgeServers
    .map((edgeServer) => ({
      edgeServerId: edgeServer._id,
      label: edgeServer.name,
      isOnline: edgeServer.availability.online,
    }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

export function mapCatalogRowsToDeviceMetricCatalog(
  edgeServerId: string,
  catalogRows: EdgeServerCatalogRow[],
): EditorDeviceMetricCatalogEntry[] {
  const normalizedEdgeServerId = normalizeString(edgeServerId)
  if (normalizedEdgeServerId.length === 0) {
    return []
  }

  const byDeviceId = new Map<string, DeviceCatalogAccumulator>()

  for (const catalogRow of catalogRows) {
    const deviceId = normalizeString(catalogRow.deviceId)
    const metric = normalizeString(catalogRow.metric)

    if (deviceId.length === 0 || metric.length === 0) {
      continue
    }

    const rowEdgeServerId = normalizeString(catalogRow.edgeServerId) || normalizedEdgeServerId
    const existingEntry = byDeviceId.get(deviceId)
    const entry =
      existingEntry ??
      (() => {
        const createdEntry: DeviceCatalogAccumulator = {
          edgeServerId: rowEdgeServerId,
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
  const edgeServers = await getTrustedEdgeServers()
  return mapTrustedEdgeServersToMachineOptions(edgeServers)
}

export async function loadHostedDeviceMetricCatalog(
  edgeServerId: string,
): Promise<EditorDeviceMetricCatalogEntry[]> {
  const normalizedEdgeServerId = normalizeString(edgeServerId)
  if (normalizedEdgeServerId.length === 0) {
    return []
  }

  const catalogRows = await getEdgeServerCatalog(normalizedEdgeServerId)
  return mapCatalogRowsToDeviceMetricCatalog(normalizedEdgeServerId, catalogRows)
}
