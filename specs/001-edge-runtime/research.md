# Research & Architecture Decisions: Production-Shaped Local Edge Runtime

## 1. Keep Go as the only cloud-connected local authority

- Decision: The Go runtime core is the only local process allowed to connect to `cloud_server`, execute the `004-edge-onboarding` contract, hold reconnect credentials, and decide when telemetry may be emitted as trusted.
- Rationale: This preserves the cloud-owned lifecycle semantics from `004`, keeps trust-aware behavior in one local place, and prevents hardware-facing code from accidentally becoming a second lifecycle authority.
- Alternatives considered:
  - Put cloud contract execution into the Rust worker: rejected because it mixes hardware and trust responsibilities.
  - Extend the current TypeScript stubs into the production runtime: rejected because the chosen direction is Go-first and the current files are only a thin bootstrap baseline.

## 2. Reuse the existing cloud socket and telemetry contracts unchanged

- Decision: `001-edge-runtime` reuses the existing Socket.IO `/edge` handshake plus `edge_activation`, `edge_disconnect`, `connect_error`, `edge_status`, and `telemetry` event flow already defined by `004-edge-onboarding` and implemented in `cloud_server`.
- Rationale: The shortest path to real hardware value is to keep the cloud boundary stable. Cloud and client visibility already depend on telemetry reaching cloud, so the local runtime should adapt to that contract instead of inventing a new ingress path.
- Alternatives considered:
  - Add a new REST or gRPC cloud ingress just for the new runtime: rejected because it would duplicate lifecycle semantics and delay delivery.
  - Let the edge redefine visibility or trust rules locally: rejected because the specification explicitly keeps lifecycle authority in cloud contracts.

## 3. Split stable config from rotatable runtime state

- Decision: Use separate local artifacts for:
  - operator-edited source/config definitions
  - rotated reconnect credential state
  - persisted runtime trust/outcome state
  - optional operator-readable status snapshot
- Rationale: The specification requires re-onboarding without rebuilding unchanged source definitions. Separating stable config from rotatable state also makes operator recovery simpler and keeps machine-written files small.
- Alternatives considered:
  - Store all config and runtime state in one mutable file: rejected because recovery actions would risk clobbering stable source definitions.
  - Use an embedded database for MVP: rejected because ordinary files are sufficient and align with the MVP security posture.

## 4. Implement backlog buffering in the Go core as best-effort memory state

- Decision: Keep backlog buffering in the Go core as an in-memory, best-effort queue that replays chronologically after a connectivity-only interruption and is discarded on restart or trust invalidation.
- Rationale: This matches the specification exactly: backlog must exist for temporary connectivity loss, must replay before live telemetry, must preserve timestamp order, and does not need to survive restart in MVP.
- Alternatives considered:
  - Durable on-disk queue: rejected because the spec explicitly allows backlog loss on restart for MVP.
  - No backlog at all: rejected because the feature requires buffering during connectivity-only interruptions.

## 5. Start with a Go mock adapter before Rust or real hardware is available

- Decision: Phase 1 and Phase 2 use a Go mock adapter behind the final local adapter contract so the cloud-facing runtime can be built and tested without waiting for Rust or physical devices.
- Rationale: The highest priority is showing real runtime behavior in the system, but real hardware access is unavailable in the next few days. A mock adapter lets the team validate lifecycle handling, batching, buffering, and telemetry delivery immediately.
- Alternatives considered:
  - Wait for the Rust worker before starting runtime work: rejected because it blocks progress on the most urgent path.
  - Keep relying on the simulator-only TypeScript MVP from `005-edge-test`: rejected because this feature must move beyond the simulator-only runtime shape.

## 6. Define the Go-to-Rust boundary as a transport-neutral contract first

- Decision: Define the local hardware adapter boundary as a versioned message contract first, then choose the transport after a focused spike comparing gRPC over loopback TCP with framed stdio or pipe-based transport.
- Rationale: The user explicitly called the exact local transport a planning and research question. Contract-first design de-risks that choice and allows the Go mock adapter to implement the same schema before the Rust worker exists.
- Alternatives considered:
  - Hardcode gRPC immediately: rejected because it decides transport before Windows/Linux process ergonomics are proven.
  - Use shared memory or direct library embedding: rejected because the module direction requires explicit process boundaries and easy replacement.

## 7. Keep the current TypeScript files as fixtures, not as the production runtime

- Decision: Preserve `edge_server/src/config/env.ts`, `edge_server/src/onboarding/activateEdge.ts`, `edge_server/src/onboarding/persistedCredentialStore.ts`, and `edge_server/src/transport/cloudSocketClient.ts` as contract fixtures and migration references while Go parity is built.
- Rationale: Existing `client` Vitest regressions import these files today. Freezing them avoids breaking current coverage while the production runtime moves into Go.
- Alternatives considered:
  - Delete the TypeScript files immediately: rejected because it would break existing tests and remove useful contract references.
  - Keep extending them in parallel with Go: rejected because it would create two runtimes instead of one migration path.

## 8. Keep Windows-first development but avoid Windows-only runtime semantics

- Decision: Design file paths, process supervision, and operator support so they work on Windows now and remain compatible with future Linux deployment without changing the runtime contract.
- Rationale: Current validation happens on Windows, but the feature must not become a desktop-only special case. Cross-platform file-based state and explicit process boundaries support both environments.
- Alternatives considered:
  - Adopt Windows-only service assumptions for MVP: rejected because it would work against the future deployment target.
  - Delay Windows support and build only for Linux now: rejected because it does not match the current testing reality.
