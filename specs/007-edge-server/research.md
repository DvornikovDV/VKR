# Research: Edge Runtime Under Existing Cloud Authority

This research closes only the edge-side questions that remained open after the semantic baseline in `specs/007-edge-server/spec.md` was fixed. It does not redesign lifecycle or cloud contracts.

## 1. Minimal Windows-first operator/bootstrap flow

### Decision

Use a file-based operator bootstrap flow on the edge machine:

1. Admin registers or unblocks the edge in cloud.
2. Cloud discloses the current persistent credential once through the existing admin API.
3. The operator installs or updates two local files on the Windows machine:
   - `edge-runtime.yaml`
   - `credential.json`
4. The runtime starts as a Windows-first local service or console process, reads both files, and attempts a trusted `/edge` connect immediately.
5. On credential rotation or unblock, the operator replaces `credential.json` with the newly disclosed credential and restarts or signals the runtime to reload it.

### Rationale

- This matches the active model where cloud-owned register, rotate, block, and unblock actions already produce the authoritative credential outcome.
- It avoids inventing an onboarding-package or `edge_activation` recovery path that no longer exists in the current websocket contract.
- It fits Windows-first operator reality without requiring a new installer, agent fleet manager, or background enrollment service in the baseline scope.

### Alternatives considered

- Reuse onboarding-package bootstrap: rejected because it reintroduces deprecated lifecycle semantics and depends on an event path absent from the active cloud contract.
- Fetch credentials directly from cloud at startup: rejected because the credential disclosure channel is cloud-admin-owned, one-time, and outside the runtime trust contract.
- Store credentials only in environment variables: rejected because operator rotation and Windows service operation are cleaner and auditable with an explicit local credential file.

## 2. Local config and local runtime state needed on the edge

### Decision

Split local edge-owned state into four artifacts with clear ownership:

- `edge-runtime.yaml`
  - stable operator-managed config
  - cloud URL, state directory, logging, batching, and source definitions
- `credential.json`
  - current persistent credential disclosure installed on the machine
- `runtime-state.json`
  - runtime-owned memory snapshot persisted for restart visibility and operator diagnostics
- `status.json`
  - operator-visible current status snapshot for local tools and support checks

Use transient in-memory state for live socket status, retry backoff, active adapter handles, pending batch, and session epoch.

### Rationale

- The config changes rarely and should not be rewritten by the runtime.
- Credential material is sensitive and should be isolated from the broader config file.
- Runtime-state and status snapshots serve different purposes: one for durable local reasoning, one for fast operator visibility.
- This keeps local artifacts explicit and avoids overloading one file with secrets, live status, and immutable configuration.

### Alternatives considered

- Single file for config plus runtime state plus credential: rejected because it mixes secret rotation, operator edits, and runtime rewrites in one collision-prone surface.
- Memory-only runtime with no local files except config: rejected because the user explicitly asked for production-shaped local state, operator-visible status, and persistent credential handling.
- Persist every transient queue and per-source detail: rejected because durable backlog and replay are out of scope.

## 3. Credential storage and usage under the persistent-only model

### Decision

Persist the current credential on disk as a runtime-consumed local file with the following minimum fields:

- `edgeId`
- `credentialSecret`
- `version`
- `issuedAt`
- `source` such as `register`, `rotate`, or `unblock`

The runtime uses only this file to build `socket.handshake.auth` with `edgeId` and `credentialSecret`. Local runtime state tracks whether the credential is currently usable, outdated, blocked, or requires operator replacement, but does not duplicate the secret into status files.

### Rationale

- The cloud websocket contract accepts the edge only when the current persistent credential matches, so the runtime needs a single current credential source.
- Keeping the credential in a dedicated file makes replacement on rotate or unblock explicit and minimizes accidental leakage into logs or operator snapshots.
- The runtime can distinguish retryable disconnects from operator-action-required states without inventing any new cloud meanings.

### Alternatives considered

