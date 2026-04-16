import { apiClient } from '@/shared/api/client'

export const EDGE_LIFECYCLE_STATES = ['Active', 'Blocked'] as const

export type EdgeLifecycleState = (typeof EDGE_LIFECYCLE_STATES)[number]

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

type EdgeServerCreatorRef = Pick<EdgeServerUserRef, '_id' | 'email'>

export interface CanonicalAdminEdgeServer {
  _id: string
  name: string
  trustedUsers: Array<string | EdgeServerUserRef>
  createdBy: string | EdgeServerCreatorRef | null
  lifecycleState: EdgeLifecycleState
  availability: EdgeAvailabilitySnapshot
  persistentCredentialVersion: number | null
  lastLifecycleEventAt: string | null
}

export interface AssignedEdgeServer {
  _id: string
  name: string
  lifecycleState: EdgeLifecycleState
  availability: EdgeAvailabilitySnapshot
}

export interface PersistentCredentialDisclosure {
  edgeId: string
  credentialSecret: string
  version: number
  issuedAt: string
  instructions: string
}

export interface EdgeCredentialDisclosureResponse {
  edge: CanonicalAdminEdgeServer
  persistentCredential: PersistentCredentialDisclosure
}

export interface EdgePingSnapshot {
  lifecycleState: EdgeLifecycleState
  availability: EdgeAvailabilitySnapshot
}

export interface EdgeServerCatalogRow {
  edgeServerId: string
  deviceId: string
  metric: string
  label: string
}

export interface RegisterEdgeServerPayload {
  name: string
}

export interface BindEdgeServerPayload {
  userId: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isEdgeLifecycleState(value: unknown): value is EdgeLifecycleState {
  return typeof value === 'string' && (EDGE_LIFECYCLE_STATES as readonly string[]).includes(value)
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

function normalizePersistentCredentialVersion(value: unknown): number | null {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : null
}

function normalizeTrustedUsers(value: unknown): Array<string | EdgeServerUserRef> {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((entry) => normalizeTrustedUser(entry))
    .filter((entry): entry is string | EdgeServerUserRef => entry !== null)
}

function normalizeCanonicalAdminEdgeServer(edge: unknown): CanonicalAdminEdgeServer | null {
  if (
    !isRecord(edge) ||
    !isNonEmptyString(edge._id) ||
    !isNonEmptyString(edge.name) ||
    !isEdgeLifecycleState(edge.lifecycleState)
  ) {
    return null
  }

  const availability = normalizeAvailability(edge.availability)
  if (!availability) {
    return null
  }

  return {
    _id: edge._id,
    name: edge.name,
    trustedUsers: normalizeTrustedUsers(edge.trustedUsers),
    createdBy: normalizeCreatedBy(edge.createdBy),
    lifecycleState: edge.lifecycleState,
    availability,
    persistentCredentialVersion: normalizePersistentCredentialVersion(edge.persistentCredentialVersion),
    lastLifecycleEventAt: isNullableString(edge.lastLifecycleEventAt) ? edge.lastLifecycleEventAt : null,
  }
}

function normalizeAssignedEdgeServer(edge: unknown): AssignedEdgeServer | null {
  if (
    !isRecord(edge) ||
    !isNonEmptyString(edge._id) ||
    !isNonEmptyString(edge.name) ||
    !isEdgeLifecycleState(edge.lifecycleState)
  ) {
    return null
  }

  const availability = normalizeAvailability(edge.availability)
  if (!availability) {
    return null
  }

  return {
    _id: edge._id,
    name: edge.name,
    lifecycleState: edge.lifecycleState,
    availability,
  }
}

function normalizePersistentCredentialDisclosure(value: unknown): PersistentCredentialDisclosure | null {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.edgeId) ||
    !isNonEmptyString(value.credentialSecret) ||
    !Number.isInteger(value.version) ||
    Number(value.version) <= 0 ||
    !isNonEmptyString(value.issuedAt) ||
    !isNonEmptyString(value.instructions)
  ) {
    return null
  }

  return {
    edgeId: value.edgeId,
    credentialSecret: value.credentialSecret,
    version: Number(value.version),
    issuedAt: value.issuedAt,
    instructions: value.instructions,
  }
}

