# Input Pack: Edge Credential Install Slice

This is a working Input Pack for a later `doc/slices.md` Stage 1 run.
It is not the slice plan and does not perform Stage 1.

## Slice Name

`edge credential install`

## Target Plan Path

`specs/014-edge-credential-install/slices/plan_edge_credential_install_slice.md`

## Source Of Truth Docs

- `doc_cursed/edge_credential_install_plan.md`
- `specs/001-cloud-server/contracts/openapi.yaml`
- `specs/001-edge-runtime/contracts/cloud-runtime-contract.md`
- `specs/001-edge-runtime/contracts/runtime-state-files.md`

## Nearby Instructions For Stage 1

- `AGENTS.md`
- `edge_server/AGENTS.md`
- `client/AGENTS.md`
- `cloud_server/AGENTS.md`

There are no `AGENTS.md` or `FILE_MAP.md` files under `specs/` at the time this
Input Pack was prepared. If they appear later, Stage 1 MUST read them before
editing the corresponding subtree.

## Similar Completed Slice Plans

- `specs/013-edge-configurator/slices/plan_config_helper_editor_slice.md`
- `specs/007-edge-server/slices/plan_set_bool_slice.md`
- `specs/009-edge-capabilities/slices/plan_edge_capabilities_catalog_slice.md`
- `specs/012-dispatch/slices/plan_command_audit_slice.md`

## Must-Read Files For Stage 1

Edge:

- `edge_server/go_core/cmd/edge-runtime/main.go`
- `edge_server/go_core/internal/config/config.go`
- `edge_server/go_core/internal/state/credential_store.go`
- `edge_server/go_core/internal/state/runtime_state_store.go`
- `edge_server/go_core/internal/runtimeapp/process.go`
- `edge_server/go_core/tests/integration/runtime_smoke_test.go`
- `edge_server/go_core/tests/integration/trust_loss_recovery_test.go`

Cloud:

- `cloud_server/src/services/edge-servers.service.ts`
- `cloud_server/src/services/edge-lifecycle.domain.ts`
- `cloud_server/src/socket/events/edge-runtime-auth.ts`

Client:

- `client/src/shared/api/edgeServersCanonical.ts`
- `client/src/features/admin-hub/pages/EdgeFleetPage.tsx`
- `client/tests/integration/AdminHubPages.test.tsx`

Stage 1 MAY inspect adjacent tests, route files, mocks, and helpers discovered
from these entry points. Do not read `Note.md` files.

## Legacy Contract Warning

Some legacy onboarding references still describe `credentialMode` and onboarding
package authentication. Treat them as historical or quarantined unless current
code proves otherwise.

This slice MUST NOT restore onboarding package authentication or add
`credentialMode` back to the active `/edge` handshake.

## Known Facts

- Edge runtime currently needs a config path and requires `credential.json` in
  `runtime.stateDir` before startup.
- Cloud already discloses a one-time `persistentCredential` for register, rotate,
  and unblock.
- Client already normalizes those disclosure responses, but Admin Hub currently
  shows separate fields rather than an installer-ready JSON block.
- `doc_cursed/edge_credential_install_plan.md` defines the intended operator
  commands:
  - `edge-credential install --config edge-runtime.yaml --from-stdin`
  - `edge-credential install --config edge-runtime.yaml`

## Scope

- Add a local Edge credential installer for the command behavior defined in
  `doc_cursed/edge_credential_install_plan.md`.
- Support pasted JSON through `--from-stdin`.
- Support an interactive prompt fallback without `--from-stdin`.
- Use the existing Edge runtime YAML, `runtime.edgeId`, `runtime.stateDir`, and
  credential/state persistence rules.
- Derive the credential `source` for normal first install, rotation, and unblock
  recovery without requiring a normal-path source flag.
- Update Client Admin Hub so register, rotate, and unblock disclosures expose a
  copyable JSON payload suitable for the installer.

## Out Of Scope

- Changing Cloud credential issuance semantics.
- Fetching credentials automatically from Cloud.
- Reintroducing onboarding package authentication.
- Adding default config discovery to `edge-runtime`.
- Starting, restarting, or hot-reloading Edge runtime.
- Watching `credential.json` for automatic recovery.
- Editing Edge YAML.
- Touching Constructor, Dashboard, Dispatch, telemetry, command execution, alarm
  detection, or hardware adapters.

## Key Invariants

- Active `/edge` authentication remains persistent-only: `edgeId` plus
  `credentialSecret`.
- `runtime.edgeId` from YAML is the local identity authority.
- Installed `credential.edgeId` must match `runtime.edgeId`.
- Fresh replacement credentials must not accept stale or equal versions when
  local state requires a newer credential.
- The installer must reuse the existing Edge credential validation and persistence
  model where practical.
- The installer must not contact Cloud or start runtime/hardware paths.
- Client must keep plaintext credential disclosure one-time and must not retain
  old secrets after hide or refresh.

## Testing Constraints

- Apply Lean Testing Policy from `doc/slices.md`.
- Automated proof should cover the main happy path and at most one critical
  negative scenario for the main slice risk.
- Suggested happy path: Cloud-style disclosure JSON from stdin creates a valid
  `credential.json` that the existing runtime startup path can consume.
- Suggested critical negative: stale or equal rotation version is rejected when
  local runtime state marks the installed credential as superseded.
- Suggested Client proof: register or rotate disclosure exposes a copyable JSON
  payload and old secrets are not retained after hide or refresh.
- Do not build a broad malformed-JSON validation matrix.
- No hardware or real Cloud server should be required for automated proof.

## Boundary Constraints

- Edge owns local credential installation and runtime state files.
- Cloud owns credential issuance, hashing, lifecycle state, and runtime
  authentication.
- Client owns Admin Hub disclosure presentation and copyable installer JSON.
- Client must not read Edge YAML or local `credential.json`.
- Edge must not call Client or Cloud APIs to retrieve credentials in this slice.
- Constructor, Dashboard, and Dispatch are not involved.

## Open Questions / Assumptions

- Assumption: a new Go command under `edge_server/go_core/cmd/edge-credential`
  is acceptable unless Stage 1 finds a stronger local pattern.
- Assumption: Client can generate the copyable JSON from the already-normalized
  `latestDisclosure` object without changing Cloud responses.
- Unknown: whether the Client copy action should prefer the minimal credential
  object or the full disclosure response shape. The installer should accept both
  if practical.
- Unknown: whether interactive mode requires Cloud `issuedAt` or may default it
  to local current time when the operator cannot provide it.

## Main Proof

The slice is proven when an Admin Hub credential disclosure can be copied, pasted
into the Edge installer, written as `credential.json`, consumed by the current
Edge runtime startup path, and the rotation stale-version risk is blocked.
