# Slice Planning Guide

## Scope

This document applies to preparing planning prompts for implementation slices.

It is a practical guide for humans and AI agents who need to launch slice planning in a new dialog with stable quality and repeatable results.

## Goal

Use this document to prepare three things in the correct order:

1. the shared planning prompt;
2. the slice-specific `Input Pack`;
3. the slice description that can be used to draft the `Input Pack`.

The shared prompt stays stable. The `Input Pack` changes per slice. The slice description is the raw material used to build the `Input Pack`.

## 1. Shared Planning Prompt

Use the following workflow when starting planning for a new slice:

```text
Prepare a slice implementation plan for <slice name>.

Work strictly by stages and do not move to the next stage without explicit user confirmation.

This is a workflow prompt for preparing a concrete `plan_<slice>.md`. It should help the agent collect a high-quality slice plan, but it must not duplicate the full rules from `doc/doc_writing.md`, `.agent/workflows/05-speckit.tasks.md`, or `doc/prompt.md`. Read and apply those files at the relevant stages.

Context:
- The project is under strict MVP time constraints.
- `doc_cursed` is the source of truth for architecture and contracts.
- The plan must work even for a slice that starts from scratch. If no similar slice plan exists, recover facts from docs/code and explicitly mark assumptions.
- Lean Testing Policy: do not generate huge table-driven tests for every validation case. Plan the main happy path and at most one critical negative scenario for the main slice risk. Complex edge checks belong in manual smoke or hardware smoke.
- Lean Testing limits proof/test volume only; it does not allow vague implementation tasks. Tasks must remain concrete, verifiable, and tied to file paths.

Input Pack for the concrete slice:
- slice name;
- target `specs/.../slices/plan_<slice>.md` path;
- source-of-truth docs, including the relevant `doc_cursed`;
- similar completed slice plans, if any;
- relevant code/doc files that must be read;
- explicit Scope and Out of Scope;
- key invariants and the main runtime path, if already known;
- testing, hardware, Cloud/Edge/Client boundary constraints.

If the Input Pack is incomplete, do not stop automatically. During Stage 1, recover missing facts from the repository and mark unknowns as assumptions. Ask questions only when a safe plan cannot be built without an answer.

Hard Stop Rule:
- Each stage is completed in a separate answer.
- After each stage, stop and ask for confirmation before continuing.
- Technical Lead Review is a separate stage. Do not perform it immediately after writing the general plan or task plan.

Stage 1: Draft understanding
- Read relevant docs/code from the Input Pack.
- Read nearby `AGENTS.md` and `FILE_MAP.md`, if present.
- Read relevant `doc_cursed` files and similar completed slice plans, if any.
- Do not read `Note.md` files.
- Record Code Facts: what exists, what is missing, what contracts and runtime paths are affected.
- Define Scope and Out of Scope.
- Assess cross-module impact on Cloud, Edge, Client, Constructor, storage, and transport contracts.
- List invariants.
- Ask at most three non-blocking questions; otherwise make reasonable assumptions.
- Stop and wait for confirmation.

Stage 2: General plan
- Describe Execution Flow from input event to observable result.
- Describe responsibility boundaries for affected modules.
- Describe main decisions and assumptions.
- Refine Scope and Out of Scope if needed.
- Describe behavior-level Acceptance Checks.
- Do not write file-level tasks yet.
- Stop and wait for confirmation.

Stage 3: Document pass
- Create or update `specs/.../slices/plan_<slice>.md`.
- Read and apply `doc/doc_writing.md`.
- Add Purpose, Scope, Out of Scope, Assumptions, Constraints, and Acceptance Checks.
- Use directive language: `MUST`, `SHOULD`, `MAY`.
- Explicitly record Lean Testing Policy in Constraints.
- Do not add implementation batches to the file.
- Stop and wait for confirmation.

Stage 4: Technical Lead Review of the general plan
- Check scope leakage, wrong module boundaries, contract drift, hidden races, deadlocks, stale state, and mismatch with `doc_cursed`.
- Check that Acceptance Checks cover the real behavior of the slice.
- Check that Lean Testing did not make the plan unprovable or too vague.
- Propose changes and apply them only after confirmation.
- Stop and wait for confirmation.

Stage 5: Detailed task plan
- Read and use `.agent/workflows/05-speckit.tasks.md`.
- Convert the file into a detailed task plan.
- Use strict checklist format: `- [ ] T001 [P?] [US?] Description with file path`.
- Add phases, dependencies, parallel opportunities, implementation strategy, manual/runtime smoke, Technical Lead Review, and Review Trigger.
- Keep tasks implementation-ready and file-level.
- Apply Lean Testing Policy without removing the main proof path.
- Stop and wait for confirmation.

Stage 6: Technical Lead Review of the task plan
- Check task completeness, order, tests/proof, acceptance, and implementation risks.
- Check that tasks are not too generic and include file paths.
- Check that dependencies and parallel opportunities are realistic.
- Fix the task plan only after confirmation.
- Stop and wait for confirmation.

Stage 7: Implementation batches
- Do not write batches into the slice plan file.
- Output batches only in the response.
- Each batch must reference only task IDs from the task plan.
- Read and apply `doc/prompt.md`.
- For each batch, include workflow, task IDs, tasks file, constraints, main proof, and what not to count as success.
- Do not write code in this stage.
- Stop.
```

