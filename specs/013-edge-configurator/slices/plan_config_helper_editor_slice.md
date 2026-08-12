# Plan: Config Helper/Editor Slice

## Purpose

This slice MUST add a compact local Edge YAML configuration helper/editor for MVP operators.

The helper MUST make the existing Edge runtime YAML contract easier to inspect, edit, validate, and save. It MUST NOT become a new runtime contract, a Cloud feature, or a structured industrial configuration management system.

## Source Of Truth

- `doc_cursed/edge_configurator_ui_draft.md`
- `doc_cursed/edge_config_constants_plan.md`
- `doc_cursed/edge_control_plan.md`
- `doc_cursed/arduino_engineering_stand_plan.md`
- `doc_cursed/alarms_plan.md`
- `doc_cursed/cloud_client_control_plan.md`
- `edge_server/go_core/internal/config/config.go`
- `edge_server/samples/arduino-stand/edge-runtime.yaml`

## Planning Note

The standard speckit prerequisite command `.agent/skills/scripts/powershell/check-prerequisites.ps1 -Json` was run as written and was blocked by local PowerShell Execution Policy. It was retried with `powershell -ExecutionPolicy Bypass -File .agent\skills\scripts\powershell\check-prerequisites.ps1 -Json`, which failed because the standard `specs/main` feature directory is absent. This slice plan therefore uses this file and the Stage 1 Input Pack as the design artifacts for task generation.

## Scope

- MUST implement `edge-configurator` as a Go CLI with an embedded local web UI.
- MUST target GUI-capable MVP environments where an operator can open a browser or use the printed local URL.
- MUST require `--config <path>` as the target YAML path.
- MUST serve the UI from a local Go HTTP server bound only to `127.0.0.1`.
- MUST load existing YAML from the `--config` path when the file exists.
- MUST use a YAML textarea/editor as the main editable source.
- MUST provide compact helper affordances: Arduino preset, snippets for common source/device/metric/command/alarm blocks, enum reference, short field hints, validation messages, and YAML preview when useful.
- MUST validate YAML through the existing Edge Go config parser and validator.
- MUST gate save behind successful validation.
- MUST save YAML only to the path passed through `--config`.
- MUST produce YAML that can later be read by `edge-runtime --config <same-path>` or `EDGE_CONFIG_PATH`.

## Out Of Scope

- MUST NOT implement a full structured tree/form editor for `sources -> devices -> metrics -> commands`.
- MUST NOT deploy configuration to a remote Edge.
- MUST NOT apply configuration to a running Edge process.
- MUST NOT restart Edge runtime or implement hot reload.
- MUST NOT upload, store, or manage raw YAML in Cloud.
- MUST NOT integrate with Hub, Dashboard, Dispatch, or Constructor routes.
- MUST NOT execute commands from the configurator.
- MUST NOT open serial ports or require hardware for automated proof.
- MUST NOT add new adapter kinds, command types, alarm condition types, severities, register types, or runtime behavior.
- MUST NOT introduce credential or secret management as a separate workflow.
- MUST NOT target headless, SSH-only, service-mode, or browserless operation in this MVP slice.

## Constraints

- Edge MUST remain the owner of YAML parsing, validation, and execution semantics.
- The configurator UI MUST be presentation and operator assistance only.
- UI metadata, snippets, and enum references MUST NOT expand accepted runtime values.
- UI metadata, snippets, and enum references MUST be generated from or checked against Go-owned config constants or validation behavior.
- Go validation MUST remain the final authority before save.
- The local server MUST bind to `127.0.0.1`, not `0.0.0.0`.
- The browser MUST NOT choose an arbitrary save path; the server MUST write only to the CLI-provided `--config` path.
- Saving YAML MUST NOT mutate, reload, restart, or signal a running Edge process.
- A changed YAML file MUST take effect only when an operator starts or restarts Edge outside this slice.
- Cloud MUST NOT receive raw YAML, Modbus mappings, addresses, connection settings, credentials, URLs, or adapter internals.
- Client, Dashboard, Hub, Dispatch, and Constructor MUST NOT read Edge YAML as part of this slice.
- Existing sanitized capability catalog behavior MUST remain the Cloud/Client-facing contract for command and telemetry capabilities.
- Documentation and plan files MUST remain in English.
- Code, identifiers, and comments MUST remain in English.
- Lean Testing Policy MUST apply: automated proof MUST cover the main happy path and at most one critical negative scenario for the main slice risk. Automated proof MUST NOT become a broad validation matrix for every YAML field or enum.
- Lean Testing MUST NOT make implementation tasks vague; later tasks MUST remain concrete, verifiable, and tied to file paths.

