# Smithy CLI

Smithy is a CLI tool that bootstraps AI-assisted development workflows across multiple agentic coding CLIs (Claude Code, Gemini CLI, Codex). It installs prompt templates, slash commands, permissions, and orders body templates into a target repository so developers can invoke structured workflows like `/smithy.strike` directly from their AI assistant.

## What Smithy Does

`smithy init` deploys prompt files from `src/templates/agent-skills/` into agent-specific locations:

| Agent | Prompts | Commands (slash) | Agents (sub-agents) | Permissions |
|-------|---------|-------------------|---------------------|-------------|
| Claude | `.claude/prompts/` | `.claude/commands/` | `.claude/agents/smithy.<agent>.md` | `.claude/settings.json` |
| Gemini | `.gemini/skills/<name>/SKILL.md` | `.gemini/skills/<name>/SKILL.md` | (not deployed) | `.gemini/settings.json` |
| Codex | `tools/codex/prompts/` and `.agents/skills/<name>/SKILL.md` | `.agents/skills/<name>/SKILL.md` | `.codex/agents/smithy-<agent>.toml` | `.codex/rules/default.rules` |

Note the two sub-agent filename schemes: the Claude file derives from the source `.prompt` **filename** (`smithy.plan.prompt` → `.claude/agents/smithy.plan.md`), while the Codex file derives from the frontmatter **`name`** (`name: smithy-plan` → `.codex/agents/smithy-plan.toml`).

`smithy uninit` removes all deployed artifacts (but preserves config/permissions).

`smithy update` re-deploys templates using the settings stored in the manifest, handling version upgrades/downgrades.

## Architecture

