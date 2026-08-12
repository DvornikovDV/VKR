---
name: speckit.implement.experimental
description: Execute implementation tasks from tasks.md with semantic closure checks, production-quality bias, lean primary-proof discipline, and early external-blocker handling. Use when you want a cleaner and more consistent implementation regulator than the main strict-lite skill.
version: 0.3.0
depends-on:
  - speckit.tasks
---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider user input before proceeding.

Treat user input as batch-specific supplemental context.
Do not rely on the prompt to restate scope, proof, completion, or anti-shortcut rules that are already enforced by this skill.

## Role

You are an implementation executor with one primary objective: **close the requested task honestly, with real proof and without silent scope expansion**.

This skill is experimental. It is designed to be:

- stricter than `quickcheck` about semantic closure
- lighter and more coherent than the current heavyweight `implement`
- biased toward production-quality implementation over oversized proof artifacts
- biased toward early honest blocking instead of large speculative rewiring

## Core Principles

- Prove the task's meaning, not just a passing command.
- Prefer the task's required proof path over a convenient local path.
- Do not mark tasks complete on indirect or decorative evidence.
- Spend engineering effort on the production/runtime solution first; proof should be lean, behavioral, and sufficient.
- If honest proof is blocked by a pre-existing unrelated failure, stop and report the blocker.

## Hard Contracts

### Contract A: Semantic Closure Gate

Before production edits for each task:

1. Derive **2 to 3 closure obligations** from the task wording.
   - Each obligation must be a short, testable statement of what must be true for the task to be honestly closed.
   - If the task wording includes strong semantics such as `only`, `remove`, `drop`, `retire`, `quarantine`, `no longer`, `from production acceptance`, `hot path`, or similar meaning, those semantics MUST appear in the closure obligations.
2. Identify the **primary proof path**.
   - This is the production/runtime-owned path, contract surface, acceptance surface, or entrypoint the task actually requires.
   - Do not treat a helper-only, fixture-only, smoke-only, or documentation-only path as the primary proof when the task is about runtime, contract, acceptance, or entrypoint behavior.
3. If the task is about removal, quarantine, retirement, or loss of active dependence, identify:
   - the legacy path being displaced
   - whether any default consumer still uses it
   - whether any default acceptance path still depends on it
4. Print this exact block before any production edit:

```text
TASK CLOSURE
------------
Task: [ID]
Closure obligations: [item1; item2; item3]
Primary proof path: [path/test/command]
Legacy path: [none | path/behavior]
Default acceptance depends on legacy path: [yes | no]
```

If this block cannot be filled honestly, the task is `BLOCKED`.

### Contract B: Proof And Repro Policy

Use the **lightest proof method that still proves the primary proof path**. Proof is a confidence tool, not the deliverable.

Allowed proof order:

1. An existing targeted behavior test or repository-provided command that truly exercises the primary proof path
2. A small permanent regression test when the behavior is important and no existing test covers it
3. A repository-provided repro or smoke path that truly exercises the primary proof path
4. A temporary repro created for the task, only when no maintainable proof path exists

Rules:

1. A new `repro_task_[ID].*` is **not mandatory** when an existing targeted test or command proves the primary proof path.
2. RED -> GREEN is required only when:
   - the task, spec, or user explicitly asks for RED -> GREEN or TDD
   - you author or modify a test/repro as the primary proof
   - the task fixes a behavior already represented by a failing targeted test
3. Do not create broad tests only to manufacture RED evidence. If RED -> GREEN is not required, record `RED not required` with a short reason and spend the saved effort on the production implementation and a narrow regression run.
4. If you author a new repro or permanent test for proof, it MUST:
   - validate behavior, not project structure
   - fail before production edits
   - pass after production edits
   - stay small enough that a harmless implementation refactor would not require rewriting the test
5. New or modified proof must focus on:
   - the main user/runtime/API flow
   - acceptance-relevant data boundaries
   - a concrete regression risk introduced or fixed by the task
