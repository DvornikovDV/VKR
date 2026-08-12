# Data Model: Cloud Server Database

**Database Engine**: MongoDB via Mongoose

## Semantic Authority

For edge lifecycle meaning, trusted runtime behavior, and cloud-facing trust semantics, this data model follows `specs/007-edge-server/spec.md`.

## Core Collections

### User

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | Primary key |
| `email` | string | Unique |
| `passwordHash` | string | Bcrypt hash |
| `role` | `ADMIN \| USER` | Authorization |
| `subscriptionTier` | `FREE \| PRO` | Business limits |
| `isDeleted` | boolean | Soft delete |
| `isBanned` | boolean | Access block |

Diagram quota and eligibility writers coordinate through expiring
`MutationLease` records rather than persisted lock fields on `User`.

### EdgeServer

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | Publicly used as `edgeId` |
| `name` | string | Human-readable machine name |
| `trustedUsers` | ObjectId[] | Allowed USER subscribers/editors |
| `createdBy` | ObjectId | Admin creator |
| `lifecycleState` | `Active \| Blocked` | Cloud-owned lifecycle state |
| `availability.online` | boolean | Current cloud-projected availability |
| `availability.lastSeenAt` | Date or null | Last accepted edge activity |
| `persistentCredential.secretHash` | string | Current trusted credential hash |
| `persistentCredential.version` | number | Monotonic credential version |
| `persistentCredential.issuedAt` | Date | Current credential issue time |
| `persistentCredential.lastAcceptedAt` | Date or null | Last successful trusted connect |
| `lastLifecycleEventAt` | Date or null | Last register/rotate/block/unblock timestamp |
| `createdAt` | Date | Record creation timestamp |

**Invariants**:

- every edge record exists in lifecycle `Active` or `Blocked` only
- newly registered edges start as `Active` with separate offline availability
- only the current persistent credential authorizes trusted edge runtime behavior
- credential rotation invalidates the prior credential immediately without creating a second active credential slot
- block prevents trusted reconnect until unblock issues a fresh credential

### Diagram

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | Primary key |
| `ownerId` | ObjectId | Diagram owner |
| `sourceTemplateId` | ObjectId or null | Assignment provenance for an independent User copy; absent for Admin templates, ordinary creation, and Save As |
| `quotaSlot` | `1 \| 2 \| 3` or null | Internal atomic FREE USER quota slot; absent for Admin and PRO diagrams |
| `name` | string | Diagram name |
| `layout` | object | Pure visual geometry |
| `__v` | number | OCC version |

**Indexes and invariants**:

- `uniq_diagram_owner_source_template` is a partial unique index on `(ownerId, sourceTemplateId)` when `sourceTemplateId` exists; it prevents duplicate assignment of one Admin template to one User.
- `uniq_diagram_owner_quota_slot` is a partial unique index on `(ownerId, quotaSlot)` when `quotaSlot` exists; it atomically limits a FREE USER to slots `1..3`.
- An Admin-owned diagram acts as a retained layout template and remains owned by the Admin after assignment.
- Assignment creates a new User-owned diagram with copied persisted name/layout, no binding profiles, and `sourceTemplateId` provenance.
- `sourceTemplateId` is not a live dependency. Editing or deleting either record does not synchronize, delete, or invalidate the other.
- Ordinary User creation and Save As do not set `sourceTemplateId`.
- FREE USER creation, Save As, and assignment use the same quota-slot allocator. Admin and PRO diagram creation do not use quota slots.
- On PRO-to-FREE reconciliation, the three newest editable diagrams receive slots; excess diagrams remain without slots and block new creation until total usage is below the FREE limit.

### MutationLease

| Field | Type | Notes |
|---|---|---|
| `_id` | string | Built-in unique `user:<id>` or `diagram:<id>` coordination key |
| `resourceKey` | string | Readable copy of the coordination key |
| `token` | string | Random lease-owner token required for release |
| `expiresAt` | Date | Renewable expiration and crash-recovery boundary |

**Invariants and limitations**:

- Normal diagram, quota, eligibility, and template writers acquire the relevant
  leases in sorted resource-key order.
- Only the matching token may release a lease. A crashed writer cannot block the
  resource after lease expiration.
- The TTL index removes expired lease documents as cleanup only; acquisition
  correctness uses atomic compare-and-update against `expiresAt`.
- Leases coordinate standalone MongoDB writers but do not make multi-document
  mutations atomic.
