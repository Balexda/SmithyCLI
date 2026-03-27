# Smithy CLI

Smithy is a CLI tool that bootstraps AI-assisted development workflows across multiple agentic coding CLIs (Claude Code, Gemini CLI, Codex). It installs prompt templates, slash commands, permissions, and issue templates into a target repository so developers can invoke structured workflows like `/smithy.strike` directly from their AI assistant.

## What Smithy Does

`smithy init` deploys prompt files from `src/templates/base/` into agent-specific locations:

| Agent | Prompts | Commands (slash) | Permissions |
|-------|---------|-------------------|-------------|
| Claude | `.claude/prompts/` | `.claude/commands/` (if `command: true` in frontmatter) | `.claude/settings.json` |
| Gemini | `.gemini/skills/<name>/SKILL.md` | (skills are invocable by default) | `.gemini/config.json` |
| Codex | `tools/codex/prompts/` | `.agents/skills/<name>/SKILL.md` (if `command: true` in frontmatter) | `.codex/config.toml` |

`smithy uninit` removes all deployed artifacts (but preserves config/permissions).

## Architecture

- **Single source file**: `src/cli.ts` — the entire CLI. Uses Commander for arg parsing, Inquirer for interactive prompts.
- **Templates**: `src/templates/base/*.md` — each has YAML frontmatter (`name`, `description`, optionally `command: true`). Frontmatter is stripped when deploying to Claude/Codex (kept for Gemini skills).
- **Issue templates**: `src/templates/issue-templates/` — GitHub issue templates, copied as-is.
- **Build**: `tsup` bundles to `dist/cli.js` (ESM). Run `npm run build` to compile.

## The Smithy Workflow Commands

Smithy provides a collection of workflow prompts, each for a different stage/style of development:

- **smithy.strike** — The lightweight "just do it" command. Interactive planning + implementation in one session. This is the starting point we're actively developing. Has `command: true` so it deploys as a Claude Code slash command (`/smithy.strike`).
- **smithy.ignite** — Full pipeline kickoff for larger features (RFC, design, etc.)
- **smithy.forge** — Implementation executor that works from task specs
- **smithy.mark** — Feature specification command. Produces `.spec.md`, `.data-model.md`, and `.contracts.md` from a feature description or RFC.
- **smithy.refine**, **smithy.audit**, etc. — Other pipeline stages

The current focus is getting `smithy.strike` working end-to-end as a slash command before tackling the heavier pipeline commands.

## Key Concepts

### Commands vs Prompts (Claude Code)
- `.claude/prompts/` — reference files the AI can read, but NOT invocable as `/command`
- `.claude/commands/` — invocable as slash commands (e.g., `/smithy.strike "add verbose flag"`)
- Templates with `command: true` in frontmatter get deployed to BOTH locations
- `$ARGUMENTS` is replaced by Claude Code with user's text after the slash command

### Cross-Agent Compatibility
The same template source serves all three agents. Gemini keeps frontmatter (for skill metadata). Claude/Codex strip it. The prompt text uses `$ARGUMENTS` which Claude replaces but Gemini/Codex leave as literal — so prompts include a fallback: "If no feature description is clear, ask the user."

## Development

```bash
npm run build        # Build with tsup
npm run typecheck    # Type-check without emitting
npm test             # Run all tests
node dist/cli.js init    # Test init flow
node dist/cli.js uninit  # Test uninit flow
```

**Important:** Always use `npm run` / `npm test` scripts for building, typechecking, and testing. Do not use `npx tsx`, `npx vitest`, or similar direct invocations — they require extra approvals and waste time.

## Testing

Smithy uses a three-tier testing strategy:

1. **Automated** (`npm test`): 122 tests across 7 files covering init/uninit flows, template composition, permissions, and utilities. Runs in CI on every push and PR.
2. **Agent** (Claude Code session): 4 test cases (A1-A4) verifying prompt visibility, slash command invocability, permissions enforcement, and stale artifact cleanup.
3. **Human** (interactive terminal): 4 test cases (H1-H4) for Inquirer-based prompts that cannot be driven programmatically.

Agent and human test cases are documented in **[tests/MANUAL_TEST_CASES.md](tests/MANUAL_TEST_CASES.md)** with step-by-step instructions and checkboxes.

### Notes

- The CLI uses interactive prompts (Inquirer), so interactive flows cannot be tested with piped stdin.
- To test slash commands in Claude Code: run `smithy init` targeting a test repo, then start a **new** Claude Code session in that repo. Claude Code must be restarted to pick up new/changed commands.
- The `--permissions` flag accepts a level: `repo` (`.claude/settings.json`, checked into git), `user` (`~/.claude/settings.json`, global), or `none` (skip).
- The `templatesBaseDir` path in the built CLI resolves to `../src/templates` relative to `dist/`, so `src/templates/` must exist at runtime (it's included in `package.json` `files`).