## Assumptions

- The preferred spec location is `specs/013-edge-configurator/slices/plan_config_helper_editor_slice.md`.
- The configurator runs on the same host where the saved YAML can later be used by Edge runtime.
- The target OS has a graphical environment and a browser, or the operator can manually open the printed local URL.
- The built configurator binary should run without Node.js or Python on the target Edge host.
- Plain TypeScript, HTML, and CSS are the default MVP UI choice unless later implementation review finds an existing build path makes React/Vite cheaper.
- Existing YAML comments do not need to be preserved for MVP.
- The configurator may fail with a clear error when the configured save path cannot be read or written.
- Parent directory creation, overwrite confirmation, and atomic temp-file replacement remain implementation decisions for the detailed task stage.
- The current `edge_server/go_core/internal/config` test baseline has known failures caused by sample alarm expectations; the detailed task stage MUST either include a setup fix or record the mismatch as a blocking prerequisite before counting config proof as passed.
- The detailed task stage MUST choose atomic temp-file replacement for save or explicitly justify a non-atomic MVP save behavior.

## Execution Flow

1. Operator starts `edge-configurator --config <path-to-edge-runtime.yaml>`.
2. The Go process validates CLI input, starts a local HTTP server on `127.0.0.1`, and prints the local URL.
3. The process MAY attempt to open the local URL in the default browser, but auto-open failure MUST NOT fail startup when the URL is available.
4. The UI loads YAML from the configured path when present.
5. The UI otherwise starts with an empty editor and offers an Arduino stand preset and snippets.
6. The operator edits YAML in the textarea/editor.
7. The UI submits the current YAML to the local Go validation endpoint.
8. The Go endpoint validates through the existing Edge config parser and returns structured validation success or error text.
9. The UI enables Save only after successful validation for the current content.
10. Save submits the current YAML to the local Go save endpoint.
11. The Go save endpoint validates the submitted YAML again and writes only to the CLI-provided `--config` path.
12. Later, outside this slice, the operator starts Edge with the saved file through `edge-runtime --config <same-path>` or `EDGE_CONFIG_PATH`.

## Acceptance Checks

- Starting `edge-configurator --config <path>` MUST print a local URL and bind only to `127.0.0.1`.
- Starting without `--config` MUST fail with a clear CLI error.
- When `<path>` exists, the UI MUST load the YAML text without automatically changing it.
- When `<path>` does not exist, the UI MUST allow inserting the Arduino preset or snippets into the editor.
- The UI MUST allow direct YAML editing as the primary workflow.
- The Arduino preset YAML MUST validate through the existing Go Edge config parser.
- Invalid YAML syntax MUST show validation feedback and MUST keep Save blocked.
- A critical invalid Edge config case, such as unsupported enum or `reportedMetric` mismatch, MUST show validation feedback and MUST keep Save blocked.
- Editing YAML after successful validation MUST invalidate the previous save-ready state until validation runs again for the current content.
- Save MUST re-run server-side validation before writing.
- Save MUST write only to the configured `--config` path.
- Saved YAML MUST be accepted by the existing Edge config parser and be usable later by `edge-runtime --config <same-path>` or `EDGE_CONFIG_PATH`.
- UI helper snippets and enum references MUST NOT allow rejected values to bypass Go validation.
- The slice MUST NOT touch Cloud, Client, Dashboard, Dispatch, Constructor, running Edge runtime behavior, serial ports, or command execution paths.

## Format: `[ID] [P?] [Story?] Description`

- `[P]` means the task can run in parallel because it touches different files and does not depend on incomplete tasks.
- `[US1]` maps to the local configurator server, validation, and save workflow.
- `[US2]` maps to the embedded browser UI workflow.
- Every task includes the file path that owns the change or proof.
- This document intentionally does not include implementation batches.

## Phase 1: Setup

**Purpose**: Remove known proof blockers and establish the new Edge-owned configurator surface.