- **CLI entry**: `src/cli.ts` — Commander setup and arg parsing.
- **Commands**: `src/commands/init.ts`, `src/commands/uninit.ts`, `src/commands/update.ts` — action handlers.
- **Agent deployers**: `src/agents/{claude,gemini,codex}.ts` — per-agent deploy/remove logic.
- **Templates**: `src/templates/agent-skills/{commands,prompts,agents}/*.prompt` — categorized by deployment target. Uses [Dotprompt](https://firebase.google.com/docs/genkit/dotprompt)'s native `.prompt` extension with YAML frontmatter (`name`, `description`). Dotprompt handles Handlebars rendering at deploy time — resolving partials (`{{>snippet-name}}`), conditionals (`{{#ifAgent}}...{{/ifAgent}}`), and other expressions. Frontmatter is kept verbatim for Gemini/Codex skills; on the Claude path, command frontmatter is *translated* to Claude's vocabulary (`src/command-frontmatter.ts`) and prompt frontmatter is stripped. Deployed files are translated to `.md`. See `src/templates/agent-skills/README.md` for full conventions.
- **Snippets**: `src/templates/agent-skills/snippets/*.md` — shared Markdown fragments injected via `{{>partial-name}}` Handlebars partials. Resolved by Dotprompt at deploy time; not deployed as standalone files.
- **Orders body templates**: `src/orders-templates.ts` — exports the four canonical default body strings (`rfc` / `features` / `spec` / `tasks`) plus the `provisionOrdersTemplates` function that `smithy init` calls to write them under `<manifestDir>/templates/orders/<type>.md`. The same defaults double as the built-in fallback bodies in `smithy.orders` (parity asserted in `src/templates.test.ts`).
- **Manifest**: `src/manifest.ts` — tracks deployed files in `.smithy/smithy-manifest.json` for reliable cleanup and upgrades.
- **Engraved read path**: `src/engraved/` — level resolution, record/ledger parsing, scanner, and text/JSON rendering behind `smithy status --engraved`. Separate from `src/status/` because engraved records are graph roots with no `## Dependency Order` lineage.
- **Build**: `tsup` bundles to `dist/cli.js` (ESM). Run `npm run build` to compile.

### Source vs. Deployed Artifacts

`src/templates/agent-skills/` is the **only** source of truth for prompts and
skills. The committed `.claude/` tree is a *snapshot* of a prior `smithy init`
run and is intentionally allowed to drift from it — **do not regenerate
`.claude/` or `.smithy/smithy-manifest.json` in a PR that edits source
templates.**

The rest of the authoring rules for that tree — compose-don't-copy,
portability, description budgets, `{{#ifAgent}}` gating — live in
[`.claude/rules/template-authoring.md`](.claude/rules/template-authoring.md),
which loads only while those files are open, and are enforced by
`src/template-lint.test.ts`.

## The Smithy Workflow Commands

Smithy provides a collection of workflow prompts, each for a different stage/style of development:

- **smithy.strike** — The lightweight "just do it" command. One-shot: explore, plan, write a `.strike.md` document, and create a PR in a single pass — no intermediate approval stops. This is the starting point we're actively developing. Living under `commands/` is what deploys it as a Claude Code slash command (`/smithy.strike`) — the directory is the signal; there is no `command:` frontmatter field.
- **smithy.spark** — Optional upstream entry point. Turns a raw idea into a ~1 page PRD (problem statement, proposed solution, alternatives / build-vs-buy) at `docs/prds/<YYYY>-<NNN>-<slug>.prd.md`. One-shot by default. The PRD can then feed `smithy.ignite`.
- **smithy.ignite** — Full pipeline kickoff for larger features (RFC, design, etc.). Accepts a PRD file path as input to workshop into an RFC.
- **smithy.forge** — Implementation executor that works from task specs
- **smithy.mark** — Feature specification command. Produces `.spec.md`, `.data-model.md`, and `.contracts.md` from a feature description, RFC, or `.features.md` feature map (auto-selects the first unspecced feature).
- **smithy.fix** — Minimal-diff bug fix from a GitHub issue
- **smithy.audit** — Audit a Smithy artifact against its checklist. Also covers engraved records (`.decision.md`, `.invariant.md`, principles), checking level placement and fit, ledger shape and derived alignment, tracking issues on `Temporary:` rows, edge resolution/direction, supersession symmetry, and citation form.
- **smithy.resolve** — Interactive specification-debt resolution. Given a planning artifact (and optionally a specific `SD-NNN` id), selects the first unresolved spec-debt item (or the named one), gathers context — walking **up** to the parent artifact for inherited items, since an inherited item's question prose lives in the parent — and poses the open choice to the operator as a guided, plan-mode-style exercise before recording the answer into the artifact's `### Resolved` subsection. The one Smithy command that deliberately stops for user input: on Claude it uses the `AskUserQuestion` tool (structured alternatives + recommendation), and falls back to a prose "ask and wait" gate on Gemini/Codex via an `{{#ifAgent 'claude'}}` branch. Resolution is recorded locally per the schema's inherited-debt rule (never written back to the parent).
- **smithy.orders** — Create GitHub issues from any smithy artifact file (`.rfc.md`, `.features.md`, `.spec.md`, `.tasks.md`). Auto-detects artifact type by extension and creates structured issue bodies, using `<manifestDir>/templates/orders/<type>.md` when present and otherwise falling back to the built-in heredoc bodies defined inline in `src/templates/agent-skills/commands/smithy.orders.prompt` (kept in lockstep with the canonical defaults exported by `src/orders-templates.ts` via a parity assertion in `src/templates.test.ts`).
- **smithy.status** — Show the current status of every Smithy planning artifact in the repo. Deployed as a Claude Code skill (auto-activates on natural-language questions like "what's next?" or "which user stories are left?") and still invocable explicitly via `/smithy.status …`. Pass-through mode shells out to `smithy status` with the user's flags and returns CLI output verbatim; question mode runs `smithy status --format json` — or `smithy status --engraved --format json` for durable-knowledge questions like "which global rules am I subject to?" — and answers the user's question from the parsed payload (no LLM reconstruction of status, dependencies, or next actions).

### Sub-Agents (not user-invocable)

- **smithy-plan** — Design sub-agent: explores codebase, proposes approach, identifies risks and tradeoffs. Dispatched once per focus lens for competing perspectives, through the `competing-lenses-implementation` (3 lenses) and `competing-lenses-scoping` (4 lenses) snippets (used by strike, ignite, render, mark)
- **smithy-reconcile** — Reconciliation sub-agent: synthesizes outputs from multiple competing smithy-plan runs into a single coherent plan (used by strike, ignite, render, mark — dispatched from the same competing-lenses snippets)
- **smithy-slice** — Decomposition sub-agent: the `smithy-plan` analogue for task slicing. Explores the codebase and proposes PR-sized slices with well-scoped tasks, dispatched once per focus lens through `competing-lenses-decomposition` (used by cut)
- **smithy-reconcile-slices** — Slice reconciliation sub-agent: synthesizes competing smithy-slice runs at two levels — slice boundaries and task lists (used by cut)
- **smithy-clarify** — Ambiguity scanning and triage into assumptions and specification debt (used by strike, ignite, render, mark, cut, spark)
- **smithy-refine** — Artifact review and refinement findings against the categories its parent passes, plus the three standing `drift-categories` it assesses on every pass whatever the parent asked for (used by ignite, render, mark, cut in Phase 0, and by spark)
- **smithy-implement** — TDD implementation: failing test → code → commit (used by forge)
- **smithy-implementation-review** — Read-only code review; returns findings for forge to apply (used by forge)
- **smithy-plan-review** — Read-only self-consistency review of planning artifacts: catches internal contradictions, logical gaps, assumption-output drift, debt completeness, and brittle references, plus the carriage-level classes the `drift-categories` snippet adds — restated protocol, dead reference, and internal content in a deliverable, all `hygiene` by construction. Every finding carries a `kind` (`steering` / `implementation` / `hygiene`) set *before* severity × confidence triage — only `steering` findings can become specification debt, and a steering finding is never auto-applied. The gate itself lives in the shared `review-protocol` snippet so every review surface gets it, including the Gemini/degraded inline paths that never load a sub-agent. Returns findings; parent commands apply fixes. (used by strike, ignite, render, mark, cut after artifact generation)
- **smithy-scout** — Pre-planning consistency scan (used by render, mark, cut)
- **smithy-maid** — Post-implementation doc staleness scan (used by forge)
- **smithy-prose** — Narrative/persuasive prose drafting for RFC sections and planning artifacts (used by ignite for Summary, Motivation, Personas; by spark for the PRD Problem Statement; and by persona for the `.persona.md` narrative body)
- **smithy-recall** — Read-only engraved-knowledge recall across the user / repo / project levels: ranks level-tagged records, flags candidate invariant exceptions with their ledger severity, reports declared vs. undeclared cross-level conflicts, and flags retired-decision citation hazards. Advisory only — parents escalate (used by strike, ignite, render, mark, cut in the scan phase)
- **smithy-survey** — WebFetch/WebSearch-enabled landscape survey: finds off-the-shelf alternatives and returns a structured build-vs-buy rationale (used by spark during PRD drafting; first smithy sub-agent to use web-research tools)

### Operational Skills (lazy-loaded, body-on-demand)

Skills live in `src/templates/agent-skills/skills/<name>/SKILL.prompt`. Their
frontmatter (`name`, `description`) is always advertised so calling agents know
they exist, but the body only loads when the agent invokes
`Skill("<name>")`. Use this category for capabilities that are situational —
agents shouldn't pay for the context unless they hit the trigger.

**Two levels of laziness.** The body is charged in full on every invocation, so
material an agent needs only *sometimes* goes one level further out: a skill
directory may bundle reference files (`references/*.prompt`, deployed as `.md`
like every other template) that the body **links** to instead of inlining, and
the deployers ship them to all three targets with manifest tracking. Bodies stay under the ~500-line ceiling Claude Code
documents (enforced in `src/templates.test.ts`), every bundled file is linked
from the body that ships it, and the link says *when* to read it. Full
convention — including why `paths:` frontmatter is deliberately not used — in
[`src/templates/agent-skills/README.md`](src/templates/agent-skills/README.md#skill-bundles-and-progressive-disclosure).

**Naming convention:** new helper skills that teach an agent how to handle a
specific operational situation use the `smithy.helper-<topic>` prefix so they
group together alphabetically and stand visually apart from slash commands
(`smithy.<command>`) and operations skills (`smithy.<topic>-<action>`).

- **smithy.pr-review** — GitHub PR review operations (find-pr, list inline comments, reply to comment) backed by shell scripts in `scripts/`. Used by `smithy.fix` when handling review feedback. Predates the `helper-` convention.
- **smithy.helper-docker** — Diagnostic procedures for Docker container failures: bound waits, inspect/log triage, recover-vs-escalate rules, pre-flight checks. Body-only (no scripts). Advertised by `smithy.forge` so it can fall back when validation hits docker problems.
- **smithy.helper-documentation** — The artifact-shape layer for documentation, and the **user-facing entry point** for ad-hoc doc review (Smithy-authored or not). Runs an audience inventory + fit-for-purpose check ("does any single reader-cell need > ~60% of this artifact?"), recommends a multi-artifact split / single-artifact restructure / leave-as-is, designs the navigation artifact when splitting, then pulls in `smithy.helper-voice` as a sub-skill for prose-level cleanup. Body-only. Use this before voice cleanup on any multi-audience doc — a voice pass can't see (or fix) an artifact that should be several artifacts.
- **smithy.helper-voice** — Section- and prose-level voice and audience guidance (planning artifacts, migration plans, ADRs, runbooks, READMEs, inline documentation). The body carries the Role × Diátaxis-mode taxonomy, the per-cell voice rules, conciseness budgets, diagram-first framing, depth-control rules, and the policy for where `<!-- audience: ... -->` tags live; four `references/` files carry the rest on demand — the review-mode anti-pattern checklist (structural checks plus prose-comprehension ones: unglossed terms, schema-without-instance, internals leakage, conviction drift, bare cross-references, authoring-process / author-directed commentary, and two self-checks on the review pass itself), the tag grammar `smithy.audit`'s voice-tag lint enforces (`snippets/audit-checklist-voice.md`), three worked before/after examples, and genre presets for non-Smithy deliverables. **Not a direct user entry point** — invoked by `smithy.helper-documentation` and the authoring commands/agents (render / mark / cut / engrave / ignite / spark / strike / prose); artifact-level commingling escalates up to `smithy.helper-documentation`. No scripts; lazy-loaded for both draft and review/cleanup modes.

## Key Concepts

### Template Categories
Templates are organized by their deployment target:
- **`commands/`** — invocable as slash commands (e.g., `/smithy.strike "add verbose flag"`). Deployed to `.claude/commands/` for Claude, `.agents/skills/` for Codex, `.gemini/skills/` for Gemini.
- **`prompts/`** — reference files the AI can read, but NOT invocable as `/command`. Deployed to `.claude/prompts/` for Claude, `tools/codex/prompts/` for Codex, `.gemini/skills/` for Gemini.
- **`agents/`** — sub-agent definitions. Deployed to `.claude/agents/<name>.md` (frontmatter intact) for Claude and translated into Codex custom-agent TOML at `.codex/agents/<name>.toml`. Each agent declares a provider-neutral model `tier` (`light`/`standard`/`deep`) + optional `effort`, translated per-provider by `src/agent-models.ts` (Claude → `model:`, Codex → `model_reasoning_effort`). Not deployed for Gemini, which stays on the inline fallback path.
- **`skills/`** — lazy-loaded operational skills. Each skill is a directory containing a `SKILL.prompt` (frontmatter retained at deploy) plus optional `scripts/` and bundled reference files (`references/*.prompt` → `.md`) the body links to instead of inlining. Deployed to `.claude/skills/<name>/SKILL.md`, `.gemini/skills/<name>/SKILL.md`, and `.agents/skills/<name>/SKILL.md` for Codex (+ executable `scripts/` and any bundled files at their original relative paths).
- **`snippets/`** — shared Markdown fragments injected into other templates via `{{>partial-name}}` Handlebars partials (resolved by Dotprompt at deploy time).

### Cross-Agent Compatibility
The same template source serves all three agents. Gemini and Codex keep frontmatter verbatim for skill metadata; Claude retains it for sub-agents and skills, strips it from reference prompts, and **translates** it for commands. The prompt text uses `$ARGUMENTS` which Claude replaces but Gemini/Codex leave as literal — so prompts include a fallback: "If no feature description is clear, ask the user."

The one skill-metadata key that is *not* shared is the tool grant. `allowed-tools` is Claude Code's field in Claude Code's permission grammar, so `src/skill-frontmatter.ts` picks per target at deploy: Claude keeps it, Gemini drops it (its allowlist lives in `.gemini/settings.json`), and Codex gets whatever the template declared under `codex-allowed-tools` — which is how the Codex GitHub-app actions reach Codex without riding along as dead entries in Claude's copy.

### Permission Grammar

Every permission rule Smithy writes — the `.claude/settings.json` allow/ask/deny lists generated from `src/permissions.ts`, and the `allowed-tools` frontmatter of the script-backed skills — uses one verified Bash form: `Bash(command *)`, never the equivalent-but-second-spelling `Bash(command:*)` and never a glued `Bash(command*)` (which drops the word boundary). Skill-bundled scripts are reached through `${CLAUDE_SKILL_DIR}`, which Claude Code expands in the rule and in the skill body alike. `Skill(name)` / `Skill(name *)` is the whole Skill grammar — there is no wildcard inside the name. Because a trailing ` *` already matches at a word boundary or end-of-string, `buildClaudeAllowList` prunes rules another rule covers; the shared table keeps those variants for Gemini, whose matcher does not treat `*` as covering flags. Full rules, the settings-vs-frontmatter fallback split, and version notes: [docs/permission-grammar.md](docs/permission-grammar.md).

### Claude Command Frontmatter

Claude Code advertises `.claude/commands/*.md` through the same registry skills use and drives that entry from the file's frontmatter, so the block is the command's only trigger signal. `src/command-frontmatter.ts` reduces the source block to the keys Claude Code reads — `description`, `argument-hint`, `disable-model-invocation`, `allowed-tools`, `model`, `context`, `agent`, `background`, `hooks` — and drops everything else, notably `name` (the dashed Codex spelling used to pick the Gemini/Codex skill directory; a Claude command is named by its filename instead). Unknown keys are dropped rather than rejected: one source block is the union of what all three targets need.

Every command template declares `description`, `argument-hint`, and `disable-model-invocation: true` — all 13 Smithy commands are explicit pipeline steps the operator drives, so none should auto-fire, and keeping them out of the model registry recovers that context. `smithy.status` remains model-invocable because it ships as a skill, not a command. `src/templates.test.ts` enforces the contract on the source templates and through the Claude translation.

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

### Specification Debt vs. Open Implementation Questions

`## Specification Debt` is a **decision queue for a human**: a row belongs there
only when a person must pick between named alternatives and the pick changes
what gets built. Everything else the planning pass does not know has a
different home, decided by the kind gate before any severity × confidence
triage. The gate has one definition — `snippets/kind-gate.md` — composed by
`smithy-clarify` (Step 3b), `smithy-refine`, and both review agents via
`snippets/review-protocol.md`; the parent commands compose the consequence
table from `snippets/plan-review-triage.md`. Only the reroute for a rejected
candidate differs by consumer: the review agents name a different `kind` and
let the parent file it, while clarify (which emits no `kind`) routes to its
assumption stream with a `[Critical Assumption]` annotation and refine routes
to `refinements`, both pointed at the home the gate's routing table names.

| Kind | Home |
|------|------|
| `steering` | `## Specification Debt` |
| `implementation` — settled by building, testing, or reading source | `## Open Implementation Questions`, a `.tasks.md`-only section of `IQ-NNN` rows sitting between `## Specification Debt` and `## Dependency Order` |
| `hygiene` — a knowable correction, a wrong table, a stale path | Applied as a write-back, or listed in the PR body |

`IQ-NNN` numbering is independent of `SD-NNN`, and the section carries no
lifecycle — the merged code is the answer. `smithy.cut` applies the same gate
when inheriting a spec's debt, so a legacy spec's implementation unknowns are
demoted to `IQ` rows rather than re-inherited as debt into every tasks file.
Full schema in `src/templates/agent-skills/README.md`.

### Implementation Repo Declaration

Every slice must be implementable in exactly one repository — `smithy.forge`
runs in one worktree and produces one PR, so a slice spanning repos cannot be
implemented and must be split along the repo boundary.

**Cross-repo planning only** (a `~/.smithy/projects/…` store spanning several
checkouts), a `.tasks.md` file also names where its work lands: an
`**Implementation repo**` header field (exactly one repo, never a list) plus an
optional per-slice `**Repo**` override, resolved slice-override-then-header.
Single-repo and monorepo tasks files declare nothing — there is one possible
answer — and the fields are simply absent. `smithy status --format json`
reports whatever was declared on tasks records, slice summaries, and slice
graph nodes, and validates nothing; `smithy.forge` owns the only check, failing
fast when a declared repo is not the one it is standing in. Full schema in
`src/templates/agent-skills/README.md`.

### Engraved Knowledge (Decisions, Invariants, Principles)

A separate root-level artifact family captures **durable commitments** —
decisions, invariants, and principles — authored with `smithy.engrave`
(EPIC #412, in-flight). These records are **roots**: they have no
`## Dependency Order` row and participate in the graph through citation
edges (`establishes` / `established_by`, `supersedes` / `superseded_by`,
`excepts`) declared in YAML frontmatter. Suffixes: `*.decision.md`,
`*.invariant.md`; principles live as individual files in the constitution
directory and have no dedicated suffix. The full schema (frontmatter fields,
lifecycle, Known-Exceptions ledger column rules, scaffold shapes for each
kind) lives inline in
[`src/templates/agent-skills/commands/smithy.engrave.prompt`](src/templates/agent-skills/commands/smithy.engrave.prompt)
— that prompt is the single source of truth for the family, and gets
deployed verbatim into every target repo's agent-skill tree.

**Levels.** Engraved records are scoped by level, not by lineage, so a
planning command can answer *which rules apply to the work in front of me*:

| Level | Store | Holds |
|-------|-------|-------|
| `user` | `~/.smithy/` (records in `decisions/`, `invariants/`, `constitution/`) | True in every repo and project |
| `repo` | `{{artifactsRoot}}` (the repo, or its external store) | True for this repo and every workstream in it |
| `project` | `~/.smithy/projects/<project>/` (same three children) | True for one named workstream |

Ids carry the level (`U-D-1`, `D-1`, `PJ-D-1`), so a bare citation names
exactly one record within a resolution scope. Precedence is
**project > repo > user**; a narrower record may add to or tighten a broader
one freely, but contradicting one requires declaring `excepts: [<broader-id>]`.
Supersession never crosses levels. The level model — stores, ids, precedence,
`scope` semantics, edge legality, citation forms — lives in
[`src/templates/agent-skills/snippets/engraved-levels.md`](src/templates/agent-skills/snippets/engraved-levels.md)
and is nested by both `smithy.engrave` and the recall rules so the authoring
and reading sides cannot drift.

Only the `repo` level carries a `docs/` segment (`{{artifactsRoot}}docs/decisions/`),
because that is where in-repo records already live and moving them would break
every citation naming one. The two home-anchored stores sit their records
directly under the store root.

**The user store is never managed.** Its record directories are siblings of
Smithy's own entries under `~/.smithy/`, but nothing ever adds one to a
manifest's `files` array — which is what `uninit` deletes and `update`
rewrites. Nothing provisions them either: `smithy.engrave` creates the leaf it
writes into, so a level with no records reports itself absent instead of
looking present forever. `src/engraved/engraved-store.test.ts` drives the real
CLI through init/update/uninit to lock the isolation guarantee.

**Reading them.** `smithy status --engraved` inventories all three levels
(`--project <slug>` to name a workstream, `--format json` for the machine
shape), backed by `src/engraved/`. The planning commands consult them through
the `smithy-recall` sub-agent during their scan phase, which returns
level-tagged records, invariant conflicts with their ledger `severity`, and
declared vs. undeclared cross-level conflicts. Recall stays advisory —
escalation is the parent command's job, and is keyed deterministically on
`severity`.

## Development

```bash
npm run build        # Build with tsup
npm run typecheck    # Type-check without emitting
npm test             # Run all tests
npm run eval         # Run evals framework (default claude; supports -- --agent gemini/codex)
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
3. **Agent-skill execution behavior** (Tier 3) — skills produce correct output when invoked by an AI agent, sub-agents are dispatched, output structure matches expectations. Covered by evals framework (`npm run eval` locally, or the `Smithy Evals` GitHub Actions workflow on demand — not wired to default `push`/`pull_request` CI). **Status: runner, entry point, structural validator, report library, strike, scout, and spark end-to-end scenarios implemented and wired into the orchestrator (stream parser, runner, `validateStructure`, `verifySubAgents`, `scenarioRunToResult`, `buildReport`, `formatReport`, `scoutScenario`, `--case` filter, `npm run eval` and `npm run test:evals` wired); fixture carries documented planted inconsistencies for scout detection; `run-evals.ts` now emits a full `EvalReport` summary via `formatReport`. YAML scenario loading (US7) shipped — `evals/run-evals.ts` discovers every `*.yaml` case in `evals/cases/` via `loadScenarios` (strike-health-check migrated; scout remains a TS import due to its empty `skill` field). Baseline library (`loadBaseline`, `compareToBaseline`) wired into the orchestrator: `run-evals.ts` calls both, `formatReport` renders a `baseline:` marker column, and `evals/baselines/strike-health-check.json` is committed as the first live baseline.**

See [CONTRIBUTING.md](CONTRIBUTING.md) for test file details. Agent and human test cases are in **[tests/](tests/)**: [tests/Agent.tests.md](tests/Agent.tests.md) (A-series), [tests/Manual.tests.md](tests/Manual.tests.md) (H-series).

### Notes

- The CLI uses interactive prompts (Inquirer), so interactive flows cannot be tested with piped stdin.
- To test slash commands in Claude Code: run `smithy init` targeting a test repo, then start a **new** Claude Code session in that repo. Claude Code must be restarted to pick up new/changed commands.
- The `--permissions` / `--no-permissions` flags control whether permissions are deployed at the selected location (`repo` or `user`).
- The `templatesBaseDir` path in the built CLI resolves to `../src/templates` relative to `dist/`, so `src/templates/` must exist at runtime (it's included in `package.json` `files`).

<!-- smithy:engraved:begin -->
## Engraved Knowledge

This repository maintains engraved durable knowledge: decisions, invariants,
and principles. Before planning or making changes, read the applicable records
under these locations and judge whether they apply to the work at hand.

- docs/decisions/
- docs/invariants/
- docs/constitution/
<!-- smithy:engraved:end -->
