# Feature Specification: Expand Evals Coverage Across Planning Commands

**Spec Folder**: `2026-05-03-005-expand-evals-coverage-planning-and-audit`
**Branch**: `2026-05-03-005-expand-evals-coverage-planning-and-audit`
**Created**: 2026-05-03
**Status**: Draft
**Input**: User description — expand the existing evals framework (currently `strike-health-check` and `scout-fixture-shallow` only) to also cover the smithy planning commands `spark`, `ignite`, `render`, `mark`, `cut`, plus the basic `audit` command. Out of scope this round: `forge`, `fix`, `orders`. The original feature description also asked for a GHA on-demand workflow using the Anthropic Messages Batches API and the deprecation of `tests/Agent.tests.md` — both deferred to a follow-up feature after a Batch-API spike (see `## Out of Scope`).

## Clarifications

### Session 2026-05-03

- Each new scenario lives in `evals/cases/<command>-<descriptor>.yaml` following the existing `strike-health-check.yaml` shape; auto-discovery via `loadScenarios` requires no orchestrator changes. `[Critical Assumption]`
- Planted parent artifacts (PRD, RFC, features-map, spec, flawed-spec) live under scenario-isolated subdirectories at `evals/fixture/{prds,rfcs,specs}/<scenario-slug>/`. Each plant is owned by exactly one scenario; scenarios reference them by **exact path** in the prompt — no command-side auto-selection. Existing scout plants under `evals/fixture/src/routes/users.ts` are untouched. `[Critical Assumption]`
- Mark, cut, render scenarios pass exact paths (e.g., `evals/fixture/rfcs/mark-eval/01-core.features.md 1`) so mark's "first unspecced feature" routing rule never crosses into a sibling scenario's plant. `[Critical Assumption]`
- The audit scenario uses File Argument Mode (`/smithy.audit <exact-path>`) against a planted `.spec.md` whose flaw is **a missing `## Dependency Order` table** — chosen because the canonical 4-column dependency-order schema is locked in `src/templates/agent-skills/README.md` (per CLAUDE.md) and is the most stable invariant the audit checklist asserts against. The scenario asserts audit emits a `Critical` finding plus the literal string `Dependency Order` somewhere in its output. `[Critical Assumption]`
- Each scenario's `required_headings` is derived from the **template's literal output code-fence** (the `## ...` headings inside the `.prompt` template's Output / RFC template / spec template / one-shot snippet), not from prose narration. Headings sourced from rendered template literals are template-stable; competing-lens prose headings are not. `[Critical Assumption]`
- Each scenario's `sub_agent_evidence` patterns target template-driven output markers (matching the strike pattern `## Plan\n\n\*\*Directive\*\*` for smithy-plan). Evidence sets per command are documented in `### Sub-Agent Evidence Matrix` below. `[Critical Assumption]`
- Spark's empty-state survey is matched as a regex alternation in `required_patterns` accepting either the populated `### Alternatives Considered` table header **or** the literal stub string from `smithy.spark.prompt`. Survey error states are intentionally **not** accepted — if survey errors, the scenario fails. `[Critical Assumption]`
- The strike + scout scenarios continue to pass unchanged; this feature is strictly additive to `evals/cases/`, `evals/fixture/`, and (non-mandatory) `evals/baselines/`.
- Baselines for the six new scenarios are **deferred** this round. The convention-based loader (`loadBaseline` returns `null` on missing file) makes baselines opt-in per-scenario, so adding scenarios without baselines is a no-op in `run-evals.ts`.
- Scenarios that exceed the runner's 120s `DEFAULT_TIMEOUT_MS` (ignite, render, mark, cut all dispatch multi-phase sub-agent fan-out) carry an explicit `timeout:` field in their YAML. Concrete timeout values are calibrated empirically during implementation (see SD-006).
- `forbidden_patterns` for every new scenario reuses the strike convention: `"I'd be happy to help"`, `"Sure, here's"`, and `'^---\r?\n'` (leading YAML frontmatter).
- Run-time impact for the full `npm run eval` invocation grows from ~10 min (2 scenarios) to ~30-60 min (8 scenarios). The local-on-demand model accepts this; users who need a single scenario use `--case`.

## Artifact Hierarchy

RFC → Milestone → Feature → User Story → Slice → Tasks

This feature lives at the user-story level: it produces a set of additive YAML scenarios + planted fixture artifacts within an existing project (no parent RFC; the originating PRD-equivalent is the user description above).

## User Scenarios & Testing *(mandatory)*

### User Story 1: Audit eval validates the audit command catches a planted flaw (Priority: P1)

As a Smithy maintainer, I want an automated eval that exercises `/smithy.audit` against a deliberately-flawed `.spec.md` and confirms audit identifies the flaw, so that a regression in the audit checklist's spec extension is caught locally before release.

**Why this priority**: Audit is the simplest validation surface — single-agent, no sub-agent dispatch, deterministic input/output relationship. It establishes the planted-flaw eval pattern (mirroring scout's existing fixture inconsistencies) that the rest of the suite reuses, and gives the highest signal-per-token of any new scenario.

**Independent Test**: With the planted flawed-spec artifact and the new YAML scenario in place, `npm run eval -- --case audit-flawed-spec` runs to completion and reports PASS. Reverting the planted flaw (adding the missing `## Dependency Order` table) causes the scenario to FAIL on the next run.

**Acceptance Scenarios**:

1. **Given** the planted flawed-spec artifact at `evals/fixture/specs/audit-eval/<slug>.spec.md` (with no `## Dependency Order` section), **When** `npm run eval -- --case audit-flawed-spec` runs, **Then** the scenario PASSES with audit's output containing the literal string `Dependency Order` and at least one `Critical` severity label.
2. **Given** the planted flawed-spec is repaired (its `## Dependency Order` table is restored), **When** the scenario runs, **Then** it FAILS — proving the eval is gated on audit's detection capability, not on audit running at all.
3. **Given** the audit prompt template is edited in a way that breaks file-argument mode entirely, **When** the scenario runs, **Then** it FAILS with a `forbidden pattern` or missing-heading error — surfacing the regression to the user.

---

### User Story 2: Mark eval validates the mark command produces a complete spec artifact set (Priority: P1)

As a Smithy maintainer, I want an automated eval that runs `/smithy.mark` against a planted `.features.md` (with an explicit feature number) and confirms mark emits the documented one-shot output snippet plus dispatches the documented sub-agents, so that regressions in mark's specification flow are caught locally before release.

**Why this priority**: Mark is the most-edited planning command in the codebase and the one this feature was authored through. Its output is the most heavily exercised by downstream commands (cut consumes its specs; audit reviews them). Locking mark's terminal-output contract gives high regression coverage per scenario.

**Independent Test**: With the planted features-map at `evals/fixture/rfcs/mark-eval/01-core.features.md`, `npm run eval -- --case mark-from-features` runs to completion and reports PASS, with sub-agent evidence showing smithy-scout, smithy-plan, smithy-clarify, smithy-refine, and smithy-plan-review dispatches.

**Acceptance Scenarios**:

1. **Given** the planted features-map and at least one feature whose `Artifact` cell is `—`, **When** the scenario runs with prompt `evals/fixture/rfcs/mark-eval/01-core.features.md 1`, **Then** mark's terminal output contains the one-shot snippet's mandatory headings (`## Summary`, `## Assumptions`, `## Specification Debt`, `## PR`) and a `**Spec folder**:` bullet pointing into a temp-dir-relative `specs/...` path.
2. **Given** the scenario's `sub_agent_evidence` lists smithy-scout, smithy-plan, smithy-clarify, smithy-refine, and smithy-plan-review, **When** the run completes, **Then** every listed pattern matches against either the canonical text or a dispatched-agent record.
3. **Given** the planted features-map references a feature number that is out of range, **When** the prompt is corrected to a valid number, **Then** the scenario PASSES on rerun without source fixture changes (the source-fixture checksum invariant established by the original evals spec is preserved; in this spec see FR-013).
4. **Given** mark dispatches `git checkout -b` and `gh pr create` during its workflow, **When** the scenario runs in the temp fixture copy, **Then** the scenario PASSES even if `gh` authentication is absent — the structural expectations match against either the success or PR-creation-failure branch of the one-shot snippet.

---

### User Story 3: Cut eval validates the cut command produces tasks with inherited spec debt (Priority: P1)

As a Smithy maintainer, I want an automated eval that runs `/smithy.cut` against a planted `.spec.md` (with at least one user story and at least one open `## Specification Debt` row) and confirms cut emits the tasks-file's documented one-shot output snippet plus inherits the debt row, so that regressions in cut's task-decomposition flow are caught locally before release.

**Why this priority**: Cut is the second-most-used planning command and the one the deprecated `tests/Agent.tests.md` A9 was specifically validating (debt inheritance from spec to tasks). Replacing A9's manual procedure with an automated eval is one of the load-bearing motivations for this feature.

**Independent Test**: With the planted spec at `evals/fixture/specs/cut-eval/<slug>.spec.md`, `npm run eval -- --case cut-from-spec` runs to completion and reports PASS, with sub-agent evidence covering smithy-scout, smithy-clarify, and smithy-plan-review.

**Acceptance Scenarios**:

1. **Given** the planted spec contains an `SD-001` row with status `open` in its `## Specification Debt` table, **When** cut runs against it, **Then** the resulting tasks-file output contains a `## Specification Debt` section whose row has Status `inherited` and Description prefixed with `inherited from spec:`.
2. **Given** the planted spec contains at least one user story with `US1` in `## Dependency Order`, **When** cut runs, **Then** the tasks-file's terminal output contains a `## Dependency Order` table with at least one slice ID (`S1`, `S2`, ...).
3. **Given** the runner copies the fixture to a temp directory before each run, **When** cut writes its `<NN>-<story-slug>.tasks.md` file, **Then** the source fixture's checksum is unchanged after the scenario completes.

---

### User Story 4: Render eval validates the render command produces a feature map from an RFC (Priority: P2)

As a Smithy maintainer, I want an automated eval that runs `/smithy.render` against a planted `.rfc.md` (with at least one milestone) and confirms render emits the documented features-map structure, so that regressions in render's milestone-to-features decomposition are caught locally before release.

**Why this priority**: Render is less-frequently invoked than mark/cut but produces the load-bearing feature map that mark consumes. Coverage is needed before deprecating Agent.tests.md (a follow-up feature), but lower priority than the commands manipulated daily.

**Independent Test**: With the planted RFC at `evals/fixture/rfcs/render-eval/<slug>.rfc.md` (containing `### Milestone 1: ...`), `npm run eval -- --case render-from-rfc` runs to completion and reports PASS.

**Acceptance Scenarios**:

1. **Given** the planted RFC contains at least one `### Milestone N:` heading, **When** render runs against it (prompt: `evals/fixture/rfcs/render-eval/<slug>.rfc.md`), **Then** render's output contains the one-shot snippet's mandatory headings plus references to the rendered features-map path.
2. **Given** render dispatches smithy-scout, smithy-clarify, and smithy-plan-review per the template, **When** the run completes, **Then** the scenario's `sub_agent_evidence` patterns match for all three agents.

---

### User Story 5: Ignite eval validates the ignite command produces an RFC from a PRD (Priority: P2)

As a Smithy maintainer, I want an automated eval that runs `/smithy.ignite` against a planted `.prd.md` and confirms ignite emits the documented RFC structure plus dispatches smithy-prose, so that regressions in ignite's PRD-to-RFC workflow are caught locally before release.

**Why this priority**: Ignite is the least-frequently invoked planning command in normal use but the one with the most sub-agent fan-out (3 plan lenses + reconcile + clarify + prose + plan-review). Its scenario doubles as a stress test for sub-agent dispatch verification under heavy fan-out.

**Independent Test**: With the planted PRD at `evals/fixture/prds/ignite-eval/<slug>.prd.md`, `npm run eval -- --case ignite-from-prd` runs to completion and reports PASS within the scenario's calibrated `timeout:`.

**Acceptance Scenarios**:

1. **Given** the planted PRD contains the standard PRD sections, **When** ignite runs against it (prompt: `evals/fixture/prds/ignite-eval/<slug>.prd.md`), **Then** ignite's output contains the one-shot snippet's headings (`## Summary`, `## Assumptions`, `## Specification Debt`, `## PR`) plus a `**RFC path**:` or equivalent terminal marker.
2. **Given** the scenario's `sub_agent_evidence` covers smithy-prose, smithy-plan, smithy-clarify, and smithy-plan-review, **When** the run completes, **Then** every listed pattern matches.
3. **Given** ignite's full pipeline routinely takes 5-10 min, **When** the scenario runs with no `timeout:` field, **Then** the scenario fails with `timed_out: true`; **with** the calibrated `timeout:` field, **Then** it completes successfully.

---

### User Story 6: Spark eval validates the spark command produces a PRD from an idea, tolerating empty-state survey output (Priority: P2)

As a Smithy maintainer, I want an automated eval that runs `/smithy.spark` against a one-line idea prompt and confirms spark emits the documented PRD structure, accepting either a populated survey table or the documented empty-state stub, so that regressions in spark's PRD generation are caught locally without coupling to web-research availability.

**Why this priority**: Spark is the upstream entry point of the planning pipeline but produces the smallest artifact and exercises the smallest sub-agent set. The web-research dependency (smithy-survey via WebFetch/WebSearch) makes it the flakiest scenario, justifying a tolerant structural contract.

**Independent Test**: With no fixture plants required (spark's input is the idea text in the prompt), `npm run eval -- --case spark-from-idea` runs to completion and reports PASS regardless of whether smithy-survey returns populated alternatives or the empty-state stub.

**Acceptance Scenarios**:

1. **Given** the scenario prompt is a one-line idea (e.g., `add a CLI flag to dump a scenario's runtime in CSV format`), **When** spark runs against it, **Then** spark's output contains the one-shot snippet's headings plus a `**PRD path**:` or equivalent terminal marker.
2. **Given** smithy-survey returns a populated `### Alternatives Considered` table, **When** the run completes, **Then** the scenario PASSES via the table-header alternative in `required_patterns`.
3. **Given** smithy-survey returns the documented empty-state stub (e.g., `No comparable off-the-shelf options identified during survey.`), **When** the run completes, **Then** the scenario PASSES via the stub-string alternative in `required_patterns`.
4. **Given** smithy-survey errors out (network unavailable, rate limit, or other failure), **When** the run completes, **Then** the scenario FAILS — survey error states are intentional signals.

---

### Edge Cases

- A scenario that requires `git` operations inside the temp fixture copy (mark, cut, render, ignite all run `git checkout -b`) needs a working git repository in the temp copy. Either the fixture is a standalone git repo, or the runner initializes one before deploying skills. (See SD-007.)
- `gh pr create` fails when no GitHub authentication is available in the eval context. Scenarios must structurally match against the one-shot snippet's PR-creation-failure branch as a valid output, not just the success branch. (See SD-008.)
- Mark's auto-selection routing ("first unspecced feature") must never pick up a plant intended for a different scenario. Scenarios reference plants by exact path with explicit feature-number qualifiers; planted features-maps live in scenario-isolated subdirectories. (See SD-003.)
- The audit checklist's exact wording may evolve over time; the scenario's `required_patterns` target the most stable checklist invariant (the missing `## Dependency Order` flaw) but may still drift. (See SD-002.)
- `evals/baselines/<scenario>.json` is intentionally absent for the six new scenarios this round; `loadBaseline` returns `null` and the orchestrator skips baseline checks per AS 10.3 of the original evals spec.
- The runner's `DEFAULT_TIMEOUT_MS` of 120s is too short for ignite/mark/render. Each affected scenario carries an explicit `timeout:` field; calibration is empirical (see SD-006).

## Dependency Order

Recommended implementation sequence (priority, then independence):

| ID | Title | Depends On | Artifact |
|----|-------|------------|----------|
| US1 | Audit eval validates the audit command catches a planted flaw | — | — |
| US2 | Mark eval validates the mark command produces a complete spec artifact set | — | — |
| US3 | Cut eval validates the cut command produces tasks with inherited spec debt | — | — |
| US4 | Render eval validates the render command produces a feature map from an RFC | — | — |
| US5 | Ignite eval validates the ignite command produces an RFC from a PRD | — | — |
| US6 | Spark eval validates the spark command produces a PRD from an idea, tolerating empty-state survey output | — | — |

All six stories are independently shippable. The fixture-organization rules (scenario-isolated subdirectories under `evals/fixture/{prds,rfcs,specs}/`) are foundation-level guidance applied uniformly across stories rather than a separate dependency.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Each new scenario MUST live as a YAML file under `evals/cases/` and conform to the existing `EvalScenario` shape (`evals/lib/types.ts`).
- **FR-002**: Each new scenario MUST be auto-discovered by the existing `loadScenarios(casesDir)` call in `evals/run-evals.ts`; the orchestrator MUST require no code changes to incorporate the new scenarios.
- **FR-003**: Each new scenario MUST execute via the existing `claude` CLI runner (`evals/lib/runner.ts`); no new runner module, no new CLI flag, and no orchestrator-level branching is added by this feature.
- **FR-004**: Planted parent artifacts (PRDs, RFCs, features-maps, specs) MUST live in scenario-isolated subdirectories under `evals/fixture/{prds,rfcs,specs}/<scenario-slug>/`. Each plant is owned by exactly one scenario.
- **FR-005**: Each scenario that consumes a planted artifact MUST reference the plant by **exact path** in its `prompt` field (e.g., `evals/fixture/rfcs/mark-eval/01-core.features.md 1`); no command-side auto-selection is permitted.
- **FR-006**: The audit scenario MUST run in File Argument Mode (`/smithy.audit <exact-path>`) against a planted `.spec.md` whose flaw is the absence of a `## Dependency Order` table.
- **FR-007**: The audit scenario's `required_patterns` MUST assert the audit output contains the literal string `Dependency Order` AND at least one `Critical` severity label.
- **FR-008**: The spark scenario's `required_patterns` MUST accept either a populated `### Alternatives Considered` table-header line OR the literal empty-state stub string emitted by smithy-survey.
- **FR-009**: Each scenario's `sub_agent_evidence` patterns MUST target template-driven output markers that match against either the canonical text or the dispatched-agent record (description / resultText). Agent-name-only matching is insufficient (per FR-016 of the original evals spec).
- **FR-010**: Scenarios with multi-phase sub-agent fan-out (mark, cut, render, ignite) MUST set explicit per-scenario `timeout:` values calibrated to the empirical run-time of the producing command.
- **FR-011**: Each scenario's `forbidden_patterns` MUST include at minimum the strike-convention set: `"I'd be happy to help"`, `"Sure, here's"`, and `'^---\r?\n'` (leading YAML frontmatter).
- **FR-012**: The existing `strike-health-check` and `scout-fixture-shallow` scenarios MUST continue to pass unchanged after the new scenarios and fixture plants are added.
- **FR-013**: Scenarios MUST NOT modify the source fixture directory; the source-fixture checksum invariant established by the original evals spec MUST continue to hold for every new scenario.
- **FR-014**: Each new scenario's structural expectations MUST be derivable by inspection from a stable artifact in `src/templates/agent-skills/commands/smithy.<command>.prompt` (the template's literal output code-fence, RFC template, spec template, or one-shot snippet).
- **FR-015**: The full `npm run eval` invocation MUST complete within the developer's reasonable on-demand patience (target: ≤90 minutes for all 8 scenarios on a typical workstation; observed ~30-60 min). The `--case <name>` filter MUST run only the named scenario.

### Key Entities

- **EvalScenario** *(existing — extended in instances only, not in shape)*: A single eval case loaded from YAML. New scenarios add instances; no fields added to the shape.
- **PlantedArtifact** *(new role for an existing entity type)*: A pre-built smithy artifact (PRD, RFC, features-map, spec, flawed-spec) committed under `evals/fixture/{prds,rfcs,specs}/<scenario-slug>/`. Each plant is owned by exactly one scenario; plants are read by scenarios via exact path.
- **ScenarioFixtureSubdirectory** *(new naming convention)*: A scenario-isolated subfolder under `evals/fixture/{prds,rfcs,specs}/`. Naming follows `<scenario-slug>/` where the slug matches the consuming scenario's name (e.g., `mark-eval/`, `cut-eval/`, `audit-eval/`).
- **Sub-Agent Evidence Matrix** *(new authoring reference)*: Per-command list of expected sub-agent dispatches and their template-stable evidence patterns. See `### Sub-Agent Evidence Matrix` below.

### Sub-Agent Evidence Matrix

Per-command expected dispatches and their evidence-pattern source-of-truth. Each scenario's `sub_agent_evidence` MUST cover the entries listed for its command:

| Command | Sub-Agents (expected dispatches) | Evidence-pattern source |
|---------|----------------------------------|--------------------------|
| spark   | smithy-survey, smithy-clarify, smithy-prose, smithy-plan-review | template-stable Markers in each agent's output (e.g., `## Plan\n\n\*\*Directive\*\*` for plan; `^[Cc]larif` for clarify dispatch description) |
| ignite  | smithy-prose, smithy-plan, smithy-clarify, smithy-plan-review | same conventions as spark |
| render  | smithy-scout, smithy-clarify, smithy-plan-review | same |
| mark    | smithy-scout, smithy-plan, smithy-clarify, smithy-refine, smithy-plan-review | same |
| cut     | smithy-scout, smithy-clarify, smithy-plan-review | same |
| audit   | (none — audit dispatches no sub-agents) | `sub_agent_evidence` field omitted from YAML |

Implementers refresh patterns when a sub-agent template's stable marker changes; the strike scenario's pattern set in `evals/cases/strike-health-check.yaml` is the canonical reference for marker selection.

## Assumptions

- The runner (`evals/lib/runner.ts`) copies the source fixture to a temp directory before each scenario, so writes performed by mark/cut/render/ignite (new files; `git checkout -b`; `gh pr create`) happen in the temp copy and the source-fixture checksum invariant is preserved.
- The `claude` CLI's `--output-format stream-json --verbose -p` invocation continues to work for slash-command invocations like `/smithy.mark <path> <feature-number>` and `/smithy.audit <path>`.
- Smithy-survey returns a stable empty-state stub string when WebFetch/WebSearch cannot find alternatives; the exact stub string is pinned cross-template by FR-008's regex alternation.
- Each smithy planning command's `## One-Shot Output` snippet remains the canonical terminal-output contract (commands stamp `## Summary`, `## Assumptions`, `## Specification Debt`, `## PR` headings deterministically).
- Implementers have sufficient access to a Smithy-aware Claude CLI session to capture per-command run-times and calibrate `timeout:` values.

## Specification Debt

| ID | Description | Source Category | Impact | Confidence | Status | Resolution |
|----|-------------|-----------------|--------|------------|--------|------------|
| SD-001 | Mark/cut/render/ignite scenarios all run `git checkout -b` inside the temp fixture copy. The runner's current `fs.cpSync` may not preserve a `.git` directory if the source fixture is not a standalone git repo. Need to confirm the temp copy is git-initialized (or has the source fixture as a git repo) — otherwise the scenarios fail at the branch-creation step before any output is captured. | Edge Cases | Critical | Medium | open | — |
| SD-002 | The audit scenario's planted flaw (a `.spec.md` missing its `## Dependency Order` table) is tied to one specific checklist invariant in `{{>audit-checklist-spec}}`. If the audit checklist's wording around dependency order changes (e.g., "Dependency Order" → "Implementation Order"), the `required_patterns` literal `Dependency Order` will silently fail. Implementers add an audit-checklist comment cross-referencing the eval scenario, and update both together. | Functional Scope | Critical | Medium | open | — |
| SD-003 | Cross-talk between mark and cut/render plants. Mark's `.features.md` parser auto-selects "the first `### Feature N` not yet specc'd" when no feature number is given; even with exact-path prompts, a planted features-map referencing another scenario's plant could trip the routing logic. Mitigation: scenario-isolated subdirectories (`evals/fixture/rfcs/mark-eval/`, `.../cut-eval/`, `.../render-eval/`) and planted features-maps reference only their own children. Implementers verify the directory layout before each scenario lands. | Edge Cases | Critical | Medium | open | — |
| SD-004 | Per-command structural-expectations rigor: for ignite the on-disk RFC contains many mandatory headings (`## Summary` through `## Milestones`), but the **scenario** validates against the **terminal one-shot snippet** (`## Summary` / `## Assumptions` / `## Specification Debt` / `## PR`) — not the on-disk artifact. Implementers confirm at scenario-authoring time whether scenarios assert against the terminal snippet (the simpler, runner-supported path) or read the on-disk RFC (would require runner changes that this feature explicitly does not introduce). | Functional Scope | High | Medium | open | — |
| SD-005 | Spark's empty-state stub string is currently documented in `smithy.spark.prompt` Phase 2.5 as `No comparable off-the-shelf options identified during survey.`. If smithy-survey's prompt template changes the wording, the eval's regex alternation silently fails. Mitigation: pin the stub string in both the survey template and the eval scenario, with cross-reference comments. | Functional Scope | High | Medium | open | — |
| SD-006 | Per-scenario `timeout:` calibration. Strike's full pipeline takes ~3-7 min today; ignite (with 3 plan lenses, reconcile, clarify, prose, plan-review) is likely 5-10 min; mark and render with full clarify+plan+refine+plan-review fan-out are similar. The `DEFAULT_TIMEOUT_MS` of 120s is almost certainly too short for ignite/mark/render. Implementers calibrate timeouts empirically during scenario authoring; calibration values land in the YAML scenario's `timeout:` field. | Non-Functional Quality | High | Medium | open | — |
| SD-007 | Whether the runner's temp-copy includes a `.git` directory or initializes one. `runScenario` in `evals/lib/runner.ts` does `fs.cpSync(fixtureDir, tmpDir, { recursive: true })` — if `evals/fixture/` is not under a separate `.git`, mark/cut/render/ignite scenarios calling `git checkout -b` will fail. The orchestrator may need to `git init` the temp copy before deploying skills. (Closely related to SD-001.) | Integration | High | Medium | open | — |
| SD-008 | Whether scenarios that create a PR (`gh pr create` in mark/cut/render/ignite) need to be neutralized in the eval environment. Without `gh` auth in CI/local eval context, the one-shot snippet's PR-creation-failure branch will trigger, which still produces output but emits a different terminal contract. Implementers either (a) assert against the failure branch in `required_patterns`, (b) provide stub `gh` credentials, or (c) accept either branch via regex alternation. | Integration | High | Medium | open | — |
| SD-009 | Per-mode variants for each command (mark with-RFC vs. with-features-map; ignite with-PRD vs. without; render with-RFC vs. with-features.md; cut with explicit story vs. auto-select; audit forge-branch mode) are deferred to follow-up features. This feature ships exactly one canonical scenario per command. | Functional Scope | Medium | High | open | — |
| SD-010 | Render scenario's structural expectations validate against the terminal one-shot snippet, not the on-disk `.features.md` written by render. The runner only validates `extracted_text` from stream-json, so on-disk validation would require a runner-level enhancement out of scope here. (Same constraint as SD-004; tracked separately because render has the most prominent on-disk-vs-terminal divergence.) | Domain & Data Model | Medium | Medium | open | — |
| SD-011 | The audit scenario uses `skill: /smithy.audit` and `prompt: <exact-path>`; the runner's `runScenario` composes this as `/smithy.audit <path>`. Implementers verify this composition works for the slash-command-with-path form during scenario authoring; if the runner mishandles the path argument, additional escaping or quoting may be needed. | Interaction & UX | Medium | High | open | — |
| SD-012 | Baseline files for the six new scenarios (`evals/baselines/<scenario>.json`) are intentionally not authored in this round; baselines for new scenarios are added only after at least two clean runs prove structural stability. The convention-based loader returns `null` on missing files, so this is a no-op for the orchestrator. Follow-up feature(s) snapshot baselines once scenarios are stable. | Functional Scope | Medium | Medium | open | — |

## Out of Scope

- **GHA on-demand evals workflow** (`.github/workflows/evals.yml`): deferred to a follow-up feature pending a Batch-API spike that resolves the upstream wire-shape and sub-agent-dispatch fidelity unknowns.
- **Anthropic Messages Batches API runner** (`BatchApiRunner`, `--runner batch` flag): deferred. Same reason.
- **Deprecation of `tests/Agent.tests.md`** and the `agent_tests_passed` → `evals_passed` rename in `.github/workflows/publish.yml`: deferred. Depends on the GHA workflow being operational.
- **Forge / fix / orders evals**: out of scope for this round; these commands rely more heavily on side effects and external systems and are deliberately excluded.
- **Per-mode variants** for any command (e.g., mark with-RFC vs. with-features-map; ignite with-PRD vs. without; render with-RFC vs. with-features.md). Single canonical scenario per command this round; alternates captured as SD-009.
- **Migration of `scoutScenario` from TypeScript to YAML**: not in scope. Continues to live in `evals/lib/scout-scenario.ts`; loader's empty-`skill` rejection rule remains unchanged.
- **Multi-fixture support** (per-scenario fixture directories): not in scope. Single shared fixture grows additively under scenario-isolated subdirectories.
- **Scheduled cron evals**: not in scope.
- **Baseline auto-refresh tooling**: not in scope. Baselines remain manual; new-scenario baselines deferred per SD-012.
- **Cost dashboards / token-budget surfaces**: not in scope.
- **Updates to `tests/Agent.tests.md`** (banner, deletion, A-test reorganization): out of scope this round; lands with the deferred GHA/deprecation feature.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Six new YAML scenario files exist under `evals/cases/` (`audit-flawed-spec.yaml`, `mark-from-features.yaml`, `cut-from-spec.yaml`, `render-from-rfc.yaml`, `ignite-from-prd.yaml`, `spark-from-idea.yaml`); `npm run eval` reports a passing run for all six.
- **SC-002**: `npm run eval -- --case <new-scenario-name>` filters to and runs only that scenario for each of the six new names.
- **SC-003**: Adding the new scenarios and fixture plants does not change the strike or scout scenario behavior; their Pass/Fail status is identical before and after this feature lands.
- **SC-004**: Reverting the audit scenario's planted flaw (restoring the missing `## Dependency Order` table to the planted spec) causes `npm run eval -- --case audit-flawed-spec` to report FAIL on the next run — proving the eval is gated on audit's detection capability, not on audit running at all.
- **SC-005**: The full `npm run eval` invocation (8 scenarios — strike + scout + 6 new) completes within 90 minutes on a typical workstation.
- **SC-006**: `npm run test:evals` (offline unit tests) continues to pass after the new YAML files and fixture plants land — no test regressions in `evals/lib/*.test.ts`.
