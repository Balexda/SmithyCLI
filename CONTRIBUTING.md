# Contributing to Smithy CLI

## Development Setup
<!-- audience: builder; mode: how-to; length: 3-6 commands; diagram: optional; examples: required -->

```bash
npm install
npm run build        # Build with tsup
npm run typecheck    # Type-check without emitting
npm test             # Run all tests
```

Always use `npm run` scripts. Do not use `npx tsx`, `npx vitest`, or similar direct invocations.

## Testing
<!-- audience: builder; mode: reference; length: 3 subsections, one per tier; diagram: optional; examples: discouraged -->

Smithy has three testing tiers that each require different strategies:

### Tier 1: CLI Behavior (init / uninit / update)

Tests that the CLI parses options correctly, deploys files to the right locations, handles idempotency, and cleans up properly. **Well covered** by automated tests and manual interactive tests.

**Automated** (`npm test`) — runs in CI on every push and PR:

| Test file | Scope |
|-----------|-------|
| `src/cli.test.ts` | CLI integration (init, uninit, update, lifecycle, idempotency) |
| `src/agents/claude.test.ts` | Claude deploy/remove, permissions, allow/deny lists |
| `src/agents/gemini.test.ts` | Gemini deploy/remove |
| `src/agents/codex.test.ts` | Codex deploy/remove |
| `src/utils.test.ts` | Utility functions (gitignore, copy, remove) |
| `src/permissions.test.ts` | Permission flattening |

**Human tests** (interactive terminal) — for Inquirer-based prompts that cannot be driven programmatically. See **[tests/Manual.tests.md](tests/Manual.tests.md)** (H1-H4).

### Tier 2: Agent-Skill File Validation (template composition & deployment)

Tests that templates compose correctly (snippet/partial resolution, frontmatter handling, agent-variant rendering), deploy to the right directories with the right format, and match expected file counts. **Well covered** by automated tests and agent-session tests.

**Automated** (`npm test`):

| Test file | Scope |
|-----------|-------|
| `src/templates.test.ts` | Template composition, partial resolution, frontmatter, agent variants, file categorization |

**Agent tests** (Claude Code session) — verify deployed prompts are visible, slash commands are invocable, permissions are enforced, and stale artifacts are cleaned up. See **[tests/Agent.tests.md](tests/Agent.tests.md)** (A1-A9).

### Tier 3: Agent-Skill Execution Behavior (evals)

Tests that the deployed skills actually *work* when invoked by an AI agent — slash commands trigger, output has the correct structure, sub-agents are dispatched, and results meet quality expectations. Run via `npm run eval` (local on-demand, not CI — LLM cost).

The framework (`evals/`) runs scenarios through a selected headless agent CLI (`claude`, `gemini`, or `codex exec`) against the reference fixture codebase. It validates structural output, sub-agent dispatch, and token / baseline regressions. Scenarios are loaded from `evals/cases/*.yaml`; the `--case <name>` filter selects a single scenario. The framework's own unit tests run independently via `npm run test:evals`.

See **[specs/2026-04-06-003-smithy-evals-framework/](specs/2026-04-06-003-smithy-evals-framework/)** for the feature specification and per-user-story status.

## Automated Dependency Updates
<!-- audience: builder; mode: reference; length: 1-2 paragraphs; diagram: optional; examples: discouraged -->

This repo runs Dependabot on a monthly schedule (plus immediate security advisories) and pings GitHub Copilot Coding Agent to fix CI failures on Dependabot PRs. See **[docs/automated-dependency-updates.md](docs/automated-dependency-updates.md)** for the day-to-day flow and the one-time repo settings required.

## Pre-Release Checklist
<!-- audience: builder; mode: how-to; length: 5 ordered steps; diagram: optional; examples: discouraged -->

Before publishing a new version:

1. All automated tests pass: `npm test`
2. Agent tests (A1-A9) verified in a Claude Code session
3. Human tests (H1-H4) verified in an interactive terminal
4. Evals pass (when available): `npm run eval`
5. Trigger the **Publish to npm** workflow with both test gate checkboxes checked

## Pull Requests
<!-- audience: builder; mode: how-to; length: 1-2 sentences; diagram: optional; examples: discouraged -->

Use the [PR template](.github/pull_request_template.md) when opening PRs. Populate the Testing section with actual outcomes.
