# Tasks: Invoke Status via the smithy.status Skill

**Source**: `specs/2026-04-12-004-smithy-status-skill/smithy-status-skill.spec.md` — User Story 5
**Data Model**: `specs/2026-04-12-004-smithy-status-skill/smithy-status-skill.data-model.md`
**Contracts**: `specs/2026-04-12-004-smithy-status-skill/smithy-status-skill.contracts.md`
**Story Number**: 05

---

## Slice 1: Ship the smithy.status Shell-Delegation Skill

**Goal**: A working `smithy.status.prompt` template lives in the commands template
directory, auto-registers via the existing glob-based composition, and instructs
the invoking agent to shell out to `smithy status` with verbatim passthrough of
arguments, stdout, and errors. Hardcoded template-count and membership assertions
in `src/templates.test.ts` are updated so the suite stays green.

**Justification**: The CLI this skill wraps (`src/commands/status.ts`) is already
fully implemented from User Stories 1–4; there is no CLI work, no new
infrastructure, and no cross-cutting refactor. The work is a single new template
file plus a narrow update to existing test assertions. Template registration is
driven by directory placement and the existing auto-glob, so authoring and
test-update are inseparable — splitting them would produce a failing
intermediate commit.

**Addresses**: FR-014, FR-015; Acceptance Scenarios 5.1, 5.2, 5.3, 5.4.

### Tasks

- [x] **Author `smithy.status.prompt` shell-delegation skill template**

  Add a new command template at `src/templates/agent-skills/commands/smithy.status.prompt`.
  The YAML frontmatter and Markdown body must implement the thin shell-delegation
  wrapper contract defined in the contracts file (§2 "smithy.status Agent Skill")
  and satisfy AS 5.1–5.4 from the spec. The template must auto-register via the
  existing commands glob with no changes to the loader or agent-deployer code.

  _Acceptance criteria:_
  - Frontmatter declares `name: smithy-status` (hyphenated, matching all
    sibling command templates) and a concise `description`; no `command: true`
    field is present.
  - Body instructs the agent to shell out to `smithy status` and forward
    `$ARGUMENTS` unchanged, satisfying AS 5.1 and AS 5.3.
  - Body specifies that when no arguments are provided the current working
    directory is used implicitly by the CLI (no synthesized default path),
    satisfying AS 5.2.
  - Body instructs returning CLI stdout as-is, limiting any agent framing to at
    most one sentence, and never re-filtering or re-formatting CLI output,
    satisfying AS 5.1 and AS 5.3.
  - Body instructs that error output (the three conditions in contracts §2
    Error Conditions — CLI not on PATH, non-zero exit, empty output) is
    surfaced verbatim without reconstruction or paraphrase, satisfying AS 5.4.
  - Body includes a short fallback instruction covering the case where
    `$ARGUMENTS` is left as a literal token (e.g., under Gemini), consistent
    with the fallback pattern used by sibling command templates.

