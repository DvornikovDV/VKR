# Data Model: Edge Server Onboarding Contract

## 1. Edge Server Aggregate

The canonical aggregate remains `EdgeServer`, but it becomes lifecycle-aware instead of storing only a single long-lived `apiKeyHash`.

| Field | Type | Source | Notes |
|---|---|---|---|
| `_id` | string | MongoDB | Stable edge identifier disclosed in onboarding packages |
| `name` | string | Admin input | Minimum human-readable identifier for product surfaces |
| `createdBy` | string or null | Admin session | Admin who registered the edge |
| `trustedUsers[]` | string[] | Admin bind/unbind flows | Access assignment, not readiness by itself |
| `lifecycleState` | `Pending First Connection \| Active \| Re-onboarding Required \| Blocked` | Cloud-owned | Canonical onboarding state |
| `availability.lastSeenAt` | ISO datetime or null | Runtime telemetry/socket | Runtime reachability only |
| `availability.online` | boolean | Derived/runtime | Must not replace lifecycle meaning |
| `activation.firstActivatedAt` | ISO datetime or null | Successful onboarding | Timestamp of the first successful trusted activation |
| `activation.lastActivatedAt` | ISO datetime or null | Successful onboarding/re-onboarding | Timestamp of the latest successful onboarding cycle |
| `activation.lastRejectedAt` | ISO datetime or null | Failed activation/reconnect | Latest rejection useful for support UX |
| `createdAt` | ISO datetime | MongoDB | Registration timestamp |

## 2. Current Onboarding Credential

At most one onboarding package may be valid for an edge at any given moment.

| Field | Type | Notes |
|---|---|---|
| `credentialId` | string | Stable server-side identifier for the issued package |
| `secretHash` | string | Hash of the one-time onboarding secret |
| `displayHint` | string or null | Optional short non-secret hint for Admin metadata views |
| `issuedAt` | ISO datetime | Initial issue or reset timestamp |
| `expiresAt` | ISO datetime | Always `issuedAt + 24h` unless invalidated sooner |
| `issuedBy` | string | Admin who issued or reset the package |
| `status` | `ready \| used \| expired \| reset \| blocked` | Canonical package outcome |
| `usedAt` | ISO datetime or null | Set on successful first activation |
| `supersededByCredentialId` | string or null | Filled when reset replaces the package |

### Validation rules

- Only one onboarding package may be in `ready` status per edge.
- A `ready` package is valid only while the edge lifecycle is `Pending First Connection` or `Re-onboarding Required`.
- A `ready` package for an `Active` edge may exist after a recovery reset, but it must not be accepted until trust is later revoked and lifecycle becomes `Re-onboarding Required`.
- A used, expired, reset, or blocked package can never activate an edge again.

## 3. Persistent Reconnect Credential

This credential is issued only after successful onboarding and is the only credential accepted for later trusted reconnects while the edge remains `Active`.

| Field | Type | Notes |
|---|---|---|
| `version` | integer | Incremented on each successful onboarding cycle |
| `secretHash` | string | Hash of the persistent reconnect secret |
| `issuedAt` | ISO datetime | When Cloud promoted the edge into trusted reconnect mode |
| `lastAcceptedAt` | ISO datetime or null | Latest successful reconnect using this credential |
| `revokedAt` | ISO datetime or null | Set on trust revoke or block |
| `revocationReason` | `recovery \| block \| rotate` or null | Why the credential stopped being valid |

### Validation rules

- Persistent reconnect credentials are valid only while lifecycle is `Active`.
- Blocking or trust-revoking an edge must invalidate the current persistent credential immediately.
- A fresh successful onboarding cycle rotates the persistent credential and increments `version`.

## 4. Onboarding Audit Event

Use a dedicated immutable collection keyed by `edgeId` for supportability and investigations.

| Field | Type | Notes |
|---|---|---|
| `_id` | string | Event identifier |
| `edgeId` | string | Parent aggregate id |
| `type` | `registered \| onboarding_issued \| onboarding_reset \| onboarding_expired \| activation_succeeded \| activation_rejected \| persistent_issued \| trust_revoked \| blocked \| reenabled` | Event category |
| `actorType` | `admin \| edge \| system` | Source of the change |
| `actorId` | string or null | Admin user id or edge id when available |
| `occurredAt` | ISO datetime | Audit timestamp |
| `details` | object | Sanitized reason metadata, never plaintext secrets |

### Validation rules

- Audit entries must never contain plaintext onboarding or persistent secrets.
- Every issue, reset, rejection, success, revoke, block, and re-enable path writes one event.

## 5. Client-Facing Projections

### Admin Fleet Edge Record

| Field | Type | Source |
|---|---|---|
| `_id` | string | Edge aggregate |
| `name` | string | Edge aggregate |
| `lifecycleState` | enum | Edge aggregate |
| `availability` | object | Derived runtime projection |
| `trustedUsers[]` | array | Existing assignment relation |
| `createdBy` | object | Existing admin relation |
| `currentOnboardingPackage` | metadata object or null | Masked onboarding metadata only |
| `persistentCredentialVersion` | integer or null | Current reconnect credential version |
| `lastLifecycleEventAt` | ISO datetime or null | Latest audit summary timestamp |
| `isTelemetryReady` | boolean | True only when `lifecycleState === Active` |

### Trusted Telemetry-Ready Edge

Returned by user-facing queries consumed by Constructor readiness and Dashboard monitoring.

| Field | Type | Notes |
|---|---|---|
| `_id` | string | Edge id |
| `name` | string | UI label |
| `lifecycleState` | `Active` only | Included for explicitness |
| `availability` | object | Optional runtime status hint |

## 6. State Machine

### Canonical state meanings

| State | Meaning |
|---|---|
| `Pending First Connection` | Edge exists, no successful trusted activation has happened yet |
| `Active` | Edge completed onboarding, has a valid persistent reconnect credential, and is telemetry-ready |
| `Re-onboarding Required` | Edge is no longer trusted for downstream use and must complete a fresh onboarding cycle |
| `Blocked` | Edge is intentionally prevented from both first-time connection and later reconnects |

### State transitions

| Trigger | From | To | Side effects |
|---|---|---|---|
| Admin registers edge | none | `Pending First Connection` | Issue onboarding package, write audit event |
| Admin resets onboarding package before first activation | `Pending First Connection` | `Pending First Connection` | Invalidate prior package, issue fresh package |
| Successful onboarding connection | `Pending First Connection` | `Active` | Retire onboarding package, issue persistent credential, write activation events |
| Admin resets onboarding package for recovery | `Active` | `Active` | Issue fresh package only; current trust stays valid |
| Admin revokes trust for recovery | `Active` | `Re-onboarding Required` | Revoke persistent credential, disconnect active session, keep latest valid onboarding package if present |
| Successful re-onboarding connection | `Re-onboarding Required` | `Active` | Retire onboarding package, rotate persistent credential |
| Admin blocks edge | `Pending First Connection`, `Active`, `Re-onboarding Required` | `Blocked` | Invalidate onboarding package, revoke persistent credential, disconnect active session |
| Admin re-enables onboarding | `Blocked` | `Re-onboarding Required` | Clear block, require explicit onboarding package issue/reset before reconnection if none is valid |

## 7. Derived Rules

- `isTelemetryReady` is `true` if and only if `lifecycleState === Active`.
- Availability changes never move the edge back into `Pending First Connection`.
- Bind/unbind changes access control only; they do not change lifecycle state.
- A reconnect using an outdated persistent credential behaves like a rejected reconnect and must not restore trust.