## 2. Input Pack Guide

The `Input Pack` is the slice-specific part of the planning prompt. It should be passed after the shared planning prompt, not mixed into the middle of it.

### Required Fields

Every `Input Pack` should include:

- slice name;
- target `specs/.../slices/plan_<slice>.md` path;
- source-of-truth docs;
- nearby `AGENTS.md` and `FILE_MAP.md` when relevant;
- similar completed slice plans when available;
- exact code/doc files to read;
- Scope;
- Out of Scope;
- key invariants;
- known facts already established in repo or docs;
- testing constraints;
- Cloud/Edge/Client boundary constraints when relevant.

### Optional Fields

Add these only when they reduce real ambiguity:

- local rule conflict;
- proposed contract shape;
- runtime path;
- UX notes;
- rollout assumptions;
- known blocker or likely uncertainty.

### Input Pack Rules

- MUST keep the `Input Pack` slice-specific.
- MUST describe what the slice should achieve, not repeat the full planning workflow.
- MUST prefer known facts from repo/docs over invention.
- MUST mark invented or not-yet-proven contract shape as an assumption or proposed shape.
- MUST keep Scope and Out of Scope explicit.
- MUST give the agent exact file paths when file discovery risk is high.
- DO NOT restate `doc/doc_writing.md`, `.agent/workflows/05-speckit.tasks.md`, or `doc/prompt.md` inside the `Input Pack`.
- DO NOT let Lean Testing collapse the `Input Pack` into vague goals with no proof path.

## 3. Slice Description Guide

The slice description is the raw material used to prepare the `Input Pack`. It can be rough, incomplete, or written in plain language. Its job is to explain what the slice is supposed to do before it is converted into a stricter planning input.

### What To Collect

When gathering a slice description, collect:

- the user-visible or system-visible outcome;
- the main module boundary being changed;
- which surfaces are in play: Cloud, Edge, Client, Constructor, Dashboard, storage, transport, authoring, runtime;
- what already exists;
- what must stay unchanged;
- what should be explicitly excluded from this slice;
- the main proof path;
- any architecture rule already recorded in `doc_cursed`.

### Recommended Shape

```text
Slice:
- <name>

Goal:
- <what this slice must make possible>

Current facts:
- <what already exists>

Main boundary:
- <which modules hand data or control to each other>

Scope:
- <what is in>

Out of scope:
- <what is out>

Invariants:
- <what must remain true>

Main proof:
- <what would honestly prove this slice works>

Open questions or assumptions:
- <only the important ones>
```

## 4. Quality Rules

- MUST keep the shared workflow stable and generic.
- MUST keep slice-specific facts in the `Input Pack`.
- MUST put durable contracts in `doc_cursed`.
- MUST keep implementation details in the slice plan, not in `doc_cursed`.
- MUST stop between planning stages and wait for confirmation.
- MUST keep task plans file-level and implementation-ready.
- MUST prefer several narrow slices over one cross-module mega-slice.

## 5. Anti-Patterns

- DO NOT combine the shared prompt and slice facts into one unstructured wall of text.
- DO NOT repeat the full rules from `doc_writing`, `speckit.tasks`, or `prompt.md`.
- DO NOT accept vague tasks such as `Implement controller`, `Add service`, or `Write tests`.
- DO NOT allow Lean Testing to remove concrete proof or file-level task detail.
- DO NOT invent a contract shape silently when the repo does not prove it.
- DO NOT mix contract/catalog creation, authoring UI, and runtime execution into one slice unless the change is truly tiny.
- DO NOT let Client read Edge YAML directly.
- DO NOT infer bindings, command capability, or widget type from labels when saved contracts should define them.

## 6. Suggested Additions

These additions often improve slice planning quality:

- a `Known Facts` block in the `Input Pack`;
- a `Local Rule Conflict` block when local `AGENTS.md` rules lag behind `doc_cursed`;
- a `Proposed Contract Shape` block only when the shape is not already present in repo/docs;
- a `Main Proof` note to keep Lean Testing honest;
- a `Why This Slice Is Separate` note when the system could otherwise drift into one oversized plan.

## Source Of Truth

- Shared workflow: [implement_pipeline.md](D:/Study/4_course/VKR/implement_pipeline.md)
- Documentation rules: [doc_writing.md](D:/Study/4_course/VKR/doc/doc_writing.md)
- Task-plan workflow: [05-speckit.tasks.md](D:/Study/4_course/VKR/.agent/workflows/05-speckit.tasks.md)
- Batch prompt rules: [prompt.md](D:/Study/4_course/VKR/doc/prompt.md)

## Review Trigger

Review this guide when:

- the shared planning workflow changes;
- a repeated planning failure pattern appears;
- `doc_cursed` boundaries change;
- the team adopts a different slice decomposition pattern.
