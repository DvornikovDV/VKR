# Plan: Edge Credential Install Slice

## Document Scope

This document is the general implementation plan for the Edge Credential Install slice.

The primary readers are implementation agents and reviewers working on the local Edge credential installer and the Admin Hub credential disclosure surface. The target outcome is an operator-safe path from a one-time Cloud persistent credential disclosure to a local `credential.json` that the existing Edge runtime startup path can consume.

## Purpose

This slice MUST add a local `edge-credential install` workflow for MVP operators.

The installer MUST write the same persistent credential file that `edge-runtime --config <edge-runtime.yaml>` already consumes. It MUST NOT introduce a new Cloud credential path, restore onboarding package authentication, or change the active `/edge` runtime handshake.

## Source Of Truth

- `doc_cursed/edge_credential_install_plan.md`
- `specs/001-cloud-server/contracts/openapi.yaml`
- `specs/001-edge-runtime/contracts/cloud-runtime-contract.md`
- `specs/001-edge-runtime/contracts/runtime-state-files.md`
- Current Edge runtime credential code under `edge_server/go_core/internal/state`
- Current Admin Hub disclosure code under `client/src/features/admin-hub/pages/EdgeFleetPage.tsx`

## Planning Note

The standard speckit prerequisite command `.agent/skills/scripts/powershell/check-prerequisites.ps1 -Json` was run as written and was blocked by local PowerShell Execution Policy. It was retried with `powershell -ExecutionPolicy Bypass -File .agent\skills\scripts\powershell\check-prerequisites.ps1 -Json`, which ran but reported `Feature directory not found: D:\Study\4_course\VKR\specs\main`. This slice plan therefore uses this file and the Stage 1 Input Pack as the design artifacts for task generation.

## Current Code Facts

- `edge-runtime` requires `--config` or `EDGE_CONFIG_PATH` before startup.
- `edge-runtime` currently requires `credential.json` in `runtime.stateDir` before trusted startup.
- `edge_server/go_core/internal/config/config.go` already validates `runtime.edgeId` and `runtime.stateDir`.
- `edge_server/go_core/internal/state/credential_store.go` already owns the current local credential schema, validation, atomic write, and load behavior.
- The current local `credential.json` schema is `edgeId`, `credentialSecret`, `version`, `issuedAt`, `source`, and `installedAt`.
- Current state tests reject legacy local credential records that use `credentialMode` or `lifecycleState` instead of `source` and `installedAt`.
- `edge_server/go_core/internal/state/runtime_state_store.go` already persists `credentialStatus` values including `superseded` and `blocked`.
- Existing runtime startup and reload paths already reject stale or equal credential versions when runtime state requires a fresh credential.
- The active `/edge` runtime handshake sends only `edgeId` and `credentialSecret`.
- Cloud `edge-runtime-auth.ts` rejects handshake payloads containing the legacy `credentialMode` field.
- Cloud already discloses `persistentCredential` for register, rotate, and unblock through existing Admin APIs.
- Client already normalizes register, rotate, and unblock disclosure responses.
- Admin Hub currently shows disclosure fields separately and does not yet expose an installer-ready copyable JSON payload.

## Legacy Contract Drift

Some older contract text still describes `credentialMode`, onboarding package authentication, or the legacy local `credential.json` shape with `lifecycleState`.

For this slice, those references MUST be treated as historical or quarantined unless current code proves otherwise. The active contract MUST remain persistent-only:

```json
{
  "edgeId": "507f1f77bcf86cd799439011",
  "credentialSecret": "secret-from-cloud"
}
```

The installed local credential file MUST use the current `state.Credential` schema, not the legacy `credentialMode` or `lifecycleState` schema.

## Implementation Scope

- MUST add a local Edge credential installer for the command behavior defined in `doc_cursed/edge_credential_install_plan.md`.
- MUST support `edge-credential install --config edge-runtime.yaml --from-stdin`.
- MUST support `edge-credential install --config edge-runtime.yaml` as an interactive prompt fallback.
- MUST load the existing Edge runtime YAML and use `runtime.edgeId` and `runtime.stateDir`.
- MUST accept pasted JSON in the minimal credential shape.
- MUST accept pasted JSON in the full Cloud disclosure response shape.
- MUST ignore presentation-only disclosure fields such as `instructions`.
- MUST derive `source` for normal first install, rotation, and unblock recovery without a normal-path source flag.
- MUST write `credential.json` through the existing Edge credential validation and persistence model where practical.
- MUST update Admin Hub so register, rotate, and unblock disclosures expose a copyable JSON payload suitable for `--from-stdin`.
- SHOULD make the Admin Hub copy payload a full Cloud-style disclosure JSON with `persistentCredential.edgeId`, `persistentCredential.credentialSecret`, `persistentCredential.version`, and `persistentCredential.issuedAt`.
- SHOULD keep the installer implementation local to Edge-owned Go code.