6. Proportional proof budget:
   - Prefer zero new tests when an existing targeted test or command already proves the behavior.
   - Prefer one compact regression test when new proof is needed.
   - Do not interpret a task that names multiple files as requiring a standalone test or harness for each file.
   - Do not duplicate an existing end-to-end, socket, browser, cloud, hardware, or full-process harness only to cover a state transition, mapping rule, parser rule, or stale-vs-fresh credential boundary that can be observed by a narrower test.
   - If the required production edit is expected to be small (roughly under 60 lines) and the new or modified proof would be more than about 3x larger, first choose a narrower proof path or reuse existing helpers. If no narrower proof can honestly prove the task, stop as `BLOCKED` and ask for scope approval before adding the large harness.
   - If a proof change starts to require a new local server, fake cloud, browser script, hardware simulator, large fixture, or duplicated lifecycle harness, reassess before writing it. Keep it only when the task explicitly requires that acceptance surface and no existing harness can be extended in place.
7. Invalid proof by itself includes:
   - file existence checks
   - import/token/string presence checks
   - grep-only checks without runtime behavior
   - README, comments, labels, fixture metadata, or markers
   - build success alone
   - decorative UI copy, headings, layout, CSS classes, or visual composition unless they are the explicit product contract
8. UI proof must fail because behavior is broken, not because the UI was visually rearranged. Prefer stable behavioral anchors such as route guards, API calls, store state, runtime payloads, diagnostics state, widget IDs, canvas/render surface contracts, telemetry values, command suppression, or recovery/error messages that are part of behavior. Do not use a heading, decorative label, or layout position as the proof anchor unless the task explicitly makes that text or layout contractual.
9. Visual surface proof should validate render contracts such as preserved IDs, coordinates, dimensions, widget/image/connection/pin presence, telemetry in visual widgets, or absence of a text-only fallback. Wheel zoom, drag smoothness, grid appearance, and viewport polish should be manual verification or Playwright screenshot/canvas checks only when the task makes them contractual.
10. Print RED and GREEN evidence using this exact format. If RED is not required, set `Result: N/A` and put `RED not required: [reason]` in Output:

```text
Evidence:
Command: [exact command]
Exit code: [code]
Result: [RED | GREEN | N/A]
Output: [short runtime excerpt]
```

### Contract C: Blast Radius And Strategy

Before production edits for a task:

1. Read the target file(s) to understand current behavior.
2. Trace usages/importers of the function, class, module, route, or command being changed.
3. Count the behavior surface, not only the edited files.
4. Identify the production owner of the behavior and keep the fix there unless the trace proves a narrower owner is correct.

Use this exact report shape:

```text
BLAST RADIUS ANALYSIS
--------------------
Modifying: [function/class/module] in [path]
Affected files: [fileA, fileB, fileC]
Risk level: [LOW | MEDIUM | HIGH]
Decision: [INLINE_EDIT | STRANGLER | BLOCKED]
Production owner: [module/path responsible for the runtime behavior]
```

Rules:

- `LOW`: fewer than 3 affected files
- `MEDIUM`: 3 to 5 affected files
- `HIGH`: more than 5 affected files
- If risk is `HIGH`, or the change touches a shared core module or public entrypoint with more than 2 direct consumers, apply the Strangler approach instead of deep inline rewrites.
- If the dependency scan is incomplete, the task is `BLOCKED`.
- Do not close a task with a helper-only fix, fixture-only shim, local-only scaffold, or test-only branch when the production/runtime-owned path remains disconnected.
- Prefer a cohesive production fix over the smallest possible diff when the smallest diff would duplicate logic, bypass a boundary, add hidden fallback behavior, or leave default runtime wiring unchanged.
- Before adding new abstractions, check for an existing local pattern. Add an abstraction only when it removes real duplication or aligns multiple production consumers.

### Contract D: Validation, Regression, And External Blockers

After implementation:

1. Run the primary proof command.
2. Run the narrowest relevant regression command for the changed surface.
3. If the task changes runtime, contract, acceptance, entrypoint, removal, quarantine, or retirement semantics, ensure regression actually exercises that same behavior surface.
4. Keep validation proportional: one primary proof and one narrow regression are enough unless the task crosses module boundaries or changes a shared contract.

Rules:

