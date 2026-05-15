import type { EdgeCredentialDisclosureResponse } from '@/shared/api/edgeServers'

export interface EdgeCredentialInstallerPayload {
  persistentCredential: {
    edgeId: string
    credentialSecret: string
    version: number
    issuedAt: string
  }
}

export function createEdgeCredentialInstallerPayload(
  disclosure: EdgeCredentialDisclosureResponse,
): EdgeCredentialInstallerPayload {
  const { persistentCredential } = disclosure

  return {
    persistentCredential: {
      edgeId: persistentCredential.edgeId,
      credentialSecret: persistentCredential.credentialSecret,
      version: persistentCredential.version,
      issuedAt: persistentCredential.issuedAt,
    },
  }
}