## Out Of Scope

- MUST NOT change Cloud credential issuance semantics.
- MUST NOT add automatic credential fetch from Cloud.
- MUST NOT reintroduce onboarding package authentication.
- MUST NOT add `credentialMode` back to the active `/edge` handshake.
- MUST NOT add default config discovery to `edge-runtime`.
- MUST NOT start, restart, hot-reload, or signal Edge runtime.
- MUST NOT watch `credential.json` for automatic recovery.
- MUST NOT edit Edge YAML.
- MUST NOT change telemetry, command execution, alarm detection, Dispatch, Dashboard, Constructor, or hardware adapter behavior.
- MUST NOT require hardware or a real Cloud server for automated proof.

## Constraints

- Edge MUST own local credential installation and runtime state files.
- Cloud MUST remain the owner of credential issuance, hashing, lifecycle state, and runtime authentication.
- Client MUST own Admin Hub disclosure presentation and installer JSON copy behavior.
- Client MUST NOT read Edge YAML or local `credential.json`.
- Edge MUST NOT call Client or Cloud APIs to retrieve credentials in this slice.
- The installer MUST NOT contact Cloud, start runtime transport, start source managers, open serial ports, or touch hardware paths.
- `runtime.edgeId` from YAML MUST be the local identity authority.
- Installed `credential.edgeId` MUST match `runtime.edgeId`.
- Fresh replacement credentials MUST NOT accept stale or equal versions when local runtime state requires a newer credential.
- Replacement credentials MUST NOT overwrite an installed `credential.json` with an older or equal version, even when `runtime-state.json` is absent or does not require a fresh credential.
- Corrupt existing `credential.json` or `runtime-state.json` MUST fail installation without writing a replacement.
- `credential.json` MUST NOT contain `credentialMode` or `lifecycleState`.
- Secrets MUST appear only in the installed `credential.json` and transient operator input.
- Logs, status files, runtime state files, and Client persistent storage MUST NOT retain plaintext secrets.
- Client MUST keep plaintext credential disclosure one-time and MUST clear old secrets after hide, refresh, or replacement disclosure.
- Lean Testing Policy MUST apply: automated proof MUST cover the main happy path and at most one critical negative scenario for the main slice risk.
- Lean Testing MUST NOT create a broad malformed-JSON validation matrix.
- Lean Testing MUST NOT make implementation tasks vague; later tasks MUST remain concrete, verifiable, and tied to file paths.

## Assumptions

- The new command SHOULD live under `edge_server/go_core/cmd/edge-credential` unless task planning finds a stronger local pattern.
- The installer MAY share reusable install logic through an Edge-owned internal package if that keeps command parsing and credential persistence testable.
- The Client copy action SHOULD prefer a full Cloud-style JSON payload because it matches the normalized disclosure shape already held by Admin Hub.
- The installer SHOULD also accept the minimal credential object because it is useful for operator paste and future manual workflows.
- First install SHOULD derive `source=register` when no existing credential is installed.
- Source derivation SHOULD use this order: no installed credential derives `register`; `runtime-state.json` with `credentialStatus=blocked` derives `unblock`; any other installed credential replacement derives `rotate`.
- Interactive mode MAY default `issuedAt` to local current time when the operator cannot provide the Cloud-issued timestamp.

## Execution Flow

1. An ADMIN registers, rotates, or unblocks an Edge Server in Admin Hub.
2. Cloud returns the existing one-time `persistentCredential` disclosure.
3. Admin Hub renders the disclosure and an installer-ready JSON payload.
4. The operator copies the JSON payload.
5. The operator runs `edge-credential install --config edge-runtime.yaml --from-stdin`.
6. The installer loads `edge-runtime.yaml` and reads `runtime.edgeId` and `runtime.stateDir`.
7. The installer reads JSON from stdin and normalizes the minimal or full disclosure shape.
8. The installer reads existing `credential.json` and `runtime-state.json` when present.
9. The installer derives `source` from local credential and runtime state context.
10. The installer validates `edgeId`, secret, version, `issuedAt`, derived `source`, and local replacement safety.
11. The installer writes `credential.json` into `runtime.stateDir`.
12. The operator starts `edge-runtime --config edge-runtime.yaml` outside this slice.
13. The existing runtime startup path loads `credential.json` and connects to `/edge` with `edgeId` and `credentialSecret` only.