- [x] **Extend template-suite assertions to cover the new command**

  Update the hardcoded counts and membership lists in `src/templates.test.ts`
  so the composition and categorization tests recognize the new
  `smithy.status.md` as a registered command. Add a single behavioral assertion
  that back-stops the shell-delegation contract at the template level, so a
  future regression that drops the shell-out instruction fails the suite.

  _Acceptance criteria:_
  - The `byCategory.commands` length assertion is updated from 10 to 11.
  - The explicit commands membership list in the "commands includes expected
    template files" test includes `smithy.status.md`.
  - The `composed.commands` Map-membership assertion set in the
    `getComposedTemplates` suite includes `smithy.status.md` alongside the
    existing entries.
  - A behavioral assertion verifies that the composed `smithy.status.md` body
    contains the substring `smithy status` and references `$ARGUMENTS`,
    back-stopping the shell-out instruction and argument forwarding (AS 5.1,
    AS 5.3; AS 5.2 is implicit in unchanged arg forwarding — no synthesized
    default path).
  - A second behavioral assertion verifies that the composed body references
    verbatim error surfacing (e.g., a substring like `verbatim` in the
    error-handling context, or equivalent phrasing chosen to match the
    template body's final wording), back-stopping AS 5.4.
  - No other category counts (`prompts`, `agents`, `skills`) change; no
    unrelated tests are touched.
  - `npm test` passes with no other source changes.

**PR Outcome**: Merging this PR deploys `/smithy.status` as a Claude slash command
and a `smithy-status` Gemini skill via `smithy init`; invoking the skill shells
out to the already-implemented `smithy status` CLI and returns its output and
errors verbatim. `src/commands/status.ts`, `src/cli.ts`, and the agent deployers
are untouched.

---

## Specification Debt

| ID | Description | Source Category | Impact | Confidence | Status | Resolution |
|----|-------------|-----------------|--------|------------|--------|------------|
| SD-001 | inherited from spec: Exact ANSI color palette and tree-connector characters are not specified — will be resolved during implementation by matching existing smithy CLI output conventions. | Interaction & UX | Low | High | resolved | Resolved 2026-04-19 in spec — completion-state colors reuse the existing Smithy CLI theme palette (success/warning/error states) via the shared theme module; no hardcoded ANSI. |
| SD-002 | inherited from spec: The handling of `specs/strikes/` folder contents (lightweight strike artifacts that don't follow the full RFC → tasks hierarchy) is unspecified — are they rendered as a flat list, ignored, or promoted into the tree as orphans? | Functional Scope | Medium | Medium | resolved | Resolved 2026-04-19 in spec — strike artifacts are one-shot documents; the scanner ignores `.strike.md` files and skips the `specs/strikes/` directory. |
| SD-003 | inherited from spec: Whether the scanner should respect `.gitignore` / `.smithyignore` when walking the repo is undefined. | Functional Scope | Low | Medium | resolved | Resolved 2026-04-19 in spec — the scanner does not consult `.gitignore` or `.smithyignore`; discovery is purely extension-based on the fixed roots. |
| SD-004 | inherited from spec: Whether `smithy status --watch` (continuous refresh) is in scope is undefined — leaning out-of-scope for v1 but not stated. | Interaction & UX | Low | High | resolved | Resolved 2026-04-19 in spec — `--watch` is out of scope; users re-run `smithy status` to refresh. |
| SD-005 | inherited from spec: A one-time migration tool or script to convert legacy checkbox-based `## Dependency Order` sections to the new table format is implied by FR-020/FR-028 but not specified. Open question: manual edit, dedicated `smithy migrate` command, or a one-off script in `scripts/`? | Functional Scope | Medium | Medium | resolved | Resolved 2026-04-19 in spec — no migration tool. Users migrate by hand; legacy artifacts are flagged `format_legacy` and classified `unknown` per FR-028. |
| SD-006 | inherited from spec: The exact ASCII rendering for the `--graph` dependency layer view (plain indented list vs. tree connectors vs. Mermaid-style) is not pinned down. | Interaction & UX | Low | High | resolved | Resolved 2026-04-19 in spec — documented in `smithy-status-skill.contracts.md` §1 Outputs under "`--graph` text mode": labelled layer blocks with `├─` / `└─` connectors, per-node status markers, `(blocked by <ids>)` suffixes, `DONE`-layer collapsing, ASCII fallback under `--no-color` / `--ascii`. No Mermaid/Graphviz. |
| SD-007 | inherited from spec: Whether the `DependencyGraph` spans only the current scan root or can cross repository boundaries (mono-repo vs. multi-repo) is unaddressed. Leaning single-root but not stated. | Functional Scope | Low | High | resolved | Resolved 2026-04-19 in spec — the scanner operates only within the working directory where the command is issued (or the path passed via `--root`); cross-repo aggregation is out of scope. |
| SD-008 | inherited from spec: The interaction between `--graph` and `--status` / `--root` / `--type` filters is unspecified — does filtering prune the graph before layering, or does it hide filtered nodes within the full graph? | Interaction & UX | Medium | Medium | resolved | Resolved 2026-04-19 in spec — filters are applied BEFORE layering. `--status` / `--type` drop matching nodes from the graph input; remaining nodes are re-layered from scratch, so any node whose only blockers were filtered out promotes to Layer 0. `--root` narrows the scan root (and hence the graph inputs). Dangling-ref and cycle detection run on the filtered graph only. |
| SD-009 | inherited from spec: The documentation mirror required by FR-029 lives in two places (CLAUDE.md and `src/templates/agent-skills/README.md`). If those two drift from each other or from the spec, there is no automated check to catch it. A lint rule or doc-generation step is implied but not designed. | Integration | Medium | Medium | resolved | Resolved 2026-04-19 in spec — a lightweight vitest assertion (tracked under US8's tasks file, not US5) verifies both `CLAUDE.md` and `src/templates/agent-skills/README.md` contain the canonical 4-column schema header and ID prefixes (`M`, `F`, `US`, `S`). Drift fails CI. |
| SD-010 | The single behavioral test assertion covers AS 5.1 and AS 5.3 but does not explicitly cover AS 5.2 (no-args default to cwd) or AS 5.4 (verbatim error reporting for all three contracts error conditions). Open question: are these intentionally uncovered by unit tests (deferred to agent-session / eval tier), or should the behavioral assertion be expanded to multiple substring checks against the composed body? | Testing Strategy | Medium | Medium | resolved | Resolved 2026-04-19 — Slice 1 Task 2 now requires two behavioral assertions: (a) body contains `smithy status` and `$ARGUMENTS` (AS 5.1, AS 5.3; AS 5.2 implicit), and (b) body references verbatim error surfacing (AS 5.4). |
| SD-011 | Whether to include `{{>guidance-shell}}` in the template body is unpinned. The snippet's actual content (never embed subshells, prefer single-purpose commands) is plausibly applicable to an agent shelling out to `smithy status`, but the skill shells out exactly once to one well-known CLI, so the guardrail value is marginal. Reconciled plan leaned toward omit; this debt item records the decision is soft. | Scope Edges | Low | Medium | resolved | Resolved 2026-04-19 — omit `{{>guidance-shell}}`. The skill issues exactly one shell call to a known CLI with literal `$ARGUMENTS`; the snippet's multi-step-pipeline guardrails do not apply. If future edits add pipeline composition, include the partial at that point — but not for the one-shot wrapper. |
| SD-012 | The behavioral test assertion's exact substring-match shape is not specified, which risks either a brittle test (matching too specifically) or a weak test (matching anything). The task delegates the precise substring choice to the implement agent, but the choice affects regression-catching value. | Testing Strategy | Low | Medium | resolved | Resolved 2026-04-19 — the shell-out + arg-forwarding assertion checks for two separate substrings: `smithy status` (the command invocation) and `$ARGUMENTS` (the argument forwarding token). The error-handling assertion checks for a substring indicating verbatim error surfacing (implement agent chooses the final wording to match the body, e.g., `verbatim`). Two specific substrings together catch regressions without being brittle to prose rewrites. |
| SD-013 | Whether the frontmatter `name` field must be `smithy-status` (hyphenated) versus `smithy.status` (dotted). Resolution: resolved 2026-04-19 — verified that all 10 existing command templates in `src/templates/agent-skills/commands/*.prompt` use the hyphenated `smithy-<name>` form; the new template follows the same convention. | Technical Risk | Medium | High | resolved | Resolved 2026-04-19 — existing command templates uniformly use hyphenated `smithy-<name>` frontmatter; the new template follows the same convention. |
| SD-014 | The second task's acceptance criterion about `composed.commands` Map-membership implies an exhaustive list exists in the `getComposedTemplates` suite, but the relevant existing assertion is a spot-check of two entries. The implement agent may either extend the spot-check or add a dedicated `.has()` assertion; either satisfies the criterion, but the ambiguity may affect where the new check lands. | Task Scoping | Low | Medium | resolved | Resolved 2026-04-19 — extend the existing `categorizes templates correctly` spot-check to include `smithy.status.md`. No new dedicated test block; the spot-check pattern is the established convention. |

---

## Dependency Order

Recommended implementation sequence:

| ID | Title | Depends On | Artifact |
|----|-------|-----------|----------|
| S1 | Ship the smithy.status Shell-Delegation Skill | — | — |

### Cross-Story Dependencies

| Dependency | Direction | Notes |
|------------|-----------|-------|
| User Story 1: Scan Artifacts and Classify Status | depends on | US5's skill shells out to `smithy status`; US1 delivers the CLI subcommand the skill invokes. Already merged on this branch's trunk. |
| User Story 2: Render a Hierarchical Status View | depends on | The skill returns whatever the CLI renders; US2 provides the default tree output. Already merged on this branch's trunk. |
| User Story 3: Collapse Completed Items | depends on | Same — the skill forwards output produced with US3's collapsing behavior applied. Already merged on this branch's trunk. |
| User Story 4: Suggest the Next Command | depends on | Same — next-action suggestions rendered by US4 are included in the CLI output the skill returns verbatim. Already merged on this branch's trunk. |
