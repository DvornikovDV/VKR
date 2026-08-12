# Implementation Batches: Edge Credential Install Slice

## Scope

This document contains implementation batch prompts for `specs/014-edge-credential-install/slices/plan_edge_credential_install_slice.md`.

Use these batches only after the task plan in the slice plan has been reviewed and accepted.

### Batch 1: Command And Payload Anchors

Execute `.agent\workflows\07a-speckit.implement.quickcheck.md` for the task batch in Scope.

Scope:
- TASK_IDS: T001, T002, T003, T004
- TASKS_FILE: `specs/014-edge-credential-install/slices/plan_edge_credential_install_slice.md`

Batch-specific constraints:
- Keep the new command inert: it MUST NOT start Cloud transport, Edge runtime, source managers, or hardware paths.
- Keep Client payload generation derived from normalized disclosure state, not from local Edge files.

Main proof:
- Command-level tests prove subcommand and mode selection wiring through injected IO dependencies.

Do not count this as success:
- A command scaffold that parses flags but can only be tested by starting real runtime or Cloud paths.




### Batch 2: Core Installer Semantics

Execute `.agent\workflows\07b-speckit.implement.experimental.md` for the task batch in Scope.

Scope:
- TASK_IDS: T005, T006, T007, T008, T009, T010
- TASKS_FILE: `specs/014-edge-credential-install/slices/plan_edge_credential_install_slice.md`

Batch-specific constraints:
- Preserve the current `state.Credential` schema and reject legacy `credentialMode` or `lifecycleState` output.
- Treat corrupt existing `credential.json` or `runtime-state.json` as a blocking install error, not as missing state.

Main proof:
- Installer package proof covers one Cloud-style disclosure happy path and one stale/equal replacement rejection through the real state store.

Do not count this as success:
- Helper-only parsing that builds a credential object but does not write through `state.NewCredentialStore(...).Save`.




### Batch 3: Stdin Install Production Path

Execute `.agent\workflows\07b-speckit.implement.experimental.md` for the task batch in Scope.

Scope:
- TASK_IDS: T011, T012, T013, T014
- TASKS_FILE: `specs/014-edge-credential-install/slices/plan_edge_credential_install_slice.md`

Batch-specific constraints:
- The stdin command MUST fail before writing on malformed input, edgeId mismatch, corrupt state, or stale/equal replacement.
- Runtime compatibility MUST use the existing `runtimeapp` startup path without reintroducing onboarding behavior.

Main proof:
- Command proof installs from full Cloud-style stdin JSON, then `runtimeapp.NewWithSourceFactoriesForTest` consumes the installed credential.

Do not count this as success:
- A package-level install test that never proves `edge-credential install --from-stdin` is wired to the production command entrypoint.




### Batch 4: Interactive Install Fallback

Execute `.agent\workflows\07b-speckit.implement.experimental.md` for the task batch in Scope.

Scope:
- TASK_IDS: T015, T016, T017
- TASKS_FILE: `specs/014-edge-credential-install/slices/plan_edge_credential_install_slice.md`

Batch-specific constraints:
- Interactive mode MUST use the same validation and persistence path as stdin mode.
- Confirmation denial MUST leave existing `credential.json` unchanged.

Main proof:
- Interactive command proof covers derived edgeId/source, denial without write, and confirmation with write.

Do not count this as success:
- Prompt code that writes a separate credential shape or bypasses replacement validation.




### Batch 5: Client Installer Payload Helper

Execute `.agent\workflows\07a-speckit.implement.quickcheck.md` for the task batch in Scope.

Scope:
- TASK_IDS: T019, T020
- TASKS_FILE: `specs/014-edge-credential-install/slices/plan_edge_credential_install_slice.md`

Batch-specific constraints:
- The generated JSON MUST use the full Cloud-style disclosure shape and include the current `persistentCredential` fields.
- Serialization MUST be stable enough for copy/paste and tests without adding a new Client persistence location for secrets.

Main proof:
- Focused unit coverage verifies JSON generation from `EdgeCredentialDisclosureResponse`.

Do not count this as success:
- A UI-only string builder that cannot be reused or tested independently from the disclosure panel.




### Batch 6: Admin Hub Disclosure UI

Execute `.agent\workflows\07b-speckit.implement.experimental.md` for the task batch in Scope.

Scope:
- TASK_IDS: T018, T021, T022
- TASKS_FILE: `specs/014-edge-credential-install/slices/plan_edge_credential_install_slice.md`

Batch-specific constraints:
- The disclosure panel MUST keep installer JSON visible/selectable and handle Clipboard API failure without extra secret persistence.
- Hide, refresh, and replacement disclosure paths MUST remove old plaintext secrets from the rendered UI.

Main proof:
- Admin Hub integration proof verifies installer JSON, copy action behavior, and old-secret cleanup after hide, refresh, and replacement disclosure.

Do not count this as success:
- A copy button that works only by storing the secret in a long-lived Client store or browser persistence.




### Batch 7: Edge Verification

Execute `.agent\workflows\07a-speckit.implement.quickcheck.md` for the task batch in Scope.

Scope:
- TASK_IDS: T023, T024, T025
- TASKS_FILE: `specs/014-edge-credential-install/slices/plan_edge_credential_install_slice.md`

Batch-specific constraints:
- Verification MUST stay targeted to the new Edge command/package and the runtime compatibility proof.
- Generated build artifacts MUST NOT be treated as source changes.

Main proof:
- `gofmt`, targeted `go test`, and `go build ./cmd/edge-credential` pass from `edge_server/go_core`.

Do not count this as success:
- Running only package tests while skipping the command build proof.




### Batch 8: Client Verification

Execute `.agent\workflows\07a-speckit.implement.quickcheck.md` for the task batch in Scope.

Scope:
- TASK_IDS: T026, T027
- TASKS_FILE: `specs/014-edge-credential-install/slices/plan_edge_credential_install_slice.md`

Batch-specific constraints:
- Client proof MUST cover both payload helper behavior and Admin Hub disclosure behavior.
- Existing unrelated build warnings MUST be recorded but not treated as slice behavior.

Main proof:
- Focused Client tests and Client build/type proof pass from `client`.

Do not count this as success:
- Passing helper unit tests while the Admin Hub integration proof is failing or skipped.




### Batch 9: Boundary Review And Smoke Record

Execute `.agent\workflows\07a-speckit.implement.quickcheck.md` for the task batch in Scope.

Scope:
- TASK_IDS: T028, T029, T030
- TASKS_FILE: `specs/014-edge-credential-install/slices/plan_edge_credential_install_slice.md`

Batch-specific constraints:
- Boundary inspection MUST confirm no Cloud issuance/auth changes and no Constructor, Dashboard, Dispatch, telemetry, command, alarm, or hardware scope leakage.
- Runtime smoke MUST use mock/noop sources or `runtimeapp.NewWithSourceFactoriesForTest`, not Modbus or COM hardware.

Main proof:
- Plan records changed-file boundary inspection, manual/runtime smoke results, and Technical Lead Review conclusions.

Do not count this as success:
- A review note that records test commands but does not inspect module boundaries or secret-retention risks.
