# Prompts

Reference prompts that the AI can read for guidance, but are **not** invocable
as slash commands. These provide shared conventions and standards that other
commands reference during their workflows.

Deployed to:
- **Claude**: `.claude/prompts/smithy.<name>.md` (frontmatter stripped)
- **Gemini**: `.gemini/skills/smithy.<name>/SKILL.md` (frontmatter kept)

## Current Prompts

| Prompt | Purpose | Referenced By |
|--------|---------|---------------|
| `smithy.titles` | Canonical title format conventions for all Smithy artifacts | mark, cut, render, forge (any command that writes headings) |
| `smithy.guidance` | Shell and environment guidance for implementation agents | forge, strike |