## Acceptance Checks

- `edge-credential install --config <yaml> --from-stdin` MUST accept a full Cloud-style disclosure JSON and write `credential.json` under `runtime.stateDir`.
- The written `credential.json` MUST be valid for the existing `state.CredentialStore` loader.
- The written `credential.json` MUST contain `edgeId`, `credentialSecret`, `version`, `issuedAt`, `source`, and `installedAt`.
- The written `credential.json` MUST NOT contain `credentialMode` or `lifecycleState`.
- First install MUST derive `source=register` without a source flag.
- Rotation install MUST derive `source=rotate` without a source flag.
- Blocked recovery install MUST derive `source=unblock` without a source flag.
- The installer MUST fail without writing when pasted `edgeId` differs from `runtime.edgeId`.
- The installer MUST fail without writing when an existing `runtime-state.json` belongs to a different `edgeId` than `runtime.edgeId`.
- The installer MUST reject stale or equal replacement versions when local runtime state marks the current credential as `superseded` or `blocked`.
- The installer MUST reject any installed credential replacement when the pasted version is older than or equal to the installed `credential.json` version.
- The installer MUST fail without writing when existing `credential.json` or `runtime-state.json` is corrupt.
- Interactive install without `--from-stdin` MUST prompt only for values that cannot be derived from local config and state.
- Interactive install MUST confirm before writing.
- The installer MUST NOT contact Cloud or start runtime/hardware paths.
- `edge-runtime --config <same-yaml>` MUST be able to consume the installed credential through the existing startup path.
- Admin Hub register, rotate, and unblock disclosures MUST expose an installer-ready copyable JSON payload.
- Admin Hub installer JSON SHOULD use the full Cloud-style disclosure shape and MUST include `persistentCredential.edgeId`, `persistentCredential.credentialSecret`, `persistentCredential.version`, and `persistentCredential.issuedAt`.
- Admin Hub MUST NOT retain old plaintext secrets after hide, refresh, or replacement disclosure.
- Active `/edge` authentication MUST remain persistent-only with `edgeId` plus `credentialSecret`.

## Format: `[ID] [P?] [Story?] Description`

- `[P]` means the task can run in parallel because it touches different files and does not depend on incomplete tasks.
- `[US1]` maps to stdin-based local Edge credential installation and runtime compatibility.
- `[US2]` maps to the interactive installer fallback.
- `[US3]` maps to Admin Hub installer JSON disclosure and copy behavior.
- Every task includes the file path that owns the change or proof.
- This document intentionally does not include implementation batches.

## Phase 1: Setup

**Purpose**: Establish the new Edge command surface and shared installer package anchors without changing runtime startup.

- [X] T001 Create the `edge-credential` command scaffold with subcommand parsing for `install`, required `--config`, optional `--from-stdin`, and no Cloud/runtime startup in `edge_server/go_core/cmd/edge-credential/main.go`
- [X] T002 [P] Add command-level tests for unknown subcommand, missing `--config`, and stdin/interactive mode selection through injected IO dependencies in `edge_server/go_core/cmd/edge-credential/main_test.go`
- [X] T003 [P] Create installer package DTOs for raw disclosure input, normalized credential input, local install context, and install result in `edge_server/go_core/internal/credentialinstall/types.go`
- [X] T004 [P] Create Admin Hub installer payload helper with the full Cloud-style JSON shape derived from `EdgeCredentialDisclosureResponse` in `client/src/features/admin-hub/model/edgeCredentialInstallerPayload.ts`

**Checkpoint**: Command and helper file locations are stable, and later tasks can add behavior without touching unrelated runtime or Cloud paths.

---

## Phase 2: Foundational Installer Services

**Purpose**: Build Edge-owned parsing, source derivation, replacement validation, and persistence services before command wiring.

