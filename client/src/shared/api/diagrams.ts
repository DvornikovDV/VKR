import { apiClient } from '@/shared/api/client'

export interface Diagram {
  _id: string
  name: string
  owner?: string
  layout: Record<string, unknown>
  __v?: number
  createdAt?: string
  updatedAt?: string
}

export interface EditorRouteDiagram extends Omit<Diagram, '__v'> {
  __v: number
}

export interface CreateDiagramPayload {
  name: string
  layout: Record<string, unknown>
}

export interface UpdateDiagramPayload {
  name?: string
  layout?: Record<string, unknown>
  __v: number
}

export interface UpdateDiagramResponse {
  bindingsInvalidated: boolean
}

export interface AssignDiagramPayload {
  targetUserId: string
}

export async function getDiagrams(): Promise<Diagram[]> {
  return apiClient.get<Diagram[]>('/diagrams')
}

export async function getDiagramById(diagramId: string): Promise<EditorRouteDiagram> {
  return apiClient.get<EditorRouteDiagram>(`/diagrams/${diagramId}`)
}

export async function createDiagram(payload: CreateDiagramPayload): Promise<Diagram> {
  return apiClient.post<Diagram>('/diagrams', payload)
}

export async function updateDiagram(
  diagramId: string,
  payload: UpdateDiagramPayload,
): Promise<UpdateDiagramResponse> {
  return apiClient.put<UpdateDiagramResponse>(`/diagrams/${diagramId}`, payload)
}

// "Save As" is a diagram clone operation in SPA UX and maps to POST /diagrams.
export async function cloneDiagram(payload: CreateDiagramPayload): Promise<Diagram> {
  return apiClient.post<Diagram>('/diagrams', payload)
}

export async function assignDiagramToUser(
  diagramId: string,
  payload: AssignDiagramPayload,
): Promise<Diagram> {
  return apiClient.post<Diagram>(`/diagrams/${diagramId}/assign`, payload)
}

export async function deleteDiagram(diagramId: string): Promise<void> {
  await apiClient.delete<void>(`/diagrams/${diagramId}`)
}