- [X] T001 Fix the Arduino stand alarm sample expectations so `go test ./internal/config -count=1` can validate the current two-rule sample in `edge_server/go_core/internal/config/config_test.go`
- [X] T002 Create the `edge-configurator` command scaffold with `--config` parsing, clear missing-config failure, and no Cloud/runtime startup in `edge_server/go_core/cmd/edge-configurator/main.go`
- [X] T003 [P] Add command-level tests for missing `--config` and dependency-injected startup wiring in `edge_server/go_core/cmd/edge-configurator/main_test.go`
- [X] T004 [P] Add the embedded sanitized Arduino stand preset asset with the current stand mappings and editable placeholders for operator-specific `edgeId`, `stateDir`, `cloud.url`, and serial port fields in `edge_server/go_core/internal/configurator/assets/arduino-stand.yaml`
- [X] T005 [P] Add the initial embedded UI asset files for the compact YAML editor in `edge_server/go_core/internal/configurator/web/index.html`, `edge_server/go_core/internal/configurator/web/app.js`, and `edge_server/go_core/internal/configurator/web/styles.css`

**Checkpoint**: The new command surface exists, config parser proof is not blocked by stale tests, and embedded asset locations are stable.

---

## Phase 2: Foundational Configurator Services

**Purpose**: Build shared local validation, metadata, and file persistence helpers before HTTP and UI behavior.

- [X] T006 Add configurator API DTOs for load, helper data, validation, and save responses in `edge_server/go_core/internal/configurator/types.go`
- [X] T007 Add a validation service that calls `config.Parse` and returns structured success or error text without weakening Go config validation in `edge_server/go_core/internal/configurator/validation.go`
- [X] T008 Add helper metadata, enum reference, snippets, and Arduino preset access while keeping helper values checked against Go-owned validation behavior in `edge_server/go_core/internal/configurator/helpers.go`
- [X] T009 [P] Add compact helper proof that the Arduino preset parses through `config.Parse` and helper enum/snippet values do not bypass validation in `edge_server/go_core/internal/configurator/helpers_test.go`
- [X] T010 Add target-path file loading and atomic temp-file replacement for save, scoped only to the CLI-provided config path, in `edge_server/go_core/internal/configurator/files.go`
- [X] T011 [P] Add file persistence tests for missing existing file, successful atomic save, and no arbitrary path input in `edge_server/go_core/internal/configurator/files_test.go`

**Checkpoint**: The configurator can load, validate, describe helper data, and save through Edge-owned services without starting an HTTP server.

---

## Phase 3: User Story 1 - Local Validation And Save Server (Priority: P1) MVP

**Goal**: An operator can start a local `edge-configurator` process for one `--config` path, validate YAML through Go, and save only after server-side validation.

**Independent Test**: Use `httptest` against the configurator handler to load helper data, validate the Arduino preset, reject one critical invalid config, save valid YAML to the configured path, and verify the server never accepts a browser-selected save path.

### Tests For User Story 1

- [X] T012 [US1] Add compact HTTP handler proof for one load/helper/validate/save happy path and one critical invalid config rejection in `edge_server/go_core/internal/configurator/server_test.go`
- [X] T013 [US1] Add command integration proof that startup creates a `127.0.0.1` listener URL through injected listener/server dependencies, browser auto-open failure does not fail startup, and Cloud or Edge runtime do not start in `edge_server/go_core/cmd/edge-configurator/main_test.go`

### Implementation For User Story 1

- [X] T014 [US1] Implement local HTTP routes for `GET /api/config`, `GET /api/helpers`, `POST /api/validate`, and `POST /api/save` in `edge_server/go_core/internal/configurator/server.go`
- [X] T015 [US1] Serve embedded UI assets from the same local handler without exposing filesystem browsing in `edge_server/go_core/internal/configurator/server.go`
- [X] T016 [US1] Wire `edge-configurator` startup to bind only `127.0.0.1:0`, print the local URL, and optionally attempt browser open without failing startup in `edge_server/go_core/cmd/edge-configurator/main.go`
- [X] T017 [US1] Ensure save revalidates submitted YAML server-side and writes only through the configured target path service in `edge_server/go_core/internal/configurator/server.go`

**Checkpoint**: The local server enforces the core safety contract: local-only bind, Go validation, save gating, and single configured save path.

---

## Phase 4: User Story 2 - Compact Browser YAML Helper UI (Priority: P1) MVP

**Goal**: An operator can use the embedded browser UI as a compact YAML editor with presets, snippets, enum hints, validation feedback, dirty-state save gating, and save action.

**Independent Test**: Serve the embedded UI through the configurator handler and verify the asset routes load. Use manual browser smoke for textarea editing, validation feedback, dirty-state invalidation, snippet insertion, preset insertion, and save gating because this slice intentionally avoids adding a frontend build/test stack.

### Tests For User Story 2

- [X] T018 [US2] Add embedded asset smoke proof that the configurator handler serves `index.html`, `app.js`, and `styles.css` from `edge_server/go_core/internal/configurator/server_test.go`