- `repair:diagram-consistency` idempotently removes orphan bindings, clears
  obsolete persisted quota-lock fields, and reconciles quota slots after rare
  partial failures.

### DiagramBindings

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | Primary key |
| `diagramId` | ObjectId | Parent diagram |
| `ownerId` | ObjectId | Must match diagram owner |
| `edgeServerId` | ObjectId | Machine context |
| `widgetBindings` | array | `[{ widgetId, deviceId, metric }]` |

**Constraint**: unique index on `(diagramId, edgeServerId)`.

### Telemetry

| Field | Type | Notes |
|---|---|---|
| `timestamp` | Date | Event time |
| `metadata.edgeId` | string | Edge identifier |
| `metadata.deviceId` | string | Device identifier inside one edge |
| `metric` | string | Metric identity inside one device stream |
| `value` | number or boolean | Aggregated persisted value |

**Invariant**: Within one `metadata.edgeId`, the canonical telemetry stream identity is the pair `metadata.deviceId + metric`.

**Compatibility note**: Legacy persisted documents may still contain `metadata.sourceId`, but the active cloud model does not use it as a canonical identity key and runtime contracts must not require it.

## Derived Read Models

### AdminEdgeServerRecord

Read model returned by cloud admin edge endpoints.

| Field | Type | Notes |
|---|---|---|
| `_id` | string | Edge id |
| `name` | string | Display name |
| `trustedUsers` | array | Assigned USER references |
| `createdBy` | object or null | Admin creator summary |
| `lifecycleState` | `Active \| Blocked` | Cloud-owned lifecycle |
| `availability` | object | `online`, `lastSeenAt` |
| `persistentCredentialVersion` | number or null | Current credential version |
| `lastLifecycleEventAt` | string or null | Latest lifecycle change timestamp |
| `createdAt` | string | Creation timestamp |

### UserEdgeServerRecord

Read model returned by user-facing edge list endpoints.

| Field | Type | Notes |
|---|---|---|
| `_id` | string | Edge id |
| `name` | string | Display name |
| `lifecycleState` | `Active \| Blocked` | Consumer-visible lifecycle |
| `availability` | object | `online`, `lastSeenAt` |
| `createdAt` | string | Creation timestamp |

### EdgeDeviceMetricCatalogEntry

Not stored as a dedicated collection in MVP. Returned by `GET /api/edge-servers/:edgeId/catalog`, derived from telemetry visible for the selected edge server.

| Field | Type | Notes |
|---|---|---|
| `edgeServerId` | string | Requested edge id |
| `deviceId` | string | Stable binding identifier |
| `metric` | string | Stable binding identifier |
| `label` | string | Fallback label, e.g. `deviceId + metric` |

**Invariant**: Catalog deduplication is based on `edgeServerId + deviceId + metric`; `sourceId` is not part of the canonical read model.

**Compatibility note**: Catalog responses do not expose `sourceId`; any Edge-local source grouping remains outside the Cloud/Client catalog identity contract.

## API Lifecycle Notes

- `POST /api/edge-servers` registers a new edge, creates it in `Active`, and discloses the first persistent credential once.
- `POST /api/edge-servers/{edgeId}/rotate-credential` replaces the current credential immediately while keeping the edge `Active`.
- `POST /api/edge-servers/{edgeId}/block` moves the edge to `Blocked` and interrupts current trusted access.
- `POST /api/edge-servers/{edgeId}/unblock` returns the edge to `Active` and discloses a fresh persistent credential once.
- `POST /api/edge-servers/{edgeId}/bind` assigns an edge to a user without changing lifecycle semantics.
- `GET /api/edge-servers/{edgeId}/catalog` returns a read-only telemetry-derived catalog for hosted constructor UI.
- `GET /api/edge-servers/{edgeId}/ping` returns lifecycle and availability snapshot data.
- `POST /api/diagrams` creates a new diagram.
- `POST /api/diagrams` creates retained Admin templates without USER FREE quota slots and creates ordinary User/Save As diagrams without assignment provenance.
- `POST /api/diagrams/:id/assign` creates an independent binding-free User-owned copy, retains the Admin template, and revalidates target eligibility, current quota, and duplicate provenance.
- `PUT /api/diagrams/:id` updates layout/name in place and returns `bindingsInvalidated`.
- `DELETE /api/diagrams/:id` hard-deletes the diagram and all its bindings.
- `DELETE /api/diagrams/:id/bindings` bulk-deletes all binding sets for the diagram owner.
- `POST /api/diagrams/:id/bindings` upserts one machine-scoped binding set.
