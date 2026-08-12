# Contract: Local Runtime File Footprint For `006-edge-runtime-windows-mvp`

## Purpose

Define the intentionally small file footprint for `006-edge-runtime-windows-mvp`.

Unlike the earlier broad runtime direction, this MVP does not use machine-written local runtime files for reconnect credentials, runtime state, operator status, or backlog.

## Active Files In This MVP

### 1. `config.yaml`

Operator-owned stable configuration.

Contains:

- cloud URL and namespace
- telemetry batch settings
- source definitions
- logging level

Rules:

- Safe to keep across onboarding, revoke, block, and fresh onboarding.
- Does not contain cloud-issued persistent reconnect material.

### 2. Optional onboarding input artifact

The runtime may accept onboarding input from:

- a file such as `onboarding-package.json`
- environment variables
- direct process arguments

Rules:

- This is operator-supplied input, not machine-written runtime state.
- The runtime must not convert this into a long-lived machine-written credential file in this MVP.

## Files Explicitly Not Used In This MVP

The following files are out of scope for the narrow MVP:

- `credential.json`
- `runtime-state.json`
- `status.json`
- any backlog payload file

Consequences:

- no trusted reconnect across process restart
- no persisted operator-visible runtime status
- no file-level backlog invalidation logic

## Security Rules

- Runtime logs must never print full onboarding or persistent reconnect secrets.
- If operators choose to pass onboarding input through a file, that file remains external operator material, not runtime-managed state.
- Future persisted runtime files may be reintroduced only under a later scope decision.