- [X] T005 Add disclosure JSON parsing that accepts minimal credential objects and full Cloud-style disclosure responses while ignoring presentation-only fields in `edge_server/go_core/internal/credentialinstall/payload.go`
- [X] T006 Add local config/state loading that reads `runtime.edgeId`, `runtime.stateDir`, existing `credential.json`, and existing `runtime-state.json` without starting transport or sources, preserving load errors from existing managed state files as blocking install errors, in `edge_server/go_core/internal/credentialinstall/context.go`
- [X] T007 Add source derivation for first install, blocked recovery, and rotation replacement in `edge_server/go_core/internal/credentialinstall/source.go`
- [X] T008 Add replacement validation that rejects payload edgeId mismatch, runtime-state edgeId mismatch, corrupt managed state, stale/equal installed credential replacement, and stale/equal fresh-required runtime state replacement in `edge_server/go_core/internal/credentialinstall/validation.go`
- [X] T009 Add installation persistence that builds `state.Credential` with local `installedAt` and writes through `state.NewCredentialStore(...).Save` in `edge_server/go_core/internal/credentialinstall/install.go`
- [X] T010 [P] Add focused installer package proof for one Cloud-style stdin happy path and one critical stale/equal replacement rejection in `edge_server/go_core/internal/credentialinstall/install_test.go`

**Checkpoint**: The installer can normalize, validate, and persist a credential through Edge-owned services without any CLI or Client behavior.

---

## Phase 3: User Story 1 - Stdin Edge Credential Install (Priority: P1)

**Goal**: An operator can paste Admin Hub JSON into `edge-credential install --config edge-runtime.yaml --from-stdin`, producing a `credential.json` accepted by the existing runtime startup path.

**Independent Test**: Run the command with injected stdin or a command-level test fixture, verify `credential.json` is written in `runtime.stateDir`, verify the file loads through `state.CredentialStore`, and verify `runtimeapp.New` accepts it without Cloud or hardware.

### Tests For User Story 1

- [X] T011 [US1] Add command proof that `--from-stdin` installs a full Cloud-style disclosure into `runtime.stateDir` and returns a non-secret success result in `edge_server/go_core/cmd/edge-credential/main_test.go`
- [X] T012 [US1] Add runtime compatibility proof that the installed credential is consumed by `runtimeapp.NewWithSourceFactoriesForTest` without adding onboarding or `credentialMode` behavior in `edge_server/go_core/internal/runtimeapp/process_test.go`

### Implementation For User Story 1

- [X] T013 [US1] Wire `edge-credential install --config <path> --from-stdin` to load config, read all stdin JSON, call installer services, and print a redacted install summary in `edge_server/go_core/cmd/edge-credential/main.go`
- [X] T014 [US1] Ensure command errors for malformed input, edgeId mismatch, corrupt state, and stale/equal replacement exit before writing a replacement in `edge_server/go_core/cmd/edge-credential/main.go`

**Checkpoint**: The primary MVP operator path works from copied Admin Hub JSON to runtime-consumable local credential file.

---

## Phase 4: User Story 2 - Interactive Installer Fallback (Priority: P1)

**Goal**: An operator can run `edge-credential install --config edge-runtime.yaml` and enter only non-derivable credential values before confirming the write.

**Independent Test**: Use injected stdin/stdout prompts or manual console smoke to verify the command displays local config/state context, prompts for secret/version/optional issuedAt, derives source, requires confirmation, and writes the same credential shape as stdin mode.

### Tests For User Story 2

- [X] T015 [US2] Add compact interactive-mode proof for derived edgeId/source, confirmation denial without write, and confirmation acceptance with write in `edge_server/go_core/cmd/edge-credential/main_test.go`

### Implementation For User Story 2

- [X] T016 [US2] Implement prompt collection for secret, version, optional issuedAt defaulting to now, and final `[y/N]` confirmation in `edge_server/go_core/internal/credentialinstall/interactive.go`
- [X] T017 [US2] Wire non-`--from-stdin` install mode to the interactive collector and the same installer validation/persistence path in `edge_server/go_core/cmd/edge-credential/main.go`

**Checkpoint**: Operators have a fallback path that still uses local YAML/state authority and the same safety checks as stdin mode.

---

## Phase 5: User Story 3 - Admin Hub Installer JSON Disclosure (Priority: P1)

**Goal**: Admin Hub exposes a copyable installer JSON payload after register, rotate, and unblock without retaining old plaintext secrets.

**Independent Test**: Render the Admin Hub Edge Fleet page with mocked register, rotate, and unblock disclosure responses; verify the installer JSON contains the current disclosure credential fields, can be copied through the UI path, and old secrets disappear after hide, refresh, or replacement disclosure.

### Tests For User Story 3

