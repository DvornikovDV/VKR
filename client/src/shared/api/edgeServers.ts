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

export interface AdminEdgeServer {
  _id: string
  name: string
  trustedUsers: Array<string | EdgeServerUserRef>
  createdBy: string | Pick<EdgeServerUserRef, '_id' | 'email'> | null
  lifecycleState: OnboardingLifecycleState
  isTelemetryReady: boolean
  availability: EdgeAvailabilitySnapshot
  currentOnboardingPackage: OnboardingPackageSummary | null
  persistentCredentialVersion: number | null
  lastLifecycleEventAt: string | null
  isActive: boolean
  lastSeen: string | null
  createdAt?: string
}

export interface TrustedEdgeServer {
  _id: string
  name: string
  lifecycleState: 'Active'
  isTelemetryReady: true
  availability: EdgeAvailabilitySnapshot
  isActive: true
  lastSeen: string | null
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
}

export interface FirstConnectionPackageDisclosure {
  edgeId: string
  onboardingSecret: string
  issuedAt: string
  expiresAt: string
  instructions: string
}

export interface OnboardingDisclosureResponse {
  edge: AdminEdgeServer
  onboardingPackage: FirstConnectionPackageDisclosure
}

export interface BindEdgeServerPayload {
  userId: string
}

interface EdgeAvailabilityLike {
  availability?: Partial<EdgeAvailabilitySnapshot> | null
  online?: boolean
  isOnline?: boolean
  lastSeenAt?: string | null
  lastSeen?: string | null
}

interface AdminEdgeServerLike extends EdgeAvailabilityLike {
  _id?: string
  id?: string
  edgeId?: string
  name?: string
  trustedUsers?: Array<string | EdgeServerUserRef>
  createdBy?: string | Pick<EdgeServerUserRef, '_id' | 'email'> | null
  isActive?: boolean
  createdAt?: string
  lifecycleState?: OnboardingLifecycleState
  isTelemetryReady?: boolean
  currentOnboardingPackage?: OnboardingPackageSummary | null
  persistentCredentialVersion?: number | null
  lastLifecycleEventAt?: string | null
}

