# Smithy CLI

Smithy is a CLI tool that bootstraps AI-assisted development workflows across multiple agentic coding CLIs (Claude Code, Gemini CLI, Codex). It installs prompt templates, slash commands, permissions, and issue templates into a target repository so developers can invoke structured workflows like `/smithy.strike` directly from their AI assistant.

## What Smithy Does

`smithy init` deploys prompt files from `src/templates/agent-skills/` into agent-specific locations:

| Agent | Prompts | Commands (slash) | Agents (sub-agents) | Permissions |
|-------|---------|-------------------|---------------------|-------------|
| Claude | `.claude/prompts/` | `.claude/commands/` | `.claude/agents/` | `.claude/settings.json` |
| Gemini | `.gemini/skills/<name>/SKILL.md` | `.gemini/skills/<name>/SKILL.md` | (not deployed) | `.gemini/settings.json` |

> **Note:** Codex support exists in the codebase (`src/agents/codex.ts`) but is not currently exposed as a CLI option. It will be revisited once Codex's skill/prompt conventions are better understood.

`smithy uninit` removes all deployed artifacts (but preserves config/permissions).

`smithy update` re-deploys templates using the settings stored in the manifest, handling version upgrades/downgrades.

## Architecture

- **CLI entry**: `src/cli.ts` — Commander setup and arg parsing.
- **Commands**: `src/commands/init.ts`, `src/commands/uninit.ts`, `src/commands/update.ts` — action handlers.
- **Agent deployers**: `src/agents/{claude,gemini}.ts` — per-agent deploy/remove logic. (`codex.ts` exists but is not exposed in the CLI yet.)
- **Templates**: `src/templates/agent-skills/{commands,prompts,agents}/*.md` — categorized by deployment target. Each has YAML frontmatter (`name`, `description`). Frontmatter is stripped when deploying to Claude (kept for Gemini skills).
- **Snippets**: `src/templates/agent-skills/snippets/*.md` — shared content injected via `<!-- snippet:filename.md -->` placeholders.
- **Issue templates**: `src/templates/issues/` — GitHub issue templates, copied as-is.
- **Manifest**: `src/manifest.ts` — tracks deployed files in `.smithy/smithy-manifest.json` for reliable cleanup and upgrades.
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

### Template Categories
Templates are organized by their deployment target:
- **`commands/`** — invocable as slash commands (e.g., `/smithy.strike "add verbose flag"`). Deployed to `.claude/commands/` for Claude, `.agents/skills/` for Codex, `.gemini/skills/` for Gemini.
- **`prompts/`** — reference files the AI can read, but NOT invocable as `/command`. Deployed to `.claude/prompts/` for Claude, `tools/codex/prompts/` for Codex, `.gemini/skills/` for Gemini.
- **`agents/`** — sub-agent definitions (deployed to `.claude/agents/` only, with frontmatter intact).
- **`snippets/`** — shared content fragments injected into other templates via `<!-- snippet:filename.md -->`.

### Cross-Agent Compatibility
The same template source serves all three agents. Gemini keeps frontmatter (for skill metadata). Claude/Codex strip it. The prompt text uses `$ARGUMENTS` which Claude replaces but Gemini/Codex leave as literal — so prompts include a fallback: "If no feature description is clear, ask the user."

## Development

```bash
npm run build        # Build with tsup
npm run typecheck    # Type-check without emitting
npm test             # Run all tests
node dist/cli.js init    # Test init flow
node dist/cli.js uninit  # Test uninit flow
node dist/cli.js update  # Test update flow
```

**Important:** Always use `npm run` / `npm test` scripts for building, typechecking, and testing. Do not use `npx tsx`, `npx vitest`, or similar direct invocations — they require extra approvals and waste time.

## Testing

Smithy uses a three-tier testing strategy:

1. **Automated** (`npm test`): A comprehensive suite covering init/uninit flows, template composition, permissions, and utilities. Runs in CI on every push and PR.
2. **Agent** (Claude Code session): Manual A-series test cases (A1-A4) verifying prompt visibility, slash command invocability, permissions enforcement, and stale artifact cleanup.
3. **Human** (interactive terminal): Manual H-series test cases (H1-H4) for Inquirer-based prompts that cannot be driven programmatically.

Agent and human test cases are documented in **[tests/MANUAL_TEST_CASES.md](tests/MANUAL_TEST_CASES.md)** with step-by-step instructions and checkboxes.

### Notes

- The CLI uses interactive prompts (Inquirer), so interactive flows cannot be tested with piped stdin.
- To test slash commands in Claude Code: run `smithy init` targeting a test repo, then start a **new** Claude Code session in that repo. Claude Code must be restarted to pick up new/changed commands.
- The `--permissions` / `--no-permissions` flags control whether permissions are deployed at the selected location (`repo` or `user`).
- The `templatesBaseDir` path in the built CLI resolves to `../src/templates` relative to `dist/`, so `src/templates/` must exist at runtime (it's included in `package.json` `files`).