- [X] T018 [US3] Add Admin Hub integration proof for installer JSON generation, copy action behavior, and old-secret cleanup after hide/refresh/replacement in `client/tests/integration/AdminHubPages.test.tsx`

### Implementation For User Story 3

- [X] T019 [US3] Add focused unit coverage for full Cloud-style installer payload generation from `EdgeCredentialDisclosureResponse` in `client/tests/unit/edgeCredentialInstallerPayload.test.ts`
- [X] T020 [US3] Implement stable JSON serialization for the installer payload helper in `client/src/features/admin-hub/model/edgeCredentialInstallerPayload.ts`
- [X] T021 [US3] Update the one-time disclosure panel to render a visible/selectable installer JSON payload and copy action, handle Clipboard API failure without extra secret persistence, and avoid persisting the secret outside component state in `client/src/features/admin-hub/pages/EdgeFleetPage.tsx`
- [X] T022 [US3] Ensure refresh, hide, register, rotate, and unblock paths clear or replace `latestDisclosure` so previous installer JSON secrets are not retained in `client/src/features/admin-hub/pages/EdgeFleetPage.tsx`

**Checkpoint**: Admin Hub provides the operator input needed by `--from-stdin` while preserving one-time secret handling.

---

## Phase 6: Polish, Verification, And Review

**Purpose**: Verify the narrow slice, record smoke coverage, and check boundaries without expanding proof volume.

- [X] T023 Run `gofmt` on `edge_server/go_core/cmd/edge-credential` and `edge_server/go_core/internal/credentialinstall`
- [X] T024 Run targeted Edge installer proof with `go test ./internal/credentialinstall ./cmd/edge-credential ./internal/runtimeapp -count=1` from `edge_server/go_core`
- [X] T025 Run Edge build proof with `go build ./cmd/edge-credential` from `edge_server/go_core`
- [X] T026 Run focused Client proof with `cmd /c npm run test -- edgeCredentialInstallerPayload AdminHubPages` from `client`
- [X] T027 Run Client build or type proof with `cmd /c npm run build` from `client`
- [X] T028 Inspect Cloud, Edge transport, Client, Constructor, Dashboard, Dispatch, telemetry, command, alarm, and hardware boundaries to confirm no out-of-scope implementation changes in `specs/014-edge-credential-install/slices/plan_edge_credential_install_slice.md`
- [X] T029 Record manual/runtime smoke steps and verification results for Admin Hub copy, stdin install, interactive install, stale replacement rejection, and later runtime startup proof using mock/noop sources rather than hardware in `specs/014-edge-credential-install/slices/plan_edge_credential_install_slice.md`
- [ ] T030 Complete Technical Lead Review for scope leakage, legacy contract drift, version replacement safety, corrupt state handling, secret retention, runtime compatibility, and Lean Testing Policy in `specs/014-edge-credential-install/slices/plan_edge_credential_install_slice.md`

---

## Dependencies And Execution Order

### Phase Dependencies

- Phase 1 MUST complete before Phase 2 because command wiring and installer DTO anchors must be stable.
- Phase 2 MUST complete before Phase 3 and Phase 4 because both command modes depend on shared parsing, derivation, validation, and persistence.
- Phase 5 MAY proceed after T004 defines the payload helper shape, but final Client proof depends on the accepted payload shape from Phase 2 and Phase 3.
- Phase 6 depends on completed implementation and focused proof tasks.

### Task Dependencies

- T002 depends on the command scaffold introduced by T001.
- T005 depends on DTOs from T003.
- T006 depends on config/state contracts read during Stage 1 and DTOs from T003.
- T007 depends on context loading from T006.
- T008 depends on payload parsing from T005, context loading from T006, and source derivation from T007.
- T009 depends on T005-T008.
- T010 depends on T005-T009.
- T011 depends on T001, T005-T009, and passes only after T013-T014.
- T012 depends on T009 and the command or package fixture produced by T011/T013.
- T013 depends on T001 and T005-T009.
- T014 depends on T008 and T013.
- T015 depends on T016-T017 for passing behavior.
- T016 depends on T006-T009 for shared install context and validation behavior.
- T017 depends on T001, T016, and T009.
- T018 depends on T004, T020-T022, and existing Admin Hub route test harnesses.
- T019 depends on T004 and passes only after T020.
- T020 depends on T004.
- T021 depends on T020.
- T022 depends on current `latestDisclosure` state handling in T021.
- T023-T027 depend on implementation completion.
- T028-T030 depend on focused verification results and final changed-file inspection.

