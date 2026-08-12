# Useful Documentation Guide

## Scope

Applies to AI agents that create, review, or edit project documentation.

## Goal

Documentation MUST help a reader or agent make a correct decision faster.

Every document MUST have a clear purpose: guide an action, prevent a mistake, explain a boundary, preserve a decision, plan work, or provide reference context.

Short is preferred only when it preserves the useful signal.

## Default Rules

- MUST write the smallest document that is sufficient for the task.
- MUST place documentation where the reader or tool will look for it during work.
- MUST keep instructions close to the code, feature, spec, or module they constrain.
- MUST use directive vocabulary: MUST, SHOULD, MAY, DO NOT.
- MUST describe constraints before rationale in operational documents.
- MUST keep rationale separate from rules when the rationale is not needed for routine execution.
- MUST name the scope of every rule.
- MUST preserve useful task plans, ADRs, specs, and references when they still have a clear purpose.
- SHOULD delete stale documentation instead of archiving it when the stale content is safe to remove and in scope.
- MUST avoid generated-looking filler, generic best practices, and motivational prose.
- SHOULD use lists, tables, and examples when they reduce ambiguity.
- SHOULD prefer one precise sentence over a paragraph of explanation.
- MAY create deeper context documents when a short operational document can link to them.

## Document Fit

Choose the document shape before writing.

| Type | Purpose | Required signal |
| --- | --- | --- |
| Rule file | Constrain behavior | Scope, directives, forbidden actions |
| Task plan | Drive implementation | Ordered tasks, target files, acceptance checks |
| ADR | Preserve a decision | Context, decision, consequences, alternatives |
| Architecture note | Explain boundaries | Components, ownership, invariants, data flow |
| Runbook | Support operation | Symptoms, commands, rollback, escalation |
| Reference | Preserve lookup data | Stable facts, schemas, examples, links |

Do not force every document into the same shape.

## Useful Signals

A document is useful when:

- The reader can identify the document purpose and next useful action quickly.
- Each rule can be checked by code review, grep, tests, linting, or direct inspection.
- The document explains module boundaries, ownership, constraints, plans, or decisions.
- The document removes a common source of mistakes.
- The document has a clear owner, source of truth, or review trigger.
- A stale line would be easy to notice.
- Links point to deeper context only when deeper context is needed.

## Noise Signals

A document is noisy when:

- It repeats information already obvious from code, names, tests, or local rules.
- It explains general engineering practices without a project-specific constraint.
- It says "consider", "where possible", or "best practice" when a decision is required.
- It contains long rationale before the actual rule.
- It mixes unrelated onboarding, architecture, decisions, task plans, and history in one file.
- It documents temporary implementation details as permanent architecture.
- It survives only because deleting it feels risky.
- Nobody knows who should update it.

## Structure

Prefer this order:

1. Scope.
2. Goal or invariant.
3. Constraints.
4. Work plan, workflow, or reference content.
5. Acceptance checks or verification.
6. Links to decision context.
7. Owner, source of truth, or review trigger.

Do not add sections that have no concrete content.

## From-Scratch Workflow

Before creating a new document:

- MUST identify the document type.
- MUST identify the primary reader: human developer, AI agent, reviewer, operator, or maintainer.
- MUST define the action, decision, or lookup the document supports.
- MUST inspect nearby rules and related documents.
- MUST choose the closest durable location.
- MUST decide whether the document should be operational, historical, planning-oriented, or reference-oriented.

When drafting:

- MUST start with scope and purpose.
- MUST add only sections required by the document type.
- MUST include examples when they prevent likely misuse.
- MUST include acceptance checks for task plans.
- MUST include consequences and alternatives for ADRs.
- MUST keep background context after the actionable content unless the context is required first.

## Writing Pattern

Use this pattern for rules:

```md
- MUST <required action> when <scope or condition>.
- SHOULD <preferred action> because <short project-specific reason>.
- DO NOT <forbidden action>; use <allowed alternative>.
- MAY <optional action> only when <condition>.
```

Examples:

```md
- MUST validate runtime commands before they reach device adapters.
- SHOULD keep protocol-specific parsing inside `edge_server/internal/adapters`.
- DO NOT hardcode service URLs; read them from configuration.
- MAY add an ADR when a decision affects more than one module.
```

## Rationale Handling

- MUST keep rationale separate from operational rules when it is longer than two sentences.
- MUST link operational rules to ADRs, specs, research notes, or issue references when context matters.
- SHOULD summarize rationale in one line when the reader needs it to avoid misusing the rule.
- DO NOT copy full decision history into rule files.
- MAY keep rationale inline in ADRs, design notes, and task plans when it directly affects implementation choices.

Good:

```md
- DO NOT use an ORM outside the approved storage layer; see `doc/storage-decision.md`.
```

Bad:

```md
We previously evaluated several ORM libraries, discussed team preferences,
considered future migrations, and decided that developers should generally avoid
adding ORM usage in most places because this may create maintenance concerns.
```

## AI Agent Workflow

Before writing:

- MUST read the nearest repository instructions for the target path.
- MUST inspect existing related documents before adding a new one.
- MUST decide whether editing an existing document is better than creating a new file.
- MUST identify the document type and reader.

While writing:

- MUST write for action, not coverage.
- MUST keep default context small.
- MUST move rare background details behind links.
- MUST avoid local machine notes, AI-maintenance notes, and `.gitignore` commentary in README files.
- MUST use English for documentation unless the user explicitly requests another language.

Before finishing:

- MUST remove duplicate statements.
- MUST remove sentences that do not affect decisions.
- MUST check that every directive has a scope.
- MUST check that links are necessary and local when possible.
- MUST update or remove outdated content when it is safe and in scope.
- SHOULD flag outdated content that is related but outside the current edit scope.

## Compression Test

Ask:

- What decision does this document enable?
- What mistake does this document prevent?
- Which lines would an AI agent need in context by default?
- Which lines are rare background and should become links?
- What can be deleted without changing behavior?
- What context must stay because removing it would make implementation or review less safe?

If the answer is unclear, the document is not compressed enough.

## Review Triggers

Review documentation when:

- A module boundary changes.
- A public API changes.
- A required workflow changes.
- A dependency or platform decision changes.
- A stale rule is discovered.
- A document grows beyond what a reader needs for the current task.

## Deletion Rule

Delete a document or section when:

- It is stale.
- It has no owner, source of truth, or review trigger.
- It duplicates a closer source of truth.
- It describes behavior that tests or code already show more clearly.
- It does not guide a decision, action, or constraint.

Do not delete useful context only because it is long. First classify it as operational context, decision history, task planning, or reference material, then move, link, compress, or keep it according to that purpose.
