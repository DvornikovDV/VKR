# Input Pack Draft: Config Helper/Editor

This is a working Input Pack draft for a later `doc/slices.md` Stage 1 run.
It is not the slice plan and does not perform Stage 1.

## Slice Name

`config helper/editor`

## Proposed Plan Path

Preferred new spec area:

`specs/013-edge-configurator/slices/plan_config_helper_editor_slice.md`

Fallback if a new spec area is not desired:

`specs/007-edge-server/slices/plan_config_helper_editor_slice.md`

This draft is stored under `specs/012-dispatch/slices/` only as a temporary planning input because the current request targets this location.

## Source Of Truth Docs

- `doc_cursed/edge_configurator_ui_draft.md`
- `doc_cursed/edge_config_constants_plan.md`
- `doc_cursed/edge_control_plan.md`
- `doc_cursed/arduino_engineering_stand_plan.md`
- `doc_cursed/alarms_plan.md`
- `doc_cursed/cloud_client_control_plan.md`

## Similar Completed Slice Plans

- `specs/007-edge-server/slices/plan_edge_alarm_rules_slice.md`
- `specs/009-edge-capabilities/slices/plan_edge_capabilities_catalog_slice.md`
- `specs/007-edge-server/slices/plan_set_bool_slice.md`
- `specs/007-edge-server/slices/plan_set_number_slice.md`
- `specs/012-dispatch/slices/plan_command_audit_slice.md`

## Relevant Code And Doc Files For Stage 1

- `AGENTS.md`
- `edge_server/AGENTS.md`
- `client/AGENTS.md`
- `constructor/AGENTS.md`
- `constructor/FILE_MAP.md`
- `edge_server/go_core/internal/config/config.go`
- `edge_server/go_core/internal/config/config_test.go`
- `edge_server/go_core/internal/source/adapter.go`
- `edge_server/go_core/internal/source/manager.go`
- `edge_server/go_core/internal/source/modbus_serial_adapter.go`
- `edge_server/go_core/internal/runtimeapp/process.go`
- `edge_server/go_core/cmd/edge-runtime/main.go`
- `edge_server/go_core/cmd/edge-control/main.go`
- `edge_server/go_core/go.mod`
- `edge_server/samples/arduino-stand/edge-runtime.yaml`
- `edge_server/tests/fixtures/runtime/config.modbus.yaml`
- `edge_server/tests/fixtures/runtime/config.mock.yaml`
- `edge_server/engineering_system/engineering_system.ino`

## Scope

- Build a local Edge YAML configuration helper/editor.
- Provide a UI for generating, inspecting, editing, validating, and saving the existing Edge runtime YAML shape.
- Implement the editor as `edge-configurator`: a Go CLI with an embedded local web UI.
- Treat the tool as GUI-only for the MVP. The target OS must have a graphical environment and a browser or the ability to open the printed local URL.
- Serve the UI from a local Go HTTP server bound only to `127.0.0.1`.
- Save YAML only to the path explicitly passed through `--config`.
- Make the saved YAML readable by `edge-runtime --config <same-path>` or `EDGE_CONFIG_PATH`.
- Use Go validation as the final authority by reusing the same config parser/validator consumed by Edge runtime.
- Provide operator assistance for allowed values and common fields through UI metadata, controls, presets, and validation messages.
- Include an Arduino engineering stand preset based on `edge_server/samples/arduino-stand/edge-runtime.yaml`.
- Provide YAML preview and import/load from the configured path when it exists.
- Validate before saving.

## Out Of Scope

- Remote deploy to Edge.
- Applying a configuration to a running Edge.
- Restarting Edge runtime.
- Hot reload of Edge runtime sources.
- Cloud upload or Cloud storage of full YAML files.
- Hub, Dashboard, or Dispatch route integration.
- Cloud API endpoints for config upload, deploy, apply, restart, or history.
- Command execution from the editor.
- Editing persistent credentials or secrets as a separate credential management flow.
- Adding new adapter kinds, command types, alarm conditions, severities, register types, or runtime behavior through UI metadata alone.
- Headless Linux, SSH-only operation, service-mode UI, or browserless operation for this MVP slice.
- A full industrial configuration management system.

## Proposed Stack

- Go command: `edge_server/go_core/cmd/edge-configurator`.
- UI: embedded static web UI served by Go via `embed`.
- Frontend build: TypeScript plus a lightweight UI approach. React/Vite is acceptable if Stage 1 confirms the added build surface is worth it; plain TypeScript/HTML/CSS is also acceptable for a smaller tool.
- Runtime dependency: the built configurator should run as a native Go binary without requiring Node.js or Python on the target Edge host.
- Validation: Go endpoint or internal call path using `edge_server/go_core/internal/config`.
- Save path: `--config <path>` only.
- Browser behavior: try to open the local URL when practical, but always print the URL. Failure to auto-open is not itself a validation or startup failure when the URL is available.

## Key Invariants

