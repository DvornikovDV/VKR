# Phase 1: Data Model (Display Layer)

> **Canonical terminology** (from `spec.md` §Clarifications):
> - Набор привязок виджетов к оборудованию = **Telemetry Profile (Профиль телеметрии)**
> - Оборудование в контексте дашборда = **Monitored Object (Объект мониторинга)** (инфраструктурно — Edge Server)
> - Мнемосхема = **Mnemonic Diagram**

The SPA doesn't own the canonical data model (it resides in the backend DB), but it implements specialized representations optimized for display and state management.

> All paths use `client/src/` prefix (new `/client` SPA module).

## 1. Auth & session

```typescript
type AppRole = "ADMIN" | "USER";
type SubscriptionTier = "FREE" | "PRO";

interface Session {
  id: string; // user ID
  email: string;
  role: AppRole;
  tier: SubscriptionTier;
  accessToken: string;
}
```

## 2. User & Equipment Models

```typescript
type EdgeLifecycleState = "Active" | "Blocked";

interface EdgeAvailabilitySnapshot {
  online: boolean;
  lastSeenAt: string | null;
}

interface EdgeServerDisplay {
  id: string;
  name: string;
  lifecycleState: EdgeLifecycleState;
  availability: EdgeAvailabilitySnapshot;
  
  // Specific to Admin views:
  assignedUserId?: string | null;
  registeredByAdminId?: string;
}

interface UserProfileDetails {
  id: string;
  email: string;
  role: AppRole;
  tier: SubscriptionTier;
  diagramsUsed: number;
  diagramsLimit: number | null; // null represents infinite
  equipmentUsed: number;
  equipmentLimit: number | null; 
}
```

## 3. Diagram Models

```typescript
// One TelemetryProfile = one (diagramId + edgeServerId) pair = one DiagramBindings document
interface TelemetryProfileEntry {
  telemetryProfileId: string;  // = DiagramBindings._id
  monitoredObjectId: string;   // = edgeServerId
  monitoredObjectName: string;
  isOnline: boolean;
}

interface DiagramCardDisplay {
  id: string;
  name: string;
  thumbnailUrl: string;
  ownerId: string;
  telemetryProfiles: TelemetryProfileEntry[]; // one per Monitored Object
}
```

## 4. UI State Models (Zustand)

```typescript
// Auth Store State (client/src/shared/store/useAuthStore.ts)
interface AuthState {
  session: Session | null;
  isAuthenticated: boolean;
  setSession: (session: Session) => void;
  logout: () => void;
}

// Diagram Editor State (client/src/shared/store/useEditorStore.ts)
interface EditorState {
  activeDiagramId: string | null;
  activeTelemetryProfileId: string | null; // formerly 'activeBindingSetId'
  isDirty: boolean; // Tracks unsaved changes for OCC warning
}

// Telemetry Store State (client/src/shared/store/useTelemetryStore.ts)
interface TelemetryState {
  isConnected: boolean;
  subscribedEdgeId: string | null;
  latestValues: Record<string, number | string>; // widgetId → value
}
```
