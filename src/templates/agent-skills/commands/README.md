# Commands

Slash commands invocable by users (e.g., `/smithy.strike "add verbose flag"`).

Deployed to:
- **Claude**: `.claude/commands/smithy.<name>.md` (frontmatter stripped)
- **Gemini**: `.gemini/skills/smithy.<name>/SKILL.md` (frontmatter kept)

## Current Commands

| Command | Purpose | Sub-Agents Used |
|---------|---------|-----------------|
| `smithy.strike` | Lightweight one-shot planning — explore, write `.strike.md`, create PR | clarify, plan, reconcile |
| `smithy.ignite` | Workshop an idea into an RFC with milestones | clarify, refine, plan, reconcile |
| `smithy.render` | Break an RFC milestone into a feature map | clarify, refine, **scout** |
| `smithy.mark` | Transform a feature into a spec with user stories | clarify, refine, **scout** |
| `smithy.cut` | Decompose a user story into PR-sized task slices | clarify, refine, **scout** |
| `smithy.forge` | Implement a slice end-to-end (TDD + review + PR) | implement, review, **maid** |
| `smithy.fix` | Minimal-diff bug fix from a GitHub issue | (none) |
| `smithy.audit` | Audit a Smithy artifact against its checklist | (none) |
| `smithy.orders` | Show available Smithy commands and their usage | (none) |
| `smithy.status` | Show the current status of every Smithy planning artifact in the repo | (none) |

## Conventions

- Frontmatter must include `name` and `description`.
- Commands that should deploy as slash commands set `command: true` in frontmatter.
- Use `$ARGUMENTS` for user input; include a fallback for agents that don't substitute it.
- Use `{{>partial-name}}` to include shared snippets (resolved by Dotprompt at deploy time).
- Use `{{#ifAgent}}...{{else}}...{{/ifAgent}}` for orchestrator vs standalone conditional blocks.