### Parallel Opportunities

- T002, T003, and T004 can run in parallel after T001 is sketched because they touch separate command, Edge package, and Client helper files.
- T005 and T006 can run in parallel after T003 because payload parsing and local context loading are separate files.
- T010 and T019 can be drafted in parallel once Edge installer behavior and Client payload shape are agreed.
- T016 and T020 can run in parallel because interactive Edge prompts and Client JSON serialization touch different modules.
- T021-T022 can run alongside T011-T014 after payload shape is stable.
- T024, T026, and T027 can run in parallel after formatting when local resources permit.

## Parallel Examples

### User Story 1

```text
Task: "Add command proof that `--from-stdin` installs a full Cloud-style disclosure into `runtime.stateDir` and returns a non-secret success result in `edge_server/go_core/cmd/edge-credential/main_test.go`"
Task: "Add runtime compatibility proof that the installed credential is consumed by `runtimeapp.NewWithSourceFactoriesForTest` without adding onboarding or `credentialMode` behavior in `edge_server/go_core/internal/runtimeapp/process_test.go`"
```

### User Story 3

```text
Task: "Implement stable JSON serialization for the installer payload helper in `client/src/features/admin-hub/model/edgeCredentialInstallerPayload.ts`"
Task: "Add Admin Hub integration proof for installer JSON generation, copy action behavior, and old-secret cleanup after hide/refresh/replacement in `client/tests/integration/AdminHubPages.test.tsx`"
```

## Implementation Strategy

### MVP First

1. Complete Phase 1 to establish command and helper anchors.
2. Complete Phase 2 to make installation behavior testable without CLI or UI.
3. Complete Phase 3 to deliver the main copy-paste installer path.
4. Complete Phase 5 to expose the Admin Hub payload needed by the main path.
5. Complete Phase 4 interactive fallback after the shared installer path is stable.
6. Complete Phase 6 verification and Technical Lead Review.

### Boundary Bias

- Keep all local credential writing inside Edge-owned Go code.
- Prefer a small `internal/credentialinstall` package over embedding parsing and validation directly in `main.go`.
- Reuse `config.LoadFromFile`, `state.CredentialStore`, and `state.RuntimeStateStore` instead of duplicating file contracts.
- Keep Client JSON generation derived from normalized disclosure state.
- Do not add Cloud routes, Cloud response fields, Edge transport behavior, runtime reload behavior, or hardware access.

## Manual And Runtime Smoke

Manual smoke SHOULD use temporary local config/state directories and mocked or already-issued Admin Hub disclosure JSON. Do not count smoke as successful if the installer contacts Cloud, starts runtime, edits YAML, or accepts stale replacement credentials.

1. Register, rotate, or unblock an Edge Server in Admin Hub and copy the installer JSON payload.
2. Prepare an `edge-runtime.yaml` whose `runtime.edgeId` matches the copied payload and whose `runtime.stateDir` points to a temporary state directory.
3. Run `edge-credential install --config <edge-runtime.yaml> --from-stdin`, paste the copied JSON, and submit EOF.
4. Verify `credential.json` exists in `runtime.stateDir` and contains `edgeId`, `credentialSecret`, `version`, `issuedAt`, `source`, and `installedAt`.
5. Verify `credential.json` does not contain `credentialMode` or `lifecycleState`.
6. Run a runtime startup proof with `runtimeapp.NewWithSourceFactoriesForTest` or a safe mock/noop-source runtime configuration and verify the credential is accepted through the existing startup path without requiring Modbus, COM ports, or hardware.
7. Create a `runtime-state.json` with `credentialStatus=superseded` or `blocked` and an existing credential version, then verify a stale or equal version install fails without changing `credential.json`.
8. Run `edge-credential install --config <edge-runtime.yaml>` without `--from-stdin`, deny confirmation, and verify no file is written or changed.
9. Repeat interactive install with confirmation and verify the same local credential schema is written.
10. In Admin Hub, verify Hide and Refresh remove the plaintext secret and installer JSON from the page, and verify a later rotate/unblock disclosure replaces the previous secret.

## Technical Lead Review

Review this plan and implementation for scope leakage, wrong module boundaries, legacy contract drift, stale/equal version replacement, corrupt state handling, secret retention, command prompt safety, runtime compatibility, and Lean Testing discipline.

### Quickcheck Evidence - 2026-05-15 - T028/T029