### Implementation For User Story 2

- [X] T019 [US2] Build the compact editor HTML with YAML textarea, validation status, save action, preset action, snippets area, enum reference area, and hints area in `edge_server/go_core/internal/configurator/web/index.html`
- [X] T020 [US2] Implement browser behavior for loading YAML, inserting preset/snippets, validating current content, invalidating save-ready state after edits, and saving only after current-content validation in `edge_server/go_core/internal/configurator/web/app.js`
- [X] T021 [US2] Add compact responsive styling for the editor, helper panels, validation state, and disabled save state in `edge_server/go_core/internal/configurator/web/styles.css`

**Checkpoint**: The embedded UI supports the MVP local workflow without becoming a structured tree/form editor.

---

## Phase 5: Polish, Verification, And Review

**Purpose**: Verify focused behavior, document manual smoke, and check module boundaries without expanding proof volume.

- [X] T022 Run `gofmt` on the new Go files in `edge_server/go_core/cmd/edge-configurator` and `edge_server/go_core/internal/configurator`
- [X] T023 Run targeted config proof with `go test ./internal/config -count=1` from `edge_server/go_core`
- [X] T024 Run targeted configurator proof with `go test ./internal/configurator ./cmd/edge-configurator -count=1` from `edge_server/go_core`
- [X] T025 Run build proof with `go build ./cmd/edge-configurator` from `edge_server/go_core`
- [X] T026 Add manual GUI smoke steps and verification notes for local URL, preset insertion, invalid validation, dirty-state save gating as a required pass/fail blocker, validated save, and later `edge-runtime --config` parse in `specs/013-edge-configurator/slices/plan_config_helper_editor_slice.md`
- [X] T027 Inspect Edge, Cloud, Client, and Constructor boundaries to confirm only Edge-owned configurator/config files changed for this slice, with the live Arduino stand sample treated as operator/runtime config and exact parser expectations moved to `edge_server/go_core/internal/config/testdata`, in `specs/013-edge-configurator/slices/plan_config_helper_editor_slice.md`
- [X] T028 Complete Technical Lead Review for local bind safety, save path safety, validation authority, metadata drift, UI dirty-state gating, atomic save, Lean Testing scope, live-sample fixture separation, and absence of Cloud/Client/Constructor leakage in `specs/013-edge-configurator/slices/plan_config_helper_editor_slice.md`

---

## Dependencies And Execution Order

### Phase Dependencies

- Phase 1 MUST complete before Phase 2 because the command surface, assets, and baseline parser proof must be stable.
- Phase 2 MUST complete before Phase 3 because HTTP routes depend on validation, helper data, and file services.
- Phase 3 MUST complete before Phase 4 can be manually smoked through the real browser workflow, although static UI asset work may begin earlier after T005.
- Phase 5 depends on completed implementation and proof tasks.

### Task Dependencies

- T003 depends on the command shape introduced by T002.
- T009 depends on T004, T007, and T008.
- T011 depends on T010.
- T012 depends on T006-T011 and passes only after T014, T015, and T017.
- T013 depends on T002 and passes only after T016.
- T014 depends on T006, T007, T008, and T010.
- T015 depends on T005 and T014.
- T016 depends on T002 and T014.
- T017 depends on T007, T010, and T014.
- T018 depends on T005 and T015.
- T019-T021 depend on the API contracts from T006 and route behavior from T014.
- T023 depends on T001 because the targeted config proof must not inherit the known sample alarm mismatch.
- T022-T025 depend on implementation completion.
- T026 depends on T023-T025 because smoke notes must reflect proof results.
- T027-T028 depend on T026.

### Parallel Opportunities

- T003, T004, and T005 can run in parallel after T002 is sketched because they touch separate files.
- T009 and T011 can run in parallel after T007-T010 define helper and file service behavior.
- T012 and T013 can be drafted in parallel because one targets the internal handler and one targets command startup wiring.
- T019, T020, and T021 can be split after T006 and T014 stabilize the UI/API payload shape.
- T023, T024, and T025 can run in parallel after T022 when local resources permit.

## Parallel Examples

### User Story 1

```text
Task: "Add HTTP handler proof for load, helper data, validation happy path, one critical invalid config rejection, and validated save to the configured path in `edge_server/go_core/internal/configurator/server_test.go`"
Task: "Add command integration proof that startup creates a `127.0.0.1` listener URL through injected listener/server dependencies without starting Cloud or Edge runtime in `edge_server/go_core/cmd/edge-configurator/main_test.go`"
```

