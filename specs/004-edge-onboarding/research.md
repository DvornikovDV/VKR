# Research & Architecture Decisions: Edge Server Onboarding Contract

## 1. Cloud remains the sole authority for onboarding lifecycle

- Decision: Keep all canonical onboarding state, credential validation, and trust transitions in `cloud_server`.
- Rationale: The specification defines a cross-product contract. `client` must display the states, and `edge_server` must obey them, but only `cloud_server` can reliably coordinate registration, acceptance/rejection, audit, and telemetry-ready eligibility.
- Alternatives considered:
  - Put onboarding state in `client`: rejected because UI ownership cannot authoritatively enforce trust.
  - Put onboarding state in `edge_server`: rejected because that would mix cloud business rules into the device-side runtime.

## 2. Model credentials as two slots on the edge aggregate plus an audit stream

- Decision: Represent each edge with one aggregate that contains:
  - lifecycle state
  - current one-time onboarding credential metadata
  - current persistent reconnect credential metadata
  - trusted user assignments
  - activation timestamps
  - availability timestamps
  - a separate immutable audit collection keyed by `edgeId`
- Rationale: The hot path for edge authentication already resolves by `edgeId`, so keeping current credential metadata on the aggregate avoids extra lookups. A separate audit collection prevents unbounded growth of the main edge document.
- Alternatives considered:
  - Put every credential in its own collection: rejected because edge auth would require additional read joins on the critical path.
  - Store audit events inline on the edge document: rejected because append-only history would make the aggregate grow without bound.

## 3. Store only hashed secrets and non-secret disclosure metadata

- Decision: Generate opaque random secrets for both onboarding and persistent credentials, hash them before storage, and keep only masked disclosure metadata such as issuance time, expiry time, credential version, and a short display hint.
- Rationale: The spec explicitly forbids recovering previously issued secrets from ordinary product views. Hash-only storage preserves that rule while still allowing Cloud to verify edge-presented credentials.
- Alternatives considered:
  - Store encrypted plaintext for later re-display: rejected because it violates the non-recoverability requirement.
  - Keep the one-time secret unhashed for simplicity: rejected because it increases breach impact and conflicts with the current hashed `apiKeyHash` direction.

## 4. Keep onboarding and later reconnects on the existing Socket.IO `/edge` transport

- Decision: Use the existing `/edge` namespace for both first activation and returning reconnects, but distinguish them through an explicit credential mode in the handshake payload.
- Rationale: The current system already authenticates edge devices through Socket.IO. Reusing that ingress keeps the runtime topology simple and avoids inventing a parallel device-only REST ingress path.
- Alternatives considered:
  - Add a brand-new REST activation endpoint for devices: rejected because the edge runtime already has an established socket-based ingress.
  - Keep a single undifferentiated secret forever: rejected because the spec requires first-use rotation into a persistent reconnect credential.

## 5. Deliver the persistent reconnect credential through an activation event

- Decision: After a successful onboarding connection, Cloud emits a one-time `edge_activation` payload to that socket containing the newly issued persistent reconnect credential and metadata needed to persist it locally on the edge.
- Rationale: The edge is already connected on the transport that proved possession of the one-time secret. Emitting the persistent credential there avoids an extra device-side round trip and keeps the first successful activation flow self-contained.
- Alternatives considered:
  - Require the edge to call a second REST endpoint after activation: rejected because it introduces an avoidable second trust-sensitive step.
  - Reuse the onboarding secret forever after activation: rejected because the spec requires the onboarding secret to be retired after first use.

## 6. Separate recovery trust revoke from blocking

- Decision: Introduce an explicit trust-revoke action distinct from block:
  - `reset onboarding credentials` prepares a fresh package
  - `trust revoke` moves an `Active` edge to `Re-onboarding Required`
  - `block` moves any edge to `Blocked` and forbids both first-time connection and later reconnects
- Rationale: The clarifications explicitly state that resetting onboarding credentials for an active edge must not immediately remove current trust. A separate trust-revoke action is required to represent recovery without conflating it with an operational block.
- Alternatives considered:
  - Make reset immediately revoke trust: rejected because it contradicts the clarification.
  - Reuse block for recovery: rejected because blocked edges are intentionally denied onboarding until an Admin re-enables them.

## 7. Re-enable onboarding should change state only, not silently disclose a new secret

- Decision: Re-enabling a blocked edge moves it to `Re-onboarding Required` and clears the block, but does not automatically disclose a new onboarding secret. Admins must explicitly run the reset/issue flow to obtain a fresh first-connection package.
- Rationale: Secret disclosure is a one-time, operator-facing action with loss/handling implications. Automatically revealing a secret during unblock would couple an operational state change to a sensitive disclosure event and make secret handling easier to miss.
- Alternatives considered:
  - Auto-issue a fresh package on re-enable: rejected because it blends two actions with different security expectations and increases accidental secret loss risk.

## 8. User-facing telemetry-ready queries must return only `Active` edges

- Decision: Keep Admin fleet endpoints lifecycle-rich, but restrict user-facing trusted edge queries and downstream readiness consumers to `Active` edges only.
- Rationale: Constructor binding flows and Dashboard monitoring should never infer readiness from generic trust assignment or availability alone. `Active` is the single telemetry-ready gate defined by the spec.
- Alternatives considered:
  - Return all trusted edges and let each page decide: rejected because that duplicates lifecycle semantics across features.
  - Treat online/offline as readiness: rejected because availability is explicitly separate from onboarding lifecycle.

## 9. Preserve bind/unbind as assignment mechanics, not readiness mechanics

- Decision: Keep existing bind/unbind relationships between an edge and `trustedUsers`, but make those relationships insufficient on their own for telemetry-ready use. The lifecycle gate remains `Active`.
- Rationale: Current client and cloud code already depend on edge-to-user assignment, especially for constructor and telemetry catalog access. The new feature should refine eligibility rather than remove assignment semantics.
- Alternatives considered:
  - Remove `trustedUsers` entirely during onboarding work: rejected because assignment is still needed for access control after activation.

## 10. Test the feature as a combined REST + socket contract

- Decision: Treat the implementation as a contract feature requiring both REST and Socket.IO coverage:
  - REST for registration, reset, block, re-enable, bind/unbind, and filtered list behavior
  - Socket.IO for first activation, persistent reconnects, reuse rejection, and immediate disconnect after revoke/block
- Rationale: Most critical regressions here live at the boundary between lifecycle state and edge transport. REST-only tests would miss the trust-establishment path; socket-only tests would miss Admin disclosure and fleet behavior.
- Alternatives considered:
  - Rely on manual device testing only: rejected because lifecycle regressions are too easy to reintroduce.