Prerequisite note: `.agent/skills/scripts/powershell/check-prerequisites.ps1 -Json -RequireTasks -IncludeTasks` was run as written and was blocked by local PowerShell Execution Policy. It was retried with `SPECIFY_FEATURE=014-edge-credential-install` and `powershell -ExecutionPolicy Bypass -File .agent\skills\scripts\powershell\check-prerequisites.ps1 -Json -RequireTasks -IncludeTasks`; that resolved the feature path but reported `plan.md` missing because this slice uses this file as the explicit task source.

Changed-file boundary inspection used `git diff --name-status 5253349..HEAD`. The slice changed only these files:

- `client/src/features/admin-hub/model/edgeCredentialClipboard.ts`
- `client/src/features/admin-hub/model/edgeCredentialInstallerPayload.ts`
- `client/src/features/admin-hub/pages/EdgeFleetPage.tsx`
- `client/tests/integration/AdminHubPages.test.tsx`
- `client/tests/unit/edgeCredentialInstallerPayload.test.ts`
- `edge_server/go_core/cmd/edge-credential/main.go`
- `edge_server/go_core/cmd/edge-credential/main_test.go`
- `edge_server/go_core/internal/credentialinstall/context.go`
- `edge_server/go_core/internal/credentialinstall/install.go`
- `edge_server/go_core/internal/credentialinstall/install_test.go`
- `edge_server/go_core/internal/credentialinstall/interactive.go`
- `edge_server/go_core/internal/credentialinstall/payload.go`
- `edge_server/go_core/internal/credentialinstall/source.go`
- `edge_server/go_core/internal/credentialinstall/types.go`
- `edge_server/go_core/internal/credentialinstall/validation.go`
- `edge_server/go_core/internal/runtimeapp/process_test.go`

Boundary conclusions:

- No `cloud_server` files changed. Live Cloud auth inspection confirmed `cloud_server/src/socket/events/edge-runtime-auth.ts` still normalizes only `edgeId` plus `credentialSecret` and still rejects payloads containing `credentialMode`. Live issuance inspection confirmed `cloud_server/src/services/edge-lifecycle.domain.ts` still owns persistent secret generation, hashing, version increment, register, rotate, block, and unblock aggregate behavior.
- No Constructor files, Dashboard feature files, Dispatch files, Cloud API route files, Edge transport implementation files, telemetry implementation files, command implementation files, alarm implementation files, source adapter implementation files, Modbus implementation files, serial implementation files, or hardware adapter implementation files changed.
- Edge installer code is confined to `edge_server/go_core/cmd/edge-credential` and `edge_server/go_core/internal/credentialinstall`. It loads local YAML/state files, parses operator-provided disclosure JSON or interactive input, validates local replacement safety, and writes through `state.NewCredentialStore(...).Save`. It does not call Cloud APIs, does not start runtime transport, does not start source managers, does not open COM ports, and does not touch hardware paths.
- Runtime compatibility proof is test-only in `edge_server/go_core/internal/runtimeapp/process_test.go` and uses `NewWithSourceFactoriesForTest`, `noopTransport`, and `mockSourceFactories`. The config fixture contains a COM-like string only as inert fixture data; no Modbus or serial hardware adapter is instantiated.
- Client changes are confined to Admin Hub disclosure presentation and payload-copy helpers. `EdgeFleetPage.tsx` keeps the plaintext disclosure in React component state only, derives installer JSON with `useMemo`, clears `latestDisclosure` and copy status on hide and refresh, replaces disclosure on register/rotate/unblock, and hides disclosure on block. Focused tests assert `localStorage` and `sessionStorage` do not retain the disclosed secret.

Executable smoke and verification results:

- PASS: `go test ./internal/credentialinstall ./cmd/edge-credential ./internal/runtimeapp -count=1` from `edge_server/go_core`. The first sandboxed run failed before tests with `windows sandbox: setup refresh failed`; rerun outside the sandbox passed. Coverage includes Cloud-style stdin install, minimal/full disclosure parsing, corrupt managed-state blocking, stale/equal replacement rejection, interactive deny/accept behavior, redacted CLI output, and runtime startup through `NewWithSourceFactoriesForTest` with mock/noop sources.
- PASS: `cmd /c npm run test -- edgeCredentialInstallerPayload AdminHubPages` from `client`. Coverage includes installer JSON serialization, register/rotate/unblock disclosure rendering, copy action behavior including Clipboard API failure, hide/refresh/replacement cleanup of old secrets, and `localStorage`/`sessionStorage` non-retention checks.

