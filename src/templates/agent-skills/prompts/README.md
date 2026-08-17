# Prompts

Reference prompts that the AI can read for guidance, but are **not** invocable
as slash commands. These provide shared conventions and standards that other
commands reference during their workflows.

Deployed to:
- **Claude**: `.claude/prompts/smithy.<name>.md` (frontmatter stripped)
- **Gemini**: `.gemini/skills/smithy.<name>/SKILL.md` (frontmatter kept)
- **Codex**: `tools/codex/prompts/smithy.<name>.md` (frontmatter stripped) and `.agents/skills/smithy-<name>/SKILL.md` (frontmatter kept)

## Current Prompts

| Prompt | Purpose | Referenced By |
|--------|---------|---------------|
| `smithy.titles` | Canonical title format conventions for all Smithy artifacts | spark, ignite, render, mark, cut, strike, orders — every command that writes artifact headings |
| `smithy.guidance` | Shell and environment guidance | audit, forge, orders |

A prompt is a *deployed file* a command is told to read, so its **Referenced
By** column lists the commands whose text names it. That is a different
relationship from a snippet's **Used By**: the `guidance-shell` snippet is the
shared body behind `smithy.guidance`, and `smithy-implement` composes that
snippet directly rather than reading this prompt.
