# Validation Report: Cloud Server Edge Lifecycle Migration

**Date**: 2026-04-14  
**Status**: PASS (with noted tooling caveat)

## Scope

This report validates the post-migration cloud behavior for edge lifecycle and runtime trust:

- lifecycle model: `Active | Blocked`
- availability model: `online | offline | lastSeenAt` (separate from lifecycle)
- persistent-credential-only runtime auth on `/edge`
- forced disconnect semantics for `credential_rotated` and `blocked`
- telemetry continuity and catalog identity based on `deviceId + metric`

## Commands Executed

### OpenAPI lint

```bash
cmd /c npx @redocly/cli lint openapi.yaml
```

Result:

- `openapi.yaml` is valid.
- One warning remains from Redocly default rule: server URL points to `http://localhost:4000` in development (`no-server-example.com` warning).

### Targeted integration coverage

Executed from `cloud_server/`:

```bash
cmd /c npm run test -- tests/integration/admin.edge-servers.lifecycle.test.ts
cmd /c npm run test -- tests/integration/edge-lifecycle.contract.test.ts
cmd /c npm run test -- tests/integration/edge-socket-auth.test.ts
cmd /c npm run test -- tests/integration/telemetry.resilience.test.ts
cmd /c npm run test -- tests/integration/edge-servers.catalog.test.ts
```

`admin.edge-servers.lifecycle`, `telemetry.resilience`, and `edge-servers.catalog` single-file runs passed in isolation.  
`edge-lifecycle.contract` and `edge-socket-auth` may intermittently fail in this environment with `spawn EPERM` while loading `vitest.config.ts` (esbuild subprocess startup issue).  
To verify functional correctness, the full suite was executed successfully and included both files.

### Full regression run

```bash
cmd /c npm run test
```

Result:

- `27` test files passed
- `141` tests passed
- includes:
  - `tests/integration/admin.edge-servers.lifecycle.test.ts`
  - `tests/integration/edge-lifecycle.contract.test.ts`
  - `tests/integration/edge-socket-auth.test.ts`
  - `tests/integration/telemetry.resilience.test.ts`
  - `tests/integration/edge-servers.catalog.test.ts`

## Verified Outcomes

1. Register creates `Active + offline` and discloses the first persistent credential once.
2. `/edge` accepts only `{ edgeId, credentialSecret }` and rejects legacy onboarding auth shape.
3. Only one trusted runtime session per `edgeId` is accepted at a time.
4. Rotate keeps lifecycle `Active`, invalidates old credential, and forcibly disconnects active trusted session.
5. Block moves lifecycle to `Blocked`, disconnects trusted session, and rejects reconnect.
6. Unblock returns lifecycle to `Active` and discloses a fresh persistent credential.
7. `edge_status` payload contains availability projection with `lastSeenAt`.
8. Telemetry trust gates are enforced; trust loss stops trusted telemetry immediately.
9. Catalog identity remains `deviceId + metric` within one `edgeId`.

## Drift And Residual Notes

- No code-vs-contract drift was found for the active edge lifecycle model across REST and WebSocket contracts.
- Misleading legacy runtime residue was cleaned: onboarding-only runtime/audit services were removed, outdated unit tests/model checks were dropped or rewritten, and the lifecycle integration contract test was renamed from `edge-onboarding.test.ts` to `edge-lifecycle.contract.test.ts`.
- Residual tooling caveat: intermittent `spawn EPERM` on isolated Vitest invocations in this environment; mitigated by a successful full-suite run including the affected files.
