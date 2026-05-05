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

export interface UpsertTelemetryProfilePayload {
  edgeServerId: string
  widgetBindings: WidgetBinding[]
  commandBindings?: CommandBinding[]
}

export async function getBindingsByDiagram(diagramId: string): Promise<TelemetryProfile[]> {
  return apiClient.get<TelemetryProfile[]>(`/diagrams/${diagramId}/bindings`)
}

export async function getDashboardBindingProfiles(
  diagramId: string,
): Promise<DashboardBindingProfile[]> {
  return apiClient.get<DashboardBindingProfile[]>(`/diagrams/${diagramId}/bindings`)
}

export async function createBinding(
  diagramId: string,
  payload: UpsertTelemetryProfilePayload,
): Promise<TelemetryProfile> {
  return apiClient.post<TelemetryProfile>(`/diagrams/${diagramId}/bindings`, payload)
}

// API replaces a profile by diagramId + edgeServerId pair via the same endpoint.
export async function updateBinding(
  diagramId: string,
  payload: UpsertTelemetryProfilePayload,
): Promise<TelemetryProfile> {
  return apiClient.post<TelemetryProfile>(`/diagrams/${diagramId}/bindings`, payload)
}

export async function deleteBinding(diagramId: string, edgeServerId: string): Promise<void> {
  await apiClient.delete<void>(`/diagrams/${diagramId}/bindings/${edgeServerId}`)
}

export async function deleteAllBindings(diagramId: string): Promise<void> {
  await apiClient.delete<void>(`/diagrams/${diagramId}/bindings`)
}