- Go config parsing and validation remain the authoritative runtime contract.
- UI schema or metadata may provide labels, defaults, examples, ordering, help text, and dropdown values, but MUST NOT expand executable behavior by itself.
- Generated YAML MUST pass the normal Go config parser before it is saved.
- The local server MUST bind to `127.0.0.1`, not `0.0.0.0`.
- The browser MUST NOT choose an arbitrary save path; the server writes only to the CLI-provided `--config` path.
- Saving YAML MUST NOT automatically mutate a running Edge process.
- A changed YAML file takes effect only after an operator starts or restarts Edge outside this slice.
- `cloud.namespace` remains `/edge`.
- `runtime.edgeId` and `runtime.stateDir` remain required.
- Existing `KnownFields(true)` behavior should remain the final guard against unknown YAML fields.
- At least one enabled source is required for a valid runtime config.
- Supported enum values come from Edge code or generated/checked metadata, not from hand-maintained UI-only truth.
- Config command YAML uses `command`, while public Cloud catalog uses `commandType`.
- `reportedMetric` MUST reference a metric on the same device and match the command's expected value type.
- `set_bool` uses a boolean reported metric and no `min` or `max`.
- `set_number` uses a number reported metric and requires integer `min` and `max`.
- Modbus command mappings MUST use `holding` registers.
- Modbus metric register types are `input` or `holding`.
- Modbus metric data types are currently `uint16` and `int16`, with `uint16` as the default when omitted.
- Serial parity values are `none`, `even`, and `odd`.
- Logging levels are `debug`, `info`, `warn`, and `error`.
- Alarm condition types are `high`, `low`, `state`, and `connectivity`.
- Alarm severities are `warning` and `danger`.

## Main Runtime Path

1. Operator starts the local configurator with a target YAML path:
   `edge-configurator --config <path-to-edge-runtime.yaml>`.
2. The Go process starts a local HTTP server on `127.0.0.1`.
3. The tool prints the local URL and may attempt to open it in the default browser.
4. The UI loads the existing YAML from the configured path when present, or starts from an empty/default model or Arduino stand preset.
5. The operator edits structured sections and sees generated YAML preview.
6. The UI submits the current YAML/model to the local Go process for validation.
7. The Go process validates through the existing Edge config parser.
8. If valid, the Go process saves the YAML to the CLI-provided `--config` path.
9. Later, outside this slice, the operator starts Edge with the same path:
   `edge-runtime --config <path-to-edge-runtime.yaml>` or `EDGE_CONFIG_PATH=<path>`.

## Testing Constraints

- Apply Lean Testing Policy.
- Automated proof should cover the main happy path and at most one critical negative scenario for the main slice risk.
- Suggested happy path: Arduino preset or representative config is generated/saved and passes Go config validation.
- Suggested critical negative: an invalid enum or `reportedMetric` mismatch is rejected before save.
- Do not add broad table-driven tests for every config validation branch.
- No hardware should be required for automated proof.
- If the UI uses React/Vite, use focused frontend tests for the main interaction rather than exhaustive component coverage.
- If the UI uses plain TypeScript, focus tests on model-to-YAML generation, validation request behavior, and save gating.
- A manual GUI smoke may be required because the MVP explicitly targets OSes with GUI and browser.

## Hardware Constraints

- Hardware access is not required for automated validation.
- The Arduino engineering stand preset should mirror the documented sample and register model.
- The editor should not require the configured serial port to be present.
- The editor should not open the serial port or perform Modbus reads/writes.
- Manual smoke may use the Arduino stand sample YAML shape without connecting real hardware.

## Cloud, Edge, Client, Constructor Boundary Constraints

- Edge owns the local YAML runtime contract, parsing, validation, and execution.
- `edge-configurator` should live in or next to Edge so it can share the Go config parser without crossing module boundaries through ad hoc imports.
- Cloud MUST NOT receive, store, apply, or deploy raw YAML in this slice.
- Client MUST NOT read Edge YAML as part of Dashboard, Dispatch, or Hub runtime.
- Constructor MUST NOT become the Edge config editor unless an explicit boundary is designed later.
- No direct `/client` import from `/constructor`.
- No new Cloud endpoint for config upload or remote apply.
- No Edge restart/apply RPC.
- Existing capabilities catalog remains the sanitized Cloud-facing path for telemetry and command capabilities; raw mappings, addresses, URLs, connection settings, credentials, and adapter internals must stay out of Cloud/Client contracts.

## Unknowns And Assumptions

- Assumption: the editor runs on the same host where Edge runtime can later read the YAML path.
- Assumption: the target OS has a GUI environment and browser.
- Assumption: saving to the `--config` path is permitted by local filesystem permissions.
- Assumption: no standalone JSON Schema or metadata JSON file currently exists for the full Edge YAML contract; current authoritative schema/enums are in Go code and source-of-truth docs.
- Assumption: the MVP should prioritize Arduino preset, structured editing, YAML preview, validation, and local save over full configuration lifecycle management.
- Unknown: whether the UI should use React/Vite or plain TypeScript/HTML/CSS.
- Unknown: whether metadata/schema should be generated from Go constants or hand-authored and checked against Go constants.
- Unknown: whether the configurator should create missing parent directories or fail if the target directory is absent.
- Unknown: whether overwriting an existing target YAML requires explicit UI confirmation.
- Unknown: whether save should use an atomic temp-file-and-replace strategy from the first implementation batch.
- Unknown: whether comments from existing YAML need to be preserved. For MVP, generated YAML without comment preservation is likely acceptable unless Stage 1 finds a hard requirement.
