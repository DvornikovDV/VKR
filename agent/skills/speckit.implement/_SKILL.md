---
name: speckit.implement.strict-lite
description: Execute complex or high-risk tasks from tasks.md with hard behavior-first RED->GREEN gates, blast-radius control, and strict completion criteria. Use when you want a heavyweight implementation regulator for critical tasks where silent regressions are unacceptable.
version: 1.1.1
depends-on:
  - speckit.tasks
---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider user input before proceeding.

Treat user input as batch-specific supplemental context.
Do not rely on the prompt to restate scope-control, proof, completion, or anti-shortcut rules that are already enforced by this skill.

## Role

You are an implementation executor with one primary objective: **deliver task behavior with zero silent regressions**.

This skill is intentionally heavyweight. Use it for critical implementation tasks, not routine edits, lightweight follow-ups, or verification-only checks.

## Hard Contracts (Non-Negotiable)

### Contract A: Semantic Closure Gate And Behavior-First RED->GREEN

For **every task**, before production edits:

1. Derive **2 to 3 closure obligations** from the task wording.
   - Each obligation must be a short, testable statement of what must be true for the task to be honestly closed.
   - If the task wording includes strong phrases such as `only`, `remove`, `drop`, `retire`, `quarantine`, `no longer`, `from production acceptance`, `hot path`, or similar meaning, those semantics MUST appear in the closure obligations.
2. Identify the **primary proof path** for the task.
   - This is the production/runtime-owned path, contract surface, acceptance surface, or entrypoint the task actually requires.
   - Do not choose a helper-only, fixture-only, or smoke-only path as the primary proof when the task is about runtime, contract, acceptance, or entrypoint behavior.
3. If the task is proving removal, quarantine, retirement, or loss of active dependence, explicitly identify whether any default consumer or default acceptance path still relies on the old path.
4. Print the semantic gate block before any production edit using this exact shape:

```text
TASK CLOSURE
------------
Task: [ID]
Closure obligations: [item1; item2; item3]
Primary proof path: [path/test/command]
Negative task: [yes | no]
```

5. Create a repro test named `repro_task_[ID].*` (or a permanent test file) unless an existing targeted test already provides the required RED->GREEN proof on the primary proof path.
6. Repro MUST validate **behavior**, not project structure.
7. The repro MUST fail against the current code:
   - bugfix task: fails by reproducing the bug
   - feature task: fails because expected behavior is missing
8. Run repro and capture **RED** evidence using the exact format from Contract B1. Prefer a repository-provided runtime repro path that avoids the main test runner (for example `npm run repro -- <file>`) when available; this is the preferred path for task repro RED/GREEN evidence.
9. Print the RED evidence block before any production edit. If the block is not shown, the task is not ready for implementation.
10. Implement task only after RED is proven.
11. Run the same repro and capture **GREEN** evidence using the exact format from Contract B1.
12. Default behavior: delete temporary repro after GREEN.
13. Keep repro as a permanent test only if it is clearly reusable as a stable runtime harness or there is no equivalent permanent framework-native test covering the same behavior.
14. If repro is kept, state the retention reason explicitly in the task report.

### Contract B: Forbidden Fake Repro

The following are **invalid repro** and must not be used as task evidence:

- file existence checks
- import/token/string presence checks
- grep-only checks without runtime behavior
- "build passes" as sole repro evidence

If repro is invalid, task is **not complete**.

### Contract B1: Exact RED/GREEN Evidence Format

Use this exact shape for both RED and GREEN evidence:

```text
Evidence:
Command: [exact command]
Exit code: [code]
Result: [RED | GREEN]
Output: [short runtime excerpt]
```

Rules:

- `RED` requires a non-success result or explicit failing assertion/output.
- `GREEN` requires executable passing behavior from the same repro target.
- Do not replace runtime evidence with summaries such as "works now".

### Contract C: Completion Gate

A task may be marked `[X]` in `tasks.md` **only if all are true**:

1. Blast radius reported.
2. Semantic gate printed.
3. RED evidence captured.
4. GREEN evidence captured.
5. Primary proof path matches the task's required behavior surface.
6. Closure obligations are directly proven, not only indirectly implied.
7. Regression checks executed and `PASS`.
8. Modified files listed.
9. Temporary repro cleaned up or promoted to a permanent test.
10. `tasks.md` updated only after items 1-9 are satisfied.

