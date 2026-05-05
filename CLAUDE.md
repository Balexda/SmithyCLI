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
- **Templates**: `src/templates/agent-skills/{commands,prompts,agents}/*.prompt` — categorized by deployment target. Uses [Dotprompt](https://firebase.google.com/docs/genkit/dotprompt)'s native `.prompt` extension with YAML frontmatter (`name`, `description`). Dotprompt handles Handlebars rendering at deploy time — resolving partials (`{{>snippet-name}}`), conditionals (`{{#ifAgent}}...{{/ifAgent}}`), and other expressions. Frontmatter is stripped when deploying to Claude (kept for Gemini skills). Deployed files are translated to `.md`. See `src/templates/agent-skills/README.md` for full conventions.
- **Snippets**: `src/templates/agent-skills/snippets/*.md` — shared Markdown fragments injected via `{{>partial-name}}` Handlebars partials. Resolved by Dotprompt at deploy time; not deployed as standalone files.
- **Issue templates**: `src/templates/issues/` — GitHub issue templates, copied as-is.
- **Manifest**: `src/manifest.ts` — tracks deployed files in `.smithy/smithy-manifest.json` for reliable cleanup and upgrades.
- **Build**: `tsup` bundles to `dist/cli.js` (ESM). Run `npm run build` to compile.

## The Smithy Workflow Commands

Smithy provides a collection of workflow prompts, each for a different stage/style of development:

- **smithy.strike** — The lightweight "just do it" command. One-shot: explore, plan, write a `.strike.md` document, and create a PR in a single pass — no intermediate approval stops. This is the starting point we're actively developing. Has `command: true` so it deploys as a Claude Code slash command (`/smithy.strike`).
- **smithy.spark** — Optional upstream entry point. Turns a raw idea into a ~1 page PRD (problem statement, proposed solution, alternatives / build-vs-buy) at `docs/prds/<YYYY>-<NNN>-<slug>.prd.md`. One-shot by default. The PRD can then feed `smithy.ignite`.
- **smithy.ignite** — Full pipeline kickoff for larger features (RFC, design, etc.). Accepts a PRD file path as input to workshop into an RFC.
- **smithy.forge** — Implementation executor that works from task specs
- **smithy.mark** — Feature specification command. Produces `.spec.md`, `.data-model.md`, and `.contracts.md` from a feature description, RFC, or `.features.md` feature map (auto-selects the first unspecced feature).
- **smithy.fix** — Minimal-diff bug fix from a GitHub issue
- **smithy.audit** — Audit a Smithy artifact against its checklist
- **smithy.orders** — Show available Smithy commands and their usage
- **smithy.status** — Show the current status of every Smithy planning artifact in the repo. Deployed as a Claude Code skill (auto-activates on natural-language questions like "what's next?" or "which user stories are left?") and still invocable explicitly via `/smithy.status …`. Pass-through mode shells out to `smithy status` with the user's flags and returns CLI output verbatim; question mode runs `smithy status --format json` and answers the user's question from the parsed payload (no LLM reconstruction of status, dependencies, or next actions).

### Sub-Agents (not user-invocable)

- **smithy-plan** — Design sub-agent: explores codebase, proposes approach, identifies risks and tradeoffs. Runs in parallel with focus lenses for competing perspectives (used by strike in agent mode)
- **smithy-reconcile** — Reconciliation sub-agent: synthesizes outputs from multiple competing smithy-plan runs into a single coherent plan (used by strike in agent mode)
- **smithy-clarify** — Ambiguity scanning and triage into assumptions and specification debt (used by strike, ignite, mark, cut, render)
- **smithy-refine** — Artifact review and refinement findings (used by mark, cut, ignite, render in Phase 0)
- **smithy-implement** — TDD implementation: failing test → code → commit (used by forge)
- **smithy-implementation-review** — Read-only code review; returns findings for forge to apply (used by forge)
- **smithy-plan-review** — Read-only self-consistency review of planning artifacts: catches internal contradictions, logical gaps, assumption-output drift, debt completeness, and brittle references. Returns findings; parent commands apply fixes. (used by strike, ignite, mark, render, cut after artifact generation)
- **smithy-scout** — Pre-planning consistency scan (used by render, mark, cut)
- **smithy-maid** — Post-implementation doc staleness scan (used by forge)
- **smithy-prose** — Narrative/persuasive prose drafting for RFC sections and planning artifacts (used by ignite for Summary, Motivation, Personas; used by spark for the PRD Problem Statement; designed for reuse by other commands)
- **smithy-survey** — WebFetch/WebSearch-enabled landscape survey: finds off-the-shelf alternatives and returns a structured build-vs-buy rationale (used by spark during PRD drafting; first smithy sub-agent to use web-research tools)

## Key Concepts

### Template Categories
Templates are organized by their deployment target:
- **`commands/`** — invocable as slash commands (e.g., `/smithy.strike "add verbose flag"`). Deployed to `.claude/commands/` for Claude, `.agents/skills/` for Codex, `.gemini/skills/` for Gemini.
- **`prompts/`** — reference files the AI can read, but NOT invocable as `/command`. Deployed to `.claude/prompts/` for Claude, `tools/codex/prompts/` for Codex, `.gemini/skills/` for Gemini.
- **`agents/`** — sub-agent definitions (deployed to `.claude/agents/` only, with frontmatter intact).
- **`snippets/`** — shared Markdown fragments injected into other templates via `{{>partial-name}}` Handlebars partials (resolved by Dotprompt at deploy time).

### Cross-Agent Compatibility
The same template source serves all three agents. Gemini keeps frontmatter (for skill metadata). Claude/Codex strip it. The prompt text uses `$ARGUMENTS` which Claude replaces but Gemini/Codex leave as literal — so prompts include a fallback: "If no feature description is clear, ask the user."

### Artifact Hierarchy and Relationships

Smithy planning artifacts form a strict parent/child lineage. Each parent artifact links to its children through a unified `## Dependency Order` table — **that table is the authoritative link, not filename conventions, not prose, not directory layout**.

```
RFC (.rfc.md)              — milestones
  └── Feature Map (.features.md)   — features
        └── Spec (.spec.md)        — user stories
              └── Tasks (.tasks.md) — slices (inline, no separate files)
```

Every `## Dependency Order` section at every level uses the same 4-column Markdown table:

| Column | Meaning |
|--------|---------|
| `ID` | Canonical per-level identifier: `M<N>` for milestones, `F<N>` for features, `US<N>` for user stories, `S<N>` for slices. No leading zeros. Unique within the table. |
| `Title` | Human-readable title of the milestone / feature / story / slice. |
| `Depends On` | Comma-separated list of IDs from the **same table** (e.g., `US1, US3`), or `—` if no dependencies. Cross-artifact dependencies are implicit in the parent/child lineage and never written here. |
| `Artifact` | Repo-relative path to the downstream file or folder (`.features.md` for milestones, spec folder for features, `.tasks.md` for stories), or `—` if not yet created. Slice rows always use `—` because slices live inline. The `Artifact` column replaces the old checkbox as the "started / not started" signal. |

**Do not use checkboxes in `## Dependency Order` sections.** The legacy `- [x] ... → path` format is removed because it caused merge conflicts and forced LLM inference for the dependency graph. Any new or edited artifact must use the table format above. Task-completion checkboxes inside `## Slice N:` bodies of tasks files are unaffected — those are implementation progress, not dependency ordering.

The canonical schema and rules live in `src/templates/agent-skills/README.md`. When adding, refactoring, or documenting any smithy command template, link to that README rather than redefining the format — the goal is one source of truth.

## Development

```bash
npm run build        # Build with tsup
npm run typecheck    # Type-check without emitting
npm test             # Run all tests
npm run eval         # Run evals framework (requires claude CLI + auth)
npm run test:evals   # Run evals unit tests (structural, parse-stream, runner, fixture, baseline)
node dist/cli.js init    # Test init flow
node dist/cli.js uninit  # Test uninit flow
node dist/cli.js update  # Test update flow
```

**Important:** Always use `npm run` / `npm test` scripts for building, typechecking, and testing. Do not use `npx tsx`, `npx vitest`, or similar direct invocations — they require extra approvals and waste time.

## Automated Maintenance

Dependency updates run hands-off via Dependabot, with GitHub Copilot Coding Agent as a fallback when CI fails on a Dependabot PR. See [docs/automated-dependency-updates.md](docs/automated-dependency-updates.md) for the flow, the one-time repo settings needed, and how to replicate the pattern in other repos.

## Testing

Smithy has three testing tiers, each tested differently:

1. **CLI behavior** (Tier 1) — init/uninit/update flows, option parsing, file deployment, idempotency. Covered by `npm test` (automated, CI) and interactive terminal tests (H1-H4).
2. **Agent-skill file validation** (Tier 2) — template composition, partial resolution, frontmatter, agent variants, file categorization. Covered by `npm test` (automated, CI) and agent-session tests (A1-A9).
3. **Agent-skill execution behavior** (Tier 3) — skills produce correct output when invoked by an AI agent, sub-agents are dispatched, output structure matches expectations. Covered by evals framework (`npm run eval` locally, or the `Smithy Evals` GitHub Actions workflow on demand — not wired to default `push`/`pull_request` CI). **Status: runner, entry point, structural validator, report library, strike and scout end-to-end scenarios implemented and wired into the orchestrator (stream parser, runner, `validateStructure`, `verifySubAgents`, `scenarioRunToResult`, `buildReport`, `formatReport`, `scoutScenario`, `--case` filter, `npm run eval` and `npm run test:evals` wired); fixture carries documented planted inconsistencies for scout detection; `run-evals.ts` now emits a full `EvalReport` summary via `formatReport`. YAML scenario loading (US7) shipped — `evals/run-evals.ts` discovers every `*.yaml` case in `evals/cases/` via `loadScenarios` (strike-health-check migrated; scout remains a TS import due to its empty `skill` field). Baseline library (`loadBaseline`, `compareToBaseline`) wired into the orchestrator: `run-evals.ts` calls both, `formatReport` renders a `baseline:` marker column, and `evals/baselines/strike-health-check.json` is committed as the first live baseline.**

See [CONTRIBUTING.md](CONTRIBUTING.md) for test file details. Agent and human test cases are in **[tests/](tests/)**: [tests/Agent.tests.md](tests/Agent.tests.md) (A-series), [tests/Manual.tests.md](tests/Manual.tests.md) (H-series).

### Notes

- The CLI uses interactive prompts (Inquirer), so interactive flows cannot be tested with piped stdin.
- To test slash commands in Claude Code: run `smithy init` targeting a test repo, then start a **new** Claude Code session in that repo. Claude Code must be restarted to pick up new/changed commands.
- The `--permissions` / `--no-permissions` flags control whether permissions are deployed at the selected location (`repo` or `user`).
- The `templatesBaseDir` path in the built CLI resolves to `../src/templates` relative to `dist/`, so `src/templates/` must exist at runtime (it's included in `package.json` `files`).
