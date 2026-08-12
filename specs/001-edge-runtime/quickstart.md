# Quickstart: `001-edge-runtime` Preflight Smoke Pack

## Goal

Validate the minimum preflight package for `001-edge-runtime` without implementing the Go runtime itself.

This quickstart freezes one reproducible smoke flow for:

1. register edge
2. disclose onboarding package
3. connect with `credentialMode = onboarding`
4. receive `edge_activation`
5. persist the issued reconnect credential locally
6. reconnect with `credentialMode = persistent`

## Scope boundaries

- Do not implement `go_core`, `rust_worker`, or new production runtime code here.
- Do not change cloud lifecycle semantics.
- Do not treat `edge_server/src` as authoritative; those files remain development examples only.
- Use existing test, script, and documentation entry points whenever possible.

## Recommended smoke flow

The recommended reproducible smoke uses existing repository oracles instead of a new orchestration script.

### Step 1. Run the cloud lifecycle oracle

From the repository root:

```powershell
cd cloud_server
cmd /c npm run test -- tests/integration/edge-onboarding.test.ts
```

This is the primary smoke flow for the onboarding contract. It already exercises the exact sequence needed for preflight:

1. register a new edge through `POST /api/edge-servers`
2. receive the one-time onboarding package disclosure
3. connect to `/edge` with `socket.handshake.auth = { edgeId, credentialMode: "onboarding", credentialSecret }`
4. receive `edge_activation`
5. reconnect with `credentialMode: "persistent"` and the issued secret
6. confirm no second `edge_activation` is emitted on ordinary persistent reconnect

Expected outcomes:

- onboarding succeeds exactly once per issued package
- the activation payload returns `lifecycleState = Active`
- a persistent reconnect credential is issued
- the same edge reconnects through the persistent path
- reused or invalid onboarding secrets are rejected with the documented `connect_error` codes

### Step 2. Run the local credential persistence oracle

From the repository root:

```powershell
cd client
cmd /c npm run test -- tests/unit/edgeActivationCredentialBehavior.test.ts
```

This step verifies the local persisted credential baseline used by `001-edge-runtime`:

- bootstrap prefers onboarding input only when no valid persisted credential exists
- `edge_activation` is transformed into canonical `credential.json`
- later bootstrap prefers the persisted reconnect record
- legacy onboarding-shaped or incomplete persisted records are rejected

### Step 3. Optional persistent-only telemetry comparator

Use this step only after the onboarding and reconnect smoke above is already green. It is not an onboarding smoke by itself.

From the repository root:

```powershell
cd cloud_server
cmd /c npm run seed:edge-telemetry-test
```

Then follow the existing persistent-only client instructions in:

- `edge_telemetry_test/README.md`

Purpose of this comparator:

- confirm the canonical `telemetry { readings[] }` payload is still accepted by cloud
- keep one small, existing client around for persistent reconnect and telemetry validation

Important limitation:

- `seed-edge-telemetry-test` creates or repairs an already `Active` edge with a persistent credential
- it does not cover first onboarding or `edge_activation`

## Manual interpretation of the smoke

If you need to replay the same flow by hand instead of through the existing tests, keep the sequence identical to the cloud oracle:

1. Register an edge through the existing Admin flow or `POST /api/edge-servers`.
2. Capture the disclosed onboarding package once.
3. Connect to `/edge` with `socket.handshake.auth` using `credentialMode = onboarding`.
4. Wait for `edge_activation`.
5. Persist `credential.json` using the canonical shape from `contracts/runtime-state-files.md`.
6. Reconnect with `credentialMode = persistent` and the issued secret.
7. Confirm the reconnect succeeds without a second activation event.

## MVP runtime defaults to keep during smoke preparation

Freeze these defaults in docs and future tests until runtime implementation work explicitly changes them:

| Setting | Default |
|---|---|
| `flushIntervalMs` | `1000` |
| `maxBatchReadings` | `100` |
| `backlogMaxReadings` | `1000` |
| `backlogOverflowBehavior` | `drop_oldest` |

Interpretation:

- These are runtime-local defaults, not cloud-side enforcement knobs.
- Overflow must be operator-visible.
- Retained backlog must stay chronologically ordered before replay.

## Runtime state file permission preflight

Before treating a host as ready for trusted runtime validation, confirm the local state directory can preserve the expected access profile for the machine-written files:

| File | Windows preflight expectation | POSIX fallback |
|---|---|---|
| `credential.json` | Runtime or service account plus local Administrators have Full Control. Broad Users access is not allowed. Explicit operator read access is optional and should exist only when local recovery procedures require it. | `0600` |
| `runtime-state.json` | Runtime or service account plus local Administrators have Full Control. Authorized local operators may have read-only access. | `0640` |
| `status.json` | Runtime or service account plus local Administrators have Full Control. Authorized local operators may have read-only access. | `0640` |

Suggested validation:

1. Run executable permission checks from the Go module root:

```powershell
cd edge_server/go_core
& 'C:\Program Files\Go\bin\go.exe' test ./internal/state -run TestVerifyRuntimeFilePermissions -count=1
```

2. On Windows, optionally inspect the same files with `icacls` to diagnose host ACL mismatches reported by the verifier.
3. On non-Windows hosts, optionally inspect fallback modes with `ls -l` when investigating verifier failures.
4. Confirm that `runtime-state.json` and `status.json` remain secret-free even when operators can read them.

## Existing repository references

- Cloud lifecycle oracle: `cloud_server/tests/integration/edge-onboarding.test.ts`
- Local credential persistence oracle: `client/tests/unit/edgeActivationCredentialBehavior.test.ts`
- Persistent-only telemetry seed: `cloud_server/src/scripts/seed-edge-telemetry-test.ts`
- Persistent-only telemetry client guide: `edge_telemetry_test/README.md`
- Cloud script entry points: `cloud_server/package.json`
- Consumer-facing runtime contract: `contracts/cloud-runtime-contract.md`
- Local runtime file contract: `contracts/runtime-state-files.md`

## What this quickstart does not prove

- It does not prove any Go or Rust implementation.
- It does not prove runtime-local batching, backlog replay, or overflow handling in code yet.
- It does not make `edge_server/src` mandatory to keep; those files are examples only.
