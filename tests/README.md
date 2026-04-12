# Manual & Eval Test Cases

Pre-release checklist for tests that cannot be fully automated. Run these before publishing a new version.

Smithy's testing covers three tiers (see [CONTRIBUTING.md](../CONTRIBUTING.md#testing) for full details):
- **Tier 1 (CLI behavior)** and **Tier 2 (file validation)** are covered by `npm test` (automated).
- **Tier 2 (agent-session)** is covered by the A-series agent tests below.
- **Tier 1 (interactive)** is covered by the H-series human tests below.
- **Tier 3 (execution behavior)** is covered by the evals framework in `evals/` (in development).

## Test Files

| File | Runner | Description |
|------|--------|-------------|
| [Agent.tests.md](Agent.tests.md) | Claude Code agent or developer in a Claude Code session | Verifies deployed prompts, slash commands, permissions, stale cleanup, and sub-agent output structure |
| [Manual.tests.md](Manual.tests.md) | Developer at an interactive terminal | Verifies Inquirer-based prompts that cannot be driven programmatically |
| `evals/` | Developer running `npm run eval` locally | Executes skills via `claude -p` headless mode against a reference fixture, validates output structure |

## Setup

Before running any manual test case:

1. **Build the CLI**:
   ```bash
   npm run build
   ```

2. **Ensure automated tests pass**:
   ```bash
   npm test
   ```

3. **Prepare a clean test directory** (agent tests use `/tmp/smithy-test`):
   ```bash
   rm -rf /tmp/smithy-test
   ```

4. **For agent tests (A-series)**: run them in a Claude Code session with access to the SmithyCLI repo, or delegate them to a Claude agent.

5. **For human tests (H-series)**: run them in a real terminal with interactive input. These cannot be piped or scripted.

## Cleanup

After running tests, remove temp directories:

```bash
rm -rf /tmp/smithy-test /tmp/custom-target
```