interface TrustedEdgeServerLike extends EdgeAvailabilityLike {
  _id?: string
  id?: string
  edgeId?: string
  name?: string
  lifecycleState?: OnboardingLifecycleState
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function normalizeAvailability(edge: EdgeAvailabilityLike): EdgeAvailabilitySnapshot {
  const online =
    typeof edge.availability?.online === 'boolean'
      ? edge.availability.online
      : typeof edge.isOnline === 'boolean'
        ? edge.isOnline
        : typeof edge.online === 'boolean'
          ? edge.online
          : false

  const lastSeenAt = edge.availability?.lastSeenAt ?? edge.lastSeenAt ?? edge.lastSeen ?? null

  return {
    online,
    lastSeenAt,
  }
}

function normalizeLifecycleState(edge: AdminEdgeServerLike): OnboardingLifecycleState {
  if (edge.lifecycleState) {
    return edge.lifecycleState
  }

  return edge.isActive ? 'Active' : 'Pending First Connection'
}

function normalizeAdminEdgeServer(edge: AdminEdgeServerLike): AdminEdgeServer {
  const edgeId = edge._id ?? edge.id ?? edge.edgeId ?? ''
  const lifecycleState = normalizeLifecycleState(edge)
  const availability = normalizeAvailability(edge)
  const isTelemetryReady = edge.isTelemetryReady ?? lifecycleState === 'Active'

  return {
    _id: isNonEmptyString(edgeId) ? edgeId : '',
    name: isNonEmptyString(edge.name) ? edge.name : (isNonEmptyString(edgeId) ? edgeId : 'Unnamed edge'),
    trustedUsers: edge.trustedUsers ?? [],
    createdBy: edge.createdBy ?? null,
    lifecycleState,
    isTelemetryReady,
    availability,
    currentOnboardingPackage: edge.currentOnboardingPackage ?? null,
    persistentCredentialVersion: edge.persistentCredentialVersion ?? null,
    lastLifecycleEventAt: edge.lastLifecycleEventAt ?? null,
    isActive: isTelemetryReady,
    lastSeen: edge.lastSeen ?? availability.lastSeenAt,
    createdAt: edge.createdAt,
  }
}

function normalizeTrustedEdgeServer(edge: TrustedEdgeServerLike): TrustedEdgeServer | null {
  const edgeId = edge._id ?? edge.id ?? edge.edgeId ?? ''
  if (!isNonEmptyString(edgeId)) {
    return null
  }

  if (edge.lifecycleState !== 'Active') {
    return null
  }

  const availability = normalizeAvailability(edge)
  return {
    _id: edgeId,
    name: isNonEmptyString(edge.name) ? edge.name : edgeId,
    lifecycleState: 'Active',
    isTelemetryReady: true,
    availability,
    isActive: true,
    lastSeen: availability.lastSeenAt,
  }
}

function normalizeOnboardingDisclosureResponse(
  response: { edge: AdminEdgeServerLike; onboardingPackage: FirstConnectionPackageDisclosure },
): OnboardingDisclosureResponse {
  return {
    ...response,
    edge: normalizeAdminEdgeServer(response.edge),
  }
}

export async function getEdgeServers(): Promise<AdminEdgeServer[]> {
  const rows = await apiClient.get<AdminEdgeServerLike[]>('/admin/edge-servers')
  return rows
    .map(normalizeAdminEdgeServer)
    .filter((edge) => isNonEmptyString(edge._id))
}

export async function getTrustedEdgeServers(): Promise<TrustedEdgeServer[]> {
  const rows = await apiClient.get<TrustedEdgeServerLike[]>('/edge-servers')
  return rows
    .map(normalizeTrustedEdgeServer)
    .filter((edge): edge is TrustedEdgeServer => edge !== null)
}

export async function getDashboardTrustedEdgeServers(): Promise<DashboardTrustedEdgeServer[]> {
  return getTrustedEdgeServers()
}

export async function getEdgeServerCatalog(edgeId: string): Promise<EdgeServerCatalogRow[]> {
  return apiClient.get<EdgeServerCatalogRow[]>(`/edge-servers/${edgeId}/catalog`)
}

export async function registerEdgeServer(
  payload: RegisterEdgeServerPayload,
): Promise<OnboardingDisclosureResponse> {
  const response = await apiClient.post<{
    edge: AdminEdgeServerLike
    onboardingPackage: FirstConnectionPackageDisclosure
  }>('/edge-servers', payload)
  return normalizeOnboardingDisclosureResponse(response)
}

// Backward-compatible alias for earlier task naming.
export async function registerEdgeServerWithOnboarding(
  payload: RegisterEdgeServerPayload,
): Promise<OnboardingDisclosureResponse> {
  return registerEdgeServer(payload)
}

export async function resetEdgeOnboardingCredentials(
  edgeId: string,
): Promise<OnboardingDisclosureResponse> {
  const response = await apiClient.post<{
    edge: AdminEdgeServerLike
    onboardingPackage: FirstConnectionPackageDisclosure
  }>(`/edge-servers/${edgeId}/onboarding/reset`)
  return normalizeOnboardingDisclosureResponse(response)
}

export async function revokeEdgeTrust(edgeId: string): Promise<AdminEdgeServer> {
  const response = await apiClient.post<AdminEdgeServerLike>(`/edge-servers/${edgeId}/trust/revoke`)
  return normalizeAdminEdgeServer(response)
}

export async function blockEdgeServer(edgeId: string): Promise<AdminEdgeServer> {
  const response = await apiClient.post<AdminEdgeServerLike>(`/edge-servers/${edgeId}/block`)
  return normalizeAdminEdgeServer(response)
}

export async function reenableEdgeOnboarding(edgeId: string): Promise<AdminEdgeServer> {
  const response = await apiClient.post<AdminEdgeServerLike>(`/edge-servers/${edgeId}/re-enable-onboarding`)
  return normalizeAdminEdgeServer(response)
}

export async function bindEdgeServer(
  edgeId: string,
  payload: BindEdgeServerPayload,
): Promise<AdminEdgeServer> {
  const response = await apiClient.post<AdminEdgeServerLike>(`/edge-servers/${edgeId}/bind`, payload)
  return normalizeAdminEdgeServer(response)
}

// Revoke access maps to backend unbind for a specific user and edge server pair.
export async function revokeEdgeServerAccess(edgeId: string, userId: string): Promise<AdminEdgeServer> {
  const response = await apiClient.delete<AdminEdgeServerLike>(`/edge-servers/${edgeId}/bind/${userId}`)
  return normalizeAdminEdgeServer(response)
}
