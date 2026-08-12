<!--
Sync Impact Report:
- Version change: 1.1.0 -> 1.2.0
- Modified principles: P2 (module roles and SPA-native dashboard direction), P3 (contract-based frontend integration), P6 (repo instruction sources and context discovery), P7 (documentation ownership files)
- Added sections: N/A
- Removed sections: N/A
- Templates requiring updates: .specify/templates/plan-template.md
- Follow-up TODOs: If additional Specify templates are added later, align them with the SPA-native dashboard direction and contract-first module boundaries.
-->

# VKR SCADA Project Constitution

**Version**: 1.2.0
**Ratification Date**: 2026-02-22
**Last Amended Date**: 2026-03-22

## Governance

This Constitution acts as the supreme technical and architectural law for the VKR SCADA mono-repository.

**Amendment Procedure**: Any changes to these rules MUST be agreed upon and increment the constitution version according to semantic versioning.
**Versioning Policy**:
- MAJOR (X.0.0): Backward incompatible governance/principle removals or redefinitions.
- MINOR (0.X.0): New principle/section added or materially expanded guidance.
- PATCH (0.0.X): Clarifications, wording, typo fixes, non-semantic refinements.
**Compliance Review**: Every architectural decision or new module MUST explicitly pass a compliance check against this Constitution.

---

## Principle 1: Role & Persona

**Rule**: Development AI MUST act as a Senior FullStack Developer.
**Rationale**: Ensures high-quality code generation and precise architectural adherence.

- MUST communicate primary explanations in Russian, while writing code, variables, and code comments in English.
- MUST use a terse, factual style: code first, minimal words, no apologies.
- MUST explicitly state when employing a Workflow (slash command) or Skill (from `.agent/skills/`).

## Principle 2: Architectural Scope & Mono-repository Structure

**Rule**: The system MUST remain a distributed SCADA mono-repository with explicit module ownership and a SPA-first delivery path for end-user experiences.
**Rationale**: Preserves clear product boundaries while allowing the React SPA to absorb new user-facing features without recreating standalone runtimes unnecessarily.

- **Client Modules**:
  - `/client`: React SPA shell and the default home for user-facing SPA features, including the public zone, Admin Hub, User Hub, and the SPA-native Dashboard experience.
  - `/constructor`: Dedicated authoring module for mnemonic diagrams, bindings, conditions, and future command configuration. The client may host or integrate constructor flows, but authoring logic remains owned by `/constructor`.
  - `/dashboard`: Reserved operator-runtime/prototype module for standalone or experimental viewer work. New dashboard delivery is not required to target this module when the approved architecture is a SPA-native feature in `/client`.
- **Server Modules**:
  - `/cloud_server`: Cloud backend responsible for data aggregation, global state synchronization, diagram configuration storage, and server-side validation boundaries.
  - `/edge_server`: Border local controller interfacing with physical machinery via industrial protocols and acting as the final safety authority for device commands.

## Principle 3: Strict Module Isolation

**Rule**: Modules MUST remain independent and autonomous, with integration happening only through explicit contracts.
**Rationale**: Eliminates tight coupling, prevents brittle frontend entanglement, and keeps authoring/runtime responsibilities evolvable.

- Code from one module MUST NOT be directly imported by another. Shared logic MUST be exposed via APIs or isolated npm packages.
- Cross-module communication MUST occur via explicit endpoints (HTTP/WebSocket) or IPC, never shared file execution.
- Frontend modules MUST share data contracts, not renderer/editor internals. The boundary between constructor and dashboard is the diagram contract (layout, bindings, conditions, future command metadata), not direct UI/runtime reuse.

## Principle 4: State & Scope Containment

**Rule**: Global mutable scope MUST NOT be used in client or server runtimes.
**Rationale**: Prevents hard-to-track side effects and ensures components are stateless or contain their state encapsulated.

- The use of `window.*` (client) or `global.*` (server) is STRICTLY PROHIBITED, barring explicitly required local debugging scenarios.

## Principle 5: Ultimate Security & Secrets Management

**Rule**: Hardcoded secrets are STRICTLY PROHIBITED in any commit or file within the repository.
**Rationale**: Prevents leaking secure credentials to version control or production runtimes.

- Logins, tokens, IP addresses, or encrypted keys MUST be injected via Environment Variables or secure external configuration files.

## Principle 6: Context Awareness & Boundaries

**Rule**: AI helpers MUST NOT hallucinate context and MUST respect the scope of the active module and its governing instructions.
**Rationale**: Reduces generation errors and ensures decisions are grounded in the repository's actual structure, workflows, and local rules.

- AI MUST follow the root `AGENTS.md` and then the closest applicable `AGENTS.md`, `FILE_MAP.md`, `SKILL.md`, workflow, and spec artifacts for the area being changed.
- When operating in a specific module (for example `/client` or `/constructor`), the AI MUST prioritize the nearest local instructions for tech stack, architecture, and workflow constraints before editing.
- AI MUST inspect the filesystem and open relevant files before assuming structure, ownership, or behavior.

## Principle 7: Audience-Specific Documentation

**Rule**: High-level README files MUST be written exclusively for human developers or operators.
**Rationale**: Keeps documentation clean, relevant, and noise-free.

- `README.md` files MUST NOT contain AI-specific prompts, local configurations, or `.gitignore` minutiae. Machine-oriented guidance belongs in specialized files such as `AGENTS.md`, `.agent/skills/`, `.agent/workflows/`, or `.specify/` assets.
