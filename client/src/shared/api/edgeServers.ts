import { apiClient } from '@/shared/api/client'

export type OnboardingLifecycleState =
  | 'Pending First Connection'
  | 'Active'
  | 'Re-onboarding Required'
  | 'Blocked'

export type OnboardingPackageStatus = 'ready' | 'used' | 'expired' | 'reset' | 'blocked'

export interface EdgeServerUserRef {
  _id: string
  email: string
  role?: 'ADMIN' | 'USER'
  subscriptionTier?: 'FREE' | 'PRO'
}

export interface EdgeAvailabilitySnapshot {
  online: boolean
  lastSeenAt: string | null
}

export interface OnboardingPackageSummary {
  credentialId: string
  status: OnboardingPackageStatus
  issuedAt: string
  expiresAt: string
  usedAt: string | null
  displayHint: string | null
}

export interface EdgeServer {
  _id: string
  name: string
  trustedUsers?: Array<string | EdgeServerUserRef>
  createdBy?: string | Pick<EdgeServerUserRef, '_id' | 'email'>
  isActive?: boolean
  lastSeen?: string | null
  createdAt?: string

  lifecycleState?: OnboardingLifecycleState
  isTelemetryReady?: boolean
  availability?: EdgeAvailabilitySnapshot
  currentOnboardingPackage?: OnboardingPackageSummary | null
  persistentCredentialVersion?: number | null
  lastLifecycleEventAt?: string | null
}

export interface TrustedEdgeServer {
  _id: string
  name: string
  isActive?: boolean
  lastSeen?: string | null
  lifecycleState?: 'Active'
  availability?: EdgeAvailabilitySnapshot
}

export type DashboardTrustedEdgeServer = TrustedEdgeServer

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

export interface RegisterEdgeServerWithOnboardingPayload {
  name: string
}

export interface FirstConnectionPackageDisclosure {
  edgeId: string
  onboardingSecret: string
  issuedAt: string
  expiresAt: string
  instructions: string
}

export interface OnboardingDisclosureResponse {
  edge: EdgeServer
  onboardingPackage: FirstConnectionPackageDisclosure
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

export async function getDashboardTrustedEdgeServers(): Promise<DashboardTrustedEdgeServer[]> {
  return apiClient.get<DashboardTrustedEdgeServer[]>('/edge-servers')
}

export async function getEdgeServerCatalog(edgeId: string): Promise<EdgeServerCatalogRow[]> {
  return apiClient.get<EdgeServerCatalogRow[]>(`/edge-servers/${edgeId}/catalog`)
}

export async function registerEdgeServer(
  payload: RegisterEdgeServerPayload,
): Promise<EdgeServer> {
  return apiClient.post<EdgeServer>('/edge-servers', payload)
}

export async function registerEdgeServerWithOnboarding(
  payload: RegisterEdgeServerWithOnboardingPayload,
): Promise<OnboardingDisclosureResponse> {
  return apiClient.post<OnboardingDisclosureResponse>('/edge-servers', payload)
}

export async function resetEdgeOnboardingCredentials(
  edgeId: string,
): Promise<OnboardingDisclosureResponse> {
  return apiClient.post<OnboardingDisclosureResponse>(`/edge-servers/${edgeId}/onboarding/reset`)
}

export async function revokeEdgeTrust(edgeId: string): Promise<EdgeServer> {
  return apiClient.post<EdgeServer>(`/edge-servers/${edgeId}/trust/revoke`)
}

export async function blockEdgeServer(edgeId: string): Promise<EdgeServer> {
  return apiClient.post<EdgeServer>(`/edge-servers/${edgeId}/block`)
}

export async function reenableEdgeOnboarding(edgeId: string): Promise<EdgeServer> {
  return apiClient.post<EdgeServer>(`/edge-servers/${edgeId}/re-enable-onboarding`)
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
