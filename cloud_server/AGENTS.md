# AGENTS.md - Module `/cloud_server`

## Scope
These instructions apply to everything under `/cloud_server`.

## Module Role
`/cloud_server` is the cloud backend for authentication, RBAC, diagram CRUD, version storage, aggregation, and realtime routing.

## Architecture
- Layered Express application
- Expected flow: Routes -> Controllers -> Services -> Models
- Realtime routing uses Socket.IO rooms, typically grouped by `edgeId`

## Technology Stack
- Node.js 20+
- Express
- TypeScript
- MongoDB + Mongoose
- REST API + Socket.IO
- JWT + bcrypt
- Vitest

## Data Rules
- Telemetry is stored in a time-series collection with TTL retention when that mechanism is in use.
- Secrets must come from environment variables or configuration, not source code.

## Required Rules
1. Keep REST logic and WebSocket logic well isolated even when they operate on related domain data.
2. Avoid global mutable state except for connection/session registries that are truly process-wide.
3. Preserve RBAC boundaries between admin and subscription/user flows.
4. When changing the OpenAPI contract, lint `openapi.yaml` with `npx @redocly/cli lint openapi.yaml`.

## Navigation
- Use the local `FILE_MAP.md` when available.

