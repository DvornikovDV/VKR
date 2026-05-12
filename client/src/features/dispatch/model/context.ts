import {
  resolveBindingProfileForEdge,
  type DashboardBindingValidationResult,
} from '@/features/dashboard/model/bindingValidation'
import { normalizeDashboardRuntimeLayout } from '@/features/dashboard/model/runtimeLayout'
import type {
  DashboardBindingProfile,
  DashboardCatalogLoadStatus,
  DashboardCommandCatalog,
  DashboardDiagramDocument,
  DashboardDiagramSummary,
  DashboardRecoveryState,
  DashboardRuntimeLayout,
  DashboardTrustedEdgeServer,
} from '@/features/dashboard/model/types'
import type { DispatchDiagramOption, DispatchEdgeOption } from '@/features/dispatch/model/types'

export function hasDispatchContextKey<T extends object>(
  value: T,
  key: PropertyKey,
): key is keyof T {
  return Object.prototype.hasOwnProperty.call(value, key)
}

export function selectDispatchDiagramOptions(
  diagrams: DashboardDiagramSummary[],
): DispatchDiagramOption[] {
  return diagrams.map((diagram) => ({
    id: diagram._id,
    name: diagram.name,
    diagram,
  }))
}

export function selectDispatchSelectedDiagram(
  diagrams: DashboardDiagramSummary[],
  diagramId: string | null | undefined,
): DashboardDiagramSummary | null {
  if (!diagramId) {
    return null
  }

  return diagrams.find((diagram) => diagram._id === diagramId) ?? null
}

export function hasDispatchSavedDiagram(
  savedDiagramDocumentsById: Record<string, DashboardDiagramDocument>,
  diagramId: string | null | undefined,
): boolean {
  return Boolean(diagramId && hasDispatchContextKey(savedDiagramDocumentsById, diagramId))
}

export function selectDispatchSelectedSavedDiagram(
  savedDiagramDocumentsById: Record<string, DashboardDiagramDocument>,
  diagramId: string | null | undefined,
): DashboardDiagramDocument | null {
  if (!diagramId || !hasDispatchSavedDiagram(savedDiagramDocumentsById, diagramId)) {
    return null
  }

  return savedDiagramDocumentsById[diagramId]
}

export function hasDispatchBindingProfilesForDiagram(
  bindingProfilesByDiagram: Record<string, DashboardBindingProfile[]>,
  diagramId: string | null | undefined,
): boolean {
  return Boolean(diagramId && hasDispatchContextKey(bindingProfilesByDiagram, diagramId))
}

export function selectDispatchBindingProfilesForDiagram(
  bindingProfilesByDiagram: Record<string, DashboardBindingProfile[]>,
  diagramId: string | null | undefined,
): DashboardBindingProfile[] {
  if (!diagramId || !hasDispatchBindingProfilesForDiagram(bindingProfilesByDiagram, diagramId)) {
    return []
  }

  return bindingProfilesByDiagram[diagramId]
}

export function selectDispatchAllowedEdgeOptions(
  trustedEdges: DashboardTrustedEdgeServer[],
  bindingProfiles: DashboardBindingProfile[],
): DispatchEdgeOption[] {
  const bindingProfileByEdgeId = new Map(
    bindingProfiles.map((profile) => [profile.edgeServerId, profile]),
  )

  return trustedEdges
    .filter((edge) => bindingProfileByEdgeId.has(edge._id))
    .map((edge) => ({
      id: edge._id,
      name: edge.name,
      edge,
      hasBindingForSelectedDiagram: true,
    }))
}

export function selectDispatchSelectedEdge(
  trustedEdges: DashboardTrustedEdgeServer[],
  edgeId: string | null | undefined,
): DashboardTrustedEdgeServer | null {
  if (!edgeId) {
    return null
  }

  return trustedEdges.find((edge) => edge._id === edgeId) ?? null
}

export function selectDispatchSelectedBindingProfile(
  bindingProfiles: DashboardBindingProfile[],
  edgeId: string | null | undefined,
): DashboardBindingProfile | null {
  return resolveBindingProfileForEdge(bindingProfiles, edgeId)
}

