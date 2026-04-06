# Runtime Fixtures

These fixtures freeze the minimum local credential and activation payload shapes needed for future `001-edge-runtime` contract tests.

## Authority rules

- The source of truth remains the cloud contract and the `specs/001-edge-runtime/contracts/*` documents.
- The TypeScript files under `edge_server/src` were used only as development examples to derive representative local shapes.
- The fixtures here are intentionally small and stable so future Go tests can consume them without depending on the current TypeScript examples.

## Fixture set

- `valid/credential.json`
  - Canonical persisted reconnect record expected to be accepted as trusted local state.
- `partial-corrupt/credential.json`
  - Deliberately malformed JSON payload representing a partial or corrupt persisted credential file.
- `legacy-onboarding/credential.json`
  - Legacy onboarding-shaped persisted record that must not be accepted as canonical trusted reconnect state.
- `wrong-edge-id/edge_activation.json`
  - Syntactically valid activation payload whose `edgeId` does not match the expected runtime edge id.

## Derivation notes

- `valid/credential.json` matches the accepted persistent record shape exercised by `client/tests/unit/edgeActivationCredentialBehavior.test.ts`.
- `legacy-onboarding/credential.json` matches the onboarding-shaped record that the same regression rejects.
- `wrong-edge-id/edge_activation.json` matches the activation payload shape validated by `edge_server/src/onboarding/activateEdge.ts`, except for the intentionally mismatched `edgeId`.
