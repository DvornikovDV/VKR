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

export interface EdgeCatalogTelemetryMetric {
  deviceId: string
  metric: string
  valueType?: 'boolean' | 'number' | 'string'
  label: string
}

export interface EdgeCatalogCommandCapability {
  deviceId: string
  commandType: 'set_bool' | 'set_number'
  valueType: 'boolean' | 'number'
  min?: number
  max?: number
  reportedMetric: string
  label: string
}

export interface EdgeCapabilitiesCatalogSnapshot {
  edgeServerId: string
  telemetry: EdgeCatalogTelemetryMetric[]
  commands: EdgeCatalogCommandCapability[]
}

// Transitional legacy adapter input: old telemetry rows from early rollout APIs.
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

function normalizeTelemetryValueType(value: unknown): 'boolean' | 'number' | 'string' | undefined {
  if (value === 'boolean' || value === 'number' || value === 'string') {
    return value
  }
  return undefined
}

function normalizeTelemetryCatalogEntry(value: unknown): EdgeCatalogTelemetryMetric | null {
  if (!isRecord(value) || !isNonEmptyString(value.deviceId) || !isNonEmptyString(value.metric)) {
    return null
  }

  const normalized: EdgeCatalogTelemetryMetric = {
    deviceId: value.deviceId,
    metric: value.metric,
    label: isNonEmptyString(value.label) ? value.label : `${value.deviceId} / ${value.metric}`,
  }

  const valueType = normalizeTelemetryValueType(value.valueType)
  if (valueType) {
    normalized.valueType = valueType
  }

  return normalized
}

function normalizeCommandValueType(value: unknown): 'boolean' | 'number' | null {
  if (value === 'boolean' || value === 'number') {
    return value
  }
  return null
}

function normalizeFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function normalizeCommandCatalogEntry(value: unknown): EdgeCatalogCommandCapability | null {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.deviceId) ||
    !isNonEmptyString(value.reportedMetric) ||
    !isNonEmptyString(value.label)
  ) {
    return null
  }

  if (value.commandType !== 'set_bool' && value.commandType !== 'set_number') {
    return null
  }

  const valueType = normalizeCommandValueType(value.valueType)
  if (!valueType) {
    return null
  }

  const normalized: EdgeCatalogCommandCapability = {
    deviceId: value.deviceId,
    commandType: value.commandType,
    valueType,
    reportedMetric: value.reportedMetric,
    label: value.label,
  }

  const min = normalizeFiniteNumber(value.min)
  if (min !== undefined) {
    normalized.min = min
  }

  const max = normalizeFiniteNumber(value.max)
  if (max !== undefined) {
    normalized.max = max
  }

  return normalized
}

function normalizeLegacyCatalogRowTelemetry(value: unknown): EdgeCatalogTelemetryMetric | null {
  if (!isRecord(value) || !isNonEmptyString(value.deviceId) || !isNonEmptyString(value.metric)) {
    return null
  }

  return {
    deviceId: value.deviceId,
    metric: value.metric,
    label: isNonEmptyString(value.label) ? value.label : `${value.deviceId} / ${value.metric}`,
  }
}

function normalizeLegacyCatalogRows(
  rows: unknown[],
  fallbackEdgeServerId: string,
): EdgeCapabilitiesCatalogSnapshot {
  const telemetry = rows
    .map((row) => normalizeLegacyCatalogRowTelemetry(row))
    .filter((row): row is EdgeCatalogTelemetryMetric => row !== null)

  const edgeServerIdFromRows = rows.find(
    (row): row is EdgeServerCatalogRow => isRecord(row) && isNonEmptyString(row.edgeServerId),
  )

  return {
    edgeServerId: edgeServerIdFromRows?.edgeServerId ?? fallbackEdgeServerId,
    telemetry,
    commands: [],
  }
}

function normalizeEdgeServerCatalog(
  value: unknown,
  fallbackEdgeServerId: string,
): EdgeCapabilitiesCatalogSnapshot {
  if (Array.isArray(value)) {
    return normalizeLegacyCatalogRows(value, fallbackEdgeServerId)
  }

  if (!isRecord(value) || !isNonEmptyString(value.edgeServerId)) {
    throw new Error('Invalid edge catalog response.')
  }

  if (!Array.isArray(value.telemetry) || !Array.isArray(value.commands)) {
    throw new Error('Invalid edge catalog response.')
  }

  const telemetry = value.telemetry
    .map((entry) => normalizeTelemetryCatalogEntry(entry))
    .filter((entry): entry is EdgeCatalogTelemetryMetric => entry !== null)
  const commands = value.commands
    .map((entry) => normalizeCommandCatalogEntry(entry))
    .filter((entry): entry is EdgeCatalogCommandCapability => entry !== null)

  return {
    edgeServerId: value.edgeServerId,
    telemetry,
    commands,
  }
}

function normalizeCanonicalAdminEdgeServerResponse(response: unknown): CanonicalAdminEdgeServer {
  const edge = normalizeCanonicalAdminEdgeServer(response)
  if (!edge) {
    throw new Error('Invalid canonical admin edge response.')
  }
  return edge
}

function normalizeCanonicalAdminEdgeMutationResponse(response: unknown): CanonicalAdminEdgeServer {
  if (!isRecord(response)) {
    throw new Error('Invalid canonical admin edge mutation response.')
  }

  const edge = normalizeCanonicalAdminEdgeServer(response.edge)
  if (!edge) {
    throw new Error('Invalid canonical admin edge mutation response.')
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
  return normalizeCanonicalAdminEdgeMutationResponse(response)
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

export async function getEdgeServerCatalog(edgeId: string): Promise<EdgeCapabilitiesCatalogSnapshot> {
  const response = await apiClient.get<unknown>(`/edge-servers/${edgeId}/catalog`)
  return normalizeEdgeServerCatalog(response, edgeId)
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
