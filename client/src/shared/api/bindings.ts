import { apiClient } from '@/shared/api/client'

export interface WidgetBinding {
  widgetId: string
  deviceId: string
  metric: string
}

export interface CommandBinding {
  widgetId: string
  deviceId: string
  commandType: 'set_bool' | 'set_number'
}

export interface TelemetryProfile {
  _id: string
  diagramId: string
  edgeServerId: string
  widgetBindings: WidgetBinding[]
  commandBindings: CommandBinding[]
  createdAt?: string
  updatedAt?: string
}

export type DashboardBindingProfile = TelemetryProfile

type ApiTelemetryProfile = Omit<TelemetryProfile, 'commandBindings'> & {
  commandBindings?: CommandBinding[]
}

export interface UpsertTelemetryProfilePayload {
  edgeServerId: string
  widgetBindings: WidgetBinding[]
  commandBindings?: CommandBinding[]
}

export function normalizeDashboardBindingProfile(
  profile: ApiTelemetryProfile,
): DashboardBindingProfile {
  return {
    ...profile,
    commandBindings: Array.isArray(profile.commandBindings) ? profile.commandBindings : [],
  }
}

function normalizeDashboardBindingProfiles(
  profiles: ApiTelemetryProfile[],
): DashboardBindingProfile[] {
  return profiles.map((profile) => normalizeDashboardBindingProfile(profile))
}

export async function getBindingsByDiagram(diagramId: string): Promise<TelemetryProfile[]> {
  const profiles = await apiClient.get<ApiTelemetryProfile[]>(`/diagrams/${diagramId}/bindings`)
  return normalizeDashboardBindingProfiles(profiles)
}

export async function getDashboardBindingProfiles(
  diagramId: string,
): Promise<DashboardBindingProfile[]> {
  const profiles = await apiClient.get<ApiTelemetryProfile[]>(`/diagrams/${diagramId}/bindings`)
  return normalizeDashboardBindingProfiles(profiles)
}

export async function createBinding(
  diagramId: string,
  payload: UpsertTelemetryProfilePayload,
): Promise<TelemetryProfile> {
  const profile = await apiClient.post<ApiTelemetryProfile>(`/diagrams/${diagramId}/bindings`, payload)
  return normalizeDashboardBindingProfile(profile)
}

// API replaces a profile by diagramId + edgeServerId pair via the same endpoint.
export async function updateBinding(
  diagramId: string,
  payload: UpsertTelemetryProfilePayload,
): Promise<TelemetryProfile> {
  const profile = await apiClient.post<ApiTelemetryProfile>(`/diagrams/${diagramId}/bindings`, payload)
  return normalizeDashboardBindingProfile(profile)
}

export async function deleteBinding(diagramId: string, edgeServerId: string): Promise<void> {
  await apiClient.delete<void>(`/diagrams/${diagramId}/bindings/${edgeServerId}`)
}

export async function deleteAllBindings(diagramId: string): Promise<void> {
  await apiClient.delete<void>(`/diagrams/${diagramId}/bindings`)
}
