# Research & Architecture Decisions: Windows-Only Narrow MVP Delivery Slice For `001-edge-runtime`

## Scope framing

- Decision: `006-edge-runtime-windows-mvp` is a delivery slice of `001-edge-runtime`, not a replacement for it.
- Rationale: The goal is to narrow implementation scope while preserving the accepted lifecycle and telemetry semantics already established for `001`.

## 1. Keep Go as the only cloud-connected local authority

- Decision: The Go runtime core is the only local component allowed to connect to `cloud_server`, hold the in-memory reconnect credential, and decide whether telemetry may leave the host.
- Rationale: This preserves the lifecycle authority already defined by `004-edge-onboarding` and keeps hardware-facing code free from trust logic.

## 2. Narrow delivery to Windows only

- Decision: The active delivery scope is Windows only.
- Rationale: The current goal is the fastest safe path to hardware-integration readiness, not cross-platform packaging. Linux parity is deferred instead of partially designed now.

## 3. Remove machine-written local runtime files from the MVP

- Decision: The runtime does not persist `credential.json`, `runtime-state.json`, or `status.json` in this MVP.
- Rationale: Local persistence creates extra lifecycle, security, and crash-window work that is not required to reach first trusted telemetry and first hardware readiness.
- Consequence: Trusted reconnect across process restart is intentionally out of scope for this MVP.

## 4. Keep reconnect only while the process remains alive

- Decision: After `edge_activation`, the runtime keeps the issued persistent reconnect secret only in memory and may use it only for reconnect attempts made by the same running process.
- Rationale: This captures the minimum useful reconnect behavior for transient network loss without reopening the persistence scope.

## 5. Drop backlog and replay from the MVP

- Decision: When the runtime is disconnected or untrusted, it drops new readings instead of buffering them.
- Rationale: Backlog, replay ordering, overflow reporting, and invalidation are a large subsystem that does not help the current fastest path to hardware work.

## 6. Treat ordinary socket disconnect as a hard telemetry stop

- Decision: The runtime reacts both to explicit `edge_disconnect` events and to ordinary socket disconnects.
- Rationale: The cloud contract already covers explicit lifecycle events, but telemetry safety also depends on immediate local reaction when the connection disappears without a separate lifecycle payload.

## 7. Keep the local source seam minimal

- Decision: The local source contract is limited to applying source definitions, delivering normalized readings, and reporting source faults.
- Rationale: This is enough to keep Go cloud logic isolated from hardware logic and is the smallest seam that can later be implemented by Rust.

## 8. Keep TypeScript runtime examples out of the narrow MVP path

- Decision: Existing `edge_server/src/*` TypeScript files remain development-only references if still present, but they are not part of the MVP delivery path.
- Rationale: Maintaining parity with those files would add noise without reducing the main delivery risk.
