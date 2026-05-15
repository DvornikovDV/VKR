import type {
  CanonicalAdminEdgeServer,
  EdgeCredentialDisclosureResponse,
  EdgeServerUserRef,
} from '@/shared/api/edgeServers'

export interface EdgeCredentialInstallerPayload {
  edge: CanonicalAdminEdgeServer
  persistentCredential: {
    edgeId: string
    credentialSecret: string
    version: number
    issuedAt: string
    instructions: string
  }
}

function normalizeTrustedUserForPayload(user: string | EdgeServerUserRef): string | EdgeServerUserRef {
  if (typeof user === 'string') {
    return user
  }

  const normalized: EdgeServerUserRef = {
    _id: user._id,
    email: user.email,
  }

  if (user.role) {
    normalized.role = user.role
  }

  if (user.subscriptionTier) {
    normalized.subscriptionTier = user.subscriptionTier
  }

  return normalized
}

function normalizeCreatedByForPayload(edge: CanonicalAdminEdgeServer): CanonicalAdminEdgeServer['createdBy'] {
  if (edge.createdBy === null || typeof edge.createdBy === 'string') {
    return edge.createdBy
  }

  return {
    _id: edge.createdBy._id,
    email: edge.createdBy.email,
  }
}

export function createEdgeCredentialInstallerPayload(
  disclosure: EdgeCredentialDisclosureResponse,
): EdgeCredentialInstallerPayload {
  const { edge, persistentCredential } = disclosure

  return {
    edge: {
      _id: edge._id,
      name: edge.name,
      trustedUsers: edge.trustedUsers.map(normalizeTrustedUserForPayload),
      createdBy: normalizeCreatedByForPayload(edge),
      lifecycleState: edge.lifecycleState,
      availability: {
        online: edge.availability.online,
        lastSeenAt: edge.availability.lastSeenAt,
      },
      persistentCredentialVersion: edge.persistentCredentialVersion,
      lastLifecycleEventAt: edge.lastLifecycleEventAt,
    },
    persistentCredential: {
      edgeId: persistentCredential.edgeId,
      credentialSecret: persistentCredential.credentialSecret,
      version: persistentCredential.version,
      issuedAt: persistentCredential.issuedAt,
      instructions: persistentCredential.instructions,
    },
  }
}

export function serializeEdgeCredentialInstallerPayload(
  disclosure: EdgeCredentialDisclosureResponse,
): string {
  return JSON.stringify(createEdgeCredentialInstallerPayload(disclosure), null, 2)
}
