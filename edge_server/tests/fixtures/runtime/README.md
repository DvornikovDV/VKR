# Runtime Fixtures

These fixtures freeze the minimum local input shapes for the `007-edge-server` persistent-credential runtime baseline.

## Authority rules

- The source of truth for local runtime inputs is `specs/007-edge-server/data-model.md` plus `specs/007-edge-server/quickstart.md`.
- Cloud-owned trust outcomes stay authoritative in the active websocket contract; these fixtures only freeze edge-local input files.
- The fixtures here are intentionally small and stable so Go runtime tests can consume them without depending on the legacy TypeScript onboarding path.

## Fixture set

- `config.mock.yaml`
  - In-process test config that uses `adapterKind: mock`.
  - Tests may consume it only through `runtimeapp.NewWithSourceFactoriesForTest(...)` with an explicit mock factory registry.
  - The production `edge-runtime` binary must not run with this config.
- `config.modbus.yaml`
  - Production-binary smoke config that uses the real `adapterKind: modbus_rtu` registry.
  - Requires `EDGE_MODBUS_PORT` or the default Arduino stand port `COM7`.
  - Use this config when a test starts the actual `cmd/edge-runtime` binary.
- `valid/credential.json`
  - Canonical current persistent credential file installed locally for trusted startup.
- `partial-corrupt/credential.json`
  - Deliberately malformed JSON payload based on the same persistent credential baseline for parse-failure handling.
- `onboarding-package.json`
  - `onboarding-package.json` - quarantined legacy reference only; not part of production acceptance.
  - Default Go acceptance must not depend on it; legacy reference coverage runs only with `EDGE_ENABLE_LEGACY_ONBOARDING_REFERENCE=1`.
  - Kept only while onboarding-first reference coverage remains under rewrite in `T010`, `T011`, `T015`, and `T021`.
- `legacy-onboarding/credential.json`
  - `legacy-onboarding/credential.json` - quarantined legacy reference only; not part of production acceptance.
  - Must fail when presented as the canonical persistent `credential.json` runtime input.
- `wrong-edge-id/edge_activation.json`
  - `wrong-edge-id/edge_activation.json` - quarantined legacy reference only; not part of production acceptance.
  - Must fail when parsed against the expected runtime edge id.

## Legacy TypeScript reference path

- Retained TypeScript reference helpers live under `edge_server/legacy/typescript-reference/**`.
- The production runtime authority is the Go runtime under `edge_server/go_core`; default acceptance must not import, execute, or document the TypeScript path as authoritative runtime behavior.
- TypeScript files may be compiled for archival reference checks, but they are not a production onboarding, credential, socket, or default-runtime implementation.
- Retained TypeScript credential helpers must accept explicit file paths or payloads only. They must not read env-driven credential defaults, onboarding packages, or `edge_activation` payloads.
