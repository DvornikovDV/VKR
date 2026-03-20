import { apiClient } from '@/shared/api/client'

export interface EdgeServerUserRef {
  _id: string
  email: string
  role?: 'ADMIN' | 'USER'
  subscriptionTier?: 'FREE' | 'PRO'
}

export interface EdgeServer {
  _id: string
  name: string
  trustedUsers?: Array<string | EdgeServerUserRef>
  createdBy?: string | Pick<EdgeServerUserRef, '_id' | 'email'>
  isActive?: boolean
  lastSeen?: string | null
  createdAt?: string
}

export interface TrustedEdgeServer {
  _id: string
  name: string
  isActive?: boolean
  lastSeen?: string | null
}

export interface EdgeServerCatalogRow {
  edgeServerId: string
  sourceId?: string | null
  deviceId: string
  metric: string
  label: string
}

export interface RegisterEdgeServerPayload {
  name: string
  apiKeyHash: string
}

export interface BindEdgeServerPayload {
  userId: string
}

export async function getEdgeServers(): Promise<EdgeServer[]> {
  return apiClient.get<EdgeServer[]>('/admin/edge-servers')
}

export async function getTrustedEdgeServers(): Promise<TrustedEdgeServer[]> {
  return apiClient.get<TrustedEdgeServer[]>('/edge-servers')
}

export async function getEdgeServerCatalog(edgeId: string): Promise<EdgeServerCatalogRow[]> {
  return apiClient.get<EdgeServerCatalogRow[]>(`/edge-servers/${edgeId}/catalog`)
}

export async function registerEdgeServer(
  payload: RegisterEdgeServerPayload,
): Promise<EdgeServer> {
  return apiClient.post<EdgeServer>('/edge-servers', payload)
}

export async function bindEdgeServer(
  edgeId: string,
  payload: BindEdgeServerPayload,
): Promise<EdgeServer> {
  return apiClient.post<EdgeServer>(`/edge-servers/${edgeId}/bind`, payload)
}

// Revoke access maps to backend unbind for a specific user and edge server pair.
export async function revokeEdgeServerAccess(edgeId: string, userId: string): Promise<EdgeServer> {
  return apiClient.delete<EdgeServer>(`/edge-servers/${edgeId}/bind/${userId}`)
}