export function selectDispatchSelectedCatalogStatus(
  catalogStatusByEdgeId: Record<string, DashboardCatalogLoadStatus>,
  edgeId: string | null | undefined,
): DashboardCatalogLoadStatus {
  return edgeId ? catalogStatusByEdgeId[edgeId] ?? 'idle' : 'idle'
}

export function selectDispatchSelectedCatalog(
  catalogsByEdgeId: Record<string, DashboardCommandCatalog>,
  edgeId: string | null | undefined,
): DashboardCommandCatalog | null {
  return edgeId ? catalogsByEdgeId[edgeId] ?? null : null
}

export function selectDispatchSelectedCatalogError(
  catalogErrorByEdgeId: Record<string, string>,
  edgeId: string | null | undefined,
): string | null {
  return edgeId ? catalogErrorByEdgeId[edgeId] ?? null : null
}

export function selectDispatchRuntimeLayout(
  savedDiagram: DashboardDiagramDocument | null | undefined,
): DashboardRuntimeLayout | null {
  return savedDiagram ? normalizeDashboardRuntimeLayout(savedDiagram.layout) : null
}

export interface DispatchRecoveryStateInputs {
  isRouteStateStructurallyInvalid: boolean
  bootstrapError: string | null
  bindingsError: string | null
  savedDiagramError: string | null
  isBootstrapLoading: boolean
  isBindingsLoading: boolean
  isSavedDiagramLoading: boolean
  hasBindingProfilesForSelectedDiagram: boolean
  requiresDashboardRuntimeContext: boolean
  selectedDiagramId: string | null
  selectedDiagram: DashboardDiagramSummary | null
  selectedEdgeId: string | null
  selectedEdge: DashboardTrustedEdgeServer | null
  selectedBindingProfile: DashboardBindingProfile | null
  selectedSavedDiagram: DashboardDiagramDocument | null
  bindingValidation: DashboardBindingValidationResult | null
  selectedRuntimeLayout: DashboardRuntimeLayout | null
}

export function selectDispatchRecoveryState({
  isRouteStateStructurallyInvalid,
  bootstrapError,
  bindingsError,
  savedDiagramError,
  isBootstrapLoading,
  isBindingsLoading,
  isSavedDiagramLoading,
  hasBindingProfilesForSelectedDiagram,
  requiresDashboardRuntimeContext,
  selectedDiagramId,
  selectedDiagram,
  selectedEdgeId,
  selectedEdge,
  selectedBindingProfile,
  selectedSavedDiagram,
  bindingValidation,
  selectedRuntimeLayout,
}: DispatchRecoveryStateInputs): DashboardRecoveryState {
  if (isRouteStateStructurallyInvalid) {
    return 'invalid-selection'
  }

  if (bootstrapError || bindingsError || savedDiagramError) {
    return 'generic-error'
  }

  if (isBootstrapLoading) {
    return 'loading'
  }

  if (!selectedDiagramId) {
    return 'empty'
  }

  if (!selectedDiagram) {
    return 'invalid-selection'
  }

  if (!hasBindingProfilesForSelectedDiagram || isBindingsLoading) {
    return 'loading'
  }

  if (!selectedEdgeId) {
    return 'empty'
  }

  if (!selectedEdge) {
    return 'invalid-selection'
  }

  if (!selectedBindingProfile) {
    return 'missing-binding-profile'
  }

  if (!requiresDashboardRuntimeContext) {
    return 'ready'
  }

  if (isSavedDiagramLoading || !selectedSavedDiagram) {
    return 'loading'
  }

  if (!bindingValidation) {
    return 'loading'
  }

  if (bindingValidation.state === 'invalid-binding-profile') {
    return 'invalid-binding-profile'
  }

  if (bindingValidation.state === 'missing-binding-profile') {
    return 'missing-binding-profile'
  }

  if (!selectedRuntimeLayout) {
    return 'loading'
  }

  if (selectedRuntimeLayout.hasBlockingIssues) {
    return 'visual-rendering-error'
  }

  if (selectedRuntimeLayout.hasRecoverableIssues) {
    return 'partial-visual-rendering'
  }

  return 'ready'
}
