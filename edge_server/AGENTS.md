# AGENTS.md - Module `/edge_server`

## Scope
These instructions apply to everything under `/edge_server`.

## Module Role
`/edge_server` polls or subscribes to physical equipment, preprocesses telemetry, buffers it when needed, and forwards it to `/cloud_server` or runtime consumers.

## Architecture
- Polling services / actor-style components
- Focus on industrial protocol integration and reliable data movement

## Technology Direction
- Use technology choices that fit local edge execution, hardware/protocol access, and future Windows/Linux deployment needs
- Prefer explicit runtime or process boundaries when separating hardware-facing components from cloud-facing edge runtime concerns
- Work with ports, binary payloads, and industrial protocols such as Modbus or OPC UA

## Required Rules
1. Keep device communication concerns isolated from cloud business logic.
2. Treat transport reliability, buffering, and preprocessing as first-class concerns.
3. Make protocol adapters explicit and easy to reason about.
4. Prefer hardware-facing abstractions that can be replaced or extended without redesigning the full edge runtime.
5. When multiple local components are used, integrate them through explicit contracts or IPC rather than implicit shared runtime state.

## Forbidden
- Moving auth or analytics responsibilities here if they belong to `/cloud_server`
- Mixing cloud domain logic directly into device polling code

## Navigation
- Use the local `FILE_MAP.md` when it becomes available.
