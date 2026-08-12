# Lifecycle State Machine

## Canonical states

| State | Meaning | Telemetry-ready | Accept onboarding package | Accept persistent reconnect |
|---|---|---|---|---|
| `Active` | Edge is registered and may connect with the current persistent credential | Yes | No | Yes |
| `Blocked` | Edge is intentionally denied trusted reconnects | No | No | No |

## Transition rules

| Trigger | From | To | Required side effects |
|---|---|---|---|
| Admin registers edge | none | `Active` | Issue first persistent credential, store credential hash, audit `registered` and `credential_issued` |
| Admin rotates credential | `Active` | `Active` | Replace persistent credential, disconnect active socket, audit `credential_rotated` |
| Admin blocks edge | `Active` | `Blocked` | Disconnect active socket and reject reconnects, audit `blocked` |
| Admin unblocks edge | `Blocked` | `Active` | Issue fresh persistent credential and audit `unblocked` |

## Guard rules (invalid transitions)

- `rotate-credential` is allowed only from `Active` (`409` otherwise).
- `unblock` is allowed only from `Blocked` (`409` otherwise).
- `block` returns `409` when already `Blocked`.

## Invariants

- Lifecycle state and runtime availability are separate axes.
- `Active` is the only telemetry-ready lifecycle state.
- A telemetry-ready `Active` edge must also hold a valid non-revoked persistent reconnect credential.
- Blocking overrides every credential path and forces active socket disconnect.
- On persistent auth rejection, lifecycle state does not change, but rejection remains audit-relevant.
- Telemetry and catalog identity inside one `edgeId` is `deviceId + metric`; `sourceId` is only Edge-local source configuration or legacy compatibility data and is not a Cloud/Client identity key.