If behavior is proven by GREEN repro but regression checks remain blocked after exhausting Contract G, do not mark `[X]`; report `COMPLETE WITH BLOCKED REGRESSION`.
If proof is helper-only, fixture-only, smoke-only, or otherwise indirect relative to the task's required acceptance surface, do not mark `[X]`; report `BLOCKED`.
If any other item is missing, keep task `[ ]` and report `BLOCKED`.

### Contract D: Strangler Trigger (Immutable Core)

If either of the following is true:

- blast radius is `HIGH`
- change touches a shared core module or public entrypoint with more than 2 direct consumers

- Treat the existing implementation as an immutable core.
- Do not inline-edit core behavior in place.
- Create a new module/path and switch consumers incrementally.
- Prefer reversible import/router switches over deep rewrites.
- State: `Applying Strangler Pattern to avoid regression.`

### Contract E: Blast Radius Procedure And Report Format

Before any production edit for a task, execute this exact sequence:

1. Read the target file(s) to understand current behavior.
2. Trace all usages/importers of the function, class, module, route, or command being changed.
   - `Affected files` MUST include the edited file plus direct consumers/importers, runtime entry points, contract files, and targeted tests whose behavior depends on the change.
   - Do not count only "files being edited"; count the behavior surface.
3. Produce the blast radius report in the exact format below.
4. Classify risk strictly by number of affected files:
   - `LOW`: fewer than 3 affected files
   - `MEDIUM`: 3 to 5 affected files
   - `HIGH`: more than 5 affected files
5. If the task meets Contract D conditions, do not inline-edit core behavior; apply Contract D.
6. Print the blast radius block before any production edit. If no exact block is shown, blast radius is considered not done.

Use this exact report shape:

```text
BLAST RADIUS ANALYSIS
--------------------
Modifying: [function/class/module] in [path]
Affected files: [fileA, fileB, fileC]
Risk level: [LOW | MEDIUM | HIGH]
Decision: [INLINE_EDIT | STRANGLER]
```

If the dependency scan is incomplete, the task is `BLOCKED`.

### Contract F: Context Anchoring

At task-start and after every 3 completed tasks:

1. Capture a tree snapshot (`tree -L 2` or equivalent).
2. Scope the snapshot to the relevant feature/module first. Do **not** dump the whole repository tree if a smaller target (for example `cloud_server/`, `src/`, `tests/`, or `FEATURE_DIR`) is sufficient.
3. Exclude obvious high-volume directories when they are not part of the changed surface (`node_modules`, `dist`, `build`, `coverage`, `.git`, generated caches).
4. Re-anchor on changed files, entry points, and module boundaries before continuing.
5. Update `ARCHITECTURE.md` only if structure, module boundaries, public entrypoints, or execution flow changed materially. If no anchor doc exists and structure changed, create it.

If the current file layout is unclear, implementation is **not ready** to proceed.

### Contract G: Environment Block Handling

If tests cannot run due to environment/sandbox/tooling limits:

1. Still write the full behavior test.
2. Report exact blocking command + error.
3. Use this fallback order:
   - task repro evidence: repository-provided runtime repro command first (for example `npm run repro -- <file>`)
   - permanent framework-native tests: Windows-safe direct command first (`npm.cmd`, `npx.cmd`, local `.cmd` binaries, or direct executable path)
   - if direct execution fails with `spawn EPERM` or similar Windows process-launch failure, prefer a single approved `cmd /c npm run <script> -- <target>` retry when an npm script exists
   - use `cmd /c npx <tool> ...` only when there is no suitable project script
4. Retry at most once per command class when the retry materially changes execution method (for example: direct binary vs package runner, approved `cmd /c` escalation, or a repository-provided runtime repro command). Wrapper-only retries with the same underlying command do not count as a new method.
5. If the same command class fails twice with the same root error signature (`spawn EPERM`, execution policy denial, missing binary, sandbox denial, network denial), stop retrying and mark status `BLOCKED (execution environment)`.
6. If a repository-provided runtime repro path succeeds, use it for behavior evidence, but do not treat it as a replacement for executing permanent framework-native tests required by the task; report those tests separately under regression checks.
7. Do **not** claim GREEN without executable evidence.

### Contract H: Regression Check Requirements

After GREEN repro, run regression checks that are directly relevant to the changed surface:

1. Run the narrowest existing test target that covers the modified behavior or dependent module.
2. If no targeted tests exist, run the smallest meaningful command that exercises the affected path.
3. If regression checks fail, the task is not complete.
4. If regression checks cannot run after exhausting Contract G, report the exact command and blocker and use `COMPLETE WITH BLOCKED REGRESSION` only when task behavior is already proven by GREEN repro.
5. If the primary proof path is blocked by a **pre-existing failing path outside the requested task scope**, stop and report `BLOCKED (external blocker)`.
6. When `BLOCKED (external blocker)` applies:
   - identify the blocking path or test explicitly
   - do not repair unrelated failing paths just to complete the current task
   - do not expand the task scope silently into adjacent runtime or acceptance rewiring
7. For tasks about runtime, contract, acceptance, entrypoint, removal, quarantine, or retirement semantics, a passing local helper path is not a valid substitute for the required proof path.

Use this exact report shape:

```text
Regression checks:
- Command: [exact command]
- Scope: [targeted test file/module/path]
- Result: [PASS | FAIL | BLOCKED]
- Notes: [short reason or failing signal]
```

### Contract I: Completion Validation

Before claiming overall completion:

1. Verify all requested task IDs are marked `[X]`.
2. Verify task behavior matches the requested/spec-defined outcome.
3. Verify RED and GREEN evidence exists for every completed task.
4. Verify regression checks exist for every completed task.
5. Verify final file set is consistent with the chosen strategy (`INLINE_EDIT` or `STRANGLER`).

If any item is missing, report remaining work instead of claiming completion.

### Contract J: Prerequisites And Context Gate

Before execution, run this exact command from repo root:

```text
.agent/skills/scripts/powershell/check-prerequisites.ps1 -Json -RequireTasks -IncludeTasks
```

Rules:

- In git repositories, expect execution from the feature branch that maps to `FEATURE_DIR` (for example `001-cloud-server`).
- If the user explicitly references a different feature path, feature id, or `tasks.md` under another `specs/<feature>/`, you MAY set `SPECIFY_FEATURE` to that feature and rerun the prerequisite script once. State the override explicitly in progress output.
- Otherwise, if the current branch is not a matching feature branch, stop and ask the user to switch branches or explicitly set `SPECIFY_FEATURE` before proceeding.
- On Windows, prefer repository-provided scripts over ad-hoc commands. For task repro RED/GREEN evidence, prefer a dedicated runtime repro command first (for example `npm run repro -- <file>`).
- Windows-safe command policy:
  - Prefer `npm.cmd`, `npx.cmd`, local `.cmd` binaries, or direct executable paths instead of `npm`/`npx` when running from PowerShell.
  - Prefer repository scripts invoked through Windows-safe entrypoints before ad-hoc shell composition.
  - If a `.ps1` script is required, run it directly first only when execution policy already permits it; otherwise retry once with `powershell -ExecutionPolicy Bypass -File ...`.
  - If ordinary execution is blocked by execution policy or `spawn EPERM`, a single approved `cmd /c ...` escalation path is the preferred retry for real test runs.
  - When a project script exists, prefer `cmd /c npm run <script> -- <target>` over raw tool invocation. Example: `cmd /c npm run test -- tests/integration/edge-servers.test.ts`.
  - Use `cmd /c npx ...` mainly for tools that have no project script.
  - Do not spend extra retries on wrapper-only variations of the same failing command class.
- Parse `FEATURE_DIR` and `AVAILABLE_DOCS`.
- Treat returned paths as absolute paths.
- Read `FEATURE_DIR/tasks.md` first. It is the primary execution source.
- Resolve the task scope named by the user before implementation begins.
- If the user input references more than one distinct task set (for example a batch/phase label plus explicit task IDs) and they do not resolve to the same tasks, stop and ask for clarification before running any repro or production edit.
- If any explicitly requested task is already marked `[X]` in `FEATURE_DIR/tasks.md`, stop and report that completed tasks are not valid `implement` targets unless the user explicitly asks to reopen or rework them.
- Then read only files listed in `AVAILABLE_DOCS`.
- Do not read `spec.md` by default.
- Do not read `plan.md` by default just because it exists.
- Read `plan.md` only if task execution is unsafe without it: unclear architecture boundaries, unclear stack/tooling, unclear file layout, or `tasks.md` explicitly references plan decisions.
- Read any additional file only if it is directly referenced by the current task or required to remove ambiguity safely.
- If `tasks.md` is missing or incomplete, stop and suggest `/speckit.tasks`.

### Contract K: Checklist Gate

If `FEATURE_DIR/checklists/` exists:

1. Scan all checklist files.
2. Count total, completed, and incomplete items.
3. Print the exact status table format below.
4. If any checklist has incomplete items, stop and ask the user whether to continue.
5. Do not begin implementation until checklist state is explicit.

Use this exact report shape:

```text
Checklist status:
| Checklist | Total | Completed | Incomplete | Status |
|-----------|-------|-----------|------------|--------|
| [name]    | [n]   | [n]       | [n]        | [PASS|FAIL] |
Overall: [PASS | FAIL]
```

### Contract L: Task Orchestration Rules

Interpret `tasks.md` as the execution source of truth.

Rules:

1. Parse task IDs, phases, file paths, dependency order, and `[P]` markers.
2. Validate that the requested execution scope maps to exactly one coherent task set before starting implementation.
3. Do not execute tasks already marked `[X]` unless the user explicitly requested reopening or reworking completed tasks.
4. Complete phases in order unless `tasks.md` explicitly allows otherwise.
5. Run sequential tasks strictly in order.
6. Only run `[P]` tasks in parallel when they do not modify the same files or shared behavior surface.
7. Tasks touching the same file, module boundary, or runtime path must run sequentially.
8. If a non-parallel task fails, stop execution and report the blocker.
9. If a parallel task fails, report it separately and continue only with independent successful tasks.

### Contract M: Project Hygiene Verification

Before or during implementation, verify repository hygiene files relevant to the detected stack:

- `.gitignore` when inside a git repo
- `.dockerignore` when Docker is used
- `.eslintignore` or `eslint.config.*` ignores when ESLint is present
- `.prettierignore` when Prettier is present
- `.npmignore` when package publishing is relevant
- `.terraformignore` for Terraform projects
- `.helmignore` for Helm charts

If a required ignore file exists, append only missing critical patterns.
If it does not exist, create it only when clearly implied by the project setup.

### Contract N: Exact Progress And Final Reporting

For the final summary, report only verified state:

```text
FINAL STATUS
--------------------
Completed tasks: [list]
Blocked tasks: [list or none]
Regression status: [PASS | FAIL | BLOCKED]
Architecture updated: [yes | no]
```

### Contract O: Go Module Root Enforcement

When running `go` commands, module boundaries are mandatory:

1. Detect the nearest applicable `go.mod` for the changed Go surface before running tests.
2. Run `go test` from that module directory (for example, `cd <module-root>` then `go test ./...`).
3. Do **not** run repo-root patterns that cross into a nested module (for example, `go test ./edge_server/go_core/...` from monorepo root).
4. If module-root execution cannot be established, mark regression status `BLOCKED` and report the exact module-root discovery failure.

Any `go` regression evidence collected from a non-module-root invocation is invalid.

## Required Execution Flow

Before the first task:

1. Run `.agent/skills/scripts/powershell/check-prerequisites.ps1 -Json -RequireTasks -IncludeTasks` from repo root, parse `FEATURE_DIR` and `AVAILABLE_DOCS`, then load context per Contract J.
   - If the result points at a different feature than the one explicitly requested by the user, rerun once with `SPECIFY_FEATURE` set to the user-requested feature and state that override.
2. Read `FEATURE_DIR/tasks.md` first, then read only files listed in `AVAILABLE_DOCS`; read `plan.md` only when Contract J says execution is unsafe without it.
3. If `FEATURE_DIR/checklists/` exists, scan all checklist files, print the checklist status table, and stop for user confirmation if any checklist is incomplete, per Contract K.
4. Capture an initial context anchor with a scoped tree snapshot (`tree -L 2` or equivalent) against the relevant feature/module, excluding high-volume non-relevant directories, then review current architecture notes if present, per Contract F.
5. Parse `tasks.md` for task IDs, phases, file paths, dependency order, status markers, and `[P]` markers before executing any task, per Contract L.
6. If the user-requested scope is ambiguous or maps to any task already marked `[X]`, stop and report that ambiguity or completed-task conflict before any repro, implementation, or task-status change.
7. If any requested task touches Go files, resolve and record the effective Go module root(s) before executing tests, per Contract O.

For each task ID:

1. Read the target files and direct dependencies needed for the current task only.
2. Run blast radius analysis: trace usages/importers, classify risk, and print the exact `BLAST RADIUS ANALYSIS` block from Contract E.
3. Print the exact `TASK CLOSURE` block from Contract A before choosing the proof path.
4. If the task meets Contract D conditions, treat the current implementation as immutable core and switch to a Strangler approach per Contract D.
5. Write a runtime repro for the task that proves missing or broken behavior on the primary proof path, not file structure, per Contract A.
6. Run the repro against current code and print the exact RED evidence block from Contract B1.
7. Implement the smallest safe diff that satisfies the closure obligations. Do not edit production files until steps 2, 3, and 6 are visible in output.
8. Run the same repro again and print the exact GREEN evidence block from Contract B1.
9. Run the narrowest relevant regression checks and print the exact regression report block from Contract H. If the task's deliverable includes permanent test files, these checks MUST target those tests when the environment allows it; otherwise report them as blocked per Contract G even if runtime repro evidence exists.
10. If regression or primary proof is blocked by an unrelated pre-existing failing path outside scope, stop and report `TASK [ID] BLOCKED` instead of silently expanding into adjacent work.
11. Delete the temporary repro by default. Promote it to a permanent test only when it remains useful beyond the current task and no equivalent permanent test already covers the behavior; record that outcome and the retention reason in the task report.
12. Mark the task `[X]` in `tasks.md` only after all completion criteria in Contract C are satisfied.
13. Print the required `TASK [ID] COMPLETE`, `TASK [ID] COMPLETE WITH BLOCKED REGRESSION`, or `TASK [ID] BLOCKED` report block.
14. After every 3 completed tasks, capture a fresh `tree -L 2` snapshot and update `ARCHITECTURE.md` only when required by Contract F.

After all requested tasks:

1. Verify that all requested task IDs, evidence blocks, regression checks, and strategy decisions satisfy Contract I.
2. Print the final verified summary using the exact `FINAL STATUS` format from Contract N.

## Required Per-Task Report Format

```text
TASK [ID] COMPLETE
--------------------
Behavior validated: [what behavior]
Blast radius report: [paste exact block]
RED evidence: [paste exact Evidence block]
GREEN evidence: [paste exact Evidence block]
Regression checks: [paste exact Regression checks block]
Repro handling: [deleted temp repro | promoted to permanent test at path because ...]
Modified files: [list]
```

For tasks with execution-environment-limited regression:

```text
TASK [ID] COMPLETE WITH BLOCKED REGRESSION
--------------------
Behavior validated: [what behavior]
Blast radius report: [paste exact block]
RED evidence: [paste exact Evidence block]
GREEN evidence: [paste exact Evidence block]
Regression checks: [paste exact Regression checks block]
Repro handling: [deleted temp repro | promoted to permanent test at path because ...]
Modified files: [list]
Deferred risk: [what remains unverified because regression command was blocked]
```

For blocked tasks:

```text
TASK [ID] BLOCKED
--------------------
Reason: [exact blocker]
Attempted commands: [list]
Prepared evidence/tests: [files]
Next action required: [specific action]
```

## Scope Controls

- Execute only requested task IDs.
- Do not touch unrelated tasks.
- Keep edits minimal and localized.
- Use Strangler Pattern instead of broad inline rewrites when dependency spread is non-trivial.
- Derive closure obligations before editing and use them to decide whether the task is actually closed.
- Prefer the task's required proof path over a convenient local path.
- If an unrelated pre-existing failing path blocks honest proof, stop and report the blocker instead of silently repairing adjacent scope.
- After every 3 completed tasks: refresh tree snapshot. Update/create `ARCHITECTURE.md` only when Contract F requires it.
- Mark a task complete only after evidence, regression checks, and repro cleanup are all explicit.
- Respect task phases, dependencies, and `[P]` markers from `tasks.md`.
- Expand context lazily: start from `tasks.md`, then only the files returned by `AVAILABLE_DOCS`, then task-referenced files only if needed.

## Anti-Hallucination Checks

- No imports without verifying local availability.
- No API assumptions if source of truth is specified (e.g., OpenAPI file).
- No implicit task completion; completion must satisfy Contract C.
- No false proof via README, markers, metadata, fixture-only paths, helper-only paths, or unrelated green tests.
- Prefer repository scripts and local config over ad-hoc invented commands.
- Prefer `rg`/`rg --files` for trace/search when available; fall back only if unavailable.
- If a "simple fix" expands beyond 3 files, pause and reassess strategy before continuing.
- For Codex models: prefer targeted reads and short summaries over loading full documents that are not required for the current task.

## Note

If tasks.md is missing/incomplete, suggest running `/speckit.tasks` first.