Manual smoke order to repeat in an operator environment:

1. In Admin Hub, register an Edge Server and verify the one-time disclosure shows the persistent credential, installer JSON, and copy action.
2. Copy the installer JSON. Verify the JSON contains `persistentCredential.edgeId`, `persistentCredential.credentialSecret`, `persistentCredential.version`, and `persistentCredential.issuedAt`.
3. Prepare a temporary `edge-runtime.yaml` whose `runtime.edgeId` matches the copied payload and whose `runtime.stateDir` points to a temporary state directory.
4. Run `edge-credential install --config <edge-runtime.yaml> --from-stdin`, paste the installer JSON, submit EOF, and verify `credential.json` appears under `runtime.stateDir`.
5. Inspect `credential.json` manually and verify it contains `edgeId`, `credentialSecret`, `version`, `issuedAt`, `source`, and `installedAt`; verify it does not contain `credentialMode` or `lifecycleState`.
6. Run a runtime startup proof only with mock/noop sources or `runtimeapp.NewWithSourceFactoriesForTest`; do not use Modbus, COM, serial, or physical hardware for this slice proof.
7. Seed a replacement scenario with an existing credential and `runtime-state.json` marked `superseded` or `blocked`, then rerun install with an equal or older version and verify the command fails without changing `credential.json`.
8. Run `edge-credential install --config <edge-runtime.yaml>` without `--from-stdin`, deny confirmation, and verify no file is written or changed.
9. Repeat the interactive install with confirmation and verify the same local credential schema is written.
10. In Admin Hub, use Hide and Refresh and verify the plaintext secret and installer JSON disappear; then rotate or unblock and verify the newer disclosure replaces the prior secret.

Technical Lead Review conclusions for this quickcheck batch:

- Scope leakage: none found in changed files or changed-file boundary inspection.
- Cloud issuance/auth: unchanged; Cloud remains the owner of issuance, hashing, lifecycle, and `/edge` authentication.
- Legacy contract drift: active runtime/auth paths remain persistent-only; installer output and tests reject `credentialMode` and `lifecycleState` in `credential.json`.
- Version replacement safety: enforced before write for installed credential versions and runtime-state fresh-credential requirements.
- Corrupt state handling: corrupt existing `credential.json` or `runtime-state.json` blocks install before replacement.
- Secret retention: CLI output is redacted; Admin Hub stores plaintext only in transient component state and tests cover hide, refresh, replacement disclosure, and browser storage non-retention.
- Runtime compatibility: proven through existing runtime startup with mock/noop factories and no hardware access.
- Lean Testing Policy: proof remains focused on the main happy path, critical stale/equal replacement risk, runtime compatibility, and Admin Hub disclosure/copy behavior.

### Review Checklist

- [ ] Verify the installer does not contact Cloud, Client, runtime transport, source manager, serial ports, hardware adapters, telemetry, command execution, or alarm paths.
- [ ] Verify active `/edge` auth still sends only `edgeId` and `credentialSecret`.
- [ ] Verify no `credentialMode` or `lifecycleState` is written into `credential.json`.
- [ ] Verify `runtime.edgeId` is the local identity authority.
- [ ] Verify mismatched payload `edgeId` fails without writing.
- [ ] Verify mismatched `runtime-state.json` `edgeId` fails without writing.
- [ ] Verify existing credential replacement rejects older or equal versions.
- [ ] Verify `superseded` and `blocked` runtime state fresh-credential requirements remain enforced.
- [ ] Verify corrupt existing `credential.json` or `runtime-state.json` fails without writing.
- [ ] Verify source derivation matches first install, rotate, and unblock recovery rules.
- [ ] Verify Client copy payload contains the current one-time disclosure only.
- [ ] Verify Client hide, refresh, and replacement disclosure paths do not retain old plaintext secrets.
- [ ] Verify automated proof stays lean: one Edge happy path, one critical stale/equal replacement negative, narrow runtime compatibility proof, and focused Client disclosure proof.

## Implementation Batches

Implementation batches are stored separately in `specs/014-edge-credential-install/slices/batches_edge_credential_install_slice.md`.

## Review Trigger

Review this plan when the active Edge credential schema changes, Cloud credential disclosure shape changes, `/edge` authentication changes, Admin Hub disclosure handling changes, or legacy onboarding references are removed from the remaining contract docs.