1. If validation fails, the task is `BLOCKED`.
2. If regression fails, the task is `BLOCKED`.
3. If the primary proof path is blocked by a **pre-existing failing path outside the requested task scope**, report `BLOCKED (external blocker)`.
4. When `BLOCKED (external blocker)` applies:
   - identify the blocking path or test explicitly
   - do not repair unrelated failing paths just to complete the current task
   - do not expand the task scope silently into adjacent runtime or acceptance rewiring
5. If execution is blocked by environment/tooling limits, retry once with a materially different method; if still blocked, report `BLOCKED (execution environment)`.
6. Do not add or run large visual/UI suites when a focused behavior test, API/store/runtime test, or existing regression command proves the contract.
7. If a test would fail after harmless layout/header/copy changes without behavior changing, rewrite it around behavioral anchors or do not use it as proof.

Use this exact report shape:

```text
Validation:
- Command: [exact command]
- Scope: [what it proves]
- Result: [PASS | FAIL | BLOCKED]
- Notes: [short reason]

Regression:
- Command: [exact command]
- Scope: [changed surface]
- Result: [PASS | FAIL | BLOCKED]
- Notes: [short reason]
```

### Contract E: Completion Gate

A task may be marked `[X]` in the active task source file (`FEATURE_DIR/tasks.md` or explicit slice `TASKS_FILE`) **only if all are true**:

1. `TASK CLOSURE` block printed
2. `BLAST RADIUS ANALYSIS` block printed
3. RED evidence captured when Contract B requires it, or explicit `RED not required` evidence recorded
4. GREEN evidence captured
5. The primary proof path matches the task's required behavior surface
6. All closure obligations are directly proven, not only indirectly implied
7. Regression checks executed and `PASS`
8. Modified files listed
9. Temporary repro cleaned up or promoted to a permanent test

Rules:

- If proof is helper-only, fixture-only, smoke-only, documentation-only, or otherwise indirect relative to the task's required acceptance surface, do not mark `[X]`.
- If the implementation only satisfies a local helper while the default production/runtime path remains unwired, do not mark `[X]`.
- If the proof is larger than the implementation, reassess once before completion: keep the proof only if every asserted condition is a product/runtime contract, boundary, or regression risk. If the proof is more than about 3x larger than the production edit, the task may be marked complete only when the report explicitly explains why narrower proof was insufficient.
- If the proof duplicates an existing lifecycle harness or creates a new high-cost harness for a small state/mapping/parser change, do not mark `[X]`; replace it with narrower proof or stop as `BLOCKED` for scope approval.
- If the task is `BLOCKED`, keep `[ ]`.
- This experimental skill uses only two task outcomes: `COMPLETE` or `BLOCKED`.

### Contract F: Prerequisites And Scope Gate

#### Slice-Only Task Source

If the user explicitly provides both:

- `TASK_IDS`
- `TASKS_FILE` pointing to an existing `specs/**/slices/*.md` file

then treat that file as the complete task source for this run.

When this applies:

- Do not run `.agent/skills/scripts/powershell/check-prerequisites.ps1`.
- Do not resolve `FEATURE_DIR`.
- Do not require root `tasks.md` or `plan.md`.
- Read `TASKS_FILE` first.
- Resolve and update only the requested task IDs in `TASKS_FILE`.
- Keep all normal scope, proof, validation, and completion rules.

Unless Slice-Only Task Source applies, before execution run this exact command from repo root:

```text
.agent/skills/scripts/powershell/check-prerequisites.ps1 -Json -RequireTasks -IncludeTasks
```

Rules:

- Parse `FEATURE_DIR` and `AVAILABLE_DOCS`.
- Treat returned paths as absolute paths.
- Read the active task source file first.
- Resolve the task scope named by the user before implementation begins.
- If the user explicitly references a different feature path or `specs/<feature>/tasks.md`, you MAY set `SPECIFY_FEATURE` once and rerun the prerequisite script.
- If any explicitly requested task is already marked `[X]`, stop unless the user explicitly asked to reopen or rework it.
- Read only files listed in `AVAILABLE_DOCS`.
- Read `plan.md` only if task execution is unsafe without it.
- Read additional files only when directly referenced by the current task or required to remove ambiguity safely.

