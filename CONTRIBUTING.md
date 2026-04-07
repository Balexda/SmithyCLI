# Contributing to Smithy CLI

## Development Setup

```bash
npm install
npm run build        # Build with tsup
npm run typecheck    # Type-check without emitting
npm test             # Run all tests
```

Always use `npm run` scripts. Do not use `npx tsx`, `npx vitest`, or similar direct invocations.

## Testing

Smithy has three conceptual parts that each require different testing strategies:

### Part 1: CLI Behavior (init / uninit / update)

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

### Part 2: Agent-Skill File Validation (template composition & deployment)

Tests that templates compose correctly (snippet/partial resolution, frontmatter handling, agent-variant rendering), deploy to the right directories with the right format, and match expected file counts. **Well covered** by automated tests and agent-session tests.

**Automated** (`npm test`):

| Test file | Scope |
|-----------|-------|
| `src/templates.test.ts` | Template composition, partial resolution, frontmatter, agent variants, file categorization |

**Agent tests** (Claude Code session) — verify deployed prompts are visible, slash commands are invocable, permissions are enforced, and stale artifacts are cleaned up. See **[tests/Agent.tests.md](tests/Agent.tests.md)** (A1-A5).

### Part 3: Agent-Skill Execution Behavior (evals)

Tests that the deployed skills actually *work* when invoked by an AI agent — slash commands trigger, output has the correct structure, sub-agents are dispatched, and results meet quality expectations. **Not yet covered** — planned via a dedicated evals framework.

The evals framework (under `evals/`) will:
- Execute skills via `claude -p` in headless mode against a reference fixture codebase
- Validate outputs structurally (required headings, sections, tables)
- Verify sub-agent invocation (e.g., strike dispatches plan, scout, reconcile, clarify)
- Run locally on demand (`npm run eval`), not in CI, due to LLM cost

See **[specs/2026-04-06-003-smithy-evals-framework/](specs/2026-04-06-003-smithy-evals-framework/)** for the feature specification.

## Pre-Release Checklist

Before publishing a new version:

1. All automated tests pass: `npm test`
2. Agent tests (A1-A5) verified in a Claude Code session
3. Human tests (H1-H4) verified in an interactive terminal
4. Evals pass (when available): `npm run eval`
5. Trigger the **Publish to npm** workflow with both test gate checkboxes checked

## Pull Requests

Use the [PR template](.github/pull_request_template.md) when opening PRs. Populate the Testing section with actual outcomes.
