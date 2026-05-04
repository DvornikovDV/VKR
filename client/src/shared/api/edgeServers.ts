export {
  bindEdgeServer,
  blockAdminEdgeServer,
  getAdminEdgeFleet,
  getAssignedEdgeServers,
  getEdgeServerCatalog,
  getEdgeServerPingSnapshot,
  registerAdminEdgeServer,
  revokeEdgeServerAccess,
  rotateEdgeServerCredential,
  unblockEdgeServer,
} from './edgeServersCanonical'

export type {
  AssignedEdgeServer,
  BindEdgeServerPayload,
  CanonicalAdminEdgeServer,
  EdgeCapabilitiesCatalogSnapshot,
  EdgeCatalogCommandCapability,
  EdgeCatalogTelemetryMetric,
  EdgeAvailabilitySnapshot,
  EdgeCredentialDisclosureResponse,
  EdgeLifecycleState,
  EdgePingSnapshot,
  EdgeServerUserRef,
  PersistentCredentialDisclosure,
  RegisterEdgeServerPayload,
} from './edgeServersCanonical'
