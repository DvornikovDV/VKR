# Follow-up Tasks: Admin Diagram Review Non-Race Findings

## Scope

These follow-up tasks address the remaining non-race findings from the final
review of Admin diagram creation and independent-copy assignment.

The accepted manual browser smoke is not part of this batch. Mutation lease,
concurrency, and race-hardening changes are explicitly out of scope.

## Tasks

- [X] F001 Synchronize the primary and mirrored Cloud OpenAPI contracts in
  `cloud_server/openapi.yaml` and
  `specs/001-cloud-server/contracts/openapi.yaml`.
  - Preserve the reviewed independent-copy assignment contract, including the
    retained Admin template, binding-free User copy, `sourceTemplateId`
    provenance, and Cloud-authoritative eligibility and quota validation.
  - Reconcile the current unrelated drift in server declarations, telemetry
    history paths, command and alarm paths, diagram binding schemas, response
    types, and Edge catalog schemas.
  - Establish which file is canonical and make the mirrored file represent the
    same active API surface without weakening schemas to generic objects.
  - Validate both files with:
    - `cmd /c npx @redocly/cli lint openapi.yaml` from `cloud_server/`
    - `cmd /c npx @redocly/cli lint specs\001-cloud-server\contracts\openapi.yaml`
      from the repository root
  - Verify that a direct comparison contains no unexplained API-surface drift.

- [X] F002 Remove the focused Client lint failure from
  `client/tests/mocks/handlers.ts`.
  - Replace `Record<string, any>` in `UserEdgeConsumerFixtures` with an
    appropriate explicit response type or `unknown`-based type that preserves
    existing test fixture behavior.
  - Do not broaden the task into unrelated Client fixture refactoring.
  - Validate with:
    - `cmd /c npx eslint tests/mocks/handlers.ts` from `client/`
    - `cmd /c npm run test -- tests/integration/AdminHubPages.test.tsx tests/unit/adminAssignmentApiContracts.test.ts`
      from `client/`

## Completion Criteria

- The primary and mirrored OpenAPI files describe the same active API surface,
  and both pass OpenAPI lint.
- The independent-copy assignment contract remains unchanged.
- The focused Client lint command passes without suppressing the lint rule.
- Relevant Admin assignment Client tests continue to pass.

## Out Of Scope

- Mutation lease renewal, lease ownership loss, or concurrency hardening.
- Changes to diagram assignment semantics, quota policy, or eligibility rules.
- Re-execution or documentation of the accepted manual browser smoke.
- Unrelated repository-wide lint cleanup.
