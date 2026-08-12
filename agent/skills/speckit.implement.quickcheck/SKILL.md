---
name: speckit.implement.quickcheck
description: Implement requested tasks from tasks.md with lightweight validation and automatic task checkoff. Use when you want more trust than a plain implementation run, but do not need the heavyweight RED-GREEN protocol of speckit.implement.
version: 1.0.0
depends-on:
  - speckit.tasks
---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider user input before proceeding.

Treat user input as batch-specific supplemental context.
Do not rely on the prompt to restate scope-control, validation, completion, or anti-shortcut rules that are already enforced by this skill.

## Role

You are an implementation executor for medium-risk task batches.

Primary objective: implement the requested tasks with minimal ceremony, but do not ask the user to trust the result blindly.

This skill is intentionally lighter than `speckit.implement`:

- no mandatory RED -> GREEN repro for every task
- no mandatory blast-radius report block
- no mandatory checklist gate
- no mandatory architecture refresh cadence

But it is still a guarded mode:

- validate changed behavior with an executable command
- do not mark tasks complete if validation is blocked or failing
- update the active task source file automatically when requested tasks are truly done

## Execution Rules

### 1. Prerequisites

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
- Keep all normal scope, validation, and completion rules.

Unless Slice-Only Task Source applies, before execution run from repo root:

```text
.agent/skills/scripts/powershell/check-prerequisites.ps1 -Json -RequireTasks -IncludeTasks
```

Rules:

- If the user explicitly names a different feature path or `specs/<feature>/tasks.md`, you MAY set `SPECIFY_FEATURE` once and rerun the prerequisite script.
- Read the active task source file first.
- Then read only the minimum directly relevant docs from `AVAILABLE_DOCS`.
- Read `plan.md` only if needed to safely understand architecture or file layout.

### 2. Scope

- Execute only the requested task IDs.
- Respect task dependencies and phase order.
- Parallelize only `[P]` tasks that do not touch the same files or behavior surface.
- Keep edits minimal and localized.

### 3. Context Gathering

For each requested batch:

1. Read the target files from the active task source file.
2. Read only the direct supporting files needed to implement safely.
3. If a module has a local `AGENTS.md` or `FILE_MAP.md`, follow it.

### 4. Validation Minimum

After implementation, run at least one executable validation command that exercises the changed behavior.

Preferred order:

1. Narrowest existing targeted test for the changed behavior
2. Repository-provided repro or smoke command for the changed behavior
3. Small focused temporary repro only if no meaningful existing command exists

Rules:

- Validation must be behavioral, not a grep/file-existence check.
- Prefer the smallest command that proves the changed behavior works.
- If validation fails, do not mark tasks complete.
- If validation is blocked by environment/tooling, retry once with a materially different Windows-safe method when appropriate.
- If still blocked, report `BLOCKED (validation environment)` and keep tasks unchecked.

### 5. Task Completion

Mark requested tasks as `[X]` in the active task source file (`FEATURE_DIR/tasks.md` or explicit slice `TASKS_FILE`) only if:

1. implementation is done
2. validation command passed
3. modified files are known

If validation is blocked or failing, leave the tasks as `[ ]`.

### 6. Reporting

Keep reports concise and factual.

Use this shape:

```text
QUICKCHECK RESULT
--------------------
Completed tasks: [list]
Blocked tasks: [list or none]
Validation:
- Command: [exact command]
- Scope: [what it covered]
- Result: [PASS | FAIL | BLOCKED]
- Notes: [short reason]
Modified files: [list]
```

If multiple distinct validations were needed, list them all under `Validation`.

## Workflow

1. If Slice-Only Task Source applies, read `TASKS_FILE` directly; otherwise run prerequisites and resolve the correct feature.
2. Read the active task source file and only the minimal supporting context.
3. Implement the requested tasks in dependency order.
4. Run focused validation.
5. Update the active task source file for passed tasks only.
6. Print the concise result block.

## Notes

- Use this skill for medium-complexity task batches where you want automatic task checkoff plus a real validation signal.
- Use `speckit.implement` instead when regressions would be expensive and you want strict RED -> GREEN discipline.