### User Story 2

```text
Task: "Build the compact editor HTML with YAML textarea, validation status, save action, preset action, snippets area, enum reference area, and hints area in `edge_server/go_core/internal/configurator/web/index.html`"
Task: "Implement browser behavior for loading YAML, inserting preset/snippets, validating current content, invalidating save-ready state after edits, and saving only after current-content validation in `edge_server/go_core/internal/configurator/web/app.js`"
```

## Implementation Strategy

### MVP First

1. Complete Phase 1 to remove the known parser proof blocker and create the command/asset anchors.
2. Complete Phase 2 to make validation, helper data, and save behavior testable without a browser.
3. Complete Phase 3 to prove the local server safety contract.
4. Complete Phase 4 to make the embedded UI usable for the compact YAML helper workflow.
5. Complete Phase 5 focused proof, manual smoke notes, and Technical Lead Review.

### Boundary Bias

- Prefer plain embedded HTML, CSS, and JavaScript over adding a frontend build stack for this MVP.
- Keep validation and save behavior in Go, not in browser-only logic.
- Keep helper metadata near the configurator package but checked against Edge config parsing behavior.
- Keep Arduino-specific values in preset assets, snippets, tests, and smoke notes only.
- Do not add Cloud, Client, Dashboard, Dispatch, Constructor, serial-port, or command-execution placeholders.

## Verification Notes

Recorded for T022, T024, T025, and T026 on 2026-05-15.

### Workflow Prerequisite Check

- Command: `.agent/skills/scripts/powershell/check-prerequisites.ps1 -Json -RequireTasks -IncludeTasks`
- Result: BLOCKED.
- Notes: local PowerShell execution policy rejected the script with `PSSecurityException`.
- Retry command: `powershell -ExecutionPolicy Bypass -File .agent\skills\scripts\powershell\check-prerequisites.ps1 -Json -RequireTasks -IncludeTasks`
- Retry result: BLOCKED.
- Retry notes: the script ran but reported `Feature directory not found: D:\Study\4_course\VKR\specs\main`. This batch therefore followed the explicit `TASKS_FILE` path from Scope.

### Automated Code Verification

- Command: `gofmt -w cmd\edge-configurator\main.go cmd\edge-configurator\main_test.go internal\configurator\files.go internal\configurator\files_test.go internal\configurator\helpers.go internal\configurator\helpers_test.go internal\configurator\server.go internal\configurator\server_test.go internal\configurator\types.go internal\configurator\validation.go internal\configurator\validation_test.go`
- Scope: Go source formatting for the new configurator command and internal configurator package.
- Result: PASS.
- Notes: the first sandboxed attempt failed with `windows sandbox: setup refresh failed`; the rerun completed with exit code 0.

- Command: `go test ./internal/configurator ./cmd/edge-configurator -count=1`
- Scope: targeted configurator service, handler, asset, and command startup proof.
- Result: PASS.
- Notes: the first sandboxed attempt failed with `windows sandbox: setup refresh failed`; the rerun completed with `ok edge_server/go_core/internal/configurator` and `ok edge_server/go_core/cmd/edge-configurator`.

- Command: `go build ./cmd/edge-configurator`
- Scope: build proof for the edge configurator command.
- Result: PASS.
- Notes: the first sandboxed attempt failed with `windows sandbox: setup refresh failed`; the rerun completed with exit code 0. The generated local `edge-configurator.exe` build artifact was removed after the proof.

### Manual Browser Smoke Plan

Manual smoke is intentionally separate from automated Go verification. Do not replace these checks with additional Go tests; run them in a real browser against a temporary YAML path and record each item as PASS or FAIL.

Manual smoke status on 2026-05-15: PASS by operator confirmation. The operator reported that the browser workflow works correctly, including the required dirty-state save gating condition.

1. From `edge_server/go_core`, build or run `edge-configurator --config <temp-edge-runtime.yaml>`.
2. Verify the process prints a `http://127.0.0.1:<port>` URL and does not print or bind a wildcard address such as `0.0.0.0`.
3. Open the printed URL in a browser on the same machine.
4. Insert the Arduino preset, validate it, and verify the UI reports successful Go-backed validation.
5. Save the validated preset and verify the file is written only to `<temp-edge-runtime.yaml>`.
6. Edit the YAML after successful validation and verify Save immediately becomes unavailable until validation runs again for the current content. This dirty-state save gating check is a required pass/fail blocker.
7. Introduce one critical invalid config, such as an unsupported enum or mismatched `reportedMetric`, and verify validation fails and Save remains unavailable.
8. Restore valid YAML, validate, save again, and later verify the saved file is accepted by the existing Edge parser through `edge-runtime --config <temp-edge-runtime.yaml>` or an equivalent parser check.
9. Mark manual smoke as FAIL if the UI can save invalid YAML, if Save stays enabled after edits, if the browser can choose an arbitrary save path, if the server binds outside `127.0.0.1`, or if any Cloud, Client, Constructor, running Edge runtime, serial port, or command execution path is required.

