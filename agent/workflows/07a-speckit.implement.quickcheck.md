---
description: Execute requested tasks from tasks.md with lightweight validation and automatic task checkoff
---

# Workflow: speckit.implement.quickcheck

1. **Context Analysis**:
   - Treat the user's prompt as the primary input.

2. **Load Skill**:
   - Read `.agent/skills/speckit.implement.quickcheck/SKILL.md`.

3. **Execute**:
   - Follow the instructions in the skill exactly.
   - Apply the user's prompt as the task scope.
   - When the requested spec touches shared or downstream modules, verify whether implementation and contracts in those modules also changed; update stale docs/contracts accordingly instead of assuming the work is confined to one spec directory.
   - For edge, socket, or API contract work, explicitly check the live implementation in `cloud_server` before leaving older cloud-facing docs untouched.

4. **On Error**:
   - If `tasks.md` is missing: Run `/speckit.tasks` first
   - If `plan.md` is required for safe execution and is missing: Run `/speckit.plan` first
