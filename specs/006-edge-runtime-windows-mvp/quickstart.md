# Quickstart: Windows Narrow MVP Delivery Slice For `001-edge-runtime`

## Goal

Validate the `006-edge-runtime-windows-mvp` delivery slice on Windows as the minimal working implementation subset of `001-edge-runtime`:

1. register edge
2. connect with a valid onboarding package
3. receive `edge_activation`
4. emit first canonical telemetry
5. stop telemetry on trust or session loss
6. recover through fresh onboarding when required

## Scope Boundaries

- Windows only
- no machine-written runtime state files
- no telemetry backlog or replay
- no external Rust worker in this flow

## Preconditions

- `cloud_server` test environment is runnable
- the edge runtime has a valid Windows config
- a valid onboarding package can be supplied to the runtime at start

## Step 1. Run the cloud lifecycle oracle

From the repository root:

```powershell
cd cloud_server
cmd /c npm run test -- tests/integration/edge-onboarding.test.ts
```

This remains the primary lifecycle oracle for:

- onboarding acceptance
- `edge_activation`
- persistent reconnect eligibility
- revoke, block, re-enable, and reset behavior
- forced disconnect reasons

## Step 2. Run Go runtime contract and integration tests

From the repository root:

```powershell
cd edge_server\go_core
& 'C:\Program Files\Go\bin\go.exe' test ./... -count=1
```

The Windows MVP acceptance set should prove:

- onboarding works from supplied operator input
- same-process reconnect works after transient disconnect
- fresh process start is untrusted until onboarding succeeds again
- canonical telemetry batches are emitted only while trusted and connected
- revoke, block, forced disconnect, rejected reconnect, and ordinary socket disconnect stop telemetry immediately

## Step 3. Prepare the runtime inputs

Required runtime inputs:

- `config.yaml` with cloud URL, batch settings, and source definitions
- onboarding package input for the edge being validated

In this MVP:

- the runtime may accept onboarding input from a file, CLI flag, or environment variable
- the runtime does not create `credential.json`, `runtime-state.json`, or `status.json`

## Step 4. Start the runtime and obtain the first trusted session

Start the Windows runtime with:

- valid cloud target
- valid onboarding package
- at least one enabled local source

Expected outcomes:

1. the runtime connects to `/edge` with `credentialMode = onboarding`
2. cloud accepts the handshake
3. the runtime receives `edge_activation`
4. the runtime stores the returned persistent credential in memory only
5. the runtime becomes allowed to emit telemetry

## Step 5. Observe first accepted telemetry

Expected outcomes:

- the runtime emits canonical `telemetry { readings[] }`
- cloud accepts the readings
- the payload may contain multiple devices and multiple metrics per device

MVP runtime defaults:

| Setting | Default |
|---|---|
| `batch.intervalMs` | `1000` |
| `batch.maxReadings` | `100` |

## Step 6. Validate stop conditions

While the runtime is trusted and emitting telemetry, validate:

1. `edge_disconnect` with `trust_revoked`
2. `edge_disconnect` with `blocked`
3. `edge_disconnect` with `edge_forced_disconnect`
4. rejected reconnect using invalid or revoked persistent credentials
5. ordinary socket disconnect without a preceding lifecycle event

Expected outcome for every case:

- trusted telemetry stops immediately
- new local readings are dropped while the runtime is disconnected or untrusted

## Step 7. Validate recovery

Recovery path in this MVP:

1. cloud-side admin flow re-enables onboarding when appropriate
2. admin issues or resets a fresh onboarding package when required
3. the runtime receives that new onboarding input
4. onboarding succeeds again
5. telemetry resumes only after trusted session restoration

## What This Quickstart Does Not Prove

- trusted reconnect across process restart
- local runtime-state files
- backlog, replay, or overflow handling
- external Rust worker behavior
- Linux deployment behavior