## Technical Lead Review

Review this plan and implementation for local bind safety, save path safety, validation authority, metadata drift, stale UI validation state, atomic save behavior, Lean Testing scope, module boundaries, and absence of Cloud/Client/Constructor/runtime leakage.

### 2026-05-15 Quickcheck Review Notes For T027-T028

Review result: BLOCKED, not accepted as slice success.

Boundary inspection:

- Command: `git status --porcelain=v1 -uall`
- Result: FAIL for the requested allowed boundary. The only current working tree change before this review was `edge_server/samples/arduino-stand/edge-runtime.yaml`, which is outside the T027 allowed implementation boundary of `edge_server/go_core/cmd/edge-configurator`, `edge_server/go_core/internal/configurator`, and `edge_server/go_core/internal/config/config_test.go`.
- Command: `git diff --name-status`
- Result: `M edge_server/samples/arduino-stand/edge-runtime.yaml`.
- Command: `git status --short -- client cloud_server constructor edge_server specs/013-edge-configurator/slices/plan_config_helper_editor_slice.md`
- Result before this plan update: no Cloud, Client, or Constructor changes; one Edge sample YAML change only.
- Command: `rg -n "edge-configurator|configurator|arduino-stand.yaml|SaveRequest|HelperDataResponse|ValidationRequest|edge runtime yaml|edge-runtime.yaml" cloud_server client constructor`
- Result: PASS for leakage search; no matches in Cloud, Client, or Constructor.

Implemented files inspected:

- `edge_server/go_core/cmd/edge-configurator/main.go`
- `edge_server/go_core/cmd/edge-configurator/main_test.go`
- `edge_server/go_core/internal/configurator/types.go`
- `edge_server/go_core/internal/configurator/validation.go`
- `edge_server/go_core/internal/configurator/files.go`
- `edge_server/go_core/internal/configurator/helpers.go`
- `edge_server/go_core/internal/configurator/server.go`
- `edge_server/go_core/internal/configurator/web/index.html`
- `edge_server/go_core/internal/configurator/web/app.js`
- `edge_server/go_core/internal/configurator/web/styles.css`
- `edge_server/go_core/internal/configurator/*_test.go`
- `edge_server/go_core/internal/config/config_test.go`
- `edge_server/go_core/internal/configurator/assets/arduino-stand.yaml`
- `edge_server/samples/arduino-stand/edge-runtime.yaml`

Safety review:

