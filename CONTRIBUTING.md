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

Smithy uses a three-tier testing strategy:

### 1. Automated Tests (`npm test`)

Unit and integration tests covering init/uninit flows, template composition, permissions generation, and utility functions. These run in CI on every push and PR.

| Test file | Scope |
|-----------|-------|
| `src/cli.test.ts` | CLI integration (init, uninit, lifecycle, idempotency) |
| `src/agents/claude.test.ts` | Claude deploy/remove, permissions, allow/deny lists |
| `src/agents/gemini.test.ts` | Gemini deploy/remove |
| `src/agents/codex.test.ts` | Codex deploy/remove |
| `src/templates.test.ts` | Template composition and audit checklist extraction |
| `src/utils.test.ts` | Utility functions (gitignore, copy, remove) |
| `src/permissions.test.ts` | Permission flattening |

### 2. Agent Tests (Claude Code session)

Tests that require a Claude Code runtime to verify prompts load, slash commands work, and permissions are enforced. These can be run by a Claude agent or by a developer in a Claude Code session.

See **[tests/MANUAL_TEST_CASES.md](tests/MANUAL_TEST_CASES.md)** -- Agent Tests (A1-A4).

### 3. Human Tests (Interactive terminal)

Tests for the Inquirer-based interactive prompts that cannot be driven programmatically. These require a developer at a real terminal.

See **[tests/MANUAL_TEST_CASES.md](tests/MANUAL_TEST_CASES.md)** -- Human Tests (H1-H4).

## Pre-Release Checklist

Before publishing a new version:

1. All automated tests pass: `npm test`
2. Agent tests (A1-A4) verified in a Claude Code session
3. Human tests (H1-H4) verified in an interactive terminal
4. Trigger the **Publish to npm** workflow with both test gate checkboxes checked

## Pull Requests

Use the [PR template](.github/pull_request_template.md) when opening PRs. Populate the Testing section with actual outcomes.
