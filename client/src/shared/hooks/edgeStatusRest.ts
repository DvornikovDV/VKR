import {
  getAssignedEdgeServers,
  getEdgeServerPingSnapshot,
} from '@/shared/api/edgeServers'

export type EdgeStatusScope = 'auto' | 'admin' | 'trusted'

export interface EdgeStatusRestSnapshot {
  online: boolean
  lastSeenAt: string | null
}

function toSnapshot(value: {
  availability: {
    online: boolean
    lastSeenAt: string | null
  }
}): EdgeStatusRestSnapshot {
  return {
    online: value.availability.online,
    lastSeenAt: value.availability.lastSeenAt,
  }
}

async function loadAdminPingSnapshots(edgeIds: string[] | undefined): Promise<Record<string, EdgeStatusRestSnapshot>> {
  if (!edgeIds || edgeIds.length === 0) {
    return {}
  }

  const snapshots = await Promise.all(
    edgeIds.map(async (edgeId) => [edgeId, await getEdgeServerPingSnapshot(edgeId)] as const),
  )

  return Object.fromEntries(
    snapshots.map(([edgeId, snapshot]) => [edgeId, toSnapshot(snapshot)]),
  )
}

async function loadAssignedEdgeSnapshots(): Promise<Record<string, EdgeStatusRestSnapshot>> {
  const rows = await getAssignedEdgeServers()
  return Object.fromEntries(rows.map((row) => [row._id, toSnapshot(row)]))
}

export async function loadCanonicalEdgeStatusRestSnapshots(options: {
  edgeIds?: string[]
  scope: EdgeStatusScope
}): Promise<Record<string, EdgeStatusRestSnapshot>> {
  const { edgeIds, scope } = options

  if (scope === 'admin') {
    return loadAdminPingSnapshots(edgeIds)
  }

  if (scope === 'trusted') {
    return loadAssignedEdgeSnapshots()
  }

  if (!edgeIds || edgeIds.length === 0) {
    return loadAssignedEdgeSnapshots()
  }

  try {
    return await loadAdminPingSnapshots(edgeIds)
  } catch {
    return loadAssignedEdgeSnapshots()
  }
}