- Local bind safety: PASS in implementation. `edge_server/go_core/cmd/edge-configurator/main.go` calls the injected listener with `tcp` and `127.0.0.1:0`, and `localConfiguratorURL` prints a `http://127.0.0.1:<port>` URL. `edge_server/go_core/cmd/edge-configurator/main_test.go` asserts the listener address and rejects wildcard output such as `0.0.0.0`.
- Save path safety: PASS in implementation. `edge_server/go_core/internal/configurator/types.go` defines `SaveRequest` with only `yaml`; `edge_server/go_core/internal/configurator/server.go` passes only `request.YAML` to `ConfigFileService.Save`; `edge_server/go_core/internal/configurator/files.go` writes to the `targetPath` captured from CLI construction. `files_test.go` and `server_test.go` include proof that browser-selected path input is ignored and no alternate browser path is created.
- Validation authority: PASS in implementation. `edge_server/go_core/internal/configurator/validation.go` calls `config.Parse` directly. `files.go` revalidates in `Save` before writing, so browser state cannot bypass Go validation. `server_test.go` covers `reportedMetric` mismatch rejection before save.
- Atomic save: PASS in implementation. `edge_server/go_core/internal/configurator/files.go` writes to an adjacent temp file with `os.CreateTemp`, syncs and closes it, then replaces the configured target with `os.Rename`, with temp cleanup on failure.
- UI dirty-state gating: PASS by inspected UI code and recorded manual smoke. `edge_server/go_core/internal/configurator/web/app.js` tracks `validatedYAML`, disables save on edits through `markDirty`, snapshots YAML during validate/save, and reverts to "Validation required" if content changes while a request is in flight. The T026 manual smoke notes record operator PASS for dirty-state save gating.
- Metadata drift: FAIL for the current working tree. `edge_server/go_core/internal/configurator/helpers.go` and `helpers_test.go` check helper enums, snippets, and the embedded preset against `config.Parse`, but the current changed source sample `edge_server/samples/arduino-stand/edge-runtime.yaml` now differs from `edge_server/go_core/internal/configurator/assets/arduino-stand.yaml` in alarm order, enablement, and high alarm thresholds. Because the sample YAML is one of this plan's Source Of Truth files, the working tree currently has sample/preset drift.
- Local hardware/runtime side effects: PASS in implementation. The inspected configurator command constructs only the configurator HTTP handler and optional browser opener. No source manager, serial adapter, Edge runtime loop, Cloud transport, or industrial command execution route is started by `edge_server/go_core/cmd/edge-configurator/main.go` or `edge_server/go_core/internal/configurator/server.go`.
- Cloud/Client/Constructor leakage: PASS for inspected code and search. No touched files or search hits were found in `cloud_server`, `client`, or `constructor`. The implementation remains in Edge-owned Go command/package files, apart from the currently modified Edge sample YAML noted above.
- Lean Testing scope: PASS for configurator tests, FAIL for overall batch acceptance because parser baseline proof is currently red. The targeted configurator tests cover helper/preset proof, one server happy path, one critical invalid config rejection, asset smoke, path safety, and command startup binding without adding a broad validation matrix.

Verification during T027-T028 review:

- Command: `.agent/skills/scripts/powershell/check-prerequisites.ps1 -Json -RequireTasks -IncludeTasks`
- Result: BLOCKED.
- Notes: PowerShell Execution Policy rejected the script with `PSSecurityException`.

- Command: `powershell -ExecutionPolicy Bypass -File .agent\skills\scripts\powershell\check-prerequisites.ps1 -Json -RequireTasks -IncludeTasks`
- Result: BLOCKED.
- Notes: the script ran but reported `Feature directory not found: D:\Study\4_course\VKR\specs\main`; this review therefore continued with the explicit `TASKS_FILE` from Scope.

- Command: `go test ./internal/config -count=1`
- Scope: parser baseline and Arduino stand sample proof.
- Result: FAIL.
- Notes: `TestParseAcceptsArduinoStandAlarmRules` failed with `unexpected high alarm ruleId: "humidity_low_warning"`, and `TestParseRejectsHighAlarmInvalidHysteresis` failed because the changed sample made the first alarm a low condition. This is caused by the current working tree diff in `edge_server/samples/arduino-stand/edge-runtime.yaml`.

- Command: `go test ./internal/configurator ./cmd/edge-configurator -count=1`
- Scope: configurator service, save validation, helper metadata, local server, asset smoke, and command bind proof.
- Result: PASS.
- Notes: completed with `ok edge_server/go_core/internal/configurator` and `ok edge_server/go_core/cmd/edge-configurator`.

- Command: `go build ./cmd/edge-configurator`
- Scope: build proof for the configurator command.
- Result: PASS.
- Notes: the generated local `edge-configurator.exe` build artifact was removed after the proof.

Conclusion:

- T027 is not complete because the actual touched-file inspection found `edge_server/samples/arduino-stand/edge-runtime.yaml` outside the allowed boundary and the parser baseline proof is failing.
- T028 is not complete because metadata drift and parser baseline failure remain unresolved, even though local bind safety, save path safety, Go validation authority, atomic save, UI dirty-state gating, and absence of Cloud/Client/Constructor leakage pass inspection.

### 2026-05-15 Resolution Notes For T027-T028

Resolution result: PASS after user clarification and code changes.

Clarified model:

- `edge_server/samples/arduino-stand/edge-runtime.yaml` is a live operator/runtime sample used for the engineering stand. Tests must verify that it remains parseable through `config.Parse`, but must not rely on exact alarm order, enablement, or thresholds that can legitimately change during stand operation.
- Exact parser expectations now use the stable fixture `edge_server/go_core/internal/config/testdata/arduino-stand-valid.yaml`.
- `edge_server/go_core/internal/configurator/assets/arduino-stand.yaml` remains a sanitized starter preset for the UI and is still checked by configurator helper tests.

Boundary inspection after resolution:

