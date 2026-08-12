# Contract: Local Runtime Files

## Purpose

Define the local file-level contract owned by the future edge runtime so operators can keep stable source definitions separate from rotated credentials and runtime-generated status.

## File set

### 1. `config.yaml`

Operator-owned stable configuration.

Contains:

- cloud target and reconnect policy
- source definitions
- adapter mode and optional worker endpoint
- logging settings
- telemetry batching and backlog settings

MVP default settings to freeze for the first Go runtime baseline:

| Key | Default |
|---|---|
| `batch.intervalMs` | `1000` |
| `batch.maxReadings` | `100` |
| `backlog.maxReadings` | `1000` |
| `backlog.overflowBehavior` | `drop_oldest` |

Rules:

- Safe to keep across onboarding, reconnect rotation, block, re-enable, and re-onboarding.
- Does not store rotated reconnect credentials.
- Defaults are runtime-local startup values, not cloud-enforced limits.

### 2. `credential.json`

Machine-written persisted reconnect state.

Canonical MVP shape:

```json
{
  "edgeId": "507f1f77bcf86cd799439011",
  "credentialMode": "persistent",
  "credentialSecret": "plain-text-secret-issued-once",
  "version": 2,
  "issuedAt": "2026-04-05T10:00:00.000Z",
  "lifecycleState": "Active"
}
```

Contains:

- `edgeId`
- `credentialMode = persistent`
- `credentialSecret`
- `version`
- `issuedAt`
- `lifecycleState = Active`

Rules:

- Replaced atomically after a successful onboarding or re-onboarding activation.
- Replaced when a newer persistent credential is issued.
- Must not persist onboarding-mode records as the steady-state file contract.
- Missing, corrupt, partial, or legacy onboarding-shaped records must force an untrusted recovery path rather than optimistic trusted behavior.

### 3. `runtime-state.json`

Machine-written persistent runtime outcome state.

Contains:

- trust or readiness mode
- last operator-visible outcome
- last cloud rejection code
- last disconnect reason
- last trusted session timestamp
- last telemetry timestamp
- current backlog size
- latest backlog overflow outcome, if any
- source config revision
- active adapter mode

Rules:

- Persists across restart.
- Must not contain secrets.
- Records why the runtime is blocked, recovery-needed, or awaiting re-onboarding.
- Should record when backlog overflow has occurred, but not the dropped payload itself.

### 4. `status.json`

Optional machine-written operator snapshot.

Contains:

- current trust mode
- cloud connection state
- adapter state
- backlog size
- last visible reason
- last update timestamp

Rules:

- Exists for minimal local support only.
- Never becomes the source of lifecycle truth.
- Must not contain onboarding or reconnect secrets.
- May expose backlog overflow as an operator-visible reason or status flag, but not the discarded readings themselves.

## Write rules

- Machine-written files should be replaced atomically to avoid partial writes.
- The runtime must tolerate missing files and treat them as first-run or recovery scenarios when appropriate.
- Corrupt credential or runtime state files must force an untrusted recovery path rather than optimistic trusted behavior.
- Overflow handling for in-memory backlog does not require extra payload files; only the operator-visible outcome must persist.

## Security rules

- Ordinary filesystem permissions are sufficient for MVP.
- Secrets must appear only in `credential.json` and transient operator onboarding input.
- Logs and `status.json` must redact or omit all full secrets.
- The Go runtime provides explicit permission verification in `edge_server/go_core/internal/state/file_permissions.go`.

## Windows-first permission expectations

The MVP runtime does not rewrite NTFS ACLs directly. It defines the expected host-level access profile and verifies it through `VerifyRuntimeFilePermissions(...)` using Windows security descriptor APIs (self-relative SD + DACL inspection by SID) on Windows.

| File | Windows expectation | POSIX fallback |
|---|---|---|
| `credential.json` | Full Control: runtime or service account plus local Administrators. Read-only: explicitly authorized operators only when recovery work requires it. Never grant broad Users access. | `0600` |
| `runtime-state.json` | Full Control: runtime or service account plus local Administrators. Read-only: authorized local operators for diagnostics and recovery decisions. | `0640` |
| `status.json` | Full Control: runtime or service account plus local Administrators. Read-only: authorized local operators for minimal local support. | `0640` |

Rules:

- `credential.json` is the most sensitive runtime-local file because it contains the persistent reconnect secret.
- `runtime-state.json` and `status.json` must stay secret-free even though they may be readable by authorized operators.
- On non-Windows hosts, the runtime applies and verifies the listed POSIX fallback mode after atomic replace.
- On Windows hosts, ACL verification is executable and testable through the runtime permission verifier, while ACL assignment remains an installation concern.
