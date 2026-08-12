---
description: Execute requested tasks from tasks.md with semantic closure checks, production-quality bias, lean proof, and candidate-complete gating.
---

# Workflow: speckit.implement.experimental

1. **Context Analysis**:
   - The user has provided an input prompt. Treat this as the primary input for the skill.

2. **Load Skill**:
   - Use the available local file-reading tool to read the skill file at: `.agent/skills/speckit.implement.experimental/_SKILL.md`

3. **Execute**:
   - Follow the instructions in the `_SKILL.md` exactly.
   - Apply the user's prompt as the input arguments/context for the skill's logic.

4. **On Error**:
   - If `tasks.md` is missing: Run `/speckit.tasks` first
   - If `plan.md` is required by the skill rules for safe execution and is missing: Run `/speckit.plan` first
   - If `spec.md` is required to unblock missing task context and is missing: Run `/speckit.specify` first