- Command: `git status --short`
- Result: Edge-only changes: `edge_server/go_core/internal/config/config_test.go`, `edge_server/go_core/internal/config/testdata/arduino-stand-valid.yaml`, and the operator/runtime sample `edge_server/samples/arduino-stand/edge-runtime.yaml`. The ignored plan file was also updated with this proof.
- Command: `git status --short -- client cloud_server constructor edge_server`
- Result: no Cloud, Client, or Constructor changes; all code/data changes are under `edge_server`.
- Command: `rg -n "edge-configurator|configurator|arduino-stand.yaml|SaveRequest|HelperDataResponse|ValidationRequest|edge runtime yaml|edge-runtime.yaml" cloud_server client constructor`
- Result: PASS for leakage search; no matches in Cloud, Client, or Constructor.

Code changes inspected:

- `edge_server/go_core/internal/config/config_test.go`: command mapping, alarm rule, invalid high hysteresis, and metric mapping tests now parse `arduinoStandFixtureYAML`; a separate `TestParseAcceptsLiveArduinoStandSample` checks the live sample only for parse success.
- `edge_server/go_core/internal/config/testdata/arduino-stand-valid.yaml`: stable fixture owns exact command, metric, and alarm expectations for parser tests.
- `edge_server/samples/arduino-stand/edge-runtime.yaml`: remains operator/runtime config and can change thresholds/order as long as it stays accepted by `config.Parse`.

Safety review after resolution:

- Validation authority: PASS. Parser tests and configurator save validation still exercise `config.Parse`; live sample smoke now proves the operator config is valid without freezing stand-specific alarm values.
- Save path safety: PASS unchanged. `SaveRequest` has no path field and `ConfigFileService.Save` writes only to the CLI-provided target path.
- Local bind safety: PASS unchanged. `edge-configurator` listens on `127.0.0.1:0` and tests assert the local URL.
- Metadata drift: PASS for the clarified model. Runtime sample and configurator preset are intentionally not exact copies; exact parser metadata is anchored in `internal/config/testdata`, while helper metadata and preset values remain validated against `config.Parse`.
- Cloud/Client/Constructor leakage: PASS. No files in `cloud_server`, `client`, or `constructor` changed and search found no configurator contract leakage.
- Lean Testing scope: PASS. The fix adds one stable fixture and one live-sample parse smoke rather than a broad matrix.

Verification after resolution:

- Command: `gofmt -w internal\config\config_test.go`
- Scope: formatting for changed Go test file.
- Result: PASS.

- Command: `go test ./internal/config -count=1`
- Scope: parser baseline, stable Arduino fixture exact expectations, and live Arduino sample parse smoke.
- Result: PASS.
- Notes: completed with `ok edge_server/go_core/internal/config`.

- Command: `go test ./internal/configurator ./cmd/edge-configurator -count=1`
- Scope: configurator service, save validation, helper metadata, local server, asset smoke, and command bind proof.
- Result: PASS.
- Notes: completed with `ok edge_server/go_core/internal/configurator` and `ok edge_server/go_core/cmd/edge-configurator`.

- Command: `go build ./cmd/edge-configurator`
- Scope: build proof for the configurator command.
- Result: PASS.
- Notes: the generated local `edge-configurator.exe` build artifact was removed after the proof.

### Review Checklist

- Verify `edge-configurator` does not start Edge runtime, Cloud transport, source manager, serial port access, or command execution.
- Verify the HTTP listener binds only to `127.0.0.1`.
- Verify save writes only to the CLI-provided `--config` path.
- Verify save revalidates server-side and cannot be bypassed by browser state.
- Verify UI dirty-state changes invalidate previous successful validation.
- Verify helper metadata and snippets cannot expand accepted Go config values.
- Verify atomic save either exists or any non-atomic behavior is explicitly justified.
- Verify Arduino preset remains parseable by `config.Parse`.
- Verify automated proof stays lean: parser baseline, helper/preset proof, one server happy path, one critical invalid config rejection, and asset smoke only.
- Verify no Cloud, Client, Dashboard, Dispatch, Constructor, running Edge process, serial port, or command execution path changed.

## Future Work

- A full structured tree/form editor MAY be planned later after the compact YAML helper proves useful.
- Remote deployment, apply/restart workflows, Cloud-backed configuration history, and browserless operation MAY be planned only as separate slices with explicit boundaries.

## Review Trigger

Review this plan when the Edge YAML contract changes, when Go config validation moves, when the Arduino stand sample changes, when configurator scope expands beyond local file editing, or when Cloud/Client/Constructor integration is proposed.
