import { apiClient } from '@/shared/api/client'

export const ONBOARDING_LIFECYCLE_STATES = [
  'Pending First Connection',
  'Active',
  'Re-onboarding Required',
  'Blocked',
] as const

export type OnboardingLifecycleState =
  | 'Pending First Connection'
  | 'Active'
  | 'Re-onboarding Required'
  | 'Blocked'

export const ONBOARDING_PACKAGE_STATUSES = [
  'ready',
  'used',
  'expired',
  'reset',
  'blocked',
] as const

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
  createdAt?: string
}

export interface TrustedEdgeServer {
  _id: string
  name: string
  lifecycleState: 'Active'
  isTelemetryReady: true
  availability: EdgeAvailabilitySnapshot
}

export type DashboardTrustedEdgeServer = TrustedEdgeServer

export interface EdgeServerCatalogRow {
  edgeServerId: string
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

type EdgeServerCreatorRef = Pick<EdgeServerUserRef, '_id' | 'email'>

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isOnboardingLifecycleState(value: unknown): value is OnboardingLifecycleState {
  return (
    typeof value === 'string' &&
    (ONBOARDING_LIFECYCLE_STATES as readonly string[]).includes(value)
  )
}

function isOnboardingPackageStatus(value: unknown): value is OnboardingPackageStatus {
  return (
    typeof value === 'string' &&
    (ONBOARDING_PACKAGE_STATUSES as readonly string[]).includes(value)
  )
}

function normalizeAvailability(value: unknown): EdgeAvailabilitySnapshot | null {
  if (!isRecord(value) || typeof value.online !== 'boolean') {
    return null
  }

  if (!isNullableString(value.lastSeenAt)) {
    return null
  }

  return {
    online: value.online,
    lastSeenAt: value.lastSeenAt,
  }
}

function normalizeTrustedUser(value: unknown): string | EdgeServerUserRef | null {
  if (isNonEmptyString(value)) {
    return value
  }

  if (!isRecord(value) || !isNonEmptyString(value._id) || !isNonEmptyString(value.email)) {
    return null
  }

  const normalized: EdgeServerUserRef = {
    _id: value._id,
    email: value.email,
  }

  if (value.role === 'ADMIN' || value.role === 'USER') {
    normalized.role = value.role
  }

  if (value.subscriptionTier === 'FREE' || value.subscriptionTier === 'PRO') {
    normalized.subscriptionTier = value.subscriptionTier
  }

  return normalized
}

function normalizeCreatedBy(value: unknown): string | EdgeServerCreatorRef | null {
  if (value === null || value === undefined) {
    return null
  }

  if (isNonEmptyString(value)) {
    return value
  }

  if (!isRecord(value) || !isNonEmptyString(value._id) || !isNonEmptyString(value.email)) {
    return null
  }

  return {
    _id: value._id,
    email: value.email,
  }
}

function normalizeOnboardingPackageSummary(value: unknown): OnboardingPackageSummary | null {
  if (value === null || value === undefined) {
    return null
  }

  if (
    !isRecord(value) ||
    !isNonEmptyString(value.credentialId) ||
    !isOnboardingPackageStatus(value.status) ||
    !isNonEmptyString(value.issuedAt) ||
    !isNonEmptyString(value.expiresAt) ||
    !isNullableString(value.usedAt) ||
    !isNullableString(value.displayHint)
  ) {
    return null
  }

  return {
    credentialId: value.credentialId,
    status: value.status,
    issuedAt: value.issuedAt,
    expiresAt: value.expiresAt,
    usedAt: value.usedAt,
    displayHint: value.displayHint,
  }
}

function normalizeTrustedUsers(value: unknown): Array<string | EdgeServerUserRef> {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((entry) => normalizeTrustedUser(entry))
    .filter((entry): entry is string | EdgeServerUserRef => entry !== null)
}

function normalizePersistentCredentialVersion(value: unknown): number | null {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : null
}

function normalizeAdminTelemetryReady(
  lifecycleState: OnboardingLifecycleState,
  persistentCredentialVersion: number | null,
): boolean {
  return lifecycleState === 'Active' && persistentCredentialVersion !== null
}

function normalizeAdminEdgeServer(edge: unknown): AdminEdgeServer | null {
  if (!isRecord(edge)) {
    return null
  }

  if (
    !isNonEmptyString(edge._id) ||
    !isNonEmptyString(edge.name) ||
    !isOnboardingLifecycleState(edge.lifecycleState)
  ) {
    return null
  }

  const availability = normalizeAvailability(edge.availability)
  if (!availability) {
    return null
  }

  const lifecycleState = edge.lifecycleState
  const persistentCredentialVersion = normalizePersistentCredentialVersion(edge.persistentCredentialVersion)

  return {
    _id: edge._id,
    name: edge.name,
    trustedUsers: normalizeTrustedUsers(edge.trustedUsers),
    createdBy: normalizeCreatedBy(edge.createdBy),
    lifecycleState,
    isTelemetryReady: normalizeAdminTelemetryReady(lifecycleState, persistentCredentialVersion),
    availability,
    currentOnboardingPackage: normalizeOnboardingPackageSummary(edge.currentOnboardingPackage),
    persistentCredentialVersion,
    lastLifecycleEventAt: isNullableString(edge.lastLifecycleEventAt) ? edge.lastLifecycleEventAt : null,
    createdAt: isNonEmptyString(edge.createdAt) ? edge.createdAt : undefined,
  }
}

function normalizeTrustedEdgeServer(edge: unknown): TrustedEdgeServer | null {
  if (!isRecord(edge) || !isNonEmptyString(edge._id) || !isNonEmptyString(edge.name)) {
    return null
  }

  if (edge.lifecycleState !== 'Active') {
    return null
  }

  const availability = normalizeAvailability(edge.availability)
  if (!availability) {
    return null
  }

  return {
    _id: edge._id,
    name: edge.name,
    lifecycleState: 'Active',
    isTelemetryReady: true,
    availability,
  }
}

function normalizeDisclosure(value: unknown): FirstConnectionPackageDisclosure | null {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.edgeId) ||
    !isNonEmptyString(value.onboardingSecret) ||
    !isNonEmptyString(value.issuedAt) ||
    !isNonEmptyString(value.expiresAt) ||
    !isNonEmptyString(value.instructions)
  ) {
    return null
  }

  return {
    edgeId: value.edgeId,
    onboardingSecret: value.onboardingSecret,
    issuedAt: value.issuedAt,
    expiresAt: value.expiresAt,
    instructions: value.instructions,
  }
}

