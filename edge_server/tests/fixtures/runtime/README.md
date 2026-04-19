# Runtime Fixtures

These fixtures freeze the minimum local input shapes for the `007-edge-server` persistent-credential runtime baseline.

## Authority rules

- The source of truth for local runtime inputs is `specs/007-edge-server/data-model.md` plus `specs/007-edge-server/quickstart.md`.
- Cloud-owned trust outcomes stay authoritative in the active websocket contract; these fixtures only freeze edge-local input files.
- The fixtures here are intentionally small and stable so Go runtime tests can consume them without depending on the legacy TypeScript onboarding path.

## Fixture set

- `config.yaml`
  - Operator-managed smoke/reference config shaped like the `007` persistent runtime baseline with `runtime.edgeId`, `runtime.stateDir`, reconnect settings, and one local source definition.
- `valid/credential.json`
  - Canonical current persistent credential file installed locally for trusted startup.
- `partial-corrupt/credential.json`
  - Deliberately malformed JSON payload based on the same persistent credential baseline for parse-failure handling.
- `onboarding-package.json`
  - Legacy bootstrap reference kept only while onboarding-first tests remain under rewrite.
- `legacy-onboarding/credential.json`
  - Legacy onboarding-shaped persisted record kept as a quarantined reference and not as canonical persistent runtime state.
- `wrong-edge-id/edge_activation.json`
  - Legacy activation payload reference whose `edgeId` does not match the expected runtime edge id.