- Persist the secret inside `runtime-state.json`: rejected because status/state rewrites would increase the risk of secret leakage and blur ownership.
- Cache old credentials for fallback reconnect: rejected because the cloud contract explicitly invalidates previous credentials immediately.
- Auto-clear the credential file on every rejection: rejected because `edge_auth_internal_error` and transient failures should not destroy otherwise valid local state.

## 4. Local source/controller adapter boundary for the first real hardware path

### Decision

Define the first production adapter boundary as a local source/controller contract that is:

- owned by `edge_server`
- independent from cloud semantics
- capable of representing Windows-attached controller communication
- shaped around applied source definitions plus normalized readings and local faults

The first real hardware slice should target a Windows serial-controller path, represented generically as a poll-driven adapter family with:

- adapter-level connection settings
- per-device addressing
- per-metric mapping rules
- normalized outputs containing only `deviceId`, `metric`, `value`, and `ts`

### Rationale

- The runtime needs a meaningful hardware seam now, not a mock-only one, but the spec still avoids locking the whole feature to one protocol implementation detail.
- A poll-driven controller contract fits the current telemetry-only baseline and keeps control/actuation out of scope.
- The existing source manager already matches an adapter registry plus apply-definition model and is a good starting point once the mock-first assumptions are removed.

### Alternatives considered

- Keep only the current mock adapter contract: rejected because it leaves the plan demo-shaped and does not model the first real hardware path.
- Put hardware logic directly into the runtime orchestration package: rejected because it would violate the module rule that device communication stays isolated from cloud and lifecycle logic.
- Define a multi-process IPC worker contract now: deferred because worker orchestration is out of scope, while an in-process adapter contract is enough for the first runtime baseline.

## 5. Telemetry normalization path to the existing cloud-owned contract

### Decision

Normalize telemetry in two local stages:

1. Adapter stage:
   - controller/protocol-specific logic reads local values
   - adapter emits normalized runtime readings and local faults
2. Runtime stage:
   - runtime validates and batches readings
   - runtime emits canonical `telemetry { readings[] }` payload to cloud

The canonical cloud payload remains:

- `deviceId`
- `metric`
- `value`
- `ts`

`deviceId + metric` is preserved as the runtime-local identity that cloud later treats as canonical within one edge.

### Rationale

- This matches the current cloud websocket contract and `cloud_server` spec without introducing any competing edge-owned wire format.
- It lets the runtime preserve unaffected readings during partial local-source failure.
- It keeps source-specific metadata local and prevents protocol details from leaking into the cloud surface.

### Alternatives considered

- Forward raw controller frames to cloud: rejected because cloud expects normalized readings and does not own industrial protocol parsing.
- Add per-reading quality/status into the cloud payload now: rejected because the current baseline explicitly excludes that requirement.
- Use `sourceId` as part of the cloud identity: rejected because the current canonical cloud identity is `deviceId + metric` inside one `edgeId`.

## 6. What can be reused from the current `edge_server` and what must be replaced

### Decision

Reuse:

- YAML config parsing and validation skeleton
- source manager and reading normalization pipeline
- telemetry batching and emit path
- Windows-aware atomic JSON file persistence
- low-level Socket.IO transport framing

Replace or retire from the main runtime path:

- onboarding package parsing and bootstrap
- activation-driven credential promotion
- connect and disconnect codes tied to onboarding semantics
- `re_onboarding_required` trust model
- mock-first runtime assumptions and tests as the primary acceptance path
- TypeScript onboarding helpers as the implementation center

### Rationale

- The repo already contains useful runtime mechanics that are independent from lifecycle semantics.
- The invalid part is the onboarding-centered trust model, not the whole Go runtime skeleton.
- Reusing the stable mechanics lowers risk while replacing the wrong semantics prevents hidden legacy behavior from surviving into production work.

### Alternatives considered

- Rewrite `edge_server` from scratch: rejected because transport, state-store, and source-management foundations are already useful.
- Preserve the onboarding path as a fallback compatibility mode: rejected because it would keep two conflicting trust models alive in the same runtime.
- Continue investing in the TypeScript path: rejected because the Go runtime is already the stronger foundation for Windows-first production behavior.