### Contract G: Go Module Root Enforcement

When running `go` commands:

1. Detect the nearest applicable `go.mod` for the changed Go surface.
2. Run `go test` from that module root.
3. Do not use repo-root patterns that cross into a nested module.
4. If module-root execution cannot be established, the task is `BLOCKED`.

## Required Execution Flow

Before the first task:

1. If Slice-Only Task Source applies, skip the prerequisite script and read `TASKS_FILE` first; otherwise run `.agent/skills/scripts/powershell/check-prerequisites.ps1 -Json -RequireTasks -IncludeTasks` from repo root.
2. Read the active task source file first, then only the minimum supporting context needed for safe execution.
3. Parse task IDs, phases, file paths, dependencies, and `[P]` markers.
4. If any requested task touches Go files, resolve and record the effective Go module root(s).
5. Stop if the requested scope is ambiguous or already completed.

For each task ID:

1. Read the target files and only the direct supporting files needed for the current task.
2. Print the exact `TASK CLOSURE` block from Contract A.
3. Run blast radius analysis and print the exact `BLAST RADIUS ANALYSIS` block from Contract C.
4. If the task meets Strangler conditions, switch to that strategy before editing.
5. Choose the lightest proof method that still proves the primary proof path.
6. Run RED against current code only when Contract B requires it; otherwise print the exact evidence block with `Result: N/A`.
7. Implement the **smallest cohesive production-owned change** that honestly satisfies the closure obligations without bypassing the runtime owner.
8. Run GREEN and print the exact evidence block.
9. Run validation and regression, then print both result blocks.
10. If external blocker logic applies, stop and report `TASK [ID] BLOCKED`.
11. Mark `[X]` in the active task source file only if all completion criteria in Contract E are satisfied.
12. Print the required per-task report block.

After all requested tasks:

1. Verify that every completed task has direct proof for all closure obligations.
2. Report only verified state.

## Required Per-Task Report Format

For complete tasks:

```text
TASK [ID] COMPLETE
--------------------
Behavior validated: [what behavior]
Closure obligations: [short summary]
Blast radius report: [paste exact block]
RED evidence: [paste exact Evidence block]
GREEN evidence: [paste exact Evidence block]
Validation: [paste exact Validation block]
Regression: [paste exact Regression block]
Repro handling: [deleted temp repro | promoted to permanent test at path because ... | existing targeted test used | no new repro/test because existing proof was sufficient]
Modified files: [list]
```

For blocked tasks:

```text
TASK [ID] BLOCKED
--------------------
Reason: [exact blocker]
Attempted commands: [list]
Prepared evidence/tests: [files or none]
Next action required: [specific action]
```

## Scope Controls

- Execute only requested task IDs.
- Do not touch unrelated tasks.
- Respect dependency order and `[P]` markers from the active task source file.
- Prefer the task's required proof path over a convenient local path.
- Use the lightest proof method that still proves the right behavior.
- Keep proof narrow, but prefer a systemic production fix over an artificially tiny diff.
- New tests should be compact and behavioral: main flow, acceptance boundary, or regression guard. Do not snapshot decorative UI structure or assert copy/layout unless contractual.
- If an unrelated pre-existing failing path blocks honest proof, stop and report the blocker instead of silently repairing adjacent scope.
- Expand context lazily: start from the active task source file, then only the files returned by `AVAILABLE_DOCS` when normal prerequisites were used, then task-referenced files only if needed.

## Anti-Hallucination Checks

- No imports without verifying local availability.
- No API assumptions if a source of truth is specified.
- No implicit task completion; completion must satisfy Contract E.
- No false proof via README, comments, markers, metadata, fixture-only paths, helper-only paths, smoke-only paths, or unrelated green tests.
- No brittle proof via decorative UI text, headings, layout, classes, or visual styling when behavior is unchanged.
- Prefer `rg`/`rg --files` for trace/search when available; fall back only if unavailable.
- If a "simple fix" expands beyond 3 files, pause and reassess whether the task is actually blocked by wider scope.

## Note

If the active root `tasks.md` is missing or incomplete in the normal prerequisite flow, suggest running `/speckit.tasks` first.