function normalizeEdgeCredentialDisclosureResponse(response: unknown): EdgeCredentialDisclosureResponse {
  if (!isRecord(response)) {
    throw new Error('Invalid persistent credential disclosure response.')
  }

  const edge = normalizeCanonicalAdminEdgeServer(response.edge)
  const persistentCredential = normalizePersistentCredentialDisclosure(response.persistentCredential)

  if (!edge || !persistentCredential) {
    throw new Error('Invalid persistent credential disclosure response.')
  }

  return {
    edge,
    persistentCredential,
  }
}

function normalizeEdgePingSnapshot(value: unknown): EdgePingSnapshot {
  if (!isRecord(value) || !isEdgeLifecycleState(value.lifecycleState)) {
    throw new Error('Invalid edge ping snapshot response.')
  }

  const availability = normalizeAvailability(value.availability)
  if (!availability) {
    throw new Error('Invalid edge ping snapshot response.')
  }

  return {
    lifecycleState: value.lifecycleState,
    availability,
  }
}

function normalizeCanonicalAdminEdgeServerResponse(response: unknown): CanonicalAdminEdgeServer {
  const edge = normalizeCanonicalAdminEdgeServer(response)
  if (!edge) {
    throw new Error('Invalid canonical admin edge response.')
  }
  return edge
}

export async function getAdminEdgeFleet(): Promise<CanonicalAdminEdgeServer[]> {
  const rows = await apiClient.get<unknown[]>('/admin/edge-servers')
  return rows
    .map((edge) => normalizeCanonicalAdminEdgeServer(edge))
    .filter((edge): edge is CanonicalAdminEdgeServer => edge !== null)
}

export async function getAssignedEdgeServers(): Promise<AssignedEdgeServer[]> {
  const rows = await apiClient.get<unknown[]>('/edge-servers')
  return rows
    .map((edge) => normalizeAssignedEdgeServer(edge))
    .filter((edge): edge is AssignedEdgeServer => edge !== null)
}

export async function registerAdminEdgeServer(
  payload: RegisterEdgeServerPayload,
): Promise<EdgeCredentialDisclosureResponse> {
  const response = await apiClient.post<unknown>('/edge-servers', payload)
  return normalizeEdgeCredentialDisclosureResponse(response)
}

export async function rotateEdgeServerCredential(
  edgeId: string,
): Promise<EdgeCredentialDisclosureResponse> {
  const response = await apiClient.post<unknown>(`/edge-servers/${edgeId}/rotate-credential`)
  return normalizeEdgeCredentialDisclosureResponse(response)
}

export async function blockAdminEdgeServer(edgeId: string): Promise<CanonicalAdminEdgeServer> {
  const response = await apiClient.post<unknown>(`/edge-servers/${edgeId}/block`)
  return normalizeCanonicalAdminEdgeServerResponse(response)
}

export async function unblockEdgeServer(
  edgeId: string,
): Promise<EdgeCredentialDisclosureResponse> {
  const response = await apiClient.post<unknown>(`/edge-servers/${edgeId}/unblock`)
  return normalizeEdgeCredentialDisclosureResponse(response)
}

export async function getEdgeServerPingSnapshot(edgeId: string): Promise<EdgePingSnapshot> {
  const response = await apiClient.get<unknown>(`/edge-servers/${edgeId}/ping`)
  return normalizeEdgePingSnapshot(response)
}

export async function getEdgeServerCatalog(edgeId: string): Promise<EdgeServerCatalogRow[]> {
  return apiClient.get<EdgeServerCatalogRow[]>(`/edge-servers/${edgeId}/catalog`)
}

export async function bindEdgeServer(
  edgeId: string,
  payload: BindEdgeServerPayload,
): Promise<CanonicalAdminEdgeServer> {
  const response = await apiClient.post<unknown>(`/edge-servers/${edgeId}/bind`, payload)
  return normalizeCanonicalAdminEdgeServerResponse(response)
}

export async function revokeEdgeServerAccess(
  edgeId: string,
  userId: string,
): Promise<CanonicalAdminEdgeServer> {
  const response = await apiClient.delete<unknown>(`/edge-servers/${edgeId}/bind/${userId}`)
  return normalizeCanonicalAdminEdgeServerResponse(response)
}
