# Prompting Notes For Task Execution

## Purpose

This note explains how to write execution prompts that complement `tasks.md` and the selected workflow skill without duplicating them.

Use the prompt for batch-specific direction only.

Keep responsibilities clear:

- `tasks.md` defines scope, deliverables, target files, and acceptance
- the selected workflow skill defines execution discipline, validation rules, and completion gates
- the prompt adds only batch-specific risk, proof, and failure-avoidance context

## Responsibility Split

### Tasks Own

Tasks are the primary source of truth for implementation.

Tasks should carry:

- the concrete deliverable
- the target files
- the intended behavior
- the acceptance-relevant boundary conditions

Strengthen tasks by making those four elements clearer.
Do not use prompts to compensate for weak task wording when the task text itself should be improved.

### Workflow Skills Own

`speckit.implement.experimental` and `speckit.implement.quickcheck` already own the repeated execution rules.

That includes:

- scope control against requested task IDs
- task-order and dependency discipline
- required validation behavior
- completion criteria
- blocked-task handling
- anti-shortcut rules already built into the skill

Do not restate those in every prompt unless the batch needs a narrower rule than the skill already provides.

### Prompt Owns

The prompt should answer only the questions the task file and skill do not already answer:

- what makes this batch one coherent slice
- what behavior is easiest to fake incorrectly
- what proof path matters most for this batch
- what compatibility or invariants must survive this batch

## What Usually Does Not Belong In The Prompt

Avoid repeating generic instructions that the skill already enforces.

Typical prompt noise:

- "work only on the requested task IDs"
- "do not expand scope"
- "use the tasks file as the source of truth"
- "do not mark tasks complete without validation"
- "stop if blocked"
- "use RED -> GREEN" when `speckit.implement.experimental` already requires it

If those rules feel necessary in every prompt, fix the skill or task text instead of copying them again.

## What Usually Belongs In The Prompt

Prompt text is valuable when it is batch-specific.

High-value prompt additions:

- the one migration rule that matters for this batch
- the canonical shape or semantic invariant that must not drift
- the main proof path that should decide whether the batch is done
- the most likely fake-success path that must not count as completion

Examples:

- "Do not preserve backward compatibility with the retired onboarding model in active runtime paths."
- "Preserve `deviceId + metric` as the cloud-side catalog identity inside one `edgeId`."
- "Prove this batch through the real `/edge` socket path, not helper-level calls."
- "Do not satisfy lifecycle recovery by rebuilding state from scratch each time."

# Compact Batch Selection Rules

Batch is a connected behavior slice, not a group of nearby task IDs.

Before choosing tasks, define:

- behavior surface: what behavior changes
- production path: where the real app must use it
- proof path: what proves that real path
- main fake-success risk: how it could be falsely closed

Put tasks in one batch only if they share one main proof story.

Good batch traits:

- same production/runtime path
- same acceptance behavior
- same dependency stage
- same likely failure mode
- one validation path can prove the batch

Preferred batch shapes:

- proof task + implementation task for the same behavior
- fixture/model helper + test that consumes it through the intended path
- production wiring + integration proof through the production entrypoint
- recovery behavior + test proving the exact recovery state

Default size: 2-4 tasks.

Use 1 task for dependency changes, lockfiles, contracts, auth, transport, shared state, or broad blockers.

Use up to 5 only if all tasks are tightly chained and one proof path validates them.

Split the batch if:

- tasks need different production entrypoints
- tasks require unrelated proof paths
- one task can pass while another remains unproven
- implementation needs broad exploration across module boundaries
- a previous closed task must be reopened first
- the batch mixes model-only work with UI/runtime work without immediate proof linkage

If an implementation task can be falsely closed by partial wiring, helper-only proof, direct component-only proof, fixture-only proof, rebuild-instead-of-preserve, hidden fallback, hidden buffering/replay, silent loss, or boundary bypass, include a proof task in the same batch or strengthen the task first.

Pre-review each candidate batch:

- What does each task deliver?
- Which files are target files?
- Which production path must consume the result?
- Which proof path closes it?
- What shortcut must not count as success?

Batch prompt shape:

```text
Execute ( `.agent\workflows\07b-speckit.implement.experimental.md` \ `.agent\workflows\07a-speckit.implement.quickcheck.md` ) for the task batch in Scope.

Scope:
- TASK_IDS: <TASK_IDS>
- TASKS_FILE: <TASKS_FILE>

Batch-specific constraints:
- <one invariant to preserve>
- <one boundary not to bypass>

Main proof:
- <production/runtime path that must prove completion>

Do not count this as success:
- <most likely local-but-wrong shortcut>


## Skill Selection Heuristics

### Prefer `speckit.implement.experimental`

Use the stricter workflow when the batch changes:

- lifecycle or trust semantics
- authentication or authorization behavior
- realtime socket behavior
- destructive state transitions
- meaning-changing persistence or data-model semantics
- any surface where fake completion is a realistic risk

### Prefer `speckit.implement.quickcheck`

Use the lighter workflow when the batch is mainly:

- localized REST/controller/service alignment
- projection shaping
- narrow telemetry or catalog continuity work
- documentation and verification sync
- contract-following implementation where the main risk is omission, not semantic drift

Choose the skill based on the highest-risk task in the batch.

## Recommended Prompt Shape

Keep prompts short.

Use only these blocks when they add real value:

### Scope

- exact task IDs
- tasks file path

### Batch-Specific Constraints

- the one or two semantic rules that matter for this batch

### Main Proof

- the behavior path that should determine whether the batch is complete

### Do Not Count This As Success

- the most likely incorrect shortcut for this batch

## Minimal Prompt Template

```text
Execute `<WORKFLOW>` for the task batch in Scope.

Scope:
- TASK_IDS: <TASK_IDS>
- TASKS_FILE: <TASKS_FILE>

Batch-specific constraints:
- <semantic rule>
- <invariant to preserve>

Main proof:
- <the behavior path that must pass>

Do not count this as success:
- <most likely fake-success path>
```

## Practical Rule

If the prompt starts carrying generic execution discipline, it is too long.

If the prompt feels like the only thing preventing hacks, improve the tasks or the skill instead.