function normalizeOnboardingDisclosureResponse(response: unknown): OnboardingDisclosureResponse {
  if (!isRecord(response)) {
    throw new Error('Invalid edge onboarding disclosure response.')
  }

  const edge = normalizeAdminEdgeServer(response.edge)
  const onboardingPackage = normalizeDisclosure(response.onboardingPackage)

  if (!edge || !onboardingPackage) {
    throw new Error('Invalid edge onboarding disclosure response.')
  }

  return {
    edge,
    onboardingPackage,
  }
}

function normalizeAdminEdgeServerResponse(response: unknown): AdminEdgeServer {
  const edge = normalizeAdminEdgeServer(response)
  if (!edge) {
    throw new Error('Invalid admin edge server response.')
  }
  return edge
}

export async function getEdgeServers(): Promise<AdminEdgeServer[]> {
  const rows = await apiClient.get<unknown[]>('/admin/edge-servers')
  return rows
    .map((edge) => normalizeAdminEdgeServer(edge))
    .filter((edge): edge is AdminEdgeServer => edge !== null)
}

export async function getTrustedEdgeServers(): Promise<TrustedEdgeServer[]> {
  const rows = await apiClient.get<unknown[]>('/edge-servers')
  return rows
    .map((edge) => normalizeTrustedEdgeServer(edge))
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
  const response = await apiClient.post<unknown>('/edge-servers', payload)
  return normalizeOnboardingDisclosureResponse(response)
}

export async function resetEdgeOnboardingCredentials(
  edgeId: string,
): Promise<OnboardingDisclosureResponse> {
  const response = await apiClient.post<unknown>(`/edge-servers/${edgeId}/onboarding/reset`)
  return normalizeOnboardingDisclosureResponse(response)
}

export async function revokeEdgeTrust(edgeId: string): Promise<AdminEdgeServer> {
  const response = await apiClient.post<unknown>(`/edge-servers/${edgeId}/trust/revoke`)
  return normalizeAdminEdgeServerResponse(response)
}

export async function blockEdgeServer(edgeId: string): Promise<AdminEdgeServer> {
  const response = await apiClient.post<unknown>(`/edge-servers/${edgeId}/block`)
  return normalizeAdminEdgeServerResponse(response)
}

export async function reenableEdgeOnboarding(edgeId: string): Promise<AdminEdgeServer> {
  const response = await apiClient.post<unknown>(`/edge-servers/${edgeId}/re-enable-onboarding`)
  return normalizeAdminEdgeServerResponse(response)
}

export async function bindEdgeServer(
  edgeId: string,
  payload: BindEdgeServerPayload,
): Promise<AdminEdgeServer> {
  const response = await apiClient.post<unknown>(`/edge-servers/${edgeId}/bind`, payload)
  return normalizeAdminEdgeServerResponse(response)
}

export async function revokeEdgeServerAccess(edgeId: string, userId: string): Promise<AdminEdgeServer> {
  const response = await apiClient.delete<unknown>(`/edge-servers/${edgeId}/bind/${userId}`)
  return normalizeAdminEdgeServerResponse(response)
}
