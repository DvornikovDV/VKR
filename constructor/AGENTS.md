# AGENTS.md - Module `/constructor`

## Scope
These instructions apply to everything under `/constructor`.

## Module Role
`/constructor` is the mnemonic diagram editor.

## Architecture
Pattern: Coordinator / Mediator.

Rules:
- `UIController` is the central coordinator and is responsible for instantiating managers.
- Managers such as `ImageManager` and `ConnectionManager` must not call each other directly.
- Cross-manager interaction should flow through events or callbacks managed by `UIController`.
- Keep class boundaries clear: one class per file unless there is a strong reason not to.

## Technology Stack
- Vanilla JS with ES modules
- Konva.js for canvas rendering
- Vanilla CSS

## Data
- Diagram generation relies on JSON structures such as `devices-registry.json`.

## Forbidden
- React, Vue, Angular, or Tailwind inside this module
- Heavy UI libraries without explicit approval
- Direct manager-to-manager orchestration that bypasses the coordinator

## Navigation
- Read `FILE_MAP.md` for detailed module structure before larger edits.

