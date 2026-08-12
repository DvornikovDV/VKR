# AGENTS.md - Repository Rules for VKR SCADA Monorepo

## Scope

These instructions apply to the whole repository. More specific `AGENTS.md` files refine the rules for their subtree.

## Active Architecture

- `/client`: React SPA shell for the public zone, Admin Hub, User Hub, and the only product Dashboard.
- `client\src\features\dashboard`: SPA-native Dashboard feature inside `client`.
- `/constructor`: Diagram and binding authoring module.
- `/cloud_server`: Cloud backend for auth, storage, aggregation, and runtime signals.
- `/edge_server`: Local controller that talks to industrial devices and forwards telemetry.

## Communication & Writing Rules

- Always answer the user in Russian.
- When using an English term in explanations, add a Russian gloss or translation at least once nearby.
- Documentation files must be written in English unless the user explicitly requests otherwise.
- Code, identifiers, and code comments must be written in English.

## Non-Negotiable Rules

1. Keep module boundaries strict. Reuse code across modules only through an API or a package.
2. Do not introduce global state through `window.*` or `global.*`, except for short-lived local debugging that is clearly isolated.
3. Never hardcode secrets, tokens, credentials, URLs, or IP addresses. Use environment variables or configuration.
4. If a file is not yet open, locate it in the repository and read it before changing behavior that depends on it.
5. Do not put AI-maintenance notes, `.gitignore` details, or local machine notes into README files.
6. Do not read `Note.md` files.
7. Use Windows-compatible shell commands only.
8. If a `SKILL.md`, script, or repo instruction provides an exact command to run, execute it as written unless there is a clear safety issue.

## Working Style

- Prefer small, surgical changes over broad rewrites.
- Keep each module autonomous.
- Before editing a subtree, read the nearest local `AGENTS.md` and `FILE_MAP.md` if present.
- Preserve existing architecture and naming unless the task explicitly asks for refactoring.
- Treat `specs/**/tasks.md` as local planning artifacts for a solo + AI-agent workflow; keep them untracked in git unless explicitly requested otherwise.
- Prefer one cohesive batch patch when requested tasks touch the same behavior surface.
- Before writing documentation or another substantial text block, prepare the complete intended block first, then apply it in one patch instead of editing it line by line.

## Windows Sandbox Recovery

- After a confirmed Windows sandbox failure, use `require_escalated` for safe repository-local read, search, diff, format, and test commands instead of repeatedly retrying them in the sandbox.
- Treat destructive commands, network access, dependency installation, reset operations, and writes outside the repository as separate actions that require explicit approval.
- Do not use sandbox recovery as justification to broaden command scope or bypass approval for unrelated operations.

## Validation Rules

- Validate system behavior, business rules, data integrity, contracts, concurrency, persistence, and runtime lifecycle with automated tests.
- Validate visual UI qualities manually, including appearance, layout, spacing, copy presentation, canvas rendering quality, and interaction feel.
- Do not add automated tests that assert decorative UI structure or styling when the underlying behavior is unchanged.
- UI-facing automated tests are appropriate only when they prove non-visual behavior such as routing, submitted payloads, state transitions, permissions, error handling, or API orchestration.
- Do not replace a focused deterministic behavior test with a browser-driven end-to-end flow that depends on login, seeded accounts, timing, or unrelated services.
- Do not automate a manual browser smoke merely to reproduce actions that are more reliably and directly verified by behavioral tests; keep browser smoke focused on visual and human interaction checks.

## Local AGENTS.md Paths

Read the nearest applicable file before editing code in that area:

- `/client/AGENTS.md`
- `/client/src/features/dashboard/AGENTS.md`
- `/constructor/AGENTS.md`
- `/cloud_server/AGENTS.md`
- `/edge_server/AGENTS.md`
